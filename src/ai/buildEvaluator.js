const SURVIVAL_ITEMS = new Set(["heart_container", "healing_potion", "healing_aura", "tardigrade", "heavy_armor", "dodge_cloak"]);
const DAMAGE_ITEMS = new Set(["rapid_cord", "knife", "gloves", "fang", "split_shot", "airburst", "turret"]);
const ECONOMY_ITEMS = new Set(["magnet", "lucky_clover", "thief_mark"]);
const MOBILITY_ITEMS = new Set(["speed_boots", "magnet"]);

export function evaluateBuild({ player = {}, state = {}, inventory = {}, weapons = {}, situation = {} }) {
  const slots = inventory.weaponSlots || [];
  const activeWeapons = Object.values(weapons || {}).filter((weapon) => (weapon.level || 0) > 0);
  const hpRatio = player.maxHp ? clamp01((player.hp || 0) / player.maxHp) : 1;
  const speed = player.speed || 220;
  const damageScale = player.damageScale || 1;
  const attackSpeed = player.attackSpeedBonus || 0;
  const range = Math.max(0, ...activeWeapons.map((weapon) => weapon.range || weapon.attackRange || weapon.acquireRange || 0), player.attackRangeBonus || 0);
  const weaponCoverage = new Set(slots.map((slot) => slot.id)).size;
  const survivalScore = clamp01(hpRatio * 0.62 + Math.min(1, (player.maxHp || 80) / 150) * 0.2 + Math.min(1, (player.defense || 0) / 8) * 0.18);
  const mobilityScore = clamp01((speed - 160) / 140 + (player.dodge || 0) * 0.35);
  const damageScore = clamp01((damageScale - 0.75) / 0.9 + attackSpeed * 0.35 + Math.min(1, slots.length / 4) * 0.18);
  const economyScore = clamp01((player.magnet || 80) / 180 * 0.55 + Math.min(1, (state.gold || 0) / 90) * 0.25 + ((state.wave || 1) <= 5 ? 0.2 : 0.08));
  const rangeScore = clamp01(range / 760);
  const bossDpsScore = clamp01(damageScore * 0.62 + rangeScore * 0.28 + Math.min(1, weaponCoverage / 3) * 0.1);
  const projectileControlScore = clamp01(mobilityScore * 0.55 + rangeScore * 0.2 + (situation.pressure === "high" ? 0.05 : 0.2));
  const deficits = {
    survival: 1 - survivalScore,
    mobility: 1 - mobilityScore,
    damage: 1 - damageScore,
    economy: 1 - economyScore,
    range: 1 - rangeScore,
    bossDps: 1 - bossDpsScore,
    projectileControl: 1 - projectileControlScore,
  };
  return {
    hpRatio,
    weaponCoverage,
    survivalScore,
    mobilityScore,
    damageScore,
    economyScore,
    rangeScore,
    bossDpsScore,
    projectileControlScore,
    deficits,
  };
}

export function scoreItemForBuild(id, build, { situation = {}, config = {} } = {}) {
  const weight = config.survivalDeficitWeight || 1.35;
  let score = 0;
  if (SURVIVAL_ITEMS.has(id)) score += build.deficits.survival * 58 * weight;
  if (MOBILITY_ITEMS.has(id)) score += build.deficits.mobility * 42 + build.deficits.projectileControl * 18;
  if (DAMAGE_ITEMS.has(id)) score += build.deficits.damage * 52 + (situation.phase === "boss" ? build.deficits.bossDps * 38 * (config.bossDpsWeight || 1.2) : 0);
  if (ECONOMY_ITEMS.has(id)) score += build.deficits.economy * (situation.pressure === "high" ? 24 : 48);
  if (id === "bait" && build.survivalScore < 0.65) score -= 42;
  if (id === "shackles" && build.mobilityScore < 0.72) score -= 38;
  return score;
}

export function scoreUpgradeForBuild(id, build, { situation = {}, config = {} } = {}) {
  if (["vital_core", "regen_cell", "armor_plate", "evasion_ghost"].includes(id)) return build.deficits.survival * 56 * (config.survivalDeficitWeight || 1.35);
  if (["phase_stride"].includes(id)) return build.deficits.mobility * 64 + build.deficits.projectileControl * 20;
  if (["damage_matrix", "overclock", "crit_kernel"].includes(id)) return build.deficits.damage * 58 + (situation.phase === "boss" ? build.deficits.bossDps * 22 : 0);
  if (["scope_lens"].includes(id)) return build.deficits.range * 42 + (situation.phase === "boss" ? build.deficits.bossDps * 34 : 0);
  if (["magnet_field", "lucky_cache"].includes(id)) return build.deficits.economy * (situation.pressure === "high" ? 24 : 52);
  return 0;
}

export function scoreWeaponForBuild(weaponId, build, { starterWeaponId = "", canFuse = false, config = {} } = {}) {
  const coverageTarget = config.minWeaponCoverage || 2;
  let score = build.deficits.damage * 38 + build.deficits.bossDps * 22 * (config.bossDpsWeight || 1.2);
  if (build.weaponCoverage < coverageTarget) score += 18;
  if (weaponId === starterWeaponId) score += 12;
  if (canFuse) score += 42;
  return score;
}

export function shouldFuseForBuild({ inventory = {}, slot, material, config = {} }) {
  if (!slot || !material) return false;
  const slots = inventory.weaponSlots || [];
  const remainingCoverage = new Set(slots.filter((item) => item.uid !== material.uid).map((item) => item.id)).size;
  return remainingCoverage >= Math.max(1, config.minWeaponCoverage || 2);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
