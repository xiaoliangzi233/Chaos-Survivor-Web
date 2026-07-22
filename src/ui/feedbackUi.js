import { formatEmployeeId } from "../services/userProfile.js";
import {
  createFeedback,
  deleteFeedback,
  fetchFeedback,
  updateFeedback,
} from "../systems/feedback.js";

const PAGE_SIZE = 5;
const MAX_CONTENT_LENGTH = 100;
const dom = {};

let currentSession = { status: "idle", user: null, error: "" };
let onBeforeOpen = null;
let onRefreshIdentity = null;
let activeScope = "ALL";
let currentData = null;
let requestSerial = 0;
let listBusy = false;
let actionBusy = false;
let editingItem = null;
let deleteItem = null;
let scopePages = { ALL: 1, MINE: 1 };
let scopeTotals = { ALL: null, MINE: null };

export function initFeedbackUi(options = {}) {
  dom.overlay = document.getElementById("feedbackOverlay");
  dom.panel = dom.overlay?.querySelector(".feedback-panel");
  dom.openButton = document.getElementById("feedbackButton");
  dom.closeButton = document.getElementById("feedbackCloseButton");
  dom.filters = document.getElementById("feedbackFilters");
  dom.rows = document.getElementById("feedbackRows");
  dom.prevButton = document.getElementById("feedbackPrevButton");
  dom.nextButton = document.getElementById("feedbackNextButton");
  dom.pageNumbers = document.getElementById("feedbackPageNumbers");
  dom.listStatus = document.getElementById("feedbackListStatus");
  dom.form = document.getElementById("feedbackForm");
  dom.content = document.getElementById("feedbackContent");
  dom.counter = document.getElementById("feedbackCounter");
  dom.formMessage = document.getElementById("feedbackFormMessage");
  dom.composerTitle = document.getElementById("feedbackComposerTitle");
  dom.editingStatus = document.getElementById("feedbackEditingStatus");
  dom.cancelEditButton = document.getElementById("feedbackCancelEditButton");
  dom.submitButton = document.getElementById("feedbackSubmitButton");
  dom.deleteDialog = document.getElementById("feedbackDeleteDialog");
  dom.deleteCancelButton = document.getElementById("feedbackDeleteCancelButton");
  dom.deleteConfirmButton = document.getElementById("feedbackDeleteConfirmButton");
  if (!dom.overlay || !dom.panel || !dom.openButton || !dom.closeButton || !dom.rows || !dom.form) return;

  currentSession = options.session || currentSession;
  onBeforeOpen = options.onBeforeOpen || null;
  onRefreshIdentity = options.onRefreshIdentity || null;

  dom.openButton.addEventListener("click", toggleFeedback);
  dom.closeButton.addEventListener("click", closeFeedback);
  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeFeedback();
  });
  dom.filters.addEventListener("click", handleFilterClick);
  dom.prevButton.addEventListener("click", () => changePage(scopePages[activeScope] - 1));
  dom.nextButton.addEventListener("click", () => changePage(scopePages[activeScope] + 1));
  dom.pageNumbers.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (button) changePage(Number(button.dataset.page));
  });
  dom.rows.addEventListener("click", handleRowAction);
  dom.content.addEventListener("input", renderComposerState);
  dom.form.addEventListener("submit", handleSubmit);
  dom.cancelEditButton.addEventListener("click", cancelEditing);
  dom.deleteCancelButton.addEventListener("click", closeDeleteDialog);
  dom.deleteConfirmButton.addEventListener("click", confirmDelete);
  document.addEventListener("keydown", handleKeydown);
  window.matchMedia("(max-width: 899px)").addEventListener("change", (event) => {
    if (event.matches) closeFeedback();
  });

  updateFilters();
  renderComposerState();
}

export function setFeedbackUserSession(session) {
  const previousUserId = currentSession.user?.id || "";
  const nextUserId = session?.user?.id || "";
  currentSession = session || currentSession;
  if (previousUserId !== nextUserId) resetForIdentityChange();
  renderComposerState();
  if (isFeedbackOpen()) void loadFeedback();
}

export function isFeedbackOpen() {
  return Boolean(dom.overlay?.classList.contains("active"));
}

export function toggleFeedback() {
  if (isFeedbackOpen()) closeFeedback();
  else openFeedback();
}

export function openFeedback() {
  if (!dom.overlay || window.matchMedia("(max-width: 899px)").matches) return;
  onBeforeOpen?.();
  dom.overlay.classList.add("active");
  document.body.classList.add("feedback-open");
  dom.overlay.setAttribute("aria-hidden", "false");
  dom.openButton.setAttribute("aria-expanded", "true");
  dom.openButton.classList.add("active");
  dom.closeButton.focus({ preventScroll: true });
  updateFilters();
  renderComposerState();
  void loadFeedback();
}

export function closeFeedback() {
  if (!dom.overlay) return;
  requestSerial++;
  const wasOpen = isFeedbackOpen();
  closeDeleteDialog({ restoreFocus: false });
  dom.overlay.classList.remove("active");
  document.body.classList.remove("feedback-open");
  dom.overlay.setAttribute("aria-hidden", "true");
  dom.openButton?.setAttribute("aria-expanded", "false");
  dom.openButton?.classList.remove("active");
  if (wasOpen) dom.openButton?.focus({ preventScroll: true });
}

async function loadFeedback({ retryIdentity = true } = {}) {
  if (!isFeedbackOpen()) return;
  if (currentSession.status !== "ready") {
    renderUnavailable();
    return;
  }
  const serial = ++requestSerial;
  setListBusy(true);
  renderLoading();
  try {
    const data = await fetchFeedback({
      scope: activeScope,
      page: scopePages[activeScope],
      pageSize: PAGE_SIZE,
    });
    if (serial !== requestSerial || !isFeedbackOpen()) return;
    const totalPages = Math.max(1, Number(data.totalPages) || 1);
    if (scopePages[activeScope] > totalPages) {
      scopePages[activeScope] = totalPages;
      return void loadFeedback({ retryIdentity });
    }
    currentData = data;
    scopePages[activeScope] = Math.max(1, Number(data.page) || 1);
    scopeTotals[activeScope] = Math.max(0, Number(data.totalItems) || 0);
    renderRows(data.items || []);
    renderPagination(data);
  } catch (error) {
    if (serial !== requestSerial || !isFeedbackOpen()) return;
    if (error?.status === 401 && retryIdentity && onRefreshIdentity) {
      const session = await onRefreshIdentity();
      if (serial !== requestSerial || !isFeedbackOpen()) return;
      if (session) currentSession = session;
      if (currentSession.status === "ready") return void loadFeedback({ retryIdentity: false });
    }
    renderError(error?.message || "反馈列表加载失败");
  } finally {
    if (serial === requestSerial) setListBusy(false);
  }
}

function renderRows(items) {
  dom.rows.innerHTML = "";
  if (!items.length) {
    renderEmpty(activeScope === "MINE" ? "你还没有提交反馈" : "暂时还没有反馈建议");
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = `feedback-row${item.currentUser ? " current" : ""}`;
    row.style.setProperty("--feedback-row-index", index);

    const head = document.createElement("header");
    const identity = document.createElement("div");
    const username = document.createElement("strong");
    username.textContent = item.username || "未知玩家";
    const employee = document.createElement("span");
    employee.textContent = `工号：${formatEmployeeId(item.employeeId)}`;
    identity.append(username, employee);

    const time = document.createElement("time");
    time.dateTime = item.createdAt || "";
    time.textContent = formatRelativeTime(item.createdAt);
    if (item.updatedAt && item.updatedAt !== item.createdAt) {
      const edited = document.createElement("small");
      edited.textContent = "已编辑";
      time.prepend(edited);
    }
    head.append(identity, time);

    const content = document.createElement("p");
    content.textContent = item.content || "";
    content.title = item.content || "";
    row.append(head, content);

    if (item.currentUser) {
      const actions = document.createElement("div");
      actions.className = "feedback-row-actions";
      actions.append(
        actionButton("编辑", "edit", item.id),
        actionButton("删除", "delete", item.id, "danger"),
      );
      row.appendChild(actions);
    }
    dom.rows.appendChild(row);
  });
  updateControls();
}

function renderLoading() {
  currentData = null;
  dom.rows.innerHTML = "";
  for (let index = 0; index < PAGE_SIZE; index++) {
    const skeleton = document.createElement("i");
    skeleton.className = "feedback-skeleton";
    skeleton.style.setProperty("--feedback-row-index", index);
    dom.rows.appendChild(skeleton);
  }
  dom.pageNumbers.innerHTML = "";
  dom.listStatus.textContent = "正在连接反馈服务…";
  updateControls();
}

function renderUnavailable() {
  currentData = null;
  renderEmpty(currentSession.status === "loading" ? "正在识别当前玩家…" : "登录后才能查看和提交反馈", true);
  dom.pageNumbers.innerHTML = "";
  dom.listStatus.textContent = currentSession.status === "local" ? "本地免验证模式不连接反馈服务" : currentSession.error || "未识别登录用户";
  updateControls();
}

function renderError(message) {
  currentData = null;
  renderEmpty(message, true);
  dom.pageNumbers.innerHTML = "";
  dom.listStatus.textContent = "连接失败，请稍后重试";
  updateControls();
}

function renderEmpty(message, error = false) {
  dom.rows.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = `feedback-empty${error ? " error" : ""}`;
  const mark = document.createElement("i");
  const markText = document.createElement("span");
  markText.textContent = error ? "!" : "◇";
  mark.appendChild(markText);
  const text = document.createElement("p");
  text.textContent = message;
  empty.append(mark, text);
  dom.rows.appendChild(empty);
}

function renderPagination(data) {
  const page = Math.max(1, Number(data.page) || 1);
  const totalPages = Math.max(1, Number(data.totalPages) || 1);
  const totalItems = Math.max(0, Number(data.totalItems) || 0);
  dom.pageNumbers.innerHTML = "";
  for (const number of paginationRange(page, totalPages)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = String(number);
    button.textContent = String(number);
    button.classList.toggle("active", number === page);
    button.setAttribute("aria-current", number === page ? "page" : "false");
    dom.pageNumbers.appendChild(button);
  }
  dom.listStatus.textContent = totalItems
    ? `第 ${page} / ${totalPages} 页 · 共 ${totalItems} 条反馈`
    : "共 0 条反馈";
  updateControls();
}

function handleFilterClick(event) {
  const button = event.target.closest("button[data-scope]");
  if (!button || listBusy || actionBusy) return;
  const nextScope = button.dataset.scope === "MINE" ? "MINE" : "ALL";
  if (nextScope === activeScope) return;
  activeScope = nextScope;
  updateFilters();
  void loadFeedback();
}

function updateFilters() {
  for (const button of dom.filters?.querySelectorAll("button[data-scope]") || []) {
    const selected = button.dataset.scope === activeScope;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  updateControls();
}

function changePage(nextPage) {
  if (listBusy || actionBusy) return;
  const totalPages = Math.max(1, Number(currentData?.totalPages) || 1);
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(nextPage) || 1)));
  if (page === scopePages[activeScope]) return;
  scopePages[activeScope] = page;
  void loadFeedback();
}

function handleRowAction(event) {
  const button = event.target.closest("button[data-action][data-feedback-id]");
  if (!button || actionBusy) return;
  const item = currentData?.items?.find((entry) => Number(entry.id) === Number(button.dataset.feedbackId));
  if (!item?.currentUser) return;
  if (button.dataset.action === "edit") beginEditing(item);
  if (button.dataset.action === "delete") openDeleteDialog(item);
}

function beginEditing(item) {
  editingItem = item;
  dom.content.value = item.content || "";
  setFormMessage("");
  renderComposerState();
  dom.content.focus({ preventScroll: true });
  dom.content.setSelectionRange(dom.content.value.length, dom.content.value.length);
}

function cancelEditing() {
  editingItem = null;
  dom.content.value = "";
  setFormMessage("");
  renderComposerState();
  dom.content.focus({ preventScroll: true });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (actionBusy || currentSession.status !== "ready") return;
  const content = dom.content.value.trim();
  const length = unicodeLength(content);
  if (!length || length > MAX_CONTENT_LENGTH) {
    setFormMessage(length ? "反馈内容不能超过100字" : "请输入反馈建议", "error");
    renderComposerState();
    return;
  }

  setActionBusy(true);
  setFormMessage(editingItem ? "正在保存修改…" : "正在提交反馈…");
  try {
    if (editingItem) {
      await updateFeedback(editingItem.id, content);
      editingItem = null;
      dom.content.value = "";
      setFormMessage("反馈已更新", "success");
    } else {
      await createFeedback(content);
      dom.content.value = "";
      scopePages = { ALL: 1, MINE: 1 };
      adjustKnownTotals(1);
      setFormMessage("反馈已提交，感谢你的建议", "success");
    }
    await loadFeedback();
  } catch (error) {
    if (error?.status === 401 && onRefreshIdentity) {
      const session = await onRefreshIdentity();
      if (session) currentSession = session;
    }
    setFormMessage(error?.message || "反馈操作失败，请稍后重试", "error");
  } finally {
    setActionBusy(false);
    renderComposerState();
  }
}

function openDeleteDialog(item) {
  deleteItem = item;
  dom.deleteDialog.hidden = false;
  dom.deleteDialog.classList.add("active");
  dom.deleteCancelButton.focus({ preventScroll: true });
}

function closeDeleteDialog({ restoreFocus = true } = {}) {
  if (!dom.deleteDialog || dom.deleteDialog.hidden) return;
  const itemId = deleteItem?.id;
  dom.deleteDialog.classList.remove("active");
  dom.deleteDialog.hidden = true;
  deleteItem = null;
  if (restoreFocus && itemId) {
    dom.rows.querySelector(`button[data-action="delete"][data-feedback-id="${itemId}"]`)?.focus({ preventScroll: true });
  }
}

async function confirmDelete() {
  if (!deleteItem || actionBusy) return;
  const item = deleteItem;
  setActionBusy(true);
  try {
    await deleteFeedback(item.id);
    if (editingItem?.id === item.id) cancelEditing();
    adjustKnownTotals(-1);
    closeDeleteDialog({ restoreFocus: false });
    setFormMessage("反馈已删除", "success");
    await loadFeedback();
  } catch (error) {
    if (error?.status === 401 && onRefreshIdentity) {
      const session = await onRefreshIdentity();
      if (session) currentSession = session;
    }
    closeDeleteDialog({ restoreFocus: false });
    setFormMessage(error?.message || "删除失败，请稍后重试", "error");
  } finally {
    setActionBusy(false);
  }
}

function renderComposerState() {
  if (!dom.content) return;
  const normalizedLength = unicodeLength(dom.content.value.trim());
  const available = currentSession.status === "ready";
  const valid = available && normalizedLength > 0 && normalizedLength <= MAX_CONTENT_LENGTH;
  dom.counter.textContent = `${normalizedLength} / ${MAX_CONTENT_LENGTH}`;
  dom.counter.classList.toggle("over", normalizedLength > MAX_CONTENT_LENGTH);
  dom.content.classList.toggle("invalid", normalizedLength > MAX_CONTENT_LENGTH);
  dom.content.disabled = !available || actionBusy;
  dom.content.placeholder = available ? "输入你的反馈建议…" : "登录后才能提交反馈";
  dom.composerTitle.textContent = editingItem ? "编辑反馈" : "提交反馈";
  dom.editingStatus.hidden = !editingItem;
  dom.cancelEditButton.hidden = !editingItem;
  dom.cancelEditButton.disabled = actionBusy;
  dom.submitButton.textContent = editingItem ? "保存修改" : "提交反馈";
  dom.submitButton.disabled = !valid || actionBusy;
  updateControls();
}

function setListBusy(value) {
  listBusy = Boolean(value);
  updateControls();
}

function setActionBusy(value) {
  actionBusy = Boolean(value);
  renderComposerState();
}

function updateControls() {
  if (!dom.filters) return;
  const locked = listBusy || actionBusy || currentSession.status !== "ready";
  for (const button of dom.filters.querySelectorAll("button")) button.disabled = locked;
  const page = scopePages[activeScope];
  const totalPages = Math.max(1, Number(currentData?.totalPages) || 1);
  dom.prevButton.disabled = locked || page <= 1;
  dom.nextButton.disabled = locked || page >= totalPages;
  for (const button of dom.pageNumbers.querySelectorAll("button")) button.disabled = locked;
  for (const button of dom.rows.querySelectorAll("button")) button.disabled = actionBusy;
  dom.deleteCancelButton.disabled = actionBusy;
  dom.deleteConfirmButton.disabled = actionBusy;
}

function setFormMessage(message, type = "") {
  dom.formMessage.textContent = message;
  dom.formMessage.className = type;
}

function adjustKnownTotals(delta) {
  for (const scope of ["ALL", "MINE"]) {
    if (Number.isFinite(scopeTotals[scope])) scopeTotals[scope] = Math.max(0, scopeTotals[scope] + delta);
  }
}

function resetForIdentityChange() {
  requestSerial++;
  activeScope = "ALL";
  currentData = null;
  editingItem = null;
  deleteItem = null;
  scopePages = { ALL: 1, MINE: 1 };
  scopeTotals = { ALL: null, MINE: null };
  if (dom.content) dom.content.value = "";
  closeDeleteDialog({ restoreFocus: false });
  setFormMessage("");
  updateFilters();
}

function handleKeydown(event) {
  if (!isFeedbackOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (!dom.deleteDialog.hidden) closeDeleteDialog();
    else closeFeedback();
    return;
  }
  if (event.key !== "Tab") return;
  const root = dom.deleteDialog.hidden ? dom.panel : dom.deleteDialog;
  const focusable = [...root.querySelectorAll("button:not(:disabled):not([hidden]), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function actionButton(label, action, feedbackId, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.feedbackId = String(feedbackId);
  button.textContent = label;
  return button;
}

function paginationRange(page, totalPages) {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(totalPages - 2, Math.max(1, page - 1));
  return [start, start + 1, start + 2];
}

function unicodeLength(value) {
  return Array.from(String(value || "")).length;
}

function formatRelativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}
