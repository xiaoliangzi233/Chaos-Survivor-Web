import { TOTAL_WAVES, waveDurationFor } from "../constants.js";
import { input, state, world, resetRun, xpNeedForLevel } from "../state.js";
import {
  ui,
  updateHud,
  updateBestText,
  showChoices,
  hideChoices,
  showPauseMenu,
  hidePauseMenu,
  hideAllOverlays,
  pickThree,
  showEnd,
  loadGameConfig,
  setBootProgress,
  showRunLoading,
  hideRunLoading,
} from "../ui/ui.js";
import { generateMap } from "../systems/map.js";
import { bindInput } from "../systems/input.js";
import { closeInventory, initInventoryUi, isInventoryOpen } from "../ui/inventoryUi.js";
import { closeCodex, initCodexUi, openCodex } from "../ui/codexUi.js";
import { closeShop, initShopUi, openShop } from "../ui/shopUi.js";
import { isBossWave, setupEnemyRegistry } from "../systems/enemyRegistry.js";
import { updatePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, updateCoins, collectAllExperience, collectAllCoins, clearEnemies, anyCombatPlayerAlive } from "../systems/entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon, refreshStarterWeapons } from "../systems/weapons.js";
import { completeWaveItems, consumeNextWaveSpawnBonus, startWaveItems, updateItems, useActiveItem } from "../systems/items.js";
import { updateEasterEggs } from "../systems/easterEggs.js";
import { applyWaveStartScenario, resetWaveScenarioState, updateWaveScenario } from "../systems/waveScenarios.js";
import { createShopState } from "../economy/shop.js";
import * as effects from "../effects.js";
import { updateCamera, viewport } from "../systems/renderer.js";
import { createRenderBackend } from "../systems/renderBackend.js";
import { PreloadCoordinator } from "../systems/preloadCoordinator.js";
import { framePerformance } from "../systems/performanceMonitor.js";
import { monitorRuntimeBudgets } from "../systems/runtimeBudgets.js";
import { populateDeterministicStressScenario, stressScenarioRequested } from "../systems/stressScenario.js";
import { playSfx, startMusic, stopMusic, pauseMusic, resumeMusic, setMusicScene } from "../audio.js";
import { CAMERA_ZOOM } from "../constants.js";
import { difficultyOrder, loadDifficultyProgress, recordDifficultyVictory, selectDifficulty, setupDifficultyConfig } from "../difficulty.js";
import { loadEditableGameData } from "../config/editableGameData.js";
import { initAi, updateAi } from "../ai/aiController.js";
import { loadAiRunConfig, loadAiTrainingModeConfig } from "../ai/aiConfigLoader.js";
import { difficultyCards } from "../difficulty.js";
import {
  configurePlayerProgress,
  consumeLobbyFirstClearReaction,
  loadPlayerProgress,
  queueLobbyFirstClearReactions,
  requirePlayerLogin,
  recordBestSurvivalSeconds,
  recordBestRandomEndlessWave,
  recordAdventureResult,
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
  cancelLobbyPlayerMove,
  cancelLobbyTutorialAutoMove,
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
  startLobbyTutorial,
  updateLobby,
} from "../systems/lobby.js";
import { lobbyScreenToWorld } from "../systems/lobbyRenderer.js";
import {
  closeLobbyDialogue,
  initLobbyUi,
  openLobbyMessage,
  openLobbyTutorialDialogue,
  openNpcDialogue,
  updateLobbyUi,
} from "../ui/lobbyUi.js";
import {
  closeAdventureStats,
  initAdventureStatsUi,
  openAdventureStats,
} from "../ui/adventureStatsUi.js";
import { initCurseUi, openCurseSelection } from "../ui/curseUi.js";
import { closeFeedback, initFeedbackUi, openFeedback } from "../ui/feedbackUi.js";
import { initNicknameUi, requestPlayerNickname } from "../ui/nicknameUi.js";
import {
  bootstrapBackendPlayer,
  isCurrentUserAdmin,
  submitBackendNickname,
} from "../services/backendProgressService.js";

const LEVEL_CHOICE_REFRESH_COST = 10;

export async function bootGame() {
  setBootProgress(6, "正在启动霓虹废墟");
  initInventoryUi();
  initLobbyUi();
  initAdventureStatsUi({
    getDifficulties: difficultyCards,
    onModalChange: (open) => {
      if (state.lobby.active) setLobbyModalOpen(open);
    },
  });
  initFeedbackUi({
    onOpen: () => {
      if (state.lobby.active) setLobbyModalOpen(true);
    },
    onClose: () => {
      if (state.lobby.active) setLobbyModalOpen(false);
    },
  });
  initCodexUi({
    onOpen: () => {
      if (state.lobby.active) setLobbyModalOpen(true);
    },
    onClose: () => {
      if (state.lobby.active) setLobbyModalOpen(false);
    },
  });
  initShopUi({ continueToNextWave: finishWaveTransition });
  initWaveEventUi();
  initNicknameUi();
  initCurseUi();
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
  const gameConfigPromise = loadGameConfig();
  const editableDataPromise = loadEditableGameData();
  const difficultyConfigPromise = setupDifficultyConfig();
  const enemyRegistryPromise = setupEnemyRegistry();
  const aiTrainingPromise = loadAiTrainingModeConfig();
  const aiRunPromise = loadAiRunConfig();
  const runtimeGameConfig = await gameConfigPromise;
  setBootProgress(26, "正在初始化渲染后端");
  const rendererOverride = new URLSearchParams(window.location.search).get("renderer");
  const renderBackend = await createRenderBackend(ui.canvas, rendererOverride || runtimeGameConfig.renderer);
  ui.canvas.dataset.renderer = renderBackend.name;
  const preloadCoordinator = new PreloadCoordinator(renderBackend);
  await preloadCoordinator.initCore((progress, label) => setBootProgress(26 + progress * 12, label));
  window.__survivorRendererStats = () => renderBackend.getStats();
  configurePlayerProgress();
  setBootProgress(40, "正在验证登录身份");
  const authenticatedUser = await requirePlayerLogin();
  if (!authenticatedUser) return;
  setBootProgress(42, "正在初始化玩家档案");
  let backendPlayer = await bootstrapBackendPlayer();
  if (backendPlayer?.needsNickname) {
    setBootProgress(42, "请设置玩家昵称");
    backendPlayer = await requestPlayerNickname({
      username: authenticatedUser.username,
      submitNickname: submitBackendNickname,
    });
    if (!backendPlayer) return;
  }
  setBootProgress(42, "本地进度已就绪");
  setBootProgress(54, "正在加载武器与道具");
  await editableDataPromise;
  refreshStarterWeapons();
  configureLobbyWeapons(STARTER_WEAPONS);
  setBootProgress(66, "正在校准难度曲线");
  await difficultyConfigPromise;
  setBootProgress(72, "正在同步玩家进度");
  await loadPlayerProgress({ difficultyIds: difficultyOrder, backendPlayer });
  loadDifficultyProgress();
  configureLobbyDifficulties(difficultyCards());
  setBootProgress(78, "正在生成敌人档案");
  await enemyRegistryPromise;
  setBootProgress(88, "正在装配智能模块");
  const [aiTrainingMode, aiRunConfig] = await Promise.all([aiTrainingPromise, aiRunPromise]);
  const MAX_FRAME_RATE = 60;
  const FRAME_MS = 1000 / MAX_FRAME_RATE;
  let lastTime = 0;
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let nextStatsPublishAt = 0;
  let debugUi = null;

  function start() {
    if (isHelpOpen()) return;
    closeCodex();
    closeHelp();
    closeAdventureStats();
    closeFeedback();
    closeLobbyDialogue();
    clearWaveEventNotice();
    hideAllOverlays();
    enterLobby({ resetPosition: true });
    const tutorialDialogue = startLobbyTutorial({ source: "auto" });
    if (tutorialDialogue) openLobbyTutorialDialogue(tutorialDialogue);
    setMusicScene("lobby");
    playSfx("select");
  }

  function openAiLoadout() {
    closeCodex();
    closeHelp();
    closeLobbyDialogue();
    closeAdventureStats();
    closeFeedback();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    setMusicScene("battle", { autoplay: false });
    state.mode = "choosingWeapon";
    return true;
  }

  async function startWithLoadout({ difficulty, weapon, runMode = "standard", randomGoal = RANDOM_GOAL_TWENTY_WAVES, curses = [] }) {
    if (!difficulty?.id || !weapon?.id || state.mode === "launching") return false;
    state.lobby.lastLaunchConfig = {
      difficultyId: difficulty.id,
      weaponId: weapon.id,
      runMode: runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : "standard",
      randomGoal: randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES,
      curses: runMode === RUN_MODE_RANDOM ? [...curses] : [],
    };
    closeCodex();
    closeHelp();
    closeAdventureStats();
    closeFeedback();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    setMusicScene("battle", { autoplay: false });
    selectDifficulty(difficulty.id);
    preloadCoordinator.releaseRun();
    const runMap = generateMap();
    resetRun(runMap);
    selectDifficulty(difficulty.id);
    configureRandomModeRun({
      runMode: runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : "standard",
      randomGoal: randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES,
      curses,
    });
    state.waveDuration = isRandomMode() ? randomWaveDurationFor(state.wave) : waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.shop = createShopState();
    state.initialWeaponId = weapon.id;
    activateWeapon(weapon.id);
    state.mode = "launching";
    showRunLoading(0, "正在准备冒险");
    await preloadCoordinator.prepareRun({
      map: runMap,
      difficultyId: difficulty.id,
      weaponId: weapon.id,
      runMode,
    }, (progress, label) => {
      showRunLoading(progress, label || "正在准备冒险");
    });
    hideRunLoading();

    if (state.mode !== "launching") {
      preloadCoordinator.releaseRun();
      return false;
    }
    state.mode = "playing";
    resetWaveScenarioState();
    const scenario = applyWaveStartScenario();
    showWaveEventNotice({ wave: state.wave, scenario, boss: isBossWave(state.wave) });
    playSfx("start");
    startMusic();
    return true;
  }

  function showLevelChoices(playerId = "p1") {
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
        if (!checkLevelUps("p1")) {
          finishPostLevelFlow();
        }
      },
    });
    state.ai.levelPanel = {
      owner: "p1",
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
        if (!checkLevelUps("p1")) finishPostLevelFlow();
        return true;
      },
    };
  }

  function checkLevelUps(playerId = "p1") {
    const p = state.player;
    if (!p) return false;
    if (p.xp < p.xpNeed) return false;
    p.xp -= p.xpNeed;
    p.level++;
    p.xpNeed = xpNeedForLevel(p.level);
    playSfx("level");
    showLevelChoices(playerId);
    return true;
  }

  function completeWave() {
    completeWaveItems();
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
    if (!checkLevelUps("p1")) openShopAfterWave();
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
    const beforeBossWave = isBossWave(nextWaveNumber());
    openShop({ beforeBossWave });
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
    recordCurrentAdventure(victory ? "victory" : "defeat");
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
    if (["playing", "paused", "shop", "leveling"].includes(state.mode)) recordCurrentAdventure("abandoned");
    closeCodex();
    closeHelp();
    closeAdventureStats();
    closeFeedback();
    closeLobbyDialogue();
    clearWaveEventNotice();
    stopMusic();
    preloadCoordinator.releaseRun();
    resetRun(generateMap());
    state.shop = createShopState();
    hideAllOverlays();
    ui.pauseButton.textContent = "II";
    updateBestText();
    configureLobbyDifficulties(difficultyCards());
    enterLobby({ resetPosition: true });
    setMusicScene("lobby");
  }

  function recordCurrentAdventure(outcome) {
    if (state.runStatsRecorded) return false;
    if (state.debug?.runTainted || state.debug?.enabled) {
      state.runStatsRecorded = true;
      return false;
    }
    if (!state.initialWeaponId || state.time <= 0) return false;
    const starter = STARTER_WEAPONS.find((entry) => entry.id === state.initialWeaponId);
    const items = state.inventory?.items || [];
    const saved = recordAdventureResult({
      outcome,
      runMode: state.runMode,
      randomGoal: state.randomGoal,
      curses: state.randomRun?.curses || [],
      curseScore: state.randomRun?.curseScore || 0,
      curseRewardMultiplier: state.randomRun?.curseRewardMultiplier || 1,
      difficultyId: state.difficultyId,
      difficultyName: state.difficulty?.name || state.difficultyId,
      weaponId: state.initialWeaponId,
      weaponName: starter?.name || state.initialWeaponId,
      seconds: Math.floor(state.time),
      wave: state.wave,
      kills: state.kills,
      bossKills: state.bossKills,
      gold: state.gold,
      level: state.player?.level || 1,
      weaponCount: state.inventory?.weaponSlots?.length || 0,
      itemCount: items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0),
    });
    state.runStatsRecorded = Boolean(saved);
    return Boolean(saved);
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
      curses: previous.curses || [],
    });
  }

  async function startRandomWithCurses(config) {
    setLobbyModalOpen(true);
    const curses = await openCurseSelection(config.curses || []);
    setLobbyModalOpen(false);
    if (!curses) {
      playSfx("deny");
      return false;
    }
    return startWithLoadout({ ...config, curses });
  }

  async function startDebugRun({ difficultyId, weaponId, wave = 1 }) {
    if (!difficultyCards().some((entry) => entry.id === difficultyId)) return false;
    if (!STARTER_WEAPONS.some((entry) => entry.id === weaponId)) return false;
    closeCodex();
    closeHelp();
    closeAdventureStats();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    selectDifficulty(difficultyId);
    preloadCoordinator.releaseRun();
    const runMap = generateMap();
    resetRun(runMap);
    selectDifficulty(difficultyId);
    state.shop = createShopState();
    state.initialWeaponId = weaponId;
    state.debug.enabled = true;
    state.debug.unlocked = true;
    state.debug.runTainted = true;
    activateWeapon(weaponId);
    setMusicScene("battle", { autoplay: false });
    state.wave = Math.max(1, Math.min(TOTAL_WAVES, Math.floor(Number(wave) || 1)));
    state.waveDuration = waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.mode = "loadingRun";
    showRunLoading(0, "正在准备调试战场");
    await preloadCoordinator.prepareRun({
      map: runMap,
      difficultyId,
      weaponId,
      runMode: "standard",
    }, showRunLoading);
    hideRunLoading();
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
      if (!isCurrentUserAdmin()) {
        openLobbyMessage({
          role: "ACCESS DENIED // TRIAL AUTHORITY",
          title: "试炼场权限不足",
          speaker: "试炼场门禁",
          text: "当前账号不是管理员，无法打开试炼场调试终端。",
          color: "#ffb347",
        });
        playSfx("deny");
        return true;
      }
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
    if (interaction.action === "recorder") {
      setLobbyModalOpen(true);
      openAdventureStats();
      playSfx("select");
      return true;
    }
    if (interaction.action === "feedback") {
      setLobbyModalOpen(true);
      openFeedback();
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
        title: "居住区尚未开放",
        speaker: "通道管理员 - 赫塔",
        text: "这条舱段还在恢复供能。等基地稳定后，居住区会开放更多互动内容。",
        color: "#77ff8a",
      },
      gene: {
        role: "GENE FORGE // CALIBRATION",
        title: "基因熔炉校准中",
        speaker: "基因工程师 - 罗岚",
        text: "样本库正在重建索引。暂时不要触碰培养槽，除非你想被登记成实验素材。",
        color: "#77ff8a",
      },
      rift: {
        role: "RIFT ANCHOR // STANDBY",
        title: "裂隙锚点待机",
        speaker: "裂隙技师 - 阿衡",
        text: "锚点信号还不稳定。等校准完成后，这里会接入更危险也更有价值的任务。",
        color: "#b48cff",
      },
      "ship-status": {
        role: "TRANSIT ARK // NOMINAL",
        title: "方舟航行状态正常",
        speaker: "舰桥广播",
        text: "外层护盾维持在安全阈值，资源回收队正在返航。继续完成作战任务，可逐步解锁更多舱段。",
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
      ui.canvas.classList.remove("lobby-target-hover");
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
    ui.canvas.classList.toggle("lobby-target-hover", Boolean(target));
    if (!activate) return Boolean(target);
    if (!target) {
      ui.canvas.classList.remove("lobby-target-hover");
      return false;
    }
    cancelLobbyTutorialAutoMove();
    cancelLobbyPlayerMove();
    return handleLobbyInteraction(target.id);
  }

  function update(dt) {
    updateAi(dt);
    if (state.lobby.active) {
      const lobbyEvent = updateLobby(dt);
      if (lobbyEvent?.type === "launch") {
        if (lobbyEvent.config?.runMode === RUN_MODE_RANDOM) startRandomWithCurses(lobbyEvent.config);
        else startWithLoadout(lobbyEvent.config);
      }
      if (lobbyEvent?.type === "tutorial-arrived" && lobbyEvent.dialogue) openLobbyTutorialDialogue(lobbyEvent.dialogue);
      return;
    }
    if (state.mode === "shop") {
      state.time += dt;
      return;
    }
    if (state.mode !== "playing") {
      return;
    }
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
    if (checkLevelUps("p1")) return;
    updateCoins(dt);
    effects.updateAmbientParticles?.(dt, ui.canvas.clientWidth / CAMERA_ZOOM, ui.canvas.clientHeight / CAMERA_ZOOM);
    effects.updateEffects(dt);
    monitorRuntimeBudgets();
    updateCamera(dt);
    if (!anyCombatPlayerAlive()) endGame(false);
    if (!debugFreeze && state.mode === "playing" && bossWave && !world.boss && state.spawnedBossWaves?.has(state.wave)) completeWave();
    if (!debugFreeze && state.mode === "playing" && !bossWave && state.waveTimeLeft <= 0) completeWave();
  }

  let lastRenderError = "";
  let lastRenderErrorAt = 0;

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
    framePerformance.begin("frame", now);
    framePerformance.begin("update", now);
    update(dt);
    framePerformance.end("update");
    try {
      renderBackend.renderFrame();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorAt = performance.now();
      if (message !== lastRenderError || errorAt - lastRenderErrorAt > 1000) {
        lastRenderError = message;
        lastRenderErrorAt = errorAt;
        console.error("[render] 帧渲染异常，已跳过本帧：", error);
      }
    }
    framePerformance.begin("hud");
    updateHud(fps);
    updateLobbyUi();
    updateDebugModeUi();
    framePerformance.end("hud");
    framePerformance.end("frame");
    if (now >= nextStatsPublishAt) {
      const stats = renderBackend.getStats();
      const frameStats = stats.timings?.frame;
      ui.canvas.dataset.frameP50 = (frameStats?.p50 || 0).toFixed(2);
      ui.canvas.dataset.frameP95 = (frameStats?.p95 || 0).toFixed(2);
      ui.canvas.dataset.frameP99 = (frameStats?.p99 || 0).toFixed(2);
      nextStatsPublishAt = now + 1000;
    }
    requestAnimationFrame(loop);
  }

  const resizeGame = () => renderBackend.resize();
  window.addEventListener("resize", resizeGame);
  window.visualViewport?.addEventListener("resize", resizeGame);
  const rootResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(resizeGame)
    : null;
  if (rootResizeObserver && ui.canvas.parentElement) rootResizeObserver.observe(ui.canvas.parentElement);
  let dprQuery = null;
  const handleDprChange = () => {
    if (dprQuery) dprQuery.removeEventListener("change", handleDprChange);
    if (Math.abs((window.devicePixelRatio || 1) - viewport.dpr) > 0.001) resizeGame();
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener?.("change", handleDprChange);
  };
  if (typeof window.matchMedia === "function") handleDprChange();
  bindInput({
    start,
    restart: restartRun,
    togglePause,
    resume: resumeGame,
    returnToMenu: returnToLobby,
    openDebugShop,
    interactLobby: handleLobbyInteraction,
    interactLobbyPointer: (event) => lobbyPointerInteraction(event, true),
    useActiveItem: () => useActiveItem(),
    hoverLobbyPointer: (event) => lobbyPointerInteraction(event, false),
    cancelLobbyAction: () => cancelLobbyLaunch() || cancelLobbyTutorialAutoMove(),
  });
  const menuMap = generateMap();
  resetRun(menuMap);
  await preloadCoordinator.prepareRun({ map: menuMap, runMode: "menu" }, (progress, label) => {
    setBootProgress(88 + progress * 12, label);
  });
  state.shop = createShopState();
  state.mode = "menu";
  setBootProgress(100, "加载完成", { done: true });
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
  if (stressScenarioRequested()) {
    await startDebugRun({ difficultyId: "void_crown", weaponId: "arc", wave: 20 });
    populateDeterministicStressScenario();
  }
  updateBestText();
  requestAnimationFrame(loop);
}
