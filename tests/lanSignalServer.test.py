import importlib.util
import json
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "no_cache_server.py"
SPEC = importlib.util.spec_from_file_location("no_cache_server", SCRIPT)
SERVER_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER_MODULE)


class LanSignalServerTest(unittest.TestCase):
    def setUp(self):
        self.clock = [0]
        self.store = SERVER_MODULE.SignalRoomStore(clock=lambda: self.clock[0])
        self.server = SERVER_MODULE.create_server("127.0.0.1", 0, "26.7.8.9", self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request_json(self, path, method="GET", payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(self.base_url + path, data=body, method=method)
        if body is not None:
            request.add_header("Content-Type", "application/json")
        with urlopen(request, timeout=2) as response:
            return response.status, json.loads(response.read().decode("utf-8")) if response.length != 0 else {}

    def test_room_offer_answer_and_cleanup(self):
        status, created = self.request_json("/api/p2p/rooms", "POST", {
            "protocol": SERVER_MODULE.PROTOCOL_VERSION,
            "offer": "host-offer",
        })
        self.assertEqual(status, 201)
        room_id = created["roomId"]
        self.assertRegex(room_id, r"^\d{6}$")

        status, guest = self.request_json(f"/api/p2p/rooms/{room_id}?role=guest")
        self.assertEqual(status, 200)
        self.assertEqual(guest["offer"], "host-offer")

        status, waiting = self.request_json(f"/api/p2p/rooms/{room_id}?role=host")
        self.assertEqual(status, 200)
        self.assertEqual(waiting["state"], "waiting")

        status, accepted = self.request_json(f"/api/p2p/rooms/{room_id}", "POST", {
            "protocol": SERVER_MODULE.PROTOCOL_VERSION,
            "answer": "guest-answer",
        })
        self.assertEqual(status, 202)
        self.assertEqual(accepted["state"], "answer_received")

        status, host = self.request_json(f"/api/p2p/rooms/{room_id}?role=host")
        self.assertEqual(status, 200)
        self.assertEqual(host["answer"], "guest-answer")

        self.clock[0] += SERVER_MODULE.ANSWER_RETENTION_SECONDS + 1
        with self.assertRaises(HTTPError) as missing:
            self.request_json(f"/api/p2p/rooms/{room_id}?role=guest")
        self.assertEqual(missing.exception.code, 404)

    def test_invalid_room_and_collision_retry(self):
        with self.assertRaises(HTTPError) as missing:
            self.request_json("/api/p2p/rooms/000000?role=guest")
        self.assertEqual(missing.exception.code, 404)

        ids = iter(["123456", "123456", "654321"])
        store = SERVER_MODULE.SignalRoomStore(room_id_factory=lambda: next(ids))
        self.assertEqual(store.create("first"), "123456")
        self.assertEqual(store.create("second"), "654321")


if __name__ == "__main__":
    unittest.main()
