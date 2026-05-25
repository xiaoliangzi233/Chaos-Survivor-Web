import { SAVE_KEY, TOTAL_WAVES, waveDurationFor } from "./constants.js";
import { state, world, resetRun } from "./state.js";
import { ui, updateHud, updateBestText, showChoices, hideChoices, pickThree, showEnd } from "./ui.js";
import { generateMap } from "./map.js";
import { bindInput } from "./input.js";
import { setupEnemyRegistry } from "./enemyRegistry.js";
import { updatePlayer, updateSpawning, updateEnemies, rebuildGrid, updateGems, collectAllExperience, clearEnemies } from "./entities.js";
import { updateWeapons, STARTER_WEAPONS, UPGRADE_DEFS, activateWeapon } from "./weapons.js";
import { updateEffects } from "./effects.js";
import { resizeCanvas, updateCamera, render } from "./renderer.js";
import { playTone } from "./audio.js";

export async function bootGame() {
  await setupEnemyRegistry();
  const ctx = ui.canvas.getContext("2d", { alpha: false });
  let lastTime = 0;
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function start() {
    resetRun(generateMap());
    ui.startOverlay.classList.remove("active");
    ui.endOverlay.classList.remove("active");
    showStarterChoices();
    playTone(180, 0.04, "square");
  }

  function showStarterChoices() {
    showChoices({
      eyebrow: "STARTER WEAPON",
      title: "选择开局武器",
      items: pickThree(STARTER_WEAPONS),
      onPick: (item) => {
        activateWeapon(item.id);
        hideChoices();
        state.mode = "playing";
        playTone(360, 0.08, "triangle");
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
    p.xpNeed = Math.floor(p.xpNeed * 1.22 + 8);
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
  }

  function endGame(victory) {
    state.mode = "ended";
    state.victory = victory;
    const best = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (state.time > best) localStorage.setItem(SAVE_KEY, String(Math.floor(state.time)));
    showEnd(victory);
    playTone(victory ? 520 : 120, 0.12, "sawtooth");
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      ui.pauseButton.textContent = "▶";
    } else if (state.mode === "paused") {
      state.mode = "playing";
      ui.pauseButton.textContent = "II";
    }
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    state.time += dt;
    state.waveTimeLeft = Math.max(0, state.waveTimeLeft - dt);
    state.shake = Math.max(0, state.shake - dt * 20);
    state.flash = Math.max(0, state.flash - dt * 3);
    updatePlayer(dt);
    if (state.waveTimeLeft > 0) updateSpawning(dt);
    updateEnemies(dt);
    rebuildGrid();
    updateWeapons(dt);
    updateGems(dt);
    updateEffects(dt);
    updateCamera(dt);
    checkLevelUps();
    if (state.player.hp <= 0) endGame(false);
    if (state.mode === "playing" && state.waveTimeLeft <= 0) completeWave();
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
  bindInput({ start, restart: start, togglePause });
  resetRun(generateMap());
  state.mode = "menu";
  updateBestText();
  requestAnimationFrame(loop);
}
