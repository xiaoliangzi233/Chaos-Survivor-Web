const FEEDBACK_SCOPES = new Set(["ALL", "MINE"]);

let apiBaseUrl = "api";
let identity = { token: "", user: null };

export function configureFeedback({ baseUrl, token, user }) {
  apiBaseUrl = normalizeBaseUrl(baseUrl);
  identity = { token: String(token || ""), user: user || null };
}

export function fetchFeedback({ scope = "ALL", page = 1, pageSize = 5 } = {}) {
  requireIdentity();
  const normalizedScope = normalizeScope(scope);
  const query = new URLSearchParams({
    scope: normalizedScope,
    page: String(Math.max(1, Math.floor(Number(page) || 1))),
    pageSize: String(Math.min(20, Math.max(1, Math.floor(Number(pageSize) || 5)))),
  });
  return requestJson(`${apiBaseUrl}/v1/survivor/feedback?${query}`, { method: "GET" });
}

export function createFeedback(content) {
  requireIdentity();
  return requestJson(`${apiBaseUrl}/v1/survivor/feedback`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function updateFeedback(feedbackId, content) {
  requireIdentity();
  return requestJson(`${apiBaseUrl}/v1/survivor/feedback/${normalizeFeedbackId(feedbackId)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function deleteFeedback(feedbackId) {
  requireIdentity();
  return requestJson(`${apiBaseUrl}/v1/survivor/feedback/${normalizeFeedbackId(feedbackId)}`, {
    method: "DELETE",
  });
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
  if (!response.ok) {
    const error = new Error(body?.message || `反馈服务请求失败（${response.status}）`);
    error.status = response.status;
    error.code = body?.code || "FEEDBACK_REQUEST_FAILED";
    throw error;
  }
  return body;
}

function requireIdentity() {
  if (!identity.user || !identity.token) {
    const error = new Error("登录后才能查看和提交反馈");
    error.status = 401;
    throw error;
  }
}

function normalizeScope(scope) {
  const normalized = String(scope || "ALL").trim().toUpperCase();
  return FEEDBACK_SCOPES.has(normalized) ? normalized : "ALL";
}

function normalizeFeedbackId(value) {
  const id = Math.floor(Number(value));
  if (!Number.isInteger(id) || id <= 0) throw new Error("反馈 ID 无效");
  return id;
}

function normalizeBaseUrl(value) {
  const base = String(value || "api").trim() || "api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
