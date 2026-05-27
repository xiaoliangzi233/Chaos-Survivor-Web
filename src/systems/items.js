import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { distSq, clamp } from "../utils.js";
import { burst, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { QUALITY_INFO, QUALITY_ORDER } from "../economy/inventory.js";

const QUALITY_VALUES = {
  healing_potion: [20, 30, 50, 80, 120],
  healing_aura: [1, 3, 5, 10, 15],
};

const QUALITY_SCALE = {
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.8,
  legendary: 2.3,
};

export const ITEM_DEFS = [
  { id: "heart_container", icon: "♡", name: "心之容器", basePrice: 22, desc: "最大生命值 +20。", apply: ({ player }) => { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); } },
  { id: "healing_potion", icon: "✚", name: "治疗药水", basePrice: 12, desc: "立即恢复生命值，品质越高恢复越多。", apply: ({ player, quality }) => { player.hp = Math.min(player.maxHp, player.hp + qualityValue("healing_potion", quality)); } },
  { id: "shackles", icon: "⌁", name: "脚镣", basePrice: 20, desc: "移动速度降低，攻击范围提高。", apply: ({ player, scale }) => { player.speed -= 12; player.attackRangeBonus += Math.round(80 * scale); } },
  { id: "dodge_cloak", icon: "◒", name: "闪避斗篷", basePrice: 24, desc: "闪避率 +5%，最大生命值 -20。", apply: ({ player }) => { player.dodge = clamp(player.dodge + 0.05, 0, 0.7); player.maxHp = Math.max(30, player.maxHp - 20); player.hp = Math.min(player.hp, player.maxHp); } },
  { id: "bait", icon: "※", name: "诱饵", basePrice: 16, desc: "下一波敌人增加 50%。", apply: ({ player }) => { player.nextWaveSpawnBonus += 0.5; } },
  { id: "magnet", icon: "◎", name: "磁铁", basePrice: 18, desc: "金币和经验吸收范围提高。", apply: ({ player, scale }) => { player.magnet += Math.round(32 * scale); } },
  { id: "speed_boots", icon: "»", name: "速度靴", basePrice: 20, desc: "移动速度提高。", apply: ({ player, scale }) => { player.speed += Math.round(18 * scale); } },
  { id: "rapid_cord", icon: "⟲", name: "速射索", basePrice: 28, desc: "攻击速度提高。", apply: ({ player, scale }) => { player.attackSpeedBonus += 0.12 * scale; } },
  { id: "fang", icon: "⋏", name: "尖牙", basePrice: 30, desc: "攻击会让敌人流血，持续掉血。", apply: ({ player, scale }) => { player.bleedDps += 7 * scale; player.bleedDuration = Math.max(player.bleedDuration, 2.8); } },
  { id: "split_shot", icon: "≋", name: "分裂弹", basePrice: 34, desc: "投射物 +1，但武器伤害降低 15%。无人机也会增加额外投射物。", apply: ({ player }) => { player.projectileBonus += 1; player.splitDamagePenalty += 0.15; } },
  { id: "lucky_clover", icon: "♣", name: "幸运草", basePrice: 26, desc: "幸运值提高，商店更容易出现高品质商品。", apply: ({ player, scale }) => { player.luck += Math.round(10 * scale); } },
  { id: "gloves", icon: "▣", name: "拳套", basePrice: 24, desc: "暴击率提高。", apply: ({ player, scale }) => { player.critChance = clamp(player.critChance + 0.07 * scale, 0, 0.7); } },
  { id: "knife", icon: "†", name: "小刀", basePrice: 25, desc: "攻击伤害提高。", apply: ({ player, scale }) => { player.damageScale += 0.08 * scale; } },
  { id: "healing_aura", icon: "✺", name: "治愈光环", basePrice: 32, desc: "每秒生命回复提高，品质越高回复越强。", apply: ({ player, quality }) => { player.regen += qualityValue("healing_aura", quality); } },
  { id: "tardigrade", icon: "⬡", name: "水熊虫", basePrice: 30, desc: "每波免疫一次攻击伤害，可叠加次数。", apply: ({ player }) => { player.waveShields += 1; player.currentWaveShields += 1; } },
  { id: "heavy_armor", icon: "▰", name: "重甲", basePrice: 28, desc: "防御值提高，移动速度降低。", apply: ({ player, scale }) => { player.defense += Math.round(8 * scale); player.speed -= 10; } },
  { id: "turret", icon: "♜", name: "炮塔", basePrice: 38, desc: "每波随机部署一座自动炮塔。", apply: ({ player }) => { player.turretCount += 1; } },
  { id: "thief_mark", icon: "¢", name: "窃贼印记", basePrice: 24, desc: "敌人金币掉落 +20%，但被攻击时会扣除金币。", apply: ({ player }) => { player.coinDropBonus += 0.2; player.goldLossOnHit += 0.06; } },
  { id: "star_cloak", icon: "✦", name: "星星斗篷", basePrice: 36, desc: "被攻击时召唤星雨反击敌人。", apply: ({ player }) => { player.starCloak += 1; } },
  { id: "landmine", icon: "◈", name: "地雷", basePrice: 32, desc: "每波随机生成 3 个地雷，可叠加。", apply: ({ player }) => { player.landminePacks += 1; } },
];

export function applyItemPurchase(offer) {
  const item = ITEM_DEFS.find((entry) => entry.id === offer.itemId || entry.id === offer.id);
  if (!item || !state.player) return;
  const quality = offer.rarity || "common";
  const scale = qualityScale(quality);
  item.apply?.({ player: state.player, quality, scale });
  recordItem(item, quality, offer.quantity || 1);
  pulse(state.player.x, state.player.y, 54, QUALITY_INFO[quality]?.color || "#77ff8a", 0.32);
}

export function updateItems(dt) {
  const p = state.player;
  if (!p) return;
  if (p.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
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

export function modifyWeaponDamage(amount) {
  const p = state.player;
  const penalty = Math.min(0.75, p?.splitDamagePenalty || 0);
  const crit = Math.random() < clamp(p?.critChance || 0, 0, 0.7) ? 1.85 : 1;
  return amount * Math.max(0.25, 1 - penalty) * crit;
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

function updateBleeds(dt) {
  for (const e of [...world.enemies]) {
    if (!e.bleedTimer || e.dead) continue;
    e.bleedTimer = Math.max(0, e.bleedTimer - dt);
    e.takeDamage?.((e.bleedDps || 0) * dt, e.x, e.y);
    if (Math.random() < dt * 5) trail(e.x, e.y, e.x + (Math.random() - 0.5) * 18, e.y + (Math.random() - 0.5) * 18, "#ff4d6d", 4);
    if (e.bleedTimer <= 0) e.bleedDps = 0;
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
  const pos = randomArenaPosition();
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
  if (existing) existing.qty += qty;
  else inv.items.push({ id, itemId: item.id, quality, name: `${qualityInfo.name}${item.name}`, icon: item.icon, qty, desc: item.desc });
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
