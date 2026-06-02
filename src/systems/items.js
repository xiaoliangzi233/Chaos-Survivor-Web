import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { distSq, clamp } from "../utils.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { QUALITY_INFO, QUALITY_ORDER, recomputeAllWeapons } from "../economy/inventory.js";
import { recordCodexEntry } from "./codex.js";
import { ITEM_DATA_DEFS, onEditableDataChanged } from "../config/editableGameData.js";

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
  heart_container: ({ player, quality }) => { const value = qualityValue("heart_container", quality); player.maxHp += value; player.hp = Math.min(player.maxHp, player.hp + value); },
  healing_potion: ({ player, quality }) => { player.hp = Math.min(player.maxHp, player.hp + qualityValue("healing_potion", quality)); },
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
  pulse(state.player.x, state.player.y, 54, QUALITY_INFO[quality]?.color || "#77ff8a", 0.32);
}

export function updateItems(dt) {
  const p = state.player;
  if (!p) return;
  if (p.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  updateAirburst(p, dt);
  updateBleeds(dt);
  updateItemObjects(dt);
}

export function startWaveItems() {
  const p = state.player;
  if (!p) return;
  p.currentWaveShields = p.waveShields || 0;
  world.itemObjects.length = 0;
  for (let i = 0; i < (p.turretCount || 0); i++) spawnTurret();
  for (let i = 0; i < (p.landminePacks || 0) * 3; i++) spawnLandmine();
}

export function applyPlayerDamage(amount, source = {}) {
  const p = state.player;
  if (!p || amount <= 0) return { damaged: false, amount: 0 };
  if (amount < 1) {
    const reducedTick = Math.max(0.05, amount - (p.defense || 0) * 0.016);
    p.hp -= reducedTick;
    return { damaged: true, amount: reducedTick };
  }
  if (Math.random() < clamp(p.dodge || 0, 0, 0.7)) {
    pulse(p.x, p.y, 44, "#b48cff", 0.22);
    playSfx("select");
    return { damaged: false, dodged: true, amount: 0 };
  }
  if ((p.currentWaveShields || 0) > 0) {
    p.currentWaveShields--;
    pulse(p.x, p.y, 62, "#ffd166", 0.28);
    burst(p.x, p.y, 16, "#ffd166", 180);
    playSfx("select");
    return { damaged: false, shielded: true, amount: 0 };
  }
  const reduced = Math.max(1, amount - (p.defense || 0));
  p.hp -= reduced;
  if ((p.goldLossOnHit || 0) > 0 && state.gold > 0) {
    state.gold = Math.max(0, state.gold - Math.max(1, Math.ceil(state.gold * p.goldLossOnHit)));
  }
  if ((p.starCloak || 0) > 0) triggerStarCloak(source.x ?? p.x, source.y ?? p.y, p.starCloak);
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
  return { amount: amount * Math.max(0.25, 1 - penalty) * crit, critical };
}

export function weaponRangeBonus() {
  return state.player?.attackRangeBonus || 0;
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
