import { AI_CONFIG } from "./aiConfig.js";

const TRAINING_VERSION = 3;
const TRAINING_KEY_PREFIX = "pixel-survivor-ai-training";

const DEFAULT_WEAPON_WEIGHTS = {
  missile: 1.3,
  ice: 1.22,
  prism_railgun: 1.12,
  void_singularity: 1.06,
  tesla_mine_chain: 1.04,
  rift_loom: 1.02,
  arc: 1,
  boomerang: 0.96,
  drone: 0.94,
  starfall_scepter: 0.94,
  phase_needler: 0.92,
  echo_tuning_fork: 0.78,
};

export function createAiRuntime(overrides = {}) {
  return {
    enabled: false,
    tickAccumulator: 0,
    actionCooldown: 0,
    restartTimer: 0,
    restartRequested: false,
    pendingConfigReload: false,
    runRecorded: false,
    shopRefreshesUsed: 0,
    upgradeRefreshesUsed: 0,
    currentTarget: null,
    lastVelocity: { x: 0, y: 0 },
    lastPosition: null,
    stuckTimer: 0,
    stuckEvents: 0,
    recentDamage: 0,
    lastHp: null,
    events: [],
    lastDamageSourceKind: "",
    bossMemory: null,
    tickCache: null,
    tickId: 0,
    perf: {},
    ...overrides,
  };
}

export function createTrainingState() {
  return {
    version: TRAINING_VERSION,
    totalRuns: 0,
    victories: 0,
    totalTime: 0,
    recentRuns: [],
    weaponStats: {},
    difficultyStats: {},
    matrix: {},
    strategyStats: {},
    deathWindows: [],
    recommendations: {},
    profileStats: {},
    upgradeCounts: {},
    shopCounts: {},
    adjustments: {
      survivalBias: 0,
      mobilityBias: 0,
      greed: 0,
      bossAggression: 0,
      upgradeBias: {
        survival: 0,
        mobility: 0,
        damage: 0,
        economy: 0,
      },
    },
  };
}

export function loadAiTraining(storage = globalThis.localStorage, key = AI_CONFIG.storageKey) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return createTrainingState();
    return normalizeTraining(JSON.parse(raw));
  } catch {
    return createTrainingState();
  }
}

export function saveAiTraining(training, storage = globalThis.localStorage, key = AI_CONFIG.storageKey) {
  try {
    storage?.setItem(key, JSON.stringify(normalizeTraining(training)));
  } catch {
    // Storage can be unavailable in sandboxed iframes; AI should still run.
  }
}

export function clearAiTrainingStorage(storage = globalThis.localStorage, key = AI_CONFIG.storageKey) {
  if (!storage) return 0;
  const keys = new Set([key, AI_CONFIG.storageKey]);
  try {
    for (let i = 0; i < (storage.length || 0); i += 1) {
      const itemKey = storage.key?.(i);
      if (typeof itemKey === "string" && itemKey.startsWith(TRAINING_KEY_PREFIX)) keys.add(itemKey);
    }
  } catch {
    // Some storage implementations do not allow enumeration.
  }
  let removed = 0;
  for (const itemKey of keys) {
    try {
      storage.removeItem?.(itemKey);
      removed += 1;
    } catch {
      // Ignore storage failures; training can continue in memory.
    }
  }
  return removed;
}

export function recordRunResult(training, result) {
  const data = normalizeTraining(training);
  const summary = {
    victory: Boolean(result.victory),
    time: Math.max(0, Math.round(result.time || 0)),
    kills: Math.max(0, Math.round(result.kills || 0)),
    gold: Math.max(0, Math.round(result.gold || 0)),
    level: Math.max(1, Math.round(result.level || 1)),
    wave: Math.max(1, Math.round(result.wave || 1)),
    weaponId: result.weaponId || "unknown",
    difficultyId: result.difficultyId || "unknown",
    deathReason: result.deathReason || inferDeathReason(result),
    profile: result.profile || "balanced",
    deathWindow: result.deathWindow || null,
    at: Date.now(),
  };
  data.totalRuns += 1;
  data.victories += summary.victory ? 1 : 0;
  data.totalTime += summary.time;
  data.recentRuns.push(summary);
  while (data.recentRuns.length > 20) data.recentRuns.shift();
  updateBucket(data.weaponStats, summary.weaponId, summary);
  updateBucket(data.difficultyStats, summary.difficultyId, summary);
  updateBucket(data.profileStats, summary.profile, summary);
  updateMatrix(data.matrix, summary);
  updateStrategyStats(data.strategyStats, summary);
  recordDeathWindow(data, summary);
  data.recommendations = buildRecommendation(data, summary);
  applyAdjustment(data.adjustments, summary);
  Object.assign(training, data);
  return data;
}

export function recordUpgrade(training, id) {
  const data = normalizeTraining(training);
  data.upgradeCounts[id] = (data.upgradeCounts[id] || 0) + 1;
  Object.assign(training, data);
  return data;
}

export function recordShopAction(training, id) {
  const data = normalizeTraining(training);
  data.shopCounts[id] = (data.shopCounts[id] || 0) + 1;
  Object.assign(training, data);
  return data;
}

export function chooseTrainingLoadout({ training, difficulties, weapons, config = AI_CONFIG }) {
  const unlocked = (difficulties || []).filter((item) => item?.unlocked);
  const normalized = normalizeTraining(training);
  const difficulty = chooseDifficulty(normalized, unlocked, config);
  const weapon = chooseWeapon(normalized, weapons || [], config, difficulty?.id, config.profile || "balanced");
  return {
    difficulty: difficulty || unlocked[0] || difficulties?.[0] || null,
    weapon: weapon || weapons?.[0] || null,
    reason: "training_matrix",
  };
}

function chooseDifficulty(training, unlocked, config = AI_CONFIG) {
  if (!unlocked.length) return null;
  const ordered = [...unlocked].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const trainingConfig = config.difficultyTraining || AI_CONFIG.difficultyTraining;
  if (trainingConfig.enabled === false) return ordered[Math.max(0, ordered.length - 1)];
  const demotion = trainingConfig.demotion || AI_CONFIG.difficultyTraining.demotion;
  const promotion = trainingConfig.promotion || AI_CONFIG.difficultyTraining.promotion;
  const currentRun = training.totalRuns || 0;
  const eligible = ordered.filter((item) => !isDifficultyCoolingDown(training, item.id, currentRun));
  const candidates = eligible.length ? eligible : ordered;
  const target = trainingConfig.targetDifficultyId
    ? ordered.find((item) => item.id === trainingConfig.targetDifficultyId)
    : null;
  if (target) {
    const targetIndex = ordered.indexOf(target);
    const canDemote = trainingConfig.allowTargetDemotion !== false;
    if (canDemote && hasEarlyDeathPattern(training.difficultyStats[target.id], demotion) && targetIndex > 0) {
      return ordered[targetIndex - 1];
    }
    if (!isDifficultyCoolingDown(training, target.id, currentRun) || !canDemote) return target;
  }
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const item = candidates[i];
    if (!hasEarlyDeathPattern(training.difficultyStats[item.id], demotion)) return item;
  }
  if (candidates.length > 1) return candidates[Math.max(0, candidates.length - 2)];
  const recent = training.recentRuns.slice(-5);
  const recentWins = recent.filter((run) => run.victory).length;
  if (recent.length >= 3 && recentWins === 0 && ordered.length > 1) return ordered[Math.max(0, ordered.length - 2)];
  if (recent.length >= promotion.minRuns && recentWins / Math.max(1, recent.length) >= promotion.minWinRate) return ordered[ordered.length - 1];
  return candidates[Math.max(0, candidates.length - 1)];
}

function chooseWeapon(training, weapons, config = AI_CONFIG, difficultyId = "", profile = "balanced") {
  let best = null;
  let bestScore = -Infinity;
  const weaponConfig = config.weaponTraining || AI_CONFIG.weaponTraining;
  const demotion = config.difficultyTraining?.demotion || AI_CONFIG.difficultyTraining.demotion;
  const difficultyEarlyDeaths = hasEarlyDeathPattern(training.difficultyStats[difficultyId], demotion);
  const fallback = new Set(Array.isArray(weaponConfig.fallbackWeapons) ? weaponConfig.fallbackWeapons : []);
  for (const weapon of weapons) {
    const id = weapon.id;
    const stats = training.weaponStats[id];
    if (difficultyEarlyDeaths && fallback.size && !fallback.has(id)) continue;
    const prior = DEFAULT_WEAPON_WEIGHTS[id] || 1;
    const winRate = stats?.runs ? stats.wins / stats.runs : 0.45;
    const avgTime = stats?.runs ? stats.time / stats.runs : 90;
    const confidence = stats?.runs ? Math.min(1, stats.runs / 8) : 0;
    const earlyDeathPenalty = (stats?.earlyDeaths || 0) * 18;
    const matrixPenalty = matrixPenaltyFor(training, profile, difficultyId, id, config.trainingMatrix);
    const explorationBonus = !stats?.runs ? (weaponConfig.explorationRate || 0) * 80 : 0;
    const score = prior * 100 + winRate * 70 * confidence + Math.min(90, avgTime) * 0.22 + explorationBonus - earlyDeathPenalty - matrixPenalty;
    if (score > bestScore) {
      best = weapon;
      bestScore = score;
    }
  }
  return best;
}

export function matrixKey(profile, difficultyId, weaponId) {
  return `${profile || "balanced"}|${difficultyId || "unknown"}|${weaponId || "unknown"}`;
}

function updateBucket(collection, key, summary) {
  const bucket = collection[key] || { runs: 0, wins: 0, time: 0, kills: 0, gold: 0, survivalWaveTotal: 0, earlyDeaths: 0 };
  bucket.runs += 1;
  bucket.wins += summary.victory ? 1 : 0;
  bucket.time += summary.time;
  bucket.kills += summary.kills;
  bucket.gold += summary.gold;
  bucket.survivalWaveTotal += summary.wave;
  if (!summary.victory && summary.wave <= Math.max(3, AI_CONFIG.difficultyTraining.demotion.earlyDeathWave)) bucket.earlyDeaths += 1;
  collection[key] = bucket;
}

function updateMatrix(matrix, summary) {
  const key = matrixKey(summary.profile, summary.difficultyId, summary.weaponId);
  const bucket = matrix[key] || { runs: 0, wins: 0, earlyDeaths: 0, totalTime: 0, survivalWaveTotal: 0, kills: 0, gold: 0, lowGoldRuns: 0, cooldownUntilRun: 0 };
  bucket.runs += 1;
  bucket.wins += summary.victory ? 1 : 0;
  bucket.earlyDeaths += !summary.victory && summary.wave <= Math.max(3, AI_CONFIG.difficultyTraining.demotion.earlyDeathWave) ? 1 : 0;
  bucket.totalTime += summary.time;
  bucket.survivalWaveTotal += summary.wave;
  bucket.kills += summary.kills;
  bucket.gold += summary.gold;
  bucket.lowGoldRuns += summary.deathReason === "low_gold" ? 1 : 0;
  matrix[key] = bucket;
}

function updateStrategyStats(strategyStats, summary) {
  const key = summary.deathReason || "unknown";
  const bucket = strategyStats[key] || { runs: 0, wins: 0, totalWave: 0, totalRisk: 0 };
  bucket.runs += 1;
  bucket.wins += summary.victory ? 1 : 0;
  bucket.totalWave += summary.wave || 1;
  bucket.totalRisk += summary.deathWindow?.riskAvg || 0;
  strategyStats[key] = bucket;
}

function recordDeathWindow(data, summary) {
  if (summary.victory || !summary.deathWindow) return;
  data.deathWindows.push({
    at: summary.at,
    profile: summary.profile,
    difficultyId: summary.difficultyId,
    weaponId: summary.weaponId,
    deathReason: summary.deathReason,
    ...summary.deathWindow,
  });
  while (data.deathWindows.length > 12) data.deathWindows.shift();
}

function buildRecommendation(data, summary) {
  const latest = summary || {};
  const profile = latest.deathReason?.includes("damage") ? "aggressive"
    : latest.deathReason?.includes("gold") ? "farmer"
      : latest.victory ? latest.profile : "survivor";
  return {
    profile,
    difficultyId: latest.difficultyId || "",
    weaponId: latest.weaponId || "",
    shopBias: latest.deathReason?.includes("gold") ? "economy" : latest.deathReason?.includes("damage") ? "damage" : "survival",
    upgradeBias: latest.deathReason?.includes("projectile") ? "mobility" : latest.deathReason?.includes("damage") ? "damage" : "survival",
    movementBias: latest.deathReason?.includes("collect") ? "less_greed" : latest.deathReason?.includes("corner") ? "center_return" : "survive",
    runs: data.totalRuns,
  };
}

function matrixPenaltyFor(training, profile, difficultyId, weaponId, config = AI_CONFIG.trainingMatrix) {
  if (config?.enabled === false) return 0;
  const bucket = training.matrix?.[matrixKey(profile, difficultyId, weaponId)];
  if (!bucket || bucket.runs < (config?.minSamplesForPenalty || 2)) return 0;
  const earlyDeathRate = (bucket.earlyDeaths || 0) / Math.max(1, bucket.runs);
  const winRate = (bucket.wins || 0) / Math.max(1, bucket.runs);
  return earlyDeathRate * (config?.earlyDeathPenalty || 22) + Math.max(0, 0.35 - winRate) * 18;
}

function isDifficultyCoolingDown(training, id, currentRun) {
  const bucket = training.difficultyStats[id];
  return Number.isFinite(bucket?.cooldownUntilRun) && bucket.cooldownUntilRun > currentRun;
}

function hasEarlyDeathPattern(bucket, demotion) {
  if (!bucket?.runs) return false;
  const earlyDeathLimit = demotion?.earlyDeathLimit ?? AI_CONFIG.difficultyTraining.demotion.earlyDeathLimit;
  const earlyDeathWave = demotion?.earlyDeathWave ?? AI_CONFIG.difficultyTraining.demotion.earlyDeathWave;
  const averageWave = (bucket.survivalWaveTotal || bucket.runs) / Math.max(1, bucket.runs);
  return (bucket.earlyDeaths || 0) >= earlyDeathLimit && bucket.wins === 0 && averageWave <= earlyDeathWave + 0.5;
}

function inferDeathReason(result) {
  if (result.victory) return "victory";
  if (result.stuckEvents > 0) return "corner_stuck";
  if ((result.kills || 0) < Math.max(5, (result.time || 0) * 0.08)) return "low_damage";
  if ((result.gold || 0) < 15 && (result.time || 0) > 70) return "low_gold";
  return "death_by_pressure";
}

export function pushAiEvent(runtime, event) {
  if (!runtime) return;
  runtime.events ||= [];
  runtime.events.push({ at: Date.now(), ...event });
  while (runtime.events.length > 80) runtime.events.shift();
}

export function inferRunFailure(runtime, state, world) {
  if (state.victory) return "victory";
  const events = runtime?.events || [];
  const damage = events.filter((event) => event.type === "damage");
  const byKind = damage.reduce((map, event) => {
    const key = event.sourceKind || "pressure";
    map[key] = (map[key] || 0) + (event.amount || 1);
    return map;
  }, {});
  const dominant = Object.entries(byKind).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  if (dominant.includes("hazard")) return "death_by_hazard";
  if (dominant.includes("projectile")) return "death_by_projectile";
  if (dominant.includes("enemy") || dominant.includes("boss")) return "death_by_enemy_contact";
  if ((runtime?.stuckEvents || 0) >= 2) return "corner_stuck";
  if (world?.boss && world.boss.maxHp && world.boss.hp / world.boss.maxHp > 0.45 && (state.time || 0) > 90) return "low_boss_damage";
  if ((state.gold || 0) < 18 && (state.time || 0) > 70) return "low_gold";
  return inferDeathReason({ ...state, stuckEvents: runtime?.stuckEvents || 0 });
}

function applyAdjustment(adjustments, summary) {
  if (summary.victory) {
    adjustments.greed = clamp(adjustments.greed + 0.02, -0.35, 0.35);
    adjustments.bossAggression = clamp(adjustments.bossAggression + 0.02, -0.25, 0.35);
    return;
  }
  if (summary.deathReason.includes("projectile") || summary.deathReason.includes("pressure")) adjustments.mobilityBias = clamp(adjustments.mobilityBias + 0.05, -0.2, 0.45);
  if (summary.deathReason.includes("enemy") || summary.deathReason.includes("hazard")) adjustments.survivalBias = clamp(adjustments.survivalBias + 0.05, -0.2, 0.45);
  if (summary.deathReason === "low_gold") adjustments.greed = clamp(adjustments.greed + 0.04, -0.35, 0.35);
  if (summary.deathReason === "low_damage") adjustments.bossAggression = clamp(adjustments.bossAggression + 0.04, -0.25, 0.35);
  adjustments.upgradeBias ||= { survival: 0, mobility: 0, damage: 0, economy: 0 };
  if (summary.deathReason.includes("projectile")) adjustments.upgradeBias.mobility = clamp(adjustments.upgradeBias.mobility + 0.08, 0, 1);
  if (summary.deathReason.includes("hazard") || summary.deathReason.includes("enemy")) adjustments.upgradeBias.survival = clamp(adjustments.upgradeBias.survival + 0.08, 0, 1);
  if (summary.deathReason.includes("damage")) adjustments.upgradeBias.damage = clamp(adjustments.upgradeBias.damage + 0.08, 0, 1);
  if (summary.deathReason === "low_gold") adjustments.upgradeBias.economy = clamp(adjustments.upgradeBias.economy + 0.08, 0, 1);
}

function normalizeTraining(value) {
  return {
    ...createTrainingState(),
    ...(value || {}),
    version: TRAINING_VERSION,
    recentRuns: Array.isArray(value?.recentRuns) ? value.recentRuns.slice(-20) : [],
    weaponStats: { ...(value?.weaponStats || {}) },
    difficultyStats: { ...(value?.difficultyStats || {}) },
    matrix: { ...(value?.matrix || {}) },
    strategyStats: { ...(value?.strategyStats || {}) },
    deathWindows: Array.isArray(value?.deathWindows) ? value.deathWindows.slice(-12) : [],
    recommendations: { ...(value?.recommendations || {}) },
    profileStats: { ...(value?.profileStats || {}) },
    upgradeCounts: { ...(value?.upgradeCounts || {}) },
    shopCounts: { ...(value?.shopCounts || {}) },
    adjustments: {
      ...createTrainingState().adjustments,
      ...(value?.adjustments || {}),
      upgradeBias: { ...createTrainingState().adjustments.upgradeBias, ...(value?.adjustments?.upgradeBias || {}) },
    },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
