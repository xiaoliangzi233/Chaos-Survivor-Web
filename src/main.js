import { SAVE_KEY, TOTAL_WAVES, waveDurationFor } from "./constants.js";
import { state, world, resetRun } from "./state.js";
import {
  ui,
  updateHud,
  updateBestText,
  showChoices,
  showWeaponCarousel,
  hideChoices,
  showPauseMenu,
  hidePauseMenu,
  hideAllOverlays,
  pickThree,
  showEnd,
} from "./ui.js";
import { generateMap } from "./map.js";
import { bindInput } from "./input.js";
import { closeInventory, initInventoryUi, isInventoryOpen } from "./inventoryUi.js";
import { isBossWave, setupEnemyRegistry } from "./enemyRegistry.js";
import { updatePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, collectAllExperience, clearEnemies } from "./entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon } from "./weapons.js";
import * as effects from "./effects.js";
import { resizeCanvas, updateCamera, render } from "./renderer.js";
import { playSfx, startMusic, stopMusic, pauseMusic, resumeMusic } from "./audio.js";
import { CAMERA_ZOOM } from "./constants.js";

export async function bootGame() {
  const ctx = ui.canvas.getContext("2d", { alpha: false });
  initInventoryUi();
  await setupEnemyRegistry();
  let lastTime = 0;
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function start() {
    resetRun(generateMap());
    hideAllOverlays();
    showStarterChoices();
    playSfx("start");
    startMusic();
  }

  function showStarterChoices() {
    showWeaponCarousel({
      eyebrow: "STARTER WEAPON",
      title: "选择开局武器",
      items: STARTER_WEAPONS,
      onPick: (item) => {
        activateWeapon(item.id);
        hideChoices();
        state.mode = "playing";
        playSfx("select");
        startMusic();
      },
    });
  }

  function showLevelChoices() {
    state.mode = "leveling";
    showChoices({
      eyebrow: "LEVEL UP",
      title: "选择一次强化",
      items: pickThree(UPGRADE_DEFS),
      onPick: (item) => {
        item.apply();
        hideChoices();
        state.flash = 0.18;
        if (!checkLevelUps()) {
          state.mode = "playing";
          finishWaveTransition();
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
    if (!checkLevelUps()) finishWaveTransition();
  }

  function finishWaveTransition() {
    if (state.pendingVictory) return endGame(true);
    if (!state.pendingNextWave) return;
    state.pendingNextWave = false;
    state.wave = Math.min(TOTAL_WAVES, state.wave + 1);
    state.waveDuration = waveDurationFor(state.wave);
    state.waveTimeLeft = state.waveDuration;
    state.spawnBudget = 0;
    state.mode = "playing";
    playSfx("wave");
  }

  function endGame(victory) {
    state.mode = "ended";
    state.victory = victory;
    const best = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (state.time > best) localStorage.setItem(SAVE_KEY, String(Math.floor(state.time)));
    hidePauseMenu();
    closeInventory();
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
    stopMusic();
    resetRun(generateMap());
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
    updatePlayer(dt);
    if (bossWave || state.waveTimeLeft > 0) updateSpawning(dt);
    updateEnemies(dt);
    rebuildGrid();
    updateWeapons(dt);
    updateGems(dt);
    effects.updateAmbientParticles?.(dt, ui.canvas.clientWidth / CAMERA_ZOOM, ui.canvas.clientHeight / CAMERA_ZOOM);
    effects.updateEffects(dt);
    updateCamera(dt);
    checkLevelUps();
    if (state.player.hp <= 0) endGame(false);
    if (state.mode === "playing" && bossWave && !world.boss && state.spawnedBossWaves?.has(state.wave)) completeWave();
    if (state.mode === "playing" && !bossWave && state.waveTimeLeft <= 0) completeWave();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
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
  state.mode = "menu";
  updateBestText();
  requestAnimationFrame(loop);
}
