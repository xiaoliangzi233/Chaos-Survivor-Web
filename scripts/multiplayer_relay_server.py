"""Two-player WebSocket room relay for Survivor host-authoritative multiplayer."""

import argparse
import asyncio
import json
import random
import time

from websockets.asyncio.server import serve


PROTOCOL = "survivor-relay-v1"
ROOM_TTL_SECONDS = 15 * 60
GUEST_RECONNECT_SECONDS = 12
MAX_MESSAGE_BYTES = 2 * 1024 * 1024
MAX_MESSAGES_PER_SECOND = 90
HOST_MESSAGES = {"hello", "snapshot", "startRun", "stateSync", "readyState", "ping", "pong", "disconnect", "roomClosed"}
GUEST_MESSAGES = {"hello", "input", "shopAction", "lobbyAction", "readyState", "resume", "ping", "pong", "disconnect"}


class RelayRooms:
    def __init__(self, ttl=ROOM_TTL_SECONDS, rng=None, reconnect_seconds=GUEST_RECONNECT_SECONDS):
        self.ttl = ttl
        self.reconnect_seconds = reconnect_seconds
        self.rng = rng or random.SystemRandom()
        self.rooms = {}

    def create(self, host):
        self.cleanup()
        for _ in range(100):
            room_id = f"{self.rng.randrange(1_000_000):06d}"
            if room_id not in self.rooms:
                self.rooms[room_id] = {
                    "host": host,
                    "guest": None,
                    "created": time.monotonic(),
                    "guest_left_at": 0,
                }
                return room_id
        raise RuntimeError("room_code_exhausted")

    def get(self, room_id):
        self.cleanup()
        return self.rooms.get(room_id)

    def cleanup(self):
        now = time.monotonic()
        expired = [room_id for room_id, room in self.rooms.items() if now - room["created"] > self.ttl]
        for room_id in expired:
            self.rooms.pop(room_id, None)

    def attach_guest(self, room_id, guest, resume=False):
        room = self.get(room_id)
        if not room:
            return "room_missing", None
        if room.get("guest") is not None:
            return "room_full", None
        if resume and room.get("guest_left_at") and time.monotonic() - room["guest_left_at"] > self.reconnect_seconds:
            return "resume_expired", None
        room["guest"] = guest
        room["guest_left_at"] = 0
        return "", room

    def detach(self, websocket):
        for room_id, room in list(self.rooms.items()):
            if room["host"] is websocket:
                self.rooms.pop(room_id, None)
                return room_id, "host", room.get("guest")
            if room.get("guest") is websocket:
                room["guest"] = None
                room["guest_left_at"] = time.monotonic()
                return room_id, "guest", room.get("host")
        return None


class MultiplayerRelay:
    def __init__(self, rooms=None):
        self.rooms = rooms or RelayRooms()

    async def handler(self, websocket):
        room_id = ""
        role = ""
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=8)
            message = parse_message(raw)
            if message.get("type") != "control" or message.get("protocol") != PROTOCOL:
                return await send_json(websocket, error_payload("protocol_mismatch", "协议版本不匹配。"))

            action = message.get("action")
            if action == "create":
                role = "host"
                room_id = self.rooms.create(websocket)
                await send_json(websocket, {"type": "roomCreated", "roomId": room_id, "expiresIn": self.rooms.ttl})
            elif action in {"join", "resume"}:
                room_id = str(message.get("roomId") or "")
                code, room = self.rooms.attach_guest(room_id, websocket, resume=action == "resume")
                if code:
                    return await send_json(websocket, error_payload(code, error_message(code)))
                role = "guest"
                await send_json(websocket, {"type": "roomJoined", "roomId": room_id})
                await safe_send(room["host"], {"type": "peerResumed" if action == "resume" else "peerJoined", "roomId": room_id})
            else:
                return await send_json(websocket, error_payload("bad_control", "无效的房间操作。"))

            rate_window = time.monotonic()
            rate_count = 0
            async for raw in websocket:
                if len(raw.encode("utf-8") if isinstance(raw, str) else raw) > MAX_MESSAGE_BYTES:
                    await send_json(websocket, error_payload("message_too_large", "消息超过大小限制。"))
                    continue
                now = time.monotonic()
                if now - rate_window >= 1:
                    rate_window = now
                    rate_count = 0
                rate_count += 1
                if rate_count > MAX_MESSAGES_PER_SECOND:
                    await send_json(websocket, error_payload("rate_limited", "消息发送过快。"))
                    continue

                payload = parse_message(raw)
                allowed = HOST_MESSAGES if role == "host" else GUEST_MESSAGES
                if payload.get("type") not in allowed:
                    continue
                room = self.rooms.get(room_id)
                if not room:
                    await send_json(websocket, {"type": "roomClosed", "roomId": room_id, "reason": "expired"})
                    break
                target = room.get("guest" if role == "host" else "host")
                if target is not None:
                    await safe_send(target, payload)
        except (asyncio.TimeoutError, ValueError, json.JSONDecodeError):
            await safe_send(websocket, error_payload("bad_message", "无效的联机消息。"))
        finally:
            detached = self.rooms.detach(websocket)
            if detached and detached[2] is not None:
                room_id, role, target = detached
                if role == "host":
                    await safe_send(target, {"type": "roomClosed", "roomId": room_id, "reason": "host-left"})
                else:
                    await safe_send(target, {"type": "peerLeft", "roomId": room_id, "reconnectSeconds": self.rooms.reconnect_seconds})


def parse_message(raw):
    if not isinstance(raw, str):
        raw = raw.decode("utf-8")
    message = json.loads(raw)
    if not isinstance(message, dict):
        raise ValueError("message_must_be_object")
    return message


async def send_json(websocket, payload):
    await websocket.send(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


async def safe_send(websocket, payload):
    try:
        await send_json(websocket, payload)
    except Exception:
        pass


def error_payload(code, message):
    return {"type": "relayError", "code": code, "message": message}


def error_message(code):
    return {
        "room_missing": "房间不存在或已过期。",
        "room_full": "房间已有 P2 玩家。",
        "resume_expired": "重连窗口已过期。",
    }.get(code, "联机服务器返回错误。")


async def run_server(bind, port):
    relay = MultiplayerRelay()
    async with serve(relay.handler, bind, port, max_size=MAX_MESSAGE_BYTES, ping_interval=20, ping_timeout=20):
        print(f"Survivor multiplayer relay: ws://{bind}:{port}/ws")
        print("Two-player rooms are held in memory and expire after 15 minutes.")
        await asyncio.Future()


def main():
    parser = argparse.ArgumentParser(description="Run the Survivor WebSocket multiplayer relay.")
    parser.add_argument("port", type=int, nargs="?", default=5001)
    parser.add_argument("--bind", default="0.0.0.0")
    args = parser.parse_args()
    try:
        asyncio.run(run_server(args.bind, args.port))
    except KeyboardInterrupt:
        print("\nShutting down multiplayer relay.")


if __name__ == "__main__":
    main()
