import { state } from "../state.js";
import { recordCodexEntry } from "../systems/codex.js";
import { QUALITY_INFO, WEAPON_INFO } from "../config/editableGameData.js";

export const QUALITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export { QUALITY_INFO, WEAPON_INFO };

export function addWeaponToInventory(id, quality = "common") {
  const inv = state.inventory;
  if (!inv || !WEAPON_INFO[id]) return null;
  if (inv.weaponSlots.length >= 6) return null;
  const slot = { uid: inv.nextUid++, id, quality, level: 1 };
  inv.weaponSlots.push(slot);
  inv.selectedWeaponUid ||= slot.uid;
  recomputeAllWeapons();
  recordCodexEntry("weapons", id);
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
