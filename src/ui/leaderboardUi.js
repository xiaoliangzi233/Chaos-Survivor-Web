import { formatEmployeeId } from "../services/userProfile.js";
import { fetchLeaderboard, LEADERBOARD_METRICS } from "../systems/leaderboard.js";

const dom = {};
let activeMetric = "TOTAL_PLAY_SECONDS";
let currentSession = { status: "idle", user: null, error: "" };
let onBeforeOpen = null;
let onRefreshIdentity = null;
let requestSerial = 0;
let leaderboardEnabled = true;

export function initLeaderboardUi(options = {}) {
  dom.overlay = document.getElementById("leaderboardOverlay");
  dom.panel = dom.overlay?.querySelector(".leaderboard-panel");
  dom.openButton = document.getElementById("leaderboardButton");
  dom.closeButton = document.getElementById("leaderboardCloseButton");
  dom.profile = document.getElementById("leaderboardProfile");
  dom.tabs = document.getElementById("leaderboardTabs");
  dom.rows = document.getElementById("leaderboardRows");
  dom.metricLabel = document.getElementById("leaderboardMetricLabel");
  dom.status = document.getElementById("leaderboardStatus");
  dom.refreshButton = document.getElementById("leaderboardRefreshButton");
  if (!dom.overlay || !dom.openButton || !dom.closeButton || !dom.profile || !dom.tabs || !dom.rows) return;

  leaderboardEnabled = options.enabled !== false;
  onBeforeOpen = options.onBeforeOpen || null;
  onRefreshIdentity = options.onRefreshIdentity || null;
  currentSession = options.session || currentSession;
  if (!leaderboardEnabled) {
    dom.openButton.hidden = true;
    dom.openButton.disabled = true;
    dom.openButton.style.display = "none";
    dom.overlay.hidden = true;
    dom.overlay.style.display = "none";
    dom.overlay.classList.remove("active");
    dom.overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("leaderboard-open");
    return;
  }
  dom.openButton.addEventListener("click", toggleLeaderboard);
  dom.closeButton.addEventListener("click", closeLeaderboard);
  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeLeaderboard();
  });
  dom.refreshButton?.addEventListener("click", refreshLeaderboard);
  dom.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-metric]");
    if (!button) return;
    activeMetric = button.dataset.metric;
    updateTabs();
    void loadLeaderboard();
  });
  document.addEventListener("keydown", handleKeydown);
  window.matchMedia("(max-width: 899px)").addEventListener("change", (event) => {
    if (event.matches) closeLeaderboard();
  });
  renderProfile(null);
}

export function setLeaderboardUserSession(session) {
  currentSession = session || currentSession;
  if (!leaderboardEnabled) return;
  if (isLeaderboardOpen()) {
    renderProfile(null);
    void loadLeaderboard();
  }
}

export function isLeaderboardOpen() {
  return leaderboardEnabled && Boolean(dom.overlay?.classList.contains("active"));
}

export function toggleLeaderboard() {
  if (isLeaderboardOpen()) closeLeaderboard();
  else openLeaderboard();
}

export function openLeaderboard() {
  if (!leaderboardEnabled || !dom.overlay || window.matchMedia("(max-width: 899px)").matches) return;
  onBeforeOpen?.();
  dom.overlay.classList.add("active");
  document.body.classList.add("leaderboard-open");
  dom.overlay.setAttribute("aria-hidden", "false");
  dom.openButton.setAttribute("aria-expanded", "true");
  dom.openButton.classList.add("active");
  dom.closeButton.focus({ preventScroll: true });
  updateTabs();
  void loadLeaderboard();
}

export function closeLeaderboard() {
  if (!dom.overlay) return;
  requestSerial++;
  const wasOpen = isLeaderboardOpen();
  dom.overlay.classList.remove("active");
  document.body.classList.remove("leaderboard-open");
  dom.overlay.setAttribute("aria-hidden", "true");
  dom.openButton?.setAttribute("aria-expanded", "false");
  dom.openButton?.classList.remove("active");
  if (wasOpen) dom.openButton?.focus({ preventScroll: true });
}

async function refreshLeaderboard() {
  dom.refreshButton.disabled = true;
  try {
    const session = await onRefreshIdentity?.();
    if (session) currentSession = session;
    await loadLeaderboard();
  } finally {
    dom.refreshButton.disabled = false;
  }
}

async function loadLeaderboard() {
  if (!isLeaderboardOpen()) return;
  const serial = ++requestSerial;
  renderLoading();
  renderProfile(null);
  if (currentSession.status !== "ready") {
    renderUnavailable();
    return;
  }
  try {
    const data = await fetchLeaderboard(activeMetric);
    if (serial !== requestSerial || !isLeaderboardOpen()) return;
    renderProfile(data.currentPlayer || null);
    renderRows(data.rows || []);
    dom.status.textContent = `共 ${Number(data.totalPlayers || 0)} 位玩家 · ${formatDateTime(data.generatedAt)} 更新`;
  } catch (error) {
    if (serial !== requestSerial || !isLeaderboardOpen()) return;
    renderError(error?.message || "排行榜加载失败");
  }
}

function renderProfile(player) {
  dom.profile.innerHTML = "";
  const user = currentSession.user;
  const avatar = document.createElement("canvas");
  avatar.width = 56;
  avatar.height = 56;
  avatar.setAttribute("aria-hidden", "true");
  drawPixelAvatar(avatar, user?.id || "unknown");

  const identity = document.createElement("div");
  identity.className = "leaderboard-profile-identity";
  const name = document.createElement("strong");
  name.textContent = user?.username || (currentSession.status === "loading" ? "正在识别玩家" : "未识别玩家");
  const employee = document.createElement("span");
  employee.textContent = `工号：${formatEmployeeId(user?.employeeId)}`;
  identity.append(name, employee);

  const stats = document.createElement("div");
  stats.className = "leaderboard-profile-stats";
  stats.append(
    profileStat("我的排名", player?.rank ? `${player.rank} / ${player.totalPlayers || "—"}` : "未上榜"),
    profileStat("总时长", formatDuration(player?.totalPlaySeconds || 0)),
    profileStat("最高难度", player?.highestDifficultyName || "未通关"),
    profileStat("胜局 / 胜率", `${player?.victoryCount || 0} / ${formatPercent(player?.winRate || 0)}`),
  );
  dom.profile.append(avatar, identity, stats);
}

function renderRows(rows) {
  dom.rows.innerHTML = "";
  if (!rows.length) {
    renderEmpty("暂无已同步的排行榜记录");
    return;
  }
  rows.forEach((player, index) => {
    const row = document.createElement("article");
    row.className = `leaderboard-row rank-${Math.min(4, Number(player.rank) || 4)}${player.currentUser ? " current" : ""}`;
    row.style.setProperty("--row-index", index);
    row.append(
      cell(player.rank || "—", "leaderboard-rank"),
      cell(player.username || "未知玩家", "leaderboard-player"),
      cell(player.employeeId || "—"),
      cell(primaryValue(player), "leaderboard-primary"),
      cell(player.highestDifficultyName || "未通关", "leaderboard-difficulty"),
      cell(String(player.runCount || 0)),
      cell(`${player.victoryCount || 0} / ${formatPercent(player.winRate || 0)}`),
      cell(formatDateTime(player.lastPlayedAt)),
    );
    dom.rows.appendChild(row);
  });
}

function renderLoading() {
  dom.rows.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const line = document.createElement("i");
    line.className = "leaderboard-skeleton";
    dom.rows.appendChild(line);
  }
  dom.status.textContent = "正在连接排行榜服务…";
}

function renderUnavailable() {
  const message = currentSession.status === "loading" ? "正在通过用户接口识别当前玩家…" : currentSession.error || "缺少登录 token，暂时无法访问排行榜";
  renderEmpty(message, true);
  dom.status.textContent = "未识别用户不会上传战绩";
}

function renderError(message) {
  renderEmpty(message, true);
  dom.status.textContent = "战绩会保留在同步队列中，服务恢复后自动重试";
}

function renderEmpty(message, error = false) {
  dom.rows.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = `leaderboard-empty${error ? " error" : ""}`;
  const mark = document.createElement("i");
  mark.textContent = error ? "!" : "◇";
  const text = document.createElement("p");
  text.textContent = message;
  empty.append(mark, text);
  dom.rows.appendChild(empty);
}

function updateTabs() {
  for (const button of dom.tabs.querySelectorAll("button")) {
    const selected = button.dataset.metric === activeMetric;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  dom.metricLabel.textContent = LEADERBOARD_METRICS[activeMetric];
}

function handleKeydown(event) {
  if (!isLeaderboardOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeLeaderboard();
    return;
  }
  if (event.key === "Tab") {
    const focusable = [...dom.panel.querySelectorAll("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")]
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
    return;
  }
  if (!event.target.matches("#leaderboardTabs button") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...dom.tabs.querySelectorAll("button")];
  const index = buttons.indexOf(event.target);
  const next = buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
  next.click();
  next.focus();
}

function profileStat(label, value) {
  const item = document.createElement("span");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  small.textContent = label;
  strong.textContent = value;
  item.append(small, strong);
  return item;
}

function cell(value, className = "") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = value;
  span.title = value;
  return span;
}

function primaryValue(player) {
  if (activeMetric === "TOTAL_KILLS") return String(player.totalKills || 0);
  if (activeMetric === "TOTAL_BOSS_KILLS") return String(player.totalBossKills || 0);
  if (activeMetric === "HIGHEST_DIFFICULTY") return player.highestDifficultyName || "未通关";
  return formatDuration(player.totalPlaySeconds || 0);
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPercent(value) {
  return `${(Math.max(0, Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function drawPixelAvatar(canvas, seed) {
  const ctx = canvas.getContext("2d");
  const hash = [...String(seed)].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const palettes = [["#42e8ff", "#b48cff"], ["#ffd166", "#ff4d6d"], ["#77ff8a", "#42e8ff"], ["#b48cff", "#ff65d8"]];
  const [primary, accent] = palettes[hash % palettes.length];
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#07101e";
  ctx.fillRect(0, 0, 56, 56);
  ctx.fillStyle = `${primary}33`;
  ctx.fillRect(4, 4, 48, 48);
  ctx.fillStyle = primary;
  ctx.fillRect(12, 10, 32, 8);
  ctx.fillRect(8, 18, 8, 22);
  ctx.fillRect(40, 18, 8, 22);
  ctx.fillStyle = accent;
  ctx.fillRect(16, 14, 24, 8);
  ctx.fillStyle = "#f2c7a5";
  ctx.fillRect(16, 22, 24, 20);
  ctx.fillStyle = "#08111f";
  ctx.fillRect(20, 28, 5, 5);
  ctx.fillRect(31, 28, 5, 5);
  ctx.fillStyle = "#ff8f9d";
  ctx.fillRect(26, 37, 6, 3);
  ctx.fillStyle = primary;
  ctx.fillRect(12, 44, 32, 8);
  ctx.strokeStyle = "rgba(255,255,255,.42)";
  ctx.strokeRect(0.5, 0.5, 55, 55);
}
