import { TOTAL_WAVES, waveDurationFor } from "../constants.js";
import { state, world, resetRun } from "../state.js";
import {
  ui,
  updateHud,
  updateBestText,
  showChoices,
  showRunSetup,
  hideRunSetup,
  hideChoices,
  showPauseMenu,
  hidePauseMenu,
  hideAllOverlays,
  pickThree,
  showEnd,
  loadGameConfig,
  setBootProgress,
} from "../ui/ui.js";
import { generateMap } from "../systems/map.js";
import { bindInput } from "../systems/input.js";
import { closeInventory, initInventoryUi, isInventoryOpen } from "../ui/inventoryUi.js";
import { closeCodex, initCodexUi } from "../ui/codexUi.js";
import { closeShop, initShopUi, openShop } from "../ui/shopUi.js";
import { isBossWave, setupEnemyRegistry } from "../systems/enemyRegistry.js";
import { updatePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, updateCoins, collectAllExperience, collectAllCoins, clearEnemies } from "../systems/entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon, refreshStarterWeapons } from "../systems/weapons.js";
import { consumeNextWaveSpawnBonus, startWaveItems, updateItems } from "../systems/items.js";
import { updateEasterEggs } from "../systems/easterEggs.js";
import { applyWaveStartScenario, resetWaveScenarioState, updateWaveScenario } from "../systems/waveScenarios.js";
import { createShopState } from "../economy/shop.js";
import * as effects from "../effects.js";
import { resizeCanvas, updateCamera, render } from "../systems/renderer.js";
import { playSfx, startMusic, stopMusic, pauseMusic, resumeMusic } from "../audio.js";
import { CAMERA_ZOOM } from "../constants.js";
import { difficultyOrder, loadDifficultyProgress, recordDifficultyVictory, selectDifficulty, setupDifficultyConfig } from "../difficulty.js";
import { loadEditableGameData } from "../config/editableGameData.js";
import { initAi, updateAi } from "../ai/aiController.js";
import { loadAiRunConfig, loadAiTrainingModeConfig } from "../ai/aiConfigLoader.js";
import { difficultyCards } from "../difficulty.js";
import { cancelStoryPlayback, initStoryUi, playDifficultyStoryIfNeeded } from "../ui/storyUi.js";
import {
  configurePlayerProgress,
  loadPlayerProgress,
  recordBestSurvivalSeconds,
} from "../systems/playerProgress.js";
import { closeHelp, initHelpUi, isHelpOpen } from "../ui/helpUi.js";
import { clearWaveEventNotice, initWaveEventUi, showWaveEventNotice } from "../ui/waveEventUi.js";
import { initDebugModeUi, updateDebugModeUi } from "../ui/debugModeUi.js";

const LEVEL_CHOICE_REFRESH_COST = 10;

export async function bootGame() {
  const ctx = ui.canvas.getContext("2d", { alpha: false });
  setBootProgress(6, "正在启动霓虹废墟");
  initInventoryUi();
  initCodexUi();
  initShopUi({ continueToNextWave: finishWaveTransition });
  initStoryUi();
  initWaveEventUi();
  initHelpUi({
    onBeforeOpen: () => {
      closeCodex();
    },
  });
  setBootProgress(18, "正在同步版本配置");
  const runtimeGameConfig = await loadGameConfig();
  configurePlayerProgress();
  setBootProgress(42, "本地进度已就绪");
  setBootProgress(54, "正在加载武器与道具");
  await loadEditableGameData();
  refreshStarterWeapons();
  setBootProgress(66, "正在校准难度曲线");
  await setupDifficultyConfig();
  setBootProgress(72, "正在同步玩家进度");
  await loadPlayerProgress({ difficultyIds: difficultyOrder });
  loadDifficultyProgress();
  setBootProgress(78, "正在生成敌人档案");
  await setupEnemyRegistry();
  setBootProgress(88, "正在装配智能模块");
  const aiTrainingMode = await loadAiTrainingModeConfig();
  const aiRunConfig = await loadAiRunConfig();
  setBootProgress(100, "加载完成", { done: true });
  const MAX_FRAME_RATE = 60;
  const FRAME_MS = 1000 / MAX_FRAME_RATE;
  let lastTime = 0;
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function start() {
    if (isHelpOpen()) return;
    closeCodex();
    closeHelp();
    clearWaveEventNotice();
    hideAllOverlays();
    state.mode = "choosingWeapon";
    showRunSetup({
      weapons: STARTER_WEAPONS,
      onConfirm: startWithLoadout,
      onBack: returnToMenu,
    });
    playSfx("select");
  }

  async function startWithLoadout({ difficulty, weapon }) {
    if (!difficulty?.id || !weapon?.id || state.mode === "story") return false;
    closeCodex();
    closeHelp();
    clearWaveEventNotice();
    hideAllOverlays();
    hideRunSetup();
    selectDifficulty(difficulty.id);
    resetRun(generateMap());
    selectDifficulty(difficulty.id);
    state.shop = createShopState();
    state.initialWeaponId = weapon.id;
    activateWeapon(weapon.id);
    state.mode = "story";

    await playDifficultyStoryIfNeeded({
      difficultyId: difficulty.id,
      playerId: "local-dev",
      alwaysPlay: Boolean(runtimeGameConfig.storyAlwaysPlay),
    });

    if (state.mode !== "story") return false;
    state.mode = "playing";
    resetWaveScenarioState();
    const scenario = applyWaveStartScenario();
    showWaveEventNotice({ wave: state.wave, scenario, boss: isBossWave(state.wave) });
    playSfx("start");
    startMusic();
    return true;
  }

  function showLevelChoices() {
    state.mode = "leveling";
    renderLevelChoices(pickThree(UPGRADE_DEFS));
  }

  function renderLevelChoices(items) {
    state.ai ||= {};
    showChoices({
      eyebrow: "LEVEL UP",
      title: "选择一次强化",
      items,
      refresh: {
        label: `刷新选项 - ${LEVEL_CHOICE_REFRESH_COST} 金币`,
        disabled: state.gold < LEVEL_CHOICE_REFRESH_COST,
        onRefresh: () => {
          if (state.gold < LEVEL_CHOICE_REFRESH_COST) {
            playSfx("deny");
            return false;
          }
          state.gold -= LEVEL_CHOICE_REFRESH_COST;
          playSfx("select");
          renderLevelChoices(pickThree(UPGRADE_DEFS));
          return true;
        },
      },
      onPick: (item) => {
        item.apply();
        if (state.ai?.levelPanel) state.ai.levelPanel = null;
        hideChoices();
        state.flash = 0.18;
        if (!checkLevelUps()) {
          finishPostLevelFlow();
        }
      },
    });
    state.ai.levelPanel = {
      items,
      refreshCost: LEVEL_CHOICE_REFRESH_COST,
      refresh: () => {
        if (state.gold < LEVEL_CHOICE_REFRESH_COST) {
          playSfx("deny");
          return false;
        }
        state.gold -= LEVEL_CHOICE_REFRESH_COST;
        playSfx("select");
        renderLevelChoices(pickThree(UPGRADE_DEFS));
        return true;
      },
      pick: (id) => {
        const item = items.find((entry) => entry.id === id) || items[0];
        if (!item) return false;
        item.apply();
        state.ai.levelPanel = null;
        hideChoices();
        state.flash = 0.18;
        if (!checkLevelUps()) finishPostLevelFlow();
        return true;
      },
    };
  }

  function checkLevelUps() {
    const p = state.player;
    if (p.xp < p.xpNeed) return false;
    p.xp -= p.xpNeed;
    p.level++;
    p.xpNeed = Math.floor(p.xpNeed * 1.3 + 14 + p.level * 1.6);
    playSfx("level");
    showLevelChoices();
    return true;
  }

  function completeWave() {
    clearWaveEventNotice();
    resetWaveScenarioState();
    if (isBossWave(state.wave)) state.bossKills++;
    state.waveTimeLeft = 0;
    state.spawnBudget = 0;
    state.pendingVictory = state.wave >= TOTAL_WAVES;
    state.pendingNextWave = !state.pendingVictory;
    collectAllExperience();
    clearEnemies();
    collectAllCoins();
    if (!checkLevelUps()) openShopAfterWave();
  }

  function finishPostLevelFlow() {
    if (state.pendingVictory || state.pendingNextWave) openShopAfterWave();
    else state.mode = "playing";
  }

  function openShopAfterWave() {
    if (state.pendingVictory) return endGame(true);
    if (!state.pendingNextWave) {
      state.mode = "playing";
      return;
    }
    openShop({ beforeBossWave: isBossWave(Math.min(TOTAL_WAVES, state.wave + 1)) });
  }

  function openDebugShop() {
    if (!state.debug?.enabled || !state.debug?.unlocked || !state.player) return false;
    if (state.mode !== "playing") return false;
    if (!state.shop) state.shop = createShopState();
    hidePauseMenu();
    openShop({
      beforeBossWave: isBossWave(Math.min(TOTAL_WAVES, state.wave + 1)),
      manualDebugOpen: true,
    });
    playSfx("select");
    return true;
  }

  function finishWaveTransition() {
    if (state.pendingVictory) return endGame(true);
    if (!state.pendingNextWave) return;
    state.pendingNextWave = false;
    state.wave = Math.min(TOTAL_WAVES, state.wave + 1);
    state.waveDuration = waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.spawnBudget = 0;
    consumeNextWaveSpawnBonus();
    startWaveItems();
    state.mode = "playing";
    const scenario = applyWaveStartScenario();
    showWaveEventNotice({ wave: state.wave, scenario, boss: isBossWave(state.wave) });
    playSfx("wave");
  }

  function endGame(victory) {
    clearWaveEventNotice();
    resetWaveScenarioState();
    state.mode = "ended";
    state.victory = victory;
    if (victory && !state.debug?.runTainted) recordDifficultyVictory();
    if (!state.debug?.runTainted) recordBestSurvivalSeconds(Math.floor(state.time));
    hidePauseMenu();
    closeInventory();
    closeShop();
    showEnd(victory);
    playSfx(victory ? "victory" : "defeat");
    stopMusic();
  }

  function pauseGame() {
    if (isInventoryOpen()) closeInventory();
    if (state.mode !== "playing") return;
    state.mode = "paused";
    ui.pauseButton.textContent = "▶";
    pauseMusic();
    showPauseMenu();
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = "playing";
    ui.pauseButton.textContent = "II";
    hidePauseMenu();
    resumeMusic();
  }

  function togglePause() {
    if (isInventoryOpen()) {
      closeInventory();
      return;
    }
    if (state.mode === "playing") pauseGame();
    else if (state.mode === "paused") resumeGame();
  }

  function returnToMenu() {
    cancelStoryPlayback();
    closeCodex();
    closeHelp();
    clearWaveEventNotice();
    stopMusic();
    resetRun(generateMap());
    state.shop = createShopState();
    state.mode = "menu";
    hideAllOverlays();
    ui.startOverlay.classList.add("active");
    ui.pauseButton.textContent = "II";
    updateBestText();
  }

  function startDebugRun({ difficultyId, weaponId, wave = 1 }) {
    if (!difficultyCards().some((entry) => entry.id === difficultyId)) return false;
    if (!STARTER_WEAPONS.some((entry) => entry.id === weaponId)) return false;
    cancelStoryPlayback();
    closeCodex();
    closeHelp();
    clearWaveEventNotice();
    hideAllOverlays();
    hideRunSetup();
    selectDifficulty(difficultyId);
    resetRun(generateMap());
    selectDifficulty(difficultyId);
    state.shop = createShopState();
    state.initialWeaponId = weaponId;
    activateWeapon(weaponId);
    state.debug.enabled = true;
    state.debug.unlocked = true;
    state.debug.runTainted = true;
    state.wave = Math.max(1, Math.min(TOTAL_WAVES, Math.floor(Number(wave) || 1)));
    state.waveDuration = waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.mode = "playing";
    resetWaveScenarioState();
    startWaveItems();
    const scenario = applyWaveStartScenario();
    showWaveEventNotice({ wave: state.wave, scenario, boss: isBossWave(state.wave) });
    playSfx("start");
    startMusic();
    return true;
  }

  function taintRunForDebug() {
    state.debug.runTainted = true;
  }

  function pauseForDebug() {
    if (state.mode !== "playing") return false;
    pauseGame();
    hidePauseMenu();
    return true;
  }

  function resumeFromDebug() {
    if (state.mode === "paused") resumeGame();
  }

  function update(dt) {
    updateAi(dt);
    if (state.mode === "shop") {
      state.time += dt;
      return;
    }
    if (state.mode !== "playing") return;
    const bossWave = isBossWave(state.wave);
    const debugFreeze = Boolean(state.debug?.enabled);
    state.bossWaveActive = bossWave || Boolean(world.boss);
    state.time += dt;
    if (!bossWave && !debugFreeze) state.waveTimeLeft = Math.max(0, state.waveTimeLeft - dt);
    state.shake = Math.max(0, state.shake - dt * 20);
    state.flash = Math.max(0, state.flash - dt * 3);
    updateItems(dt);
    updatePlayer(dt);
    updateWaveScenario(dt);
    updateEasterEggs(dt);
    if (bossWave || state.waveTimeLeft > 0 || debugFreeze) updateSpawning(dt);
    updateEnemies(dt);
    rebuildGrid();
    updateWeapons(dt);
    updateGems(dt);
    updateCoins(dt);
    effects.updateAmbientParticles?.(dt, ui.canvas.clientWidth / CAMERA_ZOOM, ui.canvas.clientHeight / CAMERA_ZOOM);
    effects.updateEffects(dt);
    updateCamera(dt);
    checkLevelUps();
    if (state.player.hp <= 0) endGame(false);
    if (!debugFreeze && state.mode === "playing" && bossWave && !world.boss && state.spawnedBossWaves?.has(state.wave)) completeWave();
    if (!debugFreeze && state.mode === "playing" && !bossWave && state.waveTimeLeft <= 0) completeWave();
  }

  function loop(now) {
    if (!lastTime) lastTime = now - FRAME_MS;
    const elapsed = now - lastTime;
    if (elapsed < FRAME_MS - 0.5) {
      requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(0.033, elapsed / 1000 || 1 / MAX_FRAME_RATE);
    lastTime = now;
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    update(dt);
    render(ctx);
    updateHud(fps);
    updateDebugModeUi();
    requestAnimationFrame(loop);
  }

  resizeCanvas(ui.canvas, ctx);
  window.addEventListener("resize", () => resizeCanvas(ui.canvas, ctx));
  bindInput({ start, restart: start, togglePause, resume: resumeGame, returnToMenu, openDebugShop });
  resetRun(generateMap());
  state.shop = createShopState();
  state.mode = "menu";
  initDebugModeUi({
    onQuickStart: startDebugRun,
    onTaintRun: taintRunForDebug,
    onPauseForDebug: pauseForDebug,
    onResumeFromDebug: resumeFromDebug,
  });
  initAi({
    clearTrainingOnStartup: aiTrainingMode.clearTrainingOnStartup,
    ignoreStoredEnabled: aiTrainingMode.enabled,
    config: {
      ...aiRunConfig,
      enabled: aiTrainingMode.enabled === true,
    },
    actions: {
      openLoadout: start,
      startWithLoadout,
      restart: start,
      continueToNextWave: finishWaveTransition,
      returnToMenu,
      getLoadoutOptions: () => ({ difficulties: difficultyCards(), weapons: STARTER_WEAPONS }),
    },
  });
  updateBestText();
  requestAnimationFrame(loop);
}
