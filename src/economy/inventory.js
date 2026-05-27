import { state } from "../state.js";

export const QUALITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const QUALITY_INFO = {
  common: { name: "普通", color: "#cbd5e1", mult: 1 },
  uncommon: { name: "优秀", color: "#77ff8a", mult: 1.18 },
  rare: { name: "精良", color: "#42e8ff", mult: 1.42 },
  epic: { name: "史诗", color: "#b48cff", mult: 1.74 },
  legendary: { name: "传说", color: "#ffd166", mult: 2.15 },
};

export const WEAPON_INFO = {
  arc: {
    icon: "⚡",
    name: "棱镜电弧",
    desc: "自动锁定最近的敌人，闪电会在附近目标之间连续传导。",
    tags: ["自动锁定", "连锁传导", "瞬时命中"],
  },
  ice: {
    icon: "❄",
    name: "霜晶追踪",
    desc: "追踪冰刀会持续转向追猎，命中后短暂冻结未死亡目标。",
    tags: ["追踪", "冻结控制", "单体压制"],
  },
  missile: {
    icon: "◆",
    name: "核心飞弹",
    desc: "追踪飞弹命中后产生范围爆炸，适合清理密集怪群。",
    tags: ["追踪", "范围爆炸", "群体清理"],
  },
  boomerang: {
    icon: "✦",
    name: "霓虹回旋刃",
    desc: "远距离飞出后高速回收，往返切割同一路径上的敌人。",
    tags: ["远距离", "往返切割", "高穿透"],
  },
  drone: {
    icon: "▣",
    name: "星环无人机",
    desc: "无人机会离身攻击，电量不足时返回玩家身边充电。",
    tags: ["自动炮台", "电量循环", "持续输出"],
  },
  pulse: {
    icon: "●",
    name: "脉冲新星",
    desc: "周期性范围爆发，击退周围敌人。",
    tags: ["范围爆发", "击退"],
  },
};

export function addWeaponToInventory(id, quality = "common") {
  const inv = state.inventory;
  if (!inv || !WEAPON_INFO[id]) return null;
  if (inv.weaponSlots.length >= 6) return null;
  const slot = { uid: inv.nextUid++, id, quality, level: 1 };
  inv.weaponSlots.push(slot);
  inv.selectedWeaponUid ||= slot.uid;
  recomputeAllWeapons();
  return slot;
}

export function fuseWeaponSlots(aUid, bUid) {
  const a = findWeaponSlot(aUid);
  const b = findWeaponSlot(bUid);
  const check = canFuseWeapons(a, b);
  if (!check.ok) return false;

  a.quality = check.nextQuality;
  a.level = Math.max(a.level, b.level);
  const idx = state.inventory.weaponSlots.indexOf(b);
  if (idx >= 0) state.inventory.weaponSlots.splice(idx, 1);
  state.inventory.selectedWeaponUid = a.uid;
  recomputeAllWeapons();
  return true;
}

export function nextQualityOf(quality) {
  const idx = QUALITY_ORDER.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[idx + 1];
}

export function canFuseWeapons(a, b) {
  if (!a || !b) return { ok: false, reason: "请选择两把武器" };
  if (a.uid === b.uid) return { ok: false, reason: "请选择两把不同武器" };
  if (a.id !== b.id) return { ok: false, reason: "只能合成同一种武器" };
  if (a.quality !== b.quality) return { ok: false, reason: "只能合成同品质武器" };
  const nextQuality = nextQualityOf(a.quality);
  if (!nextQuality) return { ok: false, reason: "传说品质无法继续合成" };
  return { ok: true, nextQuality };
}

export function selectWeaponSlot(uid) {
  if (findWeaponSlot(uid)) state.inventory.selectedWeaponUid = uid;
}

export function selectedWeaponSlot() {
  const inv = state.inventory;
  return inv ? findWeaponSlot(inv.selectedWeaponUid) || inv.weaponSlots[0] || null : null;
}

export function findFuseCandidate(slot) {
  if (!slot || slot.quality === "legendary") return null;
  return state.inventory.weaponSlots.find((other) => canFuseWeapons(slot, other).ok) || null;
}

export function recomputeAllWeapons() {
  if (!state.weapons || !state.inventory) return;
  for (const weapon of Object.values(state.weapons)) {
    weapon.level = 0;
    weapon.quality = "common";
    weapon.qualityMult = 1;
    weapon.slotCount = 0;
    weapon.slotQualities = [];
    weapon.projectileBonus = 0;
    weapon.splitDamagePenalty = 0;
    if ("count" in weapon) weapon.count = 0;
  }
  for (const slot of state.inventory.weaponSlots) applyWeaponSlot(slot);
}

export function applyWeaponSlot(slot) {
  const weapon = state.weapons?.[slot.id];
  if (!weapon) return;
  const qualityLevel = QUALITY_ORDER.indexOf(slot.quality);
  const currentQualityLevel = QUALITY_ORDER.indexOf(weapon.quality || "common");
  weapon.slotCount = (weapon.slotCount || 0) + 1;
  weapon.slotQualities ||= [];
  weapon.slotQualities.push(slot.quality);
  weapon.projectileBonus = (weapon.projectileBonus || 0) + (slot.projectileBonus || 0);
  weapon.splitDamagePenalty = Math.max(weapon.splitDamagePenalty || 0, slot.splitDamagePenalty || 0);
  weapon.level += Math.max(1, slot.level + qualityLevel);
  if (qualityLevel >= currentQualityLevel) weapon.quality = slot.quality;
  weapon.qualityMult = Math.max(weapon.qualityMult || 1, QUALITY_INFO[slot.quality].mult);
  if (slot.id === "drone") weapon.count = weapon.slotCount;
  else if ("count" in weapon) weapon.count = Math.max(1, weapon.slotCount);
}

function findWeaponSlot(uid) {
  return state.inventory?.weaponSlots.find((slot) => slot.uid === uid) || null;
}
