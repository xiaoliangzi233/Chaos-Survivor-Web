import { state } from "../state.js";
import {
  allLobbyInteractions,
  endLobbyNpcConversation,
  lobbyNpcRuntime,
  setLobbyModalOpen,
} from "../systems/lobby.js";
import { drawLobbyNpcAvatar } from "../systems/lobbyRenderer.js";

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
let dialogueState = null;
let portraitFrame = 0;

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
  dom.dialoguePage = document.getElementById("lobbyDialoguePage");
  dom.dialogueClose = document.getElementById("lobbyDialogueCloseButton");
  dom.dialogueEnd = document.getElementById("lobbyDialogueEndButton");
  dom.dialogueConfirm = document.getElementById("lobbyDialogueConfirmButton");
  dom.dialogueClose?.addEventListener("click", closeLobbyDialogue);
  dom.dialogueEnd?.addEventListener("click", closeLobbyDialogue);
  dom.dialogueConfirm?.addEventListener("click", continueLobbyDialogue);
  dom.dialogue?.addEventListener("click", (event) => {
    if (event.target === dom.dialogue) closeLobbyDialogue();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isLobbyDialogueOpen()) {
      event.preventDefault();
      event.stopPropagation();
      closeLobbyDialogue();
    } else if (event.key === "Enter" && isLobbyDialogueOpen() && !dom.dialogueConfirm?.hidden) {
      event.preventDefault();
      continueLobbyDialogue();
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

export function openLobbyDialogue({ role, title, speaker, text, pages, color = "#42e8ff", portrait = "system", npcId = null, topics = [] }) {
  if (!dom.dialogue) return false;
  dom.dialogueRole.textContent = role || "TRANSIT HUB";
  dom.dialogueTitle.textContent = title || "中转站通讯";
  dom.dialogueSpeaker.textContent = speaker || "中转站系统";
  dom.dialogueTopics.replaceChildren();
  dom.dialoguePortrait?.style.setProperty("--dialogue-color", color);
  if (dom.dialoguePortrait) dom.dialoguePortrait.dataset.portrait = portrait;
  dialogueState = {
    introPages: normalizeDialoguePages(pages, text),
    pages: normalizeDialoguePages(pages, text),
    pageIndex: 0,
    activeTopicId: null,
    portrait,
    npcId: npcId || (portrait !== "system" ? portrait : null),
    color,
    topics: topics.map((topic) => ({ ...topic, pages: normalizeDialoguePages(topic.pages, topic.text) })),
  };
  for (const topic of dialogueState.topics) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = topic.label;
    button.addEventListener("click", () => {
      for (const sibling of dom.dialogueTopics.querySelectorAll("button")) sibling.classList.remove("active");
      button.classList.add("active");
      dialogueState.activeTopicId = topic.id;
      dialogueState.pages = topic.pages;
      dialogueState.pageIndex = 0;
      renderDialoguePage();
    });
    dom.dialogueTopics.appendChild(button);
  }
  dom.dialogue.classList.add("active");
  dom.dialogue.setAttribute("aria-hidden", "false");
  setLobbyModalOpen(true);
  onModalChange?.(true);
  renderDialoguePage();
  startPortraitAnimation();
  window.setTimeout(() => dom.dialogueConfirm?.focus({ preventScroll: true }), 0);
  return true;
}

export function normalizeDialoguePages(pages, text = "") {
  const source = Array.isArray(pages) && pages.length ? pages : [text];
  return source.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 32);
}

export function continueLobbyDialogue() {
  if (!dialogueState) return false;
  if (dialogueState.pageIndex < dialogueState.pages.length - 1) {
    dialogueState.pageIndex++;
    renderDialoguePage();
    return true;
  }
  if (dialogueState.activeTopicId) {
    dialogueState.activeTopicId = null;
    dialogueState.pages = dialogueState.introPages;
    dialogueState.pageIndex = Math.max(0, dialogueState.introPages.length - 1);
    for (const button of dom.dialogueTopics.querySelectorAll("button")) button.classList.remove("active");
    renderDialoguePage();
    dom.dialogueTopics.querySelector("button")?.focus({ preventScroll: true });
    return true;
  }
  return false;
}

function renderDialoguePage() {
  if (!dialogueState) return;
  const count = dialogueState.pages.length;
  const index = Math.min(Math.max(0, dialogueState.pageIndex), Math.max(0, count - 1));
  dom.dialogueText.textContent = dialogueState.pages[index] || "";
  if (dom.dialoguePage) {
    dom.dialoguePage.textContent = count > 1 ? `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}` : "CHANNEL READY";
  }
  const hasNext = index < count - 1;
  const returnsToTopics = !hasNext && Boolean(dialogueState.activeTopicId);
  if (dom.dialogueConfirm) {
    dom.dialogueConfirm.hidden = !hasNext && !returnsToTopics;
    dom.dialogueConfirm.textContent = returnsToTopics ? "返回话题" : "继续";
  }
}

function startPortraitAnimation() {
  window.cancelAnimationFrame(portraitFrame);
  const render = (now) => {
    if (!isLobbyDialogueOpen() || !dialogueState || !dom.dialoguePortrait) return;
    const canvas = dom.dialoguePortrait;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (dialogueState.npcId) {
      const runtime = lobbyNpcRuntime(dialogueState.npcId) || {};
      drawLobbyNpcAvatar(ctx, dialogueState.npcId, { ...runtime, mode: "playerTalk" }, {
        time: now / 1000,
        x: canvas.width / 2,
        y: canvas.height * 0.43,
        scale: 2.55,
        face: 1,
        drawRing: true,
      });
    } else {
      drawSystemPortrait(ctx, canvas, dialogueState.color, now / 1000);
    }
    portraitFrame = window.requestAnimationFrame(render);
  };
  portraitFrame = window.requestAnimationFrame(render);
}

function drawSystemPortrait(ctx, canvas, color, time) {
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.48;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}22`;
  ctx.lineWidth = 5;
  for (let index = 0; index < 3; index++) {
    ctx.beginPath();
    ctx.arc(0, 0, 34 + index * 24, time * (0.5 + index * 0.12), time * (0.5 + index * 0.12) + Math.PI * 1.35);
    ctx.stroke();
  }
  ctx.rotate(time * 0.45);
  ctx.fillRect(-24, -24, 48, 48);
  ctx.strokeRect(-24, -24, 48, 48);
  ctx.restore();
}

export function closeLobbyDialogue() {
  if (!isLobbyDialogueOpen()) return false;
  dom.dialogue.classList.remove("active");
  dom.dialogue.setAttribute("aria-hidden", "true");
  endLobbyNpcConversation();
  window.cancelAnimationFrame(portraitFrame);
  portraitFrame = 0;
  dialogueState = null;
  setLobbyModalOpen(false);
  onModalChange?.(false);
  return true;
}

export function isLobbyDialogueOpen() {
  return Boolean(dom.dialogue?.classList.contains("active"));
}
