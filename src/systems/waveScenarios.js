import { state } from "../state.js";
import { pulse } from "../effects.js";
import { emberWaveScenario } from "../config/ember-wave-scenarios.js";
import { spawnEnemyById } from "./enemyRegistry.js";

export function resetWaveScenarioState() {
  state.waveScenario = null;
  state.spawnedWaveEvents = new Set();
}

export function applyWaveStartScenario() {
  state.waveScenario = state.difficultyId === "ember" ? emberWaveScenario(state.wave) : null;
  if (!state.waveScenario) return;
  spawnScenarioElite(state.waveScenario);
}

export function activeWaveEffect(effect) {
  return state.difficultyId === "ember" && state.waveScenario?.effect === effect;
}

export function activeGearfiendMode() {
  return state.difficultyId === "ember" ? state.waveScenario?.gearfiendMode || null : null;
}

function spawnScenarioElite(scenario) {
  const elite = scenario.elite;
  if (!elite) return;
  const key = `ember-${scenario.wave}-elite-${elite.id}`;
  state.spawnedWaveEvents ||= new Set();
  if (state.spawnedWaveEvents.has(key)) return;
  for (let i = 0; i < elite.count; i++) {
    const enemy = spawnEnemyById(elite.id);
    if (!enemy) continue;
    markElite(enemy, elite.variant);
    pulse(enemy.x, enemy.y, enemy.r * 3.2, enemy.color, 0.4);
  }
  state.spawnedWaveEvents.add(key);
}

function markElite(enemy, variant) {
  enemy.elite = true;
  enemy.eliteVariant = variant;
  enemy.name = variant === "giant" ? `巨型${enemy.name || ""}` : `精英${enemy.name || ""}`;
  const scale = variant === "giant" ? 1.75 : 1.35;
  enemy.r *= scale;
  enemy.hp *= variant === "giant" ? 3.2 : 2.2;
  enemy.maxHp = enemy.hp;
  enemy.damage *= variant === "giant" ? 1.55 : 1.35;
  enemy.speed *= variant === "giant" ? 0.72 : 1.08;
  enemy.xp *= variant === "giant" ? 3 : 2;
  enemy.knockbackResistance = Math.max(enemy.knockbackResistance || 0, variant === "giant" ? 0.72 : 0.58);
}
