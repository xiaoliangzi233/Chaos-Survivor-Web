import { backendConfig } from "../config/backend-config.js";

const PLAYER_ID_KEY = "pixel-survivor-player-id-v1";
const NICKNAME_KEY = "pixel-survivor-player-nickname-v1";
const AUTH_TOKEN_KEY = "pixel-survivor-auth-token-v1";
const AUTH_USER_URL = "http://113.249.91.32/sszl/user/simple-info";
const REQUEST_TIMEOUT_MS = 3000;

let apiBaseUrl = "";
let playerId = "";
let nickname = "";
let authToken = "";
let authenticatedUser = null;
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
    authenticated: Boolean(authenticatedUser),
    username: authenticatedUser?.username || nickname,
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

export function currentAuthenticatedUser() {
  return authenticatedUser ? { ...authenticatedUser } : null;
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

export async function requireAuthenticatedUser({ redirectTo = "/login" } = {}) {
  if (isAuthDisabledForLocalTest()) {
    return { id: currentPlayerId(), username: currentNickname(), employeeId: "", localTest: true };
  }
  authToken = readAuthToken();
  if (!authToken) return redirectToLogin(redirectTo);
  try {
    const user = await fetchAuthenticatedUser(authToken);
    authenticatedUser = normalizeAuthUser(user);
    if (!authenticatedUser) throw new Error("invalid_user_info");
    playerId = authenticatedUser.id;
    setBackendNickname(authenticatedUser.username);
    persistAuthToken(authToken);
    return currentAuthenticatedUser();
  } catch (error) {
    clearAuthToken();
    markFailure(error);
    return redirectToLogin(redirectTo);
  }
}

export function isAuthDisabledForLocalTest() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const value = String(params.get("auth") || "").trim().toLowerCase();
    return ["0", "off", "false", "no", "local"].includes(value);
  } catch {
    return false;
  }
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
  if (authenticatedUser?.id) return authenticatedUser.id;
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
  if (authenticatedUser?.username) return authenticatedUser.username;
  try {
    return normalizeNickname(globalThis.localStorage?.getItem(NICKNAME_KEY) || backendConfig.defaultNickname);
  } catch {
    return normalizeNickname(backendConfig.defaultNickname);
  }
}

function readAuthToken() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const fromQuery = params.get("token");
    const token = String(fromQuery || globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) || "").trim();
    return token;
  } catch {
    return "";
  }
}

function persistAuthToken(token) {
  try {
    globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Auth token persistence is best effort.
  }
}

function clearAuthToken() {
  authenticatedUser = null;
  authToken = "";
  try {
    globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Storage can be unavailable.
  }
}

async function fetchAuthenticatedUser(token) {
  if (apiBaseUrl) {
    try {
      return await requestJson("/api/auth/simple-info", { headers: { Authorization: token } });
    } catch {
      // Fall back to the documented endpoint when the optional same-origin backend is absent.
    }
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(AUTH_USER_URL, {
      method: "GET",
      headers: { Authorization: token },
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok || !data) throw new Error(data?.detail || response.statusText || "auth_failed");
    return data;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function normalizeAuthUser(value) {
  const id = String(value?.id || "").trim().slice(0, 96);
  const username = normalizeNickname(value?.username || value?.employeeId || "");
  const employeeId = String(value?.employeeId || "").trim().slice(0, 64);
  return id && username ? { id, username, employeeId } : null;
}

function redirectToLogin(redirectTo) {
  const target = redirectTo || "/login";
  try {
    if (globalThis.location?.pathname !== target) globalThis.location.href = target;
  } catch {
    // Tests and non-browser contexts may not allow navigation.
  }
  return null;
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
