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
const WAVE_1_POOL = ["zombie", "lancer", ...BASIC_SLIMES];
const WAVE_2_POOL = ["zombie", "lancer"];
const WAVE_3_POOL = [...new Set([...WAVE_1_POOL, ...WAVE_2_POOL])];
const OVERCLOCK_NEWCOMERS = ["blackhole_mage", "embermine", "exploder", "magnet_raider", "gunner", "brood_seeder"];
const OVERCLOCK_SUPPORT = ["doctor", "shield_caster", "wizard", "magma_beetle", "gearfiend", "mech_worm", "pentastar", "razorbat"];

export const OVERCLOCK_WAVE_SCENARIOS = [
  { wave: 1, pool: WAVE_1_POOL, spawnRate: 0.72 },
  { wave: 2, pool: WAVE_2_POOL, spawnRate: 0.86 },
  { wave: 3, pool: WAVE_3_POOL, spawnRate: 1.0 },
  { wave: 4, pool: ["blackhole_mage", "lancer", "mech_worm", ...BASIC_SLIMES, "wisp"], spawnRate: 1.08, event: { type: "gravity_well_grid", count: 6, radius: 108, life: 999, fullWave: true, minPlayerDistance: 260 }, effect: "gravity_well_grid" },
  { wave: 5, pool: ["blackhole_mage", "pentastar", "razorbat", "zombie"], spawnRate: 1.06, elite: { id: "blackhole_mage", variant: "collapsing_blackhole", count: 1 } },
  { wave: 6, pool: ["embermine", "magma_beetle", "zombie", ...ALL_SLIMES, "doctor"], spawnRate: 1.12 },
  { wave: 7, pool: ["exploder", "embermine", "lancer", "magma_beetle"], spawnRate: 1.22, event: { type: "ember_mine_rain", clusters: 5, minesPerCluster: 3, radius: 78, life: 10, minPlayerDistance: 220 } },
  { wave: 8, pool: ["magnet_raider", "mech_worm", "gearfiend", "pentastar", ...BASIC_SLIMES], spawnRate: 1.18 },
  { wave: 9, pool: ["gunner", "blackhole_mage", "magnet_raider", "razorbat", "wisp"], spawnRate: 1.2, event: { type: "prism_refraction", count: 5, radius: 128, life: 999, fullWave: true, minPlayerDistance: 250 }, effect: "prism_refraction" },
  { wave: 10, pool: [], spawnRate: 0, boss: "void_fold_archon" },
  { wave: 11, pool: ["brood_seeder", "doctor", "shield_caster", ...BASIC_SLIMES, "zombie"], spawnRate: 1.16 },
  { wave: 12, pool: ["brood_seeder", "blackhole_mage", "embermine", "exploder", ...BASIC_SLIMES], spawnRate: 1.26, event: { type: "nest_spore_bloom", count: 8, radius: 58, life: 999, fullWave: true, minPlayerDistance: 240 }, effect: "nest_spore_bloom" },
  { wave: 13, pool: ["magnet_raider", "exploder", "mech_worm", "magma_beetle", "razorbat", "gearfiend"], spawnRate: 1.3 },
  { wave: 14, pool: ["gunner", "pentastar", "wizard", "shield_caster", "blackhole_mage"], spawnRate: 1.28, event: { type: "magnetic_drift", count: 5, radius: 146, life: 999, fullWave: true, minPlayerDistance: 260 }, effect: "magnetic_drift" },
  { wave: 15, pool: ["magnet_raider", "gunner", "mech_worm", "gearfiend", "lancer"], spawnRate: 1.36, elite: { id: "magnet_raider", variant: "magnetic_captain", count: 1 } },
  { wave: 16, pool: ["brood_seeder", "doctor", "shield_caster", "exploder", ...BASIC_SLIMES], spawnRate: 1.38, elite: { id: "brood_seeder", variant: "brood_core", count: 1 }, event: { type: "nest_spore_bloom", count: 10, radius: 58, life: 999, fullWave: true, minPlayerDistance: 240 }, effect: "nest_spore_bloom" },
  { wave: 17, pool: [...OVERCLOCK_NEWCOMERS, "razorbat", "mech_worm"], spawnRate: 1.52 },
  { wave: 18, pool: ["gunner", "magnet_raider", "blackhole_mage", "wizard", "pentastar", "gearfiend"], spawnRate: 1.48, effect: "overclock_pulse" },
  { wave: 19, pool: [...OVERCLOCK_NEWCOMERS, "doctor", "shield_caster"], spawnRate: 1.62, elite: { variants: [
    { id: "blackhole_mage", variant: "collapsing_blackhole" },
    { id: "magnet_raider", variant: "magnetic_captain" },
    { id: "brood_seeder", variant: "brood_core" },
  ], count: 2 } },
  { wave: 20, pool: [], spawnRate: 0, boss: "magrail_brood_matriarch" },
];

export function overclockWaveScenario(wave) {
  return OVERCLOCK_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

export function overclockWaveSpawnPool(wave) {
  return [...(overclockWaveScenario(wave)?.pool || [])];
}

export function overclockSpawnRateForWave(wave) {
  return overclockWaveScenario(wave)?.spawnRate ?? 1;
}

export function overclockEnemyIds() {
  return [...new Set([...WAVE_3_POOL, ...OVERCLOCK_NEWCOMERS, ...OVERCLOCK_SUPPORT])];
}
