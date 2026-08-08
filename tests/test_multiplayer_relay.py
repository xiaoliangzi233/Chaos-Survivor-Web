import asyncio
import json
import unittest

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from scripts.multiplayer_relay_server import MultiplayerRelay, RelayRooms


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

    def test_guest_can_resume_after_disconnect(self):
        asyncio.run(self._guest_can_resume_after_disconnect())

    async def _guest_can_resume_after_disconnect(self):
        relay = MultiplayerRelay(rooms=RelayRooms(reconnect_seconds=5))
        async with serve(relay.handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}/ws") as host:
                await host.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "create"}))
                room_id = json.loads(await host.recv())["roomId"]
                guest = await connect(f"ws://127.0.0.1:{port}/ws")
                try:
                    await guest.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "join", "roomId": room_id}))
                    self.assertEqual(json.loads(await guest.recv())["type"], "roomJoined")
                    self.assertEqual(json.loads(await host.recv())["type"], "peerJoined")
                finally:
                    await guest.close()
                self.assertEqual(json.loads(await host.recv())["type"], "peerLeft")

                async with connect(f"ws://127.0.0.1:{port}/ws") as resumed:
                    await resumed.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "resume", "roomId": room_id}))
                    self.assertEqual(json.loads(await resumed.recv())["type"], "roomJoined")
                    self.assertEqual(json.loads(await host.recv())["type"], "peerResumed")

    def test_host_disconnect_closes_room_for_guest(self):
        asyncio.run(self._host_disconnect_closes_room_for_guest())

    async def _host_disconnect_closes_room_for_guest(self):
        relay = MultiplayerRelay()
        async with serve(relay.handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            host = await connect(f"ws://127.0.0.1:{port}/ws")
            try:
                await host.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "create"}))
                room_id = json.loads(await host.recv())["roomId"]
                async with connect(f"ws://127.0.0.1:{port}/ws") as guest:
                    await guest.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "join", "roomId": room_id}))
                    self.assertEqual(json.loads(await guest.recv())["type"], "roomJoined")
                    self.assertEqual(json.loads(await host.recv())["type"], "peerJoined")
                    await host.close()
                    closed = json.loads(await guest.recv())
                    self.assertEqual(closed["type"], "roomClosed")
                    self.assertEqual(closed["reason"], "host-left")
            finally:
                await host.close()

    def test_rejects_bad_protocol_and_invalid_direction(self):
        asyncio.run(self._rejects_bad_protocol_and_invalid_direction())

    async def _rejects_bad_protocol_and_invalid_direction(self):
        relay = MultiplayerRelay()
        async with serve(relay.handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}/ws") as bad:
                await bad.send(json.dumps({"type": "control", "protocol": "wrong", "action": "create"}))
                self.assertEqual(json.loads(await bad.recv())["code"], "protocol_mismatch")

            async with connect(f"ws://127.0.0.1:{port}/ws") as host:
                await host.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "create"}))
                room_id = json.loads(await host.recv())["roomId"]
                async with connect(f"ws://127.0.0.1:{port}/ws") as guest:
                    await guest.send(json.dumps({"type": "control", "protocol": "survivor-relay-v1", "action": "join", "roomId": room_id}))
                    self.assertEqual(json.loads(await guest.recv())["type"], "roomJoined")
                    self.assertEqual(json.loads(await host.recv())["type"], "peerJoined")
                    await guest.send(json.dumps({"type": "snapshot", "payload": {"wave": 99}}))
                    with self.assertRaises(asyncio.TimeoutError):
                        await asyncio.wait_for(host.recv(), timeout=0.15)


if __name__ == "__main__":
    unittest.main()
