import {
  MESSAGE_TYPES,
  acceptInboundMessage,
  netRuntime,
  networkStatus,
  setNetworkConnected,
  setNetworkStatus,
  syncStateMultiplayer,
  updateRemoteInput,
} from "./netState.js";
import { applyHostSnapshot } from "./snapshot.js";

export function handleNetworkMessage(raw, { send, disconnect, now = performanceNow } = {}) {
  let message = null;
  try {
    message = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return false;
  }
  if (!MESSAGE_TYPES.has(message?.type)) return false;
  if (!acceptInboundMessage(message)) return true;
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
    case "shopAction":
      netRuntime.onShopAction?.(message.payload);
      break;
    case "readyState":
      netRuntime.onReadyState?.(message.payload);
      break;
    case "stateSync":
      netRuntime.onStateSync?.(message.payload);
      break;
    case "resume":
      netRuntime.onResume?.(message.payload);
      break;
    case "roomClosed":
      setNetworkConnected(false);
      setNetworkStatus("room-closed", message.payload?.reason || "");
      netRuntime.onRoomClosed?.(message.payload);
      break;
    case "relayError":
      setNetworkStatus("relay-error", message.message || message.payload?.message || "联机服务器返回错误。");
      break;
    case "ping":
      send?.({ type: "pong", payload: { sentAt: message.payload?.sentAt || now(), receivedAt: now() } });
      break;
    case "pong":
      netRuntime.latencyMs = Math.max(0, Math.round(now() - Number(message.payload?.sentAt || now())));
      syncStateMultiplayer();
      netRuntime.onStatus?.(networkStatus());
      break;
    case "disconnect":
      disconnect?.();
      break;
  }
  return true;
}

function performanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
