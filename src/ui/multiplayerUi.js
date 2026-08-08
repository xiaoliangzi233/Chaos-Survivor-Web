import { state } from "../state.js";
import { netRuntime, networkStatus } from "../net/netState.js";
import {
  acceptGuestAnswer,
  acceptHostOffer,
  createHostOffer,
  disconnectPeer,
} from "../net/p2pSession.js";

const dom = {};
let onModalChange = null;

export function initMultiplayerUi({ onModalChange: modalChange } = {}) {
  onModalChange = modalChange || null;
  dom.openButton = document.getElementById("multiplayerButton");
  dom.overlay = document.getElementById("multiplayerOverlay");
  dom.closeButton = document.getElementById("multiplayerCloseButton");
  dom.status = document.getElementById("multiplayerStatus");
  dom.hostOffer = document.getElementById("multiplayerHostOffer");
  dom.guestOffer = document.getElementById("multiplayerGuestOffer");
  dom.guestAnswer = document.getElementById("multiplayerGuestAnswer");
  dom.hostAnswer = document.getElementById("multiplayerHostAnswer");
  dom.createHostButton = document.getElementById("multiplayerCreateHostButton");
  dom.createAnswerButton = document.getElementById("multiplayerCreateAnswerButton");
  dom.acceptAnswerButton = document.getElementById("multiplayerAcceptAnswerButton");
  dom.copyHostButton = document.getElementById("multiplayerCopyHostButton");
  dom.copyAnswerButton = document.getElementById("multiplayerCopyAnswerButton");
  dom.disconnectButton = document.getElementById("multiplayerDisconnectButton");

  dom.openButton?.addEventListener("click", openMultiplayerPanel);
  dom.closeButton?.addEventListener("click", closeMultiplayerPanel);
  dom.overlay?.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeMultiplayerPanel();
  });
  dom.createHostButton?.addEventListener("click", createHostCode);
  dom.createAnswerButton?.addEventListener("click", createAnswerCode);
  dom.acceptAnswerButton?.addEventListener("click", acceptAnswerCode);
  dom.copyHostButton?.addEventListener("click", () => copyCode(dom.hostOffer, "主机码已复制。"));
  dom.copyAnswerButton?.addEventListener("click", () => copyCode(dom.guestAnswer, "应答码已复制。"));
  dom.disconnectButton?.addEventListener("click", () => {
    disconnectPeer();
    renderStatus("已断开联机。");
  });
  netRuntime.onStatus = () => renderStatus();
  renderStatus();
}

export function updateMultiplayerUi() {
  const status = networkStatus();
  document.body.classList.toggle("is-multiplayer", Boolean(state.multiplayer?.enabled));
  if (dom.openButton) {
    dom.openButton.classList.toggle("connected", status.connected);
    dom.openButton.setAttribute("aria-label", status.connected ? `联机已连接：${status.peerName}` : "打开联机面板");
  }
  if (!dom.overlay?.classList.contains("active")) return;
  renderStatus();
}

export function openMultiplayerPanel() {
  dom.overlay?.classList.add("active");
  dom.overlay?.setAttribute("aria-hidden", "false");
  dom.openButton?.setAttribute("aria-expanded", "true");
  onModalChange?.(true);
  renderStatus();
}

export function closeMultiplayerPanel() {
  dom.overlay?.classList.remove("active");
  dom.overlay?.setAttribute("aria-hidden", "true");
  dom.openButton?.setAttribute("aria-expanded", "false");
  onModalChange?.(false);
}

async function createHostCode() {
  await runAction(async () => {
    const code = await createHostOffer();
    dom.hostOffer.value = code;
    renderStatus("主机码已生成。把它发给 P2，等待对方返回应答码。");
  });
}

async function createAnswerCode() {
  await runAction(async () => {
    const code = await acceptHostOffer(dom.guestOffer.value);
    dom.guestAnswer.value = code;
    renderStatus("应答码已生成。把它发回给 P1 主机。");
  });
}

async function acceptAnswerCode() {
  await runAction(async () => {
    await acceptGuestAnswer(dom.hostAnswer.value);
    renderStatus("已导入应答码，正在建立 P2P 通道。");
  });
}

async function runAction(action) {
  setBusy(true);
  try {
    await action();
  } catch (error) {
    renderStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  for (const button of [dom.createHostButton, dom.createAnswerButton, dom.acceptAnswerButton]) {
    if (button) button.disabled = Boolean(busy);
  }
}

async function copyCode(textarea, successMessage) {
  const text = textarea?.value?.trim();
  if (!text) {
    renderStatus("请先生成联机码。", true);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      textarea.focus();
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("copy failed");
      textarea.setSelectionRange(0, 0);
    }
    renderStatus(successMessage);
  } catch {
    renderStatus("无法自动复制，请长按或手动复制联机码。", true);
  }
}

function renderStatus(message = "", error = false) {
  if (!dom.status) return;
  const status = networkStatus();
  const role = status.role === "host" ? "P1 主机" : status.role === "guest" ? "P2 客机" : "未联机";
  const connected = status.connected ? `已连接 ${status.peerName || "对端"}` : status.status;
  dom.status.textContent = message || `${role} // ${connected}${status.latencyMs ? ` // ${status.latencyMs}ms` : ""}`;
  dom.status.classList.toggle("error", Boolean(error || status.lastError));
}
