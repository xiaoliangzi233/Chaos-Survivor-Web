import { backendConfig, loadBackendConfig } from "../config/backend-config.js";

const PLAYER_ID_KEY = "pixel-survivor-player-id-v1";
const NICKNAME_KEY = "pixel-survivor-player-nickname-v1";
const AUTH_TOKEN_KEY = "pixel-survivor-auth-token-v1";
const AUTH_USER_PATH = "/sszl/user/simple-info";
const REQUEST_TIMEOUT_MS = 3000;

let apiBaseUrl = "";
let playerId = "";
let nickname = "";
let authToken = "";
let authenticatedUser = null;
let backendPlayer = null;
let needsNickname = false;
let available = false;
let lastError = "";

export async function configureBackendProgress() {
  await loadBackendConfig();
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
    needsNickname,
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

export function currentBackendPlayer() {
  return backendPlayer ? { ...backendPlayer } : null;
}

export function isCurrentUserAdmin() {
  const user = authenticatedUser;
  if (!user) return false;
  if (user.isAdmin === true) return true;
  const tokens = [
    user.role,
    user.roleCode,
    user.userType,
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(user.permissions) ? user.permissions : []),
  ].map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
  return tokens.some((entry) => (
    entry === "admin"
    || entry === "administrator"
    || entry === "super_admin"
    || entry === "superadmin"
    || entry === "管理员"
    || entry.includes("admin")
    || entry.includes("trial")
    || entry.includes("debug")
  ));
}

export function setBackendNickname(value) {
  nickname = normalizeNickname(value);
  if (backendPlayer) backendPlayer.nickname = nickname;
  try {
    globalThis.localStorage?.setItem(NICKNAME_KEY, nickname);
    globalThis.localStorage?.setItem(scopedNicknameKey(), nickname);
  } catch {
    // Nickname persistence is best effort.
  }
  return nickname;
}

export async function requireAuthenticatedUser({ redirectTo = "" } = {}) {
  if (isAuthDisabledForLocalTest()) {
    return { id: currentPlayerId(), username: currentNickname(), employeeId: "", localTest: true };
  }
  authToken = readAuthToken();
  try {
    const user = await fetchAuthenticatedUser(authToken);
    authenticatedUser = normalizeAuthUser(user);
    if (!authenticatedUser) throw new Error("invalid_user_info");
    playerId = authenticatedUser.id;
    nickname = readNickname();
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
    if (["1", "on", "true", "yes", "login"].includes(value)) return false;
    if (["0", "off", "false", "no", "local"].includes(value)) return true;
    return backendConfig.requireLogin === false;
  } catch {
    return backendConfig.requireLogin === false;
  }
}

export async function bootstrapBackendPlayer() {
  if (!apiBaseUrl) return null;
  try {
    const result = await requestJson("/api/players/bootstrap", {
      method: "POST",
      body: JSON.stringify(playerBootstrapPayload()),
    });
    available = true;
    lastError = "";
    const player = normalizeBackendPlayer(result?.player || result);
    backendPlayer = player;
    needsNickname = Boolean(result?.needsNickname || player?.needsNickname || !player?.nickname);
    if (player?.id) playerId = player.userId || player.id;
    if (player?.nickname) {
      setBackendNickname(player.nickname);
      needsNickname = false;
    }
    return { ...(player || {}), needsNickname };
  } catch (error) {
    markFailure(error);
    return null;
  }
}

export async function submitBackendNickname(value) {
  if (!apiBaseUrl) return null;
  const nextNickname = normalizeNickname(value);
  try {
    const result = await requestJson("/api/players/nickname", {
      method: "POST",
      body: JSON.stringify({
        ...playerBootstrapPayload(),
        nickname: nextNickname,
      }),
    });
    available = true;
    lastError = "";
    const player = normalizeBackendPlayer(result?.player || result) || {
      id: currentPlayerId(),
      userId: authenticatedUser?.id || currentPlayerId(),
      username: authenticatedUser?.username || "",
      nickname: nextNickname,
    };
    backendPlayer = player;
    if (player.id) playerId = player.userId || player.id;
    setBackendNickname(player.nickname || nextNickname);
    needsNickname = false;
    return { ...backendPlayer, needsNickname: false };
  } catch (error) {
    markFailure(error);
    throw error;
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

export async function submitFeedback({ message } = {}) {
  if (!apiBaseUrl) return { ok: false, enabled: false, error: "backend_disabled" };
  try {
    const result = await requestJson("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        playerId: currentPlayerId(),
        nickname: currentNickname(),
        message: String(message || "").trim(),
      }),
    });
    available = true;
    lastError = "";
    return { ok: true, enabled: true, feedback: result?.feedback || null };
  } catch (error) {
    markFailure(error);
    return { ok: false, enabled: true, error: lastError };
  }
}

export async function listFeedback({ limit = 60 } = {}) {
  if (!apiBaseUrl) return { entries: [], enabled: false };
  const params = new URLSearchParams({ limit: String(limit) });
  try {
    const result = await requestJson(`/api/feedback?${params}`);
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

function playerBootstrapPayload() {
  const storedNickname = readStoredNickname();
  return {
    playerId: currentPlayerId(),
    userId: authenticatedUser?.id || currentPlayerId(),
    username: authenticatedUser?.username || "",
    employeeId: authenticatedUser?.employeeId || "",
    nickname: storedNickname || "",
  };
}

function readNickname() {
  const storedNickname = readStoredNickname();
  if (storedNickname) return storedNickname;
  if (authenticatedUser?.username) return authenticatedUser.username;
  return normalizeNickname(backendConfig.defaultNickname);
}

function readStoredNickname() {
  try {
    const text = String(
      globalThis.localStorage?.getItem(scopedNicknameKey())
      || (!authenticatedUser ? globalThis.localStorage?.getItem(NICKNAME_KEY) : "")
      || "",
    ).trim();
    return text ? normalizeNickname(text) : "";
  } catch {
    return "";
  }
}

function scopedNicknameKey() {
  return authenticatedUser?.id ? `${NICKNAME_KEY}:${authenticatedUser.id}` : NICKNAME_KEY;
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
    const response = await fetch(AUTH_USER_PATH, {
      method: "GET",
      headers: token ? { Authorization: token } : {},
      credentials: "include",
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
  const roles = normalizeStringList(value?.roles || value?.roleList || value?.authorities);
  const permissions = normalizeStringList(value?.permissions || value?.permissionList || value?.menus);
  const role = String(value?.role || value?.roleCode || value?.userType || "").trim().slice(0, 64);
  const roleCode = String(value?.roleCode || "").trim().slice(0, 64);
  const userType = String(value?.userType || "").trim().slice(0, 64);
  const isAdmin = value?.isAdmin === true || value?.admin === true || value?.administrator === true;
  return id && username ? { id, username, employeeId, role, roleCode, userType, roles, permissions, isAdmin } : null;
}

function normalizeBackendPlayer(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || value.playerId || value.player_id || value.userId || authenticatedUser?.id || "").trim().slice(0, 96);
  const userId = String(value.userId || authenticatedUser?.id || id).trim().slice(0, 96);
  const username = String(value.username || authenticatedUser?.username || "").trim().slice(0, 64);
  const employeeId = String(value.employeeId || authenticatedUser?.employeeId || "").trim().slice(0, 64);
  const rawNickname = String(value.nickname || value.displayName || "").trim();
  return id ? {
    id,
    userId,
    username,
    employeeId,
    nickname: rawNickname ? normalizeNickname(rawNickname) : "",
    needsNickname: Boolean(value.needsNickname),
  } : null;
}

function normalizeStringList(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s|]+/) : [];
  return source
    .map((entry) => typeof entry === "string" ? entry : entry?.role || entry?.roleCode || entry?.authority || entry?.permission || entry?.code || entry?.name)
    .map((entry) => String(entry || "").trim().slice(0, 96))
    .filter(Boolean)
    .slice(0, 64);
}

function redirectToLogin(redirectTo) {
  const target = redirectTo || backendConfig.loginRedirectUrl || "";
  if (backendConfig.authFailureMode !== "redirect") {
    return { id: currentPlayerId(), username: currentNickname(), employeeId: "", guest: true };
  }
  if (!target) return null;
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
