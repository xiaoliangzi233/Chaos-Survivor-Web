import { RANDOM_CURSE_DEFS, randomCurseRewardMultiplier, randomCurseScore } from "../systems/randomMode.js";

const dom = {};
let selected = new Set();
let resolveSelection = null;

export function initCurseUi() {
  dom.overlay = document.getElementById("curseOverlay");
  dom.list = document.getElementById("curseList");
  dom.score = document.getElementById("curseScore");
  dom.reward = document.getElementById("curseReward");
  dom.confirm = document.getElementById("curseConfirmButton");
  dom.clear = document.getElementById("curseClearButton");
  dom.cancel = document.getElementById("curseCancelButton");
  dom.confirm?.addEventListener("click", () => finishSelection(true));
  dom.clear?.addEventListener("click", () => {
    selected.clear();
    renderCurseList();
  });
  dom.cancel?.addEventListener("click", () => finishSelection(false));
  dom.overlay?.addEventListener("click", (event) => {
    if (event.target === dom.overlay) finishSelection(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isCurseSelectionOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    finishSelection(false);
  }, { capture: true });
}

export function openCurseSelection(previous = []) {
  if (!dom.overlay) return Promise.resolve(previous || []);
  selected = new Set((Array.isArray(previous) ? previous : []).filter((id) => RANDOM_CURSE_DEFS.some((curse) => curse.id === id)));
  renderCurseList();
  dom.overlay.classList.add("active");
  dom.overlay.setAttribute("aria-hidden", "false");
  dom.confirm?.focus({ preventScroll: true });
  return new Promise((resolve) => {
    resolveSelection = resolve;
  });
}

export function closeCurseSelection() {
  if (!isCurseSelectionOpen()) return false;
  dom.overlay.classList.remove("active");
  dom.overlay.setAttribute("aria-hidden", "true");
  return true;
}

export function isCurseSelectionOpen() {
  return Boolean(dom.overlay?.classList.contains("active"));
}

function renderCurseList() {
  if (!dom.list) return;
  dom.list.replaceChildren();
  for (const curse of RANDOM_CURSE_DEFS) {
    const active = selected.has(curse.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `curse-card${active ? " active" : ""}`;
    button.innerHTML = `
      <span>诅咒 ${curse.score}</span>
      <strong>${curse.name}</strong>
      <p>${curse.desc}</p>
      <em>收益 +${Math.round(curse.rewardBonus * 100)}%</em>`;
    button.addEventListener("click", () => {
      if (active) selected.delete(curse.id);
      else selected.add(curse.id);
      renderCurseList();
    });
    dom.list.appendChild(button);
  }
  const curses = [...selected];
  if (dom.score) dom.score.textContent = String(randomCurseScore(curses));
  if (dom.reward) dom.reward.textContent = `${Math.round(randomCurseRewardMultiplier(curses) * 100)}%`;
}

function finishSelection(confirmed) {
  const result = confirmed ? [...selected] : null;
  closeCurseSelection();
  resolveSelection?.(result);
  resolveSelection = null;
}
