const DEFAULT_BACKEND_CONFIG = {
  apiBaseUrl: "",
  requireLogin: false,
  defaultNickname: "Anonymous",
  authFailureMode: "guest",
  loginRedirectUrl: "",
};

// Local static servers do not provide the progress API. Set ?api=... or fill
// apiBaseUrl in backend-config.json when running with a real backend service.
export const backendConfig = { ...DEFAULT_BACKEND_CONFIG };

export async function loadBackendConfig() {
  try {
    const response = await fetch("src/config/backend-config.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`backend_config_${response.status}`);
    const json = await response.json();
    Object.assign(backendConfig, normalizeBackendConfig(json));
  } catch (error) {
    Object.assign(backendConfig, DEFAULT_BACKEND_CONFIG);
    console.warn("[config] 后端配置加载失败，已使用默认配置：", error);
  }
  return { ...backendConfig };
}

function normalizeBackendConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    apiBaseUrl: typeof source.apiBaseUrl === "string"
      ? source.apiBaseUrl
      : DEFAULT_BACKEND_CONFIG.apiBaseUrl,
    requireLogin: typeof source.requireLogin === "boolean"
      ? source.requireLogin
      : DEFAULT_BACKEND_CONFIG.requireLogin,
    defaultNickname: typeof source.defaultNickname === "string"
      ? source.defaultNickname
      : DEFAULT_BACKEND_CONFIG.defaultNickname,
    authFailureMode: normalizeAuthFailureMode(source.authFailureMode),
    loginRedirectUrl: typeof source.loginRedirectUrl === "string"
      ? source.loginRedirectUrl
      : DEFAULT_BACKEND_CONFIG.loginRedirectUrl,
  };
}

function normalizeAuthFailureMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "redirect" || mode === "guest"
    ? mode
    : DEFAULT_BACKEND_CONFIG.authFailureMode;
}
