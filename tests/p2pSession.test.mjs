import test from "node:test";
import assert from "node:assert/strict";

class FakeChannel {
  constructor() {
    this.readyState = "connecting";
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, value = {}) {
    this.listeners.get(type)?.(value);
  }

  send(message) {
    if (this.readyState !== "open") throw new Error("channel is not open");
    this.sent.push(JSON.parse(message));
  }

  close() {
    this.readyState = "closed";
  }
}

class FakePeer {
  static latest = null;

  constructor() {
    this.connectionState = "new";
    this.iceGatheringState = "complete";
    this.listeners = new Map();
    FakePeer.latest = this;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  createDataChannel() {
    this.channel = new FakeChannel();
    return this.channel;
  }

  async createOffer() { return { type: "offer", sdp: "test" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  close() { this.connectionState = "closed"; }
}

globalThis.window = { setTimeout, clearTimeout };
globalThis.RTCPeerConnection = FakePeer;

const { createHostOffer, closeSession, sendStartRun } = await import("../src/net/p2pSession.js");
const { networkStatus } = await import("../src/net/netState.js");

test("host waits for an open DataChannel and flushes a queued run start", async () => {
  await createHostOffer();
  const channel = FakePeer.latest.channel;
  assert.equal(networkStatus().connected, false);
  assert.equal(sendStartRun({ config: { difficultyId: "ember", weaponId: "arc" } }), false);

  channel.readyState = "open";
  channel.emit("open");

  assert.equal(networkStatus().connected, true);
  assert.deepEqual(channel.sent.map((message) => message.type), ["hello", "startRun"]);
  closeSession();
});
