import {
  MESSAGE_TYPES,
  netRuntime,
  networkStatus,
  setNetworkConnected,
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
    case "ping":
      send?.({ type: "pong", payload: { sentAt: message.payload?.sentAt || now() } });
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
