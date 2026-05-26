import { state } from "./state.js";
import { QUALITY_INFO, WEAPON_INFO } from "./inventory.js";
import {
  canFuseShopWeapon,
  itemSellPrice,
  isSoldOut,
  prepareShopOffers,
  purchaseDisabledReason,
  purchaseOffer,
  refreshCost,
  refreshShopOffers,
  sellInventoryItem,
  sellWeaponSlot,
  toggleOfferLock,
  weaponSellPrice,
} from "./shop.js";

const dom = {};
let continueHandler = null;

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
    else renderShop("金币不足，无法刷新。");
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
  dom.gold.textContent = String(state.gold);
  const cost = refreshCost();
  dom.refresh.textContent = `刷新商品 - ${cost} 金币`;
  dom.refresh.disabled = state.gold < cost;
  dom.list.innerHTML = "";
  for (const offer of state.shop.offers) dom.list.appendChild(renderOffer(offer));
  renderShopInventory();
  dom.hint.textContent = message || "锁定的商品不会在刷新或下次进入商店时变化。";
}

function renderOffer(offer) {
  const quality = QUALITY_INFO[offer.rarity] || QUALITY_INFO.common;
  const soldOut = isSoldOut(offer);
  const reason = purchaseDisabledReason(offer);
  const canFuseOnFull = offer.category === "武器" && state.inventory?.weaponSlots.length >= 6 && canFuseShopWeapon(offer.weaponId, offer.rarity);
  const card = document.createElement("article");
  card.className = `shop-card${soldOut ? " sold-out" : ""}`;
  card.style.setProperty("--quality", quality.color);

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = `shop-lock${offer.locked ? " active" : ""}`;
  lock.textContent = offer.locked ? "已锁定" : "锁定";
  lock.disabled = soldOut;
  lock.addEventListener("click", () => {
    toggleOfferLock(offer.uid);
    renderShop();
  });

  const buy = document.createElement("button");
  buy.type = "button";
  buy.className = "primary shop-buy";
  buy.textContent = soldOut ? "已售罄" : `购买 ${offer.price}`;
  buy.disabled = Boolean(reason);
  buy.title = reason;
  buy.addEventListener("click", () => {
    const result = purchaseOffer(offer.uid);
    renderShop(result.ok ? "购买成功。" : result.reason);
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
      <span>数量 x${offer.quantity}</span>
      <span>${offer.purchaseCount}/${offer.maxPurchases}</span>
      <span>${offer.price} 金币</span>
      ${canFuseOnFull ? "<span>槽满购买后自动合成</span>" : ""}
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "shop-card-actions";
  actions.append(lock, buy);
  card.appendChild(actions);
  return card;
}

function renderShopInventory() {
  if (!dom.inventory || !state.inventory) return;
  const weaponSlots = state.inventory.weaponSlots;
  dom.inventory.innerHTML = `
    <section class="shop-inventory-section">
      <h3>武器槽 <span>${weaponSlots.length}/6</span></h3>
      <div class="shop-weapon-slots"></div>
    </section>
    <section class="shop-inventory-section">
      <h3>可出售道具</h3>
      <div class="shop-item-slots"></div>
    </section>`;

  const weaponList = dom.inventory.querySelector(".shop-weapon-slots");
  for (let i = 0; i < 6; i++) {
    const slot = weaponSlots[i];
    const row = document.createElement("div");
    row.className = `shop-slot-row${slot ? "" : " empty"}`;
    if (!slot) {
      row.textContent = "空槽位";
    } else {
      const info = WEAPON_INFO[slot.id];
      const quality = QUALITY_INFO[slot.quality] || QUALITY_INFO.common;
      const price = weaponSellPrice(slot);
      row.innerHTML = `
        <i style="color:${quality.color}">${info.icon}</i>
        <span><strong>${info.name}</strong><small style="color:${quality.color}">${quality.name}</small></span>
        <button type="button">出售 ${price}</button>`;
      row.querySelector("button").addEventListener("click", () => {
        const result = sellWeaponSlot(slot.uid);
        renderShop(result.ok ? `已出售 ${info.name}，获得 ${price} 金币。` : result.reason);
      });
    }
    weaponList.appendChild(row);
  }

  const itemList = dom.inventory.querySelector(".shop-item-slots");
  if (!state.inventory.items.length) {
    const empty = document.createElement("div");
    empty.className = "shop-slot-row empty";
    empty.textContent = "暂无道具";
    itemList.appendChild(empty);
    return;
  }
  for (const item of state.inventory.items) {
    const price = itemSellPrice(item);
    const row = document.createElement("div");
    row.className = "shop-slot-row";
    row.innerHTML = `
      <i>${item.icon}</i>
      <span><strong>${item.name}</strong><small>x${item.qty}</small></span>
      <button type="button">出售 ${price}</button>`;
    row.querySelector("button").addEventListener("click", () => {
      const result = sellInventoryItem(item.id);
      renderShop(result.ok ? `已出售 ${item.name}，获得 ${price} 金币。` : result.reason);
    });
    itemList.appendChild(row);
  }
}
