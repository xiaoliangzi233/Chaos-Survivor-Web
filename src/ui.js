import { TOTAL_WAVES } from "./constants.js";
import { state } from "./state.js";
import { choice, formatTime } from "./utils.js";
import { bestSummaryText, difficultyCards } from "./difficulty.js";
import {
  findFuseCandidate,
  fuseWeaponSlots,
  QUALITY_INFO,
  selectWeaponSlot,
  selectedWeaponSlot,
  WEAPON_INFO,
} from "./inventory.js";
import { startWeaponPreview } from "./weaponPreview.js";

let stopPreview = null;
const hudLast = { hp: null, xp: null, kills: null, gold: null, level: null };

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
  difficultyOverlay: document.getElementById("difficultyOverlay"),
  shopOverlay: document.getElementById("shopOverlay"),
  pauseOverlay: document.getElementById("pauseOverlay"),
  inventoryOverlay: document.getElementById("inventoryOverlay"),
  endOverlay: document.getElementById("endOverlay"),
  levelEyebrow: document.querySelector("#levelOverlay .eyebrow"),
  levelTitle: document.querySelector("#levelOverlay h2"),
  choiceList: document.getElementById("choiceList"),
  difficultyList: document.getElementById("difficultyList"),
  startButton: document.getElementById("startButton"),
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
};

export function updateHud(fps) {
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
  ui.timerText.textContent = state.bossWaveActive ? "BOSS" : formatTime(state.waveTimeLeft);
  ui.wavePanel?.classList.toggle("boss-active", state.bossWaveActive);
  ui.waveText.textContent = `第 ${state.wave}/${TOTAL_WAVES} 波`;
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

export function updateBestText() {
  ui.bestText.textContent = bestSummaryText(formatTime);
}

export function showDifficultySelect({ onPick }) {
  clearPreview();
  ui.quickActions?.classList.add("blocked");
  ui.difficultyList.innerHTML = "";
  for (const item of difficultyCards()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `difficulty-card${item.unlocked ? "" : " locked"}${item.completed ? " completed" : ""}${item.currentHighest ? " current" : ""}`;
    button.disabled = !item.unlocked;
    button.innerHTML = `
      <span>${String(item.index + 1).padStart(2, "0")}</span>
      <strong>${item.name}</strong>
      <p>${item.unlocked ? item.desc : "击败上一难度解锁。"}</p>
      <div class="difficulty-meta">
        <i>敌人 ${Math.round(item.enemyHp * 100)}%</i>
        <i>伤害 ${Math.round(item.enemyDamage * 100)}%</i>
        <i>怪潮 ${Math.round(item.spawnRate * 100)}%</i>
      </div>
      <em>${item.completed ? `已通关 · ${formatTime(item.bestTime)}` : item.unlocked ? "可挑战" : "未解锁"}</em>`;
    button.addEventListener("click", () => onPick(item), { once: true });
    ui.difficultyList.appendChild(button);
  }
  ui.difficultyOverlay.classList.add("active");
}

export function hideDifficultySelect() {
  ui.difficultyOverlay?.classList.remove("active");
  ui.quickActions?.classList.remove("blocked");
}

export function showChoices({ eyebrow, title, items, onPick }) {
  clearPreview();
  ui.quickActions?.classList.add("blocked");
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
  ui.choiceList.className = "choice-list";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-card";
    button.innerHTML = `<i>${item.icon}</i><strong>${item.name}</strong><p>${item.desc}</p>`;
    button.addEventListener("click", () => onPick(item), { once: true });
    ui.choiceList.appendChild(button);
  }
  ui.levelOverlay.classList.add("active");
}

export function showWeaponCarousel({ eyebrow, title, items, onPick }) {
  clearPreview();
  ui.quickActions?.classList.add("blocked");
  let index = 0;
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
  ui.choiceList.className = "choice-list weapon-choice-list";

  const root = document.createElement("div");
  root.className = "weapon-carousel";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "weapon-nav";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "上一种武器");
  const next = document.createElement("button");
  next.type = "button";
  next.className = "weapon-nav";
  next.textContent = "›";
  next.setAttribute("aria-label", "下一种武器");
  const card = document.createElement("article");
  card.className = "weapon-card";
  const canvas = document.createElement("canvas");
  canvas.className = "weapon-preview";
  const name = document.createElement("strong");
  const desc = document.createElement("p");
  const tags = document.createElement("div");
  tags.className = "weapon-tags";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary weapon-confirm";
  confirm.textContent = "选择武器";

  card.append(canvas, name, desc, tags, confirm);
  root.append(prev, card, next);
  ui.choiceList.appendChild(root);

  function renderInfo() {
    const item = items[index];
    name.textContent = `${item.icon} ${item.name}`;
    desc.textContent = item.desc;
    tags.innerHTML = "";
    (WEAPON_INFO[item.id]?.tags || []).forEach((text) => {
      const tag = document.createElement("span");
      tag.textContent = text;
      tags.appendChild(tag);
    });
  }

  let picked = false;
  function pickCurrent() {
    if (picked) return;
    picked = true;
    onPick(items[index]);
  }

  prev.addEventListener("click", (event) => {
    event.stopPropagation();
    index = (index - 1 + items.length) % items.length;
    renderInfo();
  });
  next.addEventListener("click", (event) => {
    event.stopPropagation();
    index = (index + 1) % items.length;
    renderInfo();
  });
  card.addEventListener("click", pickCurrent);
  confirm.addEventListener("click", (event) => {
    event.stopPropagation();
    pickCurrent();
  });
  renderInfo();
  stopPreview = startWeaponPreview(canvas, () => items[index]);
  ui.levelOverlay.classList.add("active");
}

export function hideChoices() {
  clearPreview();
  ui.levelOverlay.classList.remove("active");
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
  ui.difficultyOverlay?.classList.remove("active");
  ui.shopOverlay?.classList.remove("active");
  ui.pauseOverlay.classList.remove("active");
  ui.inventoryOverlay.classList.remove("active");
  ui.endOverlay.classList.remove("active");
}

export function pickThree(items) {
  return choice(items, 3);
}

export function showEnd(victory) {
  const p = state.player;
  ui.endEyebrow.textContent = victory ? "VICTORY" : "RUN COMPLETE";
  ui.endTitle.textContent = victory ? "20 波已完成" : "生存结束";
  ui.endStats.innerHTML = "";
  [`时间 ${formatTime(state.time)}`, `等级 ${p.level}`, `击败 ${state.kills}`, `金币 ${state.gold}`].forEach((text) => {
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
    ["伤害倍率", `${Math.round(p.damageScale * 100)}%`],
    ["金币", state.gold],
  ].forEach(([label, value]) => {
    const row = document.createElement("span");
    row.innerHTML = `<b>${label}</b><strong>${value}</strong>`;
    ui.inventoryStats.appendChild(row);
  });
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
