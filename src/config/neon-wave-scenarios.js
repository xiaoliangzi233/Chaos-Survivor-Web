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
const EMBER_NORMALS = ["zombie", "lancer", "wisp", ...ALL_SLIMES, "gearfiend", "razorbat"];
const MECH_LINE = ["mech_worm", "doctor", "pentastar", "magma_beetle", "shield_caster", "wizard"];
const LATE_LAB_MIX = [...EMBER_NORMALS, ...MECH_LINE];

export const NEON_WAVE_SCENARIOS = [
  { wave: 1, pool: ["zombie"], spawnRate: 0.62 },
  { wave: 2, pool: ["zombie", "lancer"], spawnRate: 1.08 },
  { wave: 3, pool: ["zombie", "lancer", ...BASIC_SLIMES], spawnRate: 0.92 },
  { wave: 4, pool: ["lancer", "mech_worm", ...BASIC_SLIMES], spawnRate: 1.16, effect: "scrap_wind" },
  { wave: 5, pool: ["zombie", "lancer", "mech_worm"], spawnRate: 1.06, elite: { id: "mech_worm", variant: "elite", count: 1 } },
  { wave: 6, pool: ["doctor", "zombie", ...BASIC_SLIMES], spawnRate: 1.02 },
  { wave: 7, pool: ["doctor", "mech_worm", "lancer", ...BASIC_SLIMES], spawnRate: 1.14, event: { type: "hazard_line", count: 4, kind: "toxic_residue", color: "#72ffb4", radius: 112, life: 999, fullWave: true, damage: 0, poisonDps: 8, poisonDuration: 3.4, step: 170 } },
  { wave: 8, pool: ALL_SLIMES, spawnRate: 1.42, elite: { id: "slime_large", variant: "giant", count: 1 } },
  { wave: 9, pool: ["pentastar", "razorbat", "wisp", ...BASIC_SLIMES], spawnRate: 1.24, effect: "blind" },
  { wave: 10, pool: [], spawnRate: 0, boss: "slime_king" },
  { wave: 11, pool: ["magma_beetle", "pentastar", "wisp", "zombie"], spawnRate: 1.06 },
  { wave: 12, pool: ["magma_beetle", "mech_worm", "gearfiend", ...BASIC_SLIMES], spawnRate: 1.18, effect: "invisible_brain_eaters" },
  { wave: 13, pool: ["thief", "doctor"], spawnRate: 0.72, reward: true, event: { type: "hazard_ring", count: 6, kind: "gear_trap", color: "#ffd166" } },
  { wave: 14, pool: ["shield_caster", "doctor", "zombie", "lancer", ...ALL_SLIMES], spawnRate: 1.34 },
  { wave: 15, pool: ["shield_caster", "razorbat", "pentastar", "magma_beetle", ...BASIC_SLIMES], spawnRate: 1.18, elite: { id: "shield_caster", variant: "elite", count: 1 } },
  { wave: 16, pool: ["wizard", "wisp", "pentastar", "shield_caster"], spawnRate: 1.08, effect: "mini_overdrive" },
  { wave: 17, pool: ["wizard", "gearfiend", "mech_worm", "magma_beetle", ...BASIC_SLIMES], spawnRate: 1.28, gearfiendMode: "fast_only" },
  { wave: 18, pool: LATE_LAB_MIX, spawnRate: 1.58, event: { type: "hazard_line", count: 5, kind: "gear_trap", color: "#f59e0b" } },
  { wave: 19, pool: LATE_LAB_MIX, spawnRate: 1.68, elite: { id: "gearfiend", variant: "giant", count: 1 } },
  { wave: 20, pool: [], spawnRate: 0, boss: "gear_king", bossSkills: ["gear_barrage", "saw_dash", "trap_factory", "summon_gears", "giant_gear_rain"] },
];

export function neonWaveScenario(wave) {
  return NEON_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}
