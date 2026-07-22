import { emberSpawnRateForWave, emberWaveScenario, emberWaveSpawnPool } from "./ember-wave-scenarios.js";
import { neonWaveScenario } from "./neon-wave-scenarios.js";
import { overclockSpawnRateForWave, overclockWaveScenario, overclockWaveSpawnPool } from "./overclock-wave-scenarios.js";
import { singularitySpawnRateForWave, singularityWaveScenario, singularityWaveSpawnPool } from "./singularity-wave-scenarios.js";

export function waveScenarioFor(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveScenario(wave);
  if (difficultyId === "neon") return neonWaveScenario(wave);
  if (difficultyId === "overclock") return overclockWaveScenario(wave);
  if (difficultyId === "singularity") return singularityWaveScenario(wave);
  return null;
}

export function waveScenarioSpawnPool(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveSpawnPool(wave);
  if (difficultyId === "overclock") return overclockWaveSpawnPool(wave);
  if (difficultyId === "singularity") return singularityWaveSpawnPool(wave);
  const scenario = waveScenarioFor(difficultyId, wave);
  return [...(scenario?.pool || [])];
}

export function waveScenarioSpawnRate(difficultyId, wave) {
  if (difficultyId === "ember") return emberSpawnRateForWave(wave);
  if (difficultyId === "overclock") return overclockSpawnRateForWave(wave);
  if (difficultyId === "singularity") return singularitySpawnRateForWave(wave);
  return waveScenarioFor(difficultyId, wave)?.spawnRate ?? 1;
}

