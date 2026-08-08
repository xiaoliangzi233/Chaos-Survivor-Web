import { state } from "../state.js";

export const MESSAGE_TYPES = new Set([
  "hello",
  "input",
  "snapshot",
  "startRun",
  "shopAction",
  "lobbyAction",
  "readyState",
  "stateSync",
  "resume",
  "roomClosed",
  "relayError",
  "ping",
  "pong",
  "disconnect",
]);

export const NETWORK_PHASE_LABELS = {
  idle: "未连接",
  "creating-room": "创建房间中",
  "waiting-guest": "等待 P2 加入",
  "joining-room": "加入房间中",
  "waiting-host": "等待主机确认",
  "creating-offer": "生成主机码中",
  "waiting-answer": "等待应答码",
  "accepting-offer": "读取主机码中",
  "accepting-answer": "读取应答码中",
  connecting: "连接中",
  "channel-opening": "数据通道初始化中",
  connected: "已连接",
  syncing: "同步战场中",
  "peer-left": "对方断开",
  reconnecting: "重连中",
  "room-closed": "房间已关闭",
  closed: "连接已关闭",
  disconnected: "连接已断开",
  failed: "连接失败",
  error: "连接错误",
  "send-error": "发送失败",
  "room-error": "房间错误",
  "relay-error": "联机服务器错误",
};

export const netRuntime = {
  role: "solo",
  connected: false,
  status: "idle",
  peerName: "",
  latencyMs: 0,
  jitterMs: 0,
  remoteInput: createEmptyInputFrame(),
  localInputSeq: 0,
  outboundSeq: 0,
  lastInboundSeq: 0,
  lastSnapshotSeq: 0,
  lastSnapshotSentAt: 0,
  snapshotIntervalMs: 0,
  lastSnapshotAt: 0,
  lastInputAt: 0,
  lastError: "",
  session: null,
  onStartRun: null,
  onSnapshot: null,
  onLobbyAction: null,
  onShopAction: null,
  onReadyState: null,
  onStateSync: null,
  onResume: null,
  onRoomClosed: null,
  onStatus: null,
};

export function createEmptyInputFrame() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    vx: 0,
    vy: 0,
    seq: 0,
  };
}

export function setNetworkRole(role) {
  netRuntime.role = role === "host" || role === "guest" ? role : "solo";
  syncStateMultiplayer();
}

export function setNetworkConnected(connected, peerName = netRuntime.peerName) {
  netRuntime.connected = Boolean(connected);
  netRuntime.peerName = peerName || "";
  syncStateMultiplayer();
}

export function setNetworkStatus(status, error = "") {
  netRuntime.status = status || "idle";
  netRuntime.lastError = error || "";
  netRuntime.onStatus?.(networkStatus());
}

export function updateRemoteInput(frame = {}) {
  netRuntime.remoteInput = normalizeInputFrame(frame, netRuntime.remoteInput.seq || 0);
  netRuntime.lastInputAt = performanceNow();
}

export function nextLocalInputFrame(input) {
  netRuntime.localInputSeq += 1;
  return normalizeInputFrame({ ...input, seq: netRuntime.localInputSeq }, netRuntime.localInputSeq);
}

export function normalizeInputFrame(frame = {}, fallbackSeq = 0) {
  return {
    up: Boolean(frame.up),
    down: Boolean(frame.down),
    left: Boolean(frame.left),
    right: Boolean(frame.right),
    vx: clampAxis(frame.vx),
    vy: clampAxis(frame.vy),
    seq: Math.max(0, Math.floor(Number(frame.seq) || fallbackSeq || 0)),
  };
}

export function isHostAuthority() {
  return netRuntime.role === "host" && netRuntime.connected;
}

export function isGuestMirror() {
  return netRuntime.role === "guest" && netRuntime.connected;
}

export function networkStatus() {
  return {
    role: netRuntime.role,
    connected: netRuntime.connected,
    status: netRuntime.status,
    peerName: netRuntime.peerName,
    latencyMs: netRuntime.latencyMs,
    jitterMs: netRuntime.jitterMs,
    snapshotIntervalMs: netRuntime.snapshotIntervalMs,
    lastError: netRuntime.lastError,
    label: networkStatusLabel(),
  };
}

export function networkStatusLabel(status = netRuntime.status) {
  return NETWORK_PHASE_LABELS[status] || status || NETWORK_PHASE_LABELS.idle;
}

export function nextNetworkMessageSeq() {
  netRuntime.outboundSeq += 1;
  return netRuntime.outboundSeq;
}

export function acceptInboundMessage(message = {}) {
  const seq = Math.max(0, Math.floor(Number(message.seq) || 0));
  if (!seq) return true;
  if (message.type === "snapshot") {
    if (seq <= netRuntime.lastSnapshotSeq) return false;
    const previousAt = netRuntime.lastSnapshotSentAt;
    const sentAt = Math.max(0, Number(message.sentAt) || 0);
    if (previousAt && sentAt) {
      const interval = Math.max(0, sentAt - previousAt);
      netRuntime.jitterMs = Math.round(netRuntime.jitterMs * 0.78 + Math.abs(interval - netRuntime.snapshotIntervalMs) * 0.22);
      netRuntime.snapshotIntervalMs = Math.round(netRuntime.snapshotIntervalMs * 0.75 + interval * 0.25);
    }
    netRuntime.lastSnapshotSeq = seq;
    if (sentAt) netRuntime.lastSnapshotSentAt = sentAt;
    return true;
  }
  if (seq <= netRuntime.lastInboundSeq && message.type !== "pong") return false;
  netRuntime.lastInboundSeq = Math.max(netRuntime.lastInboundSeq, seq);
  return true;
}

export function syncStateMultiplayer() {
  state.multiplayer ||= {};
  state.multiplayer.enabled = netRuntime.role !== "solo";
  state.multiplayer.role = netRuntime.role;
  state.multiplayer.connected = netRuntime.connected;
  state.multiplayer.peerName = netRuntime.peerName;
  state.multiplayer.latencyMs = netRuntime.latencyMs;
  state.multiplayer.jitterMs = netRuntime.jitterMs;
  state.multiplayer.snapshotIntervalMs = netRuntime.snapshotIntervalMs;
  state.multiplayer.status = netRuntime.status;
  state.multiplayer.statusLabel = networkStatusLabel();
}

export function resetNetworkRuntime({ keepRole = false } = {}) {
  netRuntime.connected = false;
  netRuntime.status = "idle";
  netRuntime.peerName = "";
  netRuntime.latencyMs = 0;
  netRuntime.jitterMs = 0;
  netRuntime.remoteInput = createEmptyInputFrame();
  netRuntime.localInputSeq = 0;
  netRuntime.outboundSeq = 0;
  netRuntime.lastInboundSeq = 0;
  netRuntime.lastSnapshotSeq = 0;
  netRuntime.lastSnapshotSentAt = 0;
  netRuntime.snapshotIntervalMs = 0;
  netRuntime.lastSnapshotAt = 0;
  netRuntime.lastInputAt = 0;
  netRuntime.lastError = "";
  if (!keepRole) netRuntime.role = "solo";
  syncStateMultiplayer();
  netRuntime.onStatus?.(networkStatus());
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function performanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
