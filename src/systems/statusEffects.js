import { state } from "../state.js";

export function applyFrostMark(player = state.player, { duration = 10, slow = 0.28, freezeDuration = 5 } = {}) {
  if (!player || player.frozenTimer > 0) return false;
  player.frostMarks = (player.frostMarks || 0) + 1;
  player.frostMarkTimer = duration;
  player.frostTimer = Math.max(player.frostTimer || 0, duration);
  player.frostSlow = Math.max(player.frostSlow || 0, slow);
  if (player.frostMarks >= 3) {
    player.frostMarks = 0;
    player.frostMarkTimer = 0;
    player.frostTimer = 0;
    player.frostSlow = 0;
    player.frozenTimer = freezeDuration;
    state.flash = Math.max(state.flash, 0.22);
    state.shake = Math.max(state.shake, 8);
    return true;
  }
  return false;
}
