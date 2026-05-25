import { CELL_SIZE, ENEMY_LIMIT, GEM_LIMIT, TAU, WORLD_SIZE } from "./constants.js";
import { state, world, input } from "./state.js";
import { clamp, distSq, circleHit } from "./utils.js";
import { burst, dust } from "./effects.js";
import { playTone } from "./audio.js";

export function updatePlayer(dt) {
  const p = state.player;
  let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.vx;
  let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.vy;
  const len = Math.hypot(vx, vy);
  if (len > 0.001) {
    vx /= len;
    vy /= len;
    p.dirX = vx;
    p.dirY = vy;
    p.x += vx * p.speed * dt;
    p.y += vy * p.speed * dt;
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      p.trailTimer = 0.055;
      dust(p.x - vx * 12, p.y - vy * 12, -vx, -vy);
    }
  }
  const half = WORLD_SIZE / 2 - 60;
  p.x = clamp(p.x, -half, half);
  p.y = clamp(p.y, -half, half);
  p.invuln = Math.max(0, p.invuln - dt);
}

export function updateSpawning(dt) {
  const danger = state.wave / 20;
  state.spawnBudget += dt * (3.8 + danger * 12 + state.wave * 0.45);
  while (state.spawnBudget >= 1 && world.enemies.length < ENEMY_LIMIT) {
    state.spawnBudget--;
    const roll = Math.random();
    if (state.wave >= 9 && roll < 0.2) spawnEnemy("tank");
    else if (state.wave >= 5 && roll < 0.36) spawnEnemy("runner");
    else if (state.wave >= 3 && roll < 0.5) spawnEnemy("splitter");
    else spawnEnemy("chaser");
  }
}

export function spawnEnemy(type) {
  const angle = Math.random() * TAU;
  const dist = 720 + Math.random() * 180;
  const p = state.player;
  const e = { type, dead: false, x: p.x + Math.cos(angle) * dist, y: p.y + Math.sin(angle) * dist, hitTimer: 0, flash: 0, anim: Math.random() * TAU, flip: Math.cos(angle) > 0 ? -1 : 1 };
  const scale = 1 + state.wave * 0.08;
  if (type === "runner") Object.assign(e, { r: 12, hp: 34 * scale, maxHp: 34 * scale, speed: 118 + state.wave * 2.5, damage: 12, xp: 4, color: "#ffd166" });
  else if (type === "tank") Object.assign(e, { r: 24, hp: 150 * scale, maxHp: 150 * scale, speed: 48 + state.wave, damage: 24, xp: 15, color: "#b48cff" });
  else if (type === "splitter") Object.assign(e, { r: 16, hp: 64 * scale, maxHp: 64 * scale, speed: 76 + state.wave * 1.3, damage: 15, xp: 8, color: "#77ff8a" });
  else Object.assign(e, { r: 14, hp: 44 * scale, maxHp: 44 * scale, speed: 78 + state.wave * 1.5, damage: 14, xp: 5, color: "#42e8ff" });
  const half = WORLD_SIZE / 2;
  e.x = clamp(e.x, -half + e.r, half - e.r);
  e.y = clamp(e.y, -half + e.r, half - e.r);
  world.enemies.push(e);
}

export function updateEnemies(dt) {
  const p = state.player;
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const wobble = Math.sin(state.time * 2 + e.x * 0.01) * 0.18;
    e.x += (dx / dist + -dy / dist * wobble) * e.speed * dt;
    e.y += (dy / dist + dx / dist * wobble) * e.speed * dt;
    const half = WORLD_SIZE / 2;
    e.x = clamp(e.x, -half + e.r, half - e.r);
    e.y = clamp(e.y, -half + e.r, half - e.r);
    e.anim += dt * (2.4 + e.speed * 0.035);
    e.flip = dx < 0 ? -1 : 1;
    e.hitTimer = Math.max(0, e.hitTimer - dt);
    e.flash = Math.max(0, e.flash - dt * 8);
    if (dist < p.r + e.r && p.invuln <= 0) {
      p.hp -= e.damage;
      p.invuln = 0.55;
      state.shake = 8;
      state.flash = 0.28;
      burst(p.x, p.y, 12, "#ff4d6d", 120);
      playTone(90, 0.04, "sawtooth");
    }
  }
}

export function damageEnemy(e, amount, x, y) {
  if (e.dead) return;
  e.hp -= amount * state.player.damageScale;
  e.flash = 1;
  burst(x, y, 3, "#6fdb6f", 100);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  state.kills++;
  dropGem(e.x, e.y, e.xp);
  burst(e.x, e.y, e.type === "tank" ? 20 : 10, e.color, 140);
  const index = world.enemies.indexOf(e);
  if (index >= 0) world.enemies.splice(index, 1);
  if (e.type === "splitter") for (let i = 0; i < 2; i++) spawnChild(e);
}

function spawnChild(parent) {
  if (world.enemies.length >= ENEMY_LIMIT) return;
  const e = { type: "chaser", dead: false, x: parent.x + (Math.random() - 0.5) * 40, y: parent.y + (Math.random() - 0.5) * 40, r: 10, hp: 22 + state.wave * 2, maxHp: 22 + state.wave * 2, speed: 108, damage: 9, xp: 2, color: "#77ff8a", hitTimer: 0, flash: 0, anim: Math.random() * TAU, flip: 1 };
  world.enemies.push(e);
}

export function dropGem(x, y, value) {
  if (world.gems.length >= GEM_LIMIT) world.gems.shift();
  world.gems.push({ x, y, value: Math.max(1, Math.round(value)), phase: Math.random() * TAU });
}

export function updateGems(dt) {
  const p = state.player;
  for (let i = world.gems.length - 1; i >= 0; i--) {
    const g = world.gems[i];
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist < p.magnet) {
      const pull = (1 - dist / p.magnet) * 520 + 120;
      g.x += (dx / dist) * pull * dt;
      g.y += (dy / dist) * pull * dt;
    }
    if (dist < p.r + 12) {
      p.xp += g.value;
      state.shards += g.value;
      world.gems.splice(i, 1);
      playTone(760, 0.02, "sine");
    }
  }
}

export function rebuildGrid() {
  world.grid.clear();
  for (const e of world.enemies) {
    const key = cellKey(e.x, e.y);
    if (!world.grid.has(key)) world.grid.set(key, []);
    world.grid.get(key).push(e);
  }
}

export function queryEnemies(x, y, radius, out) {
  const minX = Math.floor((x - radius) / CELL_SIZE);
  const maxX = Math.floor((x + radius) / CELL_SIZE);
  const minY = Math.floor((y - radius) / CELL_SIZE);
  const maxY = Math.floor((y + radius) / CELL_SIZE);
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const bucket = world.grid.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const e of bucket) if (!e.dead && distSq(x, y, e.x, e.y) <= (radius + e.r) ** 2) out.push(e);
    }
  }
}

export function nearestEnemy(x, y, range = 900) {
  let best = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    const d = distSq(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function collectAllExperience() {
  const p = state.player;
  for (const g of world.gems) {
    p.xp += g.value;
    state.shards += g.value;
  }
  world.gems.length = 0;
  for (const e of world.enemies) {
    p.xp += Math.max(1, Math.round(e.xp || 1));
    state.shards += Math.max(1, Math.round(e.xp || 1));
  }
}

export function clearEnemies() {
  for (const e of world.enemies) burst(e.x, e.y, e.type === "tank" ? 14 : 7, e.color, 120);
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.grid.clear();
}

function cellKey(x, y) {
  return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
}

export { circleHit };
