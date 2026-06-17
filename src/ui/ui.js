import { TOTAL_WAVES } from "../constants.js";
import { getChallengeTotalWaves } from "../config/challenge-waves.js";
import { state, world } from "../state.js";
import { choice, formatTime } from "../utils.js";
import { bestSummaryText, difficultyCards } from "../difficulty.js";
import { getSettings, toggleSetting } from "../systems/settings.js";
import {
  findFuseCandidate,
  fuseWeaponSlots,
  QUALITY_INFO,
  selectWeaponSlot,
  selectedWeaponSlot,
  WEAPON_INFO,
} from "../economy/inventory.js";
import { startWeaponPreview } from "./weaponPreview.js";

let stopPreview = null;
const hudLast = { hp: null, xp: null, kills: null, gold: null, level: null };
const FALLBACK_VERSION = "v0.1.0";

export const ui = {
  canvas: document.getElementById("gameCanvas"),
  quickActions: document.querySelector(".quick-actions"),
  hpBar: document.getElementById("hpBar"),
  hpText: document.getElementById("hpText"),
  hpMeter: document.getElementById("hpMeter"),
  xpBar: document.getElementById("xpBar"),
  xpMeter: document.getElementById("xpMeter"),
  levelText: document.getElementById("levelText"),
  wavePanel: document.getElementById("wavePanel"),
  timerText: document.getElementById("timerText"),
  waveText: document.getElementById("waveText"),
  killText: document.getElementById("killText"),
  coinText: document.getElementById("coinText"),
  goldText: document.getElementById("goldText"),
  fpsText: document.getElementById("fpsText"),
  startOverlay: document.getElementById("startOverlay"),
  levelOverlay: document.getElementById("levelOverlay"),
  loadoutOverlay: document.getElementById("loadoutOverlay"),
  loadoutDifficultyList: document.getElementById("loadoutDifficultyList"),
  loadoutWeaponPreview: document.getElementById("loadoutWeaponPreview"),
  loadoutWeaponList: document.getElementById("loadoutWeaponList"),
  loadoutConfirmButton: document.getElementById("loadoutConfirmButton"),
  loadoutControlAuto: document.getElementById("loadoutControlAuto"),
  loadoutControlManual: document.getElementById("loadoutControlManual"),
  loadoutBackButton: document.getElementById("loadoutBackButton"),
  loadoutDifficultyName: document.getElementById("loadoutDifficultyName"),
  loadoutWeaponName: document.getElementById("loadoutWeaponName"),
  loadoutSelectedWeaponName: document.getElementById("loadoutSelectedWeaponName"),
  loadoutWeaponDesc: document.getElementById("loadoutWeaponDesc"),
  loadoutWeaponTags: document.getElementById("loadoutWeaponTags"),
  shopOverlay: document.getElementById("shopOverlay"),
  pauseOverlay: document.getElementById("pauseOverlay"),
  inventoryOverlay: document.getElementById("inventoryOverlay"),
  endOverlay: document.getElementById("endOverlay"),
  levelEyebrow: document.querySelector("#levelOverlay .eyebrow"),
  levelTitle: document.querySelector("#levelOverlay h2"),
  choiceList: document.getElementById("choiceList"),
  startButton: document.getElementById("startButton"),
  continueButton: document.getElementById("continueButton"),
  gameVersionText: document.getElementById("gameVersionText"),
  restartButton: document.getElementById("restartButton"),
  resumeButton: document.getElementById("resumeButton"),
  pauseRestartButton: document.getElementById("pauseRestartButton"),
  menuButton: document.getElementById("menuButton"),
  inventoryCloseButton: document.getElementById("inventoryCloseButton"),
  inventoryStats: document.getElementById("inventoryStats"),
  weaponSlotList: document.getElementById("weaponSlotList"),
  weaponDetail: document.getElementById("weaponDetail"),
  weaponFuseButton: document.getElementById("weaponFuseButton"),
  itemList: document.getElementById("itemList"),
  pauseButton: document.getElementById("pauseButton"),
  inventoryButton: document.getElementById("inventoryButton"),
  muteButton: document.getElementById("muteButton"),
  bestText: document.getElementById("bestText"),
  endEyebrow: document.getElementById("endEyebrow"),
  endTitle: document.getElementById("endTitle"),
  endStats: document.getElementById("endStats"),
  touchStick: document.getElementById("touchStick"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsButton: document.getElementById("settingsButton"),
  modeOverlay: document.getElementById("modeOverlay"),
  modeSwarmButton: document.getElementById("modeSwarmButton"),
  modeChallengeButton: document.getElementById("modeChallengeButton"),
  modeDescription: document.getElementById("modeDescription"),
};

export async function loadGameConfig() {
  try {
    const response = await fetch(new URL("../config/game-config.json", import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`game config ${response.status}`);
    const config = await response.json();
    if (ui.gameVersionText) ui.gameVersionText.textContent = config.version || FALLBACK_VERSION;
  } catch {
    if (ui.gameVersionText) ui.gameVersionText.textContent = FALLBACK_VERSION;
  }
}

export function updateHud(fps) {
  document.body.classList.toggle("is-menu", state.mode === "menu");
  const p = state.player;
  if (!p) return;
  const hp = Math.max(0, Math.ceil(p.hp));
  const xp = Math.max(0, Math.floor(p.xp));
  const hpRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
  const xpRatio = Math.max(0, Math.min(1, p.xp / p.xpNeed));
  ui.hpBar.style.transform = `scaleX(${hpRatio})`;
  ui.xpBar.style.transform = `scaleX(${xpRatio})`;
  ui.hpBar.parentElement?.style.setProperty("--value", hpRatio);
  ui.xpBar.parentElement?.style.setProperty("--value", xpRatio);
  ui.hpText.textContent = `${hp}`;
  ui.levelText.textContent = `Lv.${p.level}`;
  if (state.gameMode === "challenge" && state.waveScenario?.type === "annihilation" && !state.bossWaveActive) {
    ui.timerText.textContent = `剩余敌怪 ${state.challengeRemaining}`;
    ui.timerText.style.color = "var(--red)";
  } else if (state.bossWaveActive) {
    ui.timerText.textContent = world.boss?.name || "BOSS";
    ui.timerText.style.color = "";
  } else {
    ui.timerText.textContent = formatTime(state.waveTimeLeft);
    ui.timerText.style.color = "";
  }
  ui.wavePanel?.classList.toggle("boss-active", state.bossWaveActive);
  const totalWaves = state.gameMode === "challenge" ? getChallengeTotalWaves() : TOTAL_WAVES;
  ui.waveText.textContent = `第 ${state.wave}/${totalWaves} 波`;
  renderChip(ui.killText, "×", "击败", state.kills);
  renderChip(ui.goldText, "G", "金币", state.gold);
  renderChip(ui.fpsText, "F", "FPS", Math.round(fps));
  ui.coinText.textContent = `金币 ${state.gold}`;
  setFpsClass(fps);
  ui.hpMeter?.classList.toggle("low", hpRatio < 0.3);
  ui.xpMeter?.classList.toggle("near-level", xpRatio > 0.82);

  if (hudLast.hp !== null && hp < hudLast.hp) flashHudValue(ui.hpMeter, "damage");
  if (hudLast.xp !== null && xp > hudLast.xp) flashHudValue(ui.xpMeter, "gain");
  if (hudLast.level !== null && p.level > hudLast.level) flashHudValue(ui.xpMeter, "pulse");
  if (hudLast.kills !== null && state.kills > hudLast.kills) flashHudValue(ui.killText, "gain");
  if (hudLast.gold !== null && state.gold > hudLast.gold) flashHudValue(ui.goldText, "gain");
  hudLast.hp = hp;
  hudLast.xp = xp;
  hudLast.kills = state.kills;
  hudLast.gold = state.gold;
  hudLast.level = p.level;
}

function renderChip(element, icon, label, value) {
  if (!element) return;
  element.classList.add("hud-chip");
  element.innerHTML = `<i>${icon}</i><b>${label}</b><strong>${value}</strong>`;
}

function flashHudValue(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 360);
}

function setFpsClass(fps) {
  if (!ui.fpsText) return;
  ui.fpsText.classList.remove("fps-good", "fps-warn", "fps-bad");
  ui.fpsText.classList.add(fps < 30 ? "fps-bad" : fps < 45 ? "fps-warn" : "fps-good");
}

function clampCarouselIndex(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function cycleCarouselIndex(index, direction, length) {
  if (!length) return 0;
  return (index + direction + length) % length;
}

export function updateBestText() {
  ui.bestText.textContent = bestSummaryText(formatTime);
}

let _modeOnBack = null;

export function showModeSelect({ onSelect, onBack }) {
  _modeOnBack = onBack || null;
  hideAllOverlays();
  ui.modeOverlay.classList.add("active");
  ui.quickActions?.classList.add("blocked");
  state.mode = "selectingMode";

  const descriptions = {
    swarm: "虫潮模式下，敌人会以高频率持续生成。你需要通过消灭敌人获取经验和金币，不断提升实力，在源源不断的虫潮中生存下去。共有多个难度可供选择，逐步解锁更高的挑战。",
    challenge: "挑战模式下，敌人数量有限，生成逻辑由所选的关卡精确控制。敌人拥有大幅提升的生命值和伤害，但金币掉落也有所增加。波次可能要求歼灭全部敌人才可过关。请做好万全准备！",
  };

  function updateDescription(mode) {
    ui.modeDescription.textContent = descriptions[mode] || "";
    ui.modeDescription.className = `mode-description ${mode}-active`;
  }

  function selectMode(mode) {
    hideModeSelect();
    onSelect(mode);
  }

  ui.modeSwarmButton.onmouseenter = () => updateDescription("swarm");
  ui.modeChallengeButton.onmouseenter = () => updateDescription("challenge");
  ui.modeSwarmButton.onclick = () => selectMode("swarm");
  ui.modeChallengeButton.onclick = () => selectMode("challenge");

  // Click outside panel to return to main menu  
  ui.modeOverlay.onclick = (event) => {
    if (event.target === ui.modeOverlay) {
      hideModeSelect();
      state.mode = "menu";
      ui.startOverlay.classList.add("active");
    }
  };

  updateDescription("swarm");
}

export function hideModeSelect() {
  ui.modeOverlay.classList.remove("active");
  ui.quickActions?.classList.remove("blocked");
}

export function showSettings({ onBack }) {
  hideAllOverlays();
  ui.settingsOverlay.classList.add("active");
  ui.quickActions?.classList.add("blocked");

  function renderToggles() {
    const s = getSettings();
    const toggles = [
      { id: "settingShowEnemyHpBar", key: "showEnemyHpBar" },
      { id: "settingShowDamageNumbers", key: "showDamageNumbers" },
    ];
    for (const t of toggles) {
      const el = document.getElementById(t.id);
      if (!el) continue;
      const checked = s[t.key];
      el.setAttribute("aria-checked", String(checked));
      el.onclick = () => {
        toggleSetting(t.key);
        renderToggles();
      };
    }
  }

  renderToggles();

  // Click outside panel to close
  ui.settingsOverlay.onclick = (event) => {
    if (event.target === ui.settingsOverlay) {
      hideSettings();
      if (onBack) onBack();
    }
  };
}

export function hideSettings() {
  ui.settingsOverlay.classList.remove("active");
  ui.quickActions?.classList.remove("blocked");
}
export function showRunSetup({ weapons, onConfirm, onBack, gameMode }) {
  clearPreview();
  state.ai ||= {};
  ui.quickActions?.classList.add("blocked");
  const difficulties = difficultyCards(gameMode || state.gameMode || "swarm");
  let difficultyIndex = Math.max(0, difficulties.findIndex((item) => item.currentHighest));
  let weaponIndex = 0;
  let selectedDifficulty = difficulties[difficultyIndex] || null;
  let selectedWeapon = weapons[weaponIndex] || null;
  let confirmed = false;
  var savedMode = (function() { try { return localStorage.getItem("survivor_controlMode") || "auto"; } catch(e) { return "auto"; } })(); let selectedControlMode = (savedMode === "manual" ? "manual" : "auto");
  setupControlModeButtons();

  function setupControlModeButtons() {
    if (!ui.loadoutControlAuto || !ui.loadoutControlManual) return;
    ui.loadoutControlAuto.className = selectedControlMode === "auto" ? "loadout-control-btn compact active" : "loadout-control-btn compact";
    ui.loadoutControlManual.className = selectedControlMode === "manual" ? "loadout-control-btn compact active" : "loadout-control-btn compact";
    ui.loadoutControlAuto.onclick = function() {
      selectedControlMode = "auto"; try { localStorage.setItem("survivor_controlMode", "auto"); } catch(e) {} setupControlModeButtons();
    };
    ui.loadoutControlManual.onclick = function() {
      selectedControlMode = "manual"; try { localStorage.setItem("survivor_controlMode", "manual"); } catch(e) {} setupControlModeButtons();
    };
  }

  ui.loadoutDifficultyList.innerHTML = "";
  ui.loadoutWeaponList.innerHTML = "";

  function renderDifficultyList() {
    ui.loadoutDifficultyList.innerHTML = "";
    difficulties.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `loadout-difficulty-card difficulty-card terminal-card${item.unlocked ? "" : " locked"}${item.completed ? " completed" : ""}${item.currentHighest ? " current" : ""}${selectedDifficulty?.id === item.id ? " selected" : ""}`;
      button.disabled = !item.unlocked;
      button.innerHTML = `
        <span class="loadout-card-index">${String(item.index + 1).padStart(2, "0")}</span>
        <strong>${item.name}</strong>
        <p>${item.unlocked ? item.desc : "击败上一难度解锁。"}</p>
        <div class="difficulty-meta">
          <i>敌人 ${Math.round(item.enemyHp * 100)}%</i>
          <i>伤害 ${Math.round(item.enemyDamage * 100)}%</i>
          <i>怪潮 ${Math.round(item.spawnRate * 100)}%</i>
        </div>
        <em>${item.completed ? `已通关 · ${formatTime(item.bestTime)}` : item.unlocked ? "可挑战" : "未解锁"}</em>`;
      button.addEventListener("click", () => {
        difficultyIndex = index;
        selectedDifficulty = item;
        renderDifficultyList();
        updateSummary();
      });
      ui.loadoutDifficultyList.appendChild(button);
    });
  }

  function renderWeaponList() {
    ui.loadoutWeaponList.innerHTML = "";
    weapons.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `loadout-weapon-card terminal-card${selectedWeapon?.id === item.id ? " selected" : ""}`;
      button.innerHTML = `
        <i>${item.icon}</i>
        <strong>${item.name}</strong>`;
      button.addEventListener("click", () => {
        weaponIndex = index;
        selectedWeapon = item;
        renderWeaponList();
        updateWeaponPreviewInfo();
        updateSummary();
      });
      ui.loadoutWeaponList.appendChild(button);
    });
  }

  function renderDifficultyCarousel() {
    ui.loadoutDifficultyList.innerHTML = "";
    if (!difficulties.length) return;
    difficultyIndex = clampCarouselIndex(difficultyIndex, difficulties.length);
    selectedDifficulty = difficulties[difficultyIndex];
    const item = selectedDifficulty;
    const wrap = document.createElement("div");
    wrap.className = "loadout-carousel difficulty-carousel";
    wrap.innerHTML = `
      <button type="button" class="loadout-carousel-arrow" data-dir="-1" aria-label="上一个难度">‹</button>
      <button type="button" class="loadout-difficulty-card difficulty-card carousel-card${item.unlocked ? "" : " locked"}${item.completed ? " completed" : ""}${item.currentHighest ? " current" : ""} selected" ${item.unlocked ? "" : "disabled"}>
        <span>${String(item.index + 1).padStart(2, "0")}</span>
        <strong>${item.name}</strong>
        <p>${item.unlocked ? item.desc : "击败上一难度解锁。"}</p>
        <div class="difficulty-meta">
          <i>敌人 ${Math.round(item.enemyHp * 100)}%</i>
          <i>伤害 ${Math.round(item.enemyDamage * 100)}%</i>
          <i>怪潮 ${Math.round(item.spawnRate * 100)}%</i>
        </div>
        <em>${item.completed ? `已通关 · ${formatTime(item.bestTime)}` : item.unlocked ? "可挑战" : "未解锁"}</em>
      </button>
      <button type="button" class="loadout-carousel-arrow" data-dir="1" aria-label="下一个难度">›</button>
      <div class="loadout-carousel-count">${difficultyIndex + 1} / ${difficulties.length}</div>`;
    for (const arrow of wrap.querySelectorAll(".loadout-carousel-arrow")) {
      arrow.addEventListener("click", () => {
        difficultyIndex = cycleCarouselIndex(difficultyIndex, Number(arrow.dataset.dir), difficulties.length);
        renderDifficultyCarousel();
        updateSummary();
      });
    }
    ui.loadoutDifficultyList.appendChild(wrap);
  }

  function renderWeaponCarousel() {
    ui.loadoutWeaponList.innerHTML = "";
    if (!weapons.length) return;
    weaponIndex = clampCarouselIndex(weaponIndex, weapons.length);
    selectedWeapon = weapons[weaponIndex];
    const item = selectedWeapon;
    const info = WEAPON_INFO[item.id] || item;
    const wrap = document.createElement("div");
    wrap.className = "loadout-carousel weapon-carousel weapon-carousel-controls";
    wrap.innerHTML = `
      <button type="button" class="loadout-carousel-arrow" data-dir="-1" aria-label="上一个武器">‹</button>
      <button type="button" class="loadout-weapon-card carousel-card selected">
        <i>${item.icon}</i>
        <strong>${item.name}</strong>
        <small>${(info.tags || []).slice(0, 3).join(" · ")}</small>
      </button>
      <button type="button" class="loadout-carousel-arrow" data-dir="1" aria-label="下一个武器">›</button>
      <div class="loadout-carousel-count">${weaponIndex + 1} / ${weapons.length}</div>`;
    for (const arrow of wrap.querySelectorAll(".loadout-carousel-arrow")) {
      arrow.addEventListener("click", () => {
        weaponIndex = cycleCarouselIndex(weaponIndex, Number(arrow.dataset.dir), weapons.length);
        renderWeaponCarousel();
        updateWeaponPreviewInfo();
        updateSummary();
      });
    }
    ui.loadoutWeaponList.appendChild(wrap);
  }

  function updateWeaponPreviewInfo() {
    if (!selectedWeapon) return;
    const info = WEAPON_INFO[selectedWeapon.id] || selectedWeapon;
    ui.loadoutWeaponName.textContent = `${selectedWeapon.icon} ${selectedWeapon.name}`;
    ui.loadoutWeaponDesc.textContent = selectedWeapon.desc;
    ui.loadoutWeaponTags.innerHTML = "";
    (info.tags || []).forEach((text) => {
      const tag = document.createElement("span");
      tag.textContent = text;
      ui.loadoutWeaponTags.appendChild(tag);
    });
  }

  function updateSummary() {
    ui.loadoutDifficultyName.textContent = selectedDifficulty?.name || "未选择";
    ui.loadoutSelectedWeaponName.textContent = selectedWeapon?.name || "未选择";
    ui.loadoutConfirmButton.disabled = !selectedDifficulty?.unlocked || !selectedWeapon;
  }

  function cycleDifficulty(direction) {
    if (!difficulties.length) return;
    let nextIndex = difficultyIndex;
    for (let attempts = 0; attempts < difficulties.length; attempts++) {
      nextIndex = cycleCarouselIndex(nextIndex, direction, difficulties.length);
      if (difficulties[nextIndex]?.unlocked) break;
    }
    difficultyIndex = nextIndex;
    selectedDifficulty = difficulties[difficultyIndex];
    renderDifficultyList();
    updateSummary();
  }

  function cycleWeapon(direction) {
    if (!weapons.length) return;
    weaponIndex = cycleCarouselIndex(weaponIndex, direction, weapons.length);
    selectedWeapon = weapons[weaponIndex];
    renderWeaponList();
    updateWeaponPreviewInfo();
    updateSummary();
  }

  ui.loadoutOverlay.onkeydown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      cycleWeapon(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      cycleWeapon(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      cycleDifficulty(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      cycleDifficulty(1);
    }
  };

  function confirmLoadout() {
    if (confirmed || !selectedDifficulty?.unlocked || !selectedWeapon) return;
    confirmed = true;
    ui.loadoutConfirmButton.disabled = true;
    onConfirm({ difficulty: selectedDifficulty, weapon: selectedWeapon, controlMode: selectedControlMode });
    return true;
  }

  ui.loadoutConfirmButton.onclick = confirmLoadout;
  if (ui.loadoutBackButton) {
    ui.loadoutBackButton.onclick = () => {
    if (confirmed) return;
      hideRunSetup();
      onBack?.();
    };
  }
  state.ai.loadoutPanel = {
    difficulties,
    weapons,
    selectDifficulty: (id) => {
      const index = difficulties.findIndex((item) => item.id === id && item.unlocked);
      if (index < 0) return false;
      difficultyIndex = index;
      selectedDifficulty = difficulties[difficultyIndex];
      renderDifficultyList();
      updateSummary();
      return true;
    },
    selectWeapon: (id) => {
      const index = weapons.findIndex((item) => item.id === id);
      if (index < 0) return false;
      weaponIndex = index;
      selectedWeapon = weapons[weaponIndex];
      renderWeaponList();
      updateWeaponPreviewInfo();
      updateSummary();
      return true;
    },
    confirm: () => {
      if (confirmed || !selectedDifficulty?.unlocked || !selectedWeapon) return false;
      return Boolean(confirmLoadout());
    },
    getSelection: () => {
      return {
        difficulty: selectedDifficulty?.id || "",
        weapon: selectedWeapon?.id || "",
        confirmed,
        canConfirm: Boolean(!confirmed && selectedDifficulty?.unlocked && selectedWeapon),
      };
    },
  };

  renderDifficultyList();
  renderWeaponList();
  updateWeaponPreviewInfo();
  updateSummary();
  stopPreview = startWeaponPreview(ui.loadoutWeaponPreview, () => selectedWeapon);
  ui.loadoutOverlay.classList.add("active");
  ui.loadoutOverlay.setAttribute("aria-hidden", "false");
  ui.loadoutOverlay.tabIndex = -1;
  ui.loadoutOverlay.focus({ preventScroll: true });
}

export function hideRunSetup() {
  clearPreview();
  if (state.ai?.loadoutPanel) state.ai.loadoutPanel = null;
  ui.loadoutOverlay?.classList.remove("active");
  ui.loadoutOverlay?.setAttribute("aria-hidden", "true");
  ui.quickActions?.classList.remove("blocked");
}

export function showChoices({ eyebrow, title, items, onPick, refresh = null }) {
  clearPreview();
  ui.quickActions?.classList.add("blocked");
  const isLevelUp = eyebrow === "LEVEL UP";
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
  ui.levelOverlay.querySelector(".level-choice-actions")?.remove();
  ui.choiceList.className = isLevelUp ? "choice-list level-choice-list" : "choice-list";
  ui.levelOverlay.classList.toggle("level-up-overlay", isLevelUp);
  if (isLevelUp) renderLevelUpFx();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = isLevelUp ? "choice-card level-choice-card" : "choice-card";
    button.innerHTML = isLevelUp
      ? `
        <div class="upgrade-icon"><i>${item.icon}</i></div>
        <div class="upgrade-copy">
          <span>${item.stat || "强化"}</span>
          <strong>${item.name}</strong>
          <em>${item.amount || ""}</em>
          <p>${item.desc}</p>
        </div>
        <b>选择</b>`
      : `<i>${item.icon}</i><strong>${item.name}</strong><p>${item.desc}</p>`;
    button.addEventListener("click", () => {
      if (isLevelUp) playUpgradePickFx(item);
      onPick(item);
    }, { once: true });
    ui.choiceList.appendChild(button);
  }
  if (isLevelUp && refresh) {
    const actions = document.createElement("div");
    actions.className = "level-choice-actions";
    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "level-refresh-button";
    refreshButton.textContent = refresh.label;
    refreshButton.disabled = Boolean(refresh.disabled);
    refreshButton.addEventListener("click", () => {
      const refreshed = refresh.onRefresh?.();
      if (refreshed === false) {
        refreshButton.classList.remove("denied");
        void refreshButton.offsetWidth;
        refreshButton.classList.add("denied");
      }
    });
    actions.append(refreshButton);
    ui.levelOverlay.querySelector(".choices")?.appendChild(actions);
  }
  ui.levelOverlay.classList.add("active");
}

export function hideChoices() {
  clearPreview();
  ui.levelOverlay.classList.remove("active");
  ui.levelOverlay.classList.remove("level-up-overlay");
  ui.levelOverlay.querySelector(".level-up-fx")?.remove();
  ui.levelOverlay.querySelector(".level-choice-actions")?.remove();
  ui.quickActions?.classList.remove("blocked");
}

export function showInventory() {
  renderInventory();
  ui.inventoryOverlay.classList.add("active");
}

export function hideInventory() {
  ui.inventoryOverlay.classList.remove("active");
}

export function renderInventory() {
  renderInventoryStats();
  renderWeaponSlots();
  renderWeaponDetail();
  renderItems();
}

export function showPauseMenu() {
  ui.pauseOverlay.classList.add("active");
}

export function hidePauseMenu() {
  ui.pauseOverlay.classList.remove("active");
}

export function hideAllOverlays() {
  clearPreview();
  ui.quickActions?.classList.remove("blocked");
  ui.startOverlay.classList.remove("active");
  ui.levelOverlay.classList.remove("active");
  ui.levelOverlay.classList.remove("level-up-overlay");
  ui.levelOverlay.querySelector(".level-up-fx")?.remove();
  ui.loadoutOverlay?.classList.remove("active");
  ui.loadoutOverlay?.setAttribute("aria-hidden", "true");
  ui.shopOverlay?.classList.remove("active");
  ui.pauseOverlay.classList.remove("active");
  ui.inventoryOverlay.classList.remove("active");
  ui.endOverlay.classList.remove("active");
}

export function pickThree(items) {
  return choice(items, 3);
}

export function updateContinueButton(hasSave) {
  if (ui.continueButton) {
    ui.continueButton.disabled = !hasSave;
    ui.continueButton.classList.toggle("has-save", hasSave);
  }
}
export function showEnd(victory) {
  const p = state.player;
  ui.endEyebrow.textContent = victory ? "VICTORY" : "RUN COMPLETE";
  const totalWavesEnd = state.gameMode === "challenge" ? getChallengeTotalWaves() : TOTAL_WAVES;
  ui.endTitle.textContent = victory ? `${totalWavesEnd} 波已完成` : "生存结束";
  ui.endStats.innerHTML = "";
  [`难度 ${state.difficulty?.name || "未选择"}`, `时间 ${formatTime(state.time)}`, `等级 ${p.level}`, `击败 ${state.kills}`, `金币 ${state.gold}`].forEach((text) => {
    const item = document.createElement("span");
    item.textContent = text;
    ui.endStats.appendChild(item);
  });
  ui.endOverlay.classList.add("active");
  updateBestText();
}

function renderInventoryStats() {
  const p = state.player;
  ui.inventoryStats.innerHTML = "";
  [
    ["生命", `${Math.ceil(p.hp)} / ${p.maxHp}`],
    ["等级", `Lv.${p.level}`],
    ["经验", `${Math.floor(p.xp)} / ${p.xpNeed}`],
    ["移动速度", Math.round(p.speed)],
    ["拾取半径", Math.round(p.magnet)],
    ["伤害值", actualDamageValue()],
    ["金币", state.gold],
  ].forEach(([label, value]) => {
    const row = document.createElement("span");
    row.innerHTML = `<b>${label}</b><strong>${value}</strong>`;
    ui.inventoryStats.appendChild(row);
  });
}

function actualDamageValue() {
  const scale = state.player?.damageScale || 1;
  const slots = state.inventory?.weaponSlots || [];
  let best = 0;
  for (const slot of slots) {
    const weapon = state.weapons?.[slot.id];
    if (!weapon) continue;
    const base = weapon.damage ?? weapon.bulletDamage ?? weapon.explodeDamage ?? 0;
    const qualityMult = QUALITY_INFO[slot.quality]?.mult || 1;
    best = Math.max(best, base * qualityMult);
  }
  return Math.round(best * scale);
}

function renderWeaponSlots() {
  const slots = state.inventory.weaponSlots;
  ui.weaponSlotList.innerHTML = "";
  const titleCount = document.querySelector(".inventory-weapons h3 span");
  if (titleCount) titleCount.textContent = `${slots.length}/6`;
  for (let i = 0; i < 6; i++) {
    const slot = slots[i];
    const button = document.createElement("button");
    button.type = "button";
    if (!slot) {
      button.className = "weapon-slot empty";
      button.textContent = "空槽位";
    } else {
      const info = WEAPON_INFO[slot.id];
      const quality = QUALITY_INFO[slot.quality];
      button.className = `weapon-slot${state.inventory.selectedWeaponUid === slot.uid ? " active" : ""}`;
      button.innerHTML = `<i style="color:${quality.color}">${info.icon}</i><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name}</small>`;
      button.addEventListener("click", () => {
        selectWeaponSlot(slot.uid);
        renderInventory();
      });
    }
    ui.weaponSlotList.appendChild(button);
  }
}

function renderWeaponDetail() {
  const slot = selectedWeaponSlot();
  ui.weaponDetail.innerHTML = "";
  if (!slot) {
    ui.weaponDetail.textContent = "当前没有武器。";
    ui.weaponFuseButton.disabled = true;
    return;
  }
  const info = WEAPON_INFO[slot.id];
  const quality = QUALITY_INFO[slot.quality];
  const candidate = findFuseCandidate(slot);
  ui.weaponDetail.innerHTML = `
    <div class="weapon-detail-card">
      <div class="weapon-detail-title">
        <i class="weapon-detail-icon" style="color:${quality.color}">${info.icon}</i>
        <div>
          <strong>${info.name}</strong>
          <div class="quality-chip" style="color:${quality.color}">${quality.name}</div>
        </div>
      </div>
      <p>${info.desc}</p>
      <div class="weapon-tags detail-tags">${info.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <p>品质倍率：${Math.round(quality.mult * 100)}%</p>
      <p>合成规则：两把相同品质武器可合成为下一品质。</p>
    </div>`;
  ui.weaponFuseButton.disabled = !candidate;
  ui.weaponFuseButton.onclick = () => {
    const next = findFuseCandidate(slot);
    if (next && fuseWeaponSlots(slot.uid, next.uid)) renderInventory();
  };
}

function renderItems() {
  ui.itemList.innerHTML = "";
  for (const item of state.inventory.items) {
    const row = document.createElement("div");
    row.className = "item-card";
    const qty = item.qty;
    row.innerHTML = `<span>${item.icon} ${item.name}</span><strong>x${qty}</strong><small>${item.desc}</small>`;
    ui.itemList.appendChild(row);
  }
}

function clearPreview() {
  if (stopPreview) {
    stopPreview();
    stopPreview = null;
  }
}

function renderLevelUpFx() {
  ui.levelOverlay.querySelector(".level-up-fx")?.remove();
  const fx = document.createElement("div");
  fx.className = "level-up-fx";
  fx.setAttribute("aria-hidden", "true");
  fx.innerHTML = `
    <span class="level-ring one"></span>
    <span class="level-ring two"></span>
    <span class="level-beam a"></span>
    <span class="level-beam b"></span>
    <span class="level-scan"></span>
    <span class="level-sparks">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>`;
  ui.levelOverlay.prepend(fx);
}

function playUpgradePickFx(item) {
  const fx = document.createElement("div");
  fx.className = "upgrade-pick-fx";
  fx.setAttribute("aria-hidden", "true");
  fx.innerHTML = `
    <span>${item.icon || "*"}</span>
    <strong>${item.name || "强化完成"}</strong>
    <i></i><i></i><i></i><i></i>`;
  document.body.appendChild(fx);
  window.setTimeout(() => fx.remove(), 760);
}
