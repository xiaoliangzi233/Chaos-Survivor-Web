import { chooseTrainingLoadout as chooseLoadoutFromTraining } from "./aiState.js";
import { evaluateBuild, scoreUpgradeForBuild } from "./buildEvaluator.js";

const UPGRADE_BASE = {
  vital_core: 55,
  regen_cell: 38,
  phase_stride: 50,
  magnet_field: 42,
  damage_matrix: 52,
  overclock: 56,
  scope_lens: 40,
  crit_kernel: 34,
  armor_plate: 38,
  evasion_ghost: 34,
  lucky_cache: 32,
};

export function chooseOpeningLoadout({ training, difficulties, weapons, config }) {
  return chooseLoadoutFromTraining({ training, difficulties, weapons, config });
}

export function chooseUpgrade({ player, state, items, context = {}, training, config }) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items || []) {
    const score = scoreUpgrade({ item, player, state, context, training, config });
    if (score.score > bestScore) {
      best = { item, ...score };
      bestScore = score.score;
    }
  }
  return best;
}

export function scoreUpgrade({ item, player, state, context = {}, training, config }) {
  const id = item.id;
  const hpRatio = player.maxHp ? player.hp / player.maxHp : 1;
  const wave = state.wave || 1;
  const adjustments = training?.adjustments || {};
  const upgradeBias = adjustments.upgradeBias || {};
  const situation = context.situation || {};
  const build = evaluateBuild({ player, state, inventory: state.inventory, weapons: state.weapons, situation });
  let score = UPGRADE_BASE[id] ?? 20;
  const reasons = [];

  if (id === "vital_core") {
    score += (1 - hpRatio) * 110 + (context.recentDamage || 0) * 1.3 + (adjustments.survivalBias || 0) * 60;
    score += (upgradeBias.survival || 0) * 45;
    reasons.push("hp");
  } else if (id === "regen_cell") {
    score += wave * 1.8 + (1 - hpRatio) * 28 - (player.regen || 0) * 8;
    score += (upgradeBias.survival || 0) * 28;
    reasons.push("sustain");
  } else if (id === "phase_stride") {
    score += (context.projectilePressure || 0) * 75 + (context.surrounded ? 35 : 0) + (adjustments.mobilityBias || 0) * 70;
    score += (upgradeBias.mobility || 0) * 50;
    reasons.push("mobility");
  } else if (id === "magnet_field") {
    score += Math.max(0, 6 - wave) * 4 + (state.gold < 30 ? 18 : 0) + (adjustments.greed || 0) * 60;
    score += (upgradeBias.economy || 0) * 42;
    reasons.push("growth");
  } else if (id === "damage_matrix") {
    score += (context.lowDamage ? 32 : 0) + wave * 1.3;
    score += (upgradeBias.damage || 0) * 52;
    reasons.push("damage");
  } else if (id === "overclock") {
    score += 18 - (player.attackSpeedBonus || 0) * 40;
    score += (upgradeBias.damage || 0) * 36;
    reasons.push("attack_speed");
  } else if (id === "scope_lens") {
    score += (context.bossActive ? 25 : 0) + (context.shortRange ? 20 : 0);
    score += (upgradeBias.damage || 0) * 28;
    reasons.push("range");
  } else if (id === "crit_kernel") {
    score += Math.max(0, wave - 4) * 2.4 - (player.critChance || 0) * 35;
    reasons.push("crit");
  } else if (id === "armor_plate") {
    score += (context.recentDamage || 0) * 0.8 + (adjustments.survivalBias || 0) * 50;
    reasons.push("armor");
  } else if (id === "evasion_ghost") {
    score += (context.projectilePressure || 0) * 45 - (hpRatio < 0.55 ? 12 : 0);
    reasons.push("dodge");
  } else if (id === "lucky_cache") {
    score += Math.max(0, 7 - wave) * 3;
    reasons.push("shop");
  }

  if (situation.survival === "critical" && ["vital_core", "regen_cell", "armor_plate", "phase_stride", "evasion_ghost"].includes(id)) score += 36;
  if (situation.damage === "low" && ["damage_matrix", "overclock", "scope_lens", "crit_kernel"].includes(id)) score += 24;
  if (situation.economy === "poor" && ["magnet_field", "lucky_cache"].includes(id)) score += 20;
  if (situation.phase === "boss" && ["damage_matrix", "overclock", "scope_lens", "crit_kernel"].includes(id)) score += 18;
  score += scoreUpgradeForBuild(id, build, { situation, config: config?.buildEvaluator || {} });
  score *= upgradeCategoryMultiplier(id, config?.upgrade);
  return { score, reason: reasons.join(",") || "baseline" };
}

function upgradeCategoryMultiplier(id, upgrade = {}) {
  if (["vital_core", "regen_cell", "armor_plate"].includes(id)) return upgrade.survivalMultiplier || 1;
  if (["phase_stride", "evasion_ghost"].includes(id)) return upgrade.mobilityMultiplier || 1;
  if (["damage_matrix", "overclock", "scope_lens", "crit_kernel"].includes(id)) return upgrade.damageMultiplier || 1;
  if (["magnet_field", "lucky_cache"].includes(id)) return upgrade.economyMultiplier || 1;
  return 1;
}

export function shouldRefreshUpgradeChoices({ bestScore, gold, refreshCost, refreshesUsed, reserveGold = 12, situation = {}, training, items = [], config = {} }) {
  if (refreshesUsed > 0) return false;
  if (gold < refreshCost + reserveGold) return false;
  const coverage = upgradePanelCoverage(items);
  if (situation.survival === "critical" && coverage.survival) return false;
  const recentLowDamage = (training?.recentRuns || []).slice(-4).filter((run) => run.deathReason?.includes("damage")).length >= 2;
  if (recentLowDamage && !coverage.damage) return true;
  const threshold = situation.phase === "boss" ? 44 : situation.economy === "poor" ? 32 : 35;
  return bestScore < threshold * (config.upgrade?.refreshThresholdMultiplier || 1);
}

export function upgradePanelCoverage(items = []) {
  const ids = new Set(items.map((item) => item.id));
  return {
    survival: ["vital_core", "regen_cell", "armor_plate", "evasion_ghost"].some((id) => ids.has(id)),
    mobility: ["phase_stride", "evasion_ghost"].some((id) => ids.has(id)),
    damage: ["damage_matrix", "overclock", "scope_lens", "crit_kernel"].some((id) => ids.has(id)),
    economy: ["magnet_field", "lucky_cache"].some((id) => ids.has(id)),
  };
}
