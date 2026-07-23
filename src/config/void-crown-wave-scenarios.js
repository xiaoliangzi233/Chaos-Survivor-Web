export const VOID_CROWN_WAVE_SCENARIOS = [
  {
    wave: 10,
    pool: [],
    spawnRate: 0,
    boss: "chainbreak_convict",
    bossProfile: "void_crown_chainbreak_duel",
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
