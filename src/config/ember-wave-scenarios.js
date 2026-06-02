const BASIC_SLIMES = ["slime_small", "slime_medium", "slime_large"];
const ALL_SLIMES = [
  ...BASIC_SLIMES,
  "slime_diamond",
  "slime_gold",
  "slime_glow",
  "slime_weeping",
  "slime_devil",
  "slime_angel",
];
const LATE_MIX = ["zombie", "lancer", ...BASIC_SLIMES, "wisp", "razorbat", "gearfiend"];

export const EMBER_WAVE_SCENARIOS = [
  { wave: 1, pool: ["zombie"], spawnRate: 0.48 },
  { wave: 2, pool: ["zombie"], spawnRate: 1.08 },
  { wave: 3, pool: ["zombie", "lancer"], spawnRate: 0.86 },
  { wave: 4, pool: ["lancer"], spawnRate: 1.22 },
  { wave: 5, pool: ["zombie", "lancer"], spawnRate: 0.94, elite: { id: "zombie", variant: "giant", count: 1 } },
  { wave: 6, pool: ["zombie", ...BASIC_SLIMES], spawnRate: 0.92 },
  { wave: 7, pool: ["zombie", "lancer", ...BASIC_SLIMES], spawnRate: 1.0 },
  { wave: 8, pool: ALL_SLIMES, spawnRate: 1.36 },
  { wave: 9, pool: ["zombie", "lancer", ...BASIC_SLIMES], spawnRate: 1.32, effect: "blind" },
  { wave: 10, pool: [], spawnRate: 0, boss: "storm_tyrant" },
  { wave: 11, pool: ["wisp", "zombie", "lancer"], spawnRate: 1.0 },
  { wave: 12, pool: ["wisp"], spawnRate: 0.92, effect: "ice_skate" },
  { wave: 13, pool: ["thief"], spawnRate: 0.7, reward: true },
  { wave: 14, pool: ["zombie", "lancer", ...BASIC_SLIMES, "wisp"], spawnRate: 1.38 },
  { wave: 15, pool: ["razorbat", "zombie", ...BASIC_SLIMES, "lancer"], spawnRate: 1.12 },
  { wave: 16, pool: ["wisp", "razorbat"], spawnRate: 1.06, elite: { id: "wisp", variant: "elite", count: 1 } },
  { wave: 17, pool: ["gearfiend", "zombie", "lancer", ...BASIC_SLIMES], spawnRate: 1.08, gearfiendMode: "fast_only" },
  { wave: 18, pool: LATE_MIX, spawnRate: 1.5 },
  { wave: 19, pool: LATE_MIX, spawnRate: 1.58, elite: { id: "gearfiend", variant: "giant", count: 1 } },
  { wave: 20, pool: [], spawnRate: 0, boss: "polar_crystal_wraith" },
];

export function emberWaveScenario(wave) {
  return EMBER_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

export function emberWaveSpawnPool(wave) {
  return [...(emberWaveScenario(wave)?.pool || [])];
}

export function emberSpawnRateForWave(wave) {
  return emberWaveScenario(wave)?.spawnRate ?? 1;
}
