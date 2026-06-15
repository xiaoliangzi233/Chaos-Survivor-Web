// 挑战模式波次配置
// 每波定义：
//   type: "countdown" | "annihilation"
//   duration: number (仅 countdown 类型)
//   groups: [{ time: number, enemies: [{ id: string, count: number }] }]
//   boss: string (boss 波次，可选)

export const CHALLENGE_WAVES = [
  {
    wave: 1,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "zombie", count: 6 }] },
      { time: 10, enemies: [{ id: "lancer", count: 4 }] },
    ],
  },
  {
    wave: 2,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "tank", count: 3 , config: { speed: 120 ,hp: 360} }, { id: "lancer", count: 4 , config: { speed: 180 ,hp: 300} }] },
    ],
  },
];

export function challengeWaveScenario(wave) {
  return CHALLENGE_WAVES.find((entry) => entry.wave === wave) || null;
}

export function getChallengeTotalWaves() {
  return CHALLENGE_WAVES.reduce((max, entry) => Math.max(max, entry.wave), 0);
}