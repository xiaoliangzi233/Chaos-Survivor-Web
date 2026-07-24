import { GEM_LIMIT, PARTICLE_LIMIT, PROJECTILE_LIMIT, TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { particle } from "../effects.js";
import { enemyConfig, spawnEnemyById } from "./enemyRegistry.js";

const STRESS_ENEMY_COUNT = 430;
const STRESS_ENEMY_PROJECTILE_COUNT = 800;
const STRESS_HAZARD_COUNT = 128;

export function stressScenarioRequested(search = window.location.search) {
  return new URLSearchParams(search).get("stress") === "1";
}

export function populateDeterministicStressScenario(seed = 0x51f15e) {
  const random = seededRandom(seed);
  const originalRandom = Math.random;
  Math.random = random;
  try {
    state.debug.enabled = true;
    state.debug.unlocked = true;
    state.debug.runTainted = true;
    state.debug.invincible = true;
    state.debug.freezeWave = true;
    const ordinaryEnemyIds = Object.values(enemyConfig)
      .filter((entry) => !entry.boss && entry.id !== "thief")
      .map((entry) => entry.id);
    for (let index = 0; index < STRESS_ENEMY_COUNT && ordinaryEnemyIds.length; index++) {
      const angle = index * 2.399963229728653;
      const radius = 260 + (index % 18) * 58;
      spawnEnemyById(
        ordinaryEnemyIds[index % ordinaryEnemyIds.length],
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }
    for (const enemy of world.enemies) {
      enemy.update = function updateStressVisual(dt) {
        this.anim += dt * 3.2;
        this.flash = Math.max(0, this.flash - dt * 8);
      };
    }
    state.spawnedBossWaves.add(state.wave);
    for (let index = 0; index < PROJECTILE_LIMIT; index++) {
      const point = stressPoint(index, PROJECTILE_LIMIT, 170, 1120);
      world.projectiles.push({
        x: point.x,
        y: point.y,
        vx: 0,
        vy: 0,
        speed: 0,
        r: 4 + index % 3,
        angle: point.angle,
        color: index % 3 === 0 ? "#42e8ff" : index % 3 === 1 ? "#77ff8a" : "#b48cff",
        damage: 0,
        pierce: 0,
        life: 999,
        maxLife: 999,
        shape: index % 5 === 0 ? "droneBolt" : "arc",
        tracking: false,
        returning: false,
        returnAfter: 0,
        returnSpeed: 0,
        returnTimer: 0,
        explodeRadius: 0,
        explodeDamage: 0,
        freezeDuration: 0,
        knockback: 0,
        hitIds: new Set(),
        spin: point.angle,
        trailTimer: 999,
      });
    }
    for (let index = 0; index < STRESS_ENEMY_PROJECTILE_COUNT; index++) {
      const point = stressPoint(index, STRESS_ENEMY_PROJECTILE_COUNT, 210, 1380);
      world.enemyProjectiles.push({
        x: point.x,
        y: point.y,
        vx: 0,
        vy: 0,
        r: 4 + index % 5,
        angle: point.angle,
        color: index % 2 ? "#ff4d6d" : "#ff9f1c",
        damage: 0,
        life: 999,
        shape: index % 7 === 0 ? "orb" : "bolt",
      });
    }
    for (let index = 0; index < STRESS_HAZARD_COUNT; index++) {
      const point = stressPoint(index, STRESS_HAZARD_COUNT, 320, 1800);
      world.hazards.push({
        x: point.x,
        y: point.y,
        r: 34 + index % 7 * 8,
        radius: 34 + index % 7 * 8,
        damage: 0,
        life: 999,
        armTime: 999,
        color: index % 2 ? "#ff4d6d" : "#b48cff",
        kind: "circle",
      });
    }
    for (let index = 0; index < PARTICLE_LIMIT; index++) {
      const point = stressPoint(index, PARTICLE_LIMIT, 120, 1050);
      particle(index % 3 === 0 ? "mote" : "spark", point.x, point.y, {
        color: index % 2 ? "#42e8ff" : "#ffd166",
        life: 999,
        size: 2 + index % 5,
      });
    }
    for (let index = 0; index < GEM_LIMIT; index++) {
      const point = stressPoint(index, GEM_LIMIT, 150, 1220);
      world.gems.push({ x: point.x, y: point.y, value: index % 17 === 0 ? 15 : 1, phase: index * 0.17 });
    }
  } finally {
    Math.random = originalRandom;
  }
  const counts = stressScenarioCounts();
  document.documentElement.dataset.stressEnemyTypes = String(new Set(world.enemies.map((enemy) => enemy.type)).size);
  document.documentElement.dataset.stressEnemyCount = String(world.enemies.length);
  document.documentElement.dataset.stressEnemyProjectiles = String(world.enemyProjectiles.length);
  document.documentElement.dataset.stressHazards = String(world.hazards.length);
  console.info("[stress] deterministic render scenario ready", counts);
  return counts;
}

export function stressScenarioCounts() {
  return {
    enemies: world.enemies.length,
    playerProjectiles: world.projectiles.length,
    enemyProjectiles: world.enemyProjectiles.length,
    hazards: world.hazards.length,
    particles: world.particles.length,
    gems: world.gems.length,
  };
}

function stressPoint(index, count, innerRadius, outerRadius) {
  const angle = index / Math.max(1, count) * TAU * 17 + index * 0.071;
  const radius = innerRadius + (outerRadius - innerRadius) * ((index * 37) % count) / Math.max(1, count - 1);
  const half = WORLD_SIZE / 2 - 120;
  return {
    x: Math.max(-half, Math.min(half, Math.cos(angle) * radius)),
    y: Math.max(-half, Math.min(half, Math.sin(angle) * radius)),
    angle,
  };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}
