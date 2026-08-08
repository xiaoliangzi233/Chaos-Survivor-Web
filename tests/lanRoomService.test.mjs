import test from "node:test";
import assert from "node:assert/strict";

import {
  LanRoomError,
  createInviteUrl,
  createLanRoom,
  fetchLanAnswer,
  isRemoteSignalConfigured,
  normalizeRoomId,
  roomIdFromSearch,
  signalServerUrlFromSearch,
} from "../src/net/lanRoomService.js";
import { multiplayerConfig } from "../src/config/multiplayer-config.js";

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test("LAN room service creates a room with the P2P protocol", async () => {
  let request = null;
  const room = await createLanRoom("offer-data", {
    fetchImpl: async (path, options) => {
      request = { path, options };
      return response(201, { roomId: "123456", expiresIn: 900 });
    },
  });
  assert.equal(room.roomId, "123456");
  assert.equal(request.path, "/api/p2p/rooms");
  assert.equal(JSON.parse(request.options.body).protocol, "survivor-p2p-v1");
});

test("LAN room service reports waiting answers and maps expired rooms", async () => {
  const waiting = await fetchLanAnswer("123456", {
    fetchImpl: async () => response(200, { state: "waiting" }),
  });
  assert.equal(waiting.state, "waiting");
  await assert.rejects(
    () => fetchLanAnswer("123456", { fetchImpl: async () => response(404, { error: "room_not_found" }) }),
    (error) => error instanceof LanRoomError && error.code === "room_not_found",
  );
});

test("invite links retain the room code and reject malformed ids", () => {
  const invite = createInviteUrl("654321", "http://26.1.2.3:5000/?renderer=canvas");
  assert.equal(invite, "http://26.1.2.3:5000/?renderer=canvas&join=654321");
  assert.equal(roomIdFromSearch("?join=654321"), "654321");
  assert.equal(roomIdFromSearch("?join=abc"), "");
  assert.throws(() => normalizeRoomId("99"), LanRoomError);
});

test("configured online signal endpoint is used without changing the game invite URL", async () => {
  const previousUrl = multiplayerConfig.signalServerUrl;
  multiplayerConfig.signalServerUrl = "https://survivor-signal.example.workers.dev/";
  try {
    let requestPath = "";
    await createLanRoom("offer-data", {
      fetchImpl: async (path) => {
        requestPath = path;
        return response(201, { roomId: "123456", expiresIn: 900 });
      },
    });
    assert.equal(isRemoteSignalConfigured(), true);
    assert.equal(requestPath, "https://survivor-signal.example.workers.dev/api/p2p/rooms");
    assert.equal(createInviteUrl("123456", "https://game.example.com/?v=1"), "https://game.example.com/?v=1&join=123456");
  } finally {
    multiplayerConfig.signalServerUrl = previousUrl;
  }
});

test("a local signaling URL can be supplied per invitation page", () => {
  assert.equal(
    signalServerUrlFromSearch("?signal=http%3A%2F%2F26.1.2.3%3A5001"),
    "http://26.1.2.3:5001",
  );
  assert.equal(signalServerUrlFromSearch("?signal=ftp%3A%2F%2Fexample.com"), "");
});
