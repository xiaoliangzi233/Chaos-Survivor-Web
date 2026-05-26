import { CELL_SIZE, ENEMY_LIMIT, GEM_LIMIT, TAU, WORLD_SIZE } from "./constants.js";
import { state, world, input } from "./state.js";
import { clamp, distSq, circleHit } from "./utils.js";
import { burst, dust } from "./effects.js";
import { playSfx } from "./audio.js";
import { isBossWave, randomEnemyForWave, spawnEnemyById, spawnWaveBoss } from "./enemyRegistry.js";

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
  spawnWaveBoss();
  if (isBossWave(state.wave)) return;
  const danger = state.wave / 20;
  const earlyMul = state.wave <= 3 ? 0.52 : state.wave <= 6 ? 0.68 : state.wave <= 9 ? 0.84 : 1;
  state.spawnBudget += dt * (2.1 + danger * 10.5 + state.wave * 0.36) * earlyMul;
  while (state.spawnBudget >= 1 && world.enemies.length < ENEMY_LIMIT) {
    state.spawnBudget--;
    spawnEnemyById(randomEnemyForWave(state.wave));
  }
}

export function updateEnemies(dt) {
  const p = state.player;
  for (const e of world.enemies) e.shielded = false;
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    updateEnemyKnockback(e, dt);
    if (e.freezeTimer > 0 && !e.boss) {
      e.freezeTimer = Math.max(0, e.freezeTimer - dt);
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.flash = Math.max(0, e.flash - dt * 4);
      continue;
    }
    if (e.freezeTimer > 0) e.freezeTimer = Math.max(0, e.freezeTimer - dt * 2.5);
    e.update(dt);
  }
  updateEnemyProjectiles(dt);
  updateHazards(dt);
}

export function damageEnemy(e, amount, x, y) {
  e.takeDamage ? e.takeDamage(amount, x, y) : null;
}

export function applyKnockback(e, dx, dy, force) {
  if (!e || e.dead || force <= 0) return;
  const len = Math.max(1, Math.hypot(dx, dy));
  const resistance = e.knockbackResistance ?? defaultKnockbackResistance(e);
  const applied = force * Math.max(0.08, 1 - resistance);
  e.knockbackX = (e.knockbackX || 0) + (dx / len) * applied;
  e.knockbackY = (e.knockbackY || 0) + (dy / len) * applied;
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
      playSfx("gem");
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
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.boss = null;
  world.grid.clear();
}

function updateEnemyProjectiles(dt) {
  const p = state.player;
  for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
    const b = world.enemyProjectiles[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (circleHit(b.x, b.y, b.r, p.x, p.y, p.r) && p.invuln <= 0) {
      p.hp -= b.damage;
      p.invuln = 0.5;
      burst(p.x, p.y, 8, b.color, 100);
      playSfx("hurt");
      world.enemyProjectiles.splice(i, 1);
    } else if (b.life <= 0) world.enemyProjectiles.splice(i, 1);
  }
}

function updateHazards(dt) {
  const p = state.player;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.life -= dt;
    if (distSq(h.x, h.y, p.x, p.y) < (h.r + p.r) ** 2 && p.invuln <= 0) {
      p.hp -= h.damage;
      p.invuln = 0.35;
      playSfx("hurt");
    }
    if (h.life <= 0) world.hazards.splice(i, 1);
  }
}

function updateEnemyKnockback(e, dt) {
  const kx = e.knockbackX || 0;
  const ky = e.knockbackY || 0;
  if (Math.abs(kx) + Math.abs(ky) < 0.1) {
    e.knockbackX = 0;
    e.knockbackY = 0;
    return;
  }
  e.x += kx * dt;
  e.y += ky * dt;
  const drag = Math.exp(-dt * 8.5);
  e.knockbackX = kx * drag;
  e.knockbackY = ky * drag;
  const half = WORLD_SIZE / 2;
  e.x = clamp(e.x, -half + e.r, half - e.r);
  e.y = clamp(e.y, -half + e.r, half - e.r);
}

function defaultKnockbackResistance(e) {
  if (e.boss) return 0.92;
  if (e.elite) return 0.58;
  if (e.type === "tank" || e.behavior === "split_large") return 0.64;
  if (e.behavior === "pylon" || e.behavior === "shield") return 0.52;
  if (e.behavior === "lancer" || e.behavior === "bat" || e.type === "slime_small") return 0.2;
  return clamp((e.r - 10) / 34, 0.18, 0.5);
}

function cellKey(x, y) {
  return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
}

export { circleHit };
