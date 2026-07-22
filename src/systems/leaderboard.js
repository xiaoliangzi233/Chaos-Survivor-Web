const OUTBOX_KEY = "pixel-survivor-leaderboard-outbox-v1";
const CHECKPOINT_INTERVAL = 5;

export const LEADERBOARD_METRICS = Object.freeze({
  TOTAL_PLAY_SECONDS: "总时长",
  TOTAL_KILLS: "总击杀",
  TOTAL_BOSS_KILLS: "Boss击杀",
  HIGHEST_DIFFICULTY: "最高难度",
});

let apiBaseUrl = "api";
let identity = { token: "", user: null };
let activeRun = null;
let checkpointAccumulator = 0;
let flushPromise = null;
let flushRequested = false;

export function configureLeaderboard({ baseUrl, token, user }) {
  apiBaseUrl = normalizeBaseUrl(baseUrl);
  identity = { token: String(token || ""), user: user || null };
  if (identity.user && identity.token) void flushPendingRuns();
}

export function beginLeaderboardRun(difficultyId) {
  if (!identity.user || !identity.token) return null;
  activeRun = {
    runId: createRunId(),
    ownerUserId: identity.user.id,
    difficultyId: String(difficultyId || ""),
    startedAt: new Date().toISOString(),
  };
  checkpointAccumulator = 0;
  queueSnapshot({ time: 0, kills: 0, bossKills: 0 }, "RUNNING");
  void flushPendingRuns();
  return activeRun.runId;
}

export function updateLeaderboardRun(dt, snapshot) {
  if (!activeRun) return;
  checkpointAccumulator += Math.max(0, Number(dt) || 0);
  if (checkpointAccumulator < CHECKPOINT_INTERVAL) return;
  checkpointAccumulator %= CHECKPOINT_INTERVAL;
  queueSnapshot(snapshot, "RUNNING");
  void flushPendingRuns();
}

export function checkpointLeaderboardRun(snapshot, { send = true } = {}) {
  if (!activeRun) return;
  queueSnapshot(snapshot, "RUNNING");
  if (send) void flushPendingRuns();
}

export function finishLeaderboardRun(snapshot, status) {
  if (!activeRun) return;
  const normalizedStatus = ["VICTORY", "DEFEAT", "ABANDONED"].includes(status) ? status : "ABANDONED";
  queueSnapshot(snapshot, normalizedStatus);
  activeRun = null;
  checkpointAccumulator = 0;
  void flushPendingRuns();
}

export function hasActiveLeaderboardRun() {
  return Boolean(activeRun);
}

export async function fetchLeaderboard(metric, { page = 1, pageSize = 100 } = {}) {
  requireIdentity();
  await flushPendingRuns();
  const safeMetric = Object.hasOwn(LEADERBOARD_METRICS, metric) ? metric : "TOTAL_PLAY_SECONDS";
  const query = new URLSearchParams({ metric: safeMetric, page: String(page), pageSize: String(pageSize) });
  return requestJson(`${apiBaseUrl}/v1/survivor/leaderboard?${query}`, { method: "GET" });
}

export function flushPendingRuns() {
  flushRequested = true;
  if (!flushPromise) {
    flushPromise = (async () => {
      do {
        flushRequested = false;
        await doFlushPendingRuns();
      } while (flushRequested);
    })().finally(() => {
      flushRequested = false;
      flushPromise = null;
    });
  }
  return flushPromise;
}

function queueSnapshot(snapshot, status) {
  if (!activeRun) return;
  const payload = {
    runId: activeRun.runId,
    ownerUserId: activeRun.ownerUserId,
    difficultyId: activeRun.difficultyId,
    playedSeconds: Math.max(0, Math.floor(Number(snapshot?.time) || 0)),
    kills: Math.max(0, Math.floor(Number(snapshot?.kills) || 0)),
    bossKills: Math.max(0, Math.floor(Number(snapshot?.bossKills) || 0)),
    status,
    startedAt: activeRun.startedAt,
    clientUpdatedAt: new Date().toISOString(),
  };
  const outbox = readOutbox();
  outbox[payload.runId] = payload;
  writeOutbox(outbox);
}

async function doFlushPendingRuns() {
  if (!identity.user || !identity.token) return;
  const outbox = readOutbox();
  for (const payload of Object.values(outbox)) {
    if (payload.ownerUserId !== identity.user.id) continue;
    const requestPayload = { ...payload };
    delete requestPayload.ownerUserId;
    try {
      await requestJson(`${apiBaseUrl}/v1/survivor/runs/sync`, {
        method: "POST",
        body: JSON.stringify(requestPayload),
      });
      const latest = readOutbox();
      if (latest[payload.runId]?.clientUpdatedAt === payload.clientUpdatedAt) {
        delete latest[payload.runId];
        writeOutbox(latest);
      }
    } catch {
      return;
    }
  }
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
  if (!response.ok) throw new Error(body?.message || `排行榜服务请求失败（${response.status}）`);
  return body;
}

function requireIdentity() {
  if (!identity.user || !identity.token) throw new Error("未识别登录用户，无法访问排行榜");
}

function normalizeBaseUrl(value) {
  const base = String(value || "api").trim() || "api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function readOutbox() {
  try {
    const value = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeOutbox(value) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(value));
  } catch {
    // A failed outbox must never stop the game loop.
  }
}

function createRunId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
