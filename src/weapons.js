import { PROJECTILE_LIMIT, TAU, WORLD_SIZE } from "./constants.js";
import { state, world } from "./state.js";
import { angleDiff, circleHit, clamp, distSq } from "./utils.js";
import { applyKnockback, damageEnemy, nearestEnemy, queryEnemies } from "./entities.js";
import { burst, pulse, trail } from "./effects.js";
import { playSfx } from "./audio.js";

export const STARTER_WEAPONS = [
  { id: "arc", icon: "⚡", name: "棱镜电弧", desc: "自动锁定最近敌人，闪电会在附近目标间连续传导。" },
  { id: "ice", icon: "❄", name: "霜晶追踪", desc: "追踪冰晶会持续转向追猎，命中后短暂冻结未死亡目标。" },
  { id: "missile", icon: "◆", name: "核心飞弹", desc: "追踪飞弹命中后产生范围爆炸，适合清理密集怪群。" },
  { id: "boomerang", icon: "✧", name: "霓虹回旋刃", desc: "远距离飞出后高速回收，往返切割同一路径上的敌人。" },
  { id: "drone", icon: "◈", name: "星环无人机", desc: "无人机会离身攻击，电量不足时返回玩家身边充电。" },
];

export const UPGRADE_DEFS = [
  { id: "arc", icon: "⚡", name: "电弧增幅", desc: "棱镜电弧伤害提高，传导次数增加。", apply: () => { activateWeapon("arc"); const w = state.weapons.arc; w.damage += 6; w.chains = Math.min(7, w.chains + 1); w.cooldown = Math.max(0.34, w.cooldown * 0.88); } },
  { id: "ice", icon: "❄", name: "霜晶折射", desc: "冰晶数量、伤害、冻结时间和转向能力提升。", apply: () => { activateWeapon("ice"); const w = state.weapons.ice; w.count = Math.min(4, w.count + 1); w.damage += 5; w.turnSpeed += 0.55; w.freezeDuration = Math.min(1.1, w.freezeDuration + 0.12); w.cooldown = Math.max(0.46, w.cooldown * 0.9); } },
  { id: "missile", icon: "◆", name: "飞弹裂变", desc: "核心飞弹爆炸范围和爆炸伤害提高。", apply: () => { activateWeapon("missile"); const w = state.weapons.missile; w.damage += 7; w.explodeDamage += 8; w.explodeRadius += 12; w.cooldown = Math.max(0.92, w.cooldown * 0.9); } },
  { id: "boomerang", icon: "✧", name: "回旋增幅", desc: "霓虹回旋刃数量、伤害和飞行距离提高。", apply: () => { activateWeapon("boomerang"); const w = state.weapons.boomerang; w.count = Math.min(4, w.count + 1); w.damage += 5; w.returnAfter = Math.min(0.9, w.returnAfter + 0.08); } },
  { id: "drone", icon: "◈", name: "无人机编队", desc: "增加无人机数量，提高弹幕伤害和电池容量。", apply: () => { activateWeapon("drone"); const w = state.weapons.drone; w.count = Math.min(5, w.count + 1); w.bulletDamage += 3; w.batteryMax += 12; w.fireCooldown = Math.max(0.24, w.fireCooldown * 0.92); } },
  { id: "pulse", icon: "◎", name: "脉冲新星", desc: "周期性范围爆发更强、更大。", apply: () => { activateWeapon("pulse"); const w = state.weapons.pulse; w.damage += 9; w.radius += 16; w.cooldown = Math.max(1.4, w.cooldown * 0.9); } },
  { id: "speed", icon: "→", name: "相位步", desc: "移动速度提高，拾取半径扩大。", apply: () => { state.player.speed += 18; state.player.magnet += 10; } },
  { id: "guard", icon: "▣", name: "晶盾增幅", desc: "最大生命提高，并立即恢复生命。", apply: () => { state.player.maxHp += 18; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 42); } },
  { id: "crit", icon: "✦", name: "裂解算法", desc: "所有武器伤害提高。", apply: () => { state.player.damageScale += 0.14; } },
];

export function activateWeapon(id) {
  if (state.weapons[id] && state.weapons[id].level <= 0) state.weapons[id].level = 1;
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

function updateArcWeapon(dt) {
  const w = state.weapons.arc;
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const first = nearestEnemy(p.x, p.y, w.range);
  if (!first) return;

  const visited = new Set();
  const segments = [];
  let source = { x: p.x, y: p.y };
  let target = first;
  let damage = w.damage;

  for (let i = 0; i < w.chains && target; i++) {
    visited.add(target);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    segments.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, seed: Math.random() * 999 });
    damageEnemy(target, damage, target.x, target.y);
    applyKnockback(target, dx, dy, 70);
    burst(target.x, target.y, 6, "#42e8ff", 150);
    source = target;
    damage *= w.falloff;
    target = nextChainTarget(source, w.chainRange, visited);
  }

  world.weaponFx.push({ kind: "arc", segments, life: 0.18, maxLife: 0.18, color: "#42e8ff" });
  pulse(first.x, first.y, 30, "#42e8ff", 0.12);
  playSfx("shoot");
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
  const target = nearestEnemy(p.x, p.y, 860);
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  for (let i = 0; i < w.count; i++) {
    fireProjectile(base + (i - (w.count - 1) / 2) * 0.24, w, {
      shape: "ice",
      color: "#9ff4ff",
      tracking: true,
      turnSpeed: w.turnSpeed,
      pierce: 1,
      radius: 5,
      life: 2.4,
      freezeDuration: w.freezeDuration,
      knockback: 92,
    });
  }
  playSfx("shoot");
}

function updateMissileWeapon(dt) {
  const w = state.weapons.missile;
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const target = nearestEnemy(p.x, p.y, 960);
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  fireProjectile(base, w, {
    shape: "missile",
    color: "#ffb347",
    tracking: true,
    turnSpeed: w.turnSpeed,
    pierce: 1,
    radius: 6,
    life: 18,
    noLifeExpire: true,
    explodeRadius: w.explodeRadius,
    explodeDamage: w.explodeDamage,
    knockback: 145,
  });
  playSfx("shoot");
}

function updateBoomerangWeapon(dt) {
  const w = state.weapons.boomerang;
  if (!tickWeapon(w, dt)) return;
  const p = state.player;
  const target = nearestEnemy(p.x, p.y, 720);
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
  for (let i = 0; i < w.count; i++) {
    fireProjectile(base + (i - (w.count - 1) / 2) * 0.34, w, {
      shape: "boomerang",
      color: "#ff65d8",
      returning: true,
      returnAfter: w.returnAfter,
      returnSpeed: w.returnSpeed,
      pierce: 7,
      radius: 7,
      speed: w.speed,
      life: 2.35,
      knockback: 118,
    });
  }
  playSfx("shoot");
}

function updateDroneWeapon(dt) {
  const w = state.weapons.drone;
  if (!w || w.level <= 0) return;
  const p = state.player;
  syncDrones(w);
  w.angle += dt * (1.85 + w.level * 0.12);

  for (let i = 0; i < w.drones.length; i++) {
    const d = w.drones[i];
    const orbitAngle = w.angle + (i / w.drones.length) * TAU;
    const orbitX = p.x + Math.cos(orbitAngle) * w.orbitRadius;
    const orbitY = p.y + Math.sin(orbitAngle) * w.orbitRadius;
    const target = nearestEnemy(d.x, d.y, w.acquireRange);
    d.fireTimer = Math.max(0, d.fireTimer - dt);
    d.anim += dt;
    d.energy = Math.min(w.batteryMax, d.energy ?? w.batteryMax);

    const shouldRecharge = !target || d.energy < w.shotCost || d.mode === "recharge";
    if (shouldRecharge) {
      d.mode = d.energy >= w.batteryMax && target ? "attack" : "recharge";
      d.targetId = null;
      moveDrone(d, orbitX, orbitY, dt, 460);
      if (distSq(d.x, d.y, orbitX, orbitY) < 28 * 28) {
        d.energy = Math.min(w.batteryMax, d.energy + w.rechargeRate * dt);
      }
      if (d.energy < w.batteryMax || !target) {
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
      if (d.fireTimer <= 0 && distSq(d.x, d.y, target.x, target.y) <= w.attackRange * w.attackRange) {
        d.fireTimer = w.fireCooldown;
        d.energy = Math.max(0, d.energy - w.shotCost);
        const a = Math.atan2(target.y - d.y, target.x - d.x);
        fireDroneBullet(d.x, d.y, a, w);
        world.weaponFx.push({ kind: "muzzle", x: d.x, y: d.y, angle: a, life: 0.1, maxLife: 0.1, color: "#77ff8a" });
        playSfx("shoot");
      }
    }

    trail(d.x, d.y, d.prevX, d.prevY, d.mode === "attack" ? "#77ff8a" : "#ffd166", 5);
  }
}

function syncDrones(w) {
  const p = state.player;
  while (w.drones.length < w.count) {
    const a = w.angle + (w.drones.length / Math.max(1, w.count)) * TAU;
    w.drones.push({
      x: p.x + Math.cos(a) * w.orbitRadius,
      y: p.y + Math.sin(a) * w.orbitRadius,
      prevX: p.x,
      prevY: p.y,
      mode: "orbit",
      fireTimer: Math.random() * w.fireCooldown,
      energy: w.batteryMax,
      anim: Math.random() * TAU,
      targetId: null,
    });
  }
  if (w.drones.length > w.count) w.drones.length = w.count;
  for (const d of w.drones) d.energy = Math.min(w.batteryMax, d.energy ?? w.batteryMax);
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

function fireDroneBullet(x, y, angle, w) {
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const speed = w.bulletSpeed;
  world.projectiles.push({
    x, y, px: x, py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    angle,
    damage: w.bulletDamage,
    pierce: 1,
    r: 4,
    life: 0.95,
    maxLife: 0.95,
    color: "#77ff8a",
    shape: "droneBolt",
    tracking: false,
    turnSpeed: 0,
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

function updatePulseWeapon(dt) {
  const w = state.weapons.pulse;
  if (!tickWeapon(w, dt)) return;
  const hits = [];
  queryEnemies(state.player.x, state.player.y, w.radius, hits);
  for (const e of hits) {
    damageEnemy(e, w.damage, e.x, e.y);
    applyKnockback(e, e.x - state.player.x, e.y - state.player.y, 105);
  }
  pulse(state.player.x, state.player.y, w.radius, "#77ff8a", 0.34);
  world.weaponFx.push({ kind: "pulse", x: state.player.x, y: state.player.y, radius: w.radius, life: 0.32, maxLife: 0.32, color: "#77ff8a" });
  playSfx("explode");
}

function tickWeapon(w, dt) {
  if (!w || w.level <= 0) return false;
  w.timer -= dt;
  if (w.timer > 0) return false;
  w.timer += w.cooldown;
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
    damage: w.damage,
    pierce: opt.pierce,
    r: opt.radius,
    life: opt.life,
    maxLife: opt.life,
    color: opt.color,
    shape: opt.shape,
    tracking: opt.tracking,
    turnSpeed: opt.turnSpeed || 3,
    returning: opt.returning,
    returnAfter: opt.returnAfter || 0.35,
    returnSpeed: opt.returnSpeed || 1,
    returnTimer: 0,
    explodeRadius: opt.explodeRadius || 0,
    explodeDamage: opt.explodeDamage || 0,
    freezeDuration: opt.freezeDuration || 0,
    noLifeExpire: opt.noLifeExpire || false,
    knockback: opt.knockback || 80,
    hitIds: new Set(),
    spin: Math.random() * TAU,
    trailTimer: 0,
  });
  pulse(sx, sy, 16, opt.color, 0.13);
}

function updateProjectiles(dt) {
  const half = WORLD_SIZE / 2 + 280;
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

    const hits = [];
    queryEnemies(b.x, b.y, b.r + 30, hits);
    for (const e of hits) {
      if (b.pierce <= 0 || b.hitIds.has(e)) continue;
      if (!circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) continue;
      b.hitIds.add(e);
      b.pierce--;
      damageEnemy(e, b.damage, b.x, b.y);
      applyKnockback(e, b.vx, b.vy, b.knockback);
      if (b.freezeDuration > 0 && !e.dead && !e.boss) e.freezeTimer = Math.max(e.freezeTimer || 0, b.freezeDuration);
      burst(b.x, b.y, b.shape === "ice" ? 12 : 8, b.color, b.shape === "missile" ? 220 : 170);
      world.weaponFx.push({ kind: b.shape === "ice" ? "iceHit" : "hit", x: b.x, y: b.y, life: 0.18, maxLife: 0.18, color: b.color });
      playSfx("hit");
      if (b.explodeRadius) {
        explode(b);
        playSfx("explode");
        b.pierce = 0;
      }
    }

    const expired = !b.noLifeExpire && b.life <= 0;
    if (expired || b.pierce <= 0 || Math.abs(b.x) > half || Math.abs(b.y) > half) world.projectiles.splice(i, 1);
  }
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
}

function updateWeaponFx(dt) {
  for (let i = world.weaponFx.length - 1; i >= 0; i--) {
    const fx = world.weaponFx[i];
    fx.life -= dt;
    if (fx.life <= 0) world.weaponFx.splice(i, 1);
  }
}
