from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import argparse
import json
import secrets
import threading
import time


ROOM_TTL_SECONDS = 15 * 60
ANSWER_RETENTION_SECONDS = 90
MAX_SIGNAL_BYTES = 128 * 1024
PROTOCOL_VERSION = "survivor-p2p-v1"


class SignalRoomStore:
    """Ephemeral WebRTC offer/answer exchange; no room data reaches disk."""

    def __init__(self, clock=None, room_id_factory=None):
        self._clock = clock or time.monotonic
        self._room_id_factory = room_id_factory or self._new_room_id
        self._rooms = {}
        self._lock = threading.Lock()

    def create(self, offer):
        with self._lock:
            self._cleanup_locked()
            for _ in range(32):
                room_id = self._room_id_factory()
                if room_id not in self._rooms:
                    now = self._clock()
                    self._rooms[room_id] = {
                        "offer": offer,
                        "answer": None,
                        "expires_at": now + ROOM_TTL_SECONDS,
                        "answer_expires_at": None,
                    }
                    return room_id
        raise RuntimeError("Could not allocate a room id")

    def offer_for_guest(self, room_id):
        with self._lock:
            room = self._active_room_locked(room_id)
            return None if room is None else room["offer"]

    def submit_answer(self, room_id, answer):
        with self._lock:
            room = self._active_room_locked(room_id)
            if room is None:
                return False
            if room["answer"] is not None:
                return None
            room["answer"] = answer
            room["answer_expires_at"] = self._clock() + ANSWER_RETENTION_SECONDS
            return True

    def answer_for_host(self, room_id):
        with self._lock:
            room = self._active_room_locked(room_id)
            return None if room is None else room["answer"]

    def remove(self, room_id):
        with self._lock:
            return self._rooms.pop(room_id, None) is not None

    def _active_room_locked(self, room_id):
        self._cleanup_locked()
        return self._rooms.get(room_id)

    def _cleanup_locked(self):
        now = self._clock()
        expired = [
            room_id for room_id, room in self._rooms.items()
            if now >= room["expires_at"]
            or (room["answer_expires_at"] is not None and now >= room["answer_expires_at"])
        ]
        for room_id in expired:
            self._rooms.pop(room_id, None)

    @staticmethod
    def _new_room_id():
        return f"{secrets.randbelow(1_000_000):06d}"


class NoCacheRequestHandler(SimpleHTTPRequestHandler):
    server_version = "SurvivorLan/1.0"

    def do_GET(self):
        if self._handle_signal_request():
            return
        self.disable_conditional_cache()
        super().do_GET()

    def do_HEAD(self):
        self.disable_conditional_cache()
        super().do_HEAD()

    def do_POST(self):
        if not self._handle_signal_request():
            self.send_error(404)

    def do_DELETE(self):
        if not self._handle_signal_request():
            self.send_error(404)

    def log_message(self, format_string, *args):
        # WebRTC descriptions must never be written to the terminal log.
        if self.path.startswith("/api/p2p/"):
            return
        super().log_message(format_string, *args)

    def _handle_signal_request(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/p2p/"):
            return False
        if parsed.path == "/api/p2p/info" and self.command == "GET":
            self._send_json(200, {
                "protocol": PROTOCOL_VERSION,
                "advertiseHost": self.server.advertise_host,
                "port": self.server.server_address[1],
            })
            return True

        if parsed.path == "/api/p2p/rooms" and self.command == "POST":
            payload = self._read_json_body()
            offer = payload.get("offer", "") if payload else ""
            if not self._valid_signal(offer) or payload.get("protocol") != PROTOCOL_VERSION:
                self._send_json(400, {"error": "invalid_offer"})
                return True
            try:
                room_id = self.server.rooms.create(offer)
            except RuntimeError:
                self._send_json(503, {"error": "room_unavailable"})
                return True
            self._send_json(201, {"roomId": room_id, "expiresIn": ROOM_TTL_SECONDS})
            return True

        parts = parsed.path.strip("/").split("/")
        if len(parts) != 4 or parts[:3] != ["api", "p2p", "rooms"] or not self._valid_room_id(parts[3]):
            self._send_json(404, {"error": "not_found"})
            return True
        room_id = parts[3]

        if self.command == "GET":
            role = parse_qs(parsed.query).get("role", [""])[0]
            if role == "guest":
                offer = self.server.rooms.offer_for_guest(room_id)
                if offer is None:
                    self._send_json(404, {"error": "room_not_found"})
                else:
                    self._send_json(200, {"state": "offer_ready", "offer": offer})
                return True
            if role == "host":
                answer = self.server.rooms.answer_for_host(room_id)
                if answer is None:
                    if self.server.rooms.offer_for_guest(room_id) is None:
                        self._send_json(404, {"error": "room_not_found"})
                    else:
                        self._send_json(200, {"state": "waiting"})
                else:
                    self._send_json(200, {"state": "answer_ready", "answer": answer})
                return True
            self._send_json(400, {"error": "invalid_role"})
            return True

        if self.command == "POST":
            payload = self._read_json_body()
            answer = payload.get("answer", "") if payload else ""
            if not self._valid_signal(answer) or payload.get("protocol") != PROTOCOL_VERSION:
                self._send_json(400, {"error": "invalid_answer"})
                return True
            result = self.server.rooms.submit_answer(room_id, answer)
            if result is False:
                self._send_json(404, {"error": "room_not_found"})
            elif result is None:
                self._send_json(409, {"error": "room_taken"})
            else:
                self._send_json(202, {"state": "answer_received"})
            return True

        if self.command == "DELETE":
            self.server.rooms.remove(room_id)
            self._send_json(204, None)
            return True

        self._send_json(405, {"error": "method_not_allowed"})
        return True

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_SIGNAL_BYTES:
            return None
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    @staticmethod
    def _valid_room_id(room_id):
        return len(room_id) == 6 and room_id.isdigit()

    @staticmethod
    def _valid_signal(value):
        return isinstance(value, str) and 0 < len(value.encode("utf-8")) <= MAX_SIGNAL_BYTES

    def _send_json(self, status, payload):
        self.send_response(status)
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
        else:
            body = b""
            self.send_header("Content-Length", "0")
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def disable_conditional_cache(self):
        if "If-Modified-Since" in self.headers:
            self.headers.replace_header("If-Modified-Since", "Thu, 01 Jan 1970 00:00:00 GMT")
        if "If-None-Match" in self.headers:
            self.headers.replace_header("If-None-Match", "")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def create_server(bind, port, advertise_host="", room_store=None):
    server = ThreadingHTTPServer((bind, port), NoCacheRequestHandler)
    server.rooms = room_store or SignalRoomStore()
    server.advertise_host = advertise_host
    return server


def main():
    parser = argparse.ArgumentParser(description="Serve Survivor with cache disabled and optional LAN P2P signaling.")
    parser.add_argument("port", type=int, nargs="?", default=5000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--advertise-host", default="")
    args = parser.parse_args()

    server = create_server(args.bind, args.port, args.advertise_host)
    print(f"Serving HTTP on {args.bind} port {args.port} (no-cache) ...")
    if args.advertise_host:
        print(f"LAN invite base: http://{args.advertise_host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
