import { PROJECTILE_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { angleDiff, circleHit, clamp, distSq } from "../utils.js";
import { applyKnockback, damageEnemy, nearestEnemy, queryEnemies } from "./entities.js";
import { burst, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { addWeaponToInventory, QUALITY_INFO, QUALITY_ORDER, WEAPON_INFO } from "../economy/inventory.js";
import { attackSpeedMultiplier, projectileBonus, weaponRangeBonus } from "./items.js";

export const STARTER_WEAPONS = ["arc", "ice", "missile", "boomerang", "drone"].map((id) => ({ id, ...WEAPON_INFO[id] }));

export const UPGRADE_DEFS = [
  { id: "speed", icon: "➜", name: "相位步", desc: "移动速度提高，拾取半径扩大。", apply: () => { state.player.speed += 18; state.player.magnet += 10; } },
  { id: "guard", icon: "▰", name: "晶盾增幅", desc: "最大生命提高，并立即恢复生命。", apply: () => { state.player.maxHp += 18; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 42); } },
  { id: "crit", icon: "✦", name: "裂解算法", desc: "所有武器伤害提高。", apply: () => { state.player.damageScale += 0.14; } },
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
  updatePulseWeapon(dt);
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
  return value * (w.qualityMult || 1);
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
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const first = nearestEnemy(p.x, p.y, w.range + weaponRangeBonus());
  if (!first) return;

  const rank = qualityRank(w);
  const color = qualityColor(w, "#42e8ff");
  const visited = new Set();
  const segments = [];
  let source = { x: p.x, y: p.y };
  let target = first;
  let damage = weaponPower(w, w.damage);
  const chains = w.chains + (rank >= 1 ? 1 : 0);

  for (let i = 0; i < chains && target; i++) {
    visited.add(target);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    segments.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, seed: Math.random() * 999 });
    damageEnemy(target, damage, target.x, target.y);
    applyKnockback(target, dx, dy, 70);
    burst(target.x, target.y, 6, color, 150);
    if (rank >= 2) arcMicroBurst(target, damage * 0.22, color, visited);
    if (rank >= 3 && i === 0) arcShockBurst(target, damage * 0.34, color);
    source = target;
    damage *= w.falloff;
    target = nextChainTarget(source, w.chainRange + weaponRangeBonus() * 0.35, visited);
  }

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
      segments: [{ x1: source.x, y1: source.y, x2: e.x, y2: e.y, seed: Math.random() * 999 }],
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
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const rank = qualityRank(w);
  const target = nearestEnemy(p.x, p.y, w.range + weaponRangeBonus());
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  const count = w.count + (rank >= 1 ? 1 : 0) + projectileBonus();
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
      tracking: true,
      turnSpeed: w.turnSpeed,
      pierce: shotRank >= 3 ? 2 : 1,
      radius: shotRank >= 1 ? 5.8 : 5,
      life: 2.4,
      freezeDuration: w.freezeDuration + shotRank * 0.05,
      knockback: 92,
      iceRing: shotRank >= 2,
      frostZone: shotRank >= 4,
      damage: weaponPower(shot, w.damage),
    });
  }
  playSfx("shoot");
}

function updateMissileWeapon(dt) {
  const w = state.weapons.missile;
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const rank = qualityRank(w);
  const color = qualityColor(w, "#ffb347");
  const target = nearestEnemy(p.x, p.y, w.range + weaponRangeBonus());
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  const count = 1 + projectileBonus();
  for (let i = 0; i < count; i++) {
    fireProjectile(base + (i - (count - 1) / 2) * 0.18, w, {
      shape: "missile",
      variant: rank >= 4 ? "legendMissile" : rank >= 1 ? "burnMissile" : "missile",
      quality: w.quality,
      color,
      tracking: true,
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
    });
  }
  playSfx("shoot");
}

function updateBoomerangWeapon(dt) {
  const w = state.weapons.boomerang;
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const target = nearestEnemy(p.x, p.y, w.range + weaponRangeBonus());
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  const count = w.count + projectileBonus();
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
      damage: weaponPower(shot, w.damage),
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
    const target = nearestEnemy(d.x, d.y, w.acquireRange + weaponRangeBonus());
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
      const attackRange = w.attackRange + weaponRangeBonus();
      if (d.fireTimer <= 0 && distSq(d.x, d.y, target.x, target.y) <= attackRange * attackRange) {
        d.fireTimer = w.fireCooldown / attackSpeedMultiplier();
        d.energy = Math.max(0, d.energy - w.shotCost);
        const a = Math.atan2(target.y - d.y, target.x - d.x);
        if (d.qualityRank >= 4 && d.legendReady) {
          fireDroneBeam(d, target, w, d.color, true);
          d.legendReady = false;
        } else {
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
  const rank = drone?.qualityRank ?? qualityRank(w);
  const color = drone?.color ?? qualityColor(w, "#77ff8a");
  const quality = drone?.quality || w.quality || "common";
  const qualityMult = drone?.qualityMult || w.qualityMult || 1;
  const speed = w.bulletSpeed;
  const count = 1 + projectileBonus();
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
      damage: w.bulletDamage * qualityMult,
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

function fireDroneBeam(drone, target, w, color, legendary) {
  const damage = w.bulletDamage * (drone.qualityMult || w.qualityMult || 1) * (legendary ? 3.4 : 1.45);
  damageEnemy(target, damage, drone.x, drone.y);
  applyKnockback(target, target.x - drone.x, target.y - drone.y, legendary ? 180 : 95);
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
  });
}

function updatePulseWeapon(dt) {
  const w = state.weapons.pulse;
  if (!tickWeapon(w, dt)) return;
  const rank = qualityRank(w);
  const color = qualityColor(w, "#77ff8a");
  const radius = w.radius + (rank >= 1 ? 18 : 0) + weaponRangeBonus() * 0.25;
  const hits = [];
  queryEnemies(state.player.x, state.player.y, radius, hits);
  for (const e of hits) {
    damageEnemy(e, weaponPower(w, w.damage), e.x, e.y);
    applyKnockback(e, e.x - state.player.x, e.y - state.player.y, 105);
  }
  if (rank >= 2) {
    const outer = [];
    queryEnemies(state.player.x, state.player.y, radius + 42, outer);
    for (const e of outer) {
      if (hits.includes(e)) continue;
      damageEnemy(e, weaponPower(w, w.damage) * 0.42, state.player.x, state.player.y);
      applyKnockback(e, e.x - state.player.x, e.y - state.player.y, 82);
    }
  }
  if (rank >= 3 && hits.length >= 5) w.timer = Math.max(0.55, w.timer - Math.min(0.42, hits.length * 0.025));
  w.pulseCount = (w.pulseCount || 0) + 1;
  const doublePulse = rank >= 4 && w.pulseCount % 3 === 0;
  pulse(state.player.x, state.player.y, radius, color, 0.34);
  world.weaponFx.push({ kind: doublePulse ? "doublePulse" : "pulse", x: state.player.x, y: state.player.y, radius, life: 0.36, maxLife: 0.36, color });
  playSfx("explode");
}

function tickWeapon(w, dt) {
  if (!w || w.level <= 0) return false;
  w.timer -= dt;
  if (w.timer > 0) return false;
  w.timer += w.cooldown / attackSpeedMultiplier();
  return true;
}

function fireProjectile(angle, w, opt) {
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const p = state.player;
  const speed = opt.speed || w.speed || 520;
  const sx = p.x + Math.cos(angle) * 12;
  const sy = p.y + Math.sin(angle) * 12;
  world.projectiles.push({
    x: sx,
    y: sy,
    px: p.x,
    py: p.y,
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
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
  });
  pulse(sx, sy, 16, opt.color, 0.13);
}

function updateProjectiles(dt) {
  const half = WORLD_SIZE / 2 + 280;
  const hits = [];
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const b = world.projectiles[i];
    b.px = b.x;
    b.py = b.y;
    steer(b, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    b.spin += dt * (b.shape === "boomerang" ? 18 : 7);
    b.trailTimer -= dt;
    if (b.trailTimer <= 0) {
      b.trailTimer = b.shape === "missile" ? 0.026 : 0.035;
      trail(b.x, b.y, b.px, b.py, b.color, b.shape === "droneBolt" ? 3 : 5);
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
      if (b.freezeDuration > 0 && !e.dead && !e.boss) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration);
      burst(b.x, b.y, b.shape === "ice" ? 12 : 8, b.color, b.shape === "missile" ? 220 : 170);
      world.weaponFx.push({ kind: b.shape === "ice" ? "iceHit" : "hit", x: b.x, y: b.y, life: 0.18, maxLife: 0.18, color: b.color });
      if (b.shape === "ice" && b.iceRing) iceRingBurst(b);
      if (b.shape === "ice" && b.frostZone && !e.dead) frostZone(b);
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

function iceRingBurst(b) {
  const hits = [];
  queryEnemies(b.x, b.y, 78, hits);
  for (const e of hits) {
    if (b.hitIds.has(e) || e.dead) continue;
    damageEnemy(e, b.damage * 0.28, b.x, b.y);
    applyKnockback(e, e.x - b.x, e.y - b.y, 52);
    if (!e.boss) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration * 0.55);
  }
  world.weaponFx.push({ kind: "shockRing", x: b.x, y: b.y, radius: 78, life: 0.24, maxLife: 0.24, color: b.color });
}

function frostZone(b) {
  const radius = 92;
  const hits = [];
  queryEnemies(b.x, b.y, radius, hits);
  for (const e of hits) {
    if (e.dead || e.boss) continue;
    e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration * 0.75);
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
    fx.life -= dt;
    if (fx.life <= 0) world.weaponFx.splice(i, 1);
  }
}
