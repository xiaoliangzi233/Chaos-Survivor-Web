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
      { time: 0, enemies: [{ id: "zombie", count: 2, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 5, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }, { id: "zombie", count: 2, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 15, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }, { id: "zombie", count: 1, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 25, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }] },
    ],
  },
  {
    wave: 2,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 5, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 10, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 15, enemies: [{ id: "lancer", count: 3, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 999, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 1200, dashSpeed: 1000, scale: 1.5, attackCd: 0.5, recoverDuration: 0.2, windupDuration: 0.3, dashDuration: 0.5 } }] },
    ],
  },
  {
    wave: 3,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "tank", count: 1, config: { speed: 100, hp: 2000, bulletSpeed: 500, attackDist: 800, cd: 0.8, bulletCount: 3 } }] },
      { time: 10, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 15, enemies: [{ id: "lancer", count: 3, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 20, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 25, enemies: [{ id: "lancer", count: 1, config: { speed: 200, hp: 1200, dashSpeed: 1000, scale: 1.5, attackCd: 0.5, recoverDuration: 0.2, windupDuration: 0.3, dashDuration: 0.5 } }] },
    ],
  },
  {
    wave: 4,
    type: "countdown",
    duration: 35,
    groups: [
      { time: 0, enemies: [{ id: "pyromancer", count: 3, config: { speed: 150, hp: 6000, bulletSpeed: 350, cd: 1.5, fireRange: 1000 } }] },
      { time: 10, enemies: [{ id: "zombie", count: 2, config: { speed: 240, hp: 250 } }] },
      { time: 15, enemies: [{ id: "zombie", count: 2, config: { speed: 240, hp: 250 } }] },
      { time: 20, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 250 } }] },
      { time: 25, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 250 } }] },
    ],
  },
  {
    wave: 5,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "laser_eye", count: 1, config: { scale: 2, hp: 4000, cd: 1, cdAlt: 1, shardVolleySpeed: 700, fireRange: 1200, aimTurnSpeed: 3, fireDuration: 1.5, beamDamageMul: 2.5 } }] },
      { time: 5, enemies: [{ id: "laser_eye", count: 2, config: { hp: 800, cd: 1, cdAlt: 1, fireRange: 1200, aimTurnSpeed: 3, fireTurnSpeed: 1.2, fireDuration: 0.5 } }] },
      { time: 15, enemies: [{ id: "laser_eye", count: 2, config: { hp: 800, cd: 1, cdAlt: 1, fireRange: 1200, aimTurnSpeed: 3, fireTurnSpeed: 1.2, fireDuration: 0.5 } }] },
      { time: 25, enemies: [{ id: "laser_eye", count: 3, config: { hp: 800, cd: 1, cdAlt: 1, fireRange: 1200, aimTurnSpeed: 3, fireTurnSpeed: 1.2, fireDuration: 0.5 } }] },
    ],
  },
];

export function challengeWaveScenario(wave) {
  return CHALLENGE_WAVES.find((entry) => entry.wave === wave) || null;
}

export function getChallengeTotalWaves() {
  return CHALLENGE_WAVES.reduce((max, entry) => Math.max(max, entry.wave), 0);
}