import { createInventory, createWeapons, state } from "../state.js";

// Reuse the established global-state systems for P2 without sharing a loadout.
export function ensurePeerProfile() {
  const peer = state.players?.p2;
  if (!peer) return null;
  peer.gold = Number(peer.gold) || 0;
  peer.weapons ||= createWeapons();
  peer.inventory ||= createInventory();
  return peer;
}

export function withPlayerProfile(playerId, work) {
  if (playerId !== "p2") return work();
  const peer = ensurePeerProfile();
  if (!peer) return work();
  const previous = { player: state.player, weapons: state.weapons, inventory: state.inventory, gold: state.gold, shop: state.shop, initialWeaponId: state.initialWeaponId };
  state.player = peer;
  state.weapons = peer.weapons;
  state.inventory = peer.inventory;
  state.gold = peer.gold;
  state.shop = peer.shop;
  state.initialWeaponId = peer.initialWeaponId;
  try { return work(); } finally {
    peer.weapons = state.weapons;
    peer.inventory = state.inventory;
    peer.gold = state.gold;
    peer.shop = state.shop;
    peer.initialWeaponId = state.initialWeaponId;
    Object.assign(state, previous);
  }
}

export function addGoldForPlayer(player, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (player?.id === "p2") player.gold = (Number(player.gold) || 0) + value;
  else state.gold += value;
}
