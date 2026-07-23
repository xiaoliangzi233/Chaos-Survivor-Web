import { state } from "../state.js";
import {
  allLobbyInteractions,
  endLobbyNpcConversation,
  setLobbyModalOpen,
} from "../systems/lobby.js";

const GUIDE_TOPICS = [
  {
    id: "facilities",
    label: "星舰设施",
    text: "中央枢纽连接舰桥、数据、科学、战斗、工程与生活六个功能翼。自动气密门会在靠近时开启，未进入的房间会维持视觉隔离。",
  },
  {
    id: "controls",
    label: "基础操作",
    text: "使用 WASD 或方向键移动。靠近带有光圈的设备、入口或人员后按 E 交互。战斗中武器会自动寻找目标，E 键则恢复为背包快捷键，P 或 Esc 用于暂停。",
  },
  {
    id: "combat",
    label: "战斗与成长",
    text: "击败敌人收集经验，升级时从三项强化中选择一项。每波结束后可进入商店购买、出售或合成武器与道具。标准战役共二十波，随机模式还提供无限目标。",
  },
  {
    id: "world",
    label: "世界背景",
    text: "霓虹中转舰是灾变后仍能穿越失稳时间线的少数大型星舰。每次出击都在替舰队找回一段航路，也找回一段被废墟网络遗忘的历史。",
  },
];

const dom = {};
let onModalChange = null;

export function initLobbyUi(options = {}) {
  onModalChange = options.onModalChange || null;
  dom.hud = document.getElementById("lobbyHud");
  dom.prompt = document.getElementById("lobbyInteractionPrompt");
  dom.promptTitle = document.getElementById("lobbyInteractionTitle");
  dom.promptHint = document.getElementById("lobbyInteractionHint");
  dom.toast = document.getElementById("lobbyToast");
  dom.launch = document.getElementById("lobbyLaunchStatus");
  dom.launchText = document.getElementById("lobbyLaunchText");
  dom.launchBar = document.getElementById("lobbyLaunchBar");
  dom.dialogue = document.getElementById("lobbyDialogueOverlay");
  dom.dialogueRole = document.getElementById("lobbyDialogueRole");
  dom.dialogueTitle = document.getElementById("lobbyDialogueTitle");
  dom.dialogueSpeaker = document.getElementById("lobbyDialogueSpeaker");
  dom.dialogueText = document.getElementById("lobbyDialogueText");
  dom.dialogueTopics = document.getElementById("lobbyDialogueTopics");
  dom.dialoguePortrait = document.getElementById("lobbyDialoguePortrait");
  dom.dialogueClose = document.getElementById("lobbyDialogueCloseButton");
  dom.dialogueConfirm = document.getElementById("lobbyDialogueConfirmButton");
  dom.dialogueClose?.addEventListener("click", closeLobbyDialogue);
  dom.dialogueConfirm?.addEventListener("click", closeLobbyDialogue);
  dom.dialogue?.addEventListener("click", (event) => {
    if (event.target === dom.dialogue) closeLobbyDialogue();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isLobbyDialogueOpen()) {
      event.preventDefault();
      event.stopPropagation();
      closeLobbyDialogue();
    }
  }, { capture: true });
}

export function updateLobbyUi() {
  const active = Boolean(state.lobby?.active);
  document.body.classList.toggle("is-lobby", active);
  dom.hud?.setAttribute("aria-hidden", active ? "false" : "true");
  if (!active) return;

  const interaction = state.mode === "lobby" && !state.lobby.modalOpen
    ? allLobbyInteractions().find((entry) => entry.id === state.lobby.nearbyInteractionId)
    : null;
  if (dom.prompt) dom.prompt.hidden = !interaction;
  if (interaction) {
    dom.promptTitle.textContent = interaction.title;
    dom.promptHint.textContent = interaction.hint;
  }

  const launch = state.lobby.pendingLaunch;
  if (dom.launch) {
    dom.launch.hidden = !launch;
    if (launch) {
      const progress = Math.min(1, launch.elapsed / launch.duration);
      dom.launchText.textContent = `${launch.runMode === "random" ? "异常航线" : "稳定航线"}充能 ${Math.round(progress * 100)}%`;
      dom.launchBar.style.setProperty("--launch-progress", `${progress * 100}%`);
    }
  }

  const toast = state.lobby.toast;
  if (dom.toast) {
    dom.toast.hidden = !toast;
    if (toast) {
      dom.toast.textContent = toast.text;
      dom.toast.style.setProperty("--lobby-toast-color", toast.color);
      dom.toast.style.opacity = String(Math.min(1, toast.life * 2, (toast.maxLife - toast.life) * 5 + 0.1));
    }
  }
}

export function openGuideDialogue() {
  openLobbyDialogue({
    role: "TRANSIT GUIDE // ACTIVE",
    title: "星舰向导",
    speaker: "向导 · 伊芙",
    color: "#42e8ff",
    text: "欢迎回来，幸存者。这里是沿时间线航行的霓虹中转舰。你可以询问星舰设施、基础操作、战斗成长或这片废墟的来历。",
    topics: GUIDE_TOPICS,
  });
}

export function openNpcDialogue(dialogue) {
  return openLobbyDialogue(dialogue || {});
}

export function openLobbyMessage({ role = "FACILITY STATUS", title, speaker, text, color = "#42e8ff" }) {
  openLobbyDialogue({
    role,
    title: title || "设施通讯",
    speaker: speaker || "中转站系统",
    text,
    color,
    topics: [],
  });
}

export function openLobbyDialogue({ role, title, speaker, text, color = "#42e8ff", portrait = "system", topics = [] }) {
  if (!dom.dialogue) return false;
  dom.dialogueRole.textContent = role || "TRANSIT HUB";
  dom.dialogueTitle.textContent = title || "中转站通讯";
  dom.dialogueSpeaker.textContent = speaker || "中转站系统";
  dom.dialogueText.textContent = text || "";
  dom.dialogueTopics.replaceChildren();
  dom.dialoguePortrait?.style.setProperty("--dialogue-color", color);
  if (dom.dialoguePortrait) dom.dialoguePortrait.dataset.portrait = portrait;
  for (const topic of topics) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = topic.label;
    button.addEventListener("click", () => {
      for (const sibling of dom.dialogueTopics.querySelectorAll("button")) sibling.classList.remove("active");
      button.classList.add("active");
      dom.dialogueText.textContent = topic.text;
    });
    dom.dialogueTopics.appendChild(button);
  }
  dom.dialogue.classList.add("active");
  dom.dialogue.setAttribute("aria-hidden", "false");
  setLobbyModalOpen(true);
  onModalChange?.(true);
  window.setTimeout(() => (topics[0] ? dom.dialogueTopics.querySelector("button") : dom.dialogueConfirm)?.focus({ preventScroll: true }), 0);
  return true;
}

export function closeLobbyDialogue() {
  if (!isLobbyDialogueOpen()) return false;
  dom.dialogue.classList.remove("active");
  dom.dialogue.setAttribute("aria-hidden", "true");
  endLobbyNpcConversation();
  setLobbyModalOpen(false);
  onModalChange?.(false);
  return true;
}

export function isLobbyDialogueOpen() {
  return Boolean(dom.dialogue?.classList.contains("active"));
}
