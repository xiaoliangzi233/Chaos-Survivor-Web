import { CELL_SIZE, ENEMY_LIMIT, GEM_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { state, world, input } from "../state.js";
import { clamp, distSq, circleHit } from "../utils.js";
import { burst, dust, pulse } from "../effects.js";
import { playSfx } from "../audio.js";
import { isBossWave, randomEnemyForWave, spawnEnemyById, spawnWaveBoss } from "./enemyRegistry.js";
import { updateBlackhole } from "../blackhole.js";
import { difficultyMultiplier, currentDifficulty } from "../difficulty.js";
import { applyPlayerDamage, coinDropMultiplier, onWeaponHit, rollWeaponDamage, waveSpawnMultiplier } from "./items.js";
import { spawnDamageText } from "../effects.js";
import { waveScenarioSpawnRate } from "../config/wave-scenario-config.js";
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


export function updateChallengeSpawning(dt) {
  spawnWaveBoss();
  if (isBossWave(state.wave)) return;
  state.challengeSpawnTime += dt;
  const scenario = state.waveScenario;
  if (!scenario || !scenario.groups) return;
  const enemyLimit = currentDifficulty().enemyLimit || ENEMY_LIMIT;
  const spawnedKey = `challenge_grp_${state.difficultyId}_${state.wave}`;
  state.spawnedWaveEvents ||= new Set();
  for (let gi = 0; gi < scenario.groups.length; gi++) {
    const group = scenario.groups[gi];
    const gKey = `${spawnedKey}_${gi}`;
    if (state.spawnedWaveEvents.has(gKey)) continue;
    const shouldSpawn = state.challengeSpawnTime >= group.time || world.enemies.length === 0;
    if (!shouldSpawn) break;
    state.spawnedWaveEvents.add(gKey);
    for (const entry of group.enemies) {
      for (let i = 0; i < entry.count; i++) {
        if (world.enemies.length >= enemyLimit) break;
        spawnEnemyById(entry.id, null, null, entry.config || null);
      }
    }
  }
  // Count remaining enemies for annihilation mode
  if (scenario.type === "annihilation") {
    state.challengeRemaining = world.enemies.length;
  }
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
  const scenarioMul = waveScenarioSpawnRate(difficultyId, wave);
  return (2.1 + danger * 10.5 + wave * 0.36) * earlyMul * difficultySpawnRate * itemSpawnMultiplier * scenarioMul;
}

export function updateEnemies(dt) {
  const p = state.player;
  for (const e of world.enemies) {
    e.shielded = false;
    e.globalShielded = false;
    e.prismAssistTimer = Math.max(0, (e.prismAssistTimer || 0) - dt);
  }
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    updateEnemyKnockback(e, dt);
    if ((e.controlImmune || e.immuneFreeze) && e.freezeTimer > 0) e.freezeTimer = 0;
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
    if (activeWaveEffect("mini_overdrive") && !e.boss) e.speed *= 1.5;
    if (activeWaveEffect("overclock_pulse") && !e.boss) e.speed *= overclockPulseMultiplier();
    if (!updateEliteDashTrap(e, dt)) e.update(dt);
    if (assisted) e.speed = baseSpeed;
    if ((activeWaveEffect("mini_overdrive") || activeWaveEffect("overclock_pulse")) && !e.boss) e.speed = baseSpeed;
    updateEliteSkill(e, dt);
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
  if (!enemy || enemy.elite || (enemy.category !== "小怪" && !enemy.boss)) return 0;
  if (enemy.boss) {
    const amount = enemy.coinDrop ?? Math.max(90, Math.round((enemy.xp || 100) * 0.55));
    return Math.max(30, Math.round(amount * (enemy.rewardScale ?? 1) * difficultyMultiplier("coinGain") * coinDropMultiplier()));
  }
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
    updatePrismRefraction(b);
    const speedScale = (activeWaveEffect("mini_overdrive") && !b.bossProjectile ? 1.5 : 1) * (activeWaveEffect("overclock_pulse") && !b.bossProjectile ? overclockPulseMultiplier() : 1);
    b.x += b.vx * dt * speedScale;
    b.y += b.vy * dt * speedScale;
    b.life -= dt;
    const outsideMap = isEnemyProjectileOutsideMap(b);
    if (b.landTrapAtY != null && b.y >= b.landTrapAtY) b.life = 0;
    if (circleHit(b.x, b.y, b.r, p.x, p.y, p.r) && p.invuln <= 0) {
      const result = applyPlayerDamage(b.damage, b);
      p.invuln = 0.5;
      if (result.damaged && b.burnDuration > 0) {
        p.burnTimer = Math.max(p.burnTimer || 0, b.burnDuration);
        p.burnDps = Math.max(p.burnDps || 0, b.burnDps || 0);
      }
      if (result.damaged && b.poisonDuration > 0) {
        p.burnTimer = Math.max(p.burnTimer || 0, b.poisonDuration);
        p.burnDps = Math.max(p.burnDps || 0, b.poisonDps || 0);
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
      if (b.landTrapOnHit) placeGearProjectileTrap(b);
      world.enemyProjectiles.splice(i, 1);
    } else if ((b.bossProjectile && outsideMap) || (!b.bossProjectile && b.life <= 0)) {
      if (b.splitOnExpire) splitEnemyProjectile(b);
      if (b.landTrapOnExpire) placeGearProjectileTrap(b);
      world.enemyProjectiles.splice(i, 1);
    }
  }
}

function isEnemyProjectileOutsideMap(b) {
  const margin = Math.max(40, (b.r || 0) * 4);
  const half = WORLD_SIZE / 2 + margin;
  return b.x < -half || b.x > half || b.y < -half || b.y > half;
}

function placeGearProjectileTrap(b) {
  const half = WORLD_SIZE / 2 - 80;
  world.hazards.push({
    kind: "gear_trap",
    x: clamp(b.x, -half, half),
    y: clamp(b.y, -half, half),
    r: b.trapRadius || Math.max(34, b.r * 1.4),
    color: b.color || "#f59e0b",
    damage: b.trapDamage || b.damage * 0.85,
    life: b.trapLife || 2.8,
    maxLife: b.trapLife || 2.8,
    spin: b.spin || Math.random() * TAU,
  });
  pulse(b.x, b.y, Math.max(36, b.r * 1.4), b.color || "#f59e0b", 0.12);
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
    if (h.kind === "gravity_well") updateGravityWell(h, dt);
    if (h.kind === "magnetic_node") updateMagneticNode(h, dt);
    if (h.kind === "brood_pod") updateBroodPod(h, dt);
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
      h.kind === "toxic_residue" ||
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
      if ((result.damaged || h.kind === "toxic_residue") && h.poisonDuration > 0) {
        p.burnTimer = Math.max(p.burnTimer || 0, h.poisonDuration);
        p.burnDps = Math.max(p.burnDps || 0, h.poisonDps || 0);
      }
      playSfx("hurt");
      if (h.kind === "ember_mine") h.life = 0;
      if (h.kind === "artillery_blast") h.life = Math.min(h.life, 0.12);
    }
    if (h.life <= 0) world.hazards.splice(i, 1);
  }
}

function updateEliteSkill(e, dt) {
  if (!e?.elite || e.dead || e.boss) return;
  if (e.eliteGlobalShield) return applyEliteGlobalShield(e);
  e.eliteSkillCooldown ??= 3 + Math.random() * 1.2;
  e.eliteSkillInterval ??= e.eliteVariant === "giant" ? 5.2 : 4.4;
  e.eliteSkillProjectileCount ??= e.eliteVariant === "giant" ? 16 : 10;
  e.eliteSkillPulse = Math.max(0, (e.eliteSkillPulse || 0) - dt);
  if ((e.eliteSkillWindup || 0) > 0) {
    e.eliteSkillWindup = Math.max(0, e.eliteSkillWindup - dt);
    if (e.eliteSkillPulse <= 0) {
      e.eliteSkillPulse = 0.16;
      pulse(e.x, e.y, e.r * (2.2 + (e.eliteSkillWindup || 0)), "#ffd166", 0.18);
    }
    if (e.eliteSkillWindup <= 0) releaseEliteSkill(e);
    return;
  }
  e.eliteSkillCooldown -= dt;
  if (e.eliteSkillCooldown > 0) return;
  e.eliteSkillWindup = e.eliteVariant === "giant" ? 0.82 : 0.62;
  e.eliteSkillPulse = 0;
  pulse(e.x, e.y, e.r * 3.1, "#ffd166", 0.34);
}

function releaseEliteSkill(e) {
  if (e.eliteFireballSkill) return releaseEliteFireballs(e);
  if (e.eliteDashTrapSkill) return releaseEliteDashTrap(e);
  if (e.eliteCollapseSkill) return releaseEliteCollapse(e);
  if (e.eliteMagnetDashSkill) return releaseEliteMagnetDash(e);
  if (e.eliteBroodPodSkill) return releaseEliteBroodPods(e);
  releaseElitePulse(e);
}

function releaseElitePulse(e) {
  const count = e.eliteSkillProjectileCount || 10;
  const playerAngle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const offset = playerAngle + Math.random() * 0.16;
  const speed = e.eliteVariant === "giant" ? 245 : 285;
  const radius = e.eliteVariant === "giant" ? 7 : 5.5;
  const damage = Math.max(1, e.damage * (e.eliteVariant === "giant" ? 0.38 : 0.32));
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r * 0.72,
      y: e.y + Math.sin(a) * e.r * 0.72,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: radius,
      color: e.eliteVariant === "giant" ? "#ffb86b" : "#ffe08a",
      damage,
      life: 4.2,
      shape: "starShard",
      spin: Math.random() * TAU,
    });
  }
  burst(e.x, e.y, e.eliteVariant === "giant" ? 24 : 16, "#ffd166", 210);
  pulse(e.x, e.y, e.r * 3.6, "#ffd166", 0.42);
  world.weaponFx.push({ kind: "shockRing", x: e.x, y: e.y, radius: e.r * 3.2, life: 0.34, maxLife: 0.34, color: "#ffd166" });
  state.shake = Math.max(state.shake, e.eliteVariant === "giant" ? 7 : 4);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

function releaseEliteFireballs(e) {
  const count = e.eliteVariant === "giant" ? 5 : 3;
  const base = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.18;
    const a = base + spread;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r,
      y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 250,
      vy: Math.sin(a) * 250,
      r: 9,
      color: "#ff7a1a",
      damage: Math.max(1, e.damage * 0.42),
      life: 4,
      shape: "fireball",
      spin: Math.random() * TAU,
      burnDuration: 2.6,
      burnDps: e.damage * 0.22,
    });
  }
  burst(e.x, e.y, 18, "#ff7a1a", 180);
  pulse(e.x, e.y, e.r * 2.6, "#ffad66", 0.28);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

function releaseEliteDashTrap(e) {
  e.eliteDashTime = 0.48;
  const a = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  e.eliteDashVx = Math.cos(a) * 560;
  e.eliteDashVy = Math.sin(a) * 560;
  e.eliteDashTrapTimer = 0;
  e.eliteSkillCooldown = e.eliteSkillInterval;
  burst(e.x, e.y, 14, e.color, 180);
}

function releaseEliteCollapse(e) {
  const p = state.player;
  const tx = clamp(p.x + (p.dirX || 1) * 130, -WORLD_SIZE / 2 + 110, WORLD_SIZE / 2 - 110);
  const ty = clamp(p.y + (p.dirY || 0) * 130, -WORLD_SIZE / 2 + 110, WORLD_SIZE / 2 - 110);
  world.hazards.push({
    kind: "gravity_well",
    x: tx,
    y: ty,
    r: 118,
    color: "#8d6bff",
    damage: 0,
    life: 2.6,
    maxLife: 2.6,
    armTime: 0.42,
    pull: 210,
    spin: Math.random() * TAU,
  });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + e.anim * 0.12;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r,
      y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 165,
      vy: Math.sin(a) * 165,
      r: 5.5,
      color: "#b48cff",
      damage: Math.max(1, e.damage * 0.26),
      life: 2.4,
      shape: "starShard",
      spin: Math.random() * TAU,
    });
  }
  pulse(tx, ty, 118, "#8d6bff", 0.32);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

function releaseEliteMagnetDash(e) {
  e.eliteDashTime = 0.42;
  const a = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  e.eliteDashVx = Math.cos(a) * 620;
  e.eliteDashVy = Math.sin(a) * 620;
  e.eliteDashTrapTimer = 0.08;
  e.eliteMagnetTrail = true;
  e.eliteSkillCooldown = e.eliteSkillInterval;
  pulse(e.x, e.y, e.r * 3, "#42e8ff", 0.22);
}

function releaseEliteBroodPods(e) {
  const p = state.player;
  const count = 5;
  const base = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 62;
    const x = clamp(p.x + Math.cos(base) * offset + (Math.random() - 0.5) * 36, -WORLD_SIZE / 2 + 100, WORLD_SIZE / 2 - 100);
    const y = clamp(p.y + Math.sin(base) * offset + (Math.random() - 0.5) * 36, -WORLD_SIZE / 2 + 100, WORLD_SIZE / 2 - 100);
    world.hazards.push({
      kind: "brood_pod",
      x,
      y,
      r: 48,
      color: "#a3e635",
      damage: 0,
      life: 5.4,
      maxLife: 5.4,
      armTime: 2.2,
      spin: Math.random() * TAU,
    });
  }
  pulse(e.x, e.y, e.r * 2.5, "#a3e635", 0.24);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

function updateEliteDashTrap(e, dt) {
  if ((e.eliteDashTime || 0) <= 0) return false;
  e.eliteDashTime = Math.max(0, e.eliteDashTime - dt);
  e.x += (e.eliteDashVx || 0) * dt;
  e.y += (e.eliteDashVy || 0) * dt;
  e.eliteDashTrapTimer -= dt;
  if (e.eliteDashTrapTimer <= 0) {
    e.eliteDashTrapTimer = 0.16;
    const base = Math.atan2(e.eliteDashVy || 0, e.eliteDashVx || 1) + Math.PI;
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = base + side * (0.48 + Math.random() * 0.22);
    if (!e.eliteMagnetTrail) {
      world.enemyProjectiles.push({
        x: e.x + Math.cos(a) * e.r * 0.4,
        y: e.y + Math.sin(a) * e.r * 0.4,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        r: 13,
        color: e.color,
        damage: e.damage * 0.22,
        life: 0.46,
        shape: "fastGear",
        spin: Math.random() * TAU,
        landTrapOnExpire: true,
        trapRadius: 38,
        trapDamage: e.damage * 0.5,
        trapLife: 2.6,
      });
    }
    if (e.eliteMagnetTrail) {
      world.hazards.push({
        kind: "magnetic_node",
        x: clamp(e.x, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90),
        y: clamp(e.y, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90),
        r: 78,
        color: "#42e8ff",
        damage: 0,
        life: 1.6,
        maxLife: 1.6,
        spin: Math.random() * TAU,
      });
    }
  }
  if (e.eliteDashTime <= 0) e.eliteMagnetTrail = false;
  return true;
}

function applyEliteGlobalShield(e) {
  for (const other of world.enemies) {
    if (other === e || other.dead || other.boss) continue;
    other.shielded = true;
    other.globalShielded = true;
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

function updateGravityWell(h, dt) {
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.spin = (h.spin || 0) + dt * 3.6;
  if (h.armTime > 0) return;
  pullBody(state.player, h, dt, h.pull || 150, 0.5);
  for (const e of world.enemies) {
    if (e.dead || e.boss || e.immuneGravity) continue;
    pullBody(e, h, dt, (h.pull || 150) * 0.38, 0.3);
  }
  for (const collection of [world.gems, world.coins]) {
    for (const item of collection) pullBody(item, h, dt, (h.pull || 150) * 0.72, 0.4);
  }
}

function updateMagneticNode(h, dt) {
  h.spin = (h.spin || 0) + dt * 5.8;
  for (const collection of [world.gems, world.coins]) {
    for (const item of collection) pullBody(item, h, dt, 180, 0.52);
  }
  for (const b of world.enemyProjectiles) {
    const speed = Math.hypot(b.vx || 0, b.vy || 0);
    if (speed > 240) continue;
    pullBody(b, h, dt, 54, 0.22);
  }
}

function updateBroodPod(h, dt) {
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.spin = (h.spin || 0) + dt * 2.4;
  if (h.armTime > 0 || h.hatched) return;
  h.hatched = true;
  h.life = Math.min(h.life, 0.5);
  const existing = world.enemies.filter((e) => e.type === "zombie" || e.type === "slime_small").length;
  if (existing > 70 || world.enemies.length > 160) return;
  const count = 2 + (state.wave >= 16 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const a = h.spin + i / count * TAU;
    spawnEnemyById(i % 2 ? "slime_small" : "zombie", h.x + Math.cos(a) * 34, h.y + Math.sin(a) * 34);
  }
  burst(h.x, h.y, 10, h.color, 120);
}

function pullBody(body, h, dt, strength, falloffPower) {
  const dx = h.x - body.x;
  const dy = h.y - body.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  if (d > h.r) return;
  const force = Math.pow(1 - d / h.r, falloffPower) * strength;
  body.x += dx / d * force * dt;
  body.y += dy / d * force * dt;
}

function updatePrismRefraction(b) {
  if (b.prismReflected || b.bossProjectile) return;
  const prisms = world.hazards.filter((h) => h.kind === "prism_reflector");
  if (!prisms.length) return;
  for (const h of prisms) {
    if (distSq(h.x, h.y, b.x, b.y) > (h.r + b.r) ** 2) continue;
    b.prismReflected = true;
    const base = Math.atan2(b.vy || 0, b.vx || 1);
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = base + side * 0.42;
    const speed = Math.max(120, Math.hypot(b.vx || 0, b.vy || 0) * 0.82);
    world.enemyProjectiles.push({
      x: b.x,
      y: b.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: Math.max(3, (b.r || 5) * 0.78),
      color: "#f3f7ff",
      damage: (b.damage || 1) * 0.38,
      life: Math.min(1.8, b.life || 1.8),
      shape: "laserShard",
      prismReflected: true,
    });
    pulse(h.x, h.y, h.r * 0.55, "#f3f7ff", 0.12);
    break;
  }
}

function overclockPulseMultiplier() {
  const k = Math.sin(state.time * TAU / 6);
  return k > 0.35 ? 1.28 : 1;
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

