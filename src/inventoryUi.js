import { state } from "./state.js";
import { QUALITY_INFO, WEAPON_INFO, selectWeaponSlot, selectedWeaponSlot, upgradeWeaponSlot, weaponUpgradeCost } from "./inventory.js";

let initialized = false;
let previousMode = "playing";

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
  dom.shardCount = document.getElementById("inventoryShardCount");
  dom.slots = document.getElementById("weaponSlotList");
  dom.detail = document.getElementById("weaponDetail");
  dom.upgradeButton = document.getElementById("weaponUpgradeButton");
  dom.fuseButton = document.getElementById("weaponFuseButton");
  dom.items = document.getElementById("itemList");
  dom.pauseOverlay = document.getElementById("pauseOverlay");

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
  renderInventory();
  dom.overlay?.classList.add("active");
  return true;
}

export function closeInventory() {
  if (!isInventoryOpen()) return false;
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
    ["碎片", state.shards],
  ].forEach(([label, value]) => {
    const row = document.createElement("span");
    row.innerHTML = `<b>${label}</b><strong>${value}</strong>`;
    dom.stats.appendChild(row);
  });
}

function renderSummary() {
  if (dom.weaponCount) dom.weaponCount.textContent = `武器 ${state.inventory.weaponSlots.length}/6`;
  if (dom.goldCount) dom.goldCount.textContent = `金币 ${state.gold}`;
  if (dom.shardCount) dom.shardCount.textContent = `碎片 ${state.shards}`;
}

function renderSlots() {
  const slots = state.inventory.weaponSlots;
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
      button.className = `weapon-slot${state.inventory.selectedWeaponUid === slot.uid ? " active" : ""}`;
      button.innerHTML = `<i style="color:${quality.color}">${info.icon}</i><span><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name} · Lv.${slot.level}</small></span>`;
      button.addEventListener("click", () => {
        selectWeaponSlot(slot.uid);
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
    dom.detail.innerHTML = `<div class="empty-detail">当前没有武器。先选择开局武器或在升级时获得新武器。</div>`;
    dom.upgradeButton.disabled = true;
    dom.fuseButton.disabled = true;
    return;
  }

  const info = WEAPON_INFO[slot.id];
  const quality = QUALITY_INFO[slot.quality];
  const cost = weaponUpgradeCost(slot);
  dom.detail.innerHTML = `
    <div class="weapon-detail-card">
      <div class="weapon-detail-title">
        <i class="weapon-detail-icon" style="color:${quality.color}">${info.icon}</i>
        <div>
          <strong>${info.name}</strong>
          <div class="quality-chip" style="color:${quality.color}">${quality.name} · Lv.${slot.level}</div>
        </div>
      </div>
      <p>${info.desc}</p>
      <div class="weapon-tags detail-tags">${info.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <p>品质倍率：${Math.round(quality.mult * 100)}%</p>
      <p>升级消耗：${cost} 碎片</p>
      <div class="weapon-meter"><i style="width:${Math.min(100, (state.shards / Math.max(1, cost)) * 100)}%"></i></div>
    </div>`;

  dom.upgradeButton.disabled = state.shards < cost;
  dom.upgradeButton.onclick = () => {
    if (upgradeWeaponSlot(slot.uid)) renderInventory();
  };
  dom.fuseButton.disabled = true;
  dom.fuseButton.textContent = "合成品质（下一步）";
}

function renderItems() {
  dom.items.innerHTML = "";
  for (const item of state.inventory.items) {
    const row = document.createElement("div");
    row.className = "item-card";
    const qty = item.id === "shard_core" ? state.shards : item.qty;
    row.setAttribute("data-tip", `${item.name}：${item.desc}`);
    row.innerHTML = `<i>${item.icon}</i><strong>x${qty}</strong>`;
    dom.items.appendChild(row);
  }
}
