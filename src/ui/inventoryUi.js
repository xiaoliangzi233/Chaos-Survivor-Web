import { state } from "../state.js";
import {
  canFuseWeapons,
  findFuseCandidate,
  fuseWeaponSlots,
  QUALITY_INFO,
  WEAPON_INFO,
  selectWeaponSlot,
  selectedWeaponSlot,
} from "../economy/inventory.js";
import { itemSellPrice, sellInventoryItem, sellWeaponSlot, weaponSellPrice } from "../economy/shop.js";
import { renderShop } from "./shopUi.js";

let initialized = false;
let previousMode = "playing";
let fuseMaterialUid = null;
let fuseMessage = "";
let detailSelection = { type: "weapon", id: null };

const dom = {};
const text = {
  inventoryApi: "survivorInventory",
  hp: "\u751f\u547d",
  level: "\u7b49\u7ea7",
  xp: "\u7ecf\u9a8c",
  speed: "\u79fb\u52a8\u901f\u5ea6",
  magnet: "\u62fe\u53d6\u534a\u5f84",
  damage: "\u4f24\u5bb3\u503c",
  defense: "\u9632\u5fa1",
  dodge: "\u95ea\u907f",
  crit: "\u66b4\u51fb",
  luck: "\u5e78\u8fd0",
  regen: "\u56de\u8840",
  attackRange: "\u653b\u51fb\u8303\u56f4",
  attackSpeed: "\u653b\u51fb\u901f\u5ea6",
  gold: "\u91d1\u5e01",
  weapons: "\u6b66\u5668",
  emptySlot: "\u7a7a\u69fd\u4f4d",
  noWeapon: "\u5f53\u524d\u6ca1\u6709\u6b66\u5668\u3002\u5148\u9009\u62e9\u5f00\u5c40\u6b66\u5668\u6216\u5728\u5546\u5e97\u8d2d\u4e70\u65b0\u6b66\u5668\u3002",
  qualityMult: "\u54c1\u8d28\u500d\u7387",
  sell: "\u51fa\u552e",
  sellWeapon: "\u51fa\u552e\u6b66\u5668",
  sellItem: "\u51fa\u552e\u9053\u5177",
  sold: "\u5df2\u51fa\u552e",
  gain: "\uff0c\u83b7\u5f97",
  fuse: "\u5408\u6210\u6b66\u5668",
  noFuse: "\u65e0\u6cd5\u5408\u6210",
  fuseSuccess: "\u5408\u6210\u6210\u529f",
  result: "\u7ed3\u679c",
  rule: "\u89c4\u5219",
  mainWeapon: "\u4e3b\u6b66\u5668",
  material: "\u6750\u6599",
  noMaterial: "\u6682\u65e0\u53ef\u5408\u6210\u6b66\u5668",
  fuseHint: "\u540c\u4e00\u79cd\u6b66\u5668\u3001\u540c\u4e00\u79cd\u54c1\u8d28\u624d\u80fd\u5408\u6210\uff1b\u4f20\u8bf4\u54c1\u8d28\u65e0\u6cd5\u7ee7\u7eed\u5408\u6210\u3002",
  coin: "\u91d1\u5e01",
  items: "\u9053\u5177",
  noItems: "\u5f53\u524d\u6ca1\u6709\u6240\u6301\u9053\u5177\u3002",
  noItem: "\u9009\u62e9\u4e00\u4e2a\u9053\u5177\u67e5\u770b\u8be6\u60c5\u3002",
  quantity: "\u6570\u91cf",
  quality: "\u54c1\u8d28",
};

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
  dom.shopOverlay = document.getElementById("shopOverlay");
  dom.tooltip = document.createElement("div");
  dom.tooltip.className = "inventory-tooltip";
  document.body.appendChild(dom.tooltip);

  dom.openButton?.addEventListener("click", toggleInventory);
  dom.closeButton?.addEventListener("click", closeInventory);
  document.addEventListener("keydown", handleKeyDown, { capture: true });

  window[text.inventoryApi] = {
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
  if (previousMode === "shop") dom.shopOverlay?.classList.remove("active");
  state.mode = "inventory";
  fuseMaterialUid = normalizeFuseMaterial()?.uid ?? null;
  syncDetailSelection();
  renderInventory();
  dom.overlay?.classList.add("active");
  return true;
}

export function closeInventory() {
  if (!isInventoryOpen()) return false;
  hideItemTooltip();
  fuseMaterialUid = null;
  fuseMessage = "";
  detailSelection = { type: "weapon", id: state.inventory?.selectedWeaponUid ?? null };
  dom.overlay?.classList.remove("active");
  if (previousMode === "shop") {
    state.mode = "shop";
    dom.shopOverlay?.classList.add("active");
    renderShop();
  } else {
    state.mode = previousMode === "paused" ? "paused" : "playing";
    if (state.mode === "paused") dom.pauseOverlay?.classList.add("active");
  }
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
  return state.mode === "playing" || state.mode === "paused" || state.mode === "shop";
}

function renderStats() {
  const p = state.player;
  dom.stats.innerHTML = "";
  [
    [text.hp, `${Math.ceil(p.hp)} / ${p.maxHp}`],
    [text.level, `Lv.${p.level}`],
    [text.xp, `${Math.floor(p.xp)} / ${p.xpNeed}`],
    [text.speed, Math.round(p.speed)],
    [text.magnet, Math.round(p.magnet)],
    [text.damage, actualDamageValue()],
    [text.defense, Math.round(p.defense || 0)],
    [text.dodge, `${Math.round((p.dodge || 0) * 100)}%`],
    [text.crit, `${Math.round((p.critChance || 0) * 100)}%`],
    [text.luck, Math.round(p.luck || 0)],
    [text.regen, `${Math.round((p.regen || 0) * 10) / 10}/s`],
    [text.attackRange, `+${Math.round(p.attackRangeBonus || 0)}`],
    [text.attackSpeed, `${Math.round((1 + (p.attackSpeedBonus || 0)) * 100)}%`],
    [text.gold, state.gold],
  ].forEach(([label, value]) => {
    const row = document.createElement("span");
    row.innerHTML = `<b>${label}</b><strong>${value}</strong>`;
    dom.stats.appendChild(row);
  });
}

function actualDamageValue() {
  const scale = state.player?.damageScale || 1;
  const slots = state.inventory?.weaponSlots || [];
  let best = 0;
  for (const slot of slots) {
    const weapon = state.weapons?.[slot.id];
    if (!weapon) continue;
    const base = weapon.damage ?? weapon.bulletDamage ?? weapon.explodeDamage ?? 0;
    const qualityMult = QUALITY_INFO[slot.quality]?.mult || 1;
    best = Math.max(best, base * qualityMult);
  }
  return Math.round(best * scale);
}

function renderSummary() {
  if (dom.weaponCount) dom.weaponCount.textContent = `${text.weapons} ${state.inventory.weaponSlots.length}/6`;
  if (dom.goldCount) dom.goldCount.textContent = `${text.gold} ${state.gold}`;
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
      button.textContent = text.emptySlot;
    } else {
      const info = WEAPON_INFO[slot.id] || { icon: "?", name: slot.id };
      const quality = QUALITY_INFO[slot.quality] || QUALITY_INFO.common;
      const isActive = detailSelection.type === "weapon" && state.inventory.selectedWeaponUid === slot.uid;
      const isMaterial = fuseMaterialUid === slot.uid;
      const canUseAsMaterial = selected && canFuseWeapons(selected, slot).ok;
      button.className = `weapon-slot${isActive ? " active" : ""}${isMaterial ? " material" : ""}${canUseAsMaterial ? " fuseable" : ""}`;
      button.innerHTML = `<i style="color:${quality.color}">${info.icon}</i><span><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name}</small></span>`;
      button.addEventListener("click", () => {
        const current = selectedWeaponSlot();
        if (current && canFuseWeapons(current, slot).ok) {
          fuseMaterialUid = slot.uid;
          detailSelection = { type: "weapon", id: current.uid };
          fuseMessage = "";
        } else {
          selectWeaponSlot(slot.uid);
          detailSelection = { type: "weapon", id: slot.uid };
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
  syncDetailSelection();
  if (detailSelection.type === "item") return renderItemDetail();
  renderWeaponDetail();
}

function renderWeaponDetail() {
  const slot = selectedWeaponSlot();
  dom.detail.innerHTML = "";
  dom.fuseButton.hidden = false;
  dom.fuseButton.parentElement.hidden = false;

  if (!slot) {
    dom.detail.innerHTML = `<div class="empty-detail">${text.noWeapon}</div>`;
    dom.fuseButton.disabled = true;
    fuseMaterialUid = null;
    return;
  }

  const info = WEAPON_INFO[slot.id] || { icon: "?", name: slot.id, desc: "", tags: [] };
  const quality = QUALITY_INFO[slot.quality] || QUALITY_INFO.common;
  const material = normalizeFuseMaterial();
  const fuseCheck = canFuseWeapons(slot, material);
  const nextQuality = fuseCheck.nextQuality ? QUALITY_INFO[fuseCheck.nextQuality] : null;
  const sellPrice = weaponSellPrice(slot);
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
      <div class="weapon-tags detail-tags">${(info.tags || []).map((tag) => `<span>${tag}</span>`).join("")}</div>
      <p>${text.qualityMult}: ${Math.round(quality.mult * 100)}%</p>
      <button class="inventory-sell-button" type="button">${text.sellWeapon} +${sellPrice} ${text.coin}</button>
      ${renderFusePreview(slot, material, fuseCheck, nextQuality)}
    </div>`;

  dom.detail.querySelector(".inventory-sell-button")?.addEventListener("click", () => {
    const current = selectedWeaponSlot();
    if (!current) return;
    const price = weaponSellPrice(current);
    const currentInfo = WEAPON_INFO[current.id] || { name: current.id };
    const result = sellWeaponSlot(current.uid);
    fuseMaterialUid = normalizeFuseMaterial()?.uid ?? null;
    fuseMessage = result.ok ? `${text.sold} ${currentInfo.name}${text.gain} ${price} ${text.coin}\u3002` : result.reason;
    renderInventory();
  });

  dom.fuseButton.disabled = !fuseCheck.ok;
  dom.fuseButton.textContent = fuseCheck.ok ? text.fuse : text.noFuse;
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
      fuseMessage = `${text.fuseSuccess}: ${resultQuality.name} ${info.name}`;
      renderInventory();
    }
  };
}

function renderItemDetail() {
  const item = state.inventory.items.find((entry) => entry.id === detailSelection.id);
  dom.detail.innerHTML = "";
  dom.fuseButton.hidden = true;
  dom.fuseButton.parentElement.hidden = true;
  dom.fuseButton.disabled = true;
  dom.fuseButton.onclick = null;

  if (!item) {
    dom.detail.innerHTML = `<div class="empty-detail">${text.noItem}</div>`;
    return;
  }

  const quality = QUALITY_INFO[item.quality] || QUALITY_INFO.common;
  const price = itemSellPrice(item);
  dom.detail.innerHTML = `
    <div class="weapon-detail-card item-detail-card">
      <div class="weapon-detail-title">
        <i class="weapon-detail-icon" style="color:${quality.color}">${item.icon || "?"}</i>
        <div>
          <strong>${item.name || item.id}</strong>
          <div class="quality-chip" style="color:${quality.color}">${quality.name}</div>
        </div>
      </div>
      <p>${item.desc || ""}</p>
      <div class="item-detail-meta">
        <span><b>${text.quantity}</b><strong>x${item.qty}</strong></span>
        <span><b>${text.quality}</b><strong style="color:${quality.color}">${quality.name}</strong></span>
      </div>
      <button class="inventory-sell-button" type="button">${text.sellItem} +${price} ${text.coin}</button>
      ${fuseMessage ? `<p class="fuse-message">${fuseMessage}</p>` : ""}
    </div>`;

  dom.detail.querySelector(".inventory-sell-button")?.addEventListener("click", () => {
    const current = state.inventory.items.find((entry) => entry.id === detailSelection.id);
    if (!current) return;
    const currentPrice = itemSellPrice(current);
    const itemName = current.name || current.id;
    const result = sellInventoryItem(current.id);
    const stillOwned = state.inventory.items.some((entry) => entry.id === current.id);
    if (!stillOwned) detailSelection = { type: "weapon", id: state.inventory.selectedWeaponUid };
    fuseMessage = result.ok ? `${text.sold} ${itemName}${text.gain} ${currentPrice} ${text.coin}\u3002` : result.reason;
    renderInventory();
  });
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
  const info = WEAPON_INFO[slot.id] || { name: slot.id };
  const result = fuseCheck.ok
    ? `<div class="fuse-result"><span>${text.result}</span><strong style="color:${nextQuality.color}">${nextQuality.name} ${info.name}</strong></div>`
    : `<div class="fuse-result disabled"><span>${text.rule}</span><strong>${fuseCheck.reason}</strong></div>`;
  return `
    <div class="fuse-panel">
      <div class="fuse-row">
        ${renderFuseMini(slot, text.mainWeapon)}
        <b>+</b>
        ${material ? renderFuseMini(material, text.material) : `<div class="fuse-mini empty"><span>${text.material}</span><strong>${text.noMaterial}</strong></div>`}
      </div>
      ${result}
      <p class="fuse-hint">${text.fuseHint}</p>
      ${fuseMessage ? `<p class="fuse-message">${fuseMessage}</p>` : ""}
    </div>`;
}

function renderFuseMini(slot, label) {
  const info = WEAPON_INFO[slot.id] || { icon: "?", name: slot.id };
  const quality = QUALITY_INFO[slot.quality] || QUALITY_INFO.common;
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
  const count = document.querySelector(".inventory-items h3 span");
  if (count) count.textContent = `${state.inventory.items.length}`;
  if (!state.inventory.items.length) {
    const empty = document.createElement("div");
    empty.className = "item-empty";
    empty.textContent = text.noItems;
    dom.items.appendChild(empty);
    return;
  }
  for (const item of state.inventory.items) {
    const row = document.createElement("div");
    row.className = `item-card${detailSelection.type === "item" && detailSelection.id === item.id ? " active" : ""}`;
    const qty = item.qty;
    const price = itemSellPrice(item);
    const tipText = `${item.name || item.id}: ${item.desc || ""}`;
    row.setAttribute("data-tip", tipText);
    row.innerHTML = `
      <i>${item.icon || "?"}</i>
      <strong>x${qty}</strong>
      <button type="button" class="item-sell-button">${text.sell} ${price}</button>`;
    row.addEventListener("mouseenter", (event) => showItemTooltip(event, tipText));
    row.addEventListener("mousemove", (event) => moveItemTooltip(event));
    row.addEventListener("mouseleave", hideItemTooltip);
    row.addEventListener("click", () => {
      detailSelection = { type: "item", id: item.id };
      fuseMaterialUid = null;
      fuseMessage = "";
      hideItemTooltip();
      renderInventory();
    });
    row.querySelector("button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      hideItemTooltip();
      const itemName = item.name || item.id;
      const result = sellInventoryItem(item.id);
      fuseMessage = result.ok ? `${text.sold} ${itemName}${text.gain} ${price} ${text.coin}\u3002` : result.reason;
      renderInventory();
    });
    dom.items.appendChild(row);
  }
}

function syncDetailSelection() {
  if (!state.inventory) return;
  if (detailSelection.type === "item") {
    if (state.inventory.items.some((entry) => entry.id === detailSelection.id)) return;
    detailSelection = { type: "weapon", id: state.inventory.selectedWeaponUid };
  }
  const selected = selectedWeaponSlot();
  if (!selected && state.inventory.weaponSlots[0]) selectWeaponSlot(state.inventory.weaponSlots[0].uid);
  detailSelection = { type: "weapon", id: state.inventory.selectedWeaponUid ?? null };
}

function showItemTooltip(event, content) {
  if (!dom.tooltip) return;
  const [title, ...desc] = content.split(": ");
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
