import asyncio
import json
import unittest

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from scripts.multiplayer_relay_server import MultiplayerRelay


class MultiplayerRelayTests(unittest.TestCase):
    def test_room_join_and_bidirectional_relay(self):
        asyncio.run(self._room_join_and_bidirectional_relay())

    async def _room_join_and_bidirectional_relay(self):
        relay = MultiplayerRelay()
        async with serve(relay.handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}/ws") as host:
                await host.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "create"}))
                created = json.loads(await host.recv())
                self.assertRegex(created["roomId"], r"^\d{6}$")
                async with connect(f"ws://127.0.0.1:{port}/ws") as guest:
                    await guest.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "join", "roomId": created["roomId"]}))
                    self.assertEqual(json.loads(await guest.recv())["type"], "roomJoined")
                    self.assertEqual(json.loads(await host.recv())["type"], "peerJoined")
                    await guest.send(json.dumps({"type": "input", "payload": {"right": True, "seq": 7}}))
                    self.assertEqual(json.loads(await host.recv())["payload"]["seq"], 7)
                    await host.send(json.dumps({"type": "snapshot", "payload": {"wave": 2}}))
                    self.assertEqual(json.loads(await guest.recv())["payload"]["wave"], 2)


if __name__ == "__main__":
    unittest.main()
