"""Standalone ephemeral WebRTC signaling service for a local Survivor host."""

from http.server import ThreadingHTTPServer
from pathlib import Path
import argparse
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent))
from no_cache_server import NoCacheRequestHandler, SignalRoomStore  # noqa: E402


class P2PSignalRequestHandler(NoCacheRequestHandler):
    server_version = "SurvivorP2PSignal/1.0"

    def do_GET(self):
        if not self._handle_signal_request():
            self._send_json(404, {"error": "not_found"})

    def do_POST(self):
        if not self._handle_signal_request():
            self._send_json(404, {"error": "not_found"})

    def do_DELETE(self):
        if not self._handle_signal_request():
            self._send_json(404, {"error": "not_found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        origin = self.headers.get("Origin", "")
        allowed_origins = self.server.allowed_origins
        if "*" in allowed_origins:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif origin and origin in allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()


def create_signal_server(bind, port, advertise_host="", allowed_origins=None, room_store=None):
    server = ThreadingHTTPServer((bind, port), P2PSignalRequestHandler)
    server.rooms = room_store or SignalRoomStore()
    server.advertise_host = advertise_host
    server.allowed_origins = set(allowed_origins or ["*"])
    return server


def main():
    parser = argparse.ArgumentParser(description="Run a local Survivor P2P signaling backend.")
    parser.add_argument("port", type=int, nargs="?", default=5001)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--advertise-host", required=True)
    parser.add_argument("--allow-origin", action="append", default=[], help="Allowed browser Origin; repeat for more than one.")
    args = parser.parse_args()

    allowed_origins = args.allow_origin or ["*"]
    server = create_signal_server(args.bind, args.port, args.advertise_host, allowed_origins)
    print(f"Survivor P2P signaling backend: http://{args.advertise_host}:{args.port}/api/p2p/")
    print("Rooms stay in memory only. WebRTC battle data never passes through this service.")
    if allowed_origins == ["*"]:
        print("Warning: all browser origins are allowed. Use --allow-origin for a narrower policy.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down P2P signaling backend.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
