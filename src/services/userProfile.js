const TOKEN_SESSION_KEY = "pixel-survivor-user-token";
const PRIMARY_SHARED_TOKEN_KEY = "token";
const LOGIN_URL = "http://8.130.41.52/login";

let session = {
  status: "idle",
  token: "",
  user: null,
  error: "",
};

const listeners = new Set();

export function getUserSession() {
  return session;
}

export function subscribeUserSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initializeUserProfile({
  force = false,
  timeoutMs = 6000,
  url = "api/v1/survivor/session",
  skipTokenValidation = false,
} = {}) {
  if (skipTokenValidation) {
    setSession({
      status: "local",
      token: "",
      user: null,
      error: "本地开发模式已跳过 token 校验，排行榜不可用",
    });
    return session;
  }

  const token = captureToken();
  if (!token) {
    setSession({ status: "missing", token: "", user: null, error: "未检测到登录 token" });
    redirectToPortalHome();
    return session;
  }
  if (!force && session.status === "ready" && session.token === token) return session;

  setSession({ status: "loading", token, user: null, error: "" });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await requestUserSession(url, token, controller.signal);
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "登录凭证已失效" : `用户信息请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    const user = normalizeUser(await response.json());
    setSession({ status: "ready", token, user, error: "" });
  } catch (error) {
    const message = error?.name === "AbortError" ? "用户信息请求超时" : error?.message || "无法获取用户信息";
    setSession({ status: "error", token, user: null, error: message });
    if (error?.status === 401) redirectToPortalHome();
  } finally {
    window.clearTimeout(timer);
  }
  return session;
}

export function formatEmployeeId(employeeId) {
  const value = String(employeeId || "").trim();
  return value || "—";
}

function captureToken() {
  const url = new URL(window.location.href);
  const urlToken = normalizeToken(url.searchParams.get("token"));
  if (urlToken) {
    persistToken(urlToken);
    url.searchParams.delete("token");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return urlToken;
  }

  const sharedToken = readStorage(localStorage, PRIMARY_SHARED_TOKEN_KEY);
  if (sharedToken) {
    persistToken(sharedToken);
    return sharedToken;
  }

  const sessionToken = readStorage(sessionStorage, TOKEN_SESSION_KEY);
  if (sessionToken) return sessionToken;
  return session.token;
}

function requestUserSession(url, token, signal) {
  return fetch(url, {
    method: "GET",
    headers: { Authorization: token },
    cache: "no-store",
    signal,
  });
}

function readStorage(storage, key) {
  try {
    return normalizeToken(storage.getItem(key));
  } catch {
    return "";
  }
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1).trim();
  }
  return token;
}

function persistToken(token) {
  try {
    sessionStorage.setItem(TOKEN_SESSION_KEY, token);
  } catch {
    // Session storage can be disabled; the in-memory token still works for this page.
  }
  try {
    localStorage.setItem(PRIMARY_SHARED_TOKEN_KEY, token);
  } catch {
    // Local storage can be disabled; session storage or the current request still works.
  }
}

function redirectToPortalHome() {
  // 仅在没有凭证或服务端明确判定凭证无效时离开游戏；网络波动和超时仍留在当前页面。
  if (window.location.href.startsWith(LOGIN_URL)) return;
  window.location.replace(LOGIN_URL);

  // 极少数嵌入式 WebView 会忽略 replace；再以 href 进行一次原生导航兜底。
  window.setTimeout(() => {
    if (!window.location.href.startsWith(LOGIN_URL)) window.location.href = LOGIN_URL;
  }, 180);
}

function normalizeUser(value) {
  const id = String(value?.id || "").trim();
  const username = String(value?.username || "").trim();
  const employeeId = String(value?.employeeId || "").trim();
  if (!id || !username) throw new Error("用户信息响应缺少 id 或 username");
  return { id, username, employeeId };
}

function setSession(next) {
  session = Object.freeze({ ...next });
  for (const listener of listeners) listener(session);
}
