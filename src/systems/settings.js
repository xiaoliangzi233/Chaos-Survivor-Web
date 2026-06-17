const SETTINGS_KEY = "chaos-survivor-settings";

const defaults = {
  showEnemyHpBar: false,
  showDamageNumbers: false,
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = { ...defaults, ...parsed };
  } catch {
    cache = { ...defaults };
    localStorage.removeItem(SETTINGS_KEY);
  }
  return cache;
}

export function getSettings() {
  return load();
}

export function getSetting(key) {
  return load()[key] ?? defaults[key];
}

export function setSetting(key, value) {
  const s = load();
  s[key] = value;
  cache = s;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

export function toggleSetting(key) {
  const s = load();
  s[key] = !s[key];
  cache = s;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
  return s[key];
}
