const BASIC_SLIMES = ["slime_small", "slime_medium", "slime_large"];

export const APOCALYPSE_WAVE_SCENARIOS = [
  { wave: 1, pool: ["zombie"], spawnRate: 0.58 },
  { wave: 2, pool: ["zombie", "lancer"], spawnRate: 0.64 },
  {
    wave: 3,
    pool: ["zombie", "lancer", "pentastar"],
    spawnRate: 0.7,
    event: {
      type: "quadrant_verdict",
      intro: 2.4,
      cycle: 8,
      warning: 2.2,
      active: 2.6,
      damage: 18,
      enemyDamage: 42,
      objectCap: 1,
      fingerprint: { playerVerb: "commit", topology: "quadrants", timeModel: "alternating_verdict", systemTarget: "shared_environment_damage" },
    },
  },
  { wave: 4, pool: ["mech_worm", ...BASIC_SLIMES], spawnRate: 0.74 },
  { wave: 5, pool: ["lancer", "wisp", "pentastar", "mech_worm"], spawnRate: 0.8 },
  {
    wave: 6,
    pool: ["doctor", "zombie", ...BASIC_SLIMES],
    spawnRate: 0.76,
    event: {
      type: "ember_convoy",
      intro: 2.6,
      radius: 250,
      damage: 16,
      enemyDamage: 34,
      objectCap: 1,
      fingerprint: { playerVerb: "escort", topology: "figure_eight_sanctuary", timeModel: "continuous_migration", systemTarget: "exposure_and_enemy_attrition" },
    },
  },
  { wave: 7, pool: ["embermine", "mech_worm", "lancer", "wisp"], spawnRate: 0.84 },
  {
    wave: 8,
    pool: ["exploder", "embermine", "shield_caster", "doctor"],
    spawnRate: 0.88,
    elite: { id: "embermine", variant: "embermine_overlord", count: 1 },
  },
  {
    wave: 9,
    pool: ["tank", "pyromancer", "wisp", "pentastar"],
    spawnRate: 0.86,
    event: {
      type: "doom_ledger",
      intro: 2.2,
      sentenceTime: 5.2,
      pullRadius: 720,
      detonationRadius: 270,
      damage: 20,
      enemyDamage: 86,
      objectCap: 1,
      fingerprint: { playerVerb: "bait", topology: "mobile_enemy_anchor", timeModel: "recurring_sentence", systemTarget: "enemy_allegiance_and_clustering" },
    },
  },
  { wave: 10, pool: [], spawnRate: 0, boss: "riftblade_saint", bossProfile: "apocalypse_riftblade_duel" },
  { wave: 11, pool: ["razorbat", "wizard", "lancer", "pentastar"], spawnRate: 0.9 },
  {
    wave: 12,
    pool: ["gearfiend", "pyromancer", "mech_worm", "wisp"],
    spawnRate: 0.9,
    event: {
      type: "causal_echo_route",
      intro: 2.6,
      cycle: 8,
      warning: 2,
      active: 3.1,
      delay: 1.5,
      memory: 2.8,
      safeWidth: 92,
      damage: 18,
      objectCap: 64,
      fingerprint: { playerVerb: "write", topology: "player_authored_corridor", timeModel: "delayed_echo", systemTarget: "movement_history" },
    },
  },
  {
    wave: 13,
    pool: ["prism_medic", "shield_caster", "tank", "exploder"],
    spawnRate: 0.96,
    elite: { id: "shield_caster", variant: "elite", count: 1 },
  },
  {
    wave: 14,
    pool: ["phase_mirage", "magnet_raider", "razorbat", "lancer"],
    spawnRate: 0.94,
    event: {
      type: "ceasefire_credit",
      intro: 2,
      cycle: 8,
      stasis: 3.4,
      projectileCap: 72,
      objectCap: 72,
      fingerprint: { playerVerb: "schedule", topology: "arena_wide_time_layer", timeModel: "reversible_stasis", systemTarget: "projectile_time" },
    },
  },
  {
    wave: 15,
    pool: ["phase_mirage", "pyromancer", "gearfiend", "wizard"],
    spawnRate: 1.02,
    elite: { id: "pyromancer", variant: "inferno_conductor", count: 1 },
  },
  {
    wave: 16,
    pool: ["blackhole_mage", "magma_beetle", "siege_pylon", "prism_medic"],
    spawnRate: 0.96,
    event: {
      type: "sanctuary_quota",
      intro: 2.4,
      cycle: 10.2,
      warning: 3.8,
      active: 4.2,
      radius: 270,
      quota: 6,
      damage: 19,
      objectCap: 1,
      fingerprint: { playerVerb: "count_and_abandon", topology: "reactive_single_sanctuary", timeModel: "occupancy_locked_cycle", systemTarget: "enemy_population" },
    },
  },
  {
    wave: 17,
    pool: ["brood_seeder", "line_raider", "magnet_raider", "mech_worm", "shield_caster"],
    spawnRate: 1.02,
    elite: { id: "brood_seeder", variant: "brood_core", count: 1 },
  },
  {
    wave: 18,
    pool: ["gunner", "phase_mirage", "siege_pylon", "laser_eye", "razorbat"],
    spawnRate: 1.04,
    event: {
      type: "mercy_faultline",
      intro: 2.2,
      rotateEvery: 10,
      chargeNeeded: 6,
      blastRadius: 230,
      enemyDamage: 72,
      projectileCap: 96,
      objectCap: 96,
      fingerprint: { playerVerb: "intercept", topology: "rotating_world_seam", timeModel: "accumulating_conversion", systemTarget: "projectile_ownership" },
    },
  },
  {
    wave: 19,
    pool: ["artillery", "gunner", "blackhole_mage", "line_raider", "shield_caster", "pyromancer"],
    spawnRate: 1.1,
    elite: {
      variants: [
        { id: "magnet_raider", variant: "magnetic_captain" },
        { id: "pyromancer", variant: "inferno_conductor" },
      ],
      count: 2,
    },
  },
  { wave: 20, pool: [], spawnRate: 0, boss: "storm_rail_devourer", bossProfile: "apocalypse_storm_rail_finale" },
];

export function apocalypseWaveScenario(wave) {
  return APOCALYPSE_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

export function apocalypseWaveSpawnPool(wave) {
  return [...(apocalypseWaveScenario(wave)?.pool || [])];
}

export function apocalypseSpawnRateForWave(wave) {
  return apocalypseWaveScenario(wave)?.spawnRate ?? 1;
}
