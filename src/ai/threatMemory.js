export function recordThreatSnapshot(runtime, { state, world, plan, config = {} }) {
  const memoryConfig = config.threatMemory || {};
  if (memoryConfig.enabled === false) return null;
  runtime.threatMemory ||= { snapshots: [] };
  const player = state.player || {};
  const threats = (plan?.threats || [])
    .map((threat) => {
      const distance = Math.hypot((threat.x || 0) - (player.x || 0), (threat.y || 0) - (player.y || 0));
      return {
        kind: threat.kind || threat.baseKind || "unknown",
        baseKind: threat.baseKind || threat.kind || "unknown",
        distance: Math.round(distance),
        weight: threat.weight || 1,
        damage: threat.damage || 1,
      };
    })
    .sort((a, b) => threatScore(b) - threatScore(a))
    .slice(0, 5);
  const snapshot = {
    time: state.time || 0,
    x: Math.round(player.x || 0),
    y: Math.round(player.y || 0),
    hp: Math.round(player.hp || 0),
    maxHp: Math.round(player.maxHp || 0),
    vx: Math.round(runtime.lastVelocity?.x || 0),
    vy: Math.round(runtime.lastVelocity?.y || 0),
    target: plan?.target?.kind || runtime.currentTarget?.kind || "",
    risk: Math.round(plan?.risk || runtime.lastPlanRisk || 0),
    recentDamage: Math.round(runtime.recentDamage || 0),
    damageSource: runtime.lastDamageSourceKind || "",
    position: runtime.situation?.position || "",
    bossMode: world.boss?.mode || world.boss?.dashState || world.boss?.id || "",
    threats,
  };
  const snapshots = runtime.threatMemory.snapshots;
  snapshots.push(snapshot);
  const maxSnapshots = clampInt(memoryConfig.maxSnapshots, 20, 300, 160);
  const windowSeconds = clampNumber(memoryConfig.windowSeconds, 1, 20, 8);
  while (snapshots.length > maxSnapshots || snapshots[0]?.time < snapshot.time - windowSeconds) snapshots.shift();
  runtime.threatMemory.lastSummary = summarizeThreatMemory(runtime, { config });
  return snapshot;
}

export function summarizeThreatMemory(runtime, { config = {} } = {}) {
  const memoryConfig = config.threatMemory || {};
  const snapshots = runtime?.threatMemory?.snapshots || [];
  if (!snapshots.length) return null;
  const endTime = snapshots[snapshots.length - 1].time || 0;
  const windowSeconds = clampNumber(memoryConfig.deathWindowSeconds, 1, 20, 8);
  const window = snapshots.filter((item) => item.time >= endTime - windowSeconds);
  const targetCounts = countBy(window, (item) => item.target || "unknown");
  const threatCounts = countBy(window.flatMap((item) => item.threats || []), (item) => item.kind || "unknown");
  const riskAvg = average(window.map((item) => item.risk || 0));
  const riskMax = Math.max(0, ...window.map((item) => item.risk || 0));
  const moved = totalMovement(window);
  const topThreatKind = maxCountKey(threatCounts);
  const topTargetKind = maxCountKey(targetCounts);
  return {
    snapshots: window.length,
    target: topTargetKind,
    threat: topThreatKind,
    riskAvg: Math.round(riskAvg),
    riskMax: Math.round(riskMax),
    moved: Math.round(moved),
    standingStill: moved < 60 && window.length >= 8,
    greedyCollect: topTargetKind === "collect" && riskAvg > 28,
    cornerPressure: window.filter((item) => item.position === "corner" || item.position === "edge").length >= Math.max(3, window.length * 0.45),
    bossMode: lastNonEmpty(window.map((item) => item.bossMode)),
    damageSource: lastNonEmpty(window.map((item) => item.damageSource)),
  };
}

export function inferThreatMemoryDeathReason(runtime, { config = {} } = {}) {
  const summary = summarizeThreatMemory(runtime, { config });
  if (!summary) return "";
  const threat = summary.threat || "";
  if (summary.greedyCollect) return "greedy_collect_death";
  if (summary.cornerPressure && summary.riskAvg > 24) return "corner_pressure_death";
  if (threat === "boss_dash" || threat === "boss_segment_dash" || /dash/.test(summary.bossMode || "")) return "boss_dash_death";
  if (summary.standingStill && (threat.startsWith("hazard") || summary.damageSource === "hazard")) return "hazard_standstill_death";
  if (summary.riskAvg > 48 && threat) return `${threat}_pressure_death`;
  return "";
}

function threatScore(item) {
  return (item.damage || 1) * (item.weight || 1) / Math.max(40, item.distance || 999);
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items || []) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function maxCountKey(counts) {
  let best = "";
  let bestCount = 0;
  for (const [key, count] of Object.entries(counts || {})) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function totalMovement(items) {
  let total = 0;
  for (let i = 1; i < items.length; i++) {
    total += Math.hypot((items[i].x || 0) - (items[i - 1].x || 0), (items[i].y || 0) - (items[i - 1].y || 0));
  }
  return total;
}

function lastNonEmpty(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]) return values[i];
  }
  return "";
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}
