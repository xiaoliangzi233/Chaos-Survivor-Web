import { state } from "../state.js";
import { isRemoteSignalConfigured, roomIdFromSearch } from "../net/lanRoomService.js";
import { netRuntime, networkStatus } from "../net/netState.js";
import {
  acceptGuestAnswer,
  acceptHostOffer,
  createHostOffer,
  createLanHostRoom,
  disconnectPeer,
  joinLanRoom,
} from "../net/p2pSession.js";

const dom = {};
let onModalChange = null;
let pendingJoinRoomId = "";

export function initMultiplayerUi({ onModalChange: modalChange } = {}) {
  onModalChange = modalChange || null;
  dom.overlay = document.getElementById("multiplayerOverlay");
  dom.closeButton = document.getElementById("multiplayerCloseButton");
  dom.status = document.getElementById("multiplayerStatus");
  dom.createRoomButton = document.getElementById("multiplayerCreateRoomButton");
  dom.roomCard = document.getElementById("multiplayerRoomCard");
  dom.roomId = document.getElementById("multiplayerRoomId");
  dom.inviteLink = document.getElementById("multiplayerInviteLink");
  dom.copyInviteButton = document.getElementById("multiplayerCopyInviteButton");
  dom.roomInput = document.getElementById("multiplayerRoomInput");
  dom.joinRoomButton = document.getElementById("multiplayerJoinRoomButton");
  dom.joinHint = document.getElementById("multiplayerJoinHint");
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

  applySignalModeCopy();

  pendingJoinRoomId = roomIdFromSearch();
  if (pendingJoinRoomId) setJoinInvite(pendingJoinRoomId);
  dom.closeButton?.addEventListener("click", closeMultiplayerPanel);
  dom.overlay?.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeMultiplayerPanel();
  });
  dom.createRoomButton?.addEventListener("click", createRoom);
  dom.copyInviteButton?.addEventListener("click", () => copyText(dom.inviteLink?.value, "邀请链接已复制。"));
  dom.joinRoomButton?.addEventListener("click", joinRoom);
  dom.roomInput?.addEventListener("input", () => {
    dom.roomInput.value = dom.roomInput.value.replace(/\D/g, "").slice(0, 6);
  });
  dom.createHostButton?.addEventListener("click", createHostCode);
  dom.createAnswerButton?.addEventListener("click", createAnswerCode);
  dom.acceptAnswerButton?.addEventListener("click", acceptAnswerCode);
  dom.copyHostButton?.addEventListener("click", () => copyText(dom.hostOffer?.value, "主机码已复制。"));
  dom.copyAnswerButton?.addEventListener("click", () => copyText(dom.guestAnswer?.value, "应答码已复制。"));
  dom.disconnectButton?.addEventListener("click", () => {
    disconnectPeer();
    clearRoomCard();
    renderStatus("联机已取消。");
  });
  netRuntime.onStatus = () => renderStatus();
  renderStatus();
}

export function hasPendingJoinInvite() {
  return Boolean(pendingJoinRoomId);
}

export function openMultiplayerPanel() {
  dom.overlay?.classList.add("active");
  dom.overlay?.setAttribute("aria-hidden", "false");
  onModalChange?.(true);
  renderStatus();
  if (pendingJoinRoomId) window.setTimeout(() => dom.joinRoomButton?.focus({ preventScroll: true }), 0);
}

export function closeMultiplayerPanel() {
  dom.overlay?.classList.remove("active");
  dom.overlay?.setAttribute("aria-hidden", "true");
  onModalChange?.(false);
}

export function updateMultiplayerUi() {
  document.body.classList.toggle("is-multiplayer", Boolean(state.multiplayer?.enabled));
  if (dom.overlay?.classList.contains("active")) renderStatus();
}

async function createRoom() {
  await runAction(async () => {
    const room = await createLanHostRoom();
    if (dom.roomId) dom.roomId.textContent = room.roomId;
    if (dom.inviteLink) dom.inviteLink.value = room.inviteUrl;
    if (dom.roomCard) dom.roomCard.hidden = false;
    renderStatus("房间 " + room.roomId + " 已创建，等待伙伴通过邀请链接加入。");
  });
}

async function joinRoom() {
  await runAction(async () => {
    const roomId = dom.roomInput?.value || pendingJoinRoomId;
    const room = await joinLanRoom(roomId);
    pendingJoinRoomId = "";
    removeJoinQuery();
    renderStatus("已加入房间 " + room.roomId + "，正在建立 P2P 通道。");
  });
}

async function createHostCode() {
  await runAction(async () => {
    const code = await createHostOffer();
    dom.hostOffer.value = code;
    renderStatus("主机码已生成，等待客机应答码。");
  });
}

async function createAnswerCode() {
  await runAction(async () => {
    const code = await acceptHostOffer(dom.guestOffer.value);
    dom.guestAnswer.value = code;
    renderStatus("应答码已生成，请发送给主机。");
  });
}

async function acceptAnswerCode() {
  await runAction(async () => {
    await acceptGuestAnswer(dom.hostAnswer.value);
    renderStatus("正在建立 P2P 通道。");
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
  for (const button of [
    dom.createRoomButton,
    dom.joinRoomButton,
    dom.createHostButton,
    dom.createAnswerButton,
    dom.acceptAnswerButton,
  ]) {
    if (button) button.disabled = Boolean(busy);
  }
}

function applySignalModeCopy() {
  const online = isRemoteSignalConfigured();
  const sections = dom.overlay?.querySelectorAll(".multiplayer-lan-grid section") || [];
  const hostTitle = sections[0]?.querySelector("h3");
  const hostDescription = sections[0]?.querySelector("p");
  const guestTitle = sections[1]?.querySelector("h3");
  if (hostTitle) hostTitle.textContent = online ? "P1 主机 · 创建在线房间" : "P1 主机 · 创建局域网房间";
  if (hostDescription) {
    hostDescription.textContent = online
      ? "创建后复制邀请链接。伙伴从任意浏览器打开游戏页面即可加入。"
      : "使用 start.cmd -Lan 启动后，创建一个仅在 Radmin 网络中有效的临时房间。";
  }
  if (guestTitle) guestTitle.textContent = online ? "P2 客机 · 加入在线房间" : "P2 客机 · 加入局域网房间";
  if (dom.createRoomButton) dom.createRoomButton.textContent = online ? "创建在线房间" : "创建局域网房间";
  if (dom.joinRoomButton) dom.joinRoomButton.textContent = online ? "加入在线房间" : "加入局域网房间";
  if (dom.joinHint) {
    dom.joinHint.textContent = online
      ? "打开主机发来的邀请链接后点击加入；也可以输入 6 位房间号。"
      : "打开主机发来的邀请链接后，输入 6 位房间号即可加入。";
  }
}

async function copyText(value, successMessage) {
  const text = String(value || "").trim();
  if (!text) {
    renderStatus("请先创建局域网房间。", true);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const helper = document.createElement("textarea");
      helper.value = text;
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) throw new Error("copy failed");
    }
    renderStatus(successMessage);
  } catch {
    renderStatus("无法自动复制，请手动复制邀请链接。", true);
  }
}

function setJoinInvite(roomId) {
  if (dom.roomInput) dom.roomInput.value = roomId;
  if (dom.joinHint) dom.joinHint.textContent = "邀请房间 " + roomId + " 已就绪，点击加入即可。";
}

function clearRoomCard() {
  if (dom.roomCard) dom.roomCard.hidden = true;
  if (dom.inviteLink) dom.inviteLink.value = "";
}

function removeJoinQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url);
}

function renderStatus(message = "", error = false) {
  if (!dom.status) return;
  const status = networkStatus();
  const role = status.role === "host" ? "P1 主机" : status.role === "guest" ? "P2 客机" : "未联机";
  const labels = {
    "creating-room": "创建房间中",
    "waiting-guest": "等待伙伴加入",
    "joining-room": "正在加入房间",
    "waiting-host": "等待主机建立通道",
    connected: "已连接",
  };
  const connection = status.connected
    ? "已连接 " + (status.peerName || "对端") + (status.latencyMs ? " // " + status.latencyMs + "ms" : "")
    : labels[status.status] || status.status || "待机";
  dom.status.textContent = message || role + " // " + connection;
  dom.status.classList.toggle("error", Boolean(error || status.lastError || status.status === "room-error"));
}
