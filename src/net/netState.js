import { state } from "../state.js";

export const MESSAGE_TYPES = new Set([
  "hello",
  "input",
  "snapshot",
  "startRun",
  "shopAction",
  "ping",
  "pong",
  "disconnect",
]);

export const netRuntime = {
  role: "solo",
  connected: false,
  status: "idle",
  peerName: "",
  latencyMs: 0,
  remoteInput: createEmptyInputFrame(),
  localInputSeq: 0,
  lastSnapshotAt: 0,
  lastInputAt: 0,
  lastError: "",
  session: null,
  onStartRun: null,
  onSnapshot: null,
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
    lastError: netRuntime.lastError,
  };
}

export function syncStateMultiplayer() {
  state.multiplayer ||= {};
  state.multiplayer.enabled = netRuntime.role !== "solo";
  state.multiplayer.role = netRuntime.role;
  state.multiplayer.connected = netRuntime.connected;
  state.multiplayer.peerName = netRuntime.peerName;
  state.multiplayer.latencyMs = netRuntime.latencyMs;
  state.multiplayer.status = netRuntime.status;
}

export function resetNetworkRuntime({ keepRole = false } = {}) {
  netRuntime.connected = false;
  netRuntime.status = "idle";
  netRuntime.peerName = "";
  netRuntime.latencyMs = 0;
  netRuntime.remoteInput = createEmptyInputFrame();
  netRuntime.localInputSeq = 0;
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
