import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { distSq, clamp } from "../utils.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { QUALITY_INFO, QUALITY_ORDER, recomputeAllWeapons } from "../economy/inventory.js";
import { recordCodexEntry } from "./codex.js";
import { ITEM_DATA_DEFS, onEditableDataChanged } from "../config/editableGameData.js";
import { playerStatusModifiers, restorePlayerHealth } from "./statusEffects.js";

const QUALITY_VALUES = {
  heart_container: [5, 10, 20, 35, 50],
  healing_potion: [20, 30, 50, 80, 120],
  healing_aura: [1, 2, 3, 4, 5],
  airburst: [30, 25, 20, 15, 10],
};

const QUALITY_SCALE = {
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.8,
  legendary: 2.3,
};

const ITEM_EFFECTS = {
  heart_container: ({ player, quality }) => { const value = qualityValue("heart_container", quality); player.maxHp += value; restorePlayerHealth(player, value); },
  healing_potion: ({ player, quality }) => { restorePlayerHealth(player, qualityValue("healing_potion", quality)); },
  shackles: ({ player }) => { player.speed -= 12; player.attackRangeBonus += 80; },
  dodge_cloak: ({ player }) => { player.dodge = clamp(player.dodge + 0.05, 0, 0.7); player.maxHp = Math.max(30, player.maxHp - 20); player.hp = Math.min(player.hp, player.maxHp); },
  bait: ({ player }) => { player.nextWaveSpawnBonus += 0.5; },
  magnet: ({ player }) => { player.magnet += 32; },
  speed_boots: ({ player }) => { player.speed += 18; },
  rapid_cord: ({ player }) => { player.attackSpeedBonus += 0.12; },
  fang: ({ player }) => { player.bleedDps += 7; player.bleedDuration = Math.max(player.bleedDuration, 2.8); },
  split_shot: ({ player }) => applySplitShot(player),
  lucky_clover: ({ player }) => { player.luck += 10; },
  gloves: ({ player }) => { player.critChance = clamp(player.critChance + 0.07, 0, 0.7); },
  knife: ({ player, scale }) => { player.damageScale += 0.08 * scale; },
  healing_aura: ({ player, quality }) => { player.regen += qualityValue("healing_aura", quality); },
  tardigrade: ({ player }) => { player.waveShields += 1; player.currentWaveShields += 1; },
  heavy_armor: ({ player }) => { player.defense += 8; player.speed -= 10; },
  turret: ({ player }) => { player.turretCount += 1; },
  thief_mark: ({ player }) => { player.coinDropBonus += 0.2; player.goldLossOnHit += 0.06; },
  star_cloak: ({ player }) => { player.starCloak = 1; },
  landmine: ({ player }) => { player.landminePacks += 1; },
  airburst: ({ player, quality }) => { player.airburstInterval = qualityValue("airburst", quality); player.airburstTimer = player.airburstInterval; },
};

export const ITEM_DEFS = [];
syncItemDefs();
onEditableDataChanged(syncItemDefs);

function syncItemDefs() {
  ITEM_DEFS.length = 0;
  ITEM_DEFS.push(...ITEM_DATA_DEFS.map((item) => ({ ...item, apply: ITEM_EFFECTS[item.id] })));
}

export function applyItemPurchase(offer) {
  const item = ITEM_DEFS.find((entry) => entry.id === offer.itemId || entry.id === offer.id);
  if (!item || !state.player) return;
  if (item.unique && hasPurchasedUniqueItem(item.id)) return;
  const quality = offerQualityForItem(item, offer.rarity);
  const scale = qualityScale(quality);
  item.apply?.({ player: state.player, quality, scale });
  if (item.unique) {
    state.player.purchasedUniqueItems ||= {};
    state.player.purchasedUniqueItems[item.id] = true;
  }
  recordItem(item, quality, offer.quantity || 1);
  if (item.active && !state.inventory.activeItemId) state.inventory.activeItemId = item.id;
  rebuildItemEffects();
  pulse(state.player.x, state.player.y, 54, QUALITY_INFO[quality]?.color || "#77ff8a", 0.32);
}

export function updateItems(dt) {
  const p = state.player;
  if (!p) return;
  if (p.regen > 0 && p.hp > 0) {
    p.hp = Math.min(p.maxHp, p.hp + p.regen * playerStatusModifiers(p).healingScale * dt);
  }
  updateAirburst(p, dt);
  updateBleeds(dt);
  updateItemObjects(dt);
  updateMechanicItems(dt);
}

export function startWaveItems() {
  const p = state.player;
  if (!p) return;
  p.currentWaveShields = p.waveShields || 0;
  world.itemObjects.length = 0;
  for (let i = 0; i < (p.turretCount || 0); i++) spawnTurret();
  for (let i = 0; i < (p.landminePacks || 0) * 3; i++) spawnLandmine();
  triggerItemEvent("waveStart", { player: p });
}

export function applyPlayerDamage(amount, source = {}, player = null) {
  const p = player || damageTargetFromSource(source) || state.player;
  if (!p || amount <= 0) return { damaged: false, amount: 0 };
  if (state.debug?.enabled && state.debug.invincible) return { damaged: false, debugInvincible: true, amount: 0 };
  if (amount < 1) {
    const reducedTick = Math.max(0.05, amount - (p.defense || 0) * 0.016);
    p.hp -= reducedTick;
    return { damaged: true, amount: reducedTick };
  }
  if (Math.random() < clamp(p.dodge || 0, 0, 0.7)) {
    pulse(p.x, p.y, 44, "#b48cff", 0.22);
    playSfx("select");
    triggerItemEvent("dodge", { player: p, source });
    return { damaged: false, dodged: true, amount: 0 };
  }
  if ((p.currentWaveShields || 0) > 0) {
    p.currentWaveShields--;
    pulse(p.x, p.y, 62, "#ffd166", 0.28);
    burst(p.x, p.y, 16, "#ffd166", 180);
    playSfx("select");
    triggerItemEvent("shield", { player: p, source });
    return { damaged: false, shielded: true, amount: 0 };
  }
  if (hasItem("crisis_insurance") && !state.inventory.itemRuntime.insuranceUsed && p.hp - amount <= 0) {
    state.inventory.itemRuntime.insuranceUsed = true;
    p.hp = 1;
    p.invuln = Math.max(p.invuln || 0, 2.5);
    triggerPulse(p.x, p.y, 180, "#77ff8a", 60);
    return { damaged: false, saved: true, amount: 0 };
  }
  const reduced = Math.max(1, amount - (p.defense || 0));
  p.hp -= reduced;
  if ((p.goldLossOnHit || 0) > 0 && state.gold > 0) {
    state.gold = Math.max(0, state.gold - Math.max(1, Math.ceil(state.gold * p.goldLossOnHit)));
  }
  if ((p.starCloak || 0) > 0) triggerStarCloak(source.x ?? p.x, source.y ?? p.y, p.starCloak);
  triggerItemEvent("damaged", { player: p, source, amount: reduced });
  return { damaged: true, amount: reduced };
}

export function modifyWeaponDamage(amount, weapon = null) {
  return rollWeaponDamage(amount, weapon).amount;
}

export function rollWeaponDamage(amount, weapon = null) {
  const p = state.player;
  const penalty = Math.min(0.75, weapon?.splitDamagePenalty || p?.splitDamagePenalty || 0);
  const critical = Math.random() < clamp(p?.critChance || 0, 0, 0.7);
  const crit = critical ? 1.85 : 1;
  const finalProtocol = hasItem("final_protocol") && world.boss ? 1.24 : 1;
  const overload = state.inventory?.itemRuntime?.overloadTimer > 0 ? 1.42 : 1;
  return { amount: amount * Math.max(0.25, 1 - penalty) * crit * finalProtocol * overload, critical };
}

export function weaponRangeBonus() {
  const bonus = state.player?.attackRangeBonus || 0;
  const statusScale = playerStatusModifiers(state.player).weaponRangeScale;
  return (state.waveScenario?.effect === "blind" ? bonus * 0.25 : bonus) * statusScale;
}

function damageTargetFromSource(source = {}) {
  if (!state.multiplayer?.enabled || !state.multiplayer?.connected || !state.players?.p2) return state.player;
  if (!Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return state.player;
  const players = [state.player, state.players.p2].filter((p) => p && p.hp > 0);
  let best = state.player;
  let bestD = Infinity;
  for (const p of players) {
    const d = distSq(source.x, source.y, p.x, p.y);
    const reach = (Number(source.r) || 28) + (p.r || 14) + 12;
    if (d <= reach * reach && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

export function weaponRangeScale() {
  return (state.waveScenario?.effect === "blind" ? 0.25 : 1) * playerStatusModifiers(state.player).weaponRangeScale;
}

export function attackSpeedMultiplier() {
  return 1 + (state.player?.attackSpeedBonus || 0);
}

export function projectileBonus() {
  return state.player?.projectileBonus || 0;
}

export function weaponProjectileBonus(weapon) {
  return (weapon?.projectileBonus || 0) + projectileBonus();
}

export function onWeaponHit(enemy, x, y) {
  const p = state.player;
  if (!enemy || enemy.dead || !p) return;
  if ((p.bleedDps || 0) > 0) {
    enemy.bleedDps = Math.max(enemy.bleedDps || 0, p.bleedDps);
    enemy.bleedTimer = Math.max(enemy.bleedTimer || 0, p.bleedDuration || 2.8);
    if (Math.random() < 0.3) burst(x, y, 3, "#ff4d6d", 90);
  }
  triggerItemEvent("hit", { enemy, x, y, player: p });
}

export function onItemEnemyKilled(enemy) { triggerItemEvent("kill", { enemy, x: enemy?.x, y: enemy?.y, player: state.player }); }
export function onItemPickup(kind, value, player) { triggerItemEvent("pickup", { kind, value, player }); }
export function onItemSold(item) { if (hasItem("scrap_recycler")) triggerPulse(state.player?.x || 0, state.player?.y || 0, 120, "#ff9f43", 42); rebuildItemEffects(); }
export function completeWaveItems() { const runtime = state.inventory?.itemRuntime || {}; if (hasItem("revival_bloom")) activePlayers().forEach((p) => restorePlayerHealth(p, 8 + Math.min(28, state.kills * 0.08))); if (hasItem("soul_vessel") && runtime.souls >= 8) { activePlayers().forEach((p) => p.currentWaveShields = (p.currentWaveShields || 0) + 1); runtime.souls = 0; } }

export function useActiveItem(player = state.player) {
  const id = state.inventory?.activeItemId;
  const item = ITEM_DEFS.find((entry) => entry.id === id && entry.active);
  if (!item || !player || !hasItem(id)) return false;
  const runtime = state.inventory.itemRuntime;
  runtime.activeCooldowns ||= {};
  if ((runtime.activeCooldowns[player.id] || 0) > 0) return false;
  runtime.activeCooldowns[player.id] = item.cooldown || 20;
  const players = activePlayers();
  if (id === "pulse_drive") triggerPulse(player.x, player.y, 190, "#42e8ff", 72, true);
  else if (id === "stasis_field") addZone(player.x, player.y, 240, 5, "stasis", "#b48cff");
  else if (id === "warp_gate") { player.x = clamp(player.x + player.dirX * 260, -WORLD_SIZE / 2 + 70, WORLD_SIZE / 2 - 70); player.y = clamp(player.y + player.dirY * 260, -WORLD_SIZE / 2 + 70, WORLD_SIZE / 2 - 70); triggerPulse(player.x, player.y, 110, "#b48cff", 28); }
  else if (id === "medic_swarm") players.forEach((p) => { restorePlayerHealth(p, 35); p.burnTimer = 0; p.frostTimer = 0; });
  else if (id === "overload_core") { runtime.overloadTimer = 7; triggerPulse(player.x, player.y, 220, "#ffd166", 52); }
  playSfx("select");
  return true;
}

export function equipActiveItem(id) {
  const item = ITEM_DEFS.find((entry) => entry.id === id && entry.active);
  if (!item || !hasItem(id)) return false;
  state.inventory.activeItemId = id;
  return true;
}

export function activeItemCooldown(player = state.player) { return state.inventory?.itemRuntime?.activeCooldowns?.[player?.id] || 0; }

export function rebuildItemEffects() {
  const inv = state.inventory;
  if (!inv || !state.player) return;
  const players = activePlayers();
  for (const p of players) {
    const hpRatio = p.hp / Math.max(1, p.maxHp);
    Object.assign(p, { speed: 210, magnet: 92, dodge: 0, defense: 0, luck: 0, critChance: 0, regen: 0, attackRangeBonus: 0, attackSpeedBonus: 0, projectileBonus: 0, splitDamagePenalty: 0, airburstInterval: 0, bleedDps: 0, bleedDuration: 0, waveShields: 0, turretCount: 0, landminePacks: 0, coinDropBonus: 0, goldLossOnHit: 0, starCloak: 0, maxHp: 110, damageScale: 1 });
    for (const entry of inv.items) {
      const def = ITEM_DEFS.find((item) => item.id === entry.itemId);
      for (let n = 0; n < (entry.qty || 1); n++) def?.apply?.({ player: p, quality: entry.quality, scale: qualityScale(entry.quality) });
    }
    p.hp = Math.min(p.maxHp, Math.max(1, p.maxHp * hpRatio));
  }
}

export function waveSpawnMultiplier() {
  return 1 + (state.player?.activeWaveSpawnBonus || 0);
}

export function consumeNextWaveSpawnBonus() {
  const p = state.player;
  if (!p) return;
  p.activeWaveSpawnBonus = p.nextWaveSpawnBonus || 0;
  p.nextWaveSpawnBonus = 0;
}

export function coinDropMultiplier() {
  return 1 + (state.player?.coinDropBonus || 0);
}

export function weightedQuality(baseWeights) {
  const luck = Math.max(0, state.player?.luck || 0);
  const entries = baseWeights.map(([quality, weight]) => {
    const rank = qualityRank(quality);
    const luckMul = rank === 0 ? 1 / (1 + luck * 0.012) : 1 + luck * rank * 0.035;
    return [quality, Math.max(0.1, weight * luckMul)];
  });
  return weightedChoice(entries);
}

export function itemSellPriceById(id, quality = "common") {
  const baseId = id?.replace(/_(common|uncommon|rare|epic|legendary)$/, "");
  const item = ITEM_DEFS.find((entry) => entry.id === baseId);
  return Math.max(2, Math.floor((item?.basePrice || 10) * qualityScale(quality) * 0.35));
}

export function itemDescription(item, quality = "common") {
  if (!item) return "";
  if (item.id === "split_shot") return item.desc;
  if (item.id === "heart_container") return `最大生命值 +${qualityValue("heart_container", quality)}。`;
  if (item.id === "healing_potion") return `立即恢复 ${qualityValue("healing_potion", quality)} 点生命。`;
  if (item.id === "healing_aura") return `每秒生命回复 +${qualityValue("healing_aura", quality)}。`;
  if (item.id === "knife") return `攻击伤害 +${Math.round(8 * qualityScale(quality))}%。`;
  if (item.id === "airburst") return `不可叠加。每隔 ${qualityValue("airburst", quality)} 秒清空玩家附近敌方投射物。`;
  return item.desc;
}

export function hasInventoryItem(itemId) {
  return Boolean(state.inventory?.items.some((entry) => entry.itemId === itemId || entry.id === itemId || entry.id?.startsWith(`${itemId}_`)));
}

export function hasPurchasedUniqueItem(itemId) {
  return Boolean(state.player?.purchasedUniqueItems?.[itemId] || hasInventoryItem(itemId));
}

export function canPurchaseItem(itemId) {
  const item = ITEM_DEFS.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: "道具不存在" };
  if (item.unique && hasPurchasedUniqueItem(item.id)) return { ok: false, reason: "该道具只能购买一次" };
  if (item.id === "split_shot" && !state.inventory?.weaponSlots.some((slot) => splitShotWeaponIds().includes(slot.id))) return { ok: false, reason: "需要至少一把投射物武器" };
  return { ok: true };
}

export function offerQualityForItem(item, rarity) {
  if (item?.fixedQuality) return item.fixedQuality;
  return item?.singleQuality ? "common" : rarity || "common";
}

function applySplitShot(player) {
  const slots = (state.inventory?.weaponSlots || []).filter((slot) => splitShotWeaponIds().includes(slot.id));
  if (!slots.length) return;
  const slot = slots[Math.floor(Math.random() * slots.length)];
  slot.projectileBonus = (slot.projectileBonus || 0) + 1;
  slot.splitDamagePenalty = Math.max(slot.splitDamagePenalty || 0, 0.2);
  player.projectileBonus = 0;
  player.splitDamagePenalty = 0;
  recomputeAllWeapons();
}

function splitShotWeaponIds() {
  return ["arc", "ice", "missile", "boomerang", "drone", "prism_railgun", "void_singularity", "tesla_mine_chain", "starfall_scepter", "phase_needler", "echo_tuning_fork", "rift_loom"];
}

function updateAirburst(p, dt) {
  if (!p.airburstInterval) return;
  p.airburstTimer = Math.max(0, (p.airburstTimer || p.airburstInterval) - dt);
  if (p.airburstTimer > 0) return;
  p.airburstTimer += p.airburstInterval;
  const radius = Math.max(320, p.magnet * 2.2);
  let cleared = 0;
  for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
    const b = world.enemyProjectiles[i];
    if (distSq(p.x, p.y, b.x, b.y) > radius * radius) continue;
    world.enemyProjectiles.splice(i, 1);
    cleared++;
    if (cleared <= 18) burst(b.x, b.y, 5, "#9ff4ff", 110);
  }
  if (!cleared) return;
  pulse(p.x, p.y, radius, "#9ff4ff", 0.28);
  world.weaponFx.push({ kind: "shockRing", x: p.x, y: p.y, radius, life: 0.35, maxLife: 0.35, color: "#9ff4ff" });
  state.shake = Math.max(state.shake, 4);
  playSfx("select");
}

function updateBleeds(dt) {
  for (const e of [...world.enemies]) {
    if (!e.bleedTimer || e.dead) continue;
    e.bleedTimer = Math.max(0, e.bleedTimer - dt);
    e.takeDamage?.((e.bleedDps || 0) * dt, e.x, e.y, { statusEffect: "bleed" });
    spawnBleedParticles(e, dt);
    if (e.bleedTimer <= 0) e.bleedDps = 0;
  }
}

function spawnBleedParticles(e, dt) {
  if (Math.random() < dt * 6) {
    const ox = (Math.random() - 0.5) * e.r * 1.4;
    const oy = (Math.random() - 0.5) * e.r * 1.2;
    trail(e.x + ox, e.y + oy, e.x + ox + (Math.random() - 0.5) * 18, e.y + oy + 8 + Math.random() * 14, "#ff4d6d", 4);
  }
  if (Math.random() < dt * 4) {
    particle("spark", e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.45) * e.r, {
      vx: (Math.random() - 0.5) * 34,
      vy: 24 + Math.random() * 42,
      life: 0.22 + Math.random() * 0.18,
      size: 2 + Math.random() * 2,
      color: "#ff4d6d",
      alpha: 0.88,
    });
  }
}

function updateItemObjects(dt) {
  for (let i = world.itemObjects.length - 1; i >= 0; i--) {
    const obj = world.itemObjects[i];
    obj.t = (obj.t || 0) + dt;
    if (obj.kind === "turret") updateTurret(obj, dt);
    else if (obj.kind === "landmine") updateLandmine(obj);
    else if (obj.kind === "fallingStar") updateFallingStar(obj, dt);
    else if (["gravity_anchor", "holo_decoy", "sentry_array", "phase_barricade"].includes(obj.kind)) updateMechanicObject(obj, dt);
    else if (obj.kind === "item_echo") { obj.delay -= dt; if (obj.delay <= 0 && !obj.fired) { obj.fired = true; triggerPulse(obj.x, obj.y, 76, obj.color, obj.damage); obj.life = 0; } }
    if (obj.life !== undefined) {
      obj.life -= dt;
      if (obj.life <= 0) world.itemObjects.splice(i, 1);
    }
  }
}

function updateTurret(turret, dt) {
  turret.cooldown = Math.max(0, (turret.cooldown || 0) - dt);
  const target = nearestWorldEnemy(turret.x, turret.y, turret.range);
  turret.targetAngle = target ? Math.atan2(target.y - turret.y, target.x - turret.x) : (turret.targetAngle || 0) + dt * 0.8;
  if (!target || turret.cooldown > 0) return;
  turret.cooldown = 0.42;
  const damage = 32;
  target.takeDamage?.(damage, target.x, target.y);
  pulse(target.x, target.y, 24, "#42e8ff", 0.16);
  world.weaponFx.push({ kind: "turretBeam", x1: turret.x, y1: turret.y, x2: target.x, y2: target.y, life: 0.12, maxLife: 0.12, color: "#42e8ff" });
  playSfx("shoot");
}

function updateLandmine(mine) {
  if (mine.triggered) return;
  const target = nearestWorldEnemy(mine.x, mine.y, mine.triggerRadius);
  if (!target) return;
  mine.triggered = true;
  mine.life = 0.42;
  const radius = mine.radius;
  for (const e of world.enemies) {
    if (e.dead || distSq(mine.x, mine.y, e.x, e.y) > (radius + e.r) ** 2) continue;
    e.takeDamage?.(95, mine.x, mine.y);
  }
  burst(mine.x, mine.y, 26, "#ffd166", 260);
  pulse(mine.x, mine.y, radius, "#ff7a2f", 0.34);
  world.weaponFx.push({ kind: "itemMineBlast", x: mine.x, y: mine.y, radius, life: 0.34, maxLife: 0.34, color: "#ff7a2f", seed: Math.random() * 999 });
  state.shake = Math.max(state.shake, 5);
  playSfx("explode");
}

function triggerStarCloak(x, y, stacks) {
  const count = Math.min(18, 5 + stacks * 3);
  for (let i = 0; i < count; i++) {
    const tx = x + (Math.random() - 0.5) * 260;
    const ty = y + (Math.random() - 0.5) * 180;
    const delay = i * 0.025;
    world.itemObjects.push({
      kind: "fallingStar",
      x: tx - 80 + Math.random() * 160,
      y: ty - 360 - Math.random() * 120,
      targetX: tx,
      targetY: ty,
      vx: 0,
      vy: 980 + Math.random() * 180,
      r: 9,
      damage: 42,
      delay,
      life: 1.2,
      maxLife: 1.2,
      color: "#ffd166",
    });
  }
}

export function updateFallingStar(star, dt) {
  star.delay = Math.max(0, (star.delay || 0) - dt);
  if (star.delay > 0) return;
  star.x += (star.targetX - star.x) * Math.min(1, dt * 2.2);
  star.y += star.vy * dt;
  trail(star.x, star.y, star.x - 18, star.y - 44, "#ffd166", 8);
  if (star.y < star.targetY) return;
  star.life = 0;
  for (const e of world.enemies) {
    if (e.dead || distSq(star.targetX, star.targetY, e.x, e.y) > (76 + e.r) ** 2) continue;
    e.takeDamage?.(star.damage, star.targetX, star.targetY);
  }
  burst(star.targetX, star.targetY, 18, "#ffd166", 220);
  pulse(star.targetX, star.targetY, 76, "#ffd166", 0.25);
  world.weaponFx.push({ kind: "starImpact", x: star.targetX, y: star.targetY, radius: 76, life: 0.28, maxLife: 0.28, color: "#ffd166" });
}

function spawnTurret() {
  const p = state.player;
  const pos = randomNearPlayerPosition(90, 220);
  world.itemObjects.push({
    kind: "turret",
    x: pos.x,
    y: pos.y,
    range: 560,
    cooldown: Math.random() * 0.35,
    targetAngle: Math.random() * TAU,
    t: 0,
    color: "#42e8ff",
  });
  pulse(pos.x, pos.y, 48, "#42e8ff", 0.35);
  if (p) burst(pos.x, pos.y, 10, "#42e8ff", 120);
}

function spawnLandmine() {
  const pos = randomArenaPosition();
  world.itemObjects.push({
    kind: "landmine",
    x: pos.x,
    y: pos.y,
    triggerRadius: 58,
    radius: 118,
    t: Math.random() * TAU,
    color: "#ff7a2f",
  });
}

function randomArenaPosition() {
  const half = WORLD_SIZE / 2 - 180;
  const p = state.player;
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const y = (Math.random() * 2 - 1) * half;
    if (!p || distSq(x, y, p.x, p.y) > 260 * 260) return { x, y };
  }
  return { x: (p?.x || 0) + 220, y: p?.y || 0 };
}

function randomNearPlayerPosition(minDist = 80, maxDist = 220) {
  const p = state.player;
  if (!p) return randomArenaPosition();
  const half = WORLD_SIZE / 2 - 120;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * TAU;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = clamp(p.x + Math.cos(angle) * dist, -half, half);
    const y = clamp(p.y + Math.sin(angle) * dist, -half, half);
    return { x, y };
  }
  return { x: clamp(p.x + maxDist, -half, half), y: p.y };
}

function nearestWorldEnemy(x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = distSq(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function updateMechanicObject(obj, dt) {
  if (obj.kind === "gravity_anchor") {
    for (const e of world.enemies) { const dx = obj.x - e.x; const dy = obj.y - e.y; const len = Math.max(1, Math.hypot(dx, dy)); if (len < obj.radius) { e.knockbackX = (e.knockbackX || 0) + dx / len * 55 * dt; e.knockbackY = (e.knockbackY || 0) + dy / len * 55 * dt; } }
  } else if (obj.kind === "holo_decoy") {
    for (const e of world.enemies) if (!e.dead && distSq(obj.x, obj.y, e.x, e.y) < 340 ** 2) { e.itemDecoyX = obj.x; e.itemDecoyY = obj.y; }
    if (obj.life < 0.45 && !obj.detonated) { obj.detonated = true; triggerPulse(obj.x, obj.y, 155, obj.color, 58); }
  } else if (obj.kind === "sentry_array") {
    obj.cooldown = Math.max(0, (obj.cooldown || 0) - dt); const target = nearestWorldEnemy(obj.x, obj.y, 540); if (target && obj.cooldown <= 0) { obj.cooldown = 0.48; target.takeDamage?.(28, obj.x, obj.y); world.weaponFx.push({ kind: "turretBeam", x1: obj.x, y1: obj.y, x2: target.x, y2: target.y, life: 0.12, maxLife: 0.12, color: obj.color }); }
  } else if (obj.kind === "phase_barricade") {
    for (const e of world.enemies) if (!e.dead && distSq(obj.x, obj.y, e.x, e.y) < obj.radius ** 2) { e.frostTimer = Math.max(e.frostTimer || 0, 0.35); e.frostSlow = Math.max(e.frostSlow || 0, 0.45); }
  }
}

function hasItem(id) { return hasInventoryItem(id); }
function activePlayers() { return state.multiplayer?.connected ? [state.player, state.players?.p2].filter(Boolean) : [state.player].filter(Boolean); }
function triggerPulse(x, y, radius, color, damage = 0, knockback = false) {
  pulse(x, y, radius, color, 0.32);
  burst(x, y, 14, color, 180);
  for (const enemy of world.enemies) {
    if (enemy.dead || distSq(x, y, enemy.x, enemy.y) > (radius + enemy.r) ** 2) continue;
    if (damage) enemy.takeDamage?.(damage, x, y);
    if (knockback) { const dx = enemy.x - x; const dy = enemy.y - y; const len = Math.max(1, Math.hypot(dx, dy)); enemy.knockbackX = (enemy.knockbackX || 0) + dx / len * 380; enemy.knockbackY = (enemy.knockbackY || 0) + dy / len * 380; }
  }
}
function addZone(x, y, radius, life, effect, color) { world.itemZones.push({ x, y, radius, life, maxLife: life, effect, color, tick: 0 }); }

function triggerItemEvent(type, ctx = {}) {
  const runtime = state.inventory?.itemRuntime;
  if (!runtime) return;
  const p = ctx.player || state.player;
  if (type === "hit" && ctx.enemy) {
    const e = ctx.enemy;
    if (hasItem("thermal_reactor")) { e.itemHeat = (e.itemHeat || 0) + 1; if (e.itemHeat >= 6) { e.itemHeat = 0; triggerPulse(e.x, e.y, 92, "#ff7a2f", 48); } }
    if (hasItem("resonance_engine")) { e.itemResonance = (e.itemResonance || 0) + 1; if (e.itemResonance >= 5) { e.itemResonance = 0; triggerPulse(e.x, e.y, 120, "#b48cff", 42); } }
    if (hasItem("target_relay") || hasItem("ballistic_loom")) { const near = nearestWorldEnemy(e.x, e.y, 150); if (near && near !== e) { near.takeDamage?.(hasItem("ballistic_loom") ? 18 : 12, e.x, e.y); world.weaponFx.push({ kind: "arc", segments: [{ x1: e.x, y1: e.y, x2: near.x, y2: near.y }], life: 0.12, maxLife: 0.12, color: "#42e8ff" }); } }
    if (hasItem("tractor_warhead")) { const dx = p.x - e.x; const dy = p.y - e.y; const len = Math.max(1, Math.hypot(dx, dy)); e.knockbackX = (e.knockbackX || 0) + dx / len * 120; e.knockbackY = (e.knockbackY || 0) + dy / len * 120; }
    if (hasItem("rift_prism") && Math.random() < 0.12) addZone(e.x, e.y, 76, 2.4, "damage", "#b48cff");
    if (hasItem("echo_magazine") && Math.random() < 0.14) world.itemObjects.push({ kind: "item_echo", x: e.x, y: e.y, delay: 0.36, life: 0.7, damage: 34, color: "#77ff8a" });
  }
  if (type === "kill" && ctx.enemy) {
    const e = ctx.enemy;
    runtime.souls = (runtime.souls || 0) + (hasItem("soul_vessel") ? 1 : 0);
    if (hasItem("corrosion_flask")) addZone(e.x, e.y, 84, 4, "damage", "#a3e635");
    if (hasItem("cryo_prism") && (e.frozenTimer || 0) > 0) triggerPulse(e.x, e.y, 100, "#9ff4ff", 34);
    if (hasItem("plague_beacon")) for (const other of world.enemies) if (!other.dead && distSq(e.x, e.y, other.x, other.y) < 150 ** 2) { other.bleedDps = Math.max(other.bleedDps || 0, 8); other.bleedTimer = Math.max(other.bleedTimer || 0, 2.5); }
    if (hasItem("bounty_scanner") && e.itemBounty) { state.gold += 4; triggerPulse(e.x, e.y, 54, "#ffd166", 0); }
    if (e.itemChallenge) { state.gold += 12; triggerPulse(e.x, e.y, 120, "#ff4d6d", 44); }
    if (hasItem("hunter_protocol") && (e.elite || e.itemBounty)) triggerPulse(e.x, e.y, 180, "#ff4d6d", 52);
  }
  if (type === "damaged") { if (hasItem("crisis_echo")) triggerPulse(p.x, p.y, 118, "#ff8bd8", 30); if (p.hp / p.maxHp < 0.32 && hasItem("emergency_transfer")) triggerPulse(p.x, p.y, 160, "#42e8ff", 18, true); }
  if ((type === "dodge" || type === "shield") && hasItem("reprisal_protocol")) { const target = nearestWorldEnemy(p.x, p.y, 520); if (target) triggerPulse(target.x, target.y, 70, "#ffd166", 38); }
  if (type === "pickup") { if (ctx.kind === "gem" && hasItem("xp_yeast")) { runtime.xpChain = (runtime.xpChain || 0) + 1; if (runtime.xpChain >= 12) { runtime.xpChain = 0; triggerPulse(p.x, p.y, 110, "#77ff8a", 28); } } if (ctx.kind === "coin" && hasItem("gold_alchemy")) { runtime.alchemy = (runtime.alchemy || 0) + ctx.value; if (runtime.alchemy >= 24) { runtime.alchemy = 0; triggerPulse(p.x, p.y, 145, "#ffd166", 48); } } }
  if (type === "waveStart") {
    if (hasItem("gravity_anchor")) spawnMechanicObject("gravity_anchor");
    if (hasItem("holo_decoy")) spawnMechanicObject("holo_decoy");
    if (hasItem("sentry_array")) spawnMechanicObject("sentry_array");
    if (hasItem("phase_barricade")) spawnMechanicObject("phase_barricade");
    if (hasItem("debt_terminal")) { if (!runtime.debtTaken) { state.gold += 24; runtime.debtTaken = true; } else state.gold = Math.max(0, state.gold - 8); }
    if (hasItem("reserve_vault")) runtime.reserveBoost = Math.min(0.4, state.gold / 600);
    if (hasItem("gambler_core")) runtime.gamble = ["haste", "guard", "power"][Math.floor(Math.random() * 3)];
    if (hasItem("soul_vessel") && runtime.souls >= 8) { activePlayers().forEach((player) => player.currentWaveShields = (player.currentWaveShields || 0) + 1); runtime.souls = 0; }
    if (hasItem("bounty_scanner")) { const target = world.enemies.find((enemy) => !enemy.dead && !enemy.boss); if (target) target.itemBounty = true; }
  }
}

function spawnMechanicObject(kind) { const pos = randomNearPlayerPosition(140, 260); world.itemObjects.push({ kind, x: pos.x, y: pos.y, life: kind === "phase_barricade" ? 7 : 12, maxLife: kind === "phase_barricade" ? 7 : 12, t: 0, color: kind === "gravity_anchor" ? "#b48cff" : kind === "holo_decoy" ? "#ff8bd8" : "#42e8ff", radius: kind === "gravity_anchor" ? 190 : kind === "phase_barricade" ? 140 : 110 }); }

function updateMechanicItems(dt) {
  const runtime = state.inventory?.itemRuntime;
  const p = state.player;
  if (!runtime || !p) return;
  runtime.activeCooldowns ||= {};
  for (const key of Object.keys(runtime.activeCooldowns)) runtime.activeCooldowns[key] = Math.max(0, runtime.activeCooldowns[key] - dt);
  runtime.overloadTimer = Math.max(0, (runtime.overloadTimer || 0) - dt);
  runtime.timer = (runtime.timer || 0) + dt;
  if (hasItem("afterimage_relay") && Math.hypot(p.slideVx || 0, p.slideVy || 0) > 80 && Math.floor(runtime.timer * 2) !== Math.floor((runtime.timer - dt) * 2)) addZone(p.x - p.dirX * 34, p.y - p.dirY * 34, 52, 1.2, "damage", "#ff8bd8");
  if (hasItem("kinetic_capacitor") && Math.hypot(p.slideVx || 0, p.slideVy || 0) > 30) { runtime.kinetic = Math.min(1, (runtime.kinetic || 0) + dt * 0.34); if (runtime.kinetic >= 1) { runtime.kinetic = 0; triggerPulse(p.x, p.y, 135, "#ffd166", 42); } }
  if (hasItem("static_barrier") && Math.floor(runtime.timer * 2) !== Math.floor((runtime.timer - dt) * 2)) triggerPulse(p.x, p.y, 58, "#42e8ff", 14, true);
  if (hasItem("mirror_array") && Math.floor(runtime.timer / 8) !== Math.floor((runtime.timer - dt) / 8)) { let cleared = 0; for (let i = world.enemyProjectiles.length - 1; i >= 0 && cleared < 12; i--) { const b = world.enemyProjectiles[i]; if (distSq(p.x, p.y, b.x, b.y) < 320 ** 2) { world.enemyProjectiles.splice(i, 1); cleared++; } } if (cleared) triggerPulse(p.x, p.y, 180, "#9ff4ff", cleared * 4); }
  if (hasItem("absorption_lattice") && world.enemyProjectiles.length < (runtime.lastProjectileCount ?? world.enemyProjectiles.length) && Math.floor(runtime.timer * 2) !== Math.floor((runtime.timer - dt) * 2)) activePlayers().forEach((player) => player.currentWaveShields = Math.min(3, (player.currentWaveShields || 0) + 1));
  runtime.lastProjectileCount = world.enemyProjectiles.length;
  if (hasItem("reclaimer_drone")) { for (const list of [world.gems, world.coins]) for (const d of list) { const dx = p.x - d.x; const dy = p.y - d.y; const len = Math.max(1, Math.hypot(dx, dy)); if (len < 720) { d.x += dx / len * dt * 240; d.y += dy / len * dt * 240; } } }
  if (hasItem("orbit_deflector") && Math.floor(runtime.timer * 1.5) !== Math.floor((runtime.timer - dt) * 1.5)) triggerPulse(p.x, p.y, 92, "#77ff8a", 18);
  if (hasItem("near_miss_coil")) { const near = world.enemyProjectiles.some((b) => distSq(p.x, p.y, b.x, b.y) < 58 ** 2); if (near) runtime.nearMiss = Math.min(5, (runtime.nearMiss || 0) + dt * 2); if ((runtime.nearMiss || 0) >= 5) { runtime.nearMiss = 0; triggerPulse(p.x, p.y, 170, "#ffd166", 48); } }
  if (hasItem("polarity_inverter") && Math.floor(runtime.timer / 10) !== Math.floor((runtime.timer - dt) / 10)) { for (const list of [world.gems, world.coins]) for (const d of list) { d.x += (p.x - d.x) * 0.45; d.y += (p.y - d.y) * 0.45; } triggerPulse(p.x, p.y, 130, "#b48cff", 20); }
  if (hasItem("supply_signal") && p.hp / p.maxHp < 0.35 && !runtime.supplyTimer) { runtime.supplyTimer = 18; restorePlayerHealth(p, 26); triggerPulse(p.x, p.y, 90, "#77ff8a", 0); } runtime.supplyTimer = Math.max(0, (runtime.supplyTimer || 0) - dt);
  if (hasItem("bounty_scanner") && Math.floor(runtime.timer / 7) !== Math.floor((runtime.timer - dt) / 7)) { const target = world.enemies.filter((e) => !e.dead && !e.itemBounty).sort((a, b) => (b.hp || 0) - (a.hp || 0))[0]; if (target) target.itemBounty = true; }
  if (hasItem("challenge_beacon") && !runtime.challengeDone && world.enemies.length >= 8) { const target = world.enemies.filter((e) => !e.dead && !e.boss).sort((a, b) => (b.hp || 0) - (a.hp || 0))[0]; if (target) { target.itemChallenge = true; target.hp *= 1.7; target.maxHp *= 1.7; runtime.challengeDone = true; pulse(target.x, target.y, 100, "#ff4d6d", 0.4); } }
  for (let i = world.itemZones.length - 1; i >= 0; i--) { const z = world.itemZones[i]; z.life -= dt; z.tick += dt; if (z.tick > 0.32) { z.tick = 0; for (const e of world.enemies) if (!e.dead && distSq(z.x, z.y, e.x, e.y) < (z.radius + e.r) ** 2) { if (z.effect === "stasis") { e.frostTimer = Math.max(e.frostTimer || 0, 0.5); e.frostSlow = Math.max(e.frostSlow || 0, 0.55); } else e.takeDamage?.(22, z.x, z.y); } } if (z.life <= 0) world.itemZones.splice(i, 1); }
}

function recordItem(item, quality, qty) {
  const inv = state.inventory;
  if (!inv) return;
  const id = `${item.id}_${quality}`;
  const existing = inv.items.find((entry) => entry.id === id);
  const qualityInfo = QUALITY_INFO[quality] || QUALITY_INFO.common;
  if (existing) existing.qty = item.unique ? 1 : existing.qty + qty;
  else inv.items.push({ id, itemId: item.id, quality, name: item.singleQuality ? item.name : `${qualityInfo.name}${item.name}`, icon: item.icon, qty: item.unique ? 1 : qty, desc: itemDescription(item, quality) });
  recordCodexEntry("items", item.id);
}

function qualityValue(id, quality) {
  const values = QUALITY_VALUES[id];
  return values?.[qualityRank(quality)] ?? 0;
}

function qualityScale(quality) {
  return QUALITY_SCALE[quality] || 1;
}

function qualityRank(quality) {
  return Math.max(0, QUALITY_ORDER.indexOf(quality || "common"));
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
