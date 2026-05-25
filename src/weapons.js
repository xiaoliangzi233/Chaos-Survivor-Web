import { PROJECTILE_LIMIT, TAU } from "./constants.js";
import { state, world } from "./state.js";
import { angleDiff, circleHit, clamp } from "./utils.js";
import { damageEnemy, nearestEnemy, queryEnemies } from "./entities.js";
import { burst, pulse, trail } from "./effects.js";
import { playTone } from "./audio.js";

export const STARTER_WEAPONS = [
  { id: "bolt", icon: "✦", name: "棱镜电弧", desc: "自动锁定最近敌人，发射高亮能量弹。" },
  { id: "dagger", icon: "⟡", name: "像素飞刀", desc: "向移动方向发射穿透飞刀，适合开路。" },
  { id: "ice", icon: "❄", name: "霜晶追踪", desc: "追踪冰晶会自动转向，持续追猎目标。" },
  { id: "missile", icon: "◆", name: "核心飞弹", desc: "追踪飞弹命中后爆炸，清理密集怪群。" },
  { id: "boomerang", icon: "✧", name: "霓虹回旋刃", desc: "回旋刃飞出后返回，双向切割敌人。" },
  { id: "orb", icon: "●", name: "星环旋转球", desc: "酷炫能量球环绕玩家旋转，持续切割近身敌人。" },
];

export const UPGRADE_DEFS = [
  { id: "bolt", icon: "✦", name: "电弧超频", desc: "棱镜电弧伤害提高，冷却缩短。", apply: () => { activateWeapon("bolt"); const w = state.weapons.bolt; w.damage += 7; w.cooldown = Math.max(0.18, w.cooldown * 0.86); } },
  { id: "dagger", icon: "⟡", name: "飞刀矩阵", desc: "增加飞刀数量并提高穿透伤害。", apply: () => { activateWeapon("dagger"); const w = state.weapons.dagger; w.count = Math.min(5, w.count + 1); w.damage += 4; } },
  { id: "ice", icon: "❄", name: "霜晶折射", desc: "冰晶数量、伤害和转向能力提升。", apply: () => { activateWeapon("ice"); const w = state.weapons.ice; w.count = Math.min(4, w.count + 1); w.damage += 5; w.cooldown = Math.max(0.42, w.cooldown * 0.9); } },
  { id: "missile", icon: "◆", name: "飞弹裂变", desc: "飞弹爆炸范围伤害提高。", apply: () => { activateWeapon("missile"); const w = state.weapons.missile; w.damage += 8; w.explodeDamage += 7; w.cooldown = Math.max(0.85, w.cooldown * 0.9); } },
  { id: "boomerang", icon: "✧", name: "回旋增幅", desc: "回旋刃数量和伤害提高。", apply: () => { activateWeapon("boomerang"); const w = state.weapons.boomerang; w.count = Math.min(4, w.count + 1); w.damage += 5; } },
  { id: "orb", icon: "●", name: "星环聚变", desc: "旋转球数量增加，旋转半径和伤害提升。", apply: () => { activateWeapon("orb"); const w = state.weapons.orb; w.count = Math.min(8, w.count + 1); w.damage += 5; w.radius += 6; } },
  { id: "pulse", icon: "◎", name: "脉冲新星", desc: "周期性范围爆发更强、更大。", apply: () => { activateWeapon("pulse"); const w = state.weapons.pulse; w.damage += 9; w.radius += 16; w.cooldown = Math.max(1.4, w.cooldown * 0.9); } },
  { id: "speed", icon: "↯", name: "相位步", desc: "移动速度提高，拾取半径扩大。", apply: () => { state.player.speed += 18; state.player.magnet += 10; } },
  { id: "guard", icon: "▣", name: "晶盾增幅", desc: "最大生命提高并立即恢复生命。", apply: () => { state.player.maxHp += 18; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 42); } },
  { id: "crit", icon: "✹", name: "裂解算法", desc: "所有武器伤害提高。", apply: () => { state.player.damageScale += 0.14; } },
];

export function activateWeapon(id) {
  if (state.weapons[id] && state.weapons[id].level <= 0) state.weapons[id].level = 1;
}

export function updateWeapons(dt) {
  const p = state.player;
  const w = state.weapons;
  fireAuto(w.bolt, dt, () => {
    const target = nearestEnemy(p.x, p.y, 760);
    if (!target) return;
    fireProjectile(Math.atan2(target.y - p.y, target.x - p.x), w.bolt, { shape: "ball", color: "#42e8ff", pierce: 1, radius: 4, life: 1.4 });
    playTone(360, 0.025, "square");
  });
  fireAuto(w.dagger, dt, () => {
    const base = Math.atan2(p.dirY, p.dirX);
    for (let i = 0; i < w.dagger.count; i++) fireProjectile(base + (i - (w.dagger.count - 1) / 2) * 0.18, w.dagger, { shape: "dagger", color: "#f3f7ff", pierce: 3, radius: 3, speed: 680, life: 0.8 });
  });
  fireAuto(w.ice, dt, () => {
    const target = nearestEnemy(p.x, p.y, 820);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
    for (let i = 0; i < w.ice.count; i++) fireProjectile(base + (i - (w.ice.count - 1) / 2) * 0.22, w.ice, { shape: "ice", color: "#9ff4ff", tracking: true, turnSpeed: w.ice.turnSpeed, pierce: 1, radius: 4, life: 2.2 });
  });
  fireAuto(w.missile, dt, () => {
    const target = nearestEnemy(p.x, p.y, 900);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.dirY, p.dirX);
    fireProjectile(base, w.missile, { shape: "missile", color: "#ffb347", tracking: true, turnSpeed: w.missile.turnSpeed, pierce: 1, radius: 5, life: 2.6, explodeRadius: w.missile.explodeRadius, explodeDamage: w.missile.explodeDamage });
  });
  fireAuto(w.boomerang, dt, () => {
    const base = Math.atan2(p.dirY, p.dirX);
    for (let i = 0; i < w.boomerang.count; i++) fireProjectile(base + (i - (w.boomerang.count - 1) / 2) * 0.35, w.boomerang, { shape: "boomerang", color: "#ff65d8", returning: true, returnAfter: w.boomerang.returnAfter, returnSpeed: w.boomerang.returnSpeed, pierce: 5, radius: 5, speed: w.boomerang.speed, life: 1.6 });
  });
  updateOrbWeapon(dt);
  updatePulseWeapon(dt);
  updateProjectiles(dt);
}

function fireAuto(w, dt, fn) {
  if (!w || w.level <= 0) return;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer += w.cooldown;
    fn();
  }
}

function fireProjectile(angle, w, opt) {
  if (world.projectiles.length >= PROJECTILE_LIMIT) return;
  const p = state.player;
  const speed = opt.speed || w.speed || 520;
  world.projectiles.push({ x: p.x, y: p.y, px: p.x - Math.cos(angle) * 16, py: p.y - Math.sin(angle) * 16, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed, angle, damage: w.damage, pierce: opt.pierce, r: opt.radius, life: opt.life, maxLife: opt.life, color: opt.color, shape: opt.shape, tracking: opt.tracking, turnSpeed: opt.turnSpeed || 3, returning: opt.returning, returnAfter: opt.returnAfter || 0.35, returnSpeed: opt.returnSpeed || 1, returnTimer: 0, explodeRadius: opt.explodeRadius || 0, explodeDamage: opt.explodeDamage || 0, hitIds: new Set(), spin: Math.random() * TAU, trailTimer: 0 });
  pulse(p.x, p.y, 18, opt.color, 0.14);
}

function updateProjectiles(dt) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const b = world.projectiles[i];
    b.px = b.x; b.py = b.y;
    steer(b, dt);
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.trailTimer -= dt;
    if (b.trailTimer <= 0) { b.trailTimer = 0.035; trail(b.x, b.y, b.px, b.py, b.color, b.shape === "dagger" ? 3 : 5); }
    const hits = [];
    queryEnemies(b.x, b.y, b.r + 28, hits);
    for (const e of hits) {
      if (b.pierce <= 0 || b.hitIds.has(e)) continue;
      if (circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
        b.hitIds.add(e); b.pierce--; damageEnemy(e, b.damage, b.x, b.y); burst(b.x, b.y, 8, b.color, 180);
        if (b.explodeRadius) explode(b);
      }
    }
    if (b.life <= 0 || b.pierce <= 0) world.projectiles.splice(i, 1);
  }
}

function steer(b, dt) {
  if (b.tracking) {
    const target = nearestEnemy(b.x, b.y, 900);
    if (target) turnToward(b, Math.atan2(target.y - b.y, target.x - b.x), dt, b.turnSpeed, b.speed);
  }
  if (b.returning) {
    b.returnTimer += dt;
    if (b.returnTimer >= b.returnAfter) turnToward(b, Math.atan2(state.player.y - b.y, state.player.x - b.x), dt, b.returnSpeed * 4, b.speed * b.returnSpeed);
  }
  b.angle = Math.atan2(b.vy, b.vx);
}

function turnToward(b, target, dt, turnSpeed, speed) {
  const current = Math.atan2(b.vy, b.vx);
  const next = current + angleDiff(target, current) * Math.min(1, turnSpeed * dt);
  b.vx = Math.cos(next) * speed; b.vy = Math.sin(next) * speed;
}

function explode(b) {
  const hits = [];
  queryEnemies(b.x, b.y, b.explodeRadius, hits);
  for (const e of hits) if (!b.hitIds.has(e)) damageEnemy(e, b.explodeDamage * clamp(1 - Math.hypot(e.x - b.x, e.y - b.y) / b.explodeRadius, 0, 1), b.x, b.y);
  pulse(b.x, b.y, b.explodeRadius, b.color, 0.28);
}

function updateOrbWeapon(dt) {
  const w = state.weapons.orb;
  if (!w || w.level <= 0) return;
  w.angle += dt * (2.7 + w.level * 0.25);
  const p = state.player;
  const hits = [];
  for (let i = 0; i < w.count; i++) {
    const a = w.angle + (i / w.count) * TAU;
    const x = p.x + Math.cos(a) * w.radius;
    const y = p.y + Math.sin(a) * w.radius;
    trail(x, y, p.x + Math.cos(a - 0.16) * w.radius, p.y + Math.sin(a - 0.16) * w.radius, "#ffd166", 8);
    queryEnemies(x, y, 30, hits);
    for (const e of hits) if (e.hitTimer <= 0 && circleHit(x, y, 16, e.x, e.y, e.r)) { damageEnemy(e, w.damage, x, y); e.hitTimer = w.hitCd; pulse(x, y, 24, "#ffd166", 0.12); }
    hits.length = 0;
  }
}

function updatePulseWeapon(dt) {
  const w = state.weapons.pulse;
  if (!w || w.level <= 0) return;
  w.timer -= dt;
  if (w.timer > 0) return;
  w.timer += w.cooldown;
  const hits = [];
  queryEnemies(state.player.x, state.player.y, w.radius, hits);
  for (const e of hits) damageEnemy(e, w.damage, e.x, e.y);
  pulse(state.player.x, state.player.y, w.radius, "#77ff8a", 0.34);
}
