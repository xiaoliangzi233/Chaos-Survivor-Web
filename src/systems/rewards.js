import { GEM_LIMIT, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { difficultyMultiplier } from "../difficulty.js";
import { coinDropMultiplier } from "./items.js";

export function dropGem(x, y, value) {
  if (world.gems.length >= GEM_LIMIT) world.gems.shift();
  world.gems.push({ x, y, value: Math.max(1, Math.round(value * difficultyMultiplier("xpGain"))), phase: Math.random() * TAU });
}

export function dropCoin(x, y, amount) {
  const value = Math.max(1, Math.round(amount));
  const count = Math.min(5, value);
  let remaining = value;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const spread = 8 + Math.random() * 18;
    const stack = i === count - 1 ? remaining : Math.max(1, Math.floor(value / count));
    remaining -= stack;
    world.coins.push({
      x: x + Math.cos(angle) * spread,
      y: y + Math.sin(angle) * spread,
      value: stack,
      phase: Math.random() * TAU,
    });
  }
  while (world.coins.length > GEM_LIMIT) world.coins.shift();
}

export function coinAmountForEnemy(enemy) {
  if (!enemy || enemy.elite || (enemy.category !== "小怪" && !enemy.boss)) return 0;
  if (enemy.boss) {
    const amount = enemy.coinDrop ?? Math.max(90, Math.round((enemy.xp || 100) * 0.55));
    return Math.max(30, Math.round(amount * (enemy.rewardScale ?? 1) * difficultyMultiplier("coinGain") * coinDropMultiplier()));
  }
  const amount = 1 + Math.floor(Math.random() * 3) + Math.floor((enemy.xp || 1) / 10) + Math.floor(state.wave / 7);
  return Math.min(24, Math.max(1, Math.round(amount * difficultyMultiplier("coinGain") * coinDropMultiplier())));
}

export function dropEnemyRewards(enemy) {
  if (!enemy) return { gemValue: 0, coinValue: 0 };
  const rewardScale = enemy.rewardScale ?? 1;
  const gemValue = (enemy.boss ? (enemy.xp || 1) * 2.4 : enemy.xp || 1) * rewardScale;
  dropGem(enemy.x, enemy.y, gemValue);
  const coinValue = coinAmountForEnemy(enemy);
  if (coinValue > 0) dropCoin(enemy.x, enemy.y, coinValue);
  return { gemValue, coinValue };
}
