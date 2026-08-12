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
import { closeShop, initShopUi, openShop, renderShop } from "../ui/shopUi.js";
import { isBossWave, setupEnemyRegistry } from "../systems/enemyRegistry.js";
import { updatePlayer, updateRemotePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, updateCoins, collectAllExperience, collectAllCoins, clearEnemies, anyCombatPlayerAlive } from "../systems/entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon, refreshStarterWeapons } from "../systems/weapons.js";
import { ensurePeerProfile, withPlayerProfile } from "../systems/playerProfiles.js";
import { completeWaveItems, consumeNextWaveSpawnBonus, startWaveItems, updateItems, useActiveItem } from "../systems/items.js";
import { updateEasterEggs } from "../systems/easterEggs.js";
import { applyWaveStartScenario, resetWaveScenarioState, updateWaveScenario } from "../systems/waveScenarios.js";
import { createShopState, prepareShopOffers, purchaseOffer, refreshShopOffers, sellWeaponSlot, toggleOfferLock } from "../economy/shop.js";
import { fuseWeaponSlots } from "../economy/inventory.js";
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
import { cancelStoryPlayback, initStoryUi, playDifficultyStoryIfNeeded } from "../ui/storyUi.js";
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
  setLobbyPlayerMoveTarget,
  updateLobby,
  updateLobbyPeer,
} from "../systems/lobby.js";
import { lobbyScreenToWorld } from "../systems/lobbyRenderer.js";
import {
  closeLobbyDialogue,
  initLobbyUi,
  openLobbyMessage,
  openNpcDialogue,
  updateLobbyUi,
} from "../ui/lobbyUi.js";
import {
  closeAdventureStats,
  initAdventureStatsUi,
  openAdventureStats,
} from "../ui/adventureStatsUi.js";
import { hasPendingJoinInvite, initMultiplayerUi, openMultiplayerPanel, updateMultiplayerUi } from "../ui/multiplayerUi.js";
import { netRuntime, nextLocalInputFrame, isHostAuthority, isGuestMirror, setNetworkStatus } from "../net/netState.js";
import { sendHostSnapshot, sendLocalInput, sendStartRun, sendLobbyAction, sendReadyState } from "../net/multiplayerSession.js";
import { applyHostSnapshot, createStartRunPayload, updateGuestInterpolation } from "../net/snapshot.js";
import { currentPlayerId } from "../services/backendProgressService.js";

const LEVEL_CHOICE_REFRESH_COST = 10;

export async function bootGame() {
  setBootProgress(6, "正在启动霓虹废墟");
  initInventoryUi();
  initLobbyUi();
  initMultiplayerUi({
    onModalChange: (open) => {
      if (state.lobby.active) setLobbyModalOpen(open);
    },
  });
  initAdventureStatsUi({
    getDifficulties: difficultyCards,
    onModalChange: (open) => {
      if (state.lobby.active) setLobbyModalOpen(open);
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
  initShopUi({ continueToNextWave: () => markWaveReady("p1") });
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
  setBootProgress(42, "本地进度已就绪");
  setBootProgress(54, "正在加载武器与道具");
  await editableDataPromise;
  refreshStarterWeapons();
  configureLobbyWeapons(STARTER_WEAPONS);
  setBootProgress(66, "正在校准难度曲线");
  await difficultyConfigPromise;
  setBootProgress(72, "正在同步玩家进度");
  await loadPlayerProgress({ difficultyIds: difficultyOrder });
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
  let nextSnapshotAt = 0;
  let lastSnapshotMode = "";
  let debugUi = null;
  let guestOverlaySignature = "";

  function start() {
    if (isHelpOpen()) return;
    closeCodex();
    closeHelp();
    closeAdventureStats();
    closeLobbyDialogue();
    clearWaveEventNotice();
    hideAllOverlays();
    enterLobby({ resetPosition: true });
    if (hasPendingJoinInvite()) openMultiplayerPanel();
    setMusicScene("lobby");
    playSfx("select");
  }

  function openAiLoadout() {
    closeCodex();
    closeHelp();
    closeLobbyDialogue();
    closeAdventureStats();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    setMusicScene("battle", { autoplay: false });
    state.mode = "choosingWeapon";
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
    closeAdventureStats();
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
    });
    state.waveDuration = isRandomMode() ? randomWaveDurationFor(state.wave) : waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.shop = createShopState();
    state.initialWeaponId = weapon.id;
    activateWeapon(weapon.id);
    if (state.multiplayer?.connected) {
      const peer = ensurePeerProfile();
      const peerWeaponId = state.lobby.selectedPeerWeaponId || weapon.id;
      peer.initialWeaponId = peerWeaponId;
      withPlayerProfile("p2", () => activateWeapon(peerWeaponId));
    }
    if (netRuntime.role === "host") {
      sendStartRun(createStartRunPayload({
        config: { difficulty, weapon, peerWeaponId: state.lobby.selectedPeerWeaponId || weapon.id, runMode, randomGoal },
        map: runMap,
      }));
      publishHostSnapshot(true);
    }
    state.mode = "story";
    let prepareDone = false;
    let storyDone = false;
    let latestProgress = 0;
    let latestLabel = "正在准备战场";
    const preparePromise = preloadCoordinator.prepareRun({
      map: runMap,
      difficultyId: difficulty.id,
      weaponId: weapon.id,
      runMode,
    }, (progress, label) => {
      latestProgress = progress;
      latestLabel = label || latestLabel;
      if (storyDone) showRunLoading(latestProgress, latestLabel);
    }).finally(() => {
      prepareDone = true;
    });
    const storyPromise = playDifficultyStoryIfNeeded({
      difficultyId: difficulty.id,
      playerId: currentPlayerId(),
      alwaysPlay: Boolean(runtimeGameConfig.storyAlwaysPlay),
    }).finally(() => {
      storyDone = true;
      if (!prepareDone) showRunLoading(latestProgress, latestLabel);
    });
    await Promise.all([preparePromise, storyPromise]);
    hideRunLoading();

    if (state.mode !== "story") {
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

  function beginDeferredUpgradePhase() {
    const peerRequired = Boolean(state.multiplayer?.connected && state.players?.p2);
    state.upgradePhase = {
      active: true,
      p1: createDeferredUpgradeTrack(state.player),
      p2: peerRequired ? createDeferredUpgradeTrack(state.players.p2) : { required: false, remaining: 0, choices: [], ready: true },
    };
    state.mode = "leveling";
    renderDeferredUpgradePanel();
    publishHostSnapshot(true);
  }

  function createDeferredUpgradeTrack(player) {
    let remaining = 0;
    while (player && player.xp >= player.xpNeed) {
      player.xp -= player.xpNeed;
      player.level++;
      player.xpNeed = xpNeedForLevel(player.level);
      remaining++;
    }
    const track = { required: true, remaining, choices: [], choiceItems: [], ready: false };
    if (remaining > 0) assignDeferredUpgradeChoices(track);
    return track;
  }

  function assignDeferredUpgradeChoices(track) {
    const items = pickThree(UPGRADE_DEFS);
    track.choices = items.map((item) => item.id);
    track.choiceItems = items.map(({ id, icon, name, stat, amount, desc }) => ({ id, icon, name, stat, amount, desc }));
  }

  function deferredUpgradeTrack(playerId) {
    return state.upgradePhase?.active ? state.upgradePhase[playerId] : null;
  }

  function deferredUpgradeItems(track) {
    return (track?.choices || []).map((id) => UPGRADE_DEFS.find((item) => item.id === id)).filter(Boolean);
  }

  function renderDeferredUpgradePanel() {
    if (isGuestMirror()) return;
    const track = deferredUpgradeTrack("p1");
    if (!track) return;
    const items = deferredUpgradeItems(track);
    const waitingPeer = deferredUpgradeTrack("p2")?.required && !deferredUpgradeTrack("p2")?.ready;
    const title = track.remaining > 0
      ? `选择本波强化（剩余 ${track.remaining} 次）`
      : track.ready
        ? (waitingPeer ? "已就绪，等待 P2 完成强化" : "双方强化已完成")
        : "本波强化完成，确认后进入商店";
    showChoices({
      eyebrow: "WAVE COMPLETE // P1",
      title,
      items,
      refresh: track.remaining > 0 ? {
        label: `刷新选项 - ${LEVEL_CHOICE_REFRESH_COST} 金币`,
        disabled: state.gold < LEVEL_CHOICE_REFRESH_COST,
        onRefresh: () => refreshDeferredUpgrade("p1"),
      } : null,
      confirm: track.remaining === 0 ? {
        label: track.ready ? "已就绪" : "确认强化并就绪",
        disabled: track.ready,
        onConfirm: () => markDeferredUpgradeReady("p1"),
      } : null,
      onPick: (item) => applyDeferredUpgrade("p1", item.id),
    });
    state.ai ||= {};
    state.ai.levelPanel = track.remaining > 0 ? {
      owner: "p1",
      items,
      refreshCost: LEVEL_CHOICE_REFRESH_COST,
      refresh: () => refreshDeferredUpgrade("p1"),
      pick: (id) => applyDeferredUpgrade("p1", id),
    } : null;
  }

  function applyDeferredUpgrade(playerId, upgradeId) {
    const track = deferredUpgradeTrack(playerId);
    if (!track || track.ready || track.remaining <= 0 || !track.choices.includes(upgradeId)) return false;
    const item = UPGRADE_DEFS.find((entry) => entry.id === upgradeId);
    const player = playerId === "p2" ? state.players?.p2 : state.player;
    if (!item || !player) return false;
    item.apply(player);
    track.remaining--;
    track.choices = [];
    track.choiceItems = [];
    if (track.remaining > 0) assignDeferredUpgradeChoices(track);
    state.flash = 0.18;
    playSfx("level");
    if (playerId === "p1") {
      if (track.remaining === 0 && state.ai?.runtime?.enabled) markDeferredUpgradeReady("p1");
      else renderDeferredUpgradePanel();
    }
    publishHostSnapshot(true);
    return true;
  }

  function refreshDeferredUpgrade(playerId) {
    const track = deferredUpgradeTrack(playerId);
    if (!track || track.ready || track.remaining <= 0) return false;
    const player = playerId === "p2" ? state.players?.p2 : state.player;
    const gold = playerId === "p2" ? Number(player?.gold) || 0 : state.gold;
    if (gold < LEVEL_CHOICE_REFRESH_COST) {
      playSfx("deny");
      return false;
    }
    if (playerId === "p2") player.gold = gold - LEVEL_CHOICE_REFRESH_COST;
    else state.gold -= LEVEL_CHOICE_REFRESH_COST;
    assignDeferredUpgradeChoices(track);
    playSfx("select");
    if (playerId === "p1") renderDeferredUpgradePanel();
    publishHostSnapshot(true);
    return true;
  }

  function markDeferredUpgradeReady(playerId) {
    const track = deferredUpgradeTrack(playerId);
    if (!track || track.remaining > 0) return false;
    track.ready = true;
    if (deferredUpgradePhaseComplete()) finishDeferredUpgradePhase();
    else renderDeferredUpgradePanel();
    publishHostSnapshot(true);
    return true;
  }

  function deferredUpgradePhaseComplete() {
    const phase = state.upgradePhase;
    if (!phase?.active || !phase.p1.ready) return false;
    return !state.multiplayer?.connected || !phase.p2.required || phase.p2.ready;
  }

  function finishDeferredUpgradePhase() {
    if (!state.upgradePhase?.active) return false;
    state.upgradePhase.active = false;
    state.ai.levelPanel = null;
    hideChoices();
    openShopAfterWave();
    publishHostSnapshot(true);
    return true;
  }

  function showLevelChoices(playerId = "p1") {
    if (isGuestMirror()) return;
    state.mode = "leveling";
    if (playerId === "p2") {
      state.ai ||= {};
      state.ai.levelPanel = { owner: "p2", items: pickThree(UPGRADE_DEFS), refreshCost: LEVEL_CHOICE_REFRESH_COST };
      hideChoices();
      return;
    }
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
        if (!checkLevelUps("p1") && !checkLevelUps("p2")) {
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
        if (!checkLevelUps("p1") && !checkLevelUps("p2")) finishPostLevelFlow();
        return true;
      },
    };
  }

  function checkLevelUps(playerId = "p1") {
    const p = playerId === "p2" ? state.players?.p2 : state.player;
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
    if (state.multiplayer?.connected) withPlayerProfile("p2", () => completeWaveItems());
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
    beginDeferredUpgradePhase();
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
    state.waveReady = { p1: false, p2: false };
    const beforeBossWave = isBossWave(nextWaveNumber());
    if (state.multiplayer?.connected) {
      withPlayerProfile("p2", () => {
        state.shop = createShopState();
        prepareShopOffers({ preserveLocked: false, beforeBossWave });
      });
    }
    openShop({ beforeBossWave });
    publishHostSnapshot(true);
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
    if (state.multiplayer?.connected) withPlayerProfile("p2", () => startWaveItems());
    state.mode = "playing";
    const scenario = applyWaveStartScenario();
    showWaveEventNotice({ wave: state.wave, scenario, boss: isBossWave(state.wave) });
    playSfx("wave");
  }

  function markWaveReady(playerId) {
    if (!state.pendingNextWave) return false;
    state.waveReady ||= { p1: false, p2: false };
    state.waveReady[playerId] = true;
    if (!state.multiplayer?.connected || (state.waveReady.p1 && state.waveReady.p2)) {
      closeShop();
      finishWaveTransition();
    } else {
      renderShop();
    }
    publishHostSnapshot(true);
    return true;
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
    if (isGuestMirror()) return;
    if (isInventoryOpen()) closeInventory();
    if (state.mode !== "playing") return;
    state.mode = "paused";
    ui.pauseButton.textContent = "▶";
    pauseMusic();
    showPauseMenu();
  }

  function resumeGame() {
    if (isGuestMirror()) return;
    if (state.mode !== "paused") return;
    state.mode = "playing";
    ui.pauseButton.textContent = "II";
    hidePauseMenu();
    resumeMusic();
  }

  function togglePause() {
    if (isGuestMirror()) return;
    if (isInventoryOpen()) {
      closeInventory();
      return;
    }
    if (state.mode === "playing") pauseGame();
    else if (state.mode === "paused") resumeGame();
  }

  function returnToLobby() {
    if (isGuestMirror()) return false;
    if (["playing", "paused", "shop", "leveling"].includes(state.mode)) recordCurrentAdventure("abandoned");
    cancelStoryPlayback();
    closeCodex();
    closeHelp();
    closeAdventureStats();
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
    });
  }

  async function startDebugRun({ difficultyId, weaponId, wave = 1 }) {
    if (!difficultyCards().some((entry) => entry.id === difficultyId)) return false;
    if (!STARTER_WEAPONS.some((entry) => entry.id === weaponId)) return false;
    cancelStoryPlayback();
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

  async function startGuestMirrorRun(payload = {}) {
    const cfg = payload.config || {};
    if (!cfg.difficultyId || !cfg.weaponId) return false;
    cancelStoryPlayback();
    closeCodex();
    closeHelp();
    closeAdventureStats();
    clearWaveEventNotice();
    hideAllOverlays();
    leaveLobby();
    selectDifficulty(cfg.difficultyId);
    preloadCoordinator.releaseRun();
    resetRun(payload.map || generateMap());
    selectDifficulty(cfg.difficultyId);
    configureRandomModeRun({
      runMode: cfg.runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : "standard",
      randomGoal: cfg.randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES,
    });
    state.shop = createShopState();
    state.initialWeaponId = cfg.weaponId;
    activateWeapon(cfg.weaponId);
    const peer = ensurePeerProfile();
    peer.initialWeaponId = cfg.peerWeaponId || cfg.weaponId;
    withPlayerProfile("p2", () => activateWeapon(peer.initialWeaponId));
    state.mode = "loadingRun";
    state.multiplayer.enabled = true;
    state.multiplayer.role = "guest";
    state.multiplayer.connected = true;
    setNetworkStatus("syncing");
    showRunLoading(0, "等待主机同步战场");
    setMusicScene("battle", { autoplay: false });
    return true;
  }

  function syncGuestMirrorUi(snapshot = {}) {
    if (!isGuestMirror()) return;
    const mode = state.mode;
    if (mode === "shop") {
      renderShop();
      ui.shopOverlay?.classList.add("active");
      ui.shopOverlay?.setAttribute("aria-hidden", "false");
    } else {
      closeShop();
    }

    const phase = snapshot.ui?.upgradePhase;
    const guestTrack = phase?.p2;
    const choices = guestTrack?.choices || snapshot.ui?.levelChoices || [];
    const levelOwner = phase ? "p2" : snapshot.ui?.levelOwner || "p1";
    const levelSignature = phase
      ? `p2:${guestTrack?.remaining || 0}:${Boolean(guestTrack?.ready)}:${choices.map((item) => item.id).join(",")}`
      : `${levelOwner}:${choices.map((item) => item.id).join(",")}`;
    if (mode === "leveling" && levelSignature) {
      if (guestOverlaySignature !== `level:${levelSignature}`) {
        showChoices({
          eyebrow: phase ? "WAVE COMPLETE // P2" : levelOwner === "p2" ? "P2 LEVEL UP" : "P1 LEVEL UP",
          title: phase
            ? guestTrack?.remaining > 0
              ? `选择本波强化（剩余 ${guestTrack.remaining} 次）`
              : guestTrack?.ready ? "已就绪，等待 P1" : "本波强化完成，确认后进入商店"
            : "主机正在选择强化",
          items: choices,
          refresh: phase && guestTrack?.remaining > 0 ? {
            label: `刷新选项 - ${LEVEL_CHOICE_REFRESH_COST} 金币`,
            disabled: (state.players?.p2?.gold || 0) < LEVEL_CHOICE_REFRESH_COST,
            onRefresh: () => sendReadyState({ action: "upgradeRefresh" }),
          } : null,
          confirm: phase && guestTrack?.remaining === 0 ? {
            label: guestTrack.ready ? "已就绪" : "确认强化并就绪",
            disabled: guestTrack.ready,
            onConfirm: () => sendReadyState({ action: "upgradeReady" }),
          } : null,
          onPick: (item) => {
            if (phase) sendReadyState({ action: "upgradeChoose", id: item.id });
            else if (levelOwner === "p2") sendShopAction({ action: "upgrade", id: item.id });
          },
        });
        if (!phase && levelOwner !== "p2") for (const button of ui.choiceList?.querySelectorAll("button") || []) button.disabled = true;
        guestOverlaySignature = `level:${levelSignature}`;
      }
    } else {
      hideChoices();
      if (guestOverlaySignature.startsWith("level:")) guestOverlaySignature = "";
    }

    if (mode === "paused") showPauseMenu();
    else hidePauseMenu();

    if (mode === "ended" && guestOverlaySignature !== `end:${state.victory}`) {
      showEnd(state.victory);
      ui.restartButton.disabled = true;
      ui.endLobbyButton.disabled = true;
      guestOverlaySignature = `end:${state.victory}`;
    } else if (mode !== "ended" && guestOverlaySignature.startsWith("end:")) {
      ui.endOverlay?.classList.remove("active");
      ui.endOverlay?.setAttribute("aria-hidden", "true");
      ui.restartButton.disabled = false;
      ui.endLobbyButton.disabled = false;
      guestOverlaySignature = "";
    }
  }

  function taintRunForDebug() {
    state.debug.runTainted = true;
  }

  function nextWaveNumber() {
    return isRandomEndlessMode() ? state.wave + 1 : Math.min(TOTAL_WAVES, state.wave + 1);
  }

  function publishHostSnapshot(force = false) {
    const now = performance.now();
    const modeChanged = lastSnapshotMode !== state.mode;
    if (!isHostAuthority() || (!force && !modeChanged && now < nextSnapshotAt)) return false;
    sendHostSnapshot();
    lastSnapshotMode = state.mode;
    nextSnapshotAt = now + snapshotIntervalForMode();
    return true;
  }

  function snapshotIntervalForMode() {
    if (state.mode === "playing") return 50;
    if (state.lobby.active || state.mode === "lobby") return 90;
    if (state.mode === "shop" || state.mode === "leveling") return 120;
    return 160;
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
    if (isGuestMirror()) {
      const actionId = targetId || state.lobby.nearbyInteractionId;
      if (actionId) sendLobbyAction({ targetId: actionId });
      return Boolean(actionId);
    }
    const interaction = interactWithLobby(targetId);
    if (!interaction) return false;
    if (["weapon-page", "weapon-select", "difficulty", "random-goal", "launch-charge", "pet"].includes(interaction.action)) {
      playSfx("select");
      return true;
    }
    if (interaction.action === "multiplayer") {
      setLobbyModalOpen(true);
      openMultiplayerPanel();
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
    if (interaction.action === "recorder") {
      setLobbyModalOpen(true);
      openAdventureStats();
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
      return setLobbyPlayerMoveTarget(worldPoint.x, worldPoint.y);
    }
    cancelLobbyPlayerMove();
    return handleLobbyInteraction(target.id);
  }

  function update(dt) {
    if (isGuestMirror()) {
      if (state.lobby.active) {
        updateLobby(dt);
        sendLocalInput(nextLocalInputFrame(input));
        return;
      }
      if (state.mode !== "menu") {
        if (state.mode === "playing") updateRemotePlayer(dt, input);
        updateGuestInterpolation(dt);
        sendLocalInput(nextLocalInputFrame(input));
        return;
      }
    }
    updateAi(dt);
    if (state.lobby.active) {
      const lobbyEvent = updateLobby(dt);
      if (isHostAuthority()) updateLobbyPeer(dt, netRuntime.remoteInput);
      publishHostSnapshot();
      if (lobbyEvent?.type === "launch") startWithLoadout(lobbyEvent.config);
      return;
    }
    if (state.mode === "shop") {
      state.time += dt;
      if (!state.multiplayer?.connected && state.waveReady?.p1) finishWaveTransition();
      publishHostSnapshot();
      return;
    }
    if (state.mode !== "playing") {
      if (state.mode === "leveling" && deferredUpgradePhaseComplete()) finishDeferredUpgradePhase();
      publishHostSnapshot();
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
    if (state.multiplayer?.connected) withPlayerProfile("p2", () => updateItems(dt));
    updatePlayer(dt);
    updateWaveScenario(dt);
    updateEasterEggs(dt);
    if (bossWave || state.waveTimeLeft > 0 || debugFreeze) updateSpawning(dt);
    if (isHostAuthority()) updateRemotePlayer(dt, netRuntime.remoteInput);
    updateEnemies(dt);
    rebuildGrid();
    updateWeapons(dt);
    updateGems(dt);
    updateCoins(dt);
    effects.updateAmbientParticles?.(dt, ui.canvas.clientWidth / CAMERA_ZOOM, ui.canvas.clientHeight / CAMERA_ZOOM);
    effects.updateEffects(dt);
    monitorRuntimeBudgets();
    updateCamera(dt);
    if (!anyCombatPlayerAlive()) endGame(false);
    if (!debugFreeze && state.mode === "playing" && bossWave && !world.boss && state.spawnedBossWaves?.has(state.wave)) completeWave();
    if (!debugFreeze && state.mode === "playing" && !bossWave && state.waveTimeLeft <= 0) completeWave();
    publishHostSnapshot();
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
    framePerformance.begin("frame", now);
    framePerformance.begin("update", now);
    update(dt);
    framePerformance.end("update");
    renderBackend.renderFrame();
    framePerformance.begin("hud");
    updateHud(fps);
    updateLobbyUi();
    updateMultiplayerUi();
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

  window.addEventListener("resize", () => renderBackend.resize());
  bindInput({
    start,
    restart: restartRun,
    togglePause,
    resume: resumeGame,
    returnToMenu: returnToLobby,
    openDebugShop,
    interactLobby: handleLobbyInteraction,
    interactLobbyPointer: (event) => lobbyPointerInteraction(event, true),
    useActiveItem: () => !isGuestMirror() && useActiveItem(),
    hoverLobbyPointer: (event) => lobbyPointerInteraction(event, false),
    cancelLobbyAction: cancelLobbyLaunch,
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
  netRuntime.onStartRun = startGuestMirrorRun;
  netRuntime.onSnapshot = (snapshot) => {
    if (!applyHostSnapshot(snapshot)) return;
    if (netRuntime.role === "guest" && netRuntime.status === "syncing" && ["playing", "paused", "shop", "leveling", "ended"].includes(snapshot?.mode)) {
      setNetworkStatus("connected");
      hideRunLoading();
    }
    syncGuestMirrorUi(snapshot);
  };
  netRuntime.onLobbyAction = (payload = {}) => {
    if (!isHostAuthority() || !state.lobby.active || !payload.targetId) return;
    const interaction = interactWithLobby(payload.targetId, { player: state.lobby.peer, allowLaunch: false });
    if (interaction?.denied) playSfx("deny");
    else if (interaction) playSfx("select");
  };
  function handlePeerReadyState(payload = {}) {
    if (!isHostAuthority() || !payload?.action) return;
    if (payload.action === "ready") return markWaveReady("p2");
    if (payload.action === "upgradeChoose" && state.mode === "leveling") return applyDeferredUpgrade("p2", payload.id);
    if (payload.action === "upgradeRefresh" && state.mode === "leveling") return refreshDeferredUpgrade("p2");
    if (payload.action === "upgradeReady" && state.mode === "leveling") return markDeferredUpgradeReady("p2");
    return false;
  }
  netRuntime.onReadyState = handlePeerReadyState;
  netRuntime.onShopAction = (payload = {}) => {
    if (handlePeerReadyState(payload)) return;
    if (!isHostAuthority() || !payload?.action) return;
    if (state.mode !== "shop") return;
    withPlayerProfile("p2", () => {
      if (payload.action === "refresh") refreshShopOffers();
      else if (payload.action === "lock") toggleOfferLock(payload.uid);
      else if (payload.action === "purchase") purchaseOffer(payload.uid);
      else if (payload.action === "fuse") fuseWeaponSlots(payload.uid, payload.materialUid);
      else if (payload.action === "sellWeapon") sellWeaponSlot(payload.uid);
    });
    renderShop();
  };
  if (stressScenarioRequested()) {
    await startDebugRun({ difficultyId: "void_crown", weaponId: "arc", wave: 20 });
    populateDeterministicStressScenario();
  }
  updateBestText();
  requestAnimationFrame(loop);
}
