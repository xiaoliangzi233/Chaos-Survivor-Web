import { SAVE_KEY, TOTAL_WAVES } from "./constants.js";
import { state } from "./state.js";
import { choice, formatTime } from "./utils.js";

export const ui = {
  canvas: document.getElementById("gameCanvas"),
  hpBar: document.getElementById("hpBar"),
  hpText: document.getElementById("hpText"),
  xpBar: document.getElementById("xpBar"),
  levelText: document.getElementById("levelText"),
  timerText: document.getElementById("timerText"),
  waveText: document.getElementById("waveText"),
  killText: document.getElementById("killText"),
  coinText: document.getElementById("coinText"),
  fpsText: document.getElementById("fpsText"),
  startOverlay: document.getElementById("startOverlay"),
  levelOverlay: document.getElementById("levelOverlay"),
  endOverlay: document.getElementById("endOverlay"),
  levelEyebrow: document.querySelector("#levelOverlay .eyebrow"),
  levelTitle: document.querySelector("#levelOverlay h2"),
  choiceList: document.getElementById("choiceList"),
  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),
  pauseButton: document.getElementById("pauseButton"),
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
  ui.hpBar.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
  ui.xpBar.style.transform = `scaleX(${Math.max(0, p.xp / p.xpNeed)})`;
  ui.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}`;
  ui.levelText.textContent = `Lv.${p.level}`;
  ui.timerText.textContent = formatTime(state.waveTimeLeft);
  ui.waveText.textContent = `第 ${state.wave}/${TOTAL_WAVES} 波`;
  ui.killText.textContent = `击败 ${state.kills}`;
  ui.coinText.textContent = `碎片 ${state.shards}`;
  ui.fpsText.textContent = `${Math.round(fps)} fps`;
}

export function updateBestText() {
  ui.bestText.textContent = `最佳纪录 ${formatTime(Number(localStorage.getItem(SAVE_KEY) || 0))}`;
}

export function showChoices({ eyebrow, title, items, onPick }) {
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
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

export function hideChoices() {
  ui.levelOverlay.classList.remove("active");
}

export function pickThree(items) {
  return choice(items, 3);
}

export function showEnd(victory) {
  const p = state.player;
  ui.endEyebrow.textContent = victory ? "VICTORY" : "RUN COMPLETE";
  ui.endTitle.textContent = victory ? "20 波已完成" : "生存结束";
  ui.endStats.innerHTML = "";
  [`时间 ${formatTime(state.time)}`, `等级 ${p.level}`, `击败 ${state.kills}`, `碎片 ${state.shards}`].forEach((text) => {
    const item = document.createElement("span");
    item.textContent = text;
    ui.endStats.appendChild(item);
  });
  ui.endOverlay.classList.add("active");
  updateBestText();
}
