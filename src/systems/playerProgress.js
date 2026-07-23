const STORAGE_KEY = "pixel-survivor-player-progress-v1:local-dev";
const LEGACY_STORAGE_KEYS = [
  "pixel-survivor-best",
  "pixel-survivor-difficulty-progress",
  "pixel-survivor-codex",
];
const CODEX_TYPES = ["enemies", "weapons", "items", "events"];

let difficultyIds = [];
let progress = emptyProgress();

export function configurePlayerProgress() {
  // Progress is intentionally browser-local; no identity or backend is required.
}

export async function loadPlayerProgress({ difficultyIds: nextDifficultyIds = [] } = {}) {
  difficultyIds = uniqueStrings(nextDifficultyIds);
  progress = normalizeProgress(readCachedProgress());
  discardLegacyProgress();
  persistCurrentProgress();
  return getPlayerProgressSnapshot();
}

export function getPlayerProgressSnapshot() {
  return cloneProgress(progress);
}

export function getPlayerDifficultyProgress() {
  return cloneValue(progress.difficultyProgress);
}

export function getPlayerCodex() {
  return cloneValue(progress.codex);
}

export function getBestSurvivalSeconds() {
  return progress.bestSurvivalSeconds;
}

export function savePlayerDifficultyProgress(value) {
  progress = mergeProgress(progress, { difficultyProgress: value });
  persistCurrentProgress();
  return getPlayerDifficultyProgress();
}

export function recordPlayerCodexEntry(type, id) {
  const normalizedId = String(id || "").trim();
  if (!CODEX_TYPES.includes(type) || !normalizedId || progress.codex[type].includes(normalizedId)) return false;
  progress.codex[type].push(normalizedId);
  persistCurrentProgress();
  return true;
}

export function recordBestSurvivalSeconds(seconds) {
  const normalized = boundedInteger(seconds, 0, 86400);
  if (normalized <= progress.bestSurvivalSeconds) return false;
  progress.bestSurvivalSeconds = normalized;
  persistCurrentProgress();
  return true;
}

export function flushPlayerProgress() {
  return Promise.resolve(getPlayerProgressSnapshot());
}

function emptyProgress() {
  return normalizeProgress({});
}

function normalizeProgress(value) {
  const rawDifficulty = value?.difficultyProgress && typeof value.difficultyProgress === "object"
    ? value.difficultyProgress
    : {};
  const normalizedDifficulty = {};
  for (const [index, id] of difficultyIds.entries()) {
    const source = rawDifficulty[id] && typeof rawDifficulty[id] === "object" ? rawDifficulty[id] : {};
    normalizedDifficulty[id] = {
      unlocked: index === 0 || Boolean(source.unlocked) || Boolean(source.completed),
      completed: Boolean(source.completed),
      bestTime: boundedInteger(source.bestTime, 0, 86400),
      bestKills: boundedInteger(source.bestKills, 0, 10_000_000),
      bestGold: boundedInteger(source.bestGold, 0, 1_000_000_000),
      ...(validCompletedAt(source.completedAt) ? { completedAt: source.completedAt } : {}),
    };
  }
  for (let index = 0; index < difficultyIds.length; index++) {
    const id = difficultyIds[index];
    if (normalizedDifficulty[id]?.completed && difficultyIds[index + 1]) {
      normalizedDifficulty[difficultyIds[index + 1]].unlocked = true;
    }
  }
  return {
    bestSurvivalSeconds: boundedInteger(value?.bestSurvivalSeconds, 0, 86400),
    difficultyProgress: normalizedDifficulty,
    codex: Object.fromEntries(CODEX_TYPES.map((type) => [type, uniqueStrings(value?.codex?.[type])])),
  };
}

function mergeProgress(...values) {
  const merged = normalizeProgress({});
  for (const value of values) {
    const source = normalizeProgress(value);
    merged.bestSurvivalSeconds = Math.max(merged.bestSurvivalSeconds, source.bestSurvivalSeconds);
    for (const id of difficultyIds) {
      const targetRecord = merged.difficultyProgress[id];
      const sourceRecord = source.difficultyProgress[id];
      targetRecord.unlocked ||= sourceRecord.unlocked;
      targetRecord.completed ||= sourceRecord.completed;
      targetRecord.bestTime = minimumPositive(targetRecord.bestTime, sourceRecord.bestTime);
      targetRecord.bestKills = Math.max(targetRecord.bestKills, sourceRecord.bestKills);
      targetRecord.bestGold = Math.max(targetRecord.bestGold, sourceRecord.bestGold);
      if (sourceRecord.completedAt && (!targetRecord.completedAt || sourceRecord.completedAt < targetRecord.completedAt)) {
        targetRecord.completedAt = sourceRecord.completedAt;
      }
    }
    for (const type of CODEX_TYPES) {
      merged.codex[type] = uniqueStrings([...merged.codex[type], ...source.codex[type]]);
    }
  }
  return normalizeProgress(merged);
}

function readCachedProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be disabled without blocking game startup.
    }
    return {};
  }
}

function persistCurrentProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // In-memory progress still works when storage is unavailable.
  }
}

function discardLegacyProgress() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    // Legacy cleanup is best effort only.
  }
}

function cloneProgress(value) {
  return cloneValue(normalizeProgress(value));
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function minimumPositive(first, second) {
  const values = [first, second].filter((value) => Number(value) > 0);
  return values.length ? Math.min(...values) : 0;
}

function validCompletedAt(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}
