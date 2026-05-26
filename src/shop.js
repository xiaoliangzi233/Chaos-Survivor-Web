import { state } from "./state.js";
import { addWeaponToInventory, canFuseWeapons, QUALITY_INFO, QUALITY_ORDER, recomputeAllWeapons, WEAPON_INFO } from "./inventory.js";
import { playSfx } from "./audio.js";

const SHOP_SLOTS = 4;
const STARTER_WEIGHT = 2.5;

const RARITY_WEIGHTS = [
  ["common", 58],
  ["uncommon", 25],
  ["rare", 11],
  ["epic", 4.5],
  ["legendary", 1.5],
];

const ITEM_POOL = [
  {
    id: "medkit",
    icon: "+",
    name: "急救凝胶",
    category: "道具",
    rarity: "common",
    quantity: 1,
    maxPurchases: 2,
    basePrice: 10,
    desc: "立即恢复 45 点生命。",
    apply: () => {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 45);
      recordItem("medkit", "急救凝胶", "+", 1, "购买过的战场治疗补给。");
    },
  },
  {
    id: "vital_core",
    icon: "H",
    name: "生命核心",
    category: "道具",
    rarity: "uncommon",
    quantity: 1,
    maxPurchases: 2,
    basePrice: 18,
    desc: "最大生命提高 16，并恢复 24 点生命。",
    apply: () => {
      state.player.maxHp += 16;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 24);
      recordItem("vital_core", "生命核心", "H", 1, "最大生命提高。");
    },
  },
  {
    id: "phase_boots",
    icon: ">",
    name: "相位步靴",
    category: "道具",
    rarity: "uncommon",
    quantity: 1,
    maxPurchases: 2,
    basePrice: 20,
    desc: "移动速度提高 12。",
    apply: () => {
      state.player.speed += 12;
      recordItem("phase_boots", "相位步靴", ">", 1, "移动速度提高。");
    },
  },
  {
    id: "magnet_ring",
    icon: "O",
    name: "磁吸星环",
    category: "道具",
    rarity: "rare",
    quantity: 1,
    maxPurchases: 2,
    basePrice: 24,
    desc: "拾取范围提高 18。",
    apply: () => {
      state.player.magnet += 18;
      recordItem("magnet_ring", "磁吸星环", "O", 1, "拾取范围提高。");
    },
  },
  {
    id: "damage_chip",
    icon: "*",
    name: "裂解芯片",
    category: "道具",
    rarity: "rare",
    quantity: 1,
    maxPurchases: 2,
    basePrice: 32,
    desc: "所有武器伤害倍率提高 8%。",
    apply: () => {
      state.player.damageScale += 0.08;
      recordItem("damage_chip", "裂解芯片", "*", 1, "所有武器伤害倍率提高。");
    },
  },
];

export function createShopState() {
  return {
    offers: [],
    refreshCount: 0,
    nextOfferUid: 1,
  };
}

export function prepareShopOffers({ preserveLocked = true } = {}) {
  ensureShop();
  const kept = preserveLocked ? state.shop.offers.filter((offer) => offer.locked && !isSoldOut(offer)) : [];
  state.shop.offers = kept;
  while (state.shop.offers.length < SHOP_SLOTS) state.shop.offers.push(createOffer());
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
  state.shop.offers = state.shop.offers.filter((offer) => offer.locked && !isSoldOut(offer));
  while (state.shop.offers.length < SHOP_SLOTS) state.shop.offers.push(createOffer());
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

export function purchaseOffer(uid) {
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
  state.gold -= offer.price;
  if (offer.category === "武器") buyWeapon(offer);
  else offer.apply?.(offer);
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
  if (state.gold < offer.price) return "金币不足";
  if (offer.category === "武器" && !canAcceptWeapon(offer.weaponId, offer.rarity)) return "武器槽已满，且无法合成";
  return "";
}

export function sellWeaponSlot(uid) {
  const inv = state.inventory;
  if (!inv) return { ok: false, reason: "背包不存在" };
  const idx = inv.weaponSlots.findIndex((slot) => slot.uid === uid);
  if (idx < 0) return { ok: false, reason: "武器不存在" };
  const [slot] = inv.weaponSlots.splice(idx, 1);
  state.gold += weaponSellPrice(slot);
  if (inv.selectedWeaponUid === uid) inv.selectedWeaponUid = inv.weaponSlots[0]?.uid ?? null;
  recomputeAllWeapons();
  playSfx("coin");
  return { ok: true };
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
  const template = ITEM_POOL.find((entry) => entry.id === item?.id);
  return Math.max(2, Math.floor((template?.basePrice || 10) * 0.35));
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

function createOffer() {
  return Math.random() < 0.58 ? createWeaponOffer() : createItemOffer();
}

function createWeaponOffer() {
  const weaponId = weightedWeaponId();
  const rarity = weightedChoice(RARITY_WEIGHTS);
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
    price: Math.floor((18 + rank * rank * 13 + state.wave * 3) * (weaponId === state.initialWeaponId ? 0.92 : 1)),
    maxPurchases: 1,
    purchaseCount: 0,
    quantity: 1,
    locked: false,
    desc: `获得一把新的 ${info.name}。同类武器也会占用新的武器槽。`,
  };
}

function createItemOffer() {
  const template = weightedChoice(ITEM_POOL.map((item) => [item, itemWeight(item)]));
  const rarity = template.rarity;
  const rank = QUALITY_ORDER.indexOf(rarity);
  return {
    uid: state.shop.nextOfferUid++,
    id: template.id,
    icon: template.icon,
    name: template.name,
    rarity,
    category: template.category,
    price: Math.floor(template.basePrice + state.wave * (1.5 + rank * 0.8)),
    maxPurchases: template.maxPurchases,
    purchaseCount: 0,
    quantity: template.quantity,
    locked: false,
    desc: template.desc,
    apply: template.apply,
  };
}

function weightedWeaponId() {
  const entries = Object.keys(WEAPON_INFO).map((id) => [id, id === state.initialWeaponId ? STARTER_WEIGHT : 1]);
  return weightedChoice(entries);
}

function itemWeight(item) {
  const rank = QUALITY_ORDER.indexOf(item.rarity);
  return Math.max(1, 8 - rank * 1.6);
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

function buyWeapon(offer) {
  const inv = state.inventory;
  if (!inv) return null;
  if (inv.weaponSlots.length < 6) return addWeaponToInventory(offer.weaponId, offer.rarity);
  const incoming = { uid: -1, id: offer.weaponId, quality: offer.rarity };
  const target = inv.weaponSlots.find((slot) => canFuseWeapons(slot, incoming).ok);
  if (!target) return null;
  const nextQuality = canFuseWeapons(target, incoming).nextQuality;
  target.quality = nextQuality;
  inv.selectedWeaponUid = target.uid;
  recomputeAllWeapons();
  return target;
}

function canAcceptWeapon(weaponId, quality) {
  const inv = state.inventory;
  if (!inv) return false;
  return inv.weaponSlots.length < 6 || canFuseShopWeapon(weaponId, quality);
}

function recordItem(id, name, icon, qty, desc) {
  const inv = state.inventory;
  if (!inv) return;
  const existing = inv.items.find((item) => item.id === id);
  if (existing) existing.qty += qty;
  else inv.items.push({ id, name, icon, qty, desc });
}
