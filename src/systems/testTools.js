// Test/debug tools — change false to true below to enable test features
const ENABLED = true;

import { state } from "../state.js";
import { clearEnemies } from "./entities.js";
import { isBossWave } from "./enemyRegistry.js";

let completeWaveFn = null;
let finishWaveTransitionFn = null;

export function initTestTools({ completeWave, finishWaveTransition }) {
  if (!ENABLED) return;
  completeWaveFn = completeWave;
  finishWaveTransitionFn = finishWaveTransition;
  document.addEventListener("keydown", handleTestKey, { capture: true });
  console.log("[TestTools] test tools enabled — O=skip wave, I=+500 gold");
}

function handleTestKey(event) {
  if (event.repeat || event.__survivorHandled) return;

  if (event.code === "KeyO") {
    event.preventDefault();
    event.stopPropagation();
    event.__survivorHandled = true;
    handleSkipWave();
    return;
  }

  if (event.code === "KeyI") {
    event.preventDefault();
    event.stopPropagation();
    event.__survivorHandled = true;
    handleAddGold();
    return;
  }
}

function handleSkipWave() {
  if (state.mode === "paused") {
    completeWaveFn?.();
    let safety = 0;
    while (state.mode === "leveling" && safety < 50) {
      const firstBtn = document.querySelector("#choiceList button");
      if (firstBtn) firstBtn.click();
      safety++;
    }
    if (state.mode === "shop") {
      document.getElementById("shopOverlay")?.classList.remove("active");
      finishWaveTransitionFn?.();
    }
    state.mode = "paused";
    document.getElementById("pauseOverlay")?.classList.add("active");
    return;
  }

  if (state.mode === "playing") {
    if (isBossWave(state.wave)) {
      state.spawnedBossWaves.add(state.wave);
      clearEnemies();
    }
    completeWaveFn?.();
  }
}

function handleAddGold() {
  if (typeof state.gold === "number") {
    state.gold += 500;
    console.log("[TestTools] +500 gold, current: " + state.gold);
  }
}