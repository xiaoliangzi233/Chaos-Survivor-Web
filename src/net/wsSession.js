import {
  netRuntime,
  networkStatus,
  nextNetworkMessageSeq,
  resetNetworkRuntime,
  setNetworkConnected,
  setNetworkRole,
  setNetworkStatus,
} from "./netState.js";
import { createHostSnapshot } from "./snapshot.js";
import { handleNetworkMessage } from "./networkMessages.js";
import { multiplayerConfig } from "../config/multiplayer-config.js";
import { normalizeRoomId } from "./lanRoomService.js";

const RELAY_PROTOCOL = "survivor-relay-v1";
const BUFFER_LIMIT = 384 * 1024;
const INPUT_HEARTBEAT_MS = 120;
const RECONNECT_DELAY_MS = 900;
const RECONNECT_WINDOW_MS = 12000;
let socket = null;
let session = null;
let pendingStartRun = null;
let pingTimer = 0;
let reconnectTimer = 0;
let reconnectUntil = 0;
let lastInputSignature = "";
let lastInputSentAt = 0;

export function relayServerUrl(search = typeof window !== "undefined" ? window.location.search : "") {
  const query = new URLSearchParams(search).get("relay") || "";
  return normalizeRelayUrl(query || multiplayerConfig.relayServerUrl || "");
}

export function isRelayConfigured(search) {
  return Boolean(relayServerUrl(search));
}

export function isRelayActive() {
  return Boolean(socket && session);
}

export async function createRelayHostRoom() {
  closeRelaySession({ notifyPeer: false, reset: true });
  setNetworkRole("host");
  setNetworkStatus("creating-room");
  const control = await connectRelay({ action: "create" });
  session = { role: "host", roomId: control.roomId, reconnectable: false };
  setNetworkStatus("waiting-guest");
  return { roomId: control.roomId, inviteUrl: createRelayInviteUrl(control.roomId), expiresIn: control.expiresIn || 900 };
}

export async function joinRelayRoom(roomId) {
  closeRelaySession({ notifyPeer: false, reset: true });
  const normalized = normalizeRoomId(roomId);
  setNetworkRole("guest");
  setNetworkStatus("joining-room");
  const control = await connectRelay({ action: "join", roomId: normalized });
  session = { role: "guest", roomId: control.roomId || normalized, reconnectable: true };
  markRelayReady();
  return { roomId: session.roomId };
}

export function currentRelayRoom() {
  return session ? { ...session, inviteUrl: session.role === "host" ? createRelayInviteUrl(session.roomId) : "" } : null;
}

export function sendRelayInput(payload) {
  if (!relayOpen()) return false;
  const normalized = normalizeInputPayload(payload);
  const signature = `${normalized.up ? 1 : 0}${normalized.down ? 1 : 0}${normalized.left ? 1 : 0}${normalized.right ? 1 : 0}:${normalized.vx.toFixed(2)}:${normalized.vy.toFixed(2)}`;
  const now = performanceNow();
  if (signature === lastInputSignature && now - lastInputSentAt < INPUT_HEARTBEAT_MS) return false;
  lastInputSignature = signature;
  lastInputSentAt = now;
  return sendRelayMessage({ type: "input", payload: normalized });
}
export function sendRelayLobbyAction(payload) { return sendRelayMessage({ type: "lobbyAction", payload }); }
export function sendRelayShopAction(payload) { return sendRelayMessage({ type: "shopAction", payload }); }
export function sendRelayReadyState(payload) { return sendRelayMessage({ type: "readyState", payload }); }
export function sendRelayStateSync(payload) { return sendRelayMessage({ type: "stateSync", payload }); }

export function sendRelaySnapshot() {
  if (!relayOpen() || (Number(socket.bufferedAmount) || 0) > BUFFER_LIMIT) return false;
  return sendRelayMessage({ type: "snapshot", payload: createHostSnapshot() });
}

export function sendRelayStartRun(payload) {
  pendingStartRun = payload;
  return flushPendingStartRun();
}

export function disconnectRelay() {
  sendRelayMessage({ type: "disconnect", payload: { reason: "local-disconnect" } });
  closeRelaySession({ notifyPeer: false, reset: true });
}

export function closeRelaySession({ notifyPeer = false, reset = true } = {}) {
  if (notifyPeer) sendRelayMessage({ type: "disconnect", payload: { reason: "connection-closed" } });
  clearPing();
  clearReconnect();
  const active = socket;
  socket = null;
  session = null;
  pendingStartRun = null;
  lastInputSignature = "";
  lastInputSentAt = 0;
  try { active?.close?.(); } catch {}
  if (reset) resetNetworkRuntime({ keepRole: false });
}

function connectRelay(handshake) {
  const url = relayServerUrl();
  if (!url) return Promise.reject(new Error("未配置 WebSocket 联机服务器地址。"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url);
    socket = ws;
    const timeout = window.setTimeout(() => fail(new Error("连接联机服务器超时。")), 8000);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try { ws.close(); } catch {}
      if (socket === ws) socket = null;
      setNetworkStatus("relay-error", error.message);
      reject(error);
    };
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "control", protocol: RELAY_PROTOCOL, ...handshake })));
    ws.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "roomCreated" || message.type === "roomJoined") {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve(message);
        }
        return;
      }
      if (message.type === "peerJoined") {
        if (netRuntime.role === "host") markRelayReady();
        return;
      }
      if (message.type === "peerResumed") {
        if (netRuntime.role === "host") markRelayReady();
        return;
      }
      if (message.type === "peerLeft") {
        setNetworkConnected(false);
        setNetworkStatus("peer-left");
        return;
      }
      if (message.type === "roomClosed") {
        setNetworkConnected(false);
        setNetworkStatus("room-closed", message.reason || "");
        return;
      }
      if (message.type === "relayError") {
        if (!settled) fail(new Error(message.message || "联机服务器返回错误。"));
        else setNetworkStatus("relay-error", message.message || "联机服务器返回错误。");
        return;
      }
      handleNetworkMessage(message, {
        send: sendRelayMessage,
        disconnect: () => closeRelaySession({ reset: true }),
      });
    });
    ws.addEventListener("close", () => {
      if (!settled) fail(new Error("联机服务器连接已关闭。"));
      else if (socket === ws) {
        clearPing();
        socket = null;
        handleRelayClose();
      }
    });
    ws.addEventListener("error", () => fail(new Error("无法连接 WebSocket 联机服务器。")));
  });
}

function markRelayReady() {
  if (!relayOpen()) return;
  clearReconnect();
  setNetworkConnected(true, netRuntime.role === "host" ? "P2 客机" : "P1 主机");
  setNetworkStatus("connected");
  sendRelayMessage({ type: "hello", payload: { name: netRuntime.role === "host" ? "P1 主机" : "P2 客机" } });
  flushPendingStartRun();
  schedulePing();
}

function flushPendingStartRun() {
  if (netRuntime.role !== "host" || !pendingStartRun || !relayOpen() || !netRuntime.connected) return false;
  const payload = pendingStartRun;
  pendingStartRun = null;
  return sendRelayMessage({ type: "startRun", payload });
}

function sendRelayMessage(message) {
  if (!relayOpen()) return false;
  try {
    const framed = {
      ...message,
      seq: Number(message.seq) || nextNetworkMessageSeq(),
      roomId: message.roomId || session?.roomId || "",
      sentAt: Number(message.sentAt) || performanceNow(),
    };
    socket.send(JSON.stringify(framed));
    return true;
  } catch (error) {
    setNetworkStatus("send-error", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function handleRelayClose() {
  const activeSession = session;
  setNetworkConnected(false);
  if (activeSession?.role === "guest" && activeSession.reconnectable && activeSession.roomId) {
    reconnectUntil = performanceNow() + RECONNECT_WINDOW_MS;
    scheduleReconnect();
    return;
  }
  setNetworkStatus("closed");
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  setNetworkStatus("reconnecting");
  reconnectTimer = window.setTimeout(async () => {
    reconnectTimer = 0;
    if (!session?.roomId || netRuntime.role !== "guest") return;
    if (performanceNow() > reconnectUntil) {
      closeRelaySession({ notifyPeer: false, reset: true });
      setNetworkStatus("room-closed", "重连超时，房间连接已断开。");
      return;
    }
    try {
      const previousRoomId = session.roomId;
      const control = await connectRelay({ action: "resume", roomId: previousRoomId });
      session = { role: "guest", roomId: control.roomId || previousRoomId, reconnectable: true };
      markRelayReady();
      sendRelayMessage({ type: "resume", payload: { roomId: session.roomId } });
    } catch {
      scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
}

function clearReconnect() {
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  reconnectUntil = 0;
}

function normalizeInputPayload(payload = {}) {
  return {
    up: Boolean(payload.up),
    down: Boolean(payload.down),
    left: Boolean(payload.left),
    right: Boolean(payload.right),
    vx: Math.max(-1, Math.min(1, Number(payload.vx) || 0)),
    vy: Math.max(-1, Math.min(1, Number(payload.vy) || 0)),
    seq: Math.max(0, Math.floor(Number(payload.seq) || 0)),
  };
}

function schedulePing() {
  if (pingTimer) return;
  pingTimer = window.setTimeout(() => {
    pingTimer = 0;
    if (!relayOpen()) return;
    sendRelayMessage({ type: "ping", payload: { sentAt: performanceNow(), status: networkStatus() } });
    schedulePing();
  }, 1000);
}

function clearPing() {
  if (!pingTimer) return;
  window.clearTimeout(pingTimer);
  pingTimer = 0;
}

function relayOpen() {
  return socket?.readyState === WebSocket.OPEN;
}

function createRelayInviteUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("join", roomId);
  url.searchParams.set("transport", "relay");
  url.searchParams.set("relay", relayServerUrl());
  return url.toString();
}

function normalizeRelayUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "ws:" || url.protocol === "wss:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function performanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
