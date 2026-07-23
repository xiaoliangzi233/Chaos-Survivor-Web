import { state } from "../state.js";
import { addWeaponToInventory, canFuseWeapons, QUALITY_INFO, QUALITY_ORDER, recomputeAllWeapons, WEAPON_INFO } from "./inventory.js";
import { applyItemPurchase, canPurchaseItem, hasPurchasedUniqueItem, ITEM_DEFS, itemDescription, itemSellPriceById, offerQualityForItem, weightedQuality } from "../systems/items.js";
import { ITEM_RARITY_WEIGHTS } from "../config/editableGameData.js";
import { playSfx } from "../audio.js";

const SHOP_SLOTS = 4;
const STARTER_WEIGHT = 2.5;

const RARITY_WEIGHTS = [
  ["common", 58],
  ["uncommon", 25],
  ["rare", 11],
  ["epic", 4.5],
  ["legendary", 1.5],
];

export function createShopState() {
  return {
    offers: [],
    refreshCount: 0,
    nextOfferUid: 1,
    beforeBossWave: false,
  };
}

export function prepareShopOffers({ preserveLocked = true, beforeBossWave = false } = {}) {
  ensureShop();
  state.shop.beforeBossWave = Boolean(beforeBossWave);
  state.shop.offers = preserveLocked ? eligibleLockedOffers(state.shop.offers) : [];
  fillShopSlots();
  state.shop.refreshCount = 0;
  return state.shop.offers;
}

export function refreshShopOffers() {
  ensureShop();
  const cost = refreshCost();
  if (state.gold < cost) {
    playSfx("deny");
    return false;
  }
  state.gold -= cost;
  state.shop.refreshCount++;
  state.shop.offers = eligibleLockedOffers(state.shop.offers);
  fillShopSlots();
  playSfx("select");
  return true;
}

export function toggleOfferLock(uid) {
  const offer = findOffer(uid);
  if (!offer || isSoldOut(offer)) return false;
  offer.locked = !offer.locked;
  playSfx("select");
  return true;
}

export function purchaseOffer(uid, options = {}) {
  const offer = findOffer(uid);
  if (!offer || isSoldOut(offer)) return { ok: false, reason: "商品已售罄" };
  const disabled = purchaseDisabledReason(offer);
  if (disabled) {
    playSfx("deny");
    return { ok: false, reason: disabled };
  }
  if (state.gold < offer.price) {
    playSfx("deny");
    return { ok: false, reason: "金币不足" };
  }
  if (offer.category === "武器" && options.fuseWeaponUid && !canFuseOfferIntoSlot(offer, options.fuseWeaponUid)) {
    playSfx("deny");
    return { ok: false, reason: "无法合成该武器" };
  }
  state.gold -= offer.price;
  if (offer.category === "武器") buyWeapon(offer, options);
  else applyItemPurchase(offer);
  offer.purchaseCount++;
  if (isSoldOut(offer)) offer.locked = false;
  playSfx("buy");
  return { ok: true };
}

export function refreshCost() {
  const wave = Math.max(1, state.wave || 1);
  return 8 + wave * 2 + (state.shop?.refreshCount || 0) * 4;
}

export function purchaseDisabledReason(offer) {
  if (!offer) return "商品不存在";
  if (isSoldOut(offer)) return "商品已售罄";
  if (offer.category === "道具") {
    const check = canPurchaseItem(offer.itemId || offer.id);
    if (!check.ok) return check.reason;
  }
  if (state.gold < offer.price) return "金币不足";
  if (offer.category === "武器" && !canAcceptWeapon(offer.weaponId, offer.rarity)) return "武器槽已满，且无法合成";
  return "";
}

export function sellWeaponSlot(uid) {
  const inv = state.inventory;
  const disabledReason = weaponSellDisabledReason(uid);
  if (disabledReason) return { ok: false, reason: disabledReason };
  const idx = inv.weaponSlots.findIndex((slot) => slot.uid === uid);
  const [slot] = inv.weaponSlots.splice(idx, 1);
  state.gold += weaponSellPrice(slot);
  if (inv.selectedWeaponUid === uid) inv.selectedWeaponUid = inv.weaponSlots[0]?.uid ?? null;
  recomputeAllWeapons();
  playSfx("coin");
  return { ok: true };
}

export function weaponSellDisabledReason(uid) {
  const inv = state.inventory;
  if (!inv) return "背包不存在";
  if (!inv.weaponSlots.some((slot) => slot.uid === uid)) return "武器不存在";
  if (inv.weaponSlots.length <= 1) return "至少保留一件武器";
  return "";
}

export function sellInventoryItem(id) {
  const inv = state.inventory;
  if (!inv) return { ok: false, reason: "背包不存在" };
  const item = inv.items.find((entry) => entry.id === id);
  if (!item || item.qty <= 0) return { ok: false, reason: "道具不存在" };
  item.qty--;
  state.gold += itemSellPrice(item);
  if (item.qty <= 0) inv.items.splice(inv.items.indexOf(item), 1);
  playSfx("coin");
  return { ok: true };
}

export function weaponSellPrice(slot) {
  const rank = Math.max(0, QUALITY_ORDER.indexOf(slot?.quality || "common"));
  return Math.floor(6 + rank * rank * 7 + rank * 4);
}

export function itemSellPrice(item) {
  return itemSellPriceById(item?.itemId || item?.id, item?.quality || "common");
}

export function canFuseShopWeapon(weaponId, quality) {
  const inv = state.inventory;
  if (!inv || !weaponId || !quality) return false;
  const incoming = { uid: -1, id: weaponId, quality };
  return inv.weaponSlots.some((slot) => canFuseWeapons(slot, incoming).ok);
}

export function isSoldOut(offer) {
  return offer.purchaseCount >= offer.maxPurchases;
}

function ensureShop() {
  state.shop ||= createShopState();
}

function findOffer(uid) {
  ensureShop();
  return state.shop.offers.find((offer) => offer.uid === uid) || null;
}

export function shopOffers() {
  ensureShop();
  return state.shop.offers;
}

export function getOfferByUid(uid) {
  return findOffer(uid);
}

function fillShopSlots() {
  const uniqueItemIds = new Set(state.shop.offers.map(uniqueItemIdForOffer).filter(Boolean));
  while (state.shop.offers.length < SHOP_SLOTS) {
    const offer = createOffer(uniqueItemIds);
    state.shop.offers.push(offer);
    const uniqueItemId = uniqueItemIdForOffer(offer);
    if (uniqueItemId) uniqueItemIds.add(uniqueItemId);
  }
}

function eligibleLockedOffers(offers) {
  const uniqueItemIds = new Set();
  return offers.filter((offer) => {
    if (!offer.locked || isSoldOut(offer)) return false;
    if (offer.category !== "道具") return true;
    const itemId = offer.itemId || offer.id;
    if ((state.shop.beforeBossWave && itemId === "bait") || !canPurchaseItem(itemId).ok) return false;
    const uniqueItemId = uniqueItemIdForOffer(offer);
    if (!uniqueItemId) return true;
    if (uniqueItemIds.has(uniqueItemId)) return false;
    uniqueItemIds.add(uniqueItemId);
    return true;
  });
}

function createOffer(excludedUniqueItemIds) {
  if (Math.random() < 0.58) return createWeaponOffer();
  return createItemOffer(excludedUniqueItemIds) || createWeaponOffer();
}

function createWeaponOffer() {
  const weaponId = weightedWeaponId();
  const rarity = weightedQuality(RARITY_WEIGHTS);
  const info = WEAPON_INFO[weaponId];
  const rank = QUALITY_ORDER.indexOf(rarity);
  return {
    uid: state.shop.nextOfferUid++,
    id: `weapon_${weaponId}_${rarity}`,
    weaponId,
    icon: info.icon,
    name: `${QUALITY_INFO[rarity].name}${info.name}`,
    rarity,
    category: "武器",
    price: Math.floor((18 + rank * rank * 13 + state.wave * 3) * premiumQualityPriceMultiplier(rarity) * (weaponId === state.initialWeaponId ? 0.92 : 1)),
    maxPurchases: 1,
    purchaseCount: 0,
    quantity: 1,
    locked: false,
    desc: `获得一把新的 ${info.name}。同类武器也会占用新的武器槽。`,
  };
}

function createItemOffer(excludedUniqueItemIds = new Set()) {
  const candidates = ITEM_DEFS.filter((item) =>
    (!state.shop.beforeBossWave || item.id !== "bait")
    && (!item.unique || (!hasPurchasedUniqueItem(item.id) && !excludedUniqueItemIds.has(item.id)))
    && canPurchaseItem(item.id).ok
  );
  if (!candidates.length) return null;
  const template = weightedChoice(candidates.map((item) => [item, itemWeight(item)]));
  const rarity = offerQualityForItem(template, weightedQuality(ITEM_RARITY_WEIGHTS));
  const rank = QUALITY_ORDER.indexOf(rarity);
  const quality = QUALITY_INFO[rarity] || QUALITY_INFO.common;
  return {
    uid: state.shop.nextOfferUid++,
    id: template.id,
    itemId: template.id,
    icon: template.icon,
    name: template.singleQuality ? template.name : `${quality.name}${template.name}`,
    rarity,
    category: "道具",
    price: Math.floor((template.basePrice + state.wave * (1.5 + rank * 0.8)) * (QUALITY_INFO[rarity]?.mult || 1) * premiumQualityPriceMultiplier(rarity)),
    maxPurchases: 1,
    purchaseCount: 0,
    quantity: 1,
    locked: false,
    desc: itemDescription(template, rarity),
  };
}

function uniqueItemIdForOffer(offer) {
  if (offer?.category !== "道具") return "";
  const itemId = offer.itemId || offer.id;
  return ITEM_DEFS.find((item) => item.id === itemId)?.unique ? itemId : "";
}

function weightedWeaponId() {
  const entries = Object.keys(WEAPON_INFO).map((id) => [id, id === state.initialWeaponId ? STARTER_WEIGHT : 1]);
  return weightedChoice(entries);
}

function itemWeight(item) {
  const lateGame = state.wave >= 6 ? 1.15 : 1;
  const expensive = item.basePrice >= 34 ? 0.82 : 1;
  return Math.max(0.5, lateGame * expensive);
}

function premiumQualityPriceMultiplier(quality) {
  if (quality === "legendary") return 3.1;
  if (quality === "epic") return 2.56;
  if (quality === "rare") return 1.75;
  return 1;
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function buyWeapon(offer, options = {}) {
  const inv = state.inventory;
  if (!inv) return null;
  if (options.fuseWeaponUid) {
    const target = inv.weaponSlots.find((slot) => slot.uid === options.fuseWeaponUid);
    const incoming = { uid: -1, id: offer.weaponId, quality: offer.rarity };
    const check = canFuseWeapons(target, incoming);
    if (!check.ok) return null;
    target.quality = check.nextQuality;
    inv.selectedWeaponUid = target.uid;
    recomputeAllWeapons();
    return target;
  }
  const incoming = { uid: -1, id: offer.weaponId, quality: offer.rarity };
  const target = inv.weaponSlots.find((slot) => canFuseWeapons(slot, incoming).ok);
  if (target) {
    const nextQuality = canFuseWeapons(target, incoming).nextQuality;
    target.quality = nextQuality;
    inv.selectedWeaponUid = target.uid;
    recomputeAllWeapons();
    return target;
  }
  if (inv.weaponSlots.length < 6) return addWeaponToInventory(offer.weaponId, offer.rarity);
  return null;
}

function canFuseOfferIntoSlot(offer, uid) {
  const target = state.inventory?.weaponSlots.find((slot) => slot.uid === uid);
  const incoming = { uid: -1, id: offer.weaponId, quality: offer.rarity };
  return canFuseWeapons(target, incoming).ok;
}

function canAcceptWeapon(weaponId, quality) {
  const inv = state.inventory;
  if (!inv) return false;
  return inv.weaponSlots.length < 6 || canFuseShopWeapon(weaponId, quality);
}
