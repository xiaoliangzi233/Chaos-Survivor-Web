import { PARTICLE_LIMIT, PROJECTILE_LIMIT } from "../constants.js";
import { world } from "../state.js";
import { framePerformance } from "./performanceMonitor.js";

export const RUNTIME_BUDGETS = Object.freeze({
  playerProjectiles: PROJECTILE_LIMIT,
  particles: PARTICLE_LIMIT,
  enemyProjectilesWarning: 800,
  hazardsWarning: 128,
  weaponFxWarning: 640,
});

const lastWarningAt = new Map();

export function monitorRuntimeBudgets(now = performance.now()) {
  const counts = {
    enemies: world.enemies.length,
    playerProjectiles: world.projectiles.length,
    enemyProjectiles: world.enemyProjectiles.length,
    hazards: world.hazards.length,
    particles: world.particles.length,
    weaponFx: world.weaponFx.length,
  };
  for (const [name, value] of Object.entries(counts)) framePerformance.setCounter(name, value);
  warnAbove("enemyProjectiles", counts.enemyProjectiles, RUNTIME_BUDGETS.enemyProjectilesWarning, now);
  warnAbove("hazards", counts.hazards, RUNTIME_BUDGETS.hazardsWarning, now);
  warnAbove("weaponFx", counts.weaponFx, RUNTIME_BUDGETS.weaponFxWarning, now);
  return counts;
}

function warnAbove(name, value, budget, now) {
  if (value <= budget || now - (lastWarningAt.get(name) || -Infinity) < 5000) return;
  lastWarningAt.set(name, now);
  console.warn(`[budget] ${name}=${value} exceeds warning budget ${budget}; gameplay objects remain simulated.`);
}
