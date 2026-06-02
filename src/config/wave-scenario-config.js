import { emberSpawnRateForWave, emberWaveScenario, emberWaveSpawnPool } from "./ember-wave-scenarios.js";
import { neonWaveScenario } from "./neon-wave-scenarios.js";

export function waveScenarioFor(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveScenario(wave);
  if (difficultyId === "neon") return neonWaveScenario(wave);
  return null;
}

export function waveScenarioSpawnPool(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveSpawnPool(wave);
  const scenario = waveScenarioFor(difficultyId, wave);
  return [...(scenario?.pool || [])];
}

export function waveScenarioSpawnRate(difficultyId, wave) {
  if (difficultyId === "ember") return emberSpawnRateForWave(wave);
  return waveScenarioFor(difficultyId, wave)?.spawnRate ?? 1;
}

