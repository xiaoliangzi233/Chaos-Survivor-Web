import { SAVE_KEY, TOTAL_WAVES, waveDurationFor } from "../constants.js";
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
import { applyWaveStartScenario, resetWaveScenarioState } from "../systems/waveScenarios.js";
import { createShopState } from "../economy/shop.js";
import * as effects from "../effects.js";
import { resizeCanvas, updateCamera, render } from "../systems/renderer.js";
import { playSfx, startMusic, stopMusic, pauseMusic, resumeMusic } from "../audio.js";
import { CAMERA_ZOOM } from "../constants.js";
import { loadDifficultyProgress, recordDifficultyVictory, selectDifficulty, setupDifficultyConfig } from "../difficulty.js";
import { loadEditableGameData } from "../config/editableGameData.js";

const LEVEL_CHOICE_REFRESH_COST = 10;

export async function bootGame() {
  const ctx = ui.canvas.getContext("2d", { alpha: false });
  initInventoryUi();
  initCodexUi();
  initShopUi({ continueToNextWave: finishWaveTransition });
  await loadGameConfig();
  await loadEditableGameData();
  refreshStarterWeapons();
  await setupDifficultyConfig();
  loadDifficultyProgress();
  await setupEnemyRegistry();
  const MAX_FRAME_RATE = 60;
  const FRAME_MS = 1000 / MAX_FRAME_RATE;
  let lastTime = 0;
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function start() {
    closeCodex();
    hideAllOverlays();
    showRunSetup({
      weapons: STARTER_WEAPONS,
      onConfirm: startWithLoadout,
      onBack: returnToMenu,
    });
    playSfx("select");
  }

  function startWithLoadout({ difficulty, weapon }) {
    closeCodex();
    selectDifficulty(difficulty.id);
    resetRun(generateMap());
    selectDifficulty(difficulty.id);
    state.shop = createShopState();
    hideAllOverlays();
    hideRunSetup();
    state.initialWeaponId = weapon.id;
    activateWeapon(weapon.id);
    state.mode = "playing";
    resetWaveScenarioState();
    applyWaveStartScenario();
    playSfx("start");
    startMusic();
  }

  function showLevelChoices() {
    state.mode = "leveling";
    renderLevelChoices(pickThree(UPGRADE_DEFS));
  }

  function renderLevelChoices(items) {
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
        hideChoices();
        state.flash = 0.18;
        if (!checkLevelUps()) {
          finishPostLevelFlow();
        }
      },
    });
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
    openShop();
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
    applyWaveStartScenario();
    playSfx("wave");
  }

  function endGame(victory) {
    state.mode = "ended";
    state.victory = victory;
    if (victory) recordDifficultyVictory();
    const best = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (state.time > best) localStorage.setItem(SAVE_KEY, String(Math.floor(state.time)));
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
    closeCodex();
    stopMusic();
    resetRun(generateMap());
    state.shop = createShopState();
    state.mode = "menu";
    hideAllOverlays();
    ui.startOverlay.classList.add("active");
    ui.pauseButton.textContent = "II";
    updateBestText();
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    const bossWave = isBossWave(state.wave);
    state.bossWaveActive = bossWave;
    state.time += dt;
    if (!bossWave) state.waveTimeLeft = Math.max(0, state.waveTimeLeft - dt);
    state.shake = Math.max(0, state.shake - dt * 20);
    state.flash = Math.max(0, state.flash - dt * 3);
    updateItems(dt);
    updatePlayer(dt);
    updateEasterEggs(dt);
    if (bossWave || state.waveTimeLeft > 0) updateSpawning(dt);
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
    if (state.mode === "playing" && bossWave && !world.boss && state.spawnedBossWaves?.has(state.wave)) completeWave();
    if (state.mode === "playing" && !bossWave && state.waveTimeLeft <= 0) completeWave();
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
    requestAnimationFrame(loop);
  }

  resizeCanvas(ui.canvas, ctx);
  window.addEventListener("resize", () => resizeCanvas(ui.canvas, ctx));
  bindInput({ start, restart: start, togglePause, resume: resumeGame, returnToMenu });
  resetRun(generateMap());
  state.shop = createShopState();
  state.mode = "menu";
  updateBestText();
  requestAnimationFrame(loop);
}
