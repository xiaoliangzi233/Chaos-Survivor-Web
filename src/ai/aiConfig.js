export const AI_STORAGE_ENABLED_KEY = "pixel-survivor-ai-enabled";

export const AI_CONFIG = {
  enabled: false,
  autoStart: true,
  autoRestart: true,
  reloadBeforeEachRun: true,
  maxTrainingRuns: 50,
  logLevel: "decision",
  storageKey: "pixel-survivor-ai-training",
  tickHz: 20,
  actionCooldown: 0.28,
  restartDelay: 0.8,
  movement: {
    lookAhead: 0.85,
    maxNeighbors: 28,
    queryRadius: 620,
    candidateDirections: 32,
    boundaryPadding: 180,
    stuckSeconds: 1.2,
    riskTolerance: 1,
    greed: 1,
    bossAggression: 1,
  },
  orca: {
    lowRiskCandidates: 16,
    midRiskCandidates: 24,
    highRiskCandidates: 40,
    reuseSafeVelocitySeconds: 0.35,
    maxSolveMs: 3,
    earlyExitRisk: 10,
    earlyExitConstraint: 4,
    earlyExitDot: 0.82,
  },
  economy: {
    minRefreshReserve: 10,
    maxRefreshesPerShop: 2,
    lockAffordableHighValue: true,
  },
  upgrade: {
    survivalMultiplier: 1,
    mobilityMultiplier: 1,
    damageMultiplier: 1,
    economyMultiplier: 1,
  },
  difficultyTraining: {
    enabled: true,
    demotion: {
      earlyDeathWave: 2,
      earlyDeathLimit: 3,
      cooldownRuns: 2,
    },
    promotion: {
      minRuns: 3,
      minWinRate: 0.45,
      minAverageWave: 4,
    },
  },
  weaponTraining: {
    explorationRate: 0.08,
    fallbackWeapons: ["ice", "missile", "arc"],
  },
  situation: {
    enabled: true,
    earlyWave: 3,
    lateWave: 8,
    criticalHpRatio: 0.35,
    lowGold: 25,
    projectilePressureHigh: 0.45,
    surroundedEnemyCount: 8,
  },
  objectiveWeights: {
    survive: 1,
    collect: 0.85,
    bossDamage: 1,
    breakout: 1.25,
    centerReturn: 0.55,
  },
  bossMemory: {
    enabled: true,
    eventBuffer: 12,
    dashDangerSeconds: 0.75,
    laserDangerSeconds: 0.9,
    repeatSkillPenalty: 0.18,
  },
  trainingMatrix: {
    enabled: true,
    minSamplesForPenalty: 2,
    earlyDeathPenalty: 22,
    profileSwitchAfterEarlyDeaths: 2,
    weaponCooldownRuns: 4,
  },
  performance: {
    targetAiTickMs: 2,
    maxAiTickMs: 5,
    riskCacheGrid: 48,
    dropClusterRefreshTicks: 2,
    bossMemoryRefreshTicks: 1,
    degradedCollectLimit: 12,
  },
  routePlanner: {
    enabled: true,
    samples: 8,
    escapeCandidates: 16,
    safeRouteRisk: 28,
    collectRouteRisk: 32,
  },
  threatMemory: {
    enabled: true,
    windowSeconds: 8,
    maxSnapshots: 160,
    deathWindowSeconds: 8,
  },
  buildEvaluator: {
    enabled: true,
    minWeaponCoverage: 2,
    bossDpsWeight: 1.2,
    survivalDeficitWeight: 1.35,
  },
  hud: {
    showAiPanel: true,
    showDeathReason: true,
    showConfigSource: true,
    showPerfBudget: true,
  },
  telemetry: {
    decisionLogInterval: 1,
    performanceLogInterval: 5,
    printSituationOnRunStart: true,
    printLoadoutReason: true,
    printBossMemory: false,
  },
  debugDraw: false,
};

export function readAiEnabled(search = globalThis.location?.search || "", storage = globalThis.localStorage, fallback = AI_CONFIG.enabled, options = {}) {
  try {
    const params = new URLSearchParams(search);
    if (params.get("ai") === "1" || params.get("ai") === "true") return true;
    if (params.get("ai") === "0" || params.get("ai") === "false") return false;
  } catch {
    // Ignore invalid URLSearchParams input in tests or embedded pages.
  }
  if (options.ignoreStorage) return Boolean(fallback);
  try {
    const stored = storage?.getItem(AI_STORAGE_ENABLED_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return Boolean(fallback);
  } catch {
    return Boolean(fallback);
  }
}
