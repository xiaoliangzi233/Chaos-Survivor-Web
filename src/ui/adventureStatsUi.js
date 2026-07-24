import { getAdventureStats } from "../systems/playerProgress.js";

const dom = {};
let options = {};
let activeTab = "overview";
let historyPage = 0;
const HISTORY_PAGE_SIZE = 10;

export function initAdventureStatsUi(nextOptions = {}) {
  options = nextOptions;
  dom.overlay = document.getElementById("adventureStatsOverlay");
  dom.content = document.getElementById("adventureStatsContent");
  dom.tabs = document.getElementById("adventureStatsTabs");
  dom.filters = document.getElementById("adventureStatsFilters");
  dom.modeFilter = document.getElementById("adventureStatsModeFilter");
  dom.outcomeFilter = document.getElementById("adventureStatsOutcomeFilter");
  dom.status = document.getElementById("adventureStatsStatus");
  dom.close = document.getElementById("adventureStatsCloseButton");
  dom.footerClose = document.getElementById("adventureStatsFooterCloseButton");
  dom.close?.addEventListener("click", closeAdventureStats);
  dom.footerClose?.addEventListener("click", closeAdventureStats);
  dom.overlay?.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeAdventureStats();
  });
  dom.tabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stats-tab]");
    if (!button) return;
    activeTab = button.dataset.statsTab;
    historyPage = 0;
    renderAdventureStats();
  });
  dom.modeFilter?.addEventListener("change", () => {
    historyPage = 0;
    renderAdventureStats();
  });
  dom.outcomeFilter?.addEventListener("change", () => {
    historyPage = 0;
    renderAdventureStats();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isAdventureStatsOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    closeAdventureStats();
  }, { capture: true });
}

export function openAdventureStats() {
  if (!dom.overlay) return false;
  activeTab = "overview";
  historyPage = 0;
  dom.overlay.classList.add("active");
  dom.overlay.setAttribute("aria-hidden", "false");
  options.onModalChange?.(true);
  renderAdventureStats();
  window.setTimeout(() => dom.tabs?.querySelector("button")?.focus({ preventScroll: true }), 0);
  return true;
}

export function closeAdventureStats() {
  if (!isAdventureStatsOpen()) return false;
  dom.overlay.classList.remove("active");
  dom.overlay.setAttribute("aria-hidden", "true");
  options.onModalChange?.(false);
  return true;
}

export function isAdventureStatsOpen() {
  return Boolean(dom.overlay?.classList.contains("active"));
}

function renderAdventureStats() {
  if (!dom.content) return;
  const stats = getAdventureStats();
  for (const button of dom.tabs.querySelectorAll("[data-stats-tab]")) {
    button.classList.toggle("active", button.dataset.statsTab === activeTab);
  }
  dom.filters.hidden = activeTab !== "history";
  dom.content.replaceChildren();
  if (activeTab === "difficulty") renderDifficulty(stats);
  else if (activeTab === "history") renderHistory(stats);
  else renderOverview(stats);
  dom.status.textContent = `LOCAL ARCHIVE // ${stats.totals.runs} RUNS // REV.${stats.revision}`;
}

function renderOverview(stats) {
  const grid = node("section", "adventure-summary-grid");
  const t = stats.totals;
  [
    ["冒险次数", t.runs, "RUNS"],
    ["胜利 / 战败", `${t.victories} / ${t.defeats}`, "RESULT"],
    ["总战斗时间", formatDuration(t.seconds), "ACTIVE TIME"],
    ["总击杀", formatNumber(t.kills), "HOSTILES"],
    ["Boss 击杀", formatNumber(t.bossKills), "BOSS"],
    ["中途返航", t.abandoned, "ABORT"],
    ["最高波次", t.highestWave, "WAVE"],
    ["结算金币", formatNumber(t.gold), "CREDITS"],
  ].forEach(([label, value, meta]) => grid.appendChild(summaryCard(label, value, meta)));
  dom.content.appendChild(grid);

  const records = node("section", "adventure-record-strip");
  records.append(
    recordChip("单局最多击杀", formatNumber(t.bestKills)),
    recordChip("最长生存", formatDuration(t.longestSeconds)),
    recordChip("最快通关", t.bestVictorySeconds ? formatDuration(t.bestVictorySeconds) : "暂无"),
  );
  dom.content.appendChild(records);

  const modeSection = node("section", "adventure-mode-section");
  modeSection.appendChild(sectionTitle("航线统计", "MODE BREAKDOWN"));
  const table = node("div", "adventure-table");
  table.appendChild(tableRow(["航线", "冒险", "胜利", "胜率", "时间", "击杀"], true));
  for (const [key, label] of [
    ["standard", "剧情模式"],
    ["random_twenty_waves", "随机 · 20 波"],
    ["random_endless", "随机 · 无限"],
  ]) {
    const bucket = stats.byMode[key] || emptyBucket();
    table.appendChild(tableRow([
      label,
      bucket.runs,
      bucket.victories,
      bucket.runs ? `${Math.round(bucket.victories / bucket.runs * 100)}%` : "—",
      formatDuration(bucket.seconds),
      formatNumber(bucket.kills),
    ]));
  }
  modeSection.appendChild(table);
  dom.content.appendChild(modeSection);
}

function renderDifficulty(stats) {
  const difficulties = options.getDifficulties?.() || [];
  const ids = Array.from(new Set([...difficulties.map((entry) => entry.id), ...Object.keys(stats.byDifficulty)]));
  const section = node("section", "adventure-difficulty-section");
  section.appendChild(sectionTitle("难度档案", "DIFFICULTY RECORDS"));
  const table = node("div", "adventure-table adventure-difficulty-table");
  table.appendChild(tableRow(["难度", "冒险", "通关", "最高波", "最佳击杀", "最快通关", "最近通关"], true));
  for (const id of ids) {
    const definition = difficulties.find((entry) => entry.id === id);
    const bucket = stats.byDifficulty[id] || emptyBucket();
    table.appendChild(tableRow([
      definition?.name || id,
      bucket.runs,
      bucket.victories,
      bucket.highestWave,
      formatNumber(bucket.bestKills),
      bucket.bestVictorySeconds ? formatDuration(bucket.bestVictorySeconds) : "—",
      bucket.lastVictoryAt ? formatDate(bucket.lastVictoryAt) : "—",
    ], false, bucket.victories ? "cleared" : ""));
  }
  if (!ids.length) section.appendChild(emptyState("尚未建立难度档案", "完成一次正式冒险后，这里会按难度汇总航行记录。"));
  else section.appendChild(table);
  dom.content.appendChild(section);
}

function renderHistory(stats) {
  const mode = dom.modeFilter.value;
  const outcome = dom.outcomeFilter.value;
  const filtered = stats.history.filter((run) => (
    (mode === "all" || run.modeKey === mode)
    && (outcome === "all" || run.outcome === outcome)
  ));
  const pageCount = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  historyPage = Math.min(historyPage, pageCount - 1);
  const entries = filtered.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
  const section = node("section", "adventure-history-section");
  section.appendChild(sectionTitle("单次冒险记录", `${filtered.length} MATCHED`));
  if (!entries.length) {
    section.appendChild(emptyState("没有符合条件的冒险", "调整筛选条件，或完成一次非调试战局。"));
  } else {
    const list = node("div", "adventure-history-list");
    for (const run of entries) list.appendChild(historyCard(run));
    section.appendChild(list);
  }
  const pager = node("div", "adventure-history-pager");
  const previous = button("上一页", () => {
    historyPage = Math.max(0, historyPage - 1);
    renderAdventureStats();
  });
  previous.disabled = historyPage <= 0;
  const next = button("下一页", () => {
    historyPage = Math.min(pageCount - 1, historyPage + 1);
    renderAdventureStats();
  });
  next.disabled = historyPage >= pageCount - 1;
  pager.append(previous, textNode("span", `${historyPage + 1} / ${pageCount}`), next);
  section.appendChild(pager);
  dom.content.appendChild(section);
}

function historyCard(run) {
  const article = node("article", `adventure-history-card ${run.outcome}`);
  const header = node("header");
  const result = textNode("strong", outcomeLabel(run.outcome));
  const route = run.runMode === "random"
    ? `随机模式 · ${run.randomGoal === "endless" ? "无限" : "20 波"}`
    : "剧情模式";
  header.append(result, textNode("span", `${route} // ${formatDateTime(run.completedAt)}`));
  const title = textNode("h3", `${run.difficultyName} · ${run.weaponName}`);
  const metrics = node("div", "adventure-history-metrics");
  [
    ["时间", formatDuration(run.seconds)],
    ["波次", run.wave],
    ["击杀", formatNumber(run.kills)],
    ["Boss", run.bossKills],
    ["金币", formatNumber(run.gold)],
    ["等级", run.level],
    ["武器 / 道具", `${run.weaponCount} / ${run.itemCount}`],
  ].forEach(([label, value]) => metrics.appendChild(recordChip(label, value)));
  article.append(header, title, metrics);
  return article;
}

function summaryCard(label, value, meta) {
  const article = node("article", "adventure-summary-card");
  article.append(textNode("span", meta), textNode("strong", String(value)), textNode("p", label));
  return article;
}

function recordChip(label, value) {
  const chip = node("div", "adventure-record-chip");
  chip.append(textNode("span", label), textNode("strong", String(value)));
  return chip;
}

function sectionTitle(title, meta) {
  const header = node("header", "adventure-section-title");
  header.append(textNode("h3", title), textNode("span", meta));
  return header;
}

function tableRow(values, heading = false, className = "") {
  const row = node("div", `adventure-table-row ${heading ? "heading" : ""} ${className}`.trim());
  for (const value of values) row.appendChild(textNode(heading ? "strong" : "span", String(value)));
  return row;
}

function emptyState(title, description) {
  const empty = node("div", "adventure-empty");
  empty.append(textNode("strong", title), textNode("p", description));
  return empty;
}

function button(label, onClick) {
  const element = textNode("button", label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function node(tag, className = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function textNode(tag, value) {
  const element = node(tag);
  element.textContent = value;
  return element;
}

function emptyBucket() {
  return { runs: 0, victories: 0, defeats: 0, abandoned: 0, seconds: 0, kills: 0, bossKills: 0, gold: 0, highestWave: 0, bestKills: 0, longestSeconds: 0, bestVictorySeconds: 0, lastVictoryAt: "" };
}

function outcomeLabel(outcome) {
  return { victory: "胜利返航", defeat: "战斗终止", abandoned: "中途返航" }[outcome] || outcome;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const rest = total % 60;
  return hours ? `${hours}时 ${String(minutes).padStart(2, "0")}分` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Number(value) || 0));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN");
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString("zh-CN", { hour12: false });
}
