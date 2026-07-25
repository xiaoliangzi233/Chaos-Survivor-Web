import { state } from "../state.js";

export const PLAYER_STATUS_DEFS = Object.freeze({
  chill: Object.freeze({
    id: "chill",
    name: "冰缓",
    icon: "❄",
    color: "#9ff4ff",
    duration: 2.5,
    moveSlow: 0.18,
  }),
  adhesive: Object.freeze({
    id: "adhesive",
    name: "黏着",
    icon: "◆",
    color: "#b6ff69",
    duration: 3,
    moveSlowPerStack: 0.14,
    maxStacks: 2,
  }),
  wound: Object.freeze({
    id: "wound",
    name: "创伤",
    icon: "✚",
    color: "#ff6b7a",
    duration: 4,
    healingScale: 0.5,
  }),
  interference: Object.freeze({
    id: "interference",
    name: "干扰",
    icon: "⌁",
    color: "#d58cff",
    duration: 3,
    weaponRangeScale: 0.75,
    magnetScale: 0.75,
  }),
});

export function ensurePlayerStatusEffects(player = state.player) {
  if (!player) return {};
  player.statusEffects ||= {};
  return player.statusEffects;
}

export function applyPlayerStatus(
  player = state.player,
  id,
  { duration, stacks = 1, source = null } = {},
) {
  const def = PLAYER_STATUS_DEFS[id];
  if (!player || !def) return false;
  const effects = ensurePlayerStatusEffects(player);
  const existing = effects[id];
  const current = existing || { id, timer: 0, duration: 0, stacks: 0, source: null };
  const nextDuration = Math.max(0.05, Number(duration) || def.duration);
  current.timer = Math.max(current.timer || 0, nextDuration);
  current.duration = Math.max(current.duration || 0, nextDuration);
  current.source = source || current.source || null;
  current.stacks = id === "adhesive"
    ? Math.min(def.maxStacks, existing ? Math.max(1, current.stacks || 1) + Math.max(1, stacks) : Math.max(1, stacks))
    : 1;
  effects[id] = current;
  player.statusFlash = Math.max(player.statusFlash || 0, 0.28);
  player.statusFlashColor = def.color;
  return true;
}

export function updatePlayerStatusEffects(dt, player = state.player) {
  if (!player) return;
  const effects = ensurePlayerStatusEffects(player);
  for (const [id, effect] of Object.entries(effects)) {
    effect.timer = Math.max(0, (effect.timer || 0) - dt);
    if (effect.timer <= 0 || !PLAYER_STATUS_DEFS[id]) delete effects[id];
  }
  player.statusFlash = Math.max(0, (player.statusFlash || 0) - dt);
}

export function clearPlayerStatusEffects(player = state.player) {
  if (!player) return;
  player.statusEffects = {};
  player.statusFlash = 0;
  player.statusFlashColor = "";
  player.burnTimer = 0;
  player.burnDps = 0;
  player.frostTimer = 0;
  player.frostSlow = 0;
  player.frostMarks = 0;
  player.frostMarkTimer = 0;
  player.frozenTimer = 0;
}

export function hasPlayerStatus(id, player = state.player) {
  return (ensurePlayerStatusEffects(player)[id]?.timer || 0) > 0;
}

export function playerStatusEffect(id, player = state.player) {
  const effect = ensurePlayerStatusEffects(player)[id];
  return effect && effect.timer > 0 ? effect : null;
}

export function activePlayerStatusEffects(player = state.player) {
  const effects = ensurePlayerStatusEffects(player);
  return Object.values(effects)
    .filter((effect) => effect.timer > 0 && PLAYER_STATUS_DEFS[effect.id])
    .map((effect) => ({ ...PLAYER_STATUS_DEFS[effect.id], ...effect }));
}

export function playerStatusModifiers(player = state.player) {
  const effects = ensurePlayerStatusEffects(player);
  const chill = effects.chill?.timer > 0 ? PLAYER_STATUS_DEFS.chill.moveSlow : 0;
  const adhesiveStacks = effects.adhesive?.timer > 0 ? effects.adhesive.stacks || 1 : 0;
  const adhesive = PLAYER_STATUS_DEFS.adhesive.moveSlowPerStack * adhesiveStacks;
  return {
    moveSlow: Math.max(chill, adhesive),
    healingScale: effects.wound?.timer > 0 ? PLAYER_STATUS_DEFS.wound.healingScale : 1,
    weaponRangeScale: effects.interference?.timer > 0 ? PLAYER_STATUS_DEFS.interference.weaponRangeScale : 1,
    magnetScale: effects.interference?.timer > 0 ? PLAYER_STATUS_DEFS.interference.magnetScale : 1,
  };
}

export function restorePlayerHealth(player, amount) {
  const healing = Math.max(0, Number(amount) || 0) * playerStatusModifiers(player).healingScale;
  player.hp = Math.min(player.maxHp, player.hp + healing);
  return healing;
}

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
