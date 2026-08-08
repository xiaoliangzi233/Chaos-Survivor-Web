import {
  MESSAGE_TYPES,
  netRuntime,
  networkStatus,
  resetNetworkRuntime,
  setNetworkConnected,
  setNetworkRole,
  setNetworkStatus,
  syncStateMultiplayer,
  updateRemoteInput,
} from "./netState.js";
import { applyHostSnapshot, createHostSnapshot } from "./snapshot.js";
import { multiplayerConfig } from "../config/multiplayer-config.js";
import {
  cancelLanRoom as revokeLanRoom,
  createInviteUrl,
  createLanRoom,
  fetchLanAnswer,
  fetchLanOffer,
  normalizeRoomId,
  publishLanAnswer,
} from "./lanRoomService.js";

const CHANNEL_NAME = "survivor-p2p-v1";
const ICE_TIMEOUT_MS = 1800;
let peer = null;
let channel = null;
let lanSession = null;
let pendingStartRun = null;
let pingTimer = 0;

export async function createLanHostRoom() {
  const offer = await createHostOffer();
  setNetworkStatus("creating-room");
  try {
    const room = await createLanRoom(offer);
    lanSession = {
      role: "host",
      roomId: room.roomId,
      inviteUrl: createInviteUrl(room.roomId),
      pollTimer: 0,
      stopped: false,
    };
    setNetworkStatus("waiting-guest");
    pollHostAnswer();
    return { roomId: room.roomId, inviteUrl: lanSession.inviteUrl, expiresIn: room.expiresIn };
  } catch (error) {
    closeSession({ keepRole: false, notify: false });
    setNetworkStatus("room-error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function joinLanRoom(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);
  closeSession({ keepRole: false, notify: false });
  setNetworkStatus("joining-room");
  try {
    const room = await fetchLanOffer(normalizedRoomId);
    const answer = await acceptHostOffer(room.offer);
    lanSession = { role: "guest", roomId: normalizedRoomId, pollTimer: 0, stopped: false };
    await publishLanAnswer(normalizedRoomId, answer);
    setNetworkStatus("waiting-host");
    return { roomId: normalizedRoomId };
  } catch (error) {
    closeSession({ keepRole: false, notify: false });
    setNetworkStatus("room-error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function currentLanRoom() {
  if (!lanSession) return null;
  return { roomId: lanSession.roomId, role: lanSession.role, inviteUrl: lanSession.inviteUrl || "" };
}

export function cancelLanSession() {
  stopLanSignaling({ revoke: true });
  closeSession({ keepRole: false, notify: true });
}

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
  pendingStartRun = payload;
  return flushPendingStartRun();
}

export function sendShopAction(payload) {
  return sendMessage({ type: "shopAction", payload });
}

export function sendLobbyAction(payload) {
  return sendMessage({ type: "lobbyAction", payload });
}

export function disconnectPeer() {
  sendMessage({ type: "disconnect", payload: { reason: "local-disconnect" } });
  closeSession({ keepRole: false, notify: true });
}

export function closeSession({ keepRole = false, notify = true } = {}) {
  stopLanSignaling({ revoke: true });
  clearPingTimer();
  try {
    channel?.close?.();
  } catch {}
  try {
    peer?.close?.();
  } catch {}
  channel = null;
  peer = null;
  pendingStartRun = null;
  resetNetworkRuntime({ keepRole });
  if (notify) setNetworkStatus("idle");
}

export function isChannelOpen() {
  return channel?.readyState === "open";
}

function createPeer() {
  const rtc = new RTCPeerConnection({ iceServers: multiplayerConfig.iceServers || [] });
  rtc.addEventListener("connectionstatechange", () => {
    const state = rtc.connectionState;
    if (state === "connected") {
      stopLanSignaling();
      if (isChannelOpen()) markChannelReady();
      else setNetworkStatus("channel-opening");
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
    stopLanSignaling();
    markChannelReady();
  });
  dc.addEventListener("close", () => {
    clearPingTimer();
    setNetworkConnected(false);
    setNetworkStatus("closed");
  });
  dc.addEventListener("error", () => {
    setNetworkStatus("error", "DataChannel 连接错误");
  });
  dc.addEventListener("message", (event) => receiveMessage(event.data));
}

function markChannelReady() {
  if (!isChannelOpen()) return;
  setNetworkConnected(true, netRuntime.role === "host" ? "P2 客机" : "P1 主机");
  setNetworkStatus("connected");
  sendMessage({ type: "hello", payload: { name: netRuntime.role === "host" ? "P1 主机" : "P2 客机" } });
  flushPendingStartRun();
  schedulePing();
}

function flushPendingStartRun() {
  if (netRuntime.role !== "host" || !pendingStartRun || !isChannelOpen()) return false;
  const payload = pendingStartRun;
  pendingStartRun = null;
  return sendMessage({ type: "startRun", payload });
}

async function pollHostAnswer() {
  const session = lanSession;
  if (!session || session.role !== "host" || session.stopped) return;
  try {
    const response = await fetchLanAnswer(session.roomId);
    if (lanSession !== session || session.stopped) return;
    if (response.state === "answer_ready" && response.answer) {
      stopLanSignaling();
      await acceptGuestAnswer(response.answer);
      return;
    }
    scheduleHostPoll(session);
  } catch (error) {
    if (lanSession !== session || session.stopped) return;
    stopLanSignaling();
    setNetworkStatus("room-error", error instanceof Error ? error.message : String(error));
  }
}

function scheduleHostPoll(session) {
  session.pollTimer = window.setTimeout(() => pollHostAnswer(), 650);
}

function stopLanSignaling({ revoke = false } = {}) {
  const session = lanSession;
  if (!session) return;
  session.stopped = true;
  if (session.pollTimer) window.clearTimeout(session.pollTimer);
  lanSession = null;
  if (revoke && session.role === "host") revokeLanRoom(session.roomId).catch(() => {});
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
    case "lobbyAction":
      netRuntime.onLobbyAction?.(message.payload);
      break;
    case "ping":
      sendMessage({ type: "pong", payload: { sentAt: message.payload?.sentAt || now() } });
      break;
    case "pong":
      netRuntime.latencyMs = Math.max(0, Math.round(now() - Number(message.payload?.sentAt || now())));
      syncStateMultiplayer();
      netRuntime.onStatus?.(networkStatus());
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
  if (pingTimer) return;
  pingTimer = window.setTimeout(() => {
    pingTimer = 0;
    if (!isChannelOpen()) return;
    sendMessage({ type: "ping", payload: { sentAt: now(), status: networkStatus() } });
    schedulePing();
  }, 1000);
}

function clearPingTimer() {
  if (!pingTimer) return;
  window.clearTimeout(pingTimer);
  pingTimer = 0;
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
