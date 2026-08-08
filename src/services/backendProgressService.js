import { backendConfig } from "../config/backend-config.js";

const PLAYER_ID_KEY = "pixel-survivor-player-id-v1";
const NICKNAME_KEY = "pixel-survivor-player-nickname-v1";
const REQUEST_TIMEOUT_MS = 3000;

let apiBaseUrl = "";
let playerId = "";
let nickname = "";
let available = false;
let lastError = "";

export function configureBackendProgress() {
  apiBaseUrl = resolveApiBaseUrl();
  playerId = ensurePlayerId();
  nickname = readNickname();
  available = false;
  lastError = "";
  return backendStatus();
}

export function backendStatus() {
  return {
    enabled: Boolean(apiBaseUrl),
    available,
    apiBaseUrl,
    playerId,
    nickname,
    lastError,
  };
}

export function isBackendEnabled() {
  return Boolean(apiBaseUrl);
}

export function currentPlayerId() {
  return playerId || ensurePlayerId();
}

export function currentNickname() {
  return nickname || readNickname();
}

export function setBackendNickname(value) {
  nickname = normalizeNickname(value);
  try {
    globalThis.localStorage?.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Nickname persistence is best effort.
  }
  return nickname;
}

export async function bootstrapBackendPlayer() {
  if (!apiBaseUrl) return null;
  try {
    const result = await requestJson("/api/players/bootstrap", {
      method: "POST",
      body: JSON.stringify({ playerId: currentPlayerId(), nickname: currentNickname() }),
    });
    available = true;
    lastError = "";
    return result.player || result;
  } catch (error) {
    markFailure(error);
    return null;
  }
}

export async function fetchBackendProgress() {
  if (!apiBaseUrl) return null;
  try {
    const result = await requestJson(`/api/progress/${encodeURIComponent(currentPlayerId())}`);
    available = true;
    lastError = "";
    return result?.progress && typeof result.progress === "object" ? result.progress : null;
  } catch (error) {
    markFailure(error);
    return null;
  }
}

export async function saveBackendProgress(progress, revision = 0) {
  if (!apiBaseUrl || !progress) return false;
  try {
    await requestJson(`/api/progress/${encodeURIComponent(currentPlayerId())}`, {
      method: "PUT",
      body: JSON.stringify({ progress, revision }),
    });
    available = true;
    lastError = "";
    return true;
  } catch (error) {
    markFailure(error);
    return false;
  }
}

export async function submitBackendRun(run) {
  if (!apiBaseUrl || !run) return false;
  try {
    await requestJson("/api/runs", {
      method: "POST",
      body: JSON.stringify({ ...run, playerId: currentPlayerId() }),
    });
    available = true;
    lastError = "";
    return true;
  } catch (error) {
    markFailure(error);
    return false;
  }
}

export async function fetchLeaderboards({ mode = "all", difficulty = "all", metric = "kills", limit = 20 } = {}) {
  if (!apiBaseUrl) return { entries: [], enabled: false };
  const params = new URLSearchParams({ mode, difficulty, metric, limit: String(limit) });
  try {
    const result = await requestJson(`/api/leaderboards?${params}`);
    available = true;
    lastError = "";
    return { entries: Array.isArray(result.entries) ? result.entries : [], enabled: true };
  } catch (error) {
    markFailure(error);
    return { entries: [], enabled: true, error: lastError };
  }
}

function resolveApiBaseUrl() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const fromQuery = params.get("api");
    const raw = fromQuery || backendConfig.apiBaseUrl || "";
    return String(raw || "").trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function ensurePlayerId() {
  try {
    const existing = globalThis.localStorage?.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const generated = `anon-${randomId()}`;
    globalThis.localStorage?.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `anon-${randomId()}`;
  }
}

function readNickname() {
  try {
    return normalizeNickname(globalThis.localStorage?.getItem(NICKNAME_KEY) || backendConfig.defaultNickname);
  } catch {
    return normalizeNickname(backendConfig.defaultNickname);
  }
}

function normalizeNickname(value) {
  const text = String(value || "").trim().slice(0, 32);
  return text || "Anonymous";
}

function randomId() {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function requestJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.detail || response.statusText || "backend_error";
      throw new Error(message);
    }
    return data;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function markFailure(error) {
  available = false;
  lastError = error instanceof Error ? error.message : String(error);
}
