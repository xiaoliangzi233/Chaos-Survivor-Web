import { CELL_SIZE, ENEMY_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { state, world, input } from "../state.js";
import { clamp, distSq, circleHit } from "../utils.js";
import { burst, dust, pulse } from "../effects.js";
import { playSfx } from "../audio.js";
import { isBossWave, randomEnemyForWave, spawnEnemyById, spawnWaveBoss } from "./enemyRegistry.js";
import { updateBlackhole } from "../blackhole.js";
import { difficultyMultiplier, currentDifficulty } from "../difficulty.js";
import { applyPlayerDamage, onWeaponHit, rollWeaponDamage, waveSpawnMultiplier } from "./items.js";
import { spawnDamageText } from "../effects.js";
import { waveScenarioSpawnRate } from "../config/wave-scenario-config.js";
import { activeWaveEffect } from "./waveScenarios.js";
import { isRandomMode, randomEnemyLimitForWave } from "./randomMode.js";
export { applyFrostMark } from "./statusEffects.js";
import { applyFrostMark } from "./statusEffects.js";
import { coinAmountForEnemy, dropCoin, dropGem } from "./rewards.js";

export { coinAmountForEnemy, dropCoin, dropGem } from "./rewards.js";

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
  const debugSpeedScale = state.debug?.enabled && state.debug.doubleSpeed ? 2 : 1;
  const moveSpeed = p.speed * frostScale * debugSpeedScale;
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
    if (state.debug?.enabled && state.debug.invincible) {
      p.burnTimer = 0;
      p.burnDps = 0;
    } else {
      p.burnTimer = Math.max(0, p.burnTimer - dt);
      p.hp -= (p.burnDps || 0) * dt;
      state.flash = Math.max(state.flash, 0.05);
      if (p.burnTimer <= 0) p.burnDps = 0;
    }
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
  if (state.debug?.enabled && state.debug.freezeWave) return;
  spawnWaveBoss();
  if (isBossWave(state.wave)) return;
  state.spawnBudget += dt * spawnBudgetGainPerSecond({
    wave: state.wave,
    difficultyId: state.difficultyId,
    difficultySpawnRate: difficultyMultiplier("spawnRate"),
    itemSpawnMultiplier: waveSpawnMultiplier(),
  });
  const enemyLimit = isRandomMode() ? randomEnemyLimitForWave(state.wave) : (currentDifficulty().enemyLimit || ENEMY_LIMIT);
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
    let dist = Math.max(1, Math.hypot(dx, dy));
    const magnetRadius = p.magnet * 1.12;
    if (dist < magnetRadius) {
      const pull = coinPullSpeed(p.speed, dist, magnetRadius);
      const step = Math.min(dist, pull * dt);
      c.x += (dx / dist) * step;
      c.y += (dy / dist) * step;
      dist = Math.hypot(p.x - c.x, p.y - c.y);
    }
    if (dist < p.r + 12) {
      state.gold += c.value;
      world.coins.splice(i, 1);
      playSfx("coin");
    }
  }
}

export function coinPullSpeed(playerSpeed, distance, magnetRadius) {
  const edgeRatio = Math.max(0, Math.min(1, 1 - distance / Math.max(1, magnetRadius)));
  return Math.max(720, Math.max(0, playerSpeed || 0) * 2.8) + edgeRatio * 900;
}

export function rebuildGrid() {
  world.grid.clear();
  world.hitTestEnemies.length = 0;
  for (const e of world.enemies) {
    const key = cellKey(e.x, e.y);
    if (!world.grid.has(key)) world.grid.set(key, []);
    world.grid.get(key).push(e);
    if (e.hitTest) world.hitTestEnemies.push(e);
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
  for (const e of world.hitTestEnemies) {
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

export function clearEnemies({ dropRewards = true } = {}) {
  if (dropRewards) {
    for (const e of world.enemies) {
      const amount = coinAmountForEnemy(e);
      if (amount > 0) dropCoin(e.x, e.y, amount);
      burst(e.x, e.y, e.type === "tank" ? 14 : 7, e.color, 120);
    }
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
  world.hitTestEnemies.length = 0;
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
    const projectileActive = !b.nonColliding && (!b.activeWhenArmed || (b.linkedHazard?.armTime || 0) <= 0);
    if (projectileActive && circleHit(b.x, b.y, b.r, p.x, p.y, p.r) && p.invuln <= 0) {
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
    } else if ((b.bossProjectile && (outsideMap || (b.expireWithLife && b.life <= 0))) || (!b.bossProjectile && b.life <= 0)) {
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
    if (h.kind === "storm_laser_net") updateStormLaserNet(h, dt);
    if (h.kind === "storm_strike") updateStormStrike(h, dt);
    if (h.kind === "polar_ice_lane") updatePolarIceLane(h, dt);
    if (h.kind === "riftblade_slash" || h.kind === "riftblade_bladefall") updateRiftbladeHazard(h, dt);
    if (h.kind === "convict_chain_arc" || h.kind === "convict_ball_slam" || h.kind === "convict_chain_line" || h.kind === "convict_chain_path") updateConvictHazard(h, dt);
    if (isScientistHazard(h)) updateScientistHazard(h, dt);
    if (isDarkEntityHazard(h)) updateDarkEntityHazard(h, dt);
    if (h.kind === "phase_tear") updatePhaseTear(h, dt);
    if (h.kind === "inferno_beacon") updateInfernoBeacon(h, dt);
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
      h.kind === "riftblade_echo" ||
      ((h.kind === "riftblade_slash" || h.kind === "riftblade_bladefall") && (h.armTime || 0) <= 0 && (h.damageDelay || 0) <= 0) ||
      ((h.kind === "convict_chain_arc" || h.kind === "convict_ball_slam" || h.kind === "convict_chain_line" || h.kind === "convict_chain_path") && !h.noDamage && (h.armTime || 0) <= 0) ||
      (isScientistHazard(h) && !h.noDamage) ||
      (isDarkEntityHazard(h) && !h.noDamage && (h.armTime || 0) <= 0) ||
      (h.kind === "storm_laser_net" && (h.armTime || 0) <= 0) ||
      (h.kind === "storm_strike" && (h.armTime || 0) <= 0) ||
      (h.kind === "polar_ice_lane" && (h.armTime || 0) <= 0) ||
      h.kind === "frost_zone" ||
      h.kind === "blizzard_core" ||
      ((h.kind === "ice_spike" || h.kind === "ice_seal") && h.exploding);
    const convictHazard = h.kind === "convict_chain_arc" || h.kind === "convict_ball_slam" || h.kind === "convict_chain_line" || h.kind === "convict_chain_path";
    const scientistHazard = isScientistHazard(h);
    const darkEntityHazard = isDarkEntityHazard(h);
    const stormStrike = h.kind === "storm_strike";
    const stormTyrantHazard = Boolean(h.stormTyrantOwner);
    const polarHazard = Boolean(h.polarOwner);
    const riftbladeBladeCorridor = h.kind === "riftblade_bladefall" && Array.isArray(h.lines);
    const hit = darkEntityHazard
      ? darkEntityHazardHit(h, p)
      : riftbladeBladeCorridor
      ? h.lines.some((line) => pointSegmentDistance(p.x, p.y, line.x1, line.y1, line.x2, line.y2) < p.r + (h.width || 31))
      : scientistHazard
      ? scientistHazardHit(h, p)
      : convictHazard
      ? convictHazardHit(h, p)
      : h.kind === "storm_laser_net" || h.kind === "polar_ice_lane" || h.kind === "riftblade_slash"
        ? pointLineDistance(p.x, p.y, h.x, h.y, h.angle || 0, h.length || 1200) < p.r + (h.width || 18)
        : distSq(h.x, h.y, p.x, p.y) < (h.r + p.r) ** 2;
    if (hit && p.invuln <= 0 && canDamage && !h.playerHit) {
      const damage = darkEntityHazard ? darkEntityHazardDamage(h) : convictHazard ? convictHazardDamage(h, p) : h.damage;
      const result = applyPlayerDamage(damage, h);
      if (darkEntityHazard || convictHazard || scientistHazard || riftbladeBladeCorridor || stormStrike || stormTyrantHazard || polarHazard) h.playerHit = true;
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
  if (e.eliteEmberMineRingSkill) return releaseEliteEmberMineRing(e);
  if (e.eliteInfernoConductorSkill) return releaseEliteInfernoConductor(e);
  releaseElitePulse(e);
}

function releaseElitePulse(e) {
  const count = e.eliteSkillProjectileCount || 10;
  const playerAngle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const offset = playerAngle + Math.random() * 0.16;
  const speed = e.eliteVariant === "giant" ? 245 : 285;
  const radius = e.eliteVariant === "giant" ? 7 : 5.5;
  const damage = Math.max(1, e.damage * (e.eliteVariant === "giant" ? 0.38 : 0.32));
  const visual = eliteProjectileVisualFor(e);
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r * 0.72,
      y: e.y + Math.sin(a) * e.r * 0.72,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: radius,
      color: visual.color,
      damage,
      life: 4.2,
      shape: visual.shape,
      slimePalette: visual.slimePalette,
      spin: Math.random() * TAU,
    });
  }
  burst(e.x, e.y, e.eliteVariant === "giant" ? 24 : 16, visual.color, 210);
  pulse(e.x, e.y, e.r * 3.6, visual.color, 0.42);
  world.weaponFx.push({ kind: "shockRing", x: e.x, y: e.y, radius: e.r * 3.2, life: 0.34, maxLife: 0.34, color: visual.color });
  state.shake = Math.max(state.shake, e.eliteVariant === "giant" ? 7 : 4);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

export function eliteProjectileVisualFor(enemy) {
  if (enemy?.type === "zombie") {
    return {
      shape: "zombieClot",
      color: enemy?.eliteVariant === "giant" ? "#b7f56a" : "#7ccf68",
      slimePalette: null,
    };
  }
  if (!enemy?.type?.startsWith("slime_")) {
    return {
      shape: "starShard",
      color: enemy?.eliteVariant === "giant" ? "#ffb86b" : "#ffe08a",
      slimePalette: null,
    };
  }
  const colors = enemy.slimeColors || {};
  const body = colors.body || enemy.color || "#77ff8a";
  return {
    shape: "slimeOrb",
    color: body,
    slimePalette: {
      body,
      dark: colors.dark || "#143d35",
      light: colors.light || "#d9fff2",
      core: colors.core || colors.light || "#ffffff",
    },
  };
}

function releaseEliteFireballs(e) {
  const count = e.eliteVariant === "giant" ? 5 : 3;
  const base = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const color = e.type === "mech_worm" ? "#b48cff" : "#ff7a1a";
  const coreColor = e.type === "mech_worm" ? "#f3e8ff" : "#ffad66";
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.18;
    const a = base + spread;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r,
      y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * 250,
      vy: Math.sin(a) * 250,
      r: 9,
      color,
      damage: Math.max(1, e.damage * 0.42),
      life: 4,
      shape: "fireball",
      spin: Math.random() * TAU,
      burnDuration: 2.6,
      burnDps: e.damage * 0.22,
    });
  }
  burst(e.x, e.y, 18, color, 180);
  pulse(e.x, e.y, e.r * 2.6, coreColor, 0.28);
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

function releaseEliteEmberMineRing(e) {
  const count = 10;
  const base = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = base + i / count * TAU;
    const dist = 74 + (i % 2) * 34;
    world.hazards.push({
      kind: "ember_mine",
      x: clamp(e.x + Math.cos(a) * dist, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90),
      y: clamp(e.y + Math.sin(a) * dist, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90),
      r: 15,
      baseRadius: 15,
      triggerRadius: 48,
      explodeRadius: 92,
      color: "#ff7a1a",
      damage: e.damage * 0.82,
      life: 8.5,
      maxLife: 8.5,
      armTime: 0.62 + (i % 3) * 0.1,
      triggered: false,
    });
  }
  burst(e.x, e.y, 18, "#ff7a1a", 180);
  pulse(e.x, e.y, e.r * 3.2, "#ffd166", 0.3);
  e.eliteSkillCooldown = e.eliteSkillInterval;
}

function releaseEliteInfernoConductor(e) {
  const count = 12;
  const offset = Math.atan2(state.player.y - e.y, state.player.x - e.x) + (e.eliteInfernoCast || 0) * 0.22;
  e.eliteInfernoCast = (e.eliteInfernoCast || 0) + 1;
  for (let i = 0; i < count; i++) {
    const a = offset + i / count * TAU;
    const speed = i % 2 === 0 ? 190 : 255;
    world.enemyProjectiles.push({
      x: e.x + Math.cos(a) * e.r * 0.72,
      y: e.y + Math.sin(a) * e.r * 0.72,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: i % 2 === 0 ? 8 : 6,
      color: i % 2 === 0 ? "#ff7a1a" : "#ffd166",
      damage: Math.max(1, e.damage * 0.3),
      burnDuration: 2.8,
      burnDps: e.damage * 0.2,
      life: 4.2,
      shape: "fireball",
      spin: Math.random() * TAU,
      emberTrail: true,
    });
  }
  burst(e.x, e.y, 24, "#ff7a1a", 230);
  pulse(e.x, e.y, e.r * 3.8, "#ffd166", 0.38);
  state.shake = Math.max(state.shake, 5);
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
    if (e.dead || e.boss) continue;
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

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function updateConvictHazard(h, dt) {
  if ((h.armTime || 0) > 0) {
    h.armTime = Math.max(0, h.armTime - dt);
    if (h.armTime > 0) return;
    if (!h.convictArmed) {
      h.convictArmed = true;
      if (h.kind === "convict_ball_slam") {
        burst(h.x, h.y, 18, h.color, 230);
        pulse(h.x, h.y, h.r * 1.35, h.coreColor || h.color, 0.18);
        state.shake = Math.max(state.shake, 6);
      } else {
        state.shake = Math.max(state.shake, h.sceneChain ? 6 : 3);
      }
    }
  }
  h.activeTime = Math.min(h.activeDuration || 0, (h.activeTime || 0) + dt);
  const progress = clamp((h.activeTime || 0) / Math.max(0.001, h.activeDuration || 1), 0, 1);
  if (h.kind === "convict_chain_arc") {
    h.currentAngle = h.startAngle + h.sweep * progress;
    h.ballX = h.centerX + Math.cos(h.currentAngle) * h.radius;
    h.ballY = h.centerY + Math.sin(h.currentAngle) * h.radius;
  } else if (h.kind === "convict_chain_line" && h.movingBall) {
    h.ballX = h.x1 + (h.x2 - h.x1) * progress;
    h.ballY = h.y1 + (h.y2 - h.y1) * progress;
  } else if (h.kind === "convict_chain_path" && Array.isArray(h.points)) {
    const position = pointAlongPath(h.points, progress);
    h.ballX = position.x;
    h.ballY = position.y;
  }
}

function convictHazardHit(h, player) {
  if ((h.armTime || 0) > 0) return false;
  if (h.kind === "convict_ball_slam") return Math.hypot(player.x - h.x, player.y - h.y) < player.r + h.r;
  if (h.kind === "convict_chain_arc") {
    const ballHit = Math.hypot(player.x - h.ballX, player.y - h.ballY) < player.r + (h.ballRadius || 28);
    if (h.chainDamage === false) return ballHit;
    return pointSegmentDistance(player.x, player.y, h.centerX, h.centerY, h.ballX, h.ballY) < player.r + (h.width || 18) || ballHit;
  }
  if (h.kind === "convict_chain_line") {
    const lines = h.lines || [{ x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2 }];
    return lines.some((line) => pointSegmentDistance(player.x, player.y, line.x1, line.y1, line.x2, line.y2) < player.r + (h.width || 18));
  }
  if (h.kind === "convict_chain_path") {
    for (let i = 1; i < (h.points || []).length; i++) {
      const a = h.points[i - 1];
      const b = h.points[i];
      if (pointSegmentDistance(player.x, player.y, a.x, a.y, b.x, b.y) < player.r + (h.width || 18)) return true;
    }
  }
  return false;
}

function convictHazardDamage(h, player) {
  if (h.ballDamage && Number.isFinite(h.ballX) && Math.hypot(player.x - h.ballX, player.y - h.ballY) < player.r + (h.ballRadius || 28)) {
    return h.ballDamage;
  }
  return h.damage;
}

function updateScientistHazard(h, dt) {
  if (h.kind === "scientist_entropy_field") {
    h.previousElapsed = h.elapsed || 0;
    h.elapsed = (h.elapsed || 0) + dt;
    const activeIndex = (h.waves || []).findIndex((wave) => h.elapsed >= wave.delay && h.elapsed < wave.delay + wave.duration);
    if (activeIndex !== h.activeWaveIndex) {
      h.activeWaveIndex = activeIndex;
      h.playerHit = false;
      if (activeIndex >= 0) {
        const wave = h.waves[activeIndex];
        pulse(h.x, h.y, Math.max(96, wave.startRadius), h.coreColor || h.color, 0.16);
        state.shake = Math.max(state.shake, h.style === "event_horizon" || h.style === "manifestation_core" ? 5 : 3);
      }
    }
    applyScientistPull(h, dt);
    return;
  }

  applyScientistPull(h, dt);
  if ((h.armTime || 0) > 0) {
    h.armTime = Math.max(0, h.armTime - dt);
    if (h.armTime > 0) return;
    if (!h.scientistArmed) {
      h.scientistArmed = true;
      if (h.kind === "scientist_vial_blast" || h.kind === "scientist_void_node") {
        burst(h.x, h.y, h.style === "corruption" ? 20 : 16, h.color, 220);
        pulse(h.x, h.y, h.r * 1.3, h.coreColor || h.color, 0.2);
        h.abyssScientistOwner?.releaseVialShards?.(h);
      } else if (h.kind === "scientist_memory_path") {
        const head = pointAlongPath(h.points, 0);
        burst(head.x, head.y, 9, h.color, 120);
      }
      state.shake = Math.max(state.shake, h.sceneSeal ? 6 : h.kind === "scientist_tendril_path" ? 4 : 3);
    }
  }
  h.activeTime = Math.min(h.activeDuration || 0, (h.activeTime || 0) + dt);
  if (h.kind === "scientist_memory_path") {
    h.pathHead = clamp(h.activeTime / Math.max(0.01, h.activeDuration || 1), 0, 1);
  } else if (h.kind === "scientist_void_node" && h.activeDuration > 0) {
    const progress = clamp(h.activeTime / h.activeDuration, 0, 1);
    h.x = h.fromX + (h.toX - h.fromX) * progress;
    h.y = h.fromY + (h.toY - h.fromY) * progress;
  }
}

function scientistHazardHit(h, player) {
  if (h.kind === "scientist_entropy_field") {
    const wave = h.waves?.[h.activeWaveIndex];
    if (!wave) return false;
    const progress = clamp((h.elapsed - wave.delay) / Math.max(0.01, wave.duration), 0, 1);
    const previousProgress = clamp(((h.previousElapsed ?? h.elapsed) - wave.delay) / Math.max(0.01, wave.duration), 0, 1);
    const radius = wave.startRadius + (wave.endRadius - wave.startRadius) * progress;
    const previousRadius = wave.startRadius + (wave.endRadius - wave.startRadius) * previousProgress;
    const dx = player.x - h.x;
    const dy = player.y - h.y;
    const angle = Math.atan2(dy, dx);
    const gapDistance = Math.abs(Math.atan2(Math.sin(angle - wave.gapAngle), Math.cos(angle - wave.gapAngle)));
    if (gapDistance <= wave.gapWidth * 0.5) return false;
    const distance = Math.hypot(dx, dy);
    const padding = player.r + (wave.width || 32);
    return distance + padding >= Math.min(previousRadius, radius) && distance - padding <= Math.max(previousRadius, radius);
  }
  if ((h.armTime || 0) > 0) return false;
  if (h.kind === "scientist_vial_blast") {
    return Math.hypot(player.x - h.x, player.y - h.y) < player.r + h.r;
  }
  if (h.kind === "scientist_void_node") {
    return Math.hypot(player.x - h.x, player.y - h.y) < player.r + h.r;
  }
  if (h.kind === "scientist_seal_line") {
    if (Array.isArray(h.lines)) {
      return h.lines.some((line) => pointSegmentDistance(player.x, player.y, line.x1, line.y1, line.x2, line.y2) < player.r + (h.width || 24));
    }
    return pointLineDistance(player.x, player.y, h.x, h.y, h.angle || 0, h.length || WORLD_SIZE * 1.5) < player.r + (h.width || 24);
  }
  if (h.kind === "scientist_tendril_path") {
    for (let i = 1; i < (h.points || []).length; i++) {
      const a = h.points[i - 1];
      const b = h.points[i];
      if (pointSegmentDistance(player.x, player.y, a.x, a.y, b.x, b.y) < player.r + (h.width || 30)) return true;
    }
  }
  if (h.kind === "scientist_memory_path") {
    const points = h.points || [];
    const head = h.pathHead || 0;
    for (let i = 1; i < points.length; i++) {
      const segmentProgress = (i - 0.5) / Math.max(1, points.length - 1);
      if (Math.abs(segmentProgress - head) > 0.18) continue;
      const a = points[i - 1];
      const b = points[i];
      if (pointSegmentDistance(player.x, player.y, a.x, a.y, b.x, b.y) < player.r + (h.width || 28)) return true;
    }
  }
  return false;
}

function isScientistHazard(h) {
  return h.kind === "scientist_seal_line"
    || h.kind === "scientist_vial_blast"
    || h.kind === "scientist_tendril_path"
    || h.kind === "scientist_entropy_field"
    || h.kind === "scientist_memory_path"
    || h.kind === "scientist_void_node";
}

function isDarkEntityHazard(h) {
  return h.kind === "dark_entity_field";
}

function updateDarkEntityHazard(h, dt) {
  const wasArmed = (h.armTime || 0) <= 0;
  if ((h.armTime || 0) > 0) h.armTime = Math.max(0, h.armTime - dt);
  const armed = (h.armTime || 0) <= 0;
  if (!wasArmed && armed) {
    h.darkEntityArmed = true;
    burst(h.x, h.y, h.variant === "negative_star" ? 16 : 9, h.color, h.variant === "negative_star" ? 210 : 130);
    state.shake = Math.max(state.shake, h.scene ? 7 : 3);
  }
  if (armed) h.activeElapsed = Math.min(h.activeDuration || 0, (h.activeElapsed || 0) + dt);
  const elapsed = h.activeElapsed || 0;

  if (h.variant === "fold") {
    const progress = clamp(elapsed / Math.max(0.01, h.activeDuration || 1), 0, 1);
    const sideX = -Math.sin(h.angle || 0);
    const sideY = Math.cos(h.angle || 0);
    const forwardX = Math.cos(h.angle || 0);
    const forwardY = Math.sin(h.angle || 0);
    const outer = 1080 - Math.sin(progress * Math.PI) * 430;
    const inner = (h.corridor || 180) / 2 + (h.width || 34);
    const offsets = [-outer, -inner, inner, outer];
    h.lines ||= [];
    for (let index = 0; index < offsets.length; index++) {
      const offset = offsets[index];
      const cx = h.x + sideX * offset;
      const cy = h.y + sideY * offset;
      const half = (h.length || WORLD_SIZE) / 2;
      h.lines[index] = writeDarkLine(
        h.lines[index],
        cx - forwardX * half,
        cy - forwardY * half,
        cx + forwardX * half,
        cy + forwardY * half,
        h.width,
      );
    }
    h.lines.length = offsets.length;
    setDarkEntityDamageEpoch(h, Math.floor(elapsed / 0.58));
  } else if (h.variant === "entropy_mirror") {
    const group = elapsed < 1.08 ? 0 : elapsed < 1.3 ? -1 : elapsed < 2.38 ? 1 : -1;
    h.activeGroup = group;
    h.lines = group >= 0 ? h.lineSets?.[group] || [] : [];
    if (group >= 0) setDarkEntityDamageEpoch(h, group);
  } else if (h.variant === "night_crown") {
    const beat = Math.min(4, Math.floor(elapsed / 0.85));
    if (beat !== h.beat) {
      h.beat = beat;
      h.gateIndex = ((h.gateIndex || 0) + (h.beatStarted ? 1 : 0)) % (h.sides || 6);
      h.beatStarted = true;
      setDarkEntityDamageEpoch(h, beat);
      if (armed) h.bossOwner?.releaseNightCrownNeedles?.(h);
    }
    if (armed && !h.firstArmedBeatReleased) {
      h.firstArmedBeatReleased = true;
      h.bossOwner?.releaseNightCrownNeedles?.(h);
    }
    if (!h.vertices || h.geometryGateIndex !== h.gateIndex) rebuildNightCrownGeometry(h);
  } else if (h.variant === "unmaking") {
    h.lines ||= [];
    h.linePool ||= [];
    h.lines.length = 0;
    let activeShell = -1;
    for (let index = 0; index < (h.shells || []).length; index++) {
      const shell = h.shells[index];
      if (elapsed < shell.start || elapsed > shell.start + shell.duration) continue;
      activeShell = index;
      const progress = clamp((elapsed - shell.start) / shell.duration, 0, 1);
      const radius = shell.fromRadius + (shell.toRadius - shell.fromRadius) * progress;
      const vertices = writeDarkPolygonVertices(h.activeVertices, h.x, h.y, radius, 8, -Math.PI / 2);
      h.activeVertices = vertices;
      h.activeGateIndex = shell.gateIndex;
      for (let side = 0; side < vertices.length; side++) {
        if (side === shell.gateIndex) continue;
        const start = vertices[side];
        const end = vertices[(side + 1) % vertices.length];
        const lineIndex = h.lines.length;
        const line = writeDarkLine(h.linePool[lineIndex], start.x, start.y, end.x, end.y, h.width, h.damage);
        h.linePool[lineIndex] = line;
        h.lines.push(line);
      }
      const gateAngle = -Math.PI / 2 + (shell.gateIndex + 0.5) * TAU / 8;
      const rayAngle = gateAngle + Math.PI;
      const rayIndex = h.lines.length;
      const ray = writeDarkLine(
        h.linePool[rayIndex],
        h.x + Math.cos(rayAngle) * 80,
        h.y + Math.sin(rayAngle) * 80,
        h.x + Math.cos(rayAngle) * radius * 0.92,
        h.y + Math.sin(rayAngle) * radius * 0.92,
        Math.max(18, (h.width || 30) * 0.72),
        h.rayDamage,
      );
      ray.ray = true;
      h.linePool[rayIndex] = ray;
      h.lines.push(ray);
      break;
    }
    h.activeShell = activeShell;
    if (activeShell >= 0) setDarkEntityDamageEpoch(h, activeShell);
  } else if (h.variant === "negative_star" && armed && !h.starReleased) {
    h.starReleased = true;
    setDarkEntityDamageEpoch(h, 0);
    h.bossOwner?.releaseNegativeStarShards?.(h);
    pulse(h.x, h.y, h.r * 1.35, h.coreColor || h.color, 0.25);
  } else if (h.variant === "beam") {
    setDarkEntityDamageEpoch(h, 0);
  }
}

function darkEntityHazardHit(h, player) {
  h.currentHitDamage = h.damage;
  if ((h.armTime || 0) > 0 || h.noDamage) return false;
  if (h.variant === "negative_star") {
    return Math.hypot(player.x - h.x, player.y - h.y) < player.r + (h.r || 72);
  }
  for (const line of h.lines || []) {
    const width = line.width ?? h.width ?? 24;
    const padding = player.r + width;
    if (line.minX != null && (
      player.x < line.minX - padding
      || player.x > line.maxX + padding
      || player.y < line.minY - padding
      || player.y > line.maxY + padding
    )) continue;
    if (pointSegmentDistance(player.x, player.y, line.x1, line.y1, line.x2, line.y2) < player.r + width) {
      h.currentHitDamage = line.damage ?? h.damage;
      return true;
    }
  }
  return false;
}

function darkEntityHazardDamage(h) {
  return h.currentHitDamage ?? h.damage;
}

function setDarkEntityDamageEpoch(h, epoch) {
  if (h.damageEpoch === epoch) return;
  h.damageEpoch = epoch;
  h.playerHit = false;
}

function writeDarkPolygonVertices(target, x, y, radius, sides, rotation) {
  const vertices = target || [];
  for (let index = 0; index < sides; index++) {
    const angle = rotation + index * TAU / sides;
    const vertex = vertices[index] || {};
    vertex.x = x + Math.cos(angle) * radius;
    vertex.y = y + Math.sin(angle) * radius;
    vertices[index] = vertex;
  }
  vertices.length = sides;
  return vertices;
}

function rebuildNightCrownGeometry(h) {
  h.vertices = writeDarkPolygonVertices(h.vertices, h.x, h.y, h.radius || 520, h.sides || 6, -Math.PI / 2);
  const lines = [];
  for (let index = 0; index < h.vertices.length; index++) {
    const start = h.vertices[index];
    const end = h.vertices[(index + 1) % h.vertices.length];
    if (index === h.gateIndex) {
      for (const line of splitDarkLineForGate(start, end, h.gateWidth || 190, h.width || 34)) {
        lines.push(writeDarkLine(null, line.x1, line.y1, line.x2, line.y2, line.width));
      }
    } else {
      lines.push(writeDarkLine(null, start.x, start.y, end.x, end.y, h.width));
    }
  }
  h.lines = lines;
  h.geometryGateIndex = h.gateIndex;
}

function writeDarkLine(line, x1, y1, x2, y2, width, damage = line?.damage) {
  const target = line || {};
  target.x1 = x1;
  target.y1 = y1;
  target.x2 = x2;
  target.y2 = y2;
  target.width = width;
  target.damage = damage;
  target.minX = Math.min(x1, x2);
  target.maxX = Math.max(x1, x2);
  target.minY = Math.min(y1, y2);
  target.maxY = Math.max(y1, y2);
  target.ray = false;
  return target;
}

function splitDarkLineForGate(start, end, gap, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const halfGapT = Math.min(0.45, gap / length / 2);
  return [
    {
      x1: start.x,
      y1: start.y,
      x2: start.x + dx * (0.5 - halfGapT),
      y2: start.y + dy * (0.5 - halfGapT),
      width,
    },
    {
      x1: start.x + dx * (0.5 + halfGapT),
      y1: start.y + dy * (0.5 + halfGapT),
      x2: end.x,
      y2: end.y,
      width,
    },
  ];
}

function applyScientistPull(h, dt) {
  if (!(h.pullStrength > 0) || !(h.pullRadius > 0)) return;
  const p = state.player;
  const dx = h.x - p.x;
  const dy = h.y - p.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  if (distance >= h.pullRadius) return;
  const force = h.pullStrength * (1 - distance / h.pullRadius);
  p.x = clamp(p.x + dx / distance * force * dt, -WORLD_SIZE / 2 + p.r, WORLD_SIZE / 2 - p.r);
  p.y = clamp(p.y + dy / distance * force * dt, -WORLD_SIZE / 2 + p.r, WORLD_SIZE / 2 - p.r);
}

function pointAlongPath(points, progress) {
  if (!points?.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const scaled = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * t,
    y: points[index].y + (points[index + 1].y - points[index].y) * t,
  };
}

function updateStormLaserNet(h, dt) {
  if (h.armTime > 0) h.armTime = Math.max(0, h.armTime - dt);
  h.x += (h.vx || 0) * dt;
  h.y += (h.vy || 0) * dt;
  const half = WORLD_SIZE / 2 + 180;
  if (h.fullWave && h.x < -half) h.x = half;
  if (h.fullWave && h.x > half) h.x = -half;
  if (h.fullWave && h.y < -half) h.y = half;
  if (h.fullWave && h.y > half) h.y = -half;
}

function updateStormStrike(h, dt) {
  if (h.armTime > 0) h.armTime = Math.max(0, h.armTime - dt);
  h.spin = (h.spin || 0) + dt * ((h.armTime || 0) > 0 ? 3.8 : 14);
  if ((h.armTime || 0) <= 0 && !h.impactFx) {
    h.impactFx = true;
    burst(h.x, h.y, 16, h.color, 210);
    pulse(h.x, h.y, h.r * 1.16, h.color, 0.2);
    state.shake = Math.max(state.shake, 6);
  }
}

function updatePolarIceLane(h, dt) {
  if (h.armTime > 0) h.armTime = Math.max(0, h.armTime - dt);
  h.pulse = (h.pulse || 0) + dt;
  if ((h.armTime || 0) <= 0 && !h.impactFx) {
    h.impactFx = true;
    burst(h.x, h.y, 14, h.color, 190);
    pulse(h.x, h.y, Math.max(52, (h.width || 24) * 2.2), h.color, 0.16);
    state.shake = Math.max(state.shake, h.style === "absolute_zero" ? 7 : 5);
  }
}

function updatePhaseTear(h, dt) {
  h.spin = (h.spin || 0) + dt * 4.8;
  const p = state.player;
  const dx = p.x - h.x;
  const dy = p.y - h.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  if (d > h.r || (h.armTime || 0) > 0) return;
  const force = (1 - d / h.r) * 125;
  p.x += -dy / d * force * dt;
  p.y += dx / d * force * dt;
}

function updateInfernoBeacon(h, dt) {
  h.spin = (h.spin || 0) + dt * 3.8;
  h.armTime = Math.max(0, (h.armTime || 0) - dt);
  h.cooldown = Math.max(0, (h.cooldown || 0) - dt);
  h.charge = h.armTime > 0
    ? 1 - h.armTime / Math.max(0.01, h.armDuration || h.armTime)
    : h.cooldown <= 0.48 ? 1 - h.cooldown / 0.48 : 0;
  if (h.armTime > 0 || h.cooldown > 0) return;
  h.cooldown = 1.65 + Math.random() * 0.45;
  const base = Math.atan2(state.player.y - h.y, state.player.x - h.x);
  for (const offset of [-0.2, 0, 0.2]) {
    const a = base + offset;
    world.enemyProjectiles.push({
      x: h.x + Math.cos(a) * h.r * 0.34,
      y: h.y + Math.sin(a) * h.r * 0.34,
      vx: Math.cos(a) * 245,
      vy: Math.sin(a) * 245,
      r: offset === 0 ? 8 : 6.5,
      color: offset === 0 ? "#ffd166" : "#ff7a1a",
      damage: 11,
      burnDuration: 2.6,
      burnDps: 7,
      life: 3.8,
      shape: "fireball",
      spin: Math.random() * TAU,
      emberTrail: true,
    });
  }
  burst(h.x, h.y, 8, "#ff7a1a", 130);
  pulse(h.x, h.y, h.r * 0.9, "#ffd166", 0.18);
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
  if (b.shape === "darkEntityHunter") {
    const nextT = Math.min(1, (b.pathT || 0) + dt / Math.max(0.01, b.pathDuration || 2));
    const point = quadraticPoint(b.pathStart, b.pathControl, b.pathEnd, nextT);
    b.vx = (point.x - b.x) / Math.max(0.001, dt);
    b.vy = (point.y - b.y) / Math.max(0.001, dt);
    b.spin = Math.atan2(b.vy, b.vx);
    b.pathT = nextT;
    if (nextT >= 1) b.life = Math.min(b.life, 0.04);
  } else if (b.shape === "darkEntityScythe") {
    const speed = Math.max(1, Math.hypot(b.vx, b.vy));
    b.heading = (b.heading ?? Math.atan2(b.vy, b.vx)) + (b.curve || 0) * dt;
    b.vx = Math.cos(b.heading) * speed;
    b.vy = Math.sin(b.heading) * speed;
    b.spin = b.heading;
  } else if (b.shape === "darkEntityLance") {
    b.spin = Math.atan2(b.vy, b.vx);
  } else if (b.shape === "scientistAbyssCore") {
    b.spin = (b.spin || 0) + dt * (b.splitSide || 1) * 3.8;
    b.splitTimer = Math.max(0, (b.splitTimer || 0) - dt);
    if (b.splitTimer <= 0 && !b.splitDone) {
      b.splitDone = true;
      b.abyssScientistOwner?.splitAbyssCore?.(b);
      b.life = 0;
    }
  } else if (b.shape === "scientistAbyssShard") {
    if ((b.activationDelay || 0) > 0) {
      b.activationDelay = Math.max(0, b.activationDelay - dt);
      if (b.activationDelay <= 0) {
        b.vx = b.launchVx || 0;
        b.vy = b.launchVy || 0;
        b.hidden = false;
        b.nonColliding = false;
        burst(b.x, b.y, 4, b.color, 80);
      }
    } else {
      const speed = Math.max(1, Math.hypot(b.vx, b.vy));
      const angle = Math.atan2(b.vy, b.vx) + (b.curve || 0) * dt;
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      b.spin = angle;
    }
  } else if (b.shape === "convictShrapnel") {
    b.spin = (b.spin || 0) + dt * 15;
    if ((b.activationDelay || 0) > 0) {
      b.activationDelay = Math.max(0, b.activationDelay - dt);
      if (b.activationDelay <= 0) {
        b.vx = b.launchVx || 0;
        b.vy = b.launchVy || 0;
        b.hidden = false;
        b.nonColliding = false;
        if (b.activationFx) burst(b.x, b.y, 4, b.color, 90);
      }
    }
  } else if (b.shape === "convictBall") {
    b.spin = (b.spin || 0) + dt * 8;
    let linked = b.linkedHazard;
    if (Array.isArray(b.bounceHazards)) {
      linked = b.bounceHazards.find((hazard) => (hazard.armTime || 0) <= 0 && hazard.life > 0)
        || b.bounceHazards.find((hazard) => hazard.life > 0);
    }
    if (!linked || linked.life <= 0) {
      b.life = 0;
      return;
    }
    b.x = linked.ballX ?? linked.x ?? b.x;
    b.y = linked.ballY ?? linked.y ?? b.y;
    b.hidden = Boolean(b.armedOnly && (linked.armTime || 0) > 0);
    b.visualHeight = b.drop ? Math.max(0, (linked.armTime || 0) / Math.max(0.01, linked.armDuration || 1)) * 130 : 0;
  } else if (b.shape === "riftbladeCrescent") {
    const speed = Math.max(1, Math.hypot(b.vx, b.vy));
    const turn = b.returnAt >= 0 && b.life < b.returnAt ? b.returnCurve || 0 : b.curve || 0;
    const angle = Math.atan2(b.vy, b.vx) + turn * dt;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.spin = angle;
  } else if (b.shape === "razorBoomerang") {
    b.spin = (b.spin || 0) + dt * 24;
    if (b.owner && !b.owner.dead && b.life < (b.returnAt || 1.4)) {
      const dx = b.owner.x - b.x;
      const dy = b.owner.y - b.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const speed = 360;
      b.vx += (dx / d * speed - b.vx) * Math.min(1, dt * 6.5);
      b.vy += (dy / d * speed - b.vy) * Math.min(1, dt * 6.5);
    }
  } else if (b.shape === "fastGear" || b.shape === "starShard" || b.shape === "phaseShard" || b.shape === "arcaneOrb" || b.shape === "slimeOrb" || b.shape === "zombieClot") {
    b.spin = (b.spin || 0) + dt * (b.shape === "fastGear" ? 18 : 6);
  }
}

function quadraticPoint(start, control, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function updateRiftbladeHazard(h, dt) {
  let armedThisFrame = false;
  if ((h.armTime || 0) > 0) {
    h.armTime = Math.max(0, h.armTime - dt);
    if (h.armTime > 0) return;
    if (!h.riftbladeArmed) {
      h.riftbladeArmed = true;
      armedThisFrame = true;
      if (h.kind === "riftblade_bladefall") {
        burst(h.x, h.y, 12, h.color, 180);
        state.shake = Math.max(state.shake, 4);
      } else {
        state.shake = Math.max(state.shake, h.sceneBlade ? 6 : 3);
      }
    }
  }
  if (!armedThisFrame) h.damageDelay = Math.max(0, (h.damageDelay || 0) - dt);
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
