import {
  netRuntime,
  networkStatus,
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
let socket = null;
let session = null;
let pendingStartRun = null;
let pingTimer = 0;

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
  session = { role: "host", roomId: control.roomId };
  setNetworkStatus("waiting-guest");
  return { roomId: control.roomId, inviteUrl: createRelayInviteUrl(control.roomId), expiresIn: control.expiresIn || 900 };
}

export async function joinRelayRoom(roomId) {
  closeRelaySession({ notifyPeer: false, reset: true });
  const normalized = normalizeRoomId(roomId);
  setNetworkRole("guest");
  setNetworkStatus("joining-room");
  const control = await connectRelay({ action: "join", roomId: normalized });
  session = { role: "guest", roomId: control.roomId || normalized };
  markRelayReady();
  return { roomId: session.roomId };
}

export function currentRelayRoom() {
  return session ? { ...session, inviteUrl: session.role === "host" ? createRelayInviteUrl(session.roomId) : "" } : null;
}

export function sendRelayInput(payload) { return sendRelayMessage({ type: "input", payload }); }
export function sendRelayLobbyAction(payload) { return sendRelayMessage({ type: "lobbyAction", payload }); }
export function sendRelayShopAction(payload) { return sendRelayMessage({ type: "shopAction", payload }); }

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
  const active = socket;
  socket = null;
  session = null;
  pendingStartRun = null;
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
      if (message.type === "peerLeft") {
        setNetworkConnected(false);
        setNetworkStatus("peer-left");
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
        setNetworkConnected(false);
        setNetworkStatus("closed");
      }
    });
    ws.addEventListener("error", () => fail(new Error("无法连接 WebSocket 联机服务器。")));
  });
}

function markRelayReady() {
  if (!relayOpen()) return;
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
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    setNetworkStatus("send-error", error instanceof Error ? error.message : String(error));
    return false;
  }
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
