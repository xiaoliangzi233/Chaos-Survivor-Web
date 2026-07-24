import { state } from "../state.js";

const STORAGE_KEY = "pixel-survivor-player-progress-v1:local-dev";
const LEGACY_STORAGE_KEYS = [
  "pixel-survivor-best",
  "pixel-survivor-difficulty-progress",
  "pixel-survivor-codex",
];
const CODEX_TYPES = ["enemies", "weapons", "items", "events"];
export const ADVENTURE_HISTORY_LIMIT = 200;

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

export function getAdventureStats() {
  return cloneValue(progress.adventureStats);
}

export function getBestSurvivalSeconds() {
  return progress.bestSurvivalSeconds;
}

export function getBestRandomEndlessWave() {
  return progress.bestRandomEndlessWave;
}

export function getLobbyFirstClearReactions() {
  return cloneValue(progress.lobbyFirstClearReactions);
}

export function queueLobbyFirstClearReactions(difficultyId, npcIds = []) {
  const normalizedDifficultyId = String(difficultyId || "").trim();
  if (!difficultyIds.includes(normalizedDifficultyId)) return false;
  let changed = false;
  for (const npcId of uniqueStrings(npcIds)) {
    const queue = progress.lobbyFirstClearReactions[npcId] ||= [];
    if (!queue.includes(normalizedDifficultyId)) {
      queue.push(normalizedDifficultyId);
      changed = true;
    }
  }
  if (changed) persistCurrentProgress();
  return changed;
}

export function peekLobbyFirstClearReaction(npcId) {
  const queue = progress.lobbyFirstClearReactions[String(npcId || "").trim()];
  return Array.isArray(queue) ? queue[0] || null : null;
}

export function consumeLobbyFirstClearReaction(npcId, difficultyId = null) {
  const normalizedNpcId = String(npcId || "").trim();
  const queue = progress.lobbyFirstClearReactions[normalizedNpcId];
  if (!Array.isArray(queue) || !queue.length) return false;
  const index = difficultyId ? queue.indexOf(String(difficultyId)) : 0;
  if (index < 0) return false;
  queue.splice(index, 1);
  if (!queue.length) delete progress.lobbyFirstClearReactions[normalizedNpcId];
  persistCurrentProgress();
  return true;
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

export function recordAdventureResult(summary = {}) {
  if (summary.tainted || state.debug?.enabled || state.debug?.runTainted) return false;
  const outcome = ["victory", "defeat", "abandoned"].includes(summary.outcome) ? summary.outcome : null;
  if (!outcome) return false;
  const current = progress.adventureStats;
  const id = String(summary.id || `run-${Date.now()}-${current.revision + 1}`).slice(0, 96);
  if (current.history.some((entry) => entry.id === id)) return false;
  const runMode = summary.runMode === "random" ? "random" : "standard";
  const randomGoal = summary.randomGoal === "endless" ? "endless" : "twenty_waves";
  const modeKey = runMode === "random" ? `random_${randomGoal}` : "standard";
  const difficultyId = String(summary.difficultyId || "unknown").slice(0, 64);
  const record = {
    id,
    completedAt: validCompletedAt(summary.completedAt) ? summary.completedAt : new Date().toISOString(),
    outcome,
    runMode,
    randomGoal,
    modeKey,
    difficultyId,
    difficultyName: String(summary.difficultyName || difficultyId).slice(0, 64),
    weaponId: String(summary.weaponId || "").slice(0, 64),
    weaponName: String(summary.weaponName || summary.weaponId || "未知武器").slice(0, 64),
    seconds: boundedInteger(summary.seconds, 0, 86400 * 30),
    wave: boundedInteger(summary.wave, 0, 1_000_000),
    kills: boundedInteger(summary.kills, 0, 100_000_000),
    bossKills: boundedInteger(summary.bossKills, 0, 1_000_000),
    gold: boundedInteger(summary.gold, 0, 1_000_000_000),
    level: boundedInteger(summary.level, 1, 1_000_000),
    weaponCount: boundedInteger(summary.weaponCount, 0, 1_000),
    itemCount: boundedInteger(summary.itemCount, 0, 1_000_000),
  };
  current.revision++;
  current.updatedAt = record.completedAt;
  incrementAdventureBucket(current.totals, record);
  incrementAdventureBucket(current.byMode[modeKey] ||= emptyAdventureBucket(), record);
  incrementAdventureBucket(current.byDifficulty[difficultyId] ||= emptyAdventureBucket(), record);
  current.history.unshift(record);
  current.history.length = Math.min(current.history.length, ADVENTURE_HISTORY_LIMIT);
  persistCurrentProgress();
  return cloneValue(record);
}

export function recordBestSurvivalSeconds(seconds) {
  const normalized = boundedInteger(seconds, 0, 86400);
  if (normalized <= progress.bestSurvivalSeconds) return false;
  progress.bestSurvivalSeconds = normalized;
  persistCurrentProgress();
  return true;
}

export function recordBestRandomEndlessWave(wave) {
  const normalized = boundedInteger(wave, 0, 1_000_000);
  if (normalized <= progress.bestRandomEndlessWave) return false;
  progress.bestRandomEndlessWave = normalized;
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
    bestRandomEndlessWave: boundedInteger(value?.bestRandomEndlessWave, 0, 1_000_000),
    difficultyProgress: normalizedDifficulty,
    codex: Object.fromEntries(CODEX_TYPES.map((type) => [type, uniqueStrings(value?.codex?.[type])])),
    lobbyFirstClearReactions: normalizeReactionQueues(value?.lobbyFirstClearReactions),
    adventureStats: normalizeAdventureStats(value?.adventureStats),
  };
}

function mergeProgress(...values) {
  const merged = normalizeProgress({});
  for (const value of values) {
    const source = normalizeProgress(value);
    merged.bestSurvivalSeconds = Math.max(merged.bestSurvivalSeconds, source.bestSurvivalSeconds);
    merged.bestRandomEndlessWave = Math.max(merged.bestRandomEndlessWave, source.bestRandomEndlessWave);
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
    for (const [npcId, queue] of Object.entries(source.lobbyFirstClearReactions)) {
      merged.lobbyFirstClearReactions[npcId] = uniqueStrings([
        ...(merged.lobbyFirstClearReactions[npcId] || []),
        ...queue,
      ]).filter((id) => difficultyIds.includes(id));
    }
    if (source.adventureStats.revision > merged.adventureStats.revision) {
      merged.adventureStats = cloneValue(source.adventureStats);
    }
  }
  return normalizeProgress(merged);
}

function normalizeAdventureStats(value) {
  const totals = normalizeAdventureBucket(value?.totals);
  const byMode = {};
  const byDifficulty = {};
  for (const [key, bucket] of Object.entries(value?.byMode || {})) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey) byMode[normalizedKey] = normalizeAdventureBucket(bucket);
  }
  for (const [key, bucket] of Object.entries(value?.byDifficulty || {})) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey) byDifficulty[normalizedKey] = normalizeAdventureBucket(bucket);
  }
  const history = Array.isArray(value?.history)
    ? value.history.slice(0, ADVENTURE_HISTORY_LIMIT).map(normalizeAdventureRun).filter(Boolean)
    : [];
  return {
    revision: boundedInteger(value?.revision, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: validCompletedAt(value?.updatedAt) ? value.updatedAt : "",
    totals,
    byMode,
    byDifficulty,
    history,
  };
}

function emptyAdventureBucket() {
  return {
    runs: 0,
    victories: 0,
    defeats: 0,
    abandoned: 0,
    seconds: 0,
    kills: 0,
    bossKills: 0,
    gold: 0,
    highestWave: 0,
    bestKills: 0,
    longestSeconds: 0,
    bestVictorySeconds: 0,
    lastVictoryAt: "",
  };
}

function normalizeAdventureBucket(value) {
  const bucket = emptyAdventureBucket();
  for (const key of ["runs", "victories", "defeats", "abandoned", "seconds", "kills", "bossKills", "gold", "highestWave", "bestKills", "longestSeconds", "bestVictorySeconds"]) {
    bucket[key] = boundedInteger(value?.[key], 0, Number.MAX_SAFE_INTEGER);
  }
  bucket.lastVictoryAt = validCompletedAt(value?.lastVictoryAt) ? value.lastVictoryAt : "";
  return bucket;
}

function normalizeAdventureRun(value) {
  if (!value || typeof value !== "object") return null;
  const outcome = ["victory", "defeat", "abandoned"].includes(value.outcome) ? value.outcome : null;
  if (!outcome) return null;
  const runMode = value.runMode === "random" ? "random" : "standard";
  const randomGoal = value.randomGoal === "endless" ? "endless" : "twenty_waves";
  return {
    id: String(value.id || "").slice(0, 96),
    completedAt: validCompletedAt(value.completedAt) ? value.completedAt : "",
    outcome,
    runMode,
    randomGoal,
    modeKey: runMode === "random" ? `random_${randomGoal}` : "standard",
    difficultyId: String(value.difficultyId || "unknown").slice(0, 64),
    difficultyName: String(value.difficultyName || value.difficultyId || "未知难度").slice(0, 64),
    weaponId: String(value.weaponId || "").slice(0, 64),
    weaponName: String(value.weaponName || value.weaponId || "未知武器").slice(0, 64),
    seconds: boundedInteger(value.seconds, 0, 86400 * 30),
    wave: boundedInteger(value.wave, 0, 1_000_000),
    kills: boundedInteger(value.kills, 0, 100_000_000),
    bossKills: boundedInteger(value.bossKills, 0, 1_000_000),
    gold: boundedInteger(value.gold, 0, 1_000_000_000),
    level: boundedInteger(value.level, 1, 1_000_000),
    weaponCount: boundedInteger(value.weaponCount, 0, 1_000),
    itemCount: boundedInteger(value.itemCount, 0, 1_000_000),
  };
}

function incrementAdventureBucket(bucket, record) {
  bucket.runs++;
  bucket.victories += record.outcome === "victory" ? 1 : 0;
  bucket.defeats += record.outcome === "defeat" ? 1 : 0;
  bucket.abandoned += record.outcome === "abandoned" ? 1 : 0;
  bucket.seconds += record.seconds;
  bucket.kills += record.kills;
  bucket.bossKills += record.bossKills;
  bucket.gold += record.gold;
  bucket.highestWave = Math.max(bucket.highestWave, record.wave);
  bucket.bestKills = Math.max(bucket.bestKills, record.kills);
  bucket.longestSeconds = Math.max(bucket.longestSeconds, record.seconds);
  if (record.outcome === "victory") {
    bucket.bestVictorySeconds = minimumPositive(bucket.bestVictorySeconds, record.seconds);
    bucket.lastVictoryAt = record.completedAt;
  }
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

function normalizeReactionQueues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [npcId, queue] of Object.entries(value)) {
    const normalizedNpcId = String(npcId || "").trim();
    const normalizedQueue = uniqueStrings(queue).filter((id) => difficultyIds.includes(id));
    if (normalizedNpcId && normalizedQueue.length) result[normalizedNpcId] = normalizedQueue;
  }
  return result;
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
