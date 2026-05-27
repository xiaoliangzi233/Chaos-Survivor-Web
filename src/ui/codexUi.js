import { QUALITY_INFO, WEAPON_INFO } from "../economy/inventory.js";
import { createDecorativeEnemy, enemyConfig } from "../systems/enemyRegistry.js";
import { getCodexEntries } from "../systems/codex.js";
import { ITEM_DEFS, itemDescription } from "../systems/items.js";
import { drawWeaponPreview } from "./weaponPreview.js";

const CATEGORIES = [
  { id: "enemies", label: "敌人", eyebrow: "遭遇记录" },
  { id: "weapons", label: "武器", eyebrow: "武装记录" },
  { id: "items", label: "道具", eyebrow: "道具记录" },
];

const dom = {};
let activeType = "enemies";
let selectedId = null;
let previewStop = null;

export function initCodexUi() {
  dom.overlay = document.getElementById("codexOverlay");
  dom.openButton = document.getElementById("codexButton");
  dom.closeButton = document.getElementById("codexCloseButton");
  dom.tabs = document.getElementById("codexTabs");
  dom.list = document.getElementById("codexList");
  dom.detail = document.getElementById("codexDetail");
  if (!dom.overlay || !dom.openButton || !dom.closeButton || !dom.tabs || !dom.list || !dom.detail) return;
  dom.openButton.addEventListener("click", openCodex);
  dom.closeButton.addEventListener("click", closeCodex);
  dom.overlay.addEventListener("click", (event) => {
    if (event.target === dom.overlay) closeCodex();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.overlay.classList.contains("active")) closeCodex();
  });
  renderTabs();
}

export function openCodex() {
  if (!dom.overlay) return;
  renderCodex();
  dom.overlay.classList.add("active");
  dom.overlay.setAttribute("aria-hidden", "false");
}

export function closeCodex() {
  if (!dom.overlay) return;
  stopPreview();
  dom.overlay.classList.remove("active");
  dom.overlay.setAttribute("aria-hidden", "true");
}

function renderTabs() {
  dom.tabs.innerHTML = "";
  for (const category of CATEGORIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.type = category.id;
    button.innerHTML = `<span>${category.eyebrow}</span><strong>${category.label}</strong>`;
    button.addEventListener("click", () => {
      activeType = category.id;
      selectedId = null;
      renderCodex();
    });
    dom.tabs.appendChild(button);
  }
}

function renderCodex() {
  stopPreview();
  renderTabsState();
  const entries = entriesFor(activeType);
  selectedId = selectedId && entries.some((entry) => entry.id === selectedId) ? selectedId : entries[0]?.id || null;
  renderList(entries);
  renderDetail(entries.find((entry) => entry.id === selectedId) || null);
}

function renderTabsState() {
  for (const button of dom.tabs.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.type === activeType);
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
      }));
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
  return ITEM_DEFS
    .filter((item) => unlocked.has(item.id))
    .map((item) => ({
      type,
      id: item.id,
      icon: item.icon,
      name: item.name,
      tag: item.unique ? "唯一道具" : item.singleQuality ? "普通道具" : "品质道具",
      desc: itemDescription(item, "common") || item.desc,
      color: item.unique ? "#ffd166" : "#77ff8a",
      raw: item,
    }));
}

function renderList(entries) {
  dom.list.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "codex-empty";
    empty.innerHTML = `<strong>暂无记录</strong><span>在游戏中遇到敌人、获得武器或购买道具后会解锁图鉴。</span>`;
    dom.list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
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
  return [entry.raw.unique ? "唯一" : "可叠加", entry.raw.singleQuality ? "固定品质" : "多品质", `基础价 ${entry.raw.basePrice}`];
}

function enemyRole(entry) {
  if (entry.behavior === "ranged" || entry.behavior === "gunner" || entry.behavior === "wizard") return "远程敌人";
  if (entry.behavior === "lancer" || entry.behavior === "bat") return "突袭敌人";
  if (entry.behavior?.includes("split")) return "分裂敌人";
  if (entry.behavior === "shield") return "支援敌人";
  return "感染敌人";
}

function weaponColor(id) {
  return { arc: "#42e8ff", ice: "#9ff4ff", missile: "#ffb347", boomerang: "#ff65d8", drone: "#77ff8a", pulse: "#77ff8a", prism_railgun: "#7df9ff" }[id] || "#42e8ff";
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
