import { input, state, world } from "../state.js";
import { difficultyCards } from "../difficulty.js";
import { AI_CONFIG, AI_STORAGE_ENABLED_KEY, readAiEnabled } from "./aiConfig.js";
import { loadAiRunConfig, mergeAiConfig, normalizeAiConfig } from "./aiConfigLoader.js";
import { clearAiTrainingStorage, createAiRuntime, createTrainingState, inferRunFailure, loadAiTraining, pushAiEvent, saveAiTraining, recordRunResult, recordShopAction, recordUpgrade } from "./aiState.js";
import { planMovement } from "./movementPlanner.js";
import { chooseOpeningLoadout, chooseUpgrade, shouldRefreshUpgradeChoices } from "./progressionStrategy.js";
import { decideShopActions } from "./shopStrategy.js";
import { aiLog, markPerf, maybeLogPerf, nowMs } from "./telemetry.js";
import { exportTrainingSummary } from "./trainingExport.js";
import { beginAiTick } from "./aiTickCache.js";
import { classifySituation } from "./situationModel.js";
import { updateBossMemory } from "./bossStrategy.js";
import { inferThreatMemoryDeathReason, recordThreatSnapshot, summarizeThreatMemory } from "./threatMemory.js";
import { canFuseWeapons, findFuseCandidate, fuseWeaponSlots } from "../economy/inventory.js";
import { purchaseOffer, refreshCost, refreshShopOffers, shopOffers, toggleOfferLock } from "../economy/shop.js";
import { closeShop, renderShop } from "../ui/shopUi.js";

let config = normalizeAiConfig(AI_CONFIG);
let actions = {};
let training = null;

export function initAi(options = {}) {
  actions = options.actions || {};
  config = mergeAiConfig(config, options.config || {});
  if (options.clearTrainingOnStartup !== false) {
    const removed = clearAiTrainingStorage(undefined, config.storageKey);
    training = createTrainingState();
    aiLog(config, "training_reset", { reason: "startup", removed }, "summary");
  } else {
    training = loadAiTraining(undefined, config.storageKey);
  }
  state.ai ||= {};
  state.ai.runtime = createAiRuntime(state.ai.runtime || {});
  state.ai.training = training;
  state.ai.config = config;
  state.ai.runtime.configSource = {
    aiTrainingConfigEnabled: options.config?.enabled === true,
    aiRunConfigProfile: config.profile || "balanced",
    ignoredStoredEnabled: options.ignoreStoredEnabled === true,
  };
  setAiEnabled(readAiEnabled(undefined, undefined, config.enabled, { ignoreStorage: options.ignoreStoredEnabled === true }), false);
  aiLog(config, "startup", {
    enabled: state.ai.runtime.enabled,
    trainingConfig: options.config?.enabled === true,
    profile: config.profile,
    ignoreStored: options.ignoreStoredEnabled === true,
  }, "summary");
  exposeDebugApi();
}

export function updateAi(dt) {
  const runtime = ensureRuntime();
  if (!runtime.enabled) return;
  runtime.actionCooldown = Math.max(0, runtime.actionCooldown - dt);
  updateDamageMemory(runtime, dt);
  maybeLogPerf(config, runtime);

  if (state.mode !== "playing") {
    clearAiInput();
    handleUiMode(runtime, dt);
    return;
  }

  runtime.tickAccumulator += dt;
  const interval = 1 / Math.max(1, config.tickHz || 20);
  if (runtime.tickAccumulator < interval && runtime.lastVelocity) {
    applyVelocity(runtime.lastVelocity);
    return;
  }
  runtime.tickAccumulator = 0;
  const tickCache = beginAiTick(runtime, config);
  const situation = classifySituation({ state, world, runtime, config });
  runtime.situation = situation;
  tickCache.situation = situation;
  if (world.boss) {
    const memory = updateBossMemory(runtime, state, world, config);
    if (memory && config.telemetry?.printBossMemory && memory.lastMode !== runtime.lastLoggedBossMode) {
      runtime.lastLoggedBossMode = memory.lastMode;
      aiLog(config, "boss_memory", { mode: memory.lastMode, repeated: memory.repeatedModeCount, dangerUntil: memory.dangerUntil }, "debug");
    }
  }
  if (situation.objective !== runtime.lastLoggedObjective) {
    runtime.lastLoggedObjective = situation.objective;
    aiLog(config, "situation", {
      objective: situation.objective,
      pressure: situation.pressure,
      survival: situation.survival,
      position: situation.position,
    }, "decision");
  }
  const started = nowMs();
  const plan = planMovement({ state, world, runtime, config });
  const elapsed = markPerf(runtime, "movementPlanMs", started);
  adjustBudget(runtime, elapsed);
  runtime.debugThreats = plan.threats || [];
  runtime.lastPlanRisk = plan.risk || 0;
  runtime.lastThreatCount = runtime.debugThreats.length;
  recordThreatSnapshot(runtime, { state, world, plan, config });
  if (plan.target?.kind !== runtime.lastLoggedTarget) {
    runtime.lastLoggedTarget = plan.target?.kind;
    pushAiEvent(runtime, { type: "target", targetKind: plan.target?.kind, time: state.time });
    aiLog(config, "target", { kind: plan.target?.kind, risk: plan.risk }, "debug");
  }
  applyVelocity(plan.velocity);
}

export function setAiEnabled(enabled, persist = true) {
  const runtime = ensureRuntime();
  runtime.enabled = Boolean(enabled);
  config.enabled = runtime.enabled;
  if (!runtime.enabled) clearAiInput();
  if (persist) {
    try {
      localStorage.setItem(AI_STORAGE_ENABLED_KEY, runtime.enabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }
  aiLog(config, runtime.enabled ? "enabled" : "disabled", {}, "summary");
}

function handleUiMode(runtime, dt) {
  if (state.mode === "choosingWeapon" && runtime.restartRequested) {
    runtime.actionCooldown = 0;
    return void chooseAndStartRun(runtime);
  }
  if (runtime.actionCooldown > 0) return;
  if (state.mode === "menu") return void chooseAndStartRun(runtime);
  if (state.mode === "choosingWeapon") return void chooseAndStartRun(runtime);
  if (state.mode === "leveling") return handleLeveling(runtime);
  if (state.mode === "shop") return handleShop(runtime);
  if (state.mode === "ended") return handleEnded(runtime, dt);
}

async function chooseAndStartRun(runtime) {
  if (!config.autoStart) return;
  if (runtime.pendingConfigReload) return;
  runtime.pendingConfigReload = true;
  try {
    if (state.mode === "menu" && typeof actions.openLoadout === "function") {
      actions.openLoadout();
    }
    if (state.mode === "choosingWeapon" && !state.ai?.loadoutPanel) {
      aiLog(config, "loadout_panel_missing", { fallback: typeof actions.startWithLoadout === "function" }, "summary");
    }
    await reloadConfigForNextRun(runtime);
    const options = actions.getLoadoutOptions?.() || {};
    const loadout = chooseOpeningLoadout({
      training,
      difficulties: options.difficulties || difficultyCards(),
      weapons: options.weapons || [],
      config,
    });
    if (!loadout.difficulty || !loadout.weapon) return;
    if (!startSelectedLoadout(runtime, loadout)) return;
  } finally {
    runtime.pendingConfigReload = false;
  }
}

function startSelectedLoadout(runtime, loadout) {
  const panel = state.ai?.loadoutPanel;
  const usingPanel = state.mode === "choosingWeapon" && panel;
  let selected = loadout;
  if (usingPanel) {
    selected = selectLoadoutFromPanel(panel, loadout);
    if (!selected || !panel.confirm?.()) {
      runtime.actionCooldown = 0.15;
      aiLog(config, "start_blocked", {
        reason: "loadout_panel",
        preferredDifficulty: loadout.difficulty?.id || "",
        preferredWeapon: loadout.weapon?.id || "",
        panelSelection: panel.getSelection?.() || null,
      }, "summary");
      return false;
    }
  } else if (typeof actions.startWithLoadout === "function") {
    actions.startWithLoadout({ difficulty: selected.difficulty, weapon: selected.weapon });
  } else {
    aiLog(config, "start_blocked", { reason: "missing_start_action" }, "summary");
    return false;
  }
  runtime.runRecorded = false;
  runtime.restartRequested = false;
  runtime.shopRefreshesUsed = 0;
  runtime.upgradeRefreshesUsed = 0;
  runtime.actionCooldown = config.actionCooldown;
  aiLog(config, "start", { difficulty: selected.difficulty.id, weapon: selected.weapon.id, profile: config.profile });
  return true;
}

function selectLoadoutFromPanel(panel, preferred) {
  const preferredDifficultyId = preferred.difficulty?.id || "";
  const preferredWeaponId = preferred.weapon?.id || "";
  let difficulty = preferred.difficulty;
  let weapon = preferred.weapon;
  let difficultySelected = Boolean(preferredDifficultyId && panel.selectDifficulty?.(preferredDifficultyId));
  if (!difficultySelected) {
    difficulty = (panel.difficulties || []).find((item) => item?.unlocked) || null;
    difficultySelected = Boolean(difficulty?.id && panel.selectDifficulty?.(difficulty.id));
  }
  let weaponSelected = Boolean(preferredWeaponId && panel.selectWeapon?.(preferredWeaponId));
  if (!weaponSelected) {
    weapon = (panel.weapons || []).find((item) => item?.id) || null;
    weaponSelected = Boolean(weapon?.id && panel.selectWeapon?.(weapon.id));
  }
  if (!difficultySelected || !weaponSelected || !difficulty || !weapon) return null;
  if (difficulty.id !== preferredDifficultyId || weapon.id !== preferredWeaponId) {
    aiLog(config, "loadout_fallback", {
      preferredDifficulty: preferredDifficultyId,
      selectedDifficulty: difficulty.id,
      preferredWeapon: preferredWeaponId,
      selectedWeapon: weapon.id,
    }, "summary");
  }
  return { difficulty, weapon };
}

async function reloadConfigForNextRun(runtime) {
  if (config.reloadBeforeEachRun === false) return;
  const previousEnabled = runtime.enabled;
  const previousLogLevel = config.logLevel;
  const next = await loadAiRunConfig();
  config = mergeAiConfig(AI_CONFIG, next);
  config.enabled = previousEnabled;
  if (previousLogLevel && !next.logLevel) config.logLevel = previousLogLevel;
  state.ai.config = config;
  runtime.configSource = {
    ...(runtime.configSource || {}),
    aiRunConfigProfile: config.profile || "balanced",
    aiRunConfigError: config.configLoadError || "",
  };
  aiLog(config, "config_reload", {
    profile: config.profile,
    difficultyTraining: config.difficultyTraining?.enabled !== false,
    maxTrainingRuns: config.maxTrainingRuns,
    error: config.configLoadError || "",
  }, config.configLoadError ? "summary" : "decision");
}

function handleLeveling(runtime) {
  const panel = state.ai?.levelPanel;
  if (!panel?.items?.length || typeof panel.pick !== "function") return;
  const context = {
    projectilePressure: Math.min(1, world.enemyProjectiles.length / 32),
    recentDamage: runtime.recentDamage || 0,
    surrounded: runtime.currentTarget?.kind === "breakout",
    bossActive: Boolean(world.boss),
    lowDamage: state.kills < Math.max(8, state.time * 0.1),
    shortRange: mainWeaponRange() < 600,
    situation: runtime.situation,
  };
  const decision = chooseUpgrade({ player: state.player, state, items: panel.items, context, training, config });
  if (!decision) return;
  if (panel.refresh && shouldRefreshUpgradeChoices({
    bestScore: decision.score,
    gold: state.gold,
    refreshCost: panel.refreshCost || 10,
    refreshesUsed: runtime.upgradeRefreshesUsed || 0,
    reserveGold: config.economy.minRefreshReserve,
    situation: runtime.situation,
    training,
    items: panel.items,
    config,
  })) {
    runtime.upgradeRefreshesUsed = (runtime.upgradeRefreshesUsed || 0) + 1;
    runtime.actionCooldown = config.actionCooldown;
    aiLog(config, "upgrade_refresh", { cost: panel.refreshCost, reason: "weak_choices" });
    pushAiEvent(runtime, { type: "upgrade_refresh", cost: panel.refreshCost, time: state.time });
    panel.refresh();
    return;
  }
  runtime.actionCooldown = config.actionCooldown;
  recordUpgrade(training, decision.item.id);
  pushAiEvent(runtime, { type: "upgrade", id: decision.item.id, score: decision.score, time: state.time });
  saveAiTraining(training, undefined, config.storageKey);
  aiLog(config, "upgrade_pick", { id: decision.item.id, score: decision.score, reason: decision.reason });
  panel.pick(decision.item.id);
}

function handleShop(runtime) {
  fuseExistingWeapons(runtime);
  const offers = shopOffers();
  const decision = decideShopActions({
    offers,
    player: state.player,
    inventory: state.inventory,
    state,
    refreshCost: refreshCost(),
    refreshesUsed: runtime.shopRefreshesUsed || 0,
    config: config.economy,
    situation: runtime.situation,
  });
  for (const action of decision) {
    if (action.type === "buy") {
      const result = purchaseOffer(action.uid, action.fuseWeaponUid ? { fuseWeaponUid: action.fuseWeaponUid } : {});
      runtime.actionCooldown = config.actionCooldown;
      if (result.ok) {
        recordShopAction(training, `buy:${action.uid}`);
        saveAiTraining(training, undefined, config.storageKey);
        renderShop?.();
        pushAiEvent(runtime, { type: "shop_buy", uid: action.uid, score: action.score, time: state.time });
        aiLog(config, "shop_buy", { uid: action.uid, score: action.score, reason: action.reason });
        return;
      }
    } else if (action.type === "lock") {
      if (toggleOfferLock(action.uid)) {
        runtime.actionCooldown = config.actionCooldown;
        renderShop?.();
        pushAiEvent(runtime, { type: "shop_lock", uid: action.uid, score: action.score, time: state.time });
        aiLog(config, "shop_lock", { uid: action.uid, score: action.score, reason: action.reason });
        return;
      }
    } else if (action.type === "refresh") {
      if (refreshShopOffers()) {
        runtime.shopRefreshesUsed = (runtime.shopRefreshesUsed || 0) + 1;
        runtime.actionCooldown = config.actionCooldown;
        renderShop?.();
        pushAiEvent(runtime, { type: "shop_refresh", cost: action.cost, time: state.time });
        aiLog(config, "shop_refresh", { cost: action.cost, reason: action.reason });
        return;
      }
    } else if (action.type === "continue") {
      runtime.actionCooldown = config.actionCooldown;
      runtime.shopRefreshesUsed = 0;
      aiLog(config, "shop_continue", { gold: state.gold, wave: state.wave });
      pushAiEvent(runtime, { type: "shop_continue", gold: state.gold, wave: state.wave, time: state.time });
      closeShop();
      actions.continueToNextWave?.();
      return;
    }
  }
}

function handleEnded(runtime, dt) {
  if (!runtime.runRecorded) {
    runtime.runRecorded = true;
    training = recordRunResult(training, {
      victory: state.victory,
      time: state.time,
      kills: state.kills,
      gold: state.gold,
      level: state.player?.level,
      weaponId: state.initialWeaponId,
      difficultyId: state.difficultyId,
      wave: state.wave,
      profile: config.profile,
      stuckEvents: runtime.stuckEvents,
      deathReason: inferThreatMemoryDeathReason(runtime, { config }) || inferRunFailure(runtime, state, world),
      deathWindow: summarizeThreatMemory(runtime, { config }),
    });
    state.ai.training = training;
    saveAiTraining(training, undefined, config.storageKey);
    aiLog(config, "run_summary", { runs: training.totalRuns, victory: state.victory, time: state.time, kills: state.kills, gold: state.gold }, "summary");
    runtime.restartTimer = config.restartDelay;
  }
  if (!config.autoRestart) {
    aiLog(config, "restart_blocked", { reason: "autoRestart_false" }, "summary");
    return;
  }
  if (training.totalRuns >= config.maxTrainingRuns) {
    aiLog(config, "restart_blocked", { reason: "maxTrainingRuns", runs: training.totalRuns, max: config.maxTrainingRuns }, "summary");
    return;
  }
  runtime.restartTimer = Math.max(0, (runtime.restartTimer ?? config.restartDelay) - dt);
  if (runtime.restartTimer <= 0) {
    if (runtime.restartRequested) return;
    runtime.restartRequested = true;
    runtime.actionCooldown = config.actionCooldown;
    aiLog(config, "restart", { runs: training.totalRuns, delay: config.restartDelay }, "summary");
    if (typeof actions.restart === "function") {
      actions.restart();
      if (state.mode === "choosingWeapon") {
        runtime.actionCooldown = 0;
        void chooseAndStartRun(runtime);
      }
      return;
    }
    void chooseAndStartRun(runtime);
  }
}

/*
 * The functions below are intentionally kept after the game-flow handlers.
 * They are shared by movement, progression, shop, and training summary logic.
 */

function fuseExistingWeapons(runtime) {
  for (const slot of state.inventory?.weaponSlots || []) {
    const material = findFuseCandidate(slot);
    if (material && canFuseWeapons(slot, material).ok && fuseWeaponSlots(slot.uid, material.uid)) {
      runtime.actionCooldown = config.actionCooldown;
      aiLog(config, "shop_fuse", { weapon: slot.id, quality: slot.quality });
      renderShop?.();
      return true;
    }
  }
  return false;
}

function applyVelocity(velocity) {
  const p = state.player;
  if (!p) return;
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;
  const speed = Math.max(1, p.speed || 200);
  input.vx = clamp((velocity.x || 0) / speed, -1, 1);
  input.vy = clamp((velocity.y || 0) / speed, -1, 1);
}

function clearAiInput() {
  input.vx = 0;
  input.vy = 0;
}

function updateDamageMemory(runtime, dt) {
  const p = state.player;
  if (!p) return;
  if (runtime.lastHp == null) runtime.lastHp = p.hp;
  if (p.hp < runtime.lastHp) {
    const amount = runtime.lastHp - p.hp;
    runtime.recentDamage = (runtime.recentDamage || 0) + amount;
    runtime.lastDamageSourceKind = inferDamageSourceKind();
    pushAiEvent(runtime, { type: "damage", sourceKind: runtime.lastDamageSourceKind, amount, time: state.time });
  }
  runtime.recentDamage = Math.max(0, (runtime.recentDamage || 0) - dt * 4);
  runtime.lastHp = p.hp;
}

function mainWeaponRange() {
  let best = 0;
  for (const weapon of Object.values(state.weapons || {})) {
    if ((weapon.level || 0) > 0) best = Math.max(best, weapon.range || weapon.attackRange || weapon.acquireRange || 0);
  }
  return best + (state.player?.attackRangeBonus || 0);
}

function ensureRuntime() {
  state.ai ||= {};
  state.ai.runtime ||= createAiRuntime();
  state.ai.config = config;
  return state.ai.runtime;
}

function exposeDebugApi() {
  globalThis.survivorAi = {
    enable: () => setAiEnabled(true),
    disable: () => setAiEnabled(false),
    status: () => ({ enabled: ensureRuntime().enabled, mode: state.mode, target: ensureRuntime().currentTarget, budgetLevel: ensureRuntime().budgetLevel || 0, training }),
    exportTraining: () => exportTrainingSummary(training),
    configure: (patch) => {
      config = mergeAiConfig(config, patch || {});
      state.ai.config = config;
      return globalThis.survivorAi.status();
    },
  };
}

function adjustBudget(runtime, elapsed) {
  runtime.budgetLevel ||= 0;
  if (elapsed > 7) runtime.budgetLevel = Math.min(3, runtime.budgetLevel + 1);
  else if (elapsed < 2.2) runtime.budgetLevel = Math.max(0, runtime.budgetLevel - 1);
}

function inferDamageSourceKind() {
  const p = state.player;
  if (!p) return "pressure";
  for (const h of world.hazards || []) {
    const r = (h.triggerRadius || h.r || 0) + p.r;
    if ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= r * r) return "hazard";
  }
  for (const b of world.enemyProjectiles || []) {
    const r = (b.r || 0) + p.r + 18;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= r * r) return "projectile";
  }
  for (const e of world.enemies || []) {
    const r = (e.r || 0) + p.r + 10;
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r) return e.boss ? "boss" : "enemy";
  }
  return "pressure";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
