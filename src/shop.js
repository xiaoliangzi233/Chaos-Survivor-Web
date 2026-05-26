import { state } from "./state.js";
import { addWeaponToInventory, QUALITY_INFO, QUALITY_ORDER, WEAPON_INFO } from "./inventory.js";
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
  {
    id: "shard_pack",
    icon: "◆",
    name: "晶核碎片包",
    category: "道具",
    rarity: "common",
    quantity: 18,
    maxPurchases: 3,
    basePrice: 14,
    desc: "获得 18 个碎片，用于背包武器升级。",
    apply: (offer) => {
      state.shards += offer.quantity;
      recordItem("shard_pack", "晶核碎片包", "◆", offer.quantity, "商店购买的升级材料。");
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
  if (offer.category === "武器" && !canAcceptWeapon(offer.weaponId)) return "武器槽已满";
  return "";
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
    desc: `获得或强化 ${info.name}。已有同类武器时提升等级。`,
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
  addWeaponToInventory(offer.weaponId, offer.rarity);
}

function canAcceptWeapon(weaponId) {
  const inv = state.inventory;
  if (!inv) return false;
  return inv.weaponSlots.length < 6;
}

function recordItem(id, name, icon, qty, desc) {
  const inv = state.inventory;
  if (!inv) return;
  const existing = inv.items.find((item) => item.id === id);
  if (existing) existing.qty += qty;
  else inv.items.push({ id, name, icon, qty, desc });
}
