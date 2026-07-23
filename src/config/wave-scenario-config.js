import { emberSpawnRateForWave, emberWaveScenario, emberWaveSpawnPool } from "./ember-wave-scenarios.js";
import { neonWaveScenario } from "./neon-wave-scenarios.js";
import { overclockSpawnRateForWave, overclockWaveScenario, overclockWaveSpawnPool } from "./overclock-wave-scenarios.js";
import { singularitySpawnRateForWave, singularityWaveScenario, singularityWaveSpawnPool } from "./singularity-wave-scenarios.js";
import { apocalypseSpawnRateForWave, apocalypseWaveScenario, apocalypseWaveSpawnPool } from "./apocalypse-wave-scenarios.js";
import { voidCrownSpawnRateForWave, voidCrownWaveScenario, voidCrownWaveSpawnPool } from "./void-crown-wave-scenarios.js";
import { isRandomMode, randomWaveScenarioFor, randomWaveSpawnPool, randomWaveSpawnRate } from "../systems/randomMode.js";

export function waveScenarioFor(difficultyId, wave) {
  if (isRandomMode()) return randomWaveScenarioFor(wave);
  if (difficultyId === "ember") return emberWaveScenario(wave);
  if (difficultyId === "neon") return neonWaveScenario(wave);
  if (difficultyId === "overclock") return overclockWaveScenario(wave);
  if (difficultyId === "singularity") return singularityWaveScenario(wave);
  if (difficultyId === "apocalypse") return apocalypseWaveScenario(wave);
  if (difficultyId === "void_crown") return voidCrownWaveScenario(wave);
  return null;
}

export function waveScenarioSpawnPool(difficultyId, wave) {
  if (isRandomMode()) return randomWaveSpawnPool(wave);
  if (difficultyId === "ember") return emberWaveSpawnPool(wave);
  if (difficultyId === "overclock") return overclockWaveSpawnPool(wave);
  if (difficultyId === "singularity") return singularityWaveSpawnPool(wave);
  if (difficultyId === "apocalypse") return apocalypseWaveSpawnPool(wave);
  if (difficultyId === "void_crown") return voidCrownWaveSpawnPool(wave);
  const scenario = waveScenarioFor(difficultyId, wave);
  return [...(scenario?.pool || [])];
}

export function waveScenarioSpawnRate(difficultyId, wave) {
  if (isRandomMode()) return randomWaveSpawnRate(wave);
  if (difficultyId === "ember") return emberSpawnRateForWave(wave);
  if (difficultyId === "overclock") return overclockSpawnRateForWave(wave);
  if (difficultyId === "singularity") return singularitySpawnRateForWave(wave);
  if (difficultyId === "apocalypse") return apocalypseSpawnRateForWave(wave);
  if (difficultyId === "void_crown") return voidCrownSpawnRateForWave(wave);
  return waveScenarioFor(difficultyId, wave)?.spawnRate ?? 1;
}

