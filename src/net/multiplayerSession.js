import * as p2p from "./p2pSession.js";
import {
  closeRelaySession,
  createRelayHostRoom,
  currentRelayRoom,
  disconnectRelay,
  isRelayActive,
  isRelayConfigured,
  joinRelayRoom,
  relayServerUrl,
  sendRelayInput,
  sendRelayLobbyAction,
  sendRelayShopAction,
  sendRelaySnapshot,
  sendRelayStartRun,
} from "./wsSession.js";

export { isRelayConfigured, relayServerUrl };
export const createHostOffer = p2p.createHostOffer;
export const acceptHostOffer = p2p.acceptHostOffer;
export const acceptGuestAnswer = p2p.acceptGuestAnswer;

export function createLanHostRoom() {
  return isRelayConfigured() ? createRelayHostRoom() : p2p.createLanHostRoom();
}

export function joinLanRoom(roomId) {
  return isRelayConfigured() ? joinRelayRoom(roomId) : p2p.joinLanRoom(roomId);
}

export function currentLanRoom() {
  return isRelayActive() ? currentRelayRoom() : p2p.currentLanRoom();
}

export function sendLocalInput(payload) { return isRelayActive() ? sendRelayInput(payload) : p2p.sendLocalInput(payload); }
export function sendHostSnapshot() { return isRelayActive() ? sendRelaySnapshot() : p2p.sendHostSnapshot(); }
export function sendStartRun(payload) { return isRelayActive() ? sendRelayStartRun(payload) : p2p.sendStartRun(payload); }
export function sendShopAction(payload) { return isRelayActive() ? sendRelayShopAction(payload) : p2p.sendShopAction(payload); }
export function sendLobbyAction(payload) { return isRelayActive() ? sendRelayLobbyAction(payload) : p2p.sendLobbyAction(payload); }

export function disconnectPeer() {
  if (isRelayActive()) disconnectRelay();
  else p2p.disconnectPeer();
}

export function closeSession(options) {
  if (isRelayActive()) closeRelaySession({ reset: true });
  else p2p.closeSession(options);
}
