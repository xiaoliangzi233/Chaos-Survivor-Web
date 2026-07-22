const BASIC_SLIMES = ["slime_small", "slime_medium", "slime_large"];

export const SINGULARITY_WAVE_SCENARIOS = [
  { wave: 1, pool: ["zombie", "wisp"], spawnRate: 0.74 },
  { wave: 2, pool: ["mech_worm"], spawnRate: 0.24, mechWormMode: "colossus", event: { type: "long_mech_worms", count: 3 } },
  { wave: 3, pool: ["blackhole_mage", ...BASIC_SLIMES], spawnRate: 1.04 },
  { wave: 4, pool: ["lancer", "zombie", "pentastar"], spawnRate: 1.12, event: { type: "sweeping_laser_maze", count: 1, width: 34, damage: 24, speed: 150, life: 999, fullWave: true }, effect: "laser_disaster" },
  { wave: 5, pool: ["pyromancer", "gearfiend", "brood_seeder"], spawnRate: 1.02 },
  { wave: 6, pool: ["pyromancer", "gearfiend", "wizard", "magma_beetle"], spawnRate: 1.08 },
  { wave: 7, pool: ["mech_worm", "pyromancer", "zombie", "lancer"], spawnRate: 1.18, elite: { id: "embermine", variant: "embermine_overlord", count: 1 } },
  { wave: 8, pool: ["phase_mirage", "zombie", "lancer", "wisp", ...BASIC_SLIMES], spawnRate: 1.2 },
  { wave: 9, pool: ["phase_mirage", "blackhole_mage", "pentastar", "gearfiend"], spawnRate: 1.18, event: { type: "phase_tear_grid", count: 7, radius: 92, life: 999, fullWave: true, minPlayerDistance: 250 }, effect: "phase_tear_grid" },
  { wave: 10, pool: [], spawnRate: 0, boss: "storm_tyrant", bossProfile: "singularity_three_phase" },
  { wave: 11, pool: ["pyromancer", "phase_mirage", "magma_beetle", "wizard"], spawnRate: 1.24 },
  { wave: 12, pool: ["laser_eye", "blackhole_mage", "wisp", "pentastar"], spawnRate: 1.18, event: { type: "mirror_laser_gate", count: 4, width: 24, damage: 18, speed: 22, life: 999, fullWave: true }, effect: "mirror_laser_gate" },
  { wave: 13, pool: ["brood_seeder", "pyromancer", "gearfiend", ...BASIC_SLIMES], spawnRate: 1.32 },
  { wave: 14, pool: ["phase_mirage", "laser_eye", "lancer", "mech_worm"], spawnRate: 1.34, elite: { id: "phase_mirage", variant: "elite", count: 1 } },
  { wave: 15, pool: ["pyromancer", "blackhole_mage", "wizard", "magma_beetle", "gearfiend"], spawnRate: 1.38, event: { type: "inferno_resonance", count: 5, radius: 74, armTime: 1.25, life: 999, fullWave: true, minPlayerDistance: 260 }, effect: "inferno_resonance" },
  { wave: 16, pool: ["laser_eye", "phase_mirage", "blackhole_mage", "pyromancer"], spawnRate: 1.4 },
  { wave: 17, pool: ["brood_seeder", "pyromancer", "mech_worm", "magma_beetle", "lancer"], spawnRate: 1.48, elite: { variants: [
    { id: "pyromancer", variant: "inferno_conductor" },
    { id: "laser_eye", variant: "elite" },
  ], count: 2 } },
  { wave: 18, pool: ["phase_mirage", "laser_eye", "blackhole_mage", "pentastar", "gearfiend"], spawnRate: 1.52, event: { type: "phase_tear_grid", count: 10, radius: 98, life: 999, fullWave: true, minPlayerDistance: 260 }, effect: "phase_tear_grid" },
  { wave: 19, pool: ["laser_eye", "phase_mirage", "pyromancer", "blackhole_mage", "mech_worm"], spawnRate: 1.58, elite: { id: "embermine", variant: "embermine_overlord", count: 1 } },
  { wave: 20, pool: [], spawnRate: 0, boss: "twin_abyssal_eyes" },
];

export function singularityWaveScenario(wave) {
  return SINGULARITY_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

export function singularityWaveSpawnPool(wave) {
  return [...(singularityWaveScenario(wave)?.pool || [])];
}

export function singularitySpawnRateForWave(wave) {
  return singularityWaveScenario(wave)?.spawnRate ?? 1;
}
