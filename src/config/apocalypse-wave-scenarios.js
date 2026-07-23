export const APOCALYPSE_WAVE_SCENARIOS = [
  {
    wave: 10,
    pool: [],
    spawnRate: 0,
    boss: "riftblade_saint",
    bossProfile: "apocalypse_riftblade_duel",
  },
];

export function apocalypseWaveScenario(wave) {
  return APOCALYPSE_WAVE_SCENARIOS.find((entry) => entry.wave === wave) || null;
}

