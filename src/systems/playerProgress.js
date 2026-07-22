const STORAGE_PREFIX = "pixel-survivor-player-progress-v1:";
const LEGACY_STORAGE_KEYS = [
  "pixel-survivor-best",
  "pixel-survivor-difficulty-progress",
  "pixel-survivor-codex",
];
const CODEX_TYPES = ["enemies", "weapons", "items"];

let apiBaseUrl = "api";
let identity = createIdentity();
let difficultyIds = [];
let progress = emptyProgress();
let identityVersion = 0;
let syncPromise = null;
let syncRequested = false;

globalThis.addEventListener?.("online", () => {
  if (canSyncRemotely()) void flushPlayerProgress();
});

export function configurePlayerProgress({ baseUrl, token, user, localMode = false } = {}) {
  const nextIdentity = createIdentity({ token, user, localMode });
  const identityChanged = nextIdentity.storageId !== identity.storageId
    || nextIdentity.token !== identity.token
    || nextIdentity.localMode !== identity.localMode;
  apiBaseUrl = normalizeBaseUrl(baseUrl);
  identity = nextIdentity;
  if (identityChanged) {
    identityVersion++;
    progress = emptyProgress();
    syncRequested = false;
  }
}

export async function loadPlayerProgress({ difficultyIds: nextDifficultyIds = [] } = {}) {
  difficultyIds = uniqueStrings(nextDifficultyIds);
  const version = identityVersion;
  progress = normalizeProgress(readCachedProgress());
  discardLegacyProgress();

  if (identity.localMode) {
    persistCurrentProgress();
    return getPlayerProgressSnapshot();
  }
  if (!identity.userId || !identity.token) {
    return getPlayerProgressSnapshot();
  }

  try {
    const remote = normalizeProgress(await requestJson(`${apiBaseUrl}/v1/survivor/progress`, { method: "GET" }));
    if (version !== identityVersion) return getPlayerProgressSnapshot();
    const merged = mergeProgress(remote, progress);
    const hasUnsyncedCache = JSON.stringify(merged) !== JSON.stringify(remote);
    progress = merged;
    persistCurrentProgress();
    if (hasUnsyncedCache) requestProgressSync();
  } catch {
    // The account-scoped cache is safe to use offline and will be merged on the next successful request.
  }
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
  persistAndSync();
  return getPlayerDifficultyProgress();
}

export function recordPlayerCodexEntry(type, id) {
  const normalizedId = String(id || "").trim();
  if (!CODEX_TYPES.includes(type) || !normalizedId || progress.codex[type].includes(normalizedId)) return false;
  progress.codex[type].push(normalizedId);
  persistAndSync();
  return true;
}

export function recordBestSurvivalSeconds(seconds) {
  const normalized = boundedInteger(seconds, 0, 86400);
  if (normalized <= progress.bestSurvivalSeconds) return false;
  progress.bestSurvivalSeconds = normalized;
  persistAndSync();
  return true;
}

export function flushPlayerProgress() {
  if (!canSyncRemotely()) return Promise.resolve(getPlayerProgressSnapshot());
  syncRequested = true;
  if (!syncPromise) {
    syncPromise = (async () => {
      do {
        syncRequested = false;
        const version = identityVersion;
        const payload = getPlayerProgressSnapshot();
        try {
          const remote = await requestJson(`${apiBaseUrl}/v1/survivor/progress`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          if (version !== identityVersion) return;
          progress = mergeProgress(progress, remote);
          persistCurrentProgress();
        } catch {
          if (version === identityVersion) syncRequested = false;
          return;
        }
      } while (syncRequested);
    })().finally(() => {
      syncPromise = null;
      if (syncRequested && canSyncRemotely()) queueMicrotask(() => void flushPlayerProgress());
    });
  }
  return syncPromise;
}

function persistAndSync() {
  persistCurrentProgress();
  requestProgressSync();
}

function requestProgressSync() {
  if (!canSyncRemotely()) return;
  syncRequested = true;
  queueMicrotask(() => void flushPlayerProgress());
}

function canSyncRemotely() {
  return !identity.localMode && Boolean(identity.userId && identity.token);
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: identity.token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(body?.message || `玩家进度请求失败（${response.status}）`);
  return body;
}

function createIdentity({ token = "", user = null, localMode = false } = {}) {
  const userId = String(user?.id || "").trim();
  return {
    token: String(token || "").trim(),
    userId,
    localMode: Boolean(localMode),
    storageId: localMode ? "local-dev" : userId,
  };
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
    for (const type of CODEX_TYPES) merged.codex[type] = uniqueStrings([...merged.codex[type], ...source.codex[type]]);
  }
  return normalizeProgress(merged);
}

function readCachedProgress() {
  const key = currentStorageKey();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be disabled without blocking game startup.
    }
    return {};
  }
}

function persistCurrentProgress() {
  const key = currentStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // In-memory progress still works when storage is unavailable.
  }
}

function currentStorageKey() {
  return identity.storageId ? `${STORAGE_PREFIX}${encodeURIComponent(identity.storageId)}` : "";
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

function normalizeBaseUrl(value) {
  const base = String(value || "api").trim() || "api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
