import { evaluateBuild, scoreItemForBuild, scoreWeaponForBuild } from "./buildEvaluator.js";

const QUALITY_RANK = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const ITEM_VALUES = {
  heart_container: 78,
  healing_potion: 56,
  healing_aura: 74,
  tardigrade: 82,
  heavy_armor: 58,
  speed_boots: 76,
  rapid_cord: 82,
  knife: 78,
  gloves: 62,
  fang: 58,
  split_shot: 84,
  magnet: 64,
  lucky_clover: 52,
  thief_mark: 48,
  star_cloak: 58,
  landmine: 48,
  airburst: 74,
  turret: 56,
  shackles: 30,
  dodge_cloak: 42,
  bait: 16,
};

export function decideShopActions({ offers, player, inventory, state, refreshCost, refreshesUsed = 0, config = {}, situation = {} }) {
  const actions = [];
  const profile = buildInventoryProfile(player, inventory, state, situation);
  const build = evaluateBuild({ player, state, inventory, weapons: state.weapons, situation });
  const reserveGold = dynamicReserveGold(state, profile) * (config.reserveGoldMultiplier || 1);
  const refreshThreshold = 58 * (config.refreshAggression ? 1 / config.refreshAggression : 1);
  const scored = (offers || [])
    .filter((offer) => !isSoldOut(offer))
    .map((offer) => scoreOffer({ offer, player, inventory, state, profile, build, situation, config }))
    .sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    if (entry.score >= 50 && state.gold >= entry.offer.price + reserveGold) {
      actions.push({ type: "buy", uid: entry.offer.uid, fuseWeaponUid: entry.fuseWeaponUid, score: entry.score, reason: entry.reason });
      state = { ...state, gold: state.gold - entry.offer.price };
    } else if (shouldLockOffer(entry.offer, entry.score, state.gold + expectedNextWaveGold(state)) && !entry.offer.locked && config.lockAffordableHighValue !== false) {
      actions.push({ type: "lock", uid: entry.offer.uid, score: entry.score, reason: "high_value_not_enough_gold" });
    }
  }

  const bestScore = scored
    .filter((entry) => state.gold >= (entry.offer.price || 0) + reserveGold)
    .reduce((best, entry) => Math.max(best, entry.score), 0);
  const canRefresh = state.gold >= refreshCost + reserveGold && refreshesUsed < (config.maxRefreshesPerShop ?? 2);
  if (bestScore < refreshThreshold && canRefresh) actions.push({ type: "refresh", cost: refreshCost, reason: "low_offer_value" });
  actions.push({ type: "continue" });
  return actions;
}

export function scoreOffer({ offer, player, inventory, state, profile = buildInventoryProfile(player, inventory, state), build = null, situation = {}, config = {} }) {
  build ||= evaluateBuild({ player, state, inventory, weapons: state.weapons, situation });
  const category = offerCategory(offer);
  const rank = QUALITY_RANK[offer.rarity] ?? 0;
  let score = 0;
  let reason = "baseline";
  let fuseWeaponUid = null;

  if (category === "weapon") {
    const matching = profile.fuseMap.get(`${offer.weaponId}:${offer.rarity}`);
    const hasSpace = profile.hasOpenWeaponSlot;
    if (matching) {
      score = 92 + rank * 8;
      fuseWeaponUid = matching.uid;
      reason = "fuse";
    } else if (hasSpace) {
      score = 50 + rank * 14 + (offer.weaponId === state.initialWeaponId ? 12 : 0);
      reason = offer.weaponId === state.initialWeaponId ? "starter_stack" : "new_weapon";
    } else {
      score = -100;
      reason = "slots_full";
    }
    score += scoreWeaponForBuild(offer.weaponId, build, {
      starterWeaponId: state.initialWeaponId,
      canFuse: Boolean(matching),
      config: state.ai?.config?.buildEvaluator || {},
    });
  } else {
    const id = offer.itemId || offer.id;
    score = estimateOfferGain(offer, profile).score + rank * 8;
    reason = id;
    const hpRatio = player.maxHp ? player.hp / player.maxHp : 1;
    if (["heart_container", "healing_potion", "healing_aura", "tardigrade", "heavy_armor"].includes(id)) score += (1 - hpRatio) * 45;
    if (["speed_boots", "magnet"].includes(id) && state.wave <= 8) score += 12;
    if (["rapid_cord", "knife", "split_shot"].includes(id)) score += Math.max(0, 1.25 - (player.damageScale || 1)) * 30;
    if (id === "bait" && (player.hp < player.maxHp * 0.8 || state.wave > 6)) score -= 45;
    if (id === "shackles" && (player.speed || 0) < 230) score -= 30;
    if (id === "dodge_cloak" && player.maxHp < 90) score -= 25;
    if (id === "thief_mark" && state.gold > 80) score -= 18;
    score += scoreItemForBuild(id, build, {
      situation,
      config: state.ai?.config?.buildEvaluator || {},
    });
  }

  const impact = simulatePurchaseImpact(offer, profile, inventory, state, situation);
  score += impact.immediateGain + impact.buildSynergy + impact.shortageFix + impact.fuseValue - impact.opportunityCost;
  if (situation.survival === "critical" && reason.includes("heal")) score += 16;
  if (situation.phase === "boss" && ["rapid_cord", "knife", "gloves", "fang", "split_shot"].includes(offer.itemId || offer.id)) score += 14;
  if (config.refreshAggression > 1 && score < 62) score -= 4;
  const affordability = Math.min(1, Math.max(0.35, (state.gold || 0) / Math.max(1, offer.price || 1)));
  if ((offer.price || 0) > (state.gold || 0)) score *= 0.92;
  else score *= affordability;
  return { offer, score, reason, fuseWeaponUid };
}

export function buildInventoryProfile(player, inventory, state, situation = {}) {
  const slots = inventory?.weaponSlots || [];
  const fuseMap = new Map();
  for (const slot of slots) {
    fuseMap.set(`${slot.id}:${slot.quality}`, slot);
  }
  const hpRatio = player.maxHp ? player.hp / player.maxHp : 1;
  const hasOpenWeaponSlot = slots.length < 6;
  return {
    hpRatio,
    hasOpenWeaponSlot,
    fuseMap,
    weaponCount: slots.length,
    needsSurvival: situation.survival === "critical" || hpRatio < 0.45 || (state.wave || 1) >= 8 && (player.defense || 0) < 4,
    needsDamage: situation.damage === "low" || (player.damageScale || 1) < 1.08 && (state.wave || 1) >= 6 || slots.length < 2,
    needsEconomy: situation.economy === "poor" || (state.gold || 0) < 28 && (state.wave || 1) <= 8,
    needsMobility: (player.speed || 0) < 230,
  };
}

export function simulatePurchaseImpact(offer, profile, inventory, state, situation = {}) {
  const category = offerCategory(offer);
  const price = offer.price || 0;
  const reserve = dynamicReserveGold(state, profile);
  let immediateGain = 0;
  let buildSynergy = 0;
  let shortageFix = 0;
  let fuseValue = 0;
  if (category === "weapon") {
    const fuse = profile.fuseMap.get(`${offer.weaponId}:${offer.rarity}`);
    fuseValue = fuse ? 34 + (QUALITY_RANK[offer.rarity] || 0) * 8 : 0;
    buildSynergy = offer.weaponId === state.initialWeaponId ? 10 : profile.hasOpenWeaponSlot ? 6 : -40;
  } else {
    const id = offer.itemId || offer.id;
    immediateGain = (ITEM_VALUES[id] || 35) * 0.08;
    if (profile.needsSurvival && ["heart_container", "healing_potion", "healing_aura", "tardigrade", "heavy_armor"].includes(id)) shortageFix += 18;
    if (profile.needsDamage && ["rapid_cord", "knife", "gloves", "fang", "split_shot"].includes(id)) shortageFix += 16;
    if (profile.needsEconomy && ["magnet", "lucky_clover", "thief_mark"].includes(id)) shortageFix += 12;
    if (situation.phase === "boss" && ["rapid_cord", "knife", "gloves", "fang", "split_shot"].includes(id)) buildSynergy += 10;
  }
  const opportunityCost = (state.gold || 0) - price < reserve ? 18 : price > (state.gold || 0) * 0.75 ? 8 : 0;
  return { immediateGain, buildSynergy, shortageFix, fuseValue, opportunityCost };
}

export function estimateOfferGain(offer, profile) {
  if (offer.weaponId) {
    const fuse = profile.fuseMap.get(`${offer.weaponId}:${offer.rarity}`);
    return { score: fuse ? 96 : profile.hasOpenWeaponSlot ? 52 : -120, reason: fuse ? "fuse_gain" : "weapon_gain" };
  }
  const id = offer.itemId || offer.id;
  let score = ITEM_VALUES[id] ?? 35;
  if (profile.needsSurvival && ["heart_container", "healing_potion", "healing_aura", "tardigrade", "heavy_armor"].includes(id)) score += 30;
  if (profile.needsDamage && ["rapid_cord", "knife", "gloves", "fang", "split_shot"].includes(id)) score += 24;
  if (profile.needsEconomy && ["magnet", "lucky_clover", "thief_mark"].includes(id)) score += 20;
  if (profile.needsMobility && ["speed_boots", "magnet"].includes(id)) score += 14;
  return { score, reason: id };
}

export function dynamicReserveGold(state, profile = {}) {
  return Math.min(34, 5 + (state.wave || 1) + (profile.needsSurvival ? 8 : 0));
}

export function shouldLockOffer(offer, score, expectedGold) {
  if ((offer.price || 0) <= expectedGold) return false;
  return score >= 72;
}

function expectedNextWaveGold(state) {
  return 12 + (state.wave || 1) * 2;
}

function isSoldOut(offer) {
  return (offer.purchaseCount || 0) >= (offer.maxPurchases || 1);
}

function offerCategory(offer) {
  if (offer.weaponId) return "weapon";
  return "item";
}
