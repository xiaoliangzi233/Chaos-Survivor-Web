import { state } from "./state.js";
import {
  canFuseWeapons,
  findFuseCandidate,
  fuseWeaponSlots,
  QUALITY_INFO,
  WEAPON_INFO,
  selectWeaponSlot,
  selectedWeaponSlot,
} from "./inventory.js";

let initialized = false;
let previousMode = "playing";
let fuseMaterialUid = null;
let fuseMessage = "";

const dom = {};

export function initInventoryUi() {
  if (initialized) return;
  initialized = true;

  dom.overlay = document.getElementById("inventoryOverlay");
  dom.openButton = document.getElementById("inventoryButton");
  dom.closeButton = document.getElementById("inventoryCloseButton");
  dom.stats = document.getElementById("inventoryStats");
  dom.weaponCount = document.getElementById("inventoryWeaponCount");
  dom.goldCount = document.getElementById("inventoryGoldCount");
  dom.slots = document.getElementById("weaponSlotList");
  dom.detail = document.getElementById("weaponDetail");
  dom.fuseButton = document.getElementById("weaponFuseButton");
  dom.items = document.getElementById("itemList");
  dom.pauseOverlay = document.getElementById("pauseOverlay");
  dom.tooltip = document.createElement("div");
  dom.tooltip.className = "inventory-tooltip";
  document.body.appendChild(dom.tooltip);

  dom.openButton?.addEventListener("click", toggleInventory);
  dom.closeButton?.addEventListener("click", closeInventory);
  document.addEventListener("keydown", handleKeyDown, { capture: true });

  window.survivorInventory = {
    open: openInventory,
    close: closeInventory,
    toggle: toggleInventory,
    render: renderInventory,
  };
}

export function isInventoryOpen() {
  return state.mode === "inventory" || dom.overlay?.classList.contains("active");
}

export function openInventory() {
  if (!canOpenInventory()) return false;
  previousMode = state.mode;
  if (previousMode === "paused") dom.pauseOverlay?.classList.remove("active");
  state.mode = "inventory";
  fuseMaterialUid = normalizeFuseMaterial()?.uid ?? null;
  renderInventory();
  dom.overlay?.classList.add("active");
  return true;
}

export function closeInventory() {
  if (!isInventoryOpen()) return false;
  hideItemTooltip();
  fuseMaterialUid = null;
  fuseMessage = "";
  dom.overlay?.classList.remove("active");
  state.mode = previousMode === "paused" ? "paused" : "playing";
  if (state.mode === "paused") dom.pauseOverlay?.classList.add("active");
  return true;
}

export function toggleInventory() {
  return isInventoryOpen() ? closeInventory() : openInventory();
}

export function renderInventory() {
  if (!state.player || !state.inventory) return;
  renderSummary();
  renderStats();
  renderSlots();
  renderDetail();
  renderItems();
}

function handleKeyDown(event) {
  if (event.__survivorHandled) return;
  const key = event.key?.toLowerCase();
  if ((event.code === "KeyE" || key === "e") && !event.repeat) {
    event.__survivorHandled = true;
    event.preventDefault();
    event.stopPropagation();
    toggleInventory();
  }
}

function canOpenInventory() {
  if (!state.player || !state.inventory) return false;
  return state.mode === "playing" || state.mode === "paused";
}

function renderStats() {
  const p = state.player;
  dom.stats.innerHTML = "";
  [
    ["生命", `${Math.ceil(p.hp)} / ${p.maxHp}`],
    ["等级", `Lv.${p.level}`],
    ["经验", `${Math.floor(p.xp)} / ${p.xpNeed}`],
    ["移动速度", Math.round(p.speed)],
    ["拾取半径", Math.round(p.magnet)],
    ["伤害倍率", `${Math.round(p.damageScale * 100)}%`],
    ["金币", state.gold],
  ].forEach(([label, value]) => {
    const row = document.createElement("span");
    row.innerHTML = `<b>${label}</b><strong>${value}</strong>`;
    dom.stats.appendChild(row);
  });
}

function renderSummary() {
  if (dom.weaponCount) dom.weaponCount.textContent = `武器 ${state.inventory.weaponSlots.length}/6`;
  if (dom.goldCount) dom.goldCount.textContent = `金币 ${state.gold}`;
}

function renderSlots() {
  const slots = state.inventory.weaponSlots;
  const selected = selectedWeaponSlot();
  dom.slots.innerHTML = "";
  const count = document.querySelector(".inventory-weapons h3 span");
  if (count) count.textContent = `${slots.length}/6`;

  for (let i = 0; i < 6; i++) {
    const slot = slots[i];
    const button = document.createElement("button");
    button.type = "button";
    if (!slot) {
      button.className = "weapon-slot empty";
      button.textContent = "空槽位";
    } else {
      const info = WEAPON_INFO[slot.id];
      const quality = QUALITY_INFO[slot.quality];
      const isActive = state.inventory.selectedWeaponUid === slot.uid;
      const isMaterial = fuseMaterialUid === slot.uid;
      const canUseAsMaterial = selected && canFuseWeapons(selected, slot).ok;
      button.className = `weapon-slot${isActive ? " active" : ""}${isMaterial ? " material" : ""}${canUseAsMaterial ? " fuseable" : ""}`;
      button.innerHTML = `<i style="color:${quality.color}">${info.icon}</i><span><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name}</small></span>`;
      button.addEventListener("click", () => {
        const current = selectedWeaponSlot();
        if (current && canFuseWeapons(current, slot).ok) {
          fuseMaterialUid = slot.uid;
          fuseMessage = "";
        } else {
          selectWeaponSlot(slot.uid);
          fuseMaterialUid = normalizeFuseMaterial()?.uid ?? null;
          fuseMessage = "";
        }
        renderInventory();
      });
    }
    dom.slots.appendChild(button);
  }
}

function renderDetail() {
  const slot = selectedWeaponSlot();
  dom.detail.innerHTML = "";

  if (!slot) {
    dom.detail.innerHTML = `<div class="empty-detail">当前没有武器。先选择开局武器或在商店购买新武器。</div>`;
    dom.fuseButton.disabled = true;
    fuseMaterialUid = null;
    return;
  }

  const info = WEAPON_INFO[slot.id];
  const quality = QUALITY_INFO[slot.quality];
  const material = normalizeFuseMaterial();
  const fuseCheck = canFuseWeapons(slot, material);
  const nextQuality = fuseCheck.nextQuality ? QUALITY_INFO[fuseCheck.nextQuality] : null;
  dom.detail.innerHTML = `
    <div class="weapon-detail-card">
      <div class="weapon-detail-title">
        <i class="weapon-detail-icon" style="color:${quality.color}">${info.icon}</i>
        <div>
          <strong>${info.name}</strong>
          <div class="quality-chip" style="color:${quality.color}">${quality.name}</div>
        </div>
      </div>
      <p>${info.desc}</p>
      <div class="weapon-tags detail-tags">${info.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <p>品质倍率：${Math.round(quality.mult * 100)}%</p>
      ${renderFusePreview(slot, material, fuseCheck, nextQuality)}
    </div>`;

  dom.fuseButton.disabled = !fuseCheck.ok;
  dom.fuseButton.textContent = fuseCheck.ok ? "合成武器" : "无法合成";
  dom.fuseButton.onclick = () => {
    const currentMaterial = normalizeFuseMaterial();
    const check = canFuseWeapons(slot, currentMaterial);
    if (!check.ok) {
      fuseMessage = check.reason;
      renderInventory();
      return;
    }
    const resultQuality = QUALITY_INFO[check.nextQuality];
    if (fuseWeaponSlots(slot.uid, currentMaterial.uid)) {
      fuseMaterialUid = normalizeFuseMaterial()?.uid ?? null;
      fuseMessage = `合成成功：${resultQuality.name} ${info.name}`;
      renderInventory();
    }
  };
}

function normalizeFuseMaterial() {
  const selected = selectedWeaponSlot();
  if (!selected) return null;
  const existing = state.inventory.weaponSlots.find((slot) => slot.uid === fuseMaterialUid);
  if (existing && canFuseWeapons(selected, existing).ok) return existing;
  const candidate = findFuseCandidate(selected);
  fuseMaterialUid = candidate?.uid ?? null;
  return candidate || null;
}

function renderFusePreview(slot, material, fuseCheck, nextQuality) {
  const info = WEAPON_INFO[slot.id];
  const result = fuseCheck.ok
    ? `<div class="fuse-result"><span>结果</span><strong style="color:${nextQuality.color}">${nextQuality.name} ${info.name}</strong></div>`
    : `<div class="fuse-result disabled"><span>规则</span><strong>${fuseCheck.reason}</strong></div>`;
  return `
    <div class="fuse-panel">
      <div class="fuse-row">
        ${renderFuseMini(slot, "主武器")}
        <b>+</b>
        ${material ? renderFuseMini(material, "材料") : `<div class="fuse-mini empty"><span>材料</span><strong>暂无可合成武器</strong></div>`}
      </div>
      ${result}
      <p class="fuse-hint">同一种武器、同一种品质才能合成；传说品质无法继续合成。</p>
      ${fuseMessage ? `<p class="fuse-message">${fuseMessage}</p>` : ""}
    </div>`;
}

function renderFuseMini(slot, label) {
  const info = WEAPON_INFO[slot.id];
  const quality = QUALITY_INFO[slot.quality];
  return `
    <div class="fuse-mini">
      <span>${label}</span>
      <i style="color:${quality.color}">${info.icon}</i>
      <strong>${info.name}</strong>
      <small style="color:${quality.color}">${quality.name}</small>
    </div>`;
}

function renderItems() {
  dom.items.innerHTML = "";
  for (const item of state.inventory.items) {
    const row = document.createElement("div");
    row.className = "item-card";
    const qty = item.qty;
    row.setAttribute("data-tip", `${item.name}: ${item.desc}`);
    row.innerHTML = `<i>${item.icon}</i><strong>x${qty}</strong>`;
    const tipText = `${item.name}: ${item.desc}`;
    row.addEventListener("mouseenter", (event) => showItemTooltip(event, tipText));
    row.addEventListener("mousemove", (event) => moveItemTooltip(event));
    row.addEventListener("mouseleave", hideItemTooltip);
    dom.items.appendChild(row);
  }
}

function showItemTooltip(event, text) {
  if (!dom.tooltip) return;
  const [title, ...desc] = text.split(": ");
  dom.tooltip.innerHTML = `<strong>${title}</strong><span>${desc.join(": ")}</span>`;
  dom.tooltip.classList.add("active");
  moveItemTooltip(event);
}

function moveItemTooltip(event) {
  if (!dom.tooltip?.classList.contains("active")) return;
  const panel = dom.overlay?.querySelector(".inventory-panel");
  const bounds = panel?.getBoundingClientRect();
  if (!bounds) return;
  const tip = dom.tooltip.getBoundingClientRect();
  const margin = 12;
  const preferredX = event.clientX + 14;
  const preferredY = event.clientY - tip.height - 14;
  const x = Math.min(Math.max(preferredX, bounds.left + margin), bounds.right - tip.width - margin);
  let y = preferredY;
  if (y < bounds.top + margin) y = event.clientY + 16;
  y = Math.min(Math.max(y, bounds.top + margin), bounds.bottom - tip.height - margin);
  dom.tooltip.style.left = `${Math.round(x)}px`;
  dom.tooltip.style.top = `${Math.round(y)}px`;
}

function hideItemTooltip() {
  dom.tooltip?.classList.remove("active");
}
