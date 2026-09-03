import { listFeedback, submitFeedback } from "../services/backendProgressService.js";

const dom = {};
let onOpen = null;
let onClose = null;
let loading = false;

export function initFeedbackUi(options = {}) {
  onOpen = options.onOpen || null;
  onClose = options.onClose || null;
  dom.overlay = document.getElementById("feedbackOverlay");
  dom.close = document.getElementById("feedbackCloseButton");
  dom.form = document.getElementById("feedbackForm");
  dom.message = document.getElementById("feedbackMessage");
  dom.status = document.getElementById("feedbackStatus");
  dom.submit = document.getElementById("feedbackSubmitButton");
  dom.refresh = document.getElementById("feedbackRefreshButton");
  dom.list = document.getElementById("feedbackList");
  dom.close?.addEventListener("click", closeFeedback);
  dom.refresh?.addEventListener("click", refreshFeedback);
  dom.form?.addEventListener("submit", handleSubmit);
  dom.overlay?.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeFeedback();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isFeedbackOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    closeFeedback();
  }, { capture: true });
}

export function openFeedback() {
  if (!dom.overlay) return false;
  dom.overlay.classList.add("active");
  dom.overlay.setAttribute("aria-hidden", "false");
  setStatus("正在读取公开反馈...");
  onOpen?.();
  refreshFeedback();
  window.setTimeout(() => dom.message?.focus({ preventScroll: true }), 0);
  return true;
}

export function closeFeedback() {
  if (!isFeedbackOpen()) return false;
  dom.overlay.classList.remove("active");
  dom.overlay.setAttribute("aria-hidden", "true");
  onClose?.();
  return true;
}

export function isFeedbackOpen() {
  return Boolean(dom.overlay?.classList.contains("active"));
}

async function handleSubmit(event) {
  event.preventDefault();
  if (loading) return;
  const message = String(dom.message?.value || "").trim();
  if (message.length < 4) {
    setStatus("请至少输入 4 个字。", true);
    return;
  }
  loading = true;
  syncBusy();
  setStatus("正在提交反馈...");
  const result = await submitFeedback({ message });
  loading = false;
  syncBusy();
  if (!result.ok) {
    setStatus(result.enabled ? `提交失败：${result.error || "服务器暂不可用"}` : "提交失败：未配置服务器。", true);
    return;
  }
  if (dom.message) dom.message.value = "";
  setStatus("反馈已提交，并已公开显示。");
  await refreshFeedback();
}

async function refreshFeedback() {
  if (loading && dom.list?.children.length) return;
  const result = await listFeedback({ limit: 60 });
  if (!result.enabled) {
    renderEmpty("当前未配置服务器，无法读取公开反馈。");
    return;
  }
  if (result.error) {
    renderEmpty(`读取失败：${result.error}`);
    return;
  }
  renderFeedbackList(result.entries);
  if (!result.entries.length) setStatus("暂时还没有公开反馈。");
}

function renderFeedbackList(entries = []) {
  if (!dom.list) return;
  dom.list.replaceChildren();
  if (!entries.length) {
    renderEmpty("还没有玩家提交反馈。");
    return;
  }
  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "feedback-card";
    const date = formatFeedbackTime(entry.createdAt);
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(entry.nickname || "Anonymous")}</strong>
        <span>${escapeHtml(date)}</span>
      </header>
      <p>${escapeHtml(entry.message || "")}</p>
      <em>${escapeHtml(statusLabel(entry.status))}</em>`;
    dom.list.appendChild(card);
  }
}

function renderEmpty(message) {
  if (!dom.list) return;
  dom.list.innerHTML = `<div class="feedback-empty">${escapeHtml(message)}</div>`;
}

function syncBusy() {
  if (dom.submit) dom.submit.disabled = loading;
  if (dom.refresh) dom.refresh.disabled = loading;
}

function setStatus(message, error = false) {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.classList.toggle("error", Boolean(error));
}

function statusLabel(status) {
  return status === "resolved" ? "已修复" : status === "reviewing" ? "确认中" : "已公开";
}

function formatFeedbackTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
