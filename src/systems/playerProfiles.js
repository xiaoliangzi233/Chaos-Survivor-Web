import { state } from "../state.js";

export function addGoldForPlayer(player, amount) {
  const value = Math.max(0, Number(amount) || 0);
  state.gold += value;
}
