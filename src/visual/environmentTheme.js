export const VisualQuality = Object.freeze({
  REDUCED: "reduced",
  HIGH: "high",
  ULTRA: "ultra",
});

export const ENVIRONMENT_THEME = Object.freeze({
  palette: Object.freeze({
    void: "#02050b",
    ink: "#eefbff",
    muted: "#87a3b4",
    shell: "#07131d",
    shellRaised: "#0d2230",
    armor: "#173442",
    armorHighlight: "#315667",
    seam: "#496878",
    navigation: "#42e8ff",
    safe: "#77ff8a",
    reward: "#ffd166",
    danger: "#ff4d6d",
    anomaly: "#b48cff",
  }),
  stroke: Object.freeze({ hairline: 1, detail: 2, structure: 4, silhouette: 6 }),
  glow: Object.freeze({ ambient: 0.12, active: 0.34, critical: 0.58 }),
  wear: Object.freeze({ clean: 0.12, used: 0.28, ruined: 0.46 }),
  motion: Object.freeze({ ambient: 0.7, active: 2.4, alert: 5.2 }),
});

export const ROOM_VISUAL_PROFILES = Object.freeze({
  core: profile("navigation", "#42e8ff", "hub", 0.18, "中央枢纽"),
  bridge: profile("navigation", "#42e8ff", "nav", 0.14, "舰桥"),
  data: profile("anomaly", "#b48cff", "archive", 0.24, "数据区"),
  science: profile("safe", "#77ff8a", "bio", 0.1, "生命科学"),
  combat: profile("danger", "#ff4d6d", "armory", 0.34, "军械区"),
  engineering: profile("reward", "#ffb347", "power", 0.31, "工程区"),
  habitat: profile("safe", "#77ff8a", "habitat", 0.12, "生活区", "#ffd59a"),
});

export const ARENA_VISUAL_PROFILES = Object.freeze({
  reactor: profile("navigation", "#42e8ff", "reactor", 0.34, "反应堆"),
  bio: profile("safe", "#77ff8a", "bio", 0.2, "生物实验室"),
  cryo: profile("navigation", "#9ff4ff", "cryo", 0.13, "低温舱"),
  storage: profile("reward", "#ffd166", "storage", 0.39, "储存区"),
  control: profile("anomaly", "#b48cff", "control", 0.23, "控制室"),
  service: profile("navigation", "#7dd3fc", "service", 0.42, "维护通道"),
  corridor: profile("navigation", "#7dd3fc", "corridor", 0.46, "连接通道"),
});

export function roomVisualProfile(id, fallbackColor = "#42e8ff") {
  return ROOM_VISUAL_PROFILES[id] || profile("navigation", fallbackColor, "system", 0.24, "系统区");
}

export function arenaVisualProfile(zone, fallbackColor = "#7dd3fc") {
  return ARENA_VISUAL_PROFILES[zone] || profile("navigation", fallbackColor, "system", 0.34, "设施区");
}

export function visualSeedFrom(value) {
  const source = String(value ?? "environment");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveVisualQuality({ width = 1280, height = 720, dpr = 1, reducedMotion = false } = {}) {
  if (reducedMotion || width < 620 || height < 520) return VisualQuality.REDUCED;
  if (width >= 1440 && height >= 800 && dpr <= 2.5) return VisualQuality.ULTRA;
  return VisualQuality.HIGH;
}

function profile(semantic, color, decal, wear, label, warmColor = null) {
  return Object.freeze({ semantic, color, decal, wear, label, warmColor });
}
