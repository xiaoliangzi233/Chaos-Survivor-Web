import importlib.util
import json
from pathlib import Path
import threading
import unittest
from urllib.request import Request, urlopen


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "p2p_signal_server.py"
SPEC = importlib.util.spec_from_file_location("p2p_signal_server", SCRIPT)
SERVER_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER_MODULE)


class P2PSignalBackendTest(unittest.TestCase):
    def setUp(self):
        self.server = SERVER_MODULE.create_signal_server(
            "127.0.0.1", 0, "26.7.8.9", ["https://owner.github.io"]
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_cors_and_room_exchange(self):
        payload = json.dumps({"protocol": "survivor-p2p-v1", "offer": "host-offer"}).encode("utf-8")
        request = Request(self.base_url + "/api/p2p/rooms", data=payload, method="POST")
        request.add_header("Content-Type", "application/json")
        request.add_header("Origin", "https://owner.github.io")
        with urlopen(request, timeout=2) as response:
            created = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://owner.github.io")
        self.assertRegex(created["roomId"], r"^\d{6}$")

        with urlopen(self.base_url + f"/api/p2p/rooms/{created['roomId']}?role=guest", timeout=2) as response:
            guest = json.loads(response.read().decode("utf-8"))
        self.assertEqual(guest["offer"], "host-offer")


if __name__ == "__main__":
    unittest.main()
