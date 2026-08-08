import { state } from "../state.js";

const SOLO_MULTIPLIERS = Object.freeze({ hp: 1, bossHp: 1, damage: 1, speed: 1, attackSpeed: 1, spawnRate: 1, enemyLimit: 1 });
const COOP_MULTIPLIERS = Object.freeze({ hp: 1.42, bossHp: 1.32, damage: 1.18, speed: 1.04, attackSpeed: 1.08, spawnRate: 1.16, enemyLimit: 1.15 });

export function multiplayerEnemyMultipliers() {
  return state.multiplayer?.connected ? COOP_MULTIPLIERS : SOLO_MULTIPLIERS;
}
