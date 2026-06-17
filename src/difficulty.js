import { SAVE_KEY } from "./constants.js";
import { state } from "./state.js";

export const DIFFICULTY_SAVE_KEY = "pixel-survivor-difficulty-progress";

export let difficultyConfig = {};
export let difficultyOrder = [];

const fallbackDifficulty = {
  id: "neon",
  name: "霓虹荒野",
  desc: "标准体验。",
  enemyLimit: 420,
  spawnRate: 1,
  enemyHp: 1,
  enemyDamage: 1,
  enemySpeed: 1,
  enemyAttackSpeed: 1,
  bossHp: 1,
  bossDamage: 1,
  coinGain: 1,
  xpGain: 1,
};

export async function setupDifficultyConfig() {
  if (difficultyOrder.length) return;
  const response = await fetch(new URL("./config/difficulty-config.json", import.meta.url), { cache: "no-store" });
  const config = await response.json();
  difficultyConfig = Object.fromEntries(Object.entries(config).map(([id, data]) => [id, { id, ...data }]));
  difficultyOrder = Object.keys(config);
}

export function loadDifficultyProgress() {
  const progress = defaultProgress();
  try {
    const parsed = JSON.parse(localStorage.getItem(DIFFICULTY_SAVE_KEY) || "{}");
    for (const id of difficultyOrder) {
      progress[id] = { ...progress[id], ...(parsed[id] || {}) };
    }
  } catch {
    localStorage.removeItem(DIFFICULTY_SAVE_KEY);
  }
  unlockFirstDifficultyPerMode(progress);
  state.difficultyProgress = progress;
  return progress;
}

export function saveDifficultyProgress() {
  localStorage.setItem(DIFFICULTY_SAVE_KEY, JSON.stringify(state.difficultyProgress || defaultProgress()));
}

export function selectDifficulty(id) {
  const cfg = difficultyConfig[id] || difficultyConfig[difficultyOrder[0]] || fallbackDifficulty;
  state.difficultyId = cfg.id;
  state.difficulty = cfg;
  return cfg;
}

export function currentDifficulty() {
  return state.difficulty || difficultyConfig[state.difficultyId] || difficultyConfig[difficultyOrder[0]] || fallbackDifficulty;
}

export function difficultyMultiplier(key, fallback = 1) {
  return currentDifficulty()?.[key] ?? fallback;
}

export function isDifficultyUnlocked(id) {
  const progress = state.difficultyProgress || loadDifficultyProgress();
  return Boolean(progress[id]?.unlocked);
}

export function isDifficultyCompleted(id) {
  const progress = state.difficultyProgress || loadDifficultyProgress();
  return Boolean(progress[id]?.completed);
}

export function highestCompletedDifficulty() {
  const progress = state.difficultyProgress || loadDifficultyProgress();
  let best = null;
  for (const id of difficultyOrder) {
    if (progress[id]?.completed) best = difficultyConfig[id];
  }
  return best;
}

export function recordDifficultyVictory() {
  const cfg = currentDifficulty();
  if (!cfg?.id) return;
  const progress = state.difficultyProgress || loadDifficultyProgress();
  const record = progress[cfg.id] || { unlocked: true, completed: false };
  const bestTime = Math.floor(state.time);
  progress[cfg.id] = {
    ...record,
    unlocked: true,
    completed: true,
    bestTime: record.bestTime ? Math.min(record.bestTime, bestTime) : bestTime,
    bestKills: Math.max(record.bestKills || 0, state.kills || 0),
    bestGold: Math.max(record.bestGold || 0, state.gold || 0),
    completedAt: new Date().toISOString(),
  };
  const nextId = nextDifficultyId(cfg.id);
  if (nextId) progress[nextId] = { ...(progress[nextId] || {}), unlocked: true };
  state.difficultyProgress = progress;
  saveDifficultyProgress();
}

export function bestSummaryText(formatTime) {
  const best = highestCompletedDifficulty();
  const bestTime = Number(localStorage.getItem(SAVE_KEY) || 0);
  const timeText = formatTime(bestTime);
  return best ? `最高通关 ${best.name} · 最佳纪录 ${timeText}` : `最高通关 未解锁 · 最佳纪录 ${timeText}`;
}

export function difficultyCards(gameMode) {
  const progress = state.difficultyProgress || loadDifficultyProgress();
  const modeOrder = gameMode
    ? difficultyOrder.filter((id) => (difficultyConfig[id]?.gameMode || "swarm") === gameMode)
    : difficultyOrder;
  const highestUnlocked = highestUnlockedIndex(progress, modeOrder);
  return modeOrder.map((id, index) => {
    const cfg = difficultyConfig[id];
    const record = progress[id] || {};
    return {
      ...cfg,
      index,
      unlocked: Boolean(record.unlocked) || index === 0,
      completed: Boolean(record.completed),
      currentHighest: index === highestUnlocked,
      bestTime: record.bestTime || 0,
      bestKills: record.bestKills || 0,
      bestGold: record.bestGold || 0,
    };
  });
}

function defaultProgress() {
  const progress = {};
  for (const id of difficultyOrder) progress[id] = { unlocked: false, completed: false };
  unlockFirstDifficultyPerMode(progress);
  return progress;
}

function unlockFirstDifficultyPerMode(progress) {
  const seen = new Set();
  for (const id of difficultyOrder) {
    const mode = difficultyConfig[id]?.gameMode || "swarm";
    if (!seen.has(mode)) {
      seen.add(mode);
      progress[id] = progress[id] || { unlocked: false, completed: false };
      progress[id].unlocked = true;
    }
  }
}

function nextDifficultyId(id) {
  const currentMode = difficultyConfig[id]?.gameMode || "swarm";
  const modeOrder = difficultyOrder.filter((did) => (difficultyConfig[did]?.gameMode || "swarm") === currentMode);
  const index = modeOrder.indexOf(id);
  return index >= 0 && index < modeOrder.length - 1 ? modeOrder[index + 1] : null;
}

function highestUnlockedIndex(progress, modeOrder) {
  let best = 0;
  for (let i = 0; i < modeOrder.length; i++) {
    if (progress[modeOrder[i]]?.unlocked) best = i;
  }
  return best;
}
