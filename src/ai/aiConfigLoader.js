import { AI_CONFIG } from "./aiConfig.js";

export const AI_CONFIG_PATH = "../config/ai-config.json";
export const AI_TRAINING_CONFIG_PATH = "../config/ai-training-config.json";

export async function loadAiRunConfig({ fetchImpl = globalThis.fetch, cacheBust = true, timeoutMs = AI_CONFIG.configReloadTimeoutMs } = {}) {
  if (typeof fetchImpl !== "function") return normalizeAiConfig();
  const controller = createAbortController();
  try {
    const url = new URL(AI_CONFIG_PATH, import.meta.url);
    if (cacheBust) url.searchParams.set("t", String(Date.now()));
    const response = await withTimeout(fetchImpl(url, { cache: "no-store", signal: controller?.signal }), timeoutMs, controller);
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    return normalizeAiConfig(await withTimeout(response.json(), timeoutMs, controller));
  } catch (error) {
    const config = normalizeAiConfig();
    config.configLoadError = error?.message || "unknown";
    return config;
  }
}

export async function loadAiTrainingModeConfig({ fetchImpl = globalThis.fetch, cacheBust = true, timeoutMs = AI_CONFIG.configReloadTimeoutMs } = {}) {
  if (typeof fetchImpl !== "function") return normalizeAiTrainingModeConfig();
  const controller = createAbortController();
  try {
    const url = new URL(AI_TRAINING_CONFIG_PATH, import.meta.url);
    if (cacheBust) url.searchParams.set("t", String(Date.now()));
    const response = await withTimeout(fetchImpl(url, { cache: "no-store", signal: controller?.signal }), timeoutMs, controller);
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    return normalizeAiTrainingModeConfig(await withTimeout(response.json(), timeoutMs, controller));
  } catch (error) {
    const config = normalizeAiTrainingModeConfig();
    config.configLoadError = error?.message || "unknown";
    return config;
  }
}

export function normalizeAiTrainingModeConfig(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    enabled: source.enabled === true,
    clearTrainingOnStartup: source.clearTrainingOnStartup !== false,
    openLoadoutOnStartup: source.openLoadoutOnStartup !== false,
  };
}

export function normalizeAiConfig(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const merged = deepMerge(AI_CONFIG, source);
  const profileId = typeof merged.profile === "string" ? merged.profile : "balanced";
  const profile = isPlainObject(merged.profiles?.[profileId]) ? merged.profiles[profileId] : merged.profiles?.balanced || {};
  const config = deepMerge(merged, profile);
  config.profile = profileId;
  config.activeProfile = profile;
  config.reloadBeforeEachRun = config.reloadBeforeEachRun !== false;
  config.maxTrainingRuns = normalizeMaxTrainingRuns(config.maxTrainingRuns);
  config.configReloadTimeoutMs = clampInt(config.configReloadTimeoutMs, 100, 10000, AI_CONFIG.configReloadTimeoutMs);
  config.tickHz = clampInt(config.tickHz, 4, 60, AI_CONFIG.tickHz);
  config.actionCooldown = clampNumber(config.actionCooldown, 0.05, 2, AI_CONFIG.actionCooldown);
  config.restartDelay = clampNumber(config.restartDelay, 0.1, 10, AI_CONFIG.restartDelay);
  config.movement = normalizeMovement(config.movement);
  config.orca = normalizeOrca(config.orca);
  config.economy = normalizeEconomy(config.economy);
  config.upgrade = normalizeUpgrade(config.upgrade);
  config.difficultyTraining = normalizeDifficultyTraining(config.difficultyTraining);
  config.weaponTraining = normalizeWeaponTraining(config.weaponTraining);
  config.situation = normalizeSituation(config.situation);
  config.objectiveWeights = normalizeObjectiveWeights(config.objectiveWeights);
  config.bossMemory = normalizeBossMemory(config.bossMemory);
  config.trainingMatrix = normalizeTrainingMatrix(config.trainingMatrix);
  config.performance = normalizePerformance(config.performance);
  config.routePlanner = normalizeRoutePlanner(config.routePlanner);
  config.threatMemory = normalizeThreatMemory(config.threatMemory);
  config.buildEvaluator = normalizeBuildEvaluator(config.buildEvaluator);
  config.dynamicProfile = normalizeDynamicProfile(config.dynamicProfile);
  config.hud = normalizeHud(config.hud);
  config.telemetry = normalizeTelemetry(config.telemetry);
  return config;
}

export function mergeAiConfig(base, patch) {
  return normalizeAiConfig(deepMerge(base || {}, patch || {}));
}

function normalizeMovement(value = {}) {
  return {
    ...AI_CONFIG.movement,
    ...value,
    lookAhead: clampNumber(value.lookAhead, 0.15, 3, AI_CONFIG.movement.lookAhead),
    maxNeighbors: clampInt(value.maxNeighbors, 4, 96, AI_CONFIG.movement.maxNeighbors),
    queryRadius: clampNumber(value.queryRadius, 160, 1800, AI_CONFIG.movement.queryRadius),
    candidateDirections: clampInt(value.candidateDirections, 8, 96, AI_CONFIG.movement.candidateDirections),
    boundaryPadding: clampNumber(value.boundaryPadding, 40, 500, AI_CONFIG.movement.boundaryPadding),
    stuckSeconds: clampNumber(value.stuckSeconds, 0.25, 4, AI_CONFIG.movement.stuckSeconds),
    velocitySmoothing: clampNumber(value.velocitySmoothing, 0, 1, AI_CONFIG.movement.velocitySmoothing),
    directionSwitchDot: clampNumber(value.directionSwitchDot, -1, 0.25, AI_CONFIG.movement.directionSwitchDot),
    directionSwitchHoldTicks: clampInt(value.directionSwitchHoldTicks, 0, 12, AI_CONFIG.movement.directionSwitchHoldTicks),
    urgentEscapePriority: clampNumber(value.urgentEscapePriority, 60, 180, AI_CONFIG.movement.urgentEscapePriority),
    riskTolerance: clampNumber(value.riskTolerance, 0.35, 2, AI_CONFIG.movement.riskTolerance),
    greed: clampNumber(value.greed, 0.25, 2.2, AI_CONFIG.movement.greed),
    bossAggression: clampNumber(value.bossAggression, 0.25, 2.2, AI_CONFIG.movement.bossAggression),
  };
}

function normalizeOrca(value = {}) {
  return {
    ...AI_CONFIG.orca,
    ...value,
    lowRiskCandidates: clampInt(value.lowRiskCandidates, 4, 64, AI_CONFIG.orca.lowRiskCandidates),
    midRiskCandidates: clampInt(value.midRiskCandidates, 6, 96, AI_CONFIG.orca.midRiskCandidates),
    highRiskCandidates: clampInt(value.highRiskCandidates, 8, 128, AI_CONFIG.orca.highRiskCandidates),
    reuseSafeVelocitySeconds: clampNumber(value.reuseSafeVelocitySeconds, 0, 1.5, AI_CONFIG.orca.reuseSafeVelocitySeconds),
    maxSolveMs: clampNumber(value.maxSolveMs, 0.5, 12, AI_CONFIG.orca.maxSolveMs),
    earlyExitRisk: clampNumber(value.earlyExitRisk, 0, 80, AI_CONFIG.orca.earlyExitRisk),
    earlyExitConstraint: clampNumber(value.earlyExitConstraint, 0, 60, AI_CONFIG.orca.earlyExitConstraint),
    earlyExitDot: clampNumber(value.earlyExitDot, 0, 1, AI_CONFIG.orca.earlyExitDot),
  };
}

function normalizeEconomy(value = {}) {
  const replacement = { ...AI_CONFIG.economy.weaponReplacement, ...(value.weaponReplacement || {}) };
  return {
    ...AI_CONFIG.economy,
    ...value,
    minRefreshReserve: clampInt(value.minRefreshReserve, 0, 200, AI_CONFIG.economy.minRefreshReserve),
    maxRefreshesPerShop: clampInt(value.maxRefreshesPerShop, 0, 8, AI_CONFIG.economy.maxRefreshesPerShop),
    refreshAggression: clampNumber(value.refreshAggression, 0.25, 2, 1),
    reserveGoldMultiplier: clampNumber(value.reserveGoldMultiplier, 0.25, 2, 1),
    weaponReplacement: {
      enabled: replacement.enabled !== false,
      minOfferScore: clampNumber(replacement.minOfferScore, 0, 180, AI_CONFIG.economy.weaponReplacement.minOfferScore),
      minUpgradeScoreDelta: clampNumber(replacement.minUpgradeScoreDelta, 0, 120, AI_CONFIG.economy.weaponReplacement.minUpgradeScoreDelta),
      minOfferQualityRank: clampInt(replacement.minOfferQualityRank, 0, 4, AI_CONFIG.economy.weaponReplacement.minOfferQualityRank),
    },
  };
}

function normalizeUpgrade(value = {}) {
  return {
    ...AI_CONFIG.upgrade,
    ...value,
    survivalMultiplier: clampNumber(value.survivalMultiplier, 0.4, 2.5, AI_CONFIG.upgrade.survivalMultiplier),
    mobilityMultiplier: clampNumber(value.mobilityMultiplier, 0.4, 2.5, AI_CONFIG.upgrade.mobilityMultiplier),
    damageMultiplier: clampNumber(value.damageMultiplier, 0.4, 2.5, AI_CONFIG.upgrade.damageMultiplier),
    economyMultiplier: clampNumber(value.economyMultiplier, 0.4, 2.5, AI_CONFIG.upgrade.economyMultiplier),
  };
}

function normalizeDifficultyTraining(value = {}) {
  const defaults = AI_CONFIG.difficultyTraining;
  const demotion = { ...defaults.demotion, ...(value.demotion || {}) };
  const promotion = { ...defaults.promotion, ...(value.promotion || {}) };
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    targetDifficultyId: typeof value.targetDifficultyId === "string" ? value.targetDifficultyId.trim() : defaults.targetDifficultyId,
    allowTargetDemotion: value.allowTargetDemotion !== false,
    demotion: {
      earlyDeathWave: clampInt(demotion.earlyDeathWave, 1, 20, defaults.demotion.earlyDeathWave),
      earlyDeathLimit: clampInt(demotion.earlyDeathLimit, 1, 20, defaults.demotion.earlyDeathLimit),
      cooldownRuns: clampInt(demotion.cooldownRuns, 0, 20, defaults.demotion.cooldownRuns),
    },
    promotion: {
      minRuns: clampInt(promotion.minRuns, 1, 30, defaults.promotion.minRuns),
      minWinRate: clampNumber(promotion.minWinRate, 0, 1, defaults.promotion.minWinRate),
      minAverageWave: clampNumber(promotion.minAverageWave, 1, 30, defaults.promotion.minAverageWave),
    },
  };
}

function normalizeWeaponTraining(value = {}) {
  return {
    ...AI_CONFIG.weaponTraining,
    ...value,
    explorationRate: clampNumber(value.explorationRate, 0, 0.6, AI_CONFIG.weaponTraining.explorationRate),
    fallbackWeapons: Array.isArray(value.fallbackWeapons) ? value.fallbackWeapons.filter(Boolean) : AI_CONFIG.weaponTraining.fallbackWeapons,
  };
}

function normalizeSituation(value = {}) {
  const defaults = AI_CONFIG.situation;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    earlyWave: clampInt(value.earlyWave, 1, 10, defaults.earlyWave),
    lateWave: clampInt(value.lateWave, 3, 20, defaults.lateWave),
    criticalHpRatio: clampNumber(value.criticalHpRatio, 0.1, 0.8, defaults.criticalHpRatio),
    lowGold: clampInt(value.lowGold, 0, 200, defaults.lowGold),
    projectilePressureHigh: clampNumber(value.projectilePressureHigh, 0.05, 1, defaults.projectilePressureHigh),
    surroundedEnemyCount: clampInt(value.surroundedEnemyCount, 3, 32, defaults.surroundedEnemyCount),
  };
}

function normalizeObjectiveWeights(value = {}) {
  return normalizeNumberMap(AI_CONFIG.objectiveWeights, value, 0, 3);
}

function normalizeBossMemory(value = {}) {
  const defaults = AI_CONFIG.bossMemory;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    eventBuffer: clampInt(value.eventBuffer, 4, 60, defaults.eventBuffer),
    dashDangerSeconds: clampNumber(value.dashDangerSeconds, 0.1, 3, defaults.dashDangerSeconds),
    laserDangerSeconds: clampNumber(value.laserDangerSeconds, 0.1, 3, defaults.laserDangerSeconds),
    repeatSkillPenalty: clampNumber(value.repeatSkillPenalty, 0, 1, defaults.repeatSkillPenalty),
  };
}

function normalizeTrainingMatrix(value = {}) {
  const defaults = AI_CONFIG.trainingMatrix;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    minSamplesForPenalty: clampInt(value.minSamplesForPenalty, 1, 20, defaults.minSamplesForPenalty),
    earlyDeathPenalty: clampNumber(value.earlyDeathPenalty, 0, 100, defaults.earlyDeathPenalty),
    profileSwitchAfterEarlyDeaths: clampInt(value.profileSwitchAfterEarlyDeaths, 1, 20, defaults.profileSwitchAfterEarlyDeaths),
    weaponCooldownRuns: clampInt(value.weaponCooldownRuns, 0, 30, defaults.weaponCooldownRuns),
  };
}

function normalizePerformance(value = {}) {
  const defaults = AI_CONFIG.performance;
  return {
    ...defaults,
    ...value,
    targetAiTickMs: clampNumber(value.targetAiTickMs, 0.25, 20, defaults.targetAiTickMs),
    maxAiTickMs: clampNumber(value.maxAiTickMs, 0.5, 50, defaults.maxAiTickMs),
    riskCacheGrid: clampInt(value.riskCacheGrid, 8, 160, defaults.riskCacheGrid),
    dropClusterRefreshTicks: clampInt(value.dropClusterRefreshTicks, 1, 10, defaults.dropClusterRefreshTicks),
    bossMemoryRefreshTicks: clampInt(value.bossMemoryRefreshTicks, 1, 10, defaults.bossMemoryRefreshTicks),
    degradedCollectLimit: clampInt(value.degradedCollectLimit, 4, 80, defaults.degradedCollectLimit),
  };
}

function normalizeRoutePlanner(value = {}) {
  const defaults = AI_CONFIG.routePlanner;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    samples: clampInt(value.samples, 2, 32, defaults.samples),
    escapeCandidates: clampInt(value.escapeCandidates, 8, 32, defaults.escapeCandidates),
    safeRouteRisk: clampNumber(value.safeRouteRisk, 4, 120, defaults.safeRouteRisk),
    collectRouteRisk: clampNumber(value.collectRouteRisk, 4, 120, defaults.collectRouteRisk),
  };
}

function normalizeThreatMemory(value = {}) {
  const defaults = AI_CONFIG.threatMemory;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    windowSeconds: clampNumber(value.windowSeconds, 1, 20, defaults.windowSeconds),
    maxSnapshots: clampInt(value.maxSnapshots, 20, 300, defaults.maxSnapshots),
    deathWindowSeconds: clampNumber(value.deathWindowSeconds, 1, 20, defaults.deathWindowSeconds),
  };
}

function normalizeBuildEvaluator(value = {}) {
  const defaults = AI_CONFIG.buildEvaluator;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    minWeaponCoverage: clampInt(value.minWeaponCoverage, 1, 6, defaults.minWeaponCoverage),
    bossDpsWeight: clampNumber(value.bossDpsWeight, 0, 3, defaults.bossDpsWeight),
    survivalDeficitWeight: clampNumber(value.survivalDeficitWeight, 0, 3, defaults.survivalDeficitWeight),
    healingDeficitWeight: clampNumber(value.healingDeficitWeight, 0, 3, defaults.healingDeficitWeight),
  };
}

function normalizeDynamicProfile(value = {}) {
  const defaults = AI_CONFIG.dynamicProfile;
  return {
    ...defaults,
    ...value,
    enabled: value.enabled !== false,
    criticalHpRatio: clampNumber(value.criticalHpRatio, 0.1, 0.9, defaults.criticalHpRatio),
    aggressiveHpRatio: clampNumber(value.aggressiveHpRatio, 0.2, 1, defaults.aggressiveHpRatio),
    lowGold: clampInt(value.lowGold, 0, 200, defaults.lowGold),
    farmerMaxWave: clampInt(value.farmerMaxWave, 1, 20, defaults.farmerMaxWave),
  };
}

function normalizeMaxTrainingRuns(value) {
  if (value === Infinity) return Infinity;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "infinite" || text === "unlimited" || text === "forever") return Infinity;
  }
  const number = Number(value);
  if (number === 0) return Infinity;
  return clampInt(value, 1, 9999, AI_CONFIG.maxTrainingRuns);
}

function normalizeHud(value = {}) {
  const defaults = AI_CONFIG.hud;
  return {
    ...defaults,
    ...value,
    showAiPanel: value.showAiPanel !== false,
    showDeathReason: value.showDeathReason !== false,
    showConfigSource: value.showConfigSource !== false,
    showPerfBudget: value.showPerfBudget !== false,
  };
}

function normalizeTelemetry(value = {}) {
  const defaults = AI_CONFIG.telemetry;
  return {
    ...defaults,
    ...value,
    decisionLogInterval: clampNumber(value.decisionLogInterval, 0, 60, defaults.decisionLogInterval),
    performanceLogInterval: clampNumber(value.performanceLogInterval, 1, 60, defaults.performanceLogInterval),
    printSituationOnRunStart: value.printSituationOnRunStart !== false,
    printLoadoutReason: value.printLoadoutReason !== false,
    printBossMemory: value.printBossMemory === true,
  };
}

function normalizeNumberMap(defaults, value, min, max) {
  const output = { ...defaults };
  for (const key of Object.keys(output)) {
    output[key] = clampNumber(value?.[key], min, max, output[key]);
  }
  return output;
}

function deepMerge(base, patch) {
  const output = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    output[key] = isPlainObject(value) && isPlainObject(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function createAbortController() {
  try {
    return typeof AbortController === "function" ? new AbortController() : null;
  } catch {
    return null;
  }
}

function withTimeout(promise, timeoutMs = AI_CONFIG.configReloadTimeoutMs, controller = null) {
  const delay = Math.max(50, Number(timeoutMs) || AI_CONFIG.configReloadTimeoutMs);
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        controller?.abort?.();
      } catch {
        // Ignore abort failures; the timeout rejection is enough.
      }
      reject(new Error(`config_reload_timeout_${delay}ms`));
    }, delay);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
