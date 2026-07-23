const BASIC_SLIMES = ["slime_small", "slime_medium", "slime_large"];

export const VOID_CROWN_WAVE_SCENARIOS = [
  { wave: 1, pool: ["zombie"], spawnRate: 0.5 },
  { wave: 2, pool: ["zombie", "lancer"], spawnRate: 0.56 },
  { wave: 3, pool: ["lancer", "wisp", "pentastar"], spawnRate: 0.6 },
  {
    wave: 4,
    pool: ["zombie", "lancer", "wisp", "pentastar"],
    spawnRate: 0.62,
    event: {
      type: "crown_levy",
      intro: 2.4,
      orbitRadius: 430,
      treasuryRadius: 116,
      pullRadius: 3000,
      pullSpeed: 118,
      objectCap: 96,
      fingerprint: {
        playerVerb: "intercept",
        topology: "orbiting_resource_treasury",
        timeModel: "continuous_escrow_flow",
        systemTarget: "resource_position",
      },
    },
  },
  {
    wave: 5,
    pool: ["lancer", "wisp", "pentastar"],
    spawnRate: 0.64,
    event: {
      type: "fold_transit",
      intro: 2.2,
      cycle: 12,
      warning: 2.2,
      active: 7.4,
      gateRadius: 104,
      cooldown: 1.15,
      objectCap: 2,
      fingerprint: {
        playerVerb: "fold",
        topology: "paired_remote_gateways",
        timeModel: "alternating_topology",
        systemTarget: "arena_connectivity",
      },
    },
  },
  { wave: 6, pool: ["mech_worm", ...BASIC_SLIMES, "zombie"], spawnRate: 0.66 },
  { wave: 7, pool: ["doctor", "mech_worm", "zombie", "slime_medium"], spawnRate: 0.68 },
  {
    wave: 8,
    pool: ["embermine", "lancer", "wisp", "doctor"],
    spawnRate: 0.7,
    event: {
      type: "void_relay",
      intro: 2.2,
      stepTime: 9.2,
      radius: 112,
      damage: 17,
      enemyDamage: 52,
      objectCap: 3,
      fingerprint: {
        playerVerb: "synchronize",
        topology: "ordered_constellation",
        timeModel: "player_advanced_sequence",
        systemTarget: "arena_objective_clock",
      },
    },
  },
  {
    wave: 9,
    pool: ["tank", "pyromancer", "shield_caster", "embermine"],
    spawnRate: 0.72,
    elite: { id: "embermine", variant: "embermine_overlord", count: 1 },
  },
  {
    wave: 10,
    pool: [],
    spawnRate: 0,
    boss: "chainbreak_convict",
    bossProfile: "void_crown_chainbreak_duel",
  },
  { wave: 11, pool: ["razorbat", "wizard", "lancer", "pentastar"], spawnRate: 0.74 },
  {
    wave: 12,
    pool: ["gearfiend", "pyromancer", "mech_worm", "wisp"],
    spawnRate: 0.78,
    event: {
      type: "crown_ingress",
      intro: 2.2,
      chooseTime: 4.2,
      holdTime: 9,
      gateRadius: 156,
      selectionRadius: 340,
      objectCap: 4,
      fingerprint: {
        playerVerb: "seal",
        topology: "four_boundary_ingresses",
        timeModel: "player_committed_spawn_epoch",
        systemTarget: "spawn_origin",
      },
    },
  },
  {
    wave: 13,
    pool: ["prism_medic", "shield_caster", "tank", "exploder"],
    spawnRate: 0.8,
    elite: { id: "shield_caster", variant: "elite", count: 1 },
  },
  {
    wave: 14,
    pool: ["phase_mirage", "magnet_raider", "razorbat", "lancer"],
    spawnRate: 0.82,
    elite: { id: "magnet_raider", variant: "magnetic_captain", count: 1 },
  },
  {
    wave: 15,
    pool: ["phase_mirage", "pyromancer", "gearfiend", "wizard"],
    spawnRate: 0.84,
    event: {
      type: "sovereign_exchange",
      intro: 2.4,
      sentenceTime: 4.4,
      rest: 2.8,
      targetRadius: 168,
      enemyDamage: 64,
      objectCap: 1,
      fingerprint: {
        playerVerb: "bait_or_execute",
        topology: "player_enemy_position_pair",
        timeModel: "recurring_locked_exchange",
        systemTarget: "entity_positions",
      },
    },
  },
  { wave: 16, pool: ["blackhole_mage", "magma_beetle", "siege_pylon", "prism_medic"], spawnRate: 0.86 },
  {
    wave: 17,
    pool: ["brood_seeder", "line_raider", "shield_caster", "mech_worm"],
    spawnRate: 0.88,
    elite: { id: "brood_seeder", variant: "brood_core", count: 1 },
  },
  {
    wave: 18,
    pool: ["gunner", "phase_mirage", "siege_pylon", "laser_eye", "razorbat"],
    spawnRate: 0.9,
    elite: { id: "blackhole_mage", variant: "collapsing_blackhole", count: 1 },
  },
  {
    wave: 19,
    pool: ["artillery", "gunner", "blackhole_mage", "line_raider", "shield_caster", "pyromancer"],
    spawnRate: 0.94,
    event: {
      type: "exile_balance",
      intro: 2.5,
      cycle: 10,
      warning: 2.2,
      active: 6,
      tolerance: 3,
      damage: 20,
      enemyDamage: 44,
      objectCap: 1,
      fingerprint: {
        playerVerb: "rebalance",
        topology: "reactive_bilateral_court",
        timeModel: "population_weighted_epoch",
        systemTarget: "enemy_distribution",
      },
    },
  },
  {
    wave: 20,
    pool: [],
    spawnRate: 0,
    boss: "abyssal_seal_scientist",
    bossProfile: "void_crown_final_seal",
  },
];

export function voidCrownWaveScenario(wave) {
  return VOID_CROWN_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

export function voidCrownWaveSpawnPool(wave) {
  return [...(voidCrownWaveScenario(wave)?.pool || [])];
}

export function voidCrownSpawnRateForWave(wave) {
  return voidCrownWaveScenario(wave)?.spawnRate ?? 1;
}
