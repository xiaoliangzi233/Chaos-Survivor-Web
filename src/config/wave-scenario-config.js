import { emberSpawnRateForWave, emberWaveScenario, emberWaveSpawnPool } from "./ember-wave-scenarios.js";
import { neonWaveScenario } from "./neon-wave-scenarios.js";
import { overclockSpawnRateForWave, overclockWaveScenario, overclockWaveSpawnPool } from "./overclock-wave-scenarios.js";
import { challengeWaveScenario } from "./challenge-waves.js";

export function waveScenarioFor(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveScenario(wave);
  if (difficultyId === "neon") return neonWaveScenario(wave);
  if (difficultyId === "overclock") return overclockWaveScenario(wave);
  if (difficultyId === "challenge_lab") return challengeWaveScenario(wave);
  return null;
}

export function waveScenarioSpawnPool(difficultyId, wave) {
  if (difficultyId === "ember") return emberWaveSpawnPool(wave);
  if (difficultyId === "overclock") return overclockWaveSpawnPool(wave);
  const scenario = waveScenarioFor(difficultyId, wave);
  return [...(scenario?.pool || [])];
}

export function waveScenarioSpawnRate(difficultyId, wave) {
  if (difficultyId === "ember") return emberSpawnRateForWave(wave);
  if (difficultyId === "overclock") return overclockSpawnRateForWave(wave);
  return waveScenarioFor(difficultyId, wave)?.spawnRate ?? 1;
}

export function isChallengeMode() {
  return false; // placeholder, real check in main.js via state.gameMode
}
