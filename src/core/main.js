import { TOTAL_WAVES, waveDurationFor } from "../constants.js";
import { state, world, resetRun, xpNeedForLevel } from "../state.js";
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
import { closeCodex, initCodexUi, openCodex } from "../ui/codexUi.js";
import { closeShop, initShopUi, openShop } from "../ui/shopUi.js";
import { isBossWave, setupEnemyRegistry } from "../systems/enemyRegistry.js";
import { updatePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, updateCoins, collectAllExperience, collectAllCoins, clearEnemies } from "../systems/entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon, refreshStarterWeapons } from "../systems/weapons.js";
import { consumeNextWaveSpawnBonus, startWaveItems, updateItems } from "../systems/items.js";
import { updateEasterEggs } from "../systems/easterEggs.js";
import { applyWaveStartScenario, resetWaveScenarioState, updateWaveScenario } from "../systems/waveScenarios.js";
import { createShopState } from "../economy/shop.js";
import * as effects from "../effects.js";
import { resizeCanvas, updateCamera, render, viewport } from "../systems/renderer.js";
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
  consumeLobbyFirstClearReaction,
  loadPlayerProgress,
  queueLobbyFirstClearReactions,
  recordBestSurvivalSeconds,
  recordBestRandomEndlessWave,
} from "../systems/playerProgress.js";
import { closeHelp, initHelpUi, isHelpOpen } from "../ui/helpUi.js";
import { clearWaveEventNotice, initWaveEventUi, showWaveEventNotice } from "../ui/waveEventUi.js";
import { initDebugModeUi, updateDebugModeUi } from "../ui/debugModeUi.js";
import {
  RANDOM_GOAL_ENDLESS,
  RANDOM_GOAL_TWENTY_WAVES,
  RUN_MODE_RANDOM,
  configureRandomModeRun,
  isRandomEndlessMode,
  isRandomMode,
  randomModeCompletionReached,
  randomWaveDurationFor,
} from "../systems/randomMode.js";
import {
  cancelLobbyLaunch,
  configureLobbyDifficulties,
  configureLobbyWeapons,
  enterLobby,
  findLobbyInteractionAtWorld,
  interactWithLobby,
  leaveLobby,
  lobbyNpcDialogue,
  selectedLobbyWeapon,
  setLobbyHoveredInteraction,
  setLobbyModalOpen,
  updateLobby,
} from "../systems/lobby.js";
import { lobbyScreenToWorld } from "../systems/lobbyRenderer.js";
import {
  closeLobbyDialogue,
  initLobbyUi,
  openLobbyMessage,
  openNpcDialogue,
  updateLobbyUi,
} from "../ui/lobbyUi.js";

const LEVEL_CHOICE_REFRESH_COST = 10;

export async function bootGame() {
  const ctx = ui.canvas.getContext("2d", { alpha: false });
  setBootProgress(6, "正在启动霓虹废墟");
  initInventoryUi();
  initLobbyUi();
  initCodexUi({
    onOpen: () => {
      if (state.lobby.active) setLobbyModalOpen(true);
    },
    onClose: () => {
      if (state.lobby.active) setLobbyModalOpen(false);
    },
  });
  initShopUi({ continueToNextWave: finishWaveTransition });
  initStoryUi();
  initWaveEventUi();
  initHelpUi({
    onBeforeOpen: () => {
      closeCodex();
    },
    onOpen: () => {
      if (state.lobby.active) setLobbyModalOpen(true);
    },
    onClose: () => {
      if (state.lobby.active) setLobbyModalOpen(false);
    },
  });
  setBootProgress(18, "正在同步版本配置");
  const runtimeGameConfig = await loadGameConfig();
  configurePlayerProgress();
  setBootProgress(42, "本地进度已就绪");
  setBootProgress(54, "正在加载武器与道具");
  await loadEditableGameData();
  refreshStarterWeapons();
  configureLobbyWeapons(STARTER_WEAPONS);
  setBootProgress(66, "正在校准难度曲线");
  await setupDifficultyConfig();
  setBootProgress(72, "正在同步玩家进度");
  await loadPlayerProgress({ difficultyIds: difficultyOrder });
  loadDifficultyProgress();
  configureLobbyDifficulties(difficultyCards());
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
  let debugUi = null;

  function start() {
    if (isHelpOpen()) return;
    closeCodex();
    closeHelp();
    closeLobbyDialogue();
    clearWaveEventNotice();
    hideAllOverlays();
    enterLobby({ resetPosition: true });
    playSfx("select");
  }

  function openAiLoadout() {
    closeCodex();
    closeHelp();
    closeLobbyDialogue();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    state.mode = "choosingWeapon";
    showRunSetup({
      weapons: STARTER_WEAPONS,
      onConfirm: startWithLoadout,
      onBack: returnToLobby,
    });
    return true;
  }

  async function startWithLoadout({ difficulty, weapon, runMode = "standard", randomGoal = RANDOM_GOAL_TWENTY_WAVES }) {
    if (!difficulty?.id || !weapon?.id || state.mode === "story") return false;
    state.lobby.lastLaunchConfig = {
      difficultyId: difficulty.id,
      weaponId: weapon.id,
      runMode: runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : "standard",
      randomGoal: randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES,
    };
    closeCodex();
    closeHelp();
    clearWaveEventNotice();
    hideAllOverlays();
    hideRunSetup();
    leaveLobby();
    selectDifficulty(difficulty.id);
    resetRun(generateMap());
    selectDifficulty(difficulty.id);
    configureRandomModeRun({
      runMode: runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : "standard",
      randomGoal: randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES,
    });
    state.waveDuration = isRandomMode() ? randomWaveDurationFor(state.wave) : waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
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
    p.xpNeed = xpNeedForLevel(p.level);
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
    state.pendingVictory = isRandomMode() ? randomModeCompletionReached(state.wave) : state.wave >= TOTAL_WAVES;
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
    openShop({ beforeBossWave: isBossWave(nextWaveNumber()) });
  }

  function openDebugShop() {
    if (!state.debug?.enabled || !state.debug?.unlocked || !state.player) return false;
    if (state.mode !== "playing") return false;
    if (!state.shop) state.shop = createShopState();
    hidePauseMenu();
    openShop({
      beforeBossWave: isBossWave(nextWaveNumber()),
      manualDebugOpen: true,
    });
    playSfx("select");
    return true;
  }

  function finishWaveTransition() {
    if (state.pendingVictory) return endGame(true);
    if (!state.pendingNextWave) return;
    state.pendingNextWave = false;
    state.wave = isRandomEndlessMode() ? state.wave + 1 : Math.min(TOTAL_WAVES, state.wave + 1);
    state.waveDuration = isRandomMode() ? randomWaveDurationFor(state.wave) : waveDurationFor(state.wave);
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
    if (victory && !state.debug?.runTainted && !isRandomMode()) {
      const result = recordDifficultyVictory();
      if (result?.firstClear && result.difficultyId) {
        queueLobbyFirstClearReactions(result.difficultyId, [
          "guide", "tactician", "statistician", "archivist", "geneticist", "engineer",
          "quartermaster", "story-attendant", "random-attendant", "trial-attendant", "home-attendant",
        ]);
      }
    }
    if (!state.debug?.runTainted) recordBestSurvivalSeconds(Math.floor(state.time));
    if (isRandomEndlessMode() && !state.debug?.runTainted) recordBestRandomEndlessWave(state.wave);
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

  function returnToLobby() {
    cancelStoryPlayback();
    closeCodex();
    closeHelp();
    closeLobbyDialogue();
    clearWaveEventNotice();
    stopMusic();
    resetRun(generateMap());
    state.shop = createShopState();
    hideAllOverlays();
    ui.pauseButton.textContent = "II";
    updateBestText();
    configureLobbyDifficulties(difficultyCards());
    enterLobby({ resetPosition: true });
  }

  function restartRun() {
    const previous = state.lobby.lastLaunchConfig;
    const difficulty = difficultyCards().find((entry) => entry.id === previous?.difficultyId && entry.unlocked !== false);
    const weapon = STARTER_WEAPONS.find((entry) => entry.id === previous?.weaponId);
    if (!difficulty || !weapon) {
      returnToLobby();
      return false;
    }
    return startWithLoadout({
      difficulty,
      weapon,
      runMode: previous.runMode,
      randomGoal: previous.randomGoal,
    });
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
    leaveLobby();
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

  function nextWaveNumber() {
    return isRandomEndlessMode() ? state.wave + 1 : Math.min(TOTAL_WAVES, state.wave + 1);
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

  function handleLobbyInteraction(targetId = null) {
    const interaction = interactWithLobby(targetId);
    if (!interaction) return false;
    if (["weapon-page", "weapon-select", "difficulty", "random-goal", "launch-charge", "pet"].includes(interaction.action)) {
      playSfx("select");
      return true;
    }
    if (interaction.action === "trial") {
      setLobbyModalOpen(true);
      debugUi?.open({ weaponId: selectedLobbyWeapon()?.id });
      playSfx("select");
      return true;
    }
    if (interaction.action === "codex") {
      setLobbyModalOpen(true);
      openCodex();
      playSfx("select");
      return true;
    }
    if (interaction.action === "npc-talk") {
      const dialogue = lobbyNpcDialogue(interaction.npcId);
      if (dialogue && openNpcDialogue(dialogue) && dialogue.firstClearDifficultyId) {
        consumeLobbyFirstClearReaction(interaction.npcId, dialogue.firstClearDifficultyId);
      }
      playSfx("select");
      return true;
    }
    const messages = {
      home: {
        role: "ACCESS DENIED // HABITAT LINK",
        title: "家园通道封锁",
        speaker: "通道管理员 · 赫塔",
        text: "家园区的空间坐标仍在漂移。等稳定锚点修复后，我会重新开放这条通道；现在强行接入只会把你送进墙里。",
        color: "#77ff8a",
      },
      recorder: {
        role: "ADVENTURE LEDGER // OFFLINE",
        title: "冒险记录仪",
        speaker: "统计员 · 米洛",
        text: "记录仪的计数核心还能亮，但统计阵列尚未接回主网。本阶段仅保留设备与值守终端，冒险次数和详细统计不会被读取或写入。",
        color: "#ffd166",
      },
      gene: {
        role: "GENE FORGE // CALIBRATION",
        title: "基因改造器",
        speaker: "生物工程师 · 赛恩",
        text: "培养舱已经完成净化，强化序列却还缺最后一组校准样本。局外强化功能暂未开放，别碰那根绿色导管。",
        color: "#77ff8a",
      },
      rift: {
        role: "RIFT ANCHOR // STANDBY",
        title: "裂隙稳定器",
        speaker: "维护工程师 · 洛克",
        text: "这是给未来远征准备的裂隙锚。外环、相位锁和冷却泵都在待机，本阶段不会产生任何额外功能或战斗加成。",
        color: "#b48cff",
      },
      "ship-status": {
        role: "TRANSIT ARK // NOMINAL",
        title: "霓虹中转舰状态",
        speaker: "星舰任务核心",
        text: "导航、动力、生命维持、医疗、门禁与通讯系统均在运行。家园坐标和远征裂隙锚仍处于校准状态，不会影响当前出击。",
        color: "#42e8ff",
      },
    };
    const message = messages[interaction.action];
    if (message) {
      openLobbyMessage(message);
      playSfx("select");
      return true;
    }
    return false;
  }

  function lobbyPointerInteraction(event, activate = false) {
    if (state.mode !== "lobby" || state.lobby.modalOpen || !event) {
      setLobbyHoveredInteraction(null);
      ui.canvas.style.cursor = "";
      return false;
    }
    const rect = ui.canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) / Math.max(1, rect.width) * viewport.width;
    const screenY = (event.clientY - rect.top) / Math.max(1, rect.height) * viewport.height;
    const worldPoint = lobbyScreenToWorld(screenX, screenY, viewport);
    state.lobby.pointerWorldX = worldPoint.x;
    state.lobby.pointerWorldY = worldPoint.y;
    const target = findLobbyInteractionAtWorld(worldPoint.x, worldPoint.y);
    setLobbyHoveredInteraction(target?.id || null);
    ui.canvas.style.cursor = target ? "pointer" : "";
    if (!activate || !target) return Boolean(target);
    return handleLobbyInteraction(target.id);
  }

  function update(dt) {
    updateAi(dt);
    if (state.lobby.active) {
      const lobbyEvent = updateLobby(dt);
      if (lobbyEvent?.type === "launch") startWithLoadout(lobbyEvent.config);
      return;
    }
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
    updateLobbyUi();
    updateDebugModeUi();
    requestAnimationFrame(loop);
  }

  resizeCanvas(ui.canvas, ctx);
  window.addEventListener("resize", () => resizeCanvas(ui.canvas, ctx));
  bindInput({
    start,
    restart: restartRun,
    togglePause,
    resume: resumeGame,
    returnToMenu: returnToLobby,
    openDebugShop,
    interactLobby: handleLobbyInteraction,
    interactLobbyPointer: (event) => lobbyPointerInteraction(event, true),
    hoverLobbyPointer: (event) => lobbyPointerInteraction(event, false),
    cancelLobbyAction: cancelLobbyLaunch,
  });
  resetRun(generateMap());
  state.shop = createShopState();
  state.mode = "menu";
  debugUi = initDebugModeUi({
    onQuickStart: startDebugRun,
    onTaintRun: taintRunForDebug,
    onPauseForDebug: pauseForDebug,
    onResumeFromDebug: resumeFromDebug,
    onOverlayChange: (open) => {
      if (state.lobby.active) setLobbyModalOpen(open);
    },
  });
  initAi({
    clearTrainingOnStartup: aiTrainingMode.clearTrainingOnStartup,
    ignoreStoredEnabled: aiTrainingMode.enabled,
    config: {
      ...aiRunConfig,
      enabled: aiTrainingMode.enabled === true,
    },
    actions: {
      openLoadout: openAiLoadout,
      startWithLoadout,
      restart: openAiLoadout,
      continueToNextWave: finishWaveTransition,
      returnToMenu: returnToLobby,
      getLoadoutOptions: () => ({
        difficulties: difficultyCards(),
        weapons: STARTER_WEAPONS,
        runModes: ["standard", "random"],
        randomGoals: [RANDOM_GOAL_TWENTY_WAVES, RANDOM_GOAL_ENDLESS],
      }),
    },
  });
  updateBestText();
  requestAnimationFrame(loop);
}
