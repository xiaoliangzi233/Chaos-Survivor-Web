const BOSS_RANGES = {
  ice: { min: 520, max: 760, ideal: 640 },
  missile: { min: 620, max: 900, ideal: 760 },
  prism_railgun: { min: 650, max: 980, ideal: 820 },
  void_singularity: { min: 480, max: 760, ideal: 620 },
  tesla_mine_chain: { min: 420, max: 680, ideal: 540 },
  echo_tuning_fork: { min: 300, max: 520, ideal: 410 },
  rift_loom: { min: 480, max: 760, ideal: 620 },
  arc: { min: 500, max: 760, ideal: 640 },
  boomerang: { min: 520, max: 820, ideal: 680 },
  drone: { min: 420, max: 650, ideal: 540 },
  starfall_scepter: { min: 700, max: 1040, ideal: 860 },
  phase_needler: { min: 480, max: 760, ideal: 620 },
};

export function bossContext(state, world) {
  const boss = world.boss;
  const p = state.player;
  if (!boss || !p) return { active: false };
  const distance = Math.hypot(boss.x - p.x, boss.y - p.y);
  const mode = boss.mode || boss.currentAttack || boss.dashState || "";
  const currentSkill = boss.currentSkill || "";
  const riftbladeDash = currentSkill === "flash_draw" || currentSkill === "mirror_combo" || currentSkill === "final_combo";
  const stormDash = currentSkill === "thunder_lance" || currentSkill === "echo_lance";
  const dashLike = mode.includes("dash") || (mode === "windup" && (riftbladeDash || stormDash)) || boss.dashing || boss.eliteDashTime > 0 || boss.portalState === "burst";
  const chainPressure = mode.includes("convict_sweep") || mode.includes("convict_garrote") || mode.includes("convict_triple") || mode.includes("convict_bounce") || mode.includes("convict_command") || mode.includes("convict_scene");
  const scientistPressure = mode.includes("scientist_scene")
    || mode === "scientist_cast"
    || ["entropy_bloom", "memory_excision", "void_culture", "gravity_inversion", "event_horizon", "host_displacement", "abyss_mitosis", "living_shadow", "manifestation"].includes(boss.currentSkill);
  const stormPressure = mode.includes("storm_cage")
    || mode.includes("storm_skyfall")
    || mode.includes("storm_tempest")
    || ["thunder_cage", "skyfall_decree", "tempest_throne"].includes(boss.currentSkill);
  const laserLike = mode.includes("laser") || mode.includes("rail") || mode.includes("sword_array") || mode.includes("judgment") || mode.includes("cross") || chainPressure || scientistPressure || stormPressure || boss.currentAttack === "fan";
  const recoveryLike = mode.includes("recover") || mode.includes("summon") || mode === "scientist_abyss_release" || mode === "phase_transition" || mode === "intro";
  return {
    active: true,
    boss,
    distance,
    mode,
    dashLike,
    laserLike,
    recoveryLike,
    lowHp: boss.maxHp ? boss.hp / boss.maxHp < 0.2 : false,
  };
}

export function updateBossMemory(runtime, state, world, config = {}) {
  const settings = config.bossMemory || {};
  if (settings.enabled === false || !world.boss) return null;
  const context = bossContext(state, world);
  const memory = runtime.bossMemory || { events: [], lastMode: "", repeatedModeCount: 0, dangerUntil: 0, preferredStrafeSide: 1 };
  const mode = context.mode || "idle";
  if (mode !== memory.lastMode) {
    memory.repeatedModeCount = 1;
    memory.lastMode = mode;
  } else {
    memory.repeatedModeCount += 1;
  }
  const dangerSeconds = context.dashLike ? settings.dashDangerSeconds || 0.75 : context.laserLike ? settings.laserDangerSeconds || 0.9 : 0;
  if (dangerSeconds) memory.dangerUntil = Math.max(memory.dangerUntil || 0, (state.time || 0) + dangerSeconds);
  if (context.dashLike || context.laserLike) memory.preferredStrafeSide *= -1;
  memory.events.push({ time: state.time || 0, mode, dashLike: context.dashLike, laserLike: context.laserLike });
  while (memory.events.length > (settings.eventBuffer || 12)) memory.events.shift();
  runtime.bossMemory = memory;
  return memory;
}

export function bestBossRange(state) {
  let bestId = null;
  let bestScore = -Infinity;
  for (const [id, weapon] of Object.entries(state.weapons || {})) {
    if ((weapon.level || 0) <= 0) continue;
    const score = (weapon.level || 0) * (weapon.qualityMult || 1) * (weapon.damage || weapon.bulletDamage || weapon.explodeDamage || 40);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  const range = { ...(BOSS_RANGES[bestId] || { min: 500, max: 760, ideal: 640 }) };
  const bonus = state.player?.attackRangeBonus || 0;
  range.min += bonus * 0.35;
  range.max += bonus * 0.55;
  range.ideal += bonus * 0.45;
  range.weaponId = bestId;
  return range;
}

export function bossMovementTarget(state, world, threats, context = bossContext(state, world), training = null, memory = null) {
  const boss = context.boss || world.boss;
  const p = state.player;
  if (!boss || !p) return null;
  let range = bestBossRange(state);
  const dx = boss.x - p.x;
  const dy = boss.y - p.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / d;
  const ny = dy / d;
  const side = memory?.preferredStrafeSide || sideSign(state, world, context);
  const aggression = bossAggressionScore(training, state, boss);
  const dangerActive = memory?.dangerUntil > (state.time || 0);
  const trade = regenTradeWindow(state, boss, threats, context, dangerActive);
  if (trade) range = closeCombatRange(range, boss, p);

  let radial = 0;
  if (context.dashLike || dangerActive || d < range.min) radial = -1;
  else if (d > range.max) radial = 1;
  else if (trade && d > range.ideal) radial = 0.55;
  else if (context.recoveryLike || context.lowHp) radial = aggression > 0.62 ? 0.35 : 0.1;

  const strafe = trade ? 90 : context.laserLike || context.dashLike || dangerActive ? 320 : 180;
  return {
    kind: "boss_kite",
    weaponId: range.weaponId,
    range,
    x: p.x + nx * radial * 280 + -ny * side * strafe,
    y: p.y + ny * radial * 280 + nx * side * strafe,
    priority: 88,
    reason: context.dashLike || dangerActive ? "dash_evade" : trade ? "regen_trade" : context.laserLike ? "laser_strafe" : d > range.max ? "approach" : d < range.min ? "separate" : "strafe",
    incomingDps: trade?.incomingDps,
    regenDps: trade?.regenDps,
  };
}

export function bossAggressionScore(training, state, boss) {
  let score = 0.5;
  const adjustments = training?.adjustments || {};
  score += adjustments.bossAggression || 0;
  if (boss?.maxHp && boss.hp / boss.maxHp < 0.2) score += 0.12;
  if ((state.player?.hp || 0) < (state.player?.maxHp || 1) * 0.35) score -= 0.18;
  return Math.max(0.15, Math.min(0.85, score));
}

function sideSign(state, world, context) {
  const base = state.time % 7 < 3.5 ? 1 : -1;
  const p = state.player;
  if (!p) return base;
  const half = 2400 - 260;
  if (Math.abs(p.x) > half) return p.x > 0 ? -1 : 1;
  if (Math.abs(p.y) > half) return p.y > 0 ? 1 : -1;
  return context.laserLike ? -base : base;
}

function regenTradeWindow(state, boss, threats, context, dangerActive) {
  const p = state.player;
  if (!p || context.dashLike || dangerActive) return null;
  const hpRatio = p.maxHp ? (p.hp || 0) / p.maxHp : 1;
  const regenDps = Math.max(0, p.regen || 0);
  if (hpRatio < 0.62 || regenDps < 4) return null;
  const incomingDps = estimatedIncomingBossPressure(p, boss, threats);
  if (incomingDps + 1 > regenDps * 0.85) return null;
  return { incomingDps, regenDps };
}

function closeCombatRange(range, boss, player) {
  const contactFloor = (boss.r || 40) + (player.r || 14) + 76;
  const ideal = Math.max(contactFloor + 70, range.ideal * 0.68);
  return {
    ...range,
    min: Math.max(contactFloor, range.min * 0.55),
    ideal,
    max: Math.max(ideal + 90, range.max * 0.7),
  };
}

function estimatedIncomingBossPressure(player, boss, threats = []) {
  const horizon = 1.1;
  let damage = 0;
  for (const threat of threats.slice(0, 28)) {
    const amount = threat.damage || threat.impactDamage || 0;
    if (amount <= 0) continue;
    if (threat.line) {
      if (lineThreatNearPlayer(player, threat)) damage += amount * 0.8;
      continue;
    }
    if (willThreatHitPlayer(player, threat, horizon)) damage += amount;
    else if (distance(player, threat) < (player.r || 14) + (threat.r || 10) + 120) damage += amount * 0.28;
  }
  const bossDistance = distance(player, boss);
  const contact = (boss.r || 40) + (player.r || 14) + 18;
  if (bossDistance < contact) damage += (boss.damage || 14) * 0.7;
  return damage / horizon;
}

function willThreatHitPlayer(player, threat, horizon) {
  const safe = (player.r || 14) + (threat.r || threat.width || 10) + 10;
  const dx = (threat.x || 0) - (player.x || 0);
  const dy = (threat.y || 0) - (player.y || 0);
  const vx = threat.vx || 0;
  const vy = threat.vy || 0;
  const vv = vx * vx + vy * vy;
  if (dx * dx + dy * dy <= safe * safe) return true;
  if (vv <= 1) return false;
  const t = Math.max(0, Math.min(horizon, -(dx * vx + dy * vy) / vv));
  const cx = dx + vx * t;
  const cy = dy + vy * t;
  return cx * cx + cy * cy <= safe * safe;
}

function lineThreatNearPlayer(player, threat) {
  const angle = threat.angle || 0;
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const dx = (player.x || 0) - (threat.x || 0);
  const dy = (player.y || 0) - (threat.y || 0);
  const forward = dx * vx + dy * vy;
  const half = (threat.length || 900) / 2;
  if (forward < -half || forward > half) return false;
  const side = Math.abs(dx * -vy + dy * vx);
  return side < (player.r || 14) + (threat.width || 18);
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}
