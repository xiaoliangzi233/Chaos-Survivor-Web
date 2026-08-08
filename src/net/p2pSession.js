import {
  MESSAGE_TYPES,
  netRuntime,
  networkStatus,
  resetNetworkRuntime,
  setNetworkConnected,
  setNetworkRole,
  setNetworkStatus,
  updateRemoteInput,
} from "./netState.js";
import { applyHostSnapshot, createHostSnapshot } from "./snapshot.js";

const CHANNEL_NAME = "survivor-p2p-v1";
const ICE_TIMEOUT_MS = 1800;
let peer = null;
let channel = null;

export async function createHostOffer() {
  closeSession({ keepRole: false, notify: false });
  setNetworkRole("host");
  setNetworkStatus("creating-offer");
  peer = createPeer();
  channel = peer.createDataChannel(CHANNEL_NAME);
  bindChannel(channel);
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGathering(peer);
  setNetworkStatus("waiting-answer");
  return encodeSignal(peer.localDescription);
}

export async function acceptHostOffer(offerText) {
  closeSession({ keepRole: false, notify: false });
  setNetworkRole("guest");
  setNetworkStatus("accepting-offer");
  peer = createPeer();
  peer.addEventListener("datachannel", (event) => {
    channel = event.channel;
    bindChannel(channel);
  });
  await peer.setRemoteDescription(decodeSignal(offerText));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceGathering(peer);
  setNetworkStatus("waiting-host");
  return encodeSignal(peer.localDescription);
}

export async function acceptGuestAnswer(answerText) {
  if (!peer) throw new Error("请先创建主机邀请码。");
  setNetworkStatus("accepting-answer");
  await peer.setRemoteDescription(decodeSignal(answerText));
  setNetworkStatus("connecting");
}

export function sendLocalInput(inputFrame) {
  sendMessage({ type: "input", payload: inputFrame });
}

export function sendHostSnapshot() {
  if (!isChannelOpen()) return false;
  return sendMessage({ type: "snapshot", payload: createHostSnapshot() });
}

export function sendStartRun(payload) {
  return sendMessage({ type: "startRun", payload });
}

export function sendShopAction(payload) {
  return sendMessage({ type: "shopAction", payload });
}

export function disconnectPeer() {
  sendMessage({ type: "disconnect", payload: { reason: "local-disconnect" } });
  closeSession({ keepRole: false, notify: true });
}

export function closeSession({ keepRole = false, notify = true } = {}) {
  try {
    channel?.close?.();
  } catch {}
  try {
    peer?.close?.();
  } catch {}
  channel = null;
  peer = null;
  resetNetworkRuntime({ keepRole });
  if (notify) setNetworkStatus("idle");
}

export function isChannelOpen() {
  return channel?.readyState === "open";
}

function createPeer() {
  const rtc = new RTCPeerConnection({ iceServers: [] });
  rtc.addEventListener("connectionstatechange", () => {
    const state = rtc.connectionState;
    if (state === "connected") {
      setNetworkConnected(true, netRuntime.role === "host" ? "P2 客机" : "P1 主机");
      setNetworkStatus("connected");
      sendMessage({ type: "hello", payload: { name: netRuntime.role === "host" ? "P1 主机" : "P2 客机" } });
      schedulePing();
    } else if (state === "failed" || state === "disconnected" || state === "closed") {
      setNetworkConnected(false);
      setNetworkStatus(state);
    } else {
      setNetworkStatus(state);
    }
  });
  return rtc;
}

function bindChannel(dc) {
  dc.binaryType = "arraybuffer";
  dc.addEventListener("open", () => {
    setNetworkConnected(true, netRuntime.role === "host" ? "P2 客机" : "P1 主机");
    setNetworkStatus("connected");
    sendMessage({ type: "hello", payload: { name: netRuntime.role === "host" ? "P1 主机" : "P2 客机" } });
    schedulePing();
  });
  dc.addEventListener("close", () => {
    setNetworkConnected(false);
    setNetworkStatus("closed");
  });
  dc.addEventListener("error", () => {
    setNetworkStatus("error", "DataChannel 连接错误");
  });
  dc.addEventListener("message", (event) => receiveMessage(event.data));
}

function receiveMessage(raw) {
  let message = null;
  try {
    message = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!MESSAGE_TYPES.has(message?.type)) return;
  switch (message.type) {
    case "hello":
      setNetworkConnected(true, message.payload?.name || netRuntime.peerName);
      break;
    case "input":
      updateRemoteInput(message.payload);
      break;
    case "snapshot":
      netRuntime.onSnapshot ? netRuntime.onSnapshot(message.payload) : applyHostSnapshot(message.payload);
      break;
    case "startRun":
      netRuntime.onStartRun?.(message.payload);
      break;
    case "ping":
      sendMessage({ type: "pong", payload: { sentAt: message.payload?.sentAt || now() } });
      break;
    case "pong":
      netRuntime.latencyMs = Math.max(0, Math.round(now() - Number(message.payload?.sentAt || now())));
      break;
    case "disconnect":
      closeSession({ keepRole: false, notify: true });
      break;
  }
}

function sendMessage(message) {
  if (!isChannelOpen()) return false;
  try {
    channel.send(JSON.stringify(message));
    return true;
  } catch (error) {
    setNetworkStatus("send-error", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function schedulePing() {
  window.setTimeout(() => {
    if (!isChannelOpen()) return;
    sendMessage({ type: "ping", payload: { sentAt: now(), status: networkStatus() } });
    schedulePing();
  }, 1000);
}

function encodeSignal(description) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(description))));
}

function decodeSignal(text) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(String(text || "").trim()))));
  } catch {
    throw new Error("联机码格式不正确。");
  }
}

function waitForIceGathering(rtc) {
  if (rtc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, ICE_TIMEOUT_MS);
    function done() {
      window.clearTimeout(timeout);
      rtc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (rtc.iceGatheringState === "complete") done();
    }
    rtc.addEventListener("icegatheringstatechange", check);
  });
}

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
