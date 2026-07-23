import { QUALITY_INFO, QUALITY_ORDER, WEAPON_INFO } from "../economy/inventory.js";
import { EVENT_CODEX_ENTRIES } from "../config/event-codex-config.js";
import { createDecorativeEnemy, enemyConfig } from "../systems/enemyRegistry.js";
import { getCodexEntries } from "../systems/codex.js";
import { ITEM_DEFS, itemDescription } from "../systems/items.js";
import { drawWeaponPreview } from "./weaponPreview.js";

const CATEGORIES = [
  { id: "enemies", label: "敌人", eyebrow: "遭遇记录" },
  { id: "weapons", label: "武器", eyebrow: "武装记录" },
  { id: "items", label: "道具", eyebrow: "道具记录" },
  { id: "events", label: "事件", eyebrow: "事件记录" },
];

const dom = {};
const CODEX_PAGE_SIZE = 10;
let activeType = "enemies";
let selectedId = null;
let codexPage = 0;
let previewStop = null;
let onOpen = null;
let onClose = null;

export function initCodexUi(options = {}) {
  onOpen = options.onOpen || null;
  onClose = options.onClose || null;
  dom.overlay = document.getElementById("codexOverlay");
  dom.panel = dom.overlay?.querySelector(".codex-panel");
  dom.openButton = document.getElementById("codexButton");
  dom.closeButton = document.getElementById("codexCloseButton");
  dom.tabs = document.getElementById("codexTabs");
  dom.list = document.getElementById("codexList");
  dom.detail = document.getElementById("codexDetail");
  dom.footerStatus = document.getElementById("codexFooterStatus");
  if (!dom.overlay || !dom.panel || !dom.openButton || !dom.closeButton || !dom.tabs || !dom.list || !dom.detail) return;
  dom.list.setAttribute("role", "tabpanel");
  dom.openButton.addEventListener("click", openCodex);
  dom.closeButton.addEventListener("click", closeCodex);
  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeCodex();
  });
  document.addEventListener("keydown", handleKeydown);
  renderTabs();
}

export function openCodex() {
  if (!dom.overlay) return;
  renderCodex();
  dom.overlay.classList.add("active");
  document.body.classList.add("codex-open");
  dom.overlay.setAttribute("aria-hidden", "false");
  dom.openButton?.setAttribute("aria-expanded", "true");
  dom.openButton?.classList.add("active");
  dom.closeButton?.focus({ preventScroll: true });
  onOpen?.();
}

export function closeCodex() {
  if (!dom.overlay) return;
  const wasOpen = dom.overlay.classList.contains("active");
  stopPreview();
  dom.overlay.classList.remove("active");
  document.body.classList.remove("codex-open");
  dom.overlay.setAttribute("aria-hidden", "true");
  dom.openButton?.setAttribute("aria-expanded", "false");
  dom.openButton?.classList.remove("active");
  if (wasOpen) dom.openButton?.focus({ preventScroll: true });
  if (wasOpen) onClose?.();
}

function renderTabs() {
  dom.tabs.innerHTML = "";
  dom.tabs.setAttribute("role", "tablist");
  for (const category of CATEGORIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `codexTab-${category.id}`;
    button.dataset.type = category.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "codexList");
    button.innerHTML = `<span>${category.eyebrow}</span>`;
    button.addEventListener("click", () => {
      activeType = category.id;
      selectedId = null;
      codexPage = 0;
      renderCodex();
    });
    dom.tabs.appendChild(button);
  }
}

function renderCodex() {
  stopPreview();
  renderTabsState();
  const entries = entriesFor(activeType);
  updateFooterStatus(entries.length, totalEntriesFor(activeType));
  const pageCount = Math.max(1, Math.ceil(entries.length / CODEX_PAGE_SIZE));
  codexPage = Math.max(0, Math.min(pageCount - 1, codexPage));
  const pageEntries = pagedEntries(entries);
  selectedId = selectedId && pageEntries.some((entry) => entry.id === selectedId) ? selectedId : pageEntries[0]?.id || null;
  renderList(entries);
  renderDetail(entries.find((entry) => entry.id === selectedId) || null);
}

function renderTabsState() {
  for (const button of dom.tabs.querySelectorAll("button")) {
    const selected = button.dataset.type === activeType;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) dom.list.setAttribute("aria-labelledby", button.id);
  }
}

function entriesFor(type) {
  const unlocked = new Set(getCodexEntries(type));
  if (type === "enemies") {
    return Object.values(enemyConfig)
      .filter((entry) => unlocked.has(entry.id))
      .map((entry) => ({
        type,
        id: entry.id,
        icon: entry.boss ? "B" : "!",
        name: entry.name || entry.id,
        tag: entry.boss ? "Boss" : enemyRole(entry),
        desc: entry.desc || enemyRole(entry),
        color: entry.color || "#42e8ff",
        raw: entry,
      }))
      .sort(compareEnemyCodexEntries);
  }
  if (type === "weapons") {
    return Object.entries(WEAPON_INFO)
      .filter(([id]) => unlocked.has(id))
      .map(([id, info]) => ({
        type,
        id,
        icon: info.icon,
        name: info.name,
        tag: (info.tags || []).slice(0, 2).join(" · ") || "武器",
        desc: info.desc,
        color: weaponColor(id),
        raw: info,
      }));
  }
  if (type === "events") {
    return EVENT_CODEX_ENTRIES
      .filter((event) => unlocked.has(event.id))
      .map((event) => ({
        type,
        id: event.id,
        icon: event.icon,
        name: event.name,
        tag: event.category,
        desc: event.desc,
        color: event.color,
        raw: event,
      }));
  }
  return ITEM_DEFS
    .filter((item) => unlocked.has(item.id))
    .map((item) => itemCodexEntry(item, type))
    .sort(compareItemCodexEntries);
}

function totalEntriesFor(type) {
  if (type === "enemies") return Object.keys(enemyConfig).length;
  if (type === "weapons") return Object.keys(WEAPON_INFO).length;
  if (type === "events") return EVENT_CODEX_ENTRIES.length;
  return ITEM_DEFS.length;
}

function updateFooterStatus(unlocked, total) {
  if (!dom.footerStatus) return;
  const label = CATEGORIES.find((category) => category.id === activeType)?.label || "档案";
  dom.footerStatus.textContent = `${label} 解锁 ${unlocked} / ${total} // ARCHIVE ${activeType.toUpperCase()}`;
}

function itemCodexEntry(item, type) {
  const qualityId = itemCodexQuality(item);
  const quality = QUALITY_INFO[qualityId] || QUALITY_INFO.common;
  return {
    type,
    id: item.id,
    icon: item.icon,
    name: item.name,
    tag: item.unique ? `唯一 · ${quality.name}` : `${quality.name}道具`,
    desc: itemDescription(item, qualityId) || item.desc,
    color: quality.color,
    qualityId,
    raw: item,
  };
}

function compareItemCodexEntries(a, b) {
  const uniqueRank = Number(Boolean(a.raw.unique)) - Number(Boolean(b.raw.unique));
  if (uniqueRank) return uniqueRank;
  const qualityRank = qualityIndex(a.qualityId) - qualityIndex(b.qualityId);
  if (qualityRank) return qualityRank;
  return ITEM_DEFS.findIndex((item) => item.id === a.id) - ITEM_DEFS.findIndex((item) => item.id === b.id);
}

function compareEnemyCodexEntries(a, b) {
  const bossRank = Number(Boolean(a.raw.boss)) - Number(Boolean(b.raw.boss));
  if (bossRank) return bossRank;
  return enemyConfigIndex(a.id) - enemyConfigIndex(b.id);
}

function enemyConfigIndex(id) {
  const index = Object.keys(enemyConfig).indexOf(id);
  return index < 0 ? 999 : index;
}

function itemCodexQuality(item) {
  if (item?.fixedQuality) return item.fixedQuality;
  return item?.singleQuality ? "common" : "common";
}

function qualityIndex(qualityId) {
  const index = QUALITY_ORDER.indexOf(qualityId || "common");
  return index < 0 ? 0 : index;
}

function renderList(entries) {
  dom.list.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "codex-empty";
    const hint = activeType === "events"
      ? "在游戏中亲历特殊波次事件后会自动归档。"
      : "在游戏中遇到敌人、获得武器或购买道具后会解锁图鉴。";
    empty.innerHTML = `<strong>暂无记录</strong><span>${hint}</span>`;
    dom.list.appendChild(empty);
    return;
  }
  const visibleEntries = pagedEntries(entries);
  for (const entry of visibleEntries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `codex-card${entry.id === selectedId ? " active" : ""}`;
    button.style.setProperty("--codex-color", entry.color);
    button.innerHTML = `
      <i>${entry.icon}</i>
      <span>
        <strong>${entry.name}</strong>
        <em>${entry.tag}</em>
      </span>`;
    button.addEventListener("click", () => {
      selectedId = entry.id;
      renderCodex();
    });
    dom.list.appendChild(button);
  }
  renderPagination(entries.length);
}

function pagedEntries(entries) {
  const start = codexPage * CODEX_PAGE_SIZE;
  return entries.slice(start, start + CODEX_PAGE_SIZE);
}

function renderPagination(total) {
  if (total <= CODEX_PAGE_SIZE) return;
  const pageCount = Math.ceil(total / CODEX_PAGE_SIZE);
  const controls = document.createElement("div");
  controls.className = "codex-pagination";
  controls.innerHTML = `
    <button type="button" data-dir="-1" ${codexPage <= 0 ? "disabled" : ""}>上一页</button>
    <span>${codexPage + 1} / ${pageCount}</span>
    <button type="button" data-dir="1" ${codexPage >= pageCount - 1 ? "disabled" : ""}>下一页</button>`;
  for (const button of controls.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      codexPage = Math.max(0, Math.min(pageCount - 1, codexPage + Number(button.dataset.dir)));
      selectedId = null;
      renderCodex();
    });
  }
  dom.list.appendChild(controls);
}

function renderDetail(entry) {
  dom.detail.innerHTML = "";
  if (!entry) {
    dom.detail.innerHTML = `
      <div class="codex-detail-empty">
        <strong>未发现数据</strong>
        <span>隐藏条目不会显示在图鉴中。</span>
      </div>`;
    return;
  }
  dom.detail.style.setProperty("--codex-color", entry.color);
  const canvas = document.createElement("canvas");
  canvas.className = "codex-preview";
  const title = document.createElement("div");
  title.className = "codex-detail-title";
  title.innerHTML = `<i>${entry.icon}</i><span><em>${entry.tag}</em><strong>${entry.name}</strong></span>`;
  const desc = document.createElement("p");
  desc.textContent = entry.desc;
  const meta = document.createElement("div");
  meta.className = "codex-meta";
  for (const label of metaLabels(entry)) {
    const chip = document.createElement("span");
    chip.textContent = label;
    meta.appendChild(chip);
  }
  dom.detail.append(canvas, title, desc, meta);
  startPreview(canvas, entry);
}

function startPreview(canvas, entry) {
  let raf = 0;
  let enemy = null;
  if (entry.type === "enemies") enemy = createDecorativeEnemy(entry.id, 0, 0);
  const ctx = canvas.getContext("2d");
  const frame = (now) => {
    const t = now / 1000;
    if (entry.type === "weapons") drawWeaponPreview(ctx, canvas, { id: entry.id, quality: "rare" }, t);
    else if (entry.type === "enemies") drawEnemyPreview(ctx, canvas, enemy, entry, t);
    else if (entry.type === "events") drawEventPreview(ctx, canvas, entry, t);
    else drawItemPreview(ctx, canvas, entry, t);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  previewStop = () => cancelAnimationFrame(raf);
}

function stopPreview() {
  previewStop?.();
  previewStop = null;
}

function drawEnemyPreview(ctx, canvas, enemy, entry, t) {
  const { w, h } = setupPreviewCanvas(ctx, canvas);
  drawPreviewGrid(ctx, w, h, t, entry.color);
  if (!enemy) return;
  enemy.x = 0;
  enemy.y = 0;
  enemy.anim += 0.045;
  enemy.flip = Math.sin(t * 1.4) < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(w / 2, h / 2 + Math.sin(t * 3) * 8);
  const previewBudget = entry.raw?.boss ? Math.min(w, h) * 0.34 : 54;
  const minScale = entry.raw?.boss ? 0.58 : 1.35;
  const scale = Math.min(2.6, Math.max(minScale, previewBudget / Math.max(18, enemy.r)));
  ctx.scale(scale, scale);
  enemy.draw(ctx);
  ctx.restore();
}

function drawItemPreview(ctx, canvas, entry, t) {
  const { w, h } = setupPreviewCanvas(ctx, canvas);
  drawPreviewGrid(ctx, w, h, t, entry.color);
  const cx = w / 2;
  const cy = h / 2;
  const pulse = 1 + Math.sin(t * 4) * 0.06;
  const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.min(w, h) * 0.42);
  gradient.addColorStop(0, hexToRgba(entry.color, 0.38));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 2.3) * 6);
  ctx.rotate(Math.sin(t * 1.7) * 0.08);
  ctx.scale(pulse, pulse);
  for (let i = 0; i < 10; i++) {
    const a = t * 0.9 + (i / 10) * Math.PI * 2;
    const r = 56 + Math.sin(t * 2 + i) * 8;
    ctx.fillStyle = hexToRgba(entry.color, 0.18 + (i % 2) * 0.16);
    ctx.fillRect(Math.cos(a) * r - 2, Math.sin(a) * r - 2, 4, 4);
  }
  ctx.shadowColor = entry.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#f8fbff";
  ctx.font = "72px 'Zpix', 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(entry.icon || "?", 0, 0);
  ctx.restore();
}

function drawEventPreview(ctx, canvas, entry, t) {
  const { w, h } = setupPreviewCanvas(ctx, canvas);
  drawPreviewGrid(ctx, w, h, t * 0.72, entry.color);
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.28;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.8);
  glow.addColorStop(0, hexToRgba(entry.color, 0.24));
  glow.addColorStop(0.46, hexToRgba(entry.color, 0.08));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  for (let ring = 0; ring < 3; ring++) {
    const spin = t * (ring % 2 ? -0.72 : 0.58) + ring * 0.8;
    ctx.strokeStyle = hexToRgba(ring === 1 ? "#ffffff" : entry.color, 0.24 + ring * 0.1);
    ctx.lineWidth = ring === 0 ? 3 : 1.5;
    for (let segment = 0; segment < 7 + ring * 2; segment++) {
      const start = spin + segment / (7 + ring * 2) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.62 + ring * 0.28), start, start + 0.3 + ring * 0.04);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = t * 0.9 + i / 12 * Math.PI * 2;
    const orbit = radius * (1.05 + (i % 3) * 0.18);
    const size = 3 + (i % 2) * 2;
    ctx.fillStyle = hexToRgba(i % 3 === 0 ? "#ffffff" : entry.color, 0.35 + (i % 3) * 0.16);
    ctx.fillRect(Math.cos(a) * orbit - size / 2, Math.sin(a) * orbit - size / 2, size, size);
  }
  ctx.rotate(Math.sin(t * 1.3) * 0.04);
  ctx.shadowColor = entry.color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#f8fbff";
  ctx.font = "700 68px 'Zpix', 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(entry.icon || "E", 0, 2);
  ctx.restore();
}

function setupPreviewCanvas(ctx, canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(260, canvas.clientWidth || 360);
  const h = Math.max(220, canvas.clientHeight || 260);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(3,8,16,0.9)";
  ctx.fillRect(0, 0, w, h);
  return { w, h };
}

function drawPreviewGrid(ctx, w, h, t, color) {
  ctx.strokeStyle = hexToRgba(color, 0.12);
  ctx.lineWidth = 1;
  const offset = (t * 20) % 28;
  for (let x = -offset; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = offset; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function metaLabels(entry) {
  if (entry.type === "enemies") {
    const e = entry.raw;
    return [`生命 ${Math.round(e.hp || 0)}`, `伤害 ${Math.round(e.damage || 0)}`, `速度 ${Math.round(e.speed || 0)}`];
  }
  if (entry.type === "weapons") return entry.raw.tags || ["武器"];
  if (entry.type === "events") return [entry.raw.category, "遭遇后归档", "账号进度同步"];
  const quality = QUALITY_INFO[entry.qualityId] || QUALITY_INFO.common;
  return [entry.raw.unique ? "唯一" : "可叠加", entry.raw.singleQuality ? `固定品质：${quality.name}` : "多品质", `基础价 ${entry.raw.basePrice}`];
}

function enemyRole(entry) {
  if (entry.behavior === "ranged" || entry.behavior === "gunner" || entry.behavior === "wizard") return "远程敌人";
  if (entry.behavior === "lancer" || entry.behavior === "bat") return "突袭敌人";
  if (entry.behavior?.includes("split")) return "分裂敌人";
  if (entry.behavior === "shield") return "支援敌人";
  return "感染敌人";
}

function weaponColor(id) {
  return { arc: "#42e8ff", ice: "#9ff4ff", missile: "#ffb347", boomerang: "#ff65d8", drone: "#77ff8a", prism_railgun: "#7df9ff", void_singularity: "#8b5cf6", tesla_mine_chain: "#42e8ff", starfall_scepter: "#ffd166", phase_needler: "#b48cff", echo_tuning_fork: "#7dfcff", rift_loom: "#9d7cff" }[id] || "#42e8ff";
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const num = Number.parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function handleKeydown(event) {
  if (!dom.overlay?.classList.contains("active")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeCodex();
    return;
  }
  if (["ArrowLeft", "ArrowRight"].includes(event.key) && event.target.closest("#codexTabs")) {
    event.preventDefault();
    const currentIndex = CATEGORIES.findIndex((category) => category.id === activeType);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextCategory = CATEGORIES[(currentIndex + direction + CATEGORIES.length) % CATEGORIES.length];
    activeType = nextCategory.id;
    selectedId = null;
    codexPage = 0;
    renderCodex();
    dom.tabs.querySelector(`[data-type="${activeType}"]`)?.focus();
    return;
  }
  if (event.key !== "Tab") return;
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
}
