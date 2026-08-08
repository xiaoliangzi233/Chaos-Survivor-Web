import test from "node:test";
import assert from "node:assert/strict";

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", {});
    });
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(raw) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    if (message.type === "control" && message.action === "create") {
      queueMicrotask(() => this.message({ type: "roomCreated", roomId: "123456", expiresIn: 900 }));
    }
  }

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  message(message) {
    this.emit("message", { data: JSON.stringify(message) });
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

globalThis.window = {
  location: {
    search: "?transport=relay&relay=ws%3A%2F%2F127.0.0.1%3A5001%2Fws",
    href: "http://127.0.0.1:5000/?transport=relay&relay=ws%3A%2F%2F127.0.0.1%3A5001%2Fws",
  },
  setTimeout,
  clearTimeout,
};
globalThis.WebSocket = FakeWebSocket;

const { createRelayHostRoom, disconnectRelay, isRelayConfigured } = await import("../src/net/wsSession.js");
const { netRuntime } = await import("../src/net/netState.js");

test("WebSocket relay creates an invite and becomes connected when P2 joins", async () => {
  assert.equal(isRelayConfigured(), true);
  const room = await createRelayHostRoom();
  assert.equal(room.roomId, "123456");
  assert.match(room.inviteUrl, /join=123456/);
  assert.match(room.inviteUrl, /transport=relay/);
  assert.equal(netRuntime.role, "host");
  assert.equal(netRuntime.connected, false);
  FakeWebSocket.instances.at(-1).message({ type: "peerJoined" });
  assert.equal(netRuntime.connected, true);
  disconnectRelay();
});
