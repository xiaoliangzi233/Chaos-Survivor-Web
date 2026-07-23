const DEFAULT_ACCESS_CONFIG = Object.freeze({
  anonymousLocalPlay: Object.freeze({
    enabled: false,
  }),
});

export function normalizeAccessConfig(value = {}) {
  return Object.freeze({
    anonymousLocalPlay: Object.freeze({
      enabled: value?.anonymousLocalPlay?.enabled === true,
    }),
  });
}

export async function loadAccessConfig() {
  try {
    const response = await fetch(new URL("./access-config.json", import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`access config ${response.status}`);
    return normalizeAccessConfig(await response.json());
  } catch {
    return normalizeAccessConfig(DEFAULT_ACCESS_CONFIG);
  }
}
