import { createInventory, state } from "../state.js";
import { canFuseWeapons, findFuseCandidate, fuseWeaponSlots, QUALITY_INFO, WEAPON_INFO } from "../economy/inventory.js";
import {
  isSoldOut,
  prepareShopOffers,
  purchaseDisabledReason,
  purchaseOffer,
  refreshCost,
  refreshShopOffers,
  toggleOfferLock,
} from "../economy/shop.js";

const dom = {};
let continueHandler = null;

const text = {
  noGoldRefresh: "\u91d1\u5e01\u4e0d\u8db3\uff0c\u65e0\u6cd5\u5237\u65b0\u3002",
  refresh: "\u5237\u65b0\u5546\u54c1",
  refreshNoGold: "\u91d1\u5e01\u4e0d\u8db3",
  coin: "\u91d1\u5e01",
  lockHint: "\u9501\u5b9a\u7684\u5546\u54c1\u4e0d\u4f1a\u5728\u5237\u65b0\u6216\u4e0b\u6b21\u8fdb\u5165\u5546\u5e97\u65f6\u53d8\u5316\u3002",
  sold: "\u5df2\u552e\u7f44",
  locked: "\u5df2\u9501\u5b9a",
  lock: "\u9501\u5b9a",
  buy: "\u8d2d\u4e70",
  bought: "\u8d2d\u4e70\u6210\u529f\u3002",
  quantity: "\u6570\u91cf",
  directFuse: "\u8d2d\u4e70\u540e\u76f4\u63a5\u5408\u6210",
  fuseNow: "\u76f4\u63a5\u5408\u6210",
  fuseHint: "\u5728\u6b66\u5668\u69fd\u4e2d\u9009\u62e9\u53ef\u5408\u6210\u7684\u6b66\u5668",
  fuseSuccess: "\u6b66\u5668\u5408\u6210\u6210\u529f\u3002",
  weaponSlots: "\u6b66\u5668\u69fd",
  emptySlot: "\u7a7a\u69fd\u4f4d",
  unknownWeapon: "\u672a\u77e5\u6b66\u5668",
};

export function initShopUi({ continueToNextWave }) {
  continueHandler = continueToNextWave;
  dom.overlay = document.getElementById("shopOverlay");
  dom.gold = document.getElementById("shopGoldText");
  dom.list = document.getElementById("shopOfferList");
  dom.inventory = document.getElementById("shopInventoryPanel");
  dom.refresh = document.getElementById("shopRefreshButton");
  dom.continue = document.getElementById("shopContinueButton");
  dom.hint = document.getElementById("shopHint");

  dom.refresh?.addEventListener("click", () => {
    if (refreshShopOffers()) renderShop();
    else renderShop(text.noGoldRefresh);
  });
  dom.continue?.addEventListener("click", () => {
    closeShop();
    continueHandler?.();
  });
}

export function openShop() {
  prepareShopOffers({ preserveLocked: true });
  state.mode = "shop";
  renderShop();
  dom.overlay?.classList.add("active");
}

export function closeShop() {
  dom.overlay?.classList.remove("active");
}

export function isShopOpen() {
  return state.mode === "shop" || dom.overlay?.classList.contains("active");
}

export function renderShop(message = "") {
  if (!dom.list || !state.shop) return;
  ensureInventory();
  dom.gold.textContent = String(state.gold);
  const cost = refreshCost();
  const canRefresh = state.gold >= cost;
  dom.refresh.textContent = canRefresh ? `${text.refresh} - ${cost} ${text.coin}` : `${text.refreshNoGold} - ${cost} ${text.coin}`;
  dom.refresh.disabled = !canRefresh;
  dom.refresh.classList.toggle("no-gold-refresh", !canRefresh);
  dom.list.innerHTML = "";
  for (const offer of state.shop.offers) dom.list.appendChild(renderOffer(offer));
  renderShopInventory();
  dom.hint.textContent = message || text.lockHint;
}

function ensureInventory() {
  state.inventory ||= createInventory();
  state.inventory.weaponSlots ||= [];
  state.inventory.items ||= [];
}

function renderOffer(offer) {
  const quality = QUALITY_INFO[offer.rarity] || QUALITY_INFO.common;
  const soldOut = isSoldOut(offer);
  const reason = purchaseDisabledReason(offer);
  const isWeapon = offer.category === "\u6b66\u5668";
  const fuseTarget = isWeapon ? shopFuseTarget(offer) : null;
  const card = document.createElement("article");
  card.className = `shop-card${soldOut ? " sold-out" : ""}`;
  card.style.setProperty("--quality", quality.color);

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = `shop-lock${offer.locked ? " active" : ""}`;
  lock.textContent = offer.locked ? text.locked : text.lock;
  lock.disabled = soldOut;
  lock.addEventListener("click", () => {
    toggleOfferLock(offer.uid);
    renderShop();
  });

  const buy = document.createElement("button");
  buy.type = "button";
  buy.className = "primary shop-buy";
  buy.textContent = soldOut ? text.sold : `${text.buy} ${offer.price}`;
  buy.disabled = Boolean(reason);
  buy.title = reason;
  buy.addEventListener("click", () => {
    const result = purchaseOffer(offer.uid);
    renderShop(result.ok ? (fuseTarget ? text.fuseSuccess : text.bought) : result.reason);
  });

  card.innerHTML = `
    <div class="shop-card-top">
      <i>${offer.icon}</i>
      <div>
        <strong>${offer.name}</strong>
        <span style="color:${quality.color}">${quality.name} · ${offer.category}</span>
      </div>
    </div>
    <p>${offer.desc}</p>
    <div class="shop-meta">
      <span>${text.quantity} x${offer.quantity}</span>
      <span>${offer.purchaseCount}/${offer.maxPurchases}</span>
      <span>${offer.price} ${text.coin}</span>
      ${fuseTarget ? `<span>${text.directFuse}</span>` : ""}
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "shop-card-actions";
  actions.append(lock, buy);
  card.appendChild(actions);
  return card;
}

function shopFuseTarget(offer) {
  const incoming = { uid: -1, id: offer.weaponId, quality: offer.rarity };
  return state.inventory?.weaponSlots.find((slot) => canFuseWeapons(slot, incoming).ok) || null;
}

function renderShopInventory() {
  if (!dom.inventory) return;
  ensureInventory();
  const weaponSlots = state.inventory.weaponSlots;
  dom.inventory.innerHTML = `
    <section class="shop-inventory-section">
      <h3>${text.weaponSlots} <span>${weaponSlots.length}/6</span></h3>
      <div class="shop-weapon-slots"></div>
    </section>`;

  renderShopWeaponSlots(dom.inventory.querySelector(".shop-weapon-slots"), weaponSlots);
}

function renderShopWeaponSlots(container, weaponSlots) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const slot = weaponSlots[i];
    const row = document.createElement("div");
    row.className = `shop-slot-row${slot ? "" : " empty"}`;
    if (!slot) {
      row.textContent = text.emptySlot;
      container.appendChild(row);
      continue;
    }

    const info = WEAPON_INFO[slot.id] || { icon: "?", name: slot.id || text.unknownWeapon };
    const quality = QUALITY_INFO[slot.quality] || QUALITY_INFO.common;
    row.innerHTML = `
      <i style="color:${quality.color}">${info.icon}</i>
      <span><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name}</small></span>`;
    const material = findFuseCandidate(slot);
    if (material) {
      const fuse = document.createElement("button");
      fuse.type = "button";
      fuse.className = "shop-slot-fuse";
      fuse.textContent = text.fuseNow;
      fuse.title = text.fuseHint;
      fuse.addEventListener("click", () => {
        const currentMaterial = findFuseCandidate(slot);
        const result = currentMaterial && fuseWeaponSlots(slot.uid, currentMaterial.uid);
        renderShop(result ? text.fuseSuccess : text.fuseHint);
      });
      row.appendChild(fuse);
    }
    container.appendChild(row);
  }
}
