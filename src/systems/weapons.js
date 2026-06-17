import { PROJECTILE_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { addCameraShake, input, state, world } from "../state.js";
import { angleDiff, circleHit, clamp, distSq } from "../utils.js";
import { applyKnockback, damageEnemy, nearestEnemy, queryEnemies } from "./entities.js";
import { burst, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { ui } from "../ui/ui.js";
import { addWeaponToInventory, QUALITY_INFO, QUALITY_ORDER, WEAPON_INFO } from "../economy/inventory.js";
import { attackSpeedMultiplier, weaponProjectileBonus, weaponRangeBonus, weaponRangeScale } from "./items.js";

// --- Manual mode helpers ---
function weaponSlotIndexForId(weaponId) {
  const inv = state.inventory;
  if (!inv) return -1;
  return inv.weaponSlots.findIndex(function(s) { return s.id === weaponId; });
}
function isManualPrimaryById(weaponId) {
  if (state.controlMode !== "manual" || weaponId === "drone") return false;
  const inv = state.inventory;
  if (!inv || state.manualPrimaryIndex == null) return false;
  const primarySlot = inv.weaponSlots[state.manualPrimaryIndex];
  return primarySlot && primarySlot.id === weaponId;
}

function manualDamageScale(weaponId) {
  if (state.controlMode !== "manual") return 1;
  if (weaponId === "drone") return 1;
  const inv = state.inventory;
  if (!inv || state.manualPrimaryIndex == null) return 1;
  const primarySlot = inv.weaponSlots[state.manualPrimaryIndex];
  if (primarySlot && primarySlot.id === weaponId) return 1.5;
  return 0.5;
}
function getManualAimAngle() {
  if (!input.mouseX && !input.mouseY) return null;
  var camX = state.cameraX || 0;
  var camY = state.cameraY || 0;
  var zoom = 1.28;
  var canvasW = ui.canvas ? ui.canvas.clientWidth : window.innerWidth;
  var canvasH = ui.canvas ? ui.canvas.clientHeight : window.innerHeight;
  var worldX = camX + (input.mouseX - canvasW / 2) / zoom;
  var worldY = camY + (input.mouseY - canvasH / 2) / zoom;
  return Math.atan2(worldY - state.player.y, worldX - state.player.x);
}
function getManualAimWorldPos() {
  if (!input.mouseX && !input.mouseY) return null;
  var camX = state.cameraX || 0;
  var camY = state.cameraY || 0;
  var zoom = 1.28;
  var canvasW = ui.canvas ? ui.canvas.clientWidth : window.innerWidth;
  var canvasH = ui.canvas ? ui.canvas.clientHeight : window.innerHeight;
  return {
    x: camX + (input.mouseX - canvasW / 2) / zoom,
    y: camY + (input.mouseY - canvasH / 2) / zoom
  };
}
// --- End manual mode helpers ---
const STARTER_WEAPON_IDS = ["arc", "ice", "missile", "boomerang", "drone", "prism_railgun", "void_singularity", "tesla_mine_chain", "starfall_scepter", "phase_needler", "echo_tuning_fork", "rift_loom"];

export const STARTER_WEAPONS = [];
export function refreshStarterWeapons() {
  STARTER_WEAPONS.length = 0;
  STARTER_WEAPONS.push(...STARTER_WEAPON_IDS.map((id) => ({ id, ...WEAPON_INFO[id] })));
}
refreshStarterWeapons();

export const UPGRADE_DEFS = [
  {
    id: "vital_core",
    icon: "H",
    name: "生命核心",
    stat: "生存",
    amount: "+10 最大生命 / +40 治疗",
    desc: "最大生命提高，并立即恢复一段生命。",
    apply: () => {
      state.player.maxHp += 10;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 40);
    },
  },
  {
    id: "regen_cell",
    icon: "+",
    name: "再生细胞",
    stat: "恢复",
    amount: "+1/s 回血",
    desc: "获得稳定生命回复，适合长波次消耗战。",
    apply: () => {
      state.player.regen += 1;
    },
  },
  {
    id: "phase_stride",
    icon: ">",
    name: "相位步",
    stat: "机动",
    amount: "+10 移速 / +10 拾取",
    desc: "移动速度提高，拾取半径小幅扩大。",
    apply: () => {
      state.player.speed += 10;
      state.player.magnet += 10;
    },
  },
  {
    id: "magnet_field",
    icon: "O",
    name: "磁场扩容",
    stat: "拾取",
    amount: "+20 拾取半径",
    desc: "显著扩大经验和金币的吸附范围。",
    apply: () => {
      state.player.magnet += 20;
    },
  },
  {
    id: "damage_matrix",
    icon: "X",
    name: "裂解矩阵",
    stat: "伤害",
    amount: "+6% 伤害",
    desc: "所有武器基础伤害提高。",
    apply: () => {
      state.player.damageScale += 0.06;
    },
  },
  {
    id: "overclock",
    icon: "R",
    name: "超频扳机",
    stat: "攻速",
    amount: "+5% 攻击速度",
    desc: "缩短所有武器冷却，让火力更密集。",
    apply: () => {
      state.player.attackSpeedBonus += 0.05;
    },
  },
  {
    id: "scope_lens",
    icon: "L",
    name: "远距透镜",
    stat: "射程",
    amount: "+24 攻击范围",
    desc: "提升自动索敌和武器攻击范围。",
    apply: () => {
      state.player.attackRangeBonus += 24;
    },
  },
  {
    id: "crit_kernel",
    icon: "*",
    name: "暴击内核",
    stat: "暴击",
    amount: "+2% 暴击率",
    desc: "提高所有武器造成暴击的概率。",
    apply: () => {
      state.player.critChance = clamp(state.player.critChance + 0.02, 0, 0.7);
    },
  },
  {
    id: "armor_plate",
    icon: "#",
    name: "装甲插板",
    stat: "防御",
    amount: "+2 防御",
    desc: "降低受到的直接伤害。",
    apply: () => {
      state.player.defense += 2;
    },
  },
  {
    id: "evasion_ghost",
    icon: "~",
    name: "残影回避",
    stat: "闪避",
    amount: "+2% 闪避率",
    desc: "提高完全躲开一次伤害的概率。",
    apply: () => {
      state.player.dodge = clamp(state.player.dodge + 0.02, 0, 0.7);
    },
  },
  {
    id: "lucky_cache",
    icon: "$",
    name: "幸运缓存",
    stat: "幸运",
    amount: "+4 幸运",
    desc: "提高商店高品质商品出现概率。",
    apply: () => {
      state.player.luck += 4;
    },
  },
];

export function activateWeapon(id) {
  return Boolean(addWeaponToInventory(id));
}

export function updateWeapons(dt) {
  updateArcWeapon(dt);
  updateIceWeapon(dt);
  updateMissileWeapon(dt);
  updateBoomerangWeapon(dt);
  updateDroneWeapon(dt);
  updatePrismRailgunWeapon(dt);
  updateVoidSingularityWeapon(dt);
  updateTeslaMineChainWeapon(dt);
  updateTeslaNodes(dt);
  updateStarfallScepterWeapon(dt);
  updatePhaseNeedlerWeapon(dt);
  updateEchoTuningForkWeapon(dt);
  updateRiftLoomWeapon(dt);
  updateProjectiles(dt);
  updateWeaponFx(dt);
}

function qualityRank(w) {
  return Math.max(0, QUALITY_ORDER.indexOf(w?.quality || "common"));
}

function qualityRankOf(quality) {
  return Math.max(0, QUALITY_ORDER.indexOf(quality || "common"));
}

function qualityColor(w, fallback = "#42e8ff") {
  return qualityColorOf(w?.quality, fallback);
}

function qualityColorOf(quality, fallback = "#42e8ff") {
  return !quality || quality === "common" ? fallback : QUALITY_INFO[quality]?.color || fallback;
}

function weaponPower(w, value) {
  return value * (w.qualityMult || 1) * weaponSplitDamageMultiplier(w);
}

function weaponSplitDamageMultiplier(w) {
  return Math.max(0.25, 1 - Math.min(0.75, w?.splitDamagePenalty || 0));
}

function weaponSplitBonus(w) {
  return Math.max(0, weaponProjectileBonus(w));
}

function effectiveWeaponRange(baseRange) {
  return Math.max(80, (baseRange || 0) * weaponRangeScale() + weaponRangeBonus());
}

function weaponQualityAt(w, index) {
  const qualities = w?.slotQualities || [];
  return index < qualities.length ? qualities[index] : w?.quality || "common";
}

function weaponViewForQuality(w, quality) {
  return { ...w, quality, qualityMult: QUALITY_INFO[quality]?.mult || 1 };
}

function updateArcWeapon(dt) {
  const w = state.weapons.arc;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("arc");
  const useManualTick = manual ? tickWeaponManual(w, dt, "arc") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("arc");
  const aimAngle = manual ? getManualAimAngle() : null;
  var first;
  if (manual && aimAngle != null) {
    var hits = [];
    queryEnemies(p.x, p.y, effectiveWeaponRange(w.range), hits);
    var bestD = 1e9;
    for (var i = 0; i < hits.length; i++) {
      var e = hits[i];
      var a = Math.atan2(e.y - p.y, e.x - p.x);
      var diff = Math.abs(angleDiff(a, aimAngle));
      if (diff < 0.35 && distSq(p.x, p.y, e.x, e.y) < bestD) {
        bestD = distSq(p.x, p.y, e.x, e.y);
        first = e;
      }
    }
  } else {
    first = nearestEnemy(p.x, p.y, effectiveWeaponRange(w.range));
  }
  if (!first) return;

  const rank = qualityRank(w);
  const color = qualityColor(w, "#42e8ff");
  const visited = new Set();
  const segments = [];
  let source = { x: p.x, y: p.y };
  let target = first;
  let damage = weaponPower(w, w.damage) * dmgScale;
  const chains = w.chains + (rank >= 1 ? 1 : 0) + weaponSplitBonus(w);

  for (let i = 0; i < chains && target; i++) {
    visited.add(target);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    segments.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, seed: Math.random() * 999, index: i, power: damage / Math.max(1, weaponPower(w, w.damage)) });
    damageEnemy(target, damage, target.x, target.y);
    applyKnockback(target, dx, dy, 70);
    burst(target.x, target.y, 6, color, 150);
    if (rank >= 2) arcMicroBurst(target, damage * 0.22, color, visited);
    if (rank >= 3 && i === 0) arcShockBurst(target, damage * 0.34, color);
    source = target;
    damage *= w.falloff;
    target = nextChainTarget(source, w.chainRange + weaponRangeBonus() * 0.35, visited);
  }

  if (segments.length) addCameraShake(Math.min(3.2, 0.8 + segments.length * 0.35));
  if (rank >= 4 && segments.length) arcPrismBurst(source, damage * 0.52, color, visited);
  world.weaponFx.push({ kind: "arc", segments, life: 0.18, maxLife: 0.18, color });
  pulse(first.x, first.y, rank >= 3 ? 42 : 30, color, 0.12);
  playSfx("shoot");
}

function arcMicroBurst(source, damage, color, visited) {
  const hits = [];
  queryEnemies(source.x, source.y, 86, hits);
  let count = 0;
  for (const e of hits) {
    if (count >= 2 || visited.has(e) || e.dead) continue;
    visited.add(e);
    count++;
    damageEnemy(e, damage, source.x, source.y);
    applyKnockback(e, e.x - source.x, e.y - source.y, 54);
    world.weaponFx.push({
      kind: "arc",
      segments: [{ x1: source.x, y1: source.y, x2: e.x, y2: e.y, seed: Math.random() * 999, index: count, power: 0.45 }],
      life: 0.12,
      maxLife: 0.12,
      color,
    });
  }
}

function arcShockBurst(source, damage, color) {
  const hits = [];
  queryEnemies(source.x, source.y, 96, hits);
  for (const e of hits) {
    if (e.dead) continue;
    damageEnemy(e, damage, source.x, source.y);
    applyKnockback(e, e.x - source.x, e.y - source.y, 118);
  }
  world.weaponFx.push({ kind: "shockRing", x: source.x, y: source.y, radius: 96, life: 0.28, maxLife: 0.28, color });
}

function arcPrismBurst(source, damage, color, visited) {
  const hits = [];
  queryEnemies(source.x, source.y, 150, hits);
  const points = [];
  let count = 0;
  for (const e of hits) {
    if (count >= 3 || visited.has(e) || e.dead) continue;
    count++;
    damageEnemy(e, damage, source.x, source.y);
    applyKnockback(e, e.x - source.x, e.y - source.y, 72);
    points.push({ x: e.x, y: e.y });
  }
  if (points.length) world.weaponFx.push({ kind: "prismBurst", x: source.x, y: source.y, points, life: 0.24, maxLife: 0.24, color });
}

function nextChainTarget(source, range, visited) {
  const hits = [];
  queryEnemies(source.x, source.y, range, hits);
  let best = null;
  let bestD = range * range;
  for (const e of hits) {
    if (visited.has(e) || e.dead) continue;
    const d = distSq(source.x, source.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function updateIceWeapon(dt) {
  const w = state.weapons.ice;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("ice");
  const useManualTick = manual ? tickWeaponManual(w, dt, "ice") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("ice");
  var base;
  if (manual) {
    var aim = getManualAimAngle();
    base = aim != null ? aim : Math.atan2(p.dirY, p.dirX);
  } else {
    const target = nearestEnemy(p.x, p.y, effectiveWeaponRange(w.range));
    base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  }
  const rank = qualityRank(w);
  const count = w.count + (rank >= 1 ? 1 : 0) + weaponProjectileBonus(w);
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const shotRank = qualityRank(shot);
    const color = qualityColor(shot, "#9ff4ff");
    fireProjectile(base + (i - (count - 1) / 2) * 0.24, w, {
      shape: "ice",
      variant: shotRank >= 2 ? "iceShard" : "ice",
      quality,
      color,
      tracking: manual ? false : true,
      turnSpeed: w.turnSpeed,
      pierce: shotRank >= 3 ? 2 : 1,
      radius: shotRank >= 1 ? 5.8 : 5,
      life: 2.4,
      freezeDuration: w.freezeDuration + shotRank * 0.05,
      knockback: 92,
      iceRing: shotRank >= 2,
      frostZone: shotRank >= 4,
      damage: weaponPower(shot, w.damage) * dmgScale,
    });
  }
  playSfx("shoot");
}

function updateMissileWeapon(dt) {
  const w = state.weapons.missile;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("missile");
  const useManualTick = manual ? tickWeaponManual(w, dt, "missile") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("missile");
  const rank = qualityRank(w);
  const color = qualityColor(w, "#ffb347");
  var base;
  if (manual) {
    var aim = getManualAimAngle();
    base = aim != null ? aim : Math.atan2(p.dirY, p.dirX);
  } else {
    const target = nearestEnemy(p.x, p.y, effectiveWeaponRange(w.range));
    base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  }
  const count = 1 + weaponProjectileBonus(w);
  for (let i = 0; i < count; i++) {
    fireProjectile(base + (i - (count - 1) / 2) * 0.18, w, {
      shape: "missile",
      variant: rank >= 4 ? "legendMissile" : rank >= 1 ? "burnMissile" : "missile",
      quality: w.quality,
      color,
      tracking: manual ? false : true,
      turnSpeed: w.turnSpeed,
      pierce: 1,
      radius: rank >= 1 ? 7 : 6,
      life: 18,
      noLifeExpire: true,
      explodeRadius: w.explodeRadius + (rank >= 1 ? 12 : 0),
      explodeDamage: w.explodeDamage,
      knockback: 145,
      splitOnHit: rank >= 2 ? 2 : 0,
      secondaryBurst: rank >= 3 ? 1 : 0,
      microMissiles: rank >= 4 ? 3 : 0,
      damage: weaponPower(w, w.damage) * dmgScale,
    });
  }
  playSfx("shoot");
}

function updateBoomerangWeapon(dt) {
  const w = state.weapons.boomerang;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("boomerang");
  const useManualTick = manual ? tickWeaponManual(w, dt, "boomerang") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("boomerang");
  var base;
  if (manual) {
    var aim = getManualAimAngle();
    base = aim != null ? aim : Math.atan2(p.dirY, p.dirX);
  } else {
    const target = nearestEnemy(p.x, p.y, effectiveWeaponRange(w.range));
    base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  }
  const count = w.count + weaponProjectileBonus(w);
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const shotRank = qualityRank(shot);
    const color = qualityColor(shot, "#ff65d8");
    fireProjectile(base + (i - (count - 1) / 2) * 0.34, w, {
      shape: "boomerang",
      variant: shotRank >= 1 ? "dualBoomerang" : "boomerang",
      quality,
      color,
      returning: true,
      returnAfter: w.returnAfter + (shotRank >= 1 ? 0.18 : 0),
      returnSpeed: w.returnSpeed,
      pierce: 7 + (shotRank >= 2 ? 2 : 0),
      radius: shotRank >= 1 ? 8 : 7,
      speed: w.speed,
      life: shotRank >= 4 ? 3.2 : 2.35,
      knockback: shotRank >= 2 ? 154 : 118,
      farBurst: shotRank >= 3,
      returnBounceLeft: shotRank >= 4 ? 1 : 0,
      chainHitsLeft: weaponSplitBonus(w),
      damage: weaponPower(shot, w.damage) * dmgScale,
    });
  }
  playSfx("shoot");
}

function updateDroneWeapon(dt) {
  const w = state.weapons.drone;
  if (!w || w.level <= 0) return;
  const p = state.player;
  const profiles = droneProfiles(w);
  syncDrones(w, profiles);
  w.angle += dt * (1.85 + w.level * 0.12);

  for (let i = 0; i < w.drones.length; i++) {
    const d = w.drones[i];
    const orbitAngle = w.angle + (i / w.drones.length) * TAU;
    const orbitX = p.x + Math.cos(orbitAngle) * w.orbitRadius;
    const orbitY = p.y + Math.sin(orbitAngle) * w.orbitRadius;
    const target = nearestEnemy(d.x, d.y, effectiveWeaponRange(w.acquireRange));
    d.fireTimer = Math.max(0, d.fireTimer - dt);
    d.beamTimer = Math.max(0, (d.beamTimer || 0) - dt);
    d.anim += dt;
    d.energy = Math.min(d.batteryMax, d.energy ?? d.batteryMax);
    d.legendReady = d.legendReady ?? true;

    const shouldRecharge = !target || d.energy < w.shotCost || d.mode === "recharge";
    if (shouldRecharge) {
      d.mode = d.energy >= d.batteryMax && target ? "attack" : "recharge";
      d.targetId = null;
      moveDrone(d, orbitX, orbitY, dt, 460);
      if (distSq(d.x, d.y, orbitX, orbitY) < 28 * 28) {
        d.energy = Math.min(d.batteryMax, d.energy + d.rechargeRate * dt);
        if (d.qualityRank >= 4 && d.energy >= d.batteryMax) d.legendReady = true;
      }
      if (d.energy < d.batteryMax || !target) {
        trail(d.x, d.y, d.prevX, d.prevY, "#ffd166", 5);
        continue;
      }
    }

    if (target && d.energy >= w.shotCost) {
      d.mode = "attack";
      d.targetId = target;
      const desiredX = target.x - Math.cos(orbitAngle) * 92;
      const desiredY = target.y - Math.sin(orbitAngle) * 92;
      moveDrone(d, desiredX, desiredY, dt, 520);
      const attackRange = effectiveWeaponRange(w.attackRange);
      if (d.fireTimer <= 0 && distSq(d.x, d.y, target.x, target.y) <= attackRange * attackRange) {
        d.fireTimer = w.fireCooldown / attackSpeedMultiplier();
        d.energy = Math.max(0, d.energy - w.shotCost);
        const a = Math.atan2(target.y - d.y, target.x - d.x);
        if (d.qualityRank >= 4 && d.legendReady) {
          world.weaponFx.push({ kind: "droneLock", x: d.x, y: d.y, targetX: target.x, targetY: target.y, radius: target.r || 18, color: d.color, life: 0.16, maxLife: 0.16, seed: d.anim || 0 });
          fireDroneBeam(d, target, w, d.color, true);
          d.legendReady = false;
        } else {
          world.weaponFx.push({ kind: "droneLock", x: d.x, y: d.y, targetX: target.x, targetY: target.y, radius: target.r || 18, color: d.color, life: 0.08, maxLife: 0.08, seed: d.anim || 0 });
          fireDroneBullet(d.x, d.y, a, w, d);
          if (d.qualityRank >= 3 && d.beamTimer <= 0) {
            fireDroneBeam(d, target, w, d.color, false);
            d.beamTimer = 1.45;
          }
        }
        world.weaponFx.push({ kind: "muzzle", x: d.x, y: d.y, angle: a, life: 0.1, maxLife: 0.1, color: d.color });
        playSfx("shoot");
      }
    }

    trail(d.x, d.y, d.prevX, d.prevY, d.mode === "attack" ? d.color : "#ffd166", 5);
  }
}

function droneProfiles(w) {
  const qualities = w.slotQualities?.length ? w.slotQualities : Array.from({ length: w.count }, () => w.quality || "common");
  return qualities.map((quality) => {
    const rank = qualityRankOf(quality);
    return {
      quality,
      qualityRank: rank,
      qualityMult: QUALITY_INFO[quality]?.mult || 1,
      color: qualityColorOf(quality, "#77ff8a"),
      batteryMax: w.batteryMax + rank * 10,
      rechargeRate: w.rechargeRate * (1 + rank * 0.12),
    };
  });
}

function syncDrones(w, profiles) {
  const p = state.player;
  while (w.drones.length < profiles.length) {
    const a = w.angle + (w.drones.length / Math.max(1, w.count)) * TAU;
    const profile = profiles[w.drones.length];
    w.drones.push({
      x: p.x + Math.cos(a) * w.orbitRadius,
      y: p.y + Math.sin(a) * w.orbitRadius,
      prevX: p.x,
      prevY: p.y,
      mode: "orbit",
      fireTimer: Math.random() * w.fireCooldown,
      energy: profile.batteryMax,
      anim: Math.random() * TAU,
      targetId: null,
      beamTimer: 0,
      legendReady: true,
    });
  }
  if (w.drones.length > profiles.length) w.drones.length = profiles.length;
  for (let i = 0; i < w.drones.length; i++) {
    const d = w.drones[i];
    Object.assign(d, profiles[i]);
    d.energy = Math.min(d.batteryMax, d.energy ?? d.batteryMax);
  }
}

function moveDrone(d, x, y, dt, speed) {
  d.prevX = d.x;
  d.prevY = d.y;
  const dx = x - d.x;
  const dy = y - d.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const step = Math.min(dist, speed * dt);
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
}

function fireDroneBullet(x, y, angle, w, drone) {
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const linked = randomDroneLinkedWeapon();
  if (linked && fireDroneLinkedWeapon(x, y, angle, w, drone, linked)) return;
  const rank = drone?.qualityRank ?? qualityRank(w);
  const color = drone?.color ?? qualityColor(w, "#77ff8a");
  const quality = drone?.quality || w.quality || "common";
  const qualityMult = drone?.qualityMult || w.qualityMult || 1;
  const speed = w.bulletSpeed;
  const count = 1 + weaponProjectileBonus(w);
  for (let i = 0; i < count; i++) {
    if (world.projectiles.length >= PROJECTILE_LIMIT) return;
    const shotAngle = angle + (i - (count - 1) / 2) * 0.16;
    world.projectiles.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(shotAngle) * speed,
      vy: Math.sin(shotAngle) * speed,
      speed,
      angle: shotAngle,
      damage: w.bulletDamage * qualityMult * weaponSplitDamageMultiplier(w),
      pierce: 1,
      r: 4,
      life: 0.95,
      maxLife: 0.95,
      color,
      shape: "droneBolt",
      variant: rank >= 2 ? "homingDroneBolt" : "droneBolt",
      quality,
      tracking: rank >= 2,
      turnSpeed: rank >= 2 ? 2.6 : 0,
      returning: false,
      returnAfter: 0,
      returnSpeed: 1,
      returnTimer: 0,
      explodeRadius: 0,
      explodeDamage: 0,
      freezeDuration: 0,
      knockback: 86,
      hitIds: new Set(),
      spin: Math.random() * TAU,
      trailTimer: 0,
    });
  }
}

function randomDroneLinkedWeapon() {
  const slots = (state.inventory?.weaponSlots || []).filter((slot) => slot.id !== "drone" && state.weapons?.[slot.id]?.level > 0);
  if (!slots.length) return null;
  return slots[Math.floor(Math.random() * slots.length)];
}

function fireDroneLinkedWeapon(x, y, angle, droneWeapon, drone, slot) {
  const base = state.weapons?.[slot.id];
  if (!base) return false;
  const shot = weaponViewForQuality(base, slot.quality);
  const rank = qualityRank(shot);
  const color = qualityColor(shot, drone?.color || "#77ff8a");
  const source = { x, y };
  const target = nearestEnemy(x, y, effectiveWeaponRange(base.range || droneWeapon.attackRange || 640));
  const aim = target ? Math.atan2(target.y - y, target.x - x) : angle;

  if (slot.id === "void_singularity") {
    fireSingularity(aim, base, shot, rank, color, 0, source, { sourceWeaponId: slot.id });
    return true;
  }
  if (slot.id === "missile") {
    fireProjectile(aim, base, {
      source,
      sourceWeaponId: slot.id,
      shape: "missile",
      variant: rank >= 1 ? "burnMissile" : "missile",
      quality: slot.quality,
      color,
      tracking: true,
      turnSpeed: base.turnSpeed,
      pierce: 1,
      radius: rank >= 1 ? 7 : 6,
      life: 3.2,
      explodeRadius: base.explodeRadius + rank * 8,
      explodeDamage: base.explodeDamage,
      knockback: 125,
      damage: weaponPower(shot, base.damage) * 0.82,
    });
    return true;
  }
  if (slot.id === "ice") {
    fireProjectile(aim, base, {
      source,
      sourceWeaponId: slot.id,
      shape: "ice",
      variant: rank >= 2 ? "iceShard" : "ice",
      quality: slot.quality,
      color,
      tracking: true,
      turnSpeed: base.turnSpeed,
      pierce: rank >= 3 ? 2 : 1,
      radius: 5 + rank * 0.4,
      life: 2,
      freezeDuration: base.freezeDuration,
      knockback: 82,
      damage: weaponPower(shot, base.damage) * 0.78,
    });
    return true;
  }
  if (slot.id === "boomerang") {
    fireProjectile(aim, base, {
      source,
      sourceWeaponId: slot.id,
      shape: "boomerang",
      variant: rank >= 1 ? "dualBoomerang" : "boomerang",
      quality: slot.quality,
      color,
      returning: true,
      returnAfter: base.returnAfter,
      returnSpeed: base.returnSpeed,
      pierce: 4,
      radius: 7 + rank * 0.4,
      speed: base.speed,
      life: 2,
      knockback: 96,
      chainHitsLeft: weaponSplitBonus(base),
      damage: weaponPower(shot, base.damage) * 0.72,
    });
    return true;
  }
  if (slot.id === "phase_needler") {
    firePhaseNeedle(aim, base, shot, rank, color, 0, Math.random().toString(36).slice(2), false, source, slot.id);
    return true;
  }
  if (slot.id === "starfall_scepter" && target) {
    spawnStarfallProjectile(base, shot, rank, color, target.x, target.y, 0, false);
    return true;
  }
  if (slot.id === "tesla_mine_chain" && target) {
    placeTeslaNode(base, shot, rank, color, { x: target.x, y: target.y, angle: aim }, 0, 1, false);
    return true;
  }
  if (slot.id === "rift_loom" && target) {
    spawnRiftLoom(target.x, target.y, base, shot, rank, color, false, 0, 0.72 + weaponSplitBonus(base) * 0.14);
    return true;
  }
  if (slot.id === "echo_tuning_fork") {
    fireEchoCone(aim, base, shot, rank, color, false, 0, 0.72, 1, source, weaponSplitBonus(base), slot.id);
    return true;
  }
  if (slot.id === "prism_railgun" && target) {
    fireDronePrismRail(source, target, base, shot, rank, color, slot.id);
    return true;
  }
  if (slot.id === "arc" && target) {
    damageEnemy(target, weaponPower(shot, base.damage) * 0.7, target.x, target.y);
    world.weaponFx.push({ kind: "arc", segments: [{ x1: x, y1: y, x2: target.x, y2: target.y, seed: Math.random() * 999 }], life: 0.14, maxLife: 0.14, color });
    return true;
  }
  return false;
}

function fireDronePrismRail(source, target, base, shot, rank, color, sourceWeaponId) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const range = Math.min(base.range, Math.max(260, Math.hypot(target.x - source.x, target.y - source.y) + 120));
  const width = base.width + rank * 1.2 + weaponSplitBonus(base) * 6;
  const x2 = source.x + Math.cos(angle) * range;
  const y2 = source.y + Math.sin(angle) * range;
  damageEnemy(target, weaponPower(shot, base.damage) * 0.72, target.x, target.y);
  world.weaponFx.push({ kind: "prismRail", x1: source.x, y1: source.y, x2, y2, width, color, rank, secondary: true, sourceWeaponId, impacts: [{ x: target.x, y: target.y }], life: 0.18, maxLife: 0.18, seed: Math.random() * 999 });
}

function fireDroneBeam(drone, target, w, color, legendary) {
  const damage = w.bulletDamage * (drone.qualityMult || w.qualityMult || 1) * weaponSplitDamageMultiplier(w) * (legendary ? 3.4 : 1.45);
  damageEnemy(target, damage, drone.x, drone.y);
  applyKnockback(target, target.x - drone.x, target.y - drone.y, legendary ? 180 : 95);
  addCameraShake(legendary ? 3.4 : 1.4);
  const hits = [];
  queryEnemies(target.x, target.y, legendary ? 160 : 92, hits);
  let extra = 0;
  for (const e of hits) {
    if (e === target || e.dead || extra >= (legendary ? 4 : 2)) continue;
    extra++;
    damageEnemy(e, damage * 0.38, target.x, target.y);
    applyKnockback(e, e.x - target.x, e.y - target.y, 70);
  }
  world.weaponFx.push({
    kind: "droneBeam",
    x1: drone.x,
    y1: drone.y,
    x2: target.x,
    y2: target.y,
    radius: legendary ? 20 : 12,
    life: legendary ? 0.28 : 0.18,
    maxLife: legendary ? 0.28 : 0.18,
    color,
    legendary,
  });
}


function updatePrismRailgunWeapon(dt) {
  const w = state.weapons.prism_railgun;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("prism_railgun");
  const useManualTick = manual ? tickWeaponManual(w, dt, "prism_railgun") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("prism_railgun");
  const count = Math.max(1, w.count || 1);
  const splitBonus = weaponSplitBonus(w);
  var baseAngles;
  if (manual) {
    var aim = getManualAimAngle();
    if (aim != null) {
      baseAngles = [aim];
      for (var k = 1; k < count; k++) baseAngles.push(aim);
    }
  }
  if (!baseAngles || !baseAngles.length) {
    const targets = choosePrismRailTargets(w, count);
    if (!targets.length) return;
    baseAngles = targets.map(function(t) { return Math.atan2(t.y - p.y, t.x - p.x); });
  }
  let fired = 0;
  for (let i = 0; i < count; i++) {
    const base = baseAngles[i % baseAngles.length];
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#7df9ff");
    const spread = (i - (count - 1) / 2) * 0.055;
    firePrismRail(shot, w, base + spread, color, rank, 1, i, count, false, splitBonus, dmgScale);
    fired++;
    if (rank >= 4) {
      firePrismRail(shot, w, base + spread * 0.45, color, rank, 0.46, i + 0.5, count, true, splitBonus, dmgScale);
      fired++;
    }
  }
  if (fired) {
    addCameraShake(Math.min(7, 2.2 + fired * 0.5));
    playSfx("shoot");
  }
}

function choosePrismRailTargets(w, count) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  const enemies = candidates
    .filter(function(e) { return !e.dead; })
    .map(function(e) { return { enemy: e, angle: Math.atan2(e.y - p.y, e.x - p.x), dist: Math.hypot(e.x - p.x, e.y - p.y) }; })
    .sort(function(a, b) { return a.dist - b.dist; });
  if (!enemies.length) return [];
  const selected = [];
  const minAngle = enemies.length >= count ? 0.42 : 0.18;
  for (var ei = 0; ei < enemies.length; ei++) {
    var entry = enemies[ei];
    if (selected.length >= count) break;
    if (selected.every(function(chosen) { return Math.abs(angleDiff(entry.angle, chosen.angle)) >= minAngle; })) selected.push(entry);
  }
  for (var ej = 0; ej < enemies.length; ej++) {
    var entry2 = enemies[ej];
    if (selected.length >= count) break;
    if (!selected.includes(entry2)) selected.push(entry2);
  }
  return selected.map(function(entry) { return entry.enemy; });
}

function firePrismRail(shot, base, angle, color, rank, damageScale, beamIndex, beamCount, secondary, splitBonus, dmgScale) {
  splitBonus = splitBonus || 0; dmgScale = dmgScale != null ? dmgScale : 1;
  const p = state.player;
  const range = effectiveWeaponRange(base.range);
  const width = (base.width + (rank >= 1 ? 4 : 0) + rank * 1.2 + splitBonus * 6) * (secondary ? 0.68 : 1);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const offset = (beamIndex - (beamCount - 1) / 2) * 12 + (secondary ? 26 : 0);
  const x1 = p.x + Math.cos(angle) * 18 + nx * offset;
  const y1 = p.y + Math.sin(angle) * 18 + ny * offset;
  const x2 = x1 + Math.cos(angle) * range;
  const y2 = y1 + Math.sin(angle) * range;
  const candidates = [];
  const nearby = [];
  queryEnemies(p.x, p.y, range + 160, nearby);
  for (var ni = 0; ni < nearby.length; ni++) {
    var e = nearby[ni];
    if (e.dead) continue;
    const hit = pointSegmentInfo(e.x, e.y, x1, y1, x2, y2);
    if (hit.t < 0 || hit.t > 1 || hit.distance > (e.r || 0) + width) continue;
    candidates.push({ enemy: e, t: hit.t, x: hit.x, y: hit.y, distance: hit.distance });
  }
  candidates.sort(function(a, b) { return a.t - b.t; });

  const hitLimit = base.hitLimit + (rank >= 1 ? 1 : 0);
  const damage = weaponPower(shot, base.damage) * dmgScale * damageScale;
  const hitRecords = candidates.slice(0, hitLimit);
  const hitSet = new Set();
  for (let i = 0; i < hitRecords.length; i++) {
    const hit = hitRecords[i];
    hitSet.add(hit.enemy);
    const falloff = Math.max(0.72, 1 - i * 0.055);
    damageEnemy(hit.enemy, damage * falloff, hit.x, hit.y);
    applyKnockback(hit.enemy, Math.cos(angle), Math.sin(angle), secondary ? 62 : 118);
    burst(hit.x, hit.y, secondary ? 5 : 8, color, secondary ? 120 : 180);
  }

  if (rank >= 2 && hitRecords[0]) prismRefraction(hitRecords[0], shot, base, color, hitSet, damage * 0.28);
  if (rank >= 3) prismRiftDamage(x1, y1, x2, y2, width + 42, damage * 0.2, color, hitSet);

  world.weaponFx.push({
    kind: "prismChargeGhost",
    x: x1, y: y1, angle, width, color, rank, secondary,
    life: secondary ? 0.12 : 0.16, maxLife: secondary ? 0.12 : 0.16,
    seed: Math.random() * 999,
  });
  world.weaponFx.push({
    kind: "prismRail",
    x1, y1, x2, y2, width, color, rank, secondary,
    impacts: hitRecords.map(function(hit) { return { x: hit.x, y: hit.y }; }),
    life: secondary ? 0.2 : 0.27, maxLife: secondary ? 0.2 : 0.27,
    seed: Math.random() * 999,
  });
  if (hitRecords.length) {
    world.weaponFx.push({
      kind: "prismImpact",
      x: hitRecords[0].x, y: hitRecords[0].y,
      radius: 34 + rank * 5, color, rank,
      life: 0.22, maxLife: 0.22,
      seed: Math.random() * 999,
    });
  }
}

function prismRefraction(sourceHit, shot, base, color, excluded, damage) {
  const hits = [];
  queryEnemies(sourceHit.x, sourceHit.y, base.refractionRange, hits);
  const arcs = [];
  let count = 0;
  for (var i = 0; i < hits.length; i++) {
    var e = hits[i];
    if (e.dead || excluded.has(e) || count >= 3) continue;
    count++;
    excluded.add(e);
    damageEnemy(e, damage, sourceHit.x, sourceHit.y);
    applyKnockback(e, e.x - sourceHit.x, e.y - sourceHit.y, 58);
    arcs.push({ x1: sourceHit.x, y1: sourceHit.y, x2: e.x, y2: e.y, seed: Math.random() * 999 });
  }
  if (arcs.length) world.weaponFx.push({ kind: "arc", segments: arcs.map(function(seg, index) { return { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, seed: seg.seed, index: index, power: 0.55 }; }), life: 0.16, maxLife: 0.16, color });
}

function prismRiftDamage(x1, y1, x2, y2, width, damage, color, excluded) {
  const p = state.player;
  const hits = [];
  queryEnemies(p.x, p.y, Math.hypot(x2 - x1, y2 - y1) + 120, hits);
  let count = 0;
  for (var i = 0; i < hits.length; i++) {
    var e = hits[i];
    if (e.dead || excluded.has(e) || count >= 5) continue;
    const hit = pointSegmentInfo(e.x, e.y, x1, y1, x2, y2);
    if (hit.t < 0 || hit.t > 1 || hit.distance > (e.r || 0) + width) continue;
    count++;
    damageEnemy(e, damage, hit.x, hit.y);
    applyKnockback(e, e.x - hit.x, e.y - hit.y, 46);
  }
  if (count) world.weaponFx.push({ kind: "shockRing", x: (x1 + x2) / 2, y: (y1 + y2) / 2, radius: Math.min(120, width * 1.65), life: 0.22, maxLife: 0.22, color });
}

function pointSegmentInfo(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const rawT = ((px - x1) * dx + (py - y1) * dy) / len2;
  const t = clamp(rawT, 0, 1);
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return { t: rawT, x: x, y: y, distance: Math.hypot(px - x, py - y) };
}
function fireSingularity(angle, base, shot, rank, color, index, source, extra) {
  var splitBonus = 0; var dmgScale = 1; if (extra) { splitBonus = extra.splitBonus || 0; dmgScale = extra.dmgScale || 1; }
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const p = state.player;
  const speed = base.speed * (rank >= 4 ? 0.92 : 1);
  const origin = source || p;
  const x = origin.x + Math.cos(angle) * 22;
  const y = origin.y + Math.sin(angle) * 22;
  world.projectiles.push({
    x,
    y,
    px: origin.x,
    py: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    angle,
    damage: weaponPower(shot, base.damage) * dmgScale,
    pierce: 999,
    r: base.radius + rank * 2,
    life: base.life + rank * 0.18,
    maxLife: base.life + rank * 0.18,
    color,
    shape: "singularity",
    variant: rank >= 4 ? "legendSingularity" : rank >= 3 ? "voidRift" : "singularity",
    quality: shot.quality || "common",
    qualityRank: rank,
    tracking: false,
    returning: false,
    pullRadius: base.pullRadius + (rank >= 1 ? 28 : 0) + rank * 8 + splitBonus * 34 + weaponRangeBonus() * 0.12,
    damageRadius: base.damageRadius + rank * 7,
    collapseRadius: base.collapseRadius + (rank >= 3 ? 28 : 0) + rank * 5,
    pullStrength: base.pullStrength * (1 + rank * 0.12),
    pulseInterval: Math.max(0.34, base.pulseInterval - rank * 0.045),
    pulseTimer: base.pulseInterval * 0.55,
    collapseDamage: weaponPower(shot, base.damage) * dmgScale * (2.1 + rank * 0.26),
    noLifeExpire: true,
    knockback: 0,
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
    seed: Math.random() * 999 + index * 31,
    secondCollapse: rank >= 4,
    ...(extra || {}),
  });
  pulse(x, y, base.pullRadius * 0.38, color, 0.16);
}

function updateVoidSingularityWeapon(dt) {
  const w = state.weapons.void_singularity;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("void_singularity");
  const useManualTick = manual ? tickWeaponManual(w, dt, "void_singularity") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("void_singularity");
  var target;
  if (manual) {
    var aim = getManualAimAngle();
    if (aim != null) {
      target = { x: p.x + Math.cos(aim) * (w.range || 820) * 0.8, y: p.y + Math.sin(aim) * (w.range || 820) * 0.8 };
    }
  }
  if (!target) target = nearestEnemy(p.x, p.y, effectiveWeaponRange(w.range));
  if (!target) return;

  const base = Math.atan2(target.y - p.y, target.x - p.x);
  const count = Math.max(1, w.count || 1);
  const splitBonus = weaponSplitBonus(w);
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#8b5cf6");
    const spread = (i - (count - 1) / 2) * 0.2;
    fireSingularity(base + spread, w, shot, rank, color, i, null, { splitBonus: splitBonus, dmgScale: dmgScale });
  }
  playSfx("shoot");
}


function updateTeslaMineChainWeapon(dt) {
  const w = state.weapons.tesla_mine_chain;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("tesla_mine_chain");
  const useManualTick = manual ? tickWeaponManual(w, dt, "tesla_mine_chain") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("tesla_mine_chain");
  const count = Math.max(1, w.count || 1) + weaponProjectileBonus(w);
  var anchor;
  if (manual) {
    var pos = getManualAimWorldPos();
    if (pos) {
      var dx = pos.x - p.x;
      var dy = pos.y - p.y;
      anchor = { x: pos.x, y: pos.y, angle: Math.atan2(dy, dx) };
    }
  }
  if (!anchor) anchor = chooseTeslaAnchor(w);
  if (!anchor) return;
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#42e8ff");
    placeTeslaNode(w, shot, rank, color, anchor, i, count, false, dmgScale);
    if (rank >= 4) placeTeslaNode(w, shot, rank, color, anchor, i + 0.5, count, true, dmgScale);
  }
  playSfx("shoot");
}
function chooseTeslaAnchor(w) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  let best = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    if (e.dead) continue;
    const nearby = [];
    queryEnemies(e.x, e.y, 170, nearby);
    const density = nearby.filter((other) => !other.dead).length;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const score = density * 160 - d;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) return { x: best.x, y: best.y, angle: Math.atan2(best.y - p.y, best.x - p.x) };
  const angle = Math.atan2(p.dirY, p.dirX);
  return { x: p.x + Math.cos(angle) * 150, y: p.y + Math.sin(angle) * 150, angle };
}



function placeTeslaNode(base, shot, rank, color, anchor, index, count, mini, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1;
  const spread = mini ? 46 : 32;
  const a = anchor.angle + Math.PI / 2 + (index - (count - 1) / 2) * 0.7;
  const offset = (index - (count - 1) / 2) * spread + (mini ? 42 : 0);
  const half = WORLD_SIZE / 2 - 40;
  const x = clamp(anchor.x + Math.cos(a) * offset, -half, half);
  const y = clamp(anchor.y + Math.sin(a) * offset, -half, half);
  const life = (base.nodeLife + rank * 0.28) * (mini ? 0.72 : 1);
  const damageScale = mini ? 0.52 : 1;
  world.itemObjects.push({
    kind: "tesla_node",
    x,
    y,
    r: mini ? 12 : 17,
    quality: shot.quality || "common",
    qualityRank: rank,
    qualityMult: shot.qualityMult || 1,
    color,
    damage: weaponPower(shot, base.damage) * dmgScale * damageScale,
    triggerRadius: (base.triggerRadius + (rank >= 1 ? 22 : 0) + rank * 4 + weaponRangeBonus() * 0.08) * (mini ? 0.72 : 1),
    chainRange: base.chainRange + (rank >= 1 ? 30 : 0) + rank * 9,
    chainCount: base.chainCount + (rank >= 2 ? 1 : 0) + (rank >= 4 ? 1 : 0),
    pulseCooldown: Math.max(0.36, base.pulseCooldown - rank * 0.035),
    pulseTimer: base.armTime + 0.08 + index * 0.05,
    armTime: base.armTime,
    maxArmTime: base.armTime,
    life,
    maxLife: life,
    fieldRadius: base.fieldRadius + rank * 12,
    seed: Math.random() * 999 + index * 31,
    mini,
    t: 0,
  });
  pulse(x, y, mini ? 30 : 44, color, 0.12);
  world.weaponFx.push({ kind: "teslaNodePulse", x, y, radius: mini ? 64 : 86, color, rank, armed: false, life: 0.28, maxLife: 0.28, seed: Math.random() * 999 });
}

function updateTeslaNodes(dt) {
  for (const node of world.itemObjects) {
    if (node.kind !== "tesla_node") continue;
    node.armTime = Math.max(0, (node.armTime || 0) - dt);
    node.pulseTimer = Math.max(0, (node.pulseTimer || 0) - dt);
    if (node.armTime > 0 || node.pulseTimer > 0) continue;
    const target = nearestTeslaTarget(node);
    if (!target) continue;
    node.pulseTimer = node.pulseCooldown;
    dischargeTeslaNode(node, target);
  }
}

function nearestTeslaTarget(node) {
  const hits = [];
  queryEnemies(node.x, node.y, node.triggerRadius, hits);
  let best = null;
  let bestD = Infinity;
  for (const e of hits) {
    if (e.dead) continue;
    const d = distSq(node.x, node.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function dischargeTeslaNode(node, firstTarget) {
  const visited = new Set();
  const segments = [];
  chainTeslaFrom(node.x, node.y, firstTarget, node, visited, segments, node.damage, node.chainCount);
  const relay = node.qualityRank >= 2 ? nearestTeslaRelay(node) : null;
  if (relay) {
    segments.push({ x1: node.x, y1: node.y, x2: relay.x, y2: relay.y, seed: Math.random() * 999, relay: true });
    const relayTarget = nearestTeslaTarget(relay);
    if (relayTarget && !visited.has(relayTarget)) chainTeslaFrom(relay.x, relay.y, relayTarget, node, visited, segments, node.damage * 0.46, node.qualityRank >= 4 ? 2 : 1);
  }
  if (node.qualityRank >= 4) {
    const fork = nextTeslaTarget({ x: node.x, y: node.y }, node.chainRange * 0.9, visited);
    if (fork) chainTeslaFrom(node.x, node.y, fork, node, visited, segments, node.damage * 0.58, 2);
  }
  if (node.qualityRank >= 3) teslaFieldDamage(node, visited);
  if (segments.length) {
    addCameraShake(Math.min(5.5, 1.6 + segments.length * 0.32));
    world.weaponFx.push({ kind: "teslaChain", segments, color: node.color, rank: node.qualityRank, life: 0.17, maxLife: 0.17, seed: node.seed });
    world.weaponFx.push({ kind: "teslaNodePulse", x: node.x, y: node.y, radius: node.triggerRadius, color: node.color, rank: node.qualityRank, armed: true, life: 0.32, maxLife: 0.32, seed: node.seed });
    playSfx("hit");
  }
}

function chainTeslaFrom(x, y, firstTarget, node, visited, segments, baseDamage, maxTargets) {
  let source = { x, y };
  let target = firstTarget;
  let damage = baseDamage;
  let count = 0;
  while (target && count < maxTargets) {
    visited.add(target);
    count++;
    segments.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, seed: Math.random() * 999 });
    damageEnemy(target, damage, source.x, source.y);
    applyKnockback(target, target.x - source.x, target.y - source.y, target.boss ? 32 : 92);
    burst(target.x, target.y, node.qualityRank >= 2 ? 7 : 5, node.color, 150);
    source = target;
    damage *= 0.72;
    target = nextTeslaTarget(source, node.chainRange, visited);
  }
}

function nextTeslaTarget(source, range, visited) {
  const hits = [];
  queryEnemies(source.x, source.y, range, hits);
  let best = null;
  let bestD = range * range;
  for (const e of hits) {
    if (e.dead || visited.has(e)) continue;
    const d = distSq(source.x, source.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function nearestTeslaRelay(node) {
  let best = null;
  let bestD = node.chainRange * node.chainRange;
  for (const other of world.itemObjects) {
    if (other === node || other.kind !== "tesla_node" || other.armTime > 0) continue;
    const d = distSq(node.x, node.y, other.x, other.y);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

function teslaFieldDamage(node, visited) {
  const hits = [];
  queryEnemies(node.x, node.y, node.fieldRadius, hits);
  let count = 0;
  for (const e of hits) {
    if (e.dead || visited.has(e) || count >= 6) continue;
    count++;
    const d = Math.max(1, Math.hypot(e.x - node.x, e.y - node.y));
    const falloff = clamp(1 - d / node.fieldRadius, 0.25, 1);
    damageEnemy(e, node.damage * 0.22 * falloff, node.x, node.y);
    applyKnockback(e, e.x - node.x, e.y - node.y, e.boss ? 18 : 46);
  }
  world.weaponFx.push({ kind: "teslaField", x: node.x, y: node.y, radius: node.fieldRadius, color: node.color, rank: node.qualityRank, life: 0.62, maxLife: 0.62, seed: node.seed });
}

function updateStarfallScepterWeapon(dt) {
  const w = state.weapons.starfall_scepter;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("starfall_scepter");
  const useManualTick = manual ? tickWeaponManual(w, dt, "starfall_scepter") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("starfall_scepter");
  const count = Math.max(1, w.count || 1);
  var anchor;
  if (manual) {
    var pos = getManualAimWorldPos();
    if (pos) {
      var dx = pos.x - p.x;
      var dy = pos.y - p.y;
      anchor = { x: pos.x, y: pos.y, angle: Math.atan2(dy, dx) };
    }
  }
  if (!anchor) {
    anchor = chooseStarfallAnchor(w);
    if (!anchor) return;
  }
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#ffd166");
    spawnStarfallVolley(w, shot, rank, color, anchor, w.stars + (rank >= 1 ? 1 : 0), i, dmgScale);
  }
  playSfx("shoot");
}
function chooseStarfallAnchor(w) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  let best = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    if (e.dead) continue;
    const nearby = [];
    queryEnemies(e.x, e.y, 190, nearby);
    const density = nearby.filter((other) => !other.dead).length;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const score = density * 190 + Math.min(360, d) * 0.18 - d * 0.32;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) {
    return {
      x: best.x + (best.vx || best.knockbackX || 0) * 0.18,
      y: best.y + (best.vy || best.knockbackY || 0) * 0.18,
    };
  }
  return null;
}

function spawnStarfallVolley(base, shot, rank, color, anchor, stars, volleyIndex, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1;
  const points = [];
  const spread = 46 + rank * 5;
  const total = Math.min(9, stars);
  for (let i = 0; i < total; i++) {
    const a = i * TAU / total + Math.random() * 0.35 + volleyIndex * 0.42;
    const r = i === 0 ? 0 : spread * (0.28 + (i % 3) * 0.22 + Math.random() * 0.14);
    const tx = anchor.x + Math.cos(a) * r;
    const ty = anchor.y + Math.sin(a) * r * 0.72;
    points.push({ x: tx, y: ty });
    spawnStarfallProjectile(base, shot, rank, color, tx, ty, i, false, dmgScale);
  }
  if (rank >= 4) {
    const tx = anchor.x + Math.cos(volleyIndex + 0.7) * 38;
    const ty = anchor.y + Math.sin(volleyIndex + 0.7) * 28;
    points.push({ x: tx, y: ty });
    spawnStarfallProjectile(base, shot, rank, color, tx, ty, total, true, dmgScale);
  }
  if (rank >= 3 && points.length >= 3) {
    const delay = base.warningTime + base.fallTime + 0.08 + volleyIndex * 0.04;
    world.weaponFx.push({
      kind: "starConstellation",
      points,
      x: anchor.x,
      y: anchor.y,
      radius: base.radius + 36 + rank * 7,
      damage: weaponPower(shot, base.damage) * dmgScale * 0.32,
      color,
      rank,
      delay,
      life: 0.48,
      maxLife: 0.48,
      seed: Math.random() * 999,
      damageDone: false,
    });
  }
}

function spawnStarfallProjectile(base, shot, rank, color, targetX, targetY, index, major, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1;
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const fallTime = base.fallTime + (major ? 0.16 : 0) + Math.random() * 0.08;
  const delay = base.warningTime + index * 0.055;
  const startX = targetX - 210 - Math.random() * 120;
  const startY = targetY - 640 - Math.random() * 130;
  const vx = (targetX - startX) / fallTime;
  const vy = (targetY - startY) / fallTime;
  const radius = (base.radius + rank * 7 + (rank >= 1 ? 10 : 0)) * (major ? 1.42 : 1);
  const scarRadius = (base.scarRadius + rank * 6) * (major ? 1.22 : 1);
  const damage = weaponPower(shot, base.damage) * dmgScale * (major ? 1.8 : 1);
  world.projectiles.push({
    x: startX,
    y: startY,
    px: startX,
    py: startY,
    vx,
    vy,
    speed: Math.hypot(vx, vy),
    angle: Math.atan2(vy, vx),
    damage,
    pierce: 999,
    r: major ? 15 : 10 + rank * 0.8,
    life: delay + fallTime + 0.45,
    maxLife: delay + fallTime + 0.45,
    color,
    shape: "starfall",
    variant: major ? "legendStarfall" : rank >= 3 ? "starConstellation" : "starfall",
    quality: shot.quality || "common",
    qualityRank: rank,
    targetX,
    targetY,
    delay,
    warningTime: delay,
    impactRadius: radius,
    scarRadius,
    scarDuration: base.scarDuration + (rank >= 2 ? 0.45 : 0) + rank * 0.06,
    scarDps: damage * (rank >= 2 ? 0.34 : 0.22),
    major,
    noLifeExpire: true,
    knockback: major ? 165 : 105,
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
    seed: Math.random() * 999 + index * 19,
  });
  world.weaponFx.push({
    kind: "starfallWarning",
    x: targetX,
    y: targetY,
    radius,
    color,
    rank,
    major,
    life: delay,
    maxLife: Math.max(0.1, delay),
    seed: Math.random() * 999,
  });
}


function updatePhaseNeedlerWeapon(dt) {
  const w = state.weapons.phase_needler;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("phase_needler");
  const useManualTick = manual ? tickWeaponManual(w, dt, "phase_needler") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("phase_needler");
  var baseAngle;
  if (manual) {
    var aim = getManualAimAngle();
    if (aim != null) baseAngle = aim;
  }
  if (baseAngle == null) {
    const target = choosePhaseNeedlerTarget(w);
    baseAngle = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  }
  if (baseAngle == null) return;
  const slots = Math.max(1, w.count || 1);
  const bonus = weaponProjectileBonus(w);
  const volleyId = Math.random().toString(36).slice(2);
  for (let slot = 0; slot < slots; slot++) {
    const quality = weaponQualityAt(w, slot);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#b48cff");
    const needleCount = Math.min(9, w.needles + (rank >= 1 ? 1 : 0) + (slot === 0 ? bonus : 0));
    const spread = 0.32 + Math.min(0.18, needleCount * 0.018);
    for (let i = 0; i < needleCount; i++) {
      const step = needleCount <= 1 ? 0 : (i - (needleCount - 1) / 2) / (needleCount - 1);
      const jitter = (Math.random() - 0.5) * 0.025;
      firePhaseNeedle(baseAngle + step * spread + jitter, w, shot, rank, color, i + slot * 17, volleyId, false, null, null, dmgScale);
    }
    if (rank >= 4) firePhaseNeedle(baseAngle, w, shot, rank, color, 99 + slot, volleyId, true, null, null, dmgScale);
  }
  playSfx("shoot");
}
function choosePhaseNeedlerTarget(w) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  let best = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const cluster = [];
    queryEnemies(e.x, e.y, 130, cluster);
    const density = cluster.filter((other) => !other.dead).length;
    const midRange = 1 - Math.abs(d - range * 0.58) / Math.max(1, range);
    const score = density * 160 + midRange * 90 - d * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best || nearestEnemy(p.x, p.y, range);
}

function firePhaseNeedle(angle, base, shot, rank, color, index, volleyId, major, source, sourceWeaponId, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1; source = source || null; sourceWeaponId = sourceWeaponId || null;
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const p = source || state.player;
  const speed = base.speed * (rank >= 1 ? 1.08 : 1) * (major ? 0.92 : 1);
  const sx = p.x + Math.cos(angle) * 16 - Math.sin(angle) * (major ? 0 : (index % 3 - 1) * 5);
  const sy = p.y + Math.sin(angle) * 16 + Math.cos(angle) * (major ? 0 : (index % 3 - 1) * 5);
  const damage = weaponPower(shot, base.damage) * dmgScale * (major ? 1.45 : 1);
  const phaseDamage = weaponPower(shot, base.phaseDamage) * dmgScale * (major ? 1.65 : 1);
  world.projectiles.push({
    x: sx,
    y: sy,
    px: p.x,
    py: p.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    angle,
    damage,
    pierce: base.pierce + (rank >= 1 ? 1 : 0) + (major ? 3 : 0),
    r: major ? 7.5 : 4.4 + rank * 0.28,
    life: major ? 0.82 : 0.68,
    maxLife: major ? 0.82 : 0.68,
    color,
    shape: "phaseNeedle",
    variant: major ? "legendPhaseNeedle" : rank >= 2 ? "riftPhaseNeedle" : "phaseNeedle",
    quality: shot.quality || "common",
    qualityRank: rank,
    tracking: false,
    turnSpeed: 0,
    returning: false,
    returnAfter: 0,
    returnSpeed: 1,
    returnTimer: 0,
    explodeRadius: 0,
    explodeDamage: 0,
    freezeDuration: 0,
    noLifeExpire: false,
    knockback: major ? 132 : 86,
    phaseDelay: Math.max(0.24, base.phaseDelay - rank * 0.025),
    phaseRadius: (base.phaseRadius + (rank >= 2 ? 18 : 0) + rank * 4) * (major ? 1.28 : 1),
    phaseDamage,
    volleyId,
    major,
    sourceWeaponId,
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
    seed: Math.random() * 999 + index * 13,
  });
  pulse(sx, sy, major ? 26 : 18, color, 0.12);
}

function updateEchoTuningForkWeapon(dt) {
  const w = state.weapons.echo_tuning_fork;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("echo_tuning_fork");
  const useManualTick = manual ? tickWeaponManual(w, dt, "echo_tuning_fork") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("echo_tuning_fork");
  var baseAngle;
  if (manual) {
    var aim = getManualAimAngle();
    baseAngle = aim != null ? aim : Math.atan2(p.dirY, p.dirX);
  } else {
    const target = chooseEchoTarget(w);
    baseAngle = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  }
  const slotBonus = Math.max(0, (w.slotCount || w.count || 1) - 1);
  const splitBonus = weaponSplitBonus(w);
  const enhancement = slotBonus + splitBonus;
  const shot = weaponViewForQuality(w, w.quality || weaponQualityAt(w, 0));
  const rank = qualityRank(shot);
  const color = qualityColor(shot, "#7dfcff");
  fireEchoCone(baseAngle, w, shot, rank, color, false, 0, 1 + slotBonus * 0.28, 1, null, enhancement, null, dmgScale);
  if (rank >= 4) {
    fireEchoCone(baseAngle, w, shot, rank, "#ffd166", true, 30, 0.62, 1.2, null, enhancement, null, dmgScale);
  }
  playSfx("shoot");
}

function chooseEchoTarget(w) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  let best = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    if (e.dead) continue;
    const nearby = [];
    queryEnemies(e.x, e.y, 150, nearby);
    const density = nearby.filter((other) => !other.dead).length;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const score = density * 130 + Math.max(0, range - d) * 0.18;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best || nearestEnemy(p.x, p.y, range);
}

function fireEchoCone(angle, base, shot, rank, color, secondary, index, damageScale, angleScale, source, enhancement, sourceWeaponId, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1; damageScale = damageScale != null ? damageScale : 1; angleScale = angleScale != null ? angleScale : 1; source = source || null; enhancement = enhancement || 0; sourceWeaponId = sourceWeaponId || null;
  const p = source || state.player;
  const range = (effectiveWeaponRange(base.range) + (rank >= 1 ? 42 : 0) * weaponRangeScale() + rank * 8 * weaponRangeScale() + enhancement * 58 * weaponRangeScale()) * (secondary ? 0.92 : 1);
  const coneAngle = (base.angle + (rank >= 1 ? 0.08 : 0) + rank * 0.018 + enhancement * 0.085) * angleScale;
  const damage = weaponPower(shot, base.damage) * dmgScale * damageScale * (1 + enhancement * 0.18) * (secondary ? 0.72 : 1);
  const echoDamage = weaponPower(shot, base.echoDamage) * dmgScale * damageScale * (1 + enhancement * 0.14) * (secondary ? 0.7 : 1);
  const hits = [];
  const hitPoints = [];
  queryEnemies(p.x, p.y, range + 70, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const diff = Math.abs(angleDiff(Math.atan2(dy, dx), angle));
    if (d > range + (e.r || 0) || diff > coneAngle / 2) continue;
    const centerBias = 1 - diff / Math.max(0.01, coneAngle / 2);
    const falloff = clamp(1 - d / range, 0.28, 1);
    damageEnemy(e, damage * (0.74 + centerBias * 0.26) * falloff, p.x, p.y);
    applyKnockback(e, Math.cos(angle) + dx / d * 0.35, Math.sin(angle) + dy / d * 0.35, e.boss ? 26 : 82);
    burst(e.x, e.y, rank >= 2 ? 7 : 5, color, 145);
    hitPoints.push({ x: e.x, y: e.y, d });
  }

  world.weaponFx.push({
    kind: "echoCone",
    x: p.x,
    y: p.y,
    angle,
    coneAngle,
    range,
    color,
    rank,
    secondary,
    sourceWeaponId,
    life: secondary ? 0.28 : 0.34,
    maxLife: secondary ? 0.28 : 0.34,
    seed: Math.random() * 999 + index * 17,
  });

  for (let i = 0; i < hitPoints.length; i++) {
    const hit = hitPoints[i];
    spawnEchoWave(hit.x, hit.y, base, rank, color, echoDamage, i, secondary ? 0.08 : 0, secondary);
    if (rank >= 2) spawnEchoWave(hit.x, hit.y, base, rank, color, echoDamage * 0.58, i + 11, 0.13, true);
  }
  if (rank >= 3 && hitPoints.length >= 3) echoResonance(p.x, p.y, angle, range, coneAngle, weaponPower(shot, base.resonanceDamage), color, rank);
  if (hitPoints.length) addCameraShake(Math.min(5.5, 1.1 + hitPoints.length * 0.22 + rank * 0.2));
}

function spawnEchoWave(x, y, base, rank, color, damage, index, delay, secondary) {
  world.weaponFx.push({
    kind: "echoWave",
    x,
    y,
    radius: (base.echoRadius + (rank >= 1 ? 18 : 0) + rank * 7) * (secondary ? 0.82 : 1),
    damage,
    color,
    rank,
    secondary,
    delay,
    life: base.echoDuration + rank * 0.035,
    maxLife: base.echoDuration + rank * 0.035,
    hitIds: new Set(),
    seed: Math.random() * 999 + index * 29,
  });
}

function echoResonance(x, y, angle, range, coneAngle, damage, color, rank) {
  const x2 = x + Math.cos(angle) * range;
  const y2 = y + Math.sin(angle) * range;
  const hits = [];
  queryEnemies(x, y, range + 80, hits);
  let count = 0;
  for (const e of hits) {
    if (e.dead || count >= 8) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const diff = Math.abs(angleDiff(Math.atan2(dy, dx), angle));
    if (d > range || diff > coneAngle * 0.22) continue;
    count++;
    damageEnemy(e, damage * (rank >= 4 ? 1.32 : 1), x2, y2);
    applyKnockback(e, Math.cos(angle), Math.sin(angle), e.boss ? 18 : 64);
  }
  world.weaponFx.push({
    kind: "echoResonance",
    x,
    y,
    x2,
    y2,
    angle,
    range,
    color,
    rank,
    life: rank >= 4 ? 0.36 : 0.28,
    maxLife: rank >= 4 ? 0.36 : 0.28,
    seed: Math.random() * 999,
  });
}


function updateRiftLoomWeapon(dt) {
  const w = state.weapons.rift_loom;
  if (!w || w.level <= 0) return;
  const manual = isManualPrimaryById("rift_loom");
  const useManualTick = manual ? tickWeaponManual(w, dt, "rift_loom") : tickWeapon(w, dt);
  if (!useManualTick) return;
  const p = state.player;
  const dmgScale = manualDamageScale("rift_loom");
  const splitBonus = weaponSplitBonus(w);
  var anchor;
  if (manual) {
    var pos = getManualAimWorldPos();
    if (pos) anchor = { x: pos.x, y: pos.y, angle: 0 };
  }
  if (!anchor) {
    anchor = chooseRiftLoomAnchor(w);
    if (!anchor) return;
  }
  const count = Math.max(1, w.count || 1) + splitBonus;
  for (let i = 0; i < count; i++) {
    const quality = weaponQualityAt(w, i);
    const shot = weaponViewForQuality(w, quality);
    const rank = qualityRank(shot);
    const color = qualityColor(shot, "#b48cff");
    const radiusScale = 0.72 + splitBonus * 0.14;
    const spinDir = i % 2 === 0 ? 1 : -1;
    spawnRiftLoom(anchor.x, anchor.y, w, shot, rank, color, false, i, radiusScale, spinDir, dmgScale);
  }
  playSfx("shoot");
}
function chooseRiftLoomAnchor(w) {
  const p = state.player;
  const range = effectiveWeaponRange(w.range);
  const candidates = [];
  queryEnemies(p.x, p.y, range, candidates);
  let best = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    if (e.dead) continue;
    const nearby = [];
    queryEnemies(e.x, e.y, 180, nearby);
    const density = nearby.filter((other) => !other.dead).length;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const score = density * 180 + Math.max(0, range - d) * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) return { x: best.x, y: best.y, angle: Math.atan2(best.y - p.y, best.x - p.x) };
  const angle = Math.atan2(p.dirY, p.dirX);
  return { x: p.x + Math.cos(angle) * Math.min(260, range * 0.45), y: p.y + Math.sin(angle) * Math.min(260, range * 0.45), angle };
}

function spawnRiftLoom(x, y, base, shot, rank, color, secondary, index, radiusScale, spinDir, dmgScale) {
  dmgScale = dmgScale != null ? dmgScale : 1; radiusScale = radiusScale != null ? radiusScale : 1; spinDir = spinDir != null ? spinDir : 1;
  const half = WORLD_SIZE / 2 - 50;
  const anchors = base.anchors + (rank >= 1 ? 1 : 0);
  const radius = (base.radius + rank * 10 + (rank >= 1 ? 14 : 0)) * (secondary ? 0.72 : 1) * radiusScale;
  const life = base.life + rank * 0.04;
  const damageScale = secondary ? 0.62 : 1;
  world.weaponFx.push({
    kind: "riftLoom",
    x: clamp(x, -half, half),
    y: clamp(y, -half, half),
    radius,
    baseRadius: radius,
    anchors,
    damage: weaponPower(shot, base.damage) * dmgScale * damageScale,
    collapseDamage: weaponPower(shot, base.collapseDamage) * dmgScale * damageScale,
    scarDamage: weaponPower(shot, base.scarDamage) * damageScale,
    lineWidth: base.lineWidth + rank * 2.2,
    color,
    rank,
    secondary,
    spin: Math.random() * TAU,
    spinSpeed: (2.1 + rank * 0.18) * spinDir,
    life,
    maxLife: life,
    hitCooldowns: new Map(),
    collapsed: false,
    seed: Math.random() * 999 + index * 37,
  });
  pulse(x, y, radius * 0.52, color, 0.12);
}

function tickWeapon(w, dt) {
  if (!w || w.level <= 0) return false;
  w.timer -= dt;
  if (w.timer > 0) return false;
  w.timer += w.cooldown / attackSpeedMultiplier();
  return true;
}

function tickWeaponManual(w, dt, weaponId) {
  if (!w || w.level <= 0) return false;
  w.timer -= dt;
  if (w.timer > 0) return false;
  if (!input.mouseDown) {
    w.timer = 0;
    return false;
  }
  w.timer += w.cooldown / attackSpeedMultiplier();
  return true;
}

function fireProjectile(angle, w, opt) {
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const p = state.player;
  const origin = opt.source || p;
  const speed = opt.speed || w.speed || 520;
  const sx = origin.x + Math.cos(angle) * 12;
  const sy = origin.y + Math.sin(angle) * 12;
  world.projectiles.push({
    x: sx,
    y: sy,
    px: origin.x,
    py: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    angle,
    damage: opt.damage ?? weaponPower(w, w.damage),
    pierce: opt.pierce,
    r: opt.radius,
    life: opt.life,
    maxLife: opt.life,
    color: opt.color,
    shape: opt.shape,
    variant: opt.variant || opt.shape,
    quality: opt.quality || w.quality || "common",
    qualityRank: qualityRankOf(opt.quality || w.quality || "common"),
    tracking: opt.tracking,
    turnSpeed: opt.turnSpeed || 3,
    returning: opt.returning,
    returnAfter: opt.returnAfter || 0.35,
    returnSpeed: opt.returnSpeed || 1,
    returnTimer: 0,
    explodeRadius: opt.explodeRadius || 0,
    explodeDamage: weaponPower(w, opt.explodeDamage || 0),
    freezeDuration: opt.freezeDuration || 0,
    noLifeExpire: opt.noLifeExpire || false,
    knockback: opt.knockback || 80,
    iceRing: opt.iceRing || false,
    frostZone: opt.frostZone || false,
    splitOnHit: opt.splitOnHit || 0,
    secondaryBurst: opt.secondaryBurst || 0,
    microMissiles: opt.microMissiles || 0,
    farBurst: opt.farBurst || false,
    farBurstDone: false,
    returnBounceLeft: opt.returnBounceLeft || 0,
    chainHitsLeft: opt.chainHitsLeft || 0,
    sourceWeaponId: opt.sourceWeaponId || null,
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
    recallFxDone: false,
  });
  pulse(sx, sy, 16, opt.color, 0.13);
}

function updateProjectiles(dt) {
  const half = WORLD_SIZE / 2 + 280;
  const hits = [];
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const b = world.projectiles[i];
    if (b.shape === "singularity") {
      updateSingularityProjectile(b, i, dt);
      continue;
    }
    if (b.shape === "starfall") {
      updateStarfallProjectile(b, i, dt);
      continue;
    }
    b.px = b.x;
    b.py = b.y;
    const wasReturning = b.shape === "boomerang" && b.returnTimer >= b.returnAfter;
    steer(b, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    b.spin += dt * (b.shape === "boomerang" ? 18 : 7);
    b.trailTimer -= dt;
    if (b.trailTimer <= 0) {
      b.trailTimer = b.shape === "phaseNeedle" ? 0.014 : b.shape === "ice" ? 0.05 : b.shape === "missile" ? 0.026 : 0.035;
      if (b.shape === "ice") {
        world.weaponFx.push({ kind: "iceShardTrail", x: b.x, y: b.y, px: b.px, py: b.py, angle: b.angle, color: b.color, rank: b.qualityRank || 0, life: 0.2, maxLife: 0.2, seed: b.spin });
      } else {
        trail(b.x, b.y, b.px, b.py, b.color, b.shape === "phaseNeedle" ? 4 : b.shape === "droneBolt" ? 3 : 5);
      }
    }
    if (b.shape === "boomerang" && !wasReturning && b.returnTimer >= b.returnAfter && !b.recallFxDone) {
      b.recallFxDone = true;
      world.weaponFx.push({ kind: "boomerangRecall", x: b.x, y: b.y, angle: b.angle, color: b.color, rank: b.qualityRank || 0, life: 0.26, maxLife: 0.26, spin: b.spin });
    }
    if (b.shape === "boomerang" && b.farBurst && !b.farBurstDone && b.returnTimer >= b.returnAfter) {
      b.farBurstDone = true;
      bladeBloom(b);
    }

    hits.length = 0;
    queryEnemies(b.x, b.y, b.r + 30, hits);
    for (const e of hits) {
      if (b.pierce <= 0 || b.hitIds.has(e)) continue;
      if (e.hitTest ? !e.hitTest(b.x, b.y, b.r) : !circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) continue;
      b.hitIds.add(e);
      b.pierce--;
      damageEnemy(e, b.damage, b.x, b.y);
      applyKnockback(e, b.vx, b.vy, b.knockback);
      addProjectileHitShake(b);
      if (b.shape === "phaseNeedle") phaseNeedleHit(b, e);
      if (b.freezeDuration > 0 && !e.dead && !e.boss && !e.controlImmune && !e.immuneFreeze) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration);
      burst(b.x, b.y, b.shape === "ice" ? 12 : 8, b.color, b.shape === "missile" ? 220 : 170);
      world.weaponFx.push({ kind: b.shape === "ice" ? "iceHit" : "hit", x: b.x, y: b.y, rank: b.qualityRank || 0, life: 0.18, maxLife: 0.18, color: b.color });
      if (b.shape === "ice" && b.iceRing) iceRingBurst(b);
      if (b.shape === "ice" && b.frostZone && !e.dead) frostZone(b);
      if (b.shape === "boomerang" && b.chainHitsLeft > 0) chainBoomerangToNextTarget(b, e);
      playSfx("hit");
      if (b.explodeRadius) {
        explode(b);
        playSfx("explode");
        b.pierce = 0;
      }
    }

    if (b.shape === "boomerang" && b.returnBounceLeft > 0 && b.returnTimer > b.returnAfter && distSq(b.x, b.y, state.player.x, state.player.y) < 34 * 34) {
      b.returnBounceLeft--;
      b.returnTimer = 0;
      b.recallFxDone = false;
      b.farBurstDone = false;
      const a = Math.atan2(state.player.dirY, state.player.dirX) + 0.7;
      b.vx = Math.cos(a) * b.speed;
      b.vy = Math.sin(a) * b.speed;
      b.life = Math.max(b.life, 1.25);
      b.hitIds.clear();
    }

    const expired = !b.noLifeExpire && b.life <= 0;
    if (expired || b.pierce <= 0 || Math.abs(b.x) > half || Math.abs(b.y) > half) world.projectiles.splice(i, 1);
  }
}

function chainBoomerangToNextTarget(b, sourceEnemy) {
  const next = nextBoomerangTarget(b, sourceEnemy);
  if (!next) return;
  b.chainHitsLeft--;
  b.returnTimer = 0;
  b.farBurstDone = false;
  b.life = Math.max(b.life, 0.9);
  const angle = Math.atan2(next.y - b.y, next.x - b.x);
  b.vx = Math.cos(angle) * b.speed;
  b.vy = Math.sin(angle) * b.speed;
  b.angle = angle;
}

function nextBoomerangTarget(b, sourceEnemy) {
  const hits = [];
  queryEnemies(sourceEnemy.x, sourceEnemy.y, 520, hits);
  let best = null;
  let bestD = Infinity;
  for (const e of hits) {
    if (e.dead || b.hitIds.has(e)) continue;
    const d = distSq(sourceEnemy.x, sourceEnemy.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function updateSingularityProjectile(b, index, dt) {
  b.px = b.x;
  b.py = b.y;
  b.life -= dt;
  b.spin += dt * (3.6 + b.qualityRank * 0.35);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.vx *= Math.pow(0.985, dt * 60);
  b.vy *= Math.pow(0.985, dt * 60);
  b.trailTimer -= dt;
  if (b.trailTimer <= 0) {
    b.trailTimer = 0.045;
    trail(b.x, b.y, b.px, b.py, b.color, 7);
  }

  const hits = [];
  queryEnemies(b.x, b.y, b.pullRadius, hits);
  let affected = 0;
  for (const e of hits) {
    if (e.dead) continue;
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const pullT = clamp(1 - dist / b.pullRadius, 0, 1);
    const bossPullScale = (e.controlImmune || e.immuneGravity) ? 0 : e.boss ? 0.08 : 1;
    const pull = b.pullStrength * pullT * pullT * bossPullScale * dt;
    e.x += (dx / dist) * pull;
    e.y += (dy / dist) * pull;
    if (dist < b.damageRadius + e.r) {
      const damageScale = 0.35 + pullT * 0.9;
      damageEnemy(e, b.damage * damageScale * dt, b.x, b.y);
      if (!e.boss && !e.controlImmune && !e.immuneGravity) applyKnockback(e, dx, dy, -22 * pullT);
      affected++;
    }
  }

  b.pulseTimer -= dt;
  if (b.pulseTimer <= 0) {
    b.pulseTimer += b.pulseInterval;
    singularityPulse(b, hits);
  }

  if (!b.collapseWarnDone && b.life <= 0.22) {
    b.collapseWarnDone = true;
    world.weaponFx.push({ kind: "voidCollapseWarning", x: b.x, y: b.y, radius: b.collapseRadius, color: b.color, rank: b.qualityRank, life: 0.22, maxLife: 0.22, seed: b.seed });
  }
  if (affected && Math.random() < dt * 8) burst(b.x, b.y, 2, b.color, 90);

  const half = WORLD_SIZE / 2 + 240;
  if (b.life <= 0 || Math.abs(b.x) > half || Math.abs(b.y) > half) {
    collapseSingularity(b);
    world.projectiles.splice(index, 1);
  }
}

function singularityPulse(b, cachedHits = null) {
  const radius = b.damageRadius + (b.qualityRank >= 2 ? 32 : 12);
  const hits = cachedHits || [];
  if (!cachedHits) queryEnemies(b.x, b.y, radius, hits);
  for (const e of hits) {
    if (e.dead || distSq(b.x, b.y, e.x, e.y) > (radius + e.r) ** 2) continue;
    damageEnemy(e, b.damage * (b.qualityRank >= 4 ? 0.62 : 0.42), b.x, b.y);
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    if (!e.boss) applyKnockback(e, dx, dy, -64);
  }
  world.weaponFx.push({
    kind: "voidPulse",
    x: b.x,
    y: b.y,
    radius,
    color: b.color,
    rank: b.qualityRank,
    life: 0.34,
    maxLife: 0.34,
    seed: b.seed,
  });
}

function collapseSingularity(b) {
  const hits = [];
  queryEnemies(b.x, b.y, b.collapseRadius, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const falloff = clamp(1 - d / b.collapseRadius, 0.22, 1);
    damageEnemy(e, b.collapseDamage * falloff, b.x, b.y);
    applyKnockback(e, dx, dy, (e.boss ? 42 : 155) * falloff);
  }
  addCameraShake(Math.min(9, 3.2 + b.collapseRadius / 55));
  burst(b.x, b.y, 24 + b.qualityRank * 5, b.color, 230);
  pulse(b.x, b.y, b.collapseRadius, b.color, 0.38);
  world.weaponFx.push({
    kind: "voidCollapse",
    x: b.x,
    y: b.y,
    radius: b.collapseRadius,
    color: b.color,
    rank: b.qualityRank,
    life: 0.5,
    maxLife: 0.5,
    seed: b.seed,
  });
  if (b.secondCollapse) {
    world.weaponFx.push({
      kind: "voidPulse",
      x: b.x,
      y: b.y,
      radius: b.collapseRadius * 0.62,
      color: "#ffd166",
      rank: b.qualityRank,
      life: 0.42,
      maxLife: 0.42,
      seed: b.seed + 17,
    });
    const outer = [];
    queryEnemies(b.x, b.y, b.collapseRadius * 0.62, outer);
    for (const e of outer) {
      if (e.dead) continue;
      damageEnemy(e, b.collapseDamage * 0.36, b.x, b.y);
    }
  }
  playSfx("explode");
}

function updateStarfallProjectile(b, index, dt) {
  b.life -= dt;
  b.spin += dt * (8 + b.qualityRank * 0.8);
  if (b.delay > 0) {
    b.delay -= dt;
    return;
  }

  b.px = b.x;
  b.py = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.angle = Math.atan2(b.vy, b.vx);
  b.trailTimer -= dt;
  if (b.trailTimer <= 0) {
    b.trailTimer = b.major ? 0.018 : 0.026;
    trail(b.x, b.y, b.px, b.py, b.color, b.major ? 9 : 7);
  }

  if (b.y >= b.targetY || b.life <= 0) {
    impactStarfall(b);
    world.projectiles.splice(index, 1);
  }
}

function impactStarfall(b) {
  const hits = [];
  queryEnemies(b.targetX, b.targetY, b.impactRadius, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const dx = e.x - b.targetX;
    const dy = e.y - b.targetY;
    const d = Math.max(1, Math.hypot(dx, dy));
    const falloff = clamp(1 - d / b.impactRadius, 0.24, 1);
    damageEnemy(e, b.damage * falloff, b.targetX, b.targetY);
    applyKnockback(e, dx, dy, (e.boss ? 42 : b.knockback) * falloff);
  }
  addCameraShake(Math.min(8, 2.5 + b.impactRadius / 55 + (b.major ? 1.8 : 0)));
  burst(b.targetX, b.targetY, b.major ? 30 : 18, b.color, b.major ? 260 : 210);
  pulse(b.targetX, b.targetY, b.impactRadius, b.color, b.major ? 0.38 : 0.28);
  world.weaponFx.push({
    kind: "starfallImpact",
    x: b.targetX,
    y: b.targetY,
    radius: b.impactRadius,
    color: b.color,
    rank: b.qualityRank,
    major: b.major,
    life: b.major ? 0.5 : 0.36,
    maxLife: b.major ? 0.5 : 0.36,
    seed: b.seed,
  });
  world.weaponFx.push({
    kind: "starScar",
    x: b.targetX,
    y: b.targetY,
    radius: b.scarRadius,
    color: b.color,
    rank: b.qualityRank,
    damagePerSecond: b.scarDps,
    tickTimer: 0,
    life: b.scarDuration,
    maxLife: b.scarDuration,
    seed: b.seed + 41,
  });
  if (b.major) {
    const radius = b.impactRadius * 0.68;
    const outer = [];
    queryEnemies(b.targetX, b.targetY, radius, outer);
    for (const e of outer) {
      if (e.dead) continue;
      damageEnemy(e, b.damage * 0.42, b.targetX, b.targetY);
    }
    world.weaponFx.push({ kind: "starfallImpact", x: b.targetX, y: b.targetY, radius, color: "#ffd166", rank: b.qualityRank, major: true, life: 0.42, maxLife: 0.42, seed: b.seed + 17 });
  }
  playSfx("explode");
}

function iceRingBurst(b) {
  const hits = [];
  queryEnemies(b.x, b.y, 78, hits);
  for (const e of hits) {
    if (b.hitIds.has(e) || e.dead) continue;
    damageEnemy(e, b.damage * 0.28, b.x, b.y);
    applyKnockback(e, e.x - b.x, e.y - b.y, 52);
    if (!e.boss && !e.controlImmune && !e.immuneFreeze) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration * 0.55);
  }
  world.weaponFx.push({ kind: "shockRing", x: b.x, y: b.y, radius: 78, life: 0.24, maxLife: 0.24, color: b.color });
}

function frostZone(b) {
  const radius = 92;
  const hits = [];
  queryEnemies(b.x, b.y, radius, hits);
  for (const e of hits) {
    if (e.dead || e.boss) continue;
    if (!e.controlImmune && !e.immuneFreeze) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration * 0.75);
  }
  world.weaponFx.push({ kind: "frostZone", x: b.x, y: b.y, radius, life: 0.75, maxLife: 0.75, color: b.color });
}

function bladeBloom(b) {
  const radius = 88;
  const hits = [];
  queryEnemies(b.x, b.y, radius, hits);
  for (const e of hits) {
    if (e.dead || b.hitIds.has(e)) continue;
    damageEnemy(e, b.damage * 0.36, b.x, b.y);
    applyKnockback(e, e.x - b.x, e.y - b.y, b.knockback * 0.65);
  }
  if (hits.length) addCameraShake(2.2);
  world.weaponFx.push({ kind: "bladeBloom", x: b.x, y: b.y, radius, life: 0.24, maxLife: 0.24, color: b.color, spin: b.spin });
}

function steer(b, dt) {
  if (b.tracking) {
    const target = nearestEnemy(b.x, b.y, 940);
    if (target) turnToward(b, Math.atan2(target.y - b.y, target.x - b.x), dt, b.turnSpeed, b.speed);
  }
  if (b.returning) {
    b.returnTimer += dt;
    if (b.returnTimer >= b.returnAfter) turnToward(b, Math.atan2(state.player.y - b.y, state.player.x - b.x), dt, b.returnSpeed * 4.2, b.speed * b.returnSpeed);
  }
  b.angle = Math.atan2(b.vy, b.vx);
}

function turnToward(b, target, dt, turnSpeed, speed) {
  const current = Math.atan2(b.vy, b.vx);
  const next = current + angleDiff(target, current) * Math.min(1, turnSpeed * dt);
  b.vx = Math.cos(next) * speed;
  b.vy = Math.sin(next) * speed;
}

function explode(b) {
  addCameraShake(Math.min(8, 3.5 + b.explodeRadius / 80));
  const hits = [];
  queryEnemies(b.x, b.y, b.explodeRadius, hits);
  for (const e of hits) {
    if (b.hitIds.has(e)) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const falloff = clamp(1 - Math.hypot(dx, dy) / b.explodeRadius, 0.18, 1);
    damageEnemy(e, b.explodeDamage * falloff, b.x, b.y);
    applyKnockback(e, dx, dy, 165 * falloff);
  }
  pulse(b.x, b.y, b.explodeRadius, b.color, 0.3);
  world.weaponFx.push({ kind: "explosion", x: b.x, y: b.y, radius: b.explodeRadius, life: 0.38, maxLife: 0.38, color: b.color, seed: Math.random() * 999 });
  world.weaponFx.push({ kind: "scorchRing", x: b.x, y: b.y, radius: b.explodeRadius * 0.9, color: b.color, rank: b.qualityRank || 0, life: 0.35, maxLife: 0.35, seed: Math.random() * 999 });
  if (b.splitOnHit) splitMissileBlast(b);
  if (b.secondaryBurst) {
    world.weaponFx.push({ kind: "shockRing", x: b.x, y: b.y, radius: b.explodeRadius * 1.34, life: 0.42, maxLife: 0.42, color: b.color });
    const outer = [];
    queryEnemies(b.x, b.y, b.explodeRadius * 1.34, outer);
    for (const e of outer) {
      if (e.dead) continue;
      damageEnemy(e, b.explodeDamage * 0.22, b.x, b.y);
      applyKnockback(e, e.x - b.x, e.y - b.y, 72);
    }
  }
  if (b.microMissiles) spawnMicroMissiles(b);
}

function splitMissileBlast(b) {
  for (let i = 0; i < b.splitOnHit; i++) {
    const a = b.angle + (i ? 1 : -1) * 1.25;
    const x = b.x + Math.cos(a) * b.explodeRadius * 0.48;
    const y = b.y + Math.sin(a) * b.explodeRadius * 0.48;
    const radius = b.explodeRadius * 0.42;
    const hits = [];
    queryEnemies(x, y, radius, hits);
    for (const e of hits) {
      if (e.dead) continue;
      damageEnemy(e, b.explodeDamage * 0.32, x, y);
      applyKnockback(e, e.x - x, e.y - y, 70);
    }
    world.weaponFx.push({ kind: "explosion", x, y, radius, life: 0.28, maxLife: 0.28, color: b.color, seed: Math.random() * 999 });
  }
  if (b.splitOnHit) addCameraShake(3);
}

function phaseNeedleHit(b, e) {
  if (e.phaseNeedleVolleyId !== b.volleyId) {
    e.phaseNeedleVolleyId = b.volleyId;
    e.phaseNeedleVolleyHits = 0;
  }
  e.phaseNeedleVolleyHits = (e.phaseNeedleVolleyHits || 0) + 1;
  const stackBoost = b.qualityRank >= 3 ? 1 + Math.max(0, e.phaseNeedleVolleyHits - 1) * 0.35 : 1;
  world.weaponFx.push({
    kind: "phaseNeedleHit",
    x: b.x,
    y: b.y,
    angle: b.angle,
    color: b.color,
    rank: b.qualityRank || 0,
    major: b.major,
    stacks: e.phaseNeedleVolleyHits || 1,
    life: 0.2,
    maxLife: 0.2,
    seed: Math.random() * 999,
  });
  world.weaponFx.push({
    kind: "phaseNeedleMark",
    target: e,
    x: e.x,
    y: e.y,
    radius: b.phaseRadius,
    damage: b.phaseDamage * stackBoost,
    color: b.color,
    rank: b.qualityRank || 0,
    major: b.major,
    stacks: e.phaseNeedleVolleyHits || 1,
    timer: b.phaseDelay,
    life: b.phaseDelay,
    maxLife: Math.max(0.1, b.phaseDelay),
    seed: Math.random() * 999,
  });
}

function addProjectileHitShake(b) {
  if (b.shape === "droneBolt") return addCameraShake(0.8);
  if (b.shape === "missile") return addCameraShake(4.5);
  if (b.shape === "boomerang") return addCameraShake(1.8);
  if (b.shape === "ice") return addCameraShake(1.2);
  if (b.shape === "phaseNeedle") return addCameraShake(b.major ? 1.4 : 0.65);
  addCameraShake(1);
}

function spawnMicroMissiles(b) {
  const hits = [];
  queryEnemies(b.x, b.y, 520, hits);
  let count = 0;
  for (const e of hits) {
    if (count >= b.microMissiles || e.dead) continue;
    const a = Math.atan2(e.y - b.y, e.x - b.x);
    if (world.projectiles.length >= PROJECTILE_LIMIT) return;
    count++;
    world.projectiles.push({
      x: b.x,
      y: b.y,
      px: b.x,
      py: b.y,
      vx: Math.cos(a) * 560,
      vy: Math.sin(a) * 560,
      speed: 560,
      angle: a,
      damage: b.damage * 0.46,
      pierce: 1,
      r: 4,
      life: 1.15,
      maxLife: 1.15,
      color: b.color,
      shape: "missile",
      variant: "microMissile",
      quality: b.quality,
      tracking: true,
      turnSpeed: 4.4,
      returning: false,
      returnAfter: 0,
      returnSpeed: 1,
      returnTimer: 0,
      explodeRadius: b.explodeRadius * 0.34,
      explodeDamage: b.explodeDamage * 0.34,
      freezeDuration: 0,
      noLifeExpire: false,
      knockback: 80,
      hitIds: new Set(),
      spin: Math.random() * TAU,
      trailTimer: 0,
    });
  }
}

function updateWeaponFx(dt) {
  for (let i = world.weaponFx.length - 1; i >= 0; i--) {
    const fx = world.weaponFx[i];
    if (fx.delay > 0) {
      fx.delay -= dt;
      if (fx.delay > 0) continue;
      if (fx.kind === "starConstellation" && !fx.damageDone) damageStarConstellation(fx);
    }
    if (fx.kind === "phaseNeedleMark") {
      updatePhaseNeedleMark(fx, dt);
      if (fx.done) {
        world.weaponFx.splice(i, 1);
        continue;
      }
      continue;
    }
    if (fx.kind === "riftLoom") updateRiftLoomFx(fx, dt);
    if (fx.kind === "riftScar") updateRiftScarDamage(fx, dt);
    if (fx.kind === "echoWave") updateEchoWaveDamage(fx, dt);
    if (fx.kind === "starScar") updateStarScarDamage(fx, dt);
    fx.life -= dt;
    if (fx.life <= 0) world.weaponFx.splice(i, 1);
  }
}

function updateRiftLoomFx(fx, dt) {
  fx.spin += fx.spinSpeed * dt;
  const progress = clamp(1 - fx.life / Math.max(0.01, fx.maxLife), 0, 1);
  fx.radius = fx.baseRadius * (1 - progress * 0.34);
  for (const [enemy, cd] of fx.hitCooldowns) {
    const next = cd - dt;
    if (next <= 0 || enemy.dead) fx.hitCooldowns.delete(enemy);
    else fx.hitCooldowns.set(enemy, next);
  }
  const points = riftLoomPoints(fx);
  const segments = riftLoomSegments(points, fx.rank);
  const hits = [];
  queryEnemies(fx.x, fx.y, fx.baseRadius + 80, hits);
  for (const e of hits) {
    if (e.dead || fx.hitCooldowns.has(e)) continue;
    let hit = null;
    for (const seg of segments) {
      const info = pointSegmentInfo(e.x, e.y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (info.t < -0.05 || info.t > 1.05 || info.distance > (e.r || 0) + fx.lineWidth) continue;
      hit = info;
      break;
    }
    if (!hit) continue;
    fx.hitCooldowns.set(e, 0.18);
    damageEnemy(e, fx.damage, hit.x, hit.y);
    applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 16 : 52);
    burst(hit.x, hit.y, 4 + fx.rank, fx.color, 130);
  }
  if (!fx.collapsed && fx.life <= dt + 0.02) {
    fx.collapsed = true;
    collapseRiftLoom(fx);
  }
}

function riftLoomPoints(fx) {
  const points = [];
  const wobble = Math.sin(state.time * 6 + (fx.seed || 0)) * 0.025;
  for (let i = 0; i < fx.anchors; i++) {
    const a = fx.spin + i * TAU / fx.anchors + wobble;
    const pulseRadius = fx.radius * (0.92 + Math.sin(state.time * 5 + i + (fx.seed || 0)) * 0.035);
    points.push({ x: fx.x + Math.cos(a) * pulseRadius, y: fx.y + Math.sin(a) * pulseRadius });
  }
  return points;
}

function riftLoomSegments(points, rank) {
  const segments = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  if (rank >= 2 && points.length >= 4) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 2) % points.length];
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, diagonal: true });
    }
  }
  return segments;
}

function collapseRiftLoom(fx) {
  addCameraShake(fx.rank >= 4 ? 5.8 : 3.6);
  const hits = [];
  queryEnemies(fx.x, fx.y, fx.baseRadius * 0.82, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const d = Math.max(1, Math.hypot(e.x - fx.x, e.y - fx.y));
    const falloff = clamp(1 - d / (fx.baseRadius * 0.82), 0.28, 1);
    damageEnemy(e, fx.collapseDamage * falloff, fx.x, fx.y);
    applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 26 : 95 * falloff);
  }
  world.weaponFx.push({
    kind: "riftCollapse",
    x: fx.x,
    y: fx.y,
    radius: fx.baseRadius,
    color: fx.color,
    rank: fx.rank,
    secondary: fx.secondary,
    life: fx.rank >= 4 ? 0.46 : 0.36,
    maxLife: fx.rank >= 4 ? 0.46 : 0.36,
    seed: fx.seed || Math.random() * 999,
  });
  world.weaponFx.push({
    kind: "riftAfterimage",
    x: fx.x,
    y: fx.y,
    segments: riftLoomSegments(riftLoomPoints(fx), fx.rank),
    color: fx.color,
    rank: fx.rank,
    life: 0.25,
    maxLife: 0.25,
    seed: fx.seed || Math.random() * 999,
  });
  burst(fx.x, fx.y, fx.rank >= 4 ? 24 : 16, fx.color, fx.rank >= 4 ? 280 : 210);
  if (fx.rank >= 3) {
    const points = riftLoomPoints(fx);
    world.weaponFx.push({
      kind: "riftScar",
      x: fx.x,
      y: fx.y,
      segments: riftLoomSegments(points, fx.rank),
      damage: fx.scarDamage,
      lineWidth: fx.lineWidth + 12,
      color: fx.color,
      rank: fx.rank,
      life: 0.45,
      maxLife: 0.45,
      hitIds: new Set(),
      seed: fx.seed || Math.random() * 999,
    });
  }
  playSfx("explode");
}

function updateRiftScarDamage(fx, dt) {
  const hits = [];
  queryEnemies(fx.x, fx.y, Math.max(80, Math.hypot(fx.segments?.[0]?.x1 - fx.x || 0, fx.segments?.[0]?.y1 - fx.y || 0) + 90), hits);
  for (const e of hits) {
    if (e.dead || fx.hitIds?.has(e)) continue;
    for (const seg of fx.segments || []) {
      const info = pointSegmentInfo(e.x, e.y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (info.t < -0.05 || info.t > 1.05 || info.distance > (e.r || 0) + fx.lineWidth) continue;
      fx.hitIds?.add(e);
      damageEnemy(e, fx.damage || 0, info.x, info.y);
      applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 10 : 34);
      break;
    }
  }
}

function updateEchoWaveDamage(fx, dt) {
  const progress = clamp(1 - fx.life / Math.max(0.01, fx.maxLife), 0, 1);
  const currentRadius = fx.radius * (0.16 + progress * 0.92);
  const band = 22 + (fx.rank || 0) * 3;
  const hits = [];
  queryEnemies(fx.x, fx.y, currentRadius + band + 48, hits);
  for (const e of hits) {
    if (e.dead || fx.hitIds?.has(e)) continue;
    const d = Math.max(1, Math.hypot(e.x - fx.x, e.y - fx.y));
    if (Math.abs(d - currentRadius) > band + (e.r || 0)) continue;
    fx.hitIds?.add(e);
    const falloff = clamp(1 - d / Math.max(1, fx.radius + band), 0.25, 1);
    damageEnemy(e, (fx.damage || 0) * falloff, fx.x, fx.y);
    applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 12 : 42);
    burst(e.x, e.y, 4 + (fx.rank || 0), fx.color, 110);
  }
}

function updatePhaseNeedleMark(fx, dt) {
  if (fx.target && !fx.target.dead) {
    fx.x = fx.target.x;
    fx.y = fx.target.y;
  }
  fx.timer -= dt;
  fx.life = Math.max(0, fx.timer);
  if (fx.timer > 0) return;
  detonatePhaseNeedleMark(fx);
  fx.done = true;
}

function detonatePhaseNeedleMark(fx) {
  addCameraShake(fx.major ? 4.2 : 2.4);
  const hits = [];
  queryEnemies(fx.x, fx.y, fx.radius, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const dx = e.x - fx.x;
    const dy = e.y - fx.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const falloff = clamp(1 - d / fx.radius, 0.25, 1);
    damageEnemy(e, (fx.damage || 0) * falloff, fx.x, fx.y);
    applyKnockback(e, dx, dy, e.boss ? 24 * falloff : 92 * falloff);
  }
  world.weaponFx.push({
    kind: "phaseNeedleBurst",
    x: fx.x,
    y: fx.y,
    radius: fx.radius,
    color: fx.color,
    rank: fx.rank || 0,
    major: fx.major,
    life: fx.major ? 0.46 : 0.36,
    maxLife: fx.major ? 0.46 : 0.36,
    seed: fx.seed || Math.random() * 999,
  });
  burst(fx.x, fx.y, fx.major ? 20 : 12, fx.color, fx.major ? 260 : 200);
  if ((fx.rank || 0) >= 2) createPhaseNeedleRift(fx);
  playSfx("explode");
}

function createPhaseNeedleRift(fx) {
  const segments = [];
  const count = fx.major ? 2 : 1;
  const len = fx.radius * (fx.major ? 1.35 : 1.05);
  for (let i = 0; i < count; i++) {
    const a = (fx.seed || 0) + i * Math.PI / 2;
    segments.push({
      x1: fx.x - Math.cos(a) * len,
      y1: fx.y - Math.sin(a) * len,
      x2: fx.x + Math.cos(a) * len,
      y2: fx.y + Math.sin(a) * len,
      seed: (fx.seed || 0) + i * 41,
    });
  }
  const hits = [];
  queryEnemies(fx.x, fx.y, len + 52, hits);
  for (const e of hits) {
    if (e.dead) continue;
    let touched = false;
    for (const seg of segments) {
      if (pointSegmentInfo(e.x, e.y, seg.x1, seg.y1, seg.x2, seg.y2).distance <= (e.r || 0) + (fx.major ? 32 : 24)) {
        touched = true;
        break;
      }
    }
    if (!touched) continue;
    damageEnemy(e, (fx.damage || 0) * (fx.major ? 0.42 : 0.28), fx.x, fx.y);
    applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 16 : 52);
  }
  world.weaponFx.push({
    kind: "phaseNeedleRift",
    x: fx.x,
    y: fx.y,
    radius: fx.radius,
    segments,
    color: fx.color,
    rank: fx.rank || 0,
    major: fx.major,
    life: 0.34,
    maxLife: 0.34,
    seed: fx.seed || Math.random() * 999,
  });
}

function updateStarScarDamage(fx, dt) {
  fx.tickTimer = (fx.tickTimer || 0) - dt;
  if (fx.tickTimer > 0) return;
  fx.tickTimer = 0.16;
  const hits = [];
  queryEnemies(fx.x, fx.y, fx.radius, hits);
  for (const e of hits) {
    if (e.dead) continue;
    const d = Math.max(1, Math.hypot(e.x - fx.x, e.y - fx.y));
    const falloff = clamp(1 - d / fx.radius, 0.2, 1);
    damageEnemy(e, (fx.damagePerSecond || 0) * 0.16 * falloff, fx.x, fx.y);
  }
}

function damageStarConstellation(fx) {
  fx.damageDone = true;
  const hits = [];
  queryEnemies(fx.x, fx.y, fx.radius, hits);
  for (const e of hits) {
    if (e.dead) continue;
    let nearLine = false;
    for (let i = 0; i < (fx.points?.length || 0); i++) {
      const a = fx.points[i];
      const b = fx.points[(i + 1) % fx.points.length];
      if (pointSegmentInfo(e.x, e.y, a.x, a.y, b.x, b.y).distance <= (e.r || 0) + 28) {
        nearLine = true;
        break;
      }
    }
    if (!nearLine) continue;
    damageEnemy(e, fx.damage || 0, e.x, e.y);
    applyKnockback(e, e.x - fx.x, e.y - fx.y, e.boss ? 20 : 58);
  }
}
