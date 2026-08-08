"""Two-player WebSocket room relay for Survivor host-authoritative multiplayer."""

import argparse
import asyncio
import json
import random
import time

from websockets.asyncio.server import serve


PROTOCOL = "survivor-relay-v1"
ROOM_TTL_SECONDS = 15 * 60
MAX_MESSAGE_BYTES = 2 * 1024 * 1024
HOST_MESSAGES = {"hello", "snapshot", "startRun", "ping", "pong", "disconnect"}
GUEST_MESSAGES = {"hello", "input", "shopAction", "lobbyAction", "ping", "pong", "disconnect"}


class RelayRooms:
    def __init__(self, ttl=ROOM_TTL_SECONDS, rng=None):
        self.ttl = ttl
        self.rng = rng or random.SystemRandom()
        self.rooms = {}

    def create(self, host):
        self.cleanup()
        for _ in range(100):
            room_id = f"{self.rng.randrange(1_000_000):06d}"
            if room_id not in self.rooms:
                self.rooms[room_id] = {"host": host, "guest": None, "created": time.monotonic()}
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

    def detach(self, websocket):
        result = None
        for room_id, room in list(self.rooms.items()):
            if room["host"] is websocket:
                self.rooms.pop(room_id, None)
                result = (room_id, "host", room.get("guest"))
                break
            if room.get("guest") is websocket:
                room["guest"] = None
                result = (room_id, "guest", room.get("host"))
                break
        return result


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
                return await send_json(websocket, {"type": "relayError", "message": "协议版本不匹配。"})
            action = message.get("action")
            if action == "create":
                role = "host"
                room_id = self.rooms.create(websocket)
                await send_json(websocket, {"type": "roomCreated", "roomId": room_id, "expiresIn": self.rooms.ttl})
            elif action == "join":
                room_id = str(message.get("roomId") or "")
                room = self.rooms.get(room_id)
                if not room:
                    return await send_json(websocket, {"type": "relayError", "message": "房间不存在或已过期。"})
                if room.get("guest") is not None:
                    return await send_json(websocket, {"type": "relayError", "message": "房间已有 P2 玩家。"})
                role = "guest"
                room["guest"] = websocket
                await send_json(websocket, {"type": "roomJoined", "roomId": room_id})
                await safe_send(room["host"], {"type": "peerJoined"})
            else:
                return await send_json(websocket, {"type": "relayError", "message": "无效的房间操作。"})

            async for raw in websocket:
                if len(raw.encode("utf-8") if isinstance(raw, str) else raw) > MAX_MESSAGE_BYTES:
                    await send_json(websocket, {"type": "relayError", "message": "消息超过大小限制。"})
                    continue
                payload = parse_message(raw)
                allowed = HOST_MESSAGES if role == "host" else GUEST_MESSAGES
                if payload.get("type") not in allowed:
                    continue
                room = self.rooms.get(room_id)
                if not room:
                    break
                target = room.get("guest" if role == "host" else "host")
                if target is not None:
                    await safe_send(target, payload)
        except (asyncio.TimeoutError, ValueError, json.JSONDecodeError):
            await safe_send(websocket, {"type": "relayError", "message": "无效的联机消息。"})
        finally:
            detached = self.rooms.detach(websocket)
            if detached and detached[2] is not None:
                await safe_send(detached[2], {"type": "peerLeft", "roomId": detached[0]})


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
