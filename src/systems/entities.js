import { CELL_SIZE, ENEMY_LIMIT, GEM_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { state, world, input } from "../state.js";
import { clamp, distSq, circleHit } from "../utils.js";
import { burst, dust } from "../effects.js";
import { playSfx } from "../audio.js";
import { isBossWave, randomEnemyForWave, spawnEnemyById, spawnWaveBoss } from "./enemyRegistry.js";
import { updateBlackhole } from "../blackhole.js";
import { difficultyMultiplier, currentDifficulty } from "../difficulty.js";
import { applyPlayerDamage, coinDropMultiplier, onWeaponHit, rollWeaponDamage, waveSpawnMultiplier } from "./items.js";
import { spawnDamageText } from "../effects.js";
import { emberSpawnRateForWave } from "../config/ember-wave-scenarios.js";
import { activeWaveEffect } from "./waveScenarios.js";
export { applyFrostMark } from "./statusEffects.js";
import { applyFrostMark } from "./statusEffects.js";

export function updatePlayer(dt) {
  const p = state.player;
  if (p.frozenTimer > 0) {
    p.frozenTimer = Math.max(0, p.frozenTimer - dt);
    p.frostTimer = Math.max(0, p.frostTimer - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    return;
  }
  let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.vx;
  let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.vy;
  const len = Math.hypot(vx, vy);
  if (len > 0.001) {
    vx /= len;
    vy /= len;
    p.dirX = vx;
    p.dirY = vy;
  } else {
    vx = 0;
    vy = 0;
  }
  const frostScale = 1 - Math.min(0.42, p.frostSlow || 0);
  const moveSpeed = p.speed * frostScale;
  const skating = activeWaveEffect("ice_skate");
  if (skating) {
    const accel = 850;
    const drag = len > 0.001 ? 0.985 : 0.992;
    p.slideVx = (p.slideVx || 0) * Math.pow(drag, dt * 60) + vx * accel * dt;
    p.slideVy = (p.slideVy || 0) * Math.pow(drag, dt * 60) + vy * accel * dt;
    const maxSlide = moveSpeed * 1.65;
    const slideLen = Math.hypot(p.slideVx, p.slideVy);
    if (slideLen > maxSlide) {
      p.slideVx = p.slideVx / slideLen * maxSlide;
      p.slideVy = p.slideVy / slideLen * maxSlide;
    }
    p.x += p.slideVx * dt;
    p.y += p.slideVy * dt;
  } else if (len > 0.001) {
    p.slideVx = 0;
    p.slideVy = 0;
    p.x += vx * moveSpeed * dt;
    p.y += vy * moveSpeed * dt;
  } else {
    p.slideVx = 0;
    p.slideVy = 0;
  }
  const trailVx = skating ? p.slideVx || 0 : vx * moveSpeed;
  const trailVy = skating ? p.slideVy || 0 : vy * moveSpeed;
  const trailLen = Math.hypot(trailVx, trailVy);
  if (trailLen > 1) {
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      p.trailTimer = 0.055;
      dust(p.x - trailVx / trailLen * 12, p.y - trailVy / trailLen * 12, -trailVx / trailLen, -trailVy / trailLen);
    }
  }
  if (p.burnTimer > 0) {
    p.burnTimer = Math.max(0, p.burnTimer - dt);
    p.hp -= (p.burnDps || 0) * dt;
    state.flash = Math.max(state.flash, 0.05);
    if (p.burnTimer <= 0) p.burnDps = 0;
  }
  if (p.frostTimer > 0) {
    p.frostTimer = Math.max(0, p.frostTimer - dt);
    if (p.frostTimer <= 0) p.frostSlow = 0;
  }
  if (p.frostMarkTimer > 0) {
    p.frostMarkTimer = Math.max(0, p.frostMarkTimer - dt);
    if (p.frostMarkTimer <= 0) p.frostMarks = 0;
  }
  const half = WORLD_SIZE / 2 - 60;
  p.x = clamp(p.x, -half, half);
  p.y = clamp(p.y, -half, half);
  p.invuln = Math.max(0, p.invuln - dt);
}

export function updateSpawning(dt) {
  spawnWaveBoss();
  if (isBossWave(state.wave)) return;
  state.spawnBudget += dt * spawnBudgetGainPerSecond({
    wave: state.wave,
    difficultyId: state.difficultyId,
    difficultySpawnRate: difficultyMultiplier("spawnRate"),
    itemSpawnMultiplier: waveSpawnMultiplier(),
  });
  const enemyLimit = currentDifficulty().enemyLimit || ENEMY_LIMIT;
  while (state.spawnBudget >= 1 && world.enemies.length < enemyLimit) {
    state.spawnBudget--;
    spawnEnemyById(randomEnemyForWave(state.wave));
  }
}

export function spawnBudgetGainPerSecond({ wave, difficultyId, difficultySpawnRate, itemSpawnMultiplier }) {
  const danger = wave / 20;
  const earlyMul = wave <= 3 ? 0.52 : wave <= 6 ? 0.68 : wave <= 9 ? 0.84 : 1;
  const scenarioMul = difficultyId === "ember" ? emberSpawnRateForWave(wave) : 1;
  return (2.1 + danger * 10.5 + wave * 0.36) * earlyMul * difficultySpawnRate * itemSpawnMultiplier * scenarioMul;
}

export function updateEnemies(dt) {
  const p = state.player;
  for (const e of world.enemies) {
    e.shielded = false;
    e.prismAssistTimer = Math.max(0, (e.prismAssistTimer || 0) - dt);
  }
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    updateEnemyKnockback(e, dt);
    if (e.controlImmune && e.freezeTimer > 0) e.freezeTimer = 0;
    if (e.freezeTimer > 0 && !e.boss) {
      e.freezeTimer = Math.max(0, e.freezeTimer - dt);
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.flash = Math.max(0, e.flash - dt * 4);
      continue;
    }
    if (e.freezeTimer > 0) e.freezeTimer = Math.max(0, e.freezeTimer - dt * 2.5);
    const beforeCooldowns = snapshotCooldowns(e);
    const assisted = e.prismAssistTimer > 0 && !e.boss;
    const baseSpeed = e.speed;
    if (assisted) e.speed *= e.prismAssistSpeedMult || 1.22;
    e.update(dt);
    if (assisted) e.speed = baseSpeed;
    applyDifficultyCooldownScale(e, beforeCooldowns);
  }
  updateEnemyProjectiles(dt);
  updateHazards(dt);
  updateBlackhole(dt);
}

export function damageEnemy(e, amount, x, y) {
  if (!e?.takeDamage) return;
  const roll = rollWeaponDamage(amount);
  e.takeDamage(roll.amount, x, y, {
    critical: roll.critical,
    damageText: spawnDamageText,
  });
  onWeaponHit(e, x, y);
}

export function applyKnockback(e, dx, dy, force) {
  if (!e || e.dead || force <= 0) return;
  if (e.controlImmune) return;
  const len = Math.max(1, Math.hypot(dx, dy));
  const resistance = e.knockbackResistance ?? defaultKnockbackResistance(e);
  const applied = force * Math.max(0.08, 1 - resistance);
  e.knockbackX = (e.knockbackX || 0) + (dx / len) * applied;
  e.knockbackY = (e.knockbackY || 0) + (dy / len) * applied;
}

export function dropGem(x, y, value) {
  if (world.gems.length >= GEM_LIMIT) world.gems.shift();
  world.gems.push({ x, y, value: Math.max(1, Math.round(value * difficultyMultiplier("xpGain"))), phase: Math.random() * TAU });
}

export function dropCoin(x, y, amount) {
  const value = Math.max(1, Math.round(amount));
  const count = Math.min(5, value);
  let remaining = value;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const spread = 8 + Math.random() * 18;
    const stack = i === count - 1 ? remaining : Math.max(1, Math.floor(value / count));
    remaining -= stack;
    world.coins.push({
      x: x + Math.cos(angle) * spread,
      y: y + Math.sin(angle) * spread,
      value: stack,
      phase: Math.random() * TAU,
    });
  }
  while (world.coins.length > GEM_LIMIT) world.coins.shift();
}

export function coinAmountForEnemy(enemy) {
  if (!enemy || enemy.boss || enemy.elite || enemy.category !== "小怪") return 0;
  const amount = 1 + Math.floor(Math.random() * 3) + Math.floor((enemy.xp || 1) / 10) + Math.floor(state.wave / 7);
  return Math.min(24, Math.max(1, Math.round(amount * difficultyMultiplier("coinGain") * coinDropMultiplier())));
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
      world.gems.splice(i, 1);
      playSfx("gem");
    }
  }
}

export function updateCoins(dt) {
  const p = state.player;
  for (let i = world.coins.length - 1; i >= 0; i--) {
    const c = world.coins[i];
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist < p.magnet * 0.92) {
      const pull = (1 - dist / (p.magnet * 0.92)) * 440 + 105;
      c.x += (dx / dist) * pull * dt;
      c.y += (dy / dist) * pull * dt;
    }
    if (dist < p.r + 12) {
      state.gold += c.value;
      world.coins.splice(i, 1);
      playSfx("coin");
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
  for (const e of world.enemies) {
    if (!e.dead && e.hitTest && !out.includes(e) && e.hitTest(x, y, radius)) out.push(e);
  }
}

export function nearestEnemy(x, y, range = 900) {
  let best = null;
  let bestD = range * range;
  const minX = Math.floor((x - range) / CELL_SIZE);
  const maxX = Math.floor((x + range) / CELL_SIZE);
  const minY = Math.floor((y - range) / CELL_SIZE);
  const maxY = Math.floor((y + range) / CELL_SIZE);
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const bucket = world.grid.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const e of bucket) {
        if (e.dead) continue;
        const d = distSq(x, y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
  }
  if (!best && world.grid.size === 0) {
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = distSq(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
  }
  return best;
}

export function collectAllExperience() {
  const p = state.player;
  for (const g of world.gems) {
    p.xp += g.value;
  }
  world.gems.length = 0;
  for (const e of world.enemies) {
    p.xp += Math.max(1, Math.round(e.xp || 1));
  }
}

export function collectAllCoins() {
  const total = world.coins.reduce((sum, c) => sum + Math.max(1, Math.round(c.value || 1)), 0);
  if (total > 0) state.gold += Math.max(1, Math.floor(total * 0.5));
  world.coins.length = 0;
}

export function clearEnemies() {
  for (const e of world.enemies) {
    const amount = coinAmountForEnemy(e);
    if (amount > 0) dropCoin(e.x, e.y, amount);
    burst(e.x, e.y, e.type === "tank" ? 14 : 7, e.color, 120);
  }
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  for (let i = world.itemObjects.length - 1; i >= 0; i--) {
    const kind = world.itemObjects[i]?.kind;
    if (kind !== "easter_signature" && kind !== "easter_terminal") world.itemObjects.splice(i, 1);
  }
  world.blackhole = null;
  world.boss = null;
  world.grid.clear();
}

function updateEnemyProjectiles(dt) {
  const p = state.player;
  for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
    const b = world.enemyProjectiles[i];
    updateSpecialEnemyProjectile(b, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (circleHit(b.x, b.y, b.r, p.x, p.y, p.r) && p.invuln <= 0) {
      const result = applyPlayerDamage(b.damage, b);
      p.invuln = 0.5;
      if (result.damaged && b.burnDuration > 0) {
        p.burnTimer = Math.max(p.burnTimer || 0, b.burnDuration);
        p.burnDps = Math.max(p.burnDps || 0, b.burnDps || 0);
      }
      if (result.damaged && b.frostDuration > 0) {
        if (b.frostMarks) applyFrostMark(p, { duration: b.frostDuration, slow: b.frostSlow || 0.18, freezeDuration: b.freezeDuration || 5 });
        else {
          p.frostTimer = Math.max(p.frostTimer || 0, b.frostDuration);
          p.frostSlow = Math.max(p.frostSlow || 0, b.frostSlow || 0.18);
        }
      }
      burst(p.x, p.y, 8, b.color, 100);
      playSfx("hurt");
      world.enemyProjectiles.splice(i, 1);
    } else if (b.life <= 0) {
      if (b.splitOnExpire) splitEnemyProjectile(b);
      world.enemyProjectiles.splice(i, 1);
    }
  }
}

function splitEnemyProjectile(b) {
  if (b.shape === "voidFireball") {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      world.enemyProjectiles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * 190,
        vy: Math.sin(a) * 190,
        r: Math.max(3.5, b.r * 0.48),
        color: b.color || "#b48cff",
        damage: b.damage * 0.42,
        life: 1.45,
        shape: "voidFireball",
        spin: Math.random() * TAU,
        bossProjectile: Boolean(b.bossProjectile),
      });
    }
    return;
  }
  if (b.shape !== "snowflake" && b.shape !== "frostComet") return;
  const base = Math.atan2(b.vy, b.vx);
  for (const offset of [-0.62, 0.62]) {
    const a = base + offset;
    world.enemyProjectiles.push({
      x: b.x,
      y: b.y,
      vx: Math.cos(a) * 145,
      vy: Math.sin(a) * 145,
      r: Math.max(3.5, b.r * 0.55),
      color: b.color,
      damage: b.damage * 0.45,
      life: 1.8,
      shape: "snowflake",
      spin: Math.random() * TAU,
      frostDuration: b.frostMarks ? b.frostDuration : 0.55,
      frostSlow: b.frostMarks ? b.frostSlow : 0.14,
      frostMarks: Boolean(b.frostMarks),
      freezeDuration: b.freezeDuration || 5,
      bossProjectile: Boolean(b.bossProjectile),
    });
  }
}

function updateHazards(dt) {
  const p = state.player;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.life -= dt;
    if (h.kind === "ember_mine") updateEmberMine(h, dt);
    if (h.kind === "storm_laser_net" && h.armTime > 0) h.armTime = Math.max(0, h.armTime - dt);
    if (h.kind === "artillery_blast") updateArtilleryBlast(h, dt);
    if (h.kind === "ice_spike" || h.kind === "ice_seal") updateIceHazard(h, dt);
    if (distSq(h.x, h.y, p.x, p.y) < ((h.triggerRadius || h.r) + p.r) ** 2 && h.kind === "ember_mine") h.triggered = true;
    const canDamage =
      !h.kind ||
      (h.kind === "ember_mine" && h.triggered) ||
      (h.kind === "artillery_blast" && h.exploding) ||
      h.kind === "gear_trap" ||
      h.kind === "magma_crack" ||
      h.kind === "twin_arc_field" ||
      (h.kind === "storm_laser_net" && (h.armTime || 0) <= 0) ||
      h.kind === "frost_zone" ||
      h.kind === "blizzard_core" ||
      ((h.kind === "ice_spike" || h.kind === "ice_seal") && h.exploding);
    const hit = h.kind === "storm_laser_net"
      ? pointLineDistance(p.x, p.y, h.x, h.y, h.angle || 0, h.length || 1200) < p.r + (h.width || 18)
      : distSq(h.x, h.y, p.x, p.y) < (h.r + p.r) ** 2;
    if (hit && p.invuln <= 0 && canDamage) {
      const result = applyPlayerDamage(h.damage, h);
      p.invuln = 0.35;
      if (result.damaged && h.frostDuration > 0) {
        if (h.frostMarks) applyFrostMark(p, { duration: h.frostDuration, slow: h.frostSlow || 0.18, freezeDuration: h.freezeDuration || 5 });
        else {
          p.frostTimer = Math.max(p.frostTimer || 0, h.frostDuration);
          p.frostSlow = Math.max(p.frostSlow || 0, h.frostSlow || 0.18);
        }
      }
      playSfx("hurt");
      if (h.kind === "ember_mine") h.life = 0;
      if (h.kind === "artillery_blast") h.life = Math.min(h.life, 0.12);
    }
    if (h.life <= 0) world.hazards.splice(i, 1);
  }
}

function pointLineDistance(px, py, x, y, angle, length) {
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const dx = px - x;
  const dy = py - y;
  const forward = dx * vx + dy * vy;
  const half = length / 2;
  if (forward < -half || forward > half) return Infinity;
  return Math.abs(dx * -vy + dy * vx);
}

function updateEmberMine(h, dt) {
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.pulse = (h.pulse || 0) + dt;
  if (h.armTime > 0) return;
  if (h.triggered) {
    h.r = Math.min(h.explodeRadius || 72, h.r + dt * 320);
    h.life = Math.min(h.life, 0.16);
    return;
  }
  h.r = h.baseRadius || h.r;
}

function updateArtilleryBlast(h, dt) {
  const wasArmed = (h.armTime || 0) <= 0;
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.pulse = (h.pulse || 0) + dt;
  if (h.armTime > 0) return;
  if (!h.exploding) {
    h.exploding = true;
    h.life = Math.min(h.life, 0.34);
    h.maxLife = Math.max(h.maxLife, 1.28);
    if (!wasArmed && h.impactDamage > 0 && distSq(h.x, h.y, state.player.x, state.player.y) <= ((h.impactRadius || h.r * 0.45) + state.player.r) ** 2) {
      applyPlayerDamage(h.impactDamage, h);
      state.player.invuln = Math.min(state.player.invuln || 0, 0.08);
    }
    burst(h.x, h.y, 18, h.color, 190);
    state.shake = Math.max(state.shake, 5);
  }
  h.r = Math.min(h.finalRadius || h.r, h.r + dt * 190);
}

function updateIceHazard(h, dt) {
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.pulse = (h.pulse || 0) + dt;
  if (h.armTime > 0) return;
  if (!h.exploding) {
    h.exploding = true;
    h.life = Math.min(h.life, h.kind === "ice_seal" ? 0.34 : 0.28);
    h.maxLife = Math.max(h.maxLife, 1.18);
    burst(h.x, h.y, h.kind === "ice_seal" ? 14 : 10, h.color, 170);
    state.shake = Math.max(state.shake, h.kind === "ice_seal" ? 5 : 3);
  }
  h.r = Math.min(h.kind === "ice_seal" ? 56 : 64, h.r + dt * 120);
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

function updateSpecialEnemyProjectile(b, dt) {
  if (b.shape === "razorBoomerang") {
    b.spin = (b.spin || 0) + dt * 24;
    if (b.owner && !b.owner.dead && b.life < (b.returnAt || 1.4)) {
      const dx = b.owner.x - b.x;
      const dy = b.owner.y - b.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const speed = 360;
      b.vx += (dx / d * speed - b.vx) * Math.min(1, dt * 6.5);
      b.vy += (dy / d * speed - b.vy) * Math.min(1, dt * 6.5);
    }
  } else if (b.shape === "fastGear" || b.shape === "starShard" || b.shape === "phaseShard" || b.shape === "arcaneOrb") {
    b.spin = (b.spin || 0) + dt * (b.shape === "fastGear" ? 18 : 6);
  }
}

function snapshotCooldowns(e) {
  return {
    cooldown: e.cooldown,
    shootCooldown: e.shootCooldown,
    attackCooldown: e.attackCooldown,
    stanceCooldown: e.stanceCooldown,
  };
}

function applyDifficultyCooldownScale(e, beforeCooldowns) {
  const attackSpeed = (e.difficultyAttackSpeed || 1) * (e.prismAssistTimer > 0 ? e.prismAssistAttackSpeedMult || 1.28 : 1);
  if (attackSpeed <= 1) return;
  for (const key of Object.keys(beforeCooldowns)) {
    const before = beforeCooldowns[key];
    if (typeof before !== "number" || typeof e[key] !== "number") continue;
    if (e[key] > before) e[key] = before + (e[key] - before) / attackSpeed;
  }
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
