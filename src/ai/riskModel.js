import { WORLD_SIZE } from "../constants.js";

const DEFAULT_LOOK_AHEAD = 0.85;
const SAMPLE_TIMES = [0, 0.2, 0.45, 0.85];

export function collectThreats(state, world, options = {}) {
  const p = state.player;
  if (!p) return [];
  const queryRadius = options.queryRadius || 620;
  const threats = [];
  for (const b of world.enemyProjectiles || []) {
    if ((b.life ?? 1) <= 0) continue;
    if (distanceSq(p, b) > (queryRadius + (b.r || 0)) ** 2) continue;
    threats.push(normalizeThreat("projectile", b, 1.15));
  }
  for (const h of world.hazards || []) {
    if ((h.life ?? 1) <= 0) continue;
    if (distanceSq(p, h) > (queryRadius + (h.r || 0) + 120) ** 2) continue;
    threats.push(normalizeThreat("hazard", h, hazardWeight(h)));
  }
  if (world.blackhole && (world.blackhole.life ?? 1) > 0) {
    const radius = blackholeRadius(world.blackhole);
    if (distanceSq(p, world.blackhole) <= (queryRadius + radius) ** 2) {
      threats.push(normalizeThreat("blackhole", world.blackhole, 2.4));
    }
  }
  for (const e of world.enemies || []) {
    if (e.dead) continue;
    if (distanceSq(p, e) > (queryRadius + (e.r || 0)) ** 2) continue;
    threats.push(normalizeThreat("enemy", e, enemyWeight(e)));
  }
  if (world.boss && !world.boss.dead && !threats.some((t) => t.source === world.boss)) {
    threats.push(normalizeThreat("boss", world.boss, 1.3));
  }
  if (world.boss && !world.boss.dead) addBossSegmentThreats(threats, p, world.boss, queryRadius);
  return threats;
}

export function normalizeThreat(kind, source, weight = 1) {
  const fallbackVx = Number.isFinite(source.currentSpeed) && Number.isFinite(source.heading) ? Math.cos(source.heading) * source.currentSpeed : 0;
  const fallbackVy = Number.isFinite(source.currentSpeed) && Number.isFinite(source.heading) ? Math.sin(source.heading) * source.currentSpeed : 0;
  const vx = source.vx ?? source.eliteDashVx ?? source.dashVx ?? source.moveVx ?? source.knockbackX ?? fallbackVx;
  const vy = source.vy ?? source.eliteDashVy ?? source.dashVy ?? source.moveVy ?? source.knockbackY ?? fallbackVy;
  const type = classifyThreat(source, kind);
  return {
    kind: type,
    baseKind: kind,
    source,
    x: source.x || 0,
    y: source.y || 0,
    vx,
    vy,
    r: kind === "blackhole" ? blackholeRadius(source) : source.triggerRadius || source.r || 8,
    damage: source.damage || 1,
    life: source.life ?? source.modeTimer ?? 1,
    weight,
    armTime: source.armTime || 0,
    line: source.kind === "storm_laser_net",
    angle: source.angle || 0,
    length: source.length || 0,
    width: source.width || 0,
  };
}

export function classifyThreat(source, kind) {
  if (kind === "blackhole") return "gravity_well";
  if (kind === "projectile") {
    const speed = Math.hypot(source.vx || 0, source.vy || 0);
    if (source.orbiting || source.orbitCenter || source.kind === "orbit") return "projectile_orbit";
    if (source.returning || source.boomerang || source.kind === "boomerang") return "projectile_boomerang";
    if (speed >= 560) return "projectile_fast";
    if ((source.life || 0) > 2.4 || (source.r || 0) >= 12 || source.landTrapOnExpire) return "projectile_slow_field";
    return "projectile";
  }
  if (kind === "hazard") {
    if (source.kind === "blizzard_core") return "hazard_zone_soft";
    if (source.kind === "storm_laser_net") return (source.armTime || 0) > 0 ? "warning_line" : "hazard_zone_hard";
    if (source.kind === "toxic_residue" || source.kind === "frost_zone") return "hazard_armed";
    if ((source.armTime || 0) > 0.35) {
      if (source.length || source.warningType === "line") return "warning_line";
      if (source.warningType === "circle") return "warning_circle";
      return "hazard_windup";
    }
    return source.damage ? "hazard_armed" : "hazard_zone_soft";
  }
  if (kind === "enemy") {
    const speed = Math.hypot(source.eliteDashVx || source.vx || 0, source.eliteDashVy || source.vy || 0);
    if (speed > 260 || source.mode === "dash" || source.dashing || source.eliteDashTime > 0 || source.dashState) return "enemy_dash";
    return "enemy_contact";
  }
  if (kind === "boss") return isBossDashLike(source) ? "boss_dash" : "boss_body";
  if (kind === "boss_segment") return isBossDashLike(source) ? "boss_segment_dash" : "boss_body_chain";
  return kind;
}

export function riskSamplesForThreat(threat, lookAhead = DEFAULT_LOOK_AHEAD) {
  if (threat.kind === "projectile_fast" || threat.kind === "enemy_dash" || threat.kind === "boss_dash" || threat.kind === "boss_segment_dash") return [0, 0.1, 0.2, 0.34, 0.52].filter((t) => t <= lookAhead);
  if (threat.kind === "projectile_slow_field" || threat.kind === "projectile_orbit" || threat.kind === "projectile_boomerang" || threat.kind === "hazard_zone_hard" || threat.kind === "hazard_zone_soft" || threat.kind === "gravity_well") return [0, 0.25, 0.55, 0.85].filter((t) => t <= lookAhead);
  return SAMPLE_TIMES.filter((t) => t <= lookAhead);
}

export function predictThreatPosition(threat, t) {
  return {
    x: threat.x + (threat.vx || 0) * t,
    y: threat.y + (threat.vy || 0) * t,
  };
}

export function riskAtPoint(point, threats, options = {}) {
  const lookAhead = options.lookAhead || DEFAULT_LOOK_AHEAD;
  let risk = boundaryRisk(point, options);
  for (const threat of threats || []) {
    if (threat.kind === "gravity_well") {
      risk += gravityRisk(point, threat);
      continue;
    }
    if (threat.kind === "hazard_armed" || threat.kind === "hazard_windup" || threat.kind === "hazard_disruption" || threat.kind === "hazard_zone_hard" || threat.kind === "hazard_zone_soft" || threat.kind === "warning_line" || threat.kind === "warning_circle") {
      risk += hazardRisk(point, threat);
      continue;
    }
    const samples = riskSamplesForThreat(threat, lookAhead).filter((t) => t <= (threat.life ?? lookAhead));
    for (const t of samples.length ? samples : [0]) {
      const pos = predictThreatPosition(threat, t);
      const dx = point.x - pos.x;
      const dy = point.y - pos.y;
      const safeRadius = (point.r || 14) + (threat.r || 0) + threatPadding(threat);
      const d = Math.max(1, Math.hypot(dx, dy));
      const severity = (threat.damage || 1) * (threat.weight || 1);
      if (d < safeRadius) risk += severity * (1 + (safeRadius - d) / safeRadius) * 8;
      else risk += severity * Math.max(0, 1 - (d - safeRadius) / 180) * 0.7;
    }
  }
  return risk;
}

export function riskBreakdownAtPoint(point, threats, options = {}) {
  const breakdown = {
    lethalRisk: boundaryRisk(point, options),
    controlRisk: 0,
    positionRisk: boundaryRisk(point, options),
    objectiveRisk: 0,
    total: 0,
  };
  for (const threat of threats || []) {
    const single = riskAtPoint(point, [threat], options);
    if (threat.kind === "gravity_well" || threat.kind === "hazard_zone_soft" || threat.kind === "hazard_disruption") breakdown.controlRisk += single;
    else if (threat.kind === "warning_line" || threat.kind === "warning_circle") breakdown.objectiveRisk += single;
    else breakdown.lethalRisk += single;
  }
  breakdown.total = breakdown.lethalRisk + breakdown.controlRisk + breakdown.positionRisk + breakdown.objectiveRisk;
  return breakdown;
}

export function isPointSafe(point, threats, options = {}) {
  return riskAtPoint(point, threats, options) <= (options.safeRisk ?? 24);
}

export function pathRisk(from, to, threats, options = {}) {
  const samples = options.samples || 8;
  let total = 0;
  let maxRisk = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      r: from.r || to.r || 14,
    };
    const risk = riskAtPoint(point, threats, options);
    total += risk;
    maxRisk = Math.max(maxRisk, risk);
  }
  return maxRisk * 0.72 + total / (samples + 1) * 0.28;
}

export function createRiskCache(threats) {
  return { threats, points: new Map() };
}

export function cachedRiskAtPoint(cache, point, options = {}) {
  const key = `${Math.round(point.x / 8)},${Math.round(point.y / 8)},${Math.round(point.r || 14)}`;
  if (cache.points.has(key)) return cache.points.get(key);
  const risk = riskAtPoint(point, cache.threats, options);
  cache.points.set(key, risk);
  return risk;
}

export function boundaryRisk(point, options = {}) {
  const half = WORLD_SIZE / 2 - 60;
  const padding = options.boundaryPadding || 180;
  const dx = half - Math.abs(point.x || 0);
  const dy = half - Math.abs(point.y || 0);
  let risk = 0;
  if (dx < padding) risk += (padding - dx) * 0.08;
  if (dy < padding) risk += (padding - dy) * 0.08;
  if (dx < padding && dy < padding) risk *= 2;
  if (dx < 0 || dy < 0) risk += 1000;
  return risk;
}

export function surroundScore(player, enemies, options = {}) {
  const radius = options.radius || 260;
  const sectors = options.sectors || 16;
  const occupied = new Set();
  const density = Array.from({ length: sectors }, () => 0);
  for (const e of enemies || []) {
    if (e.dead) continue;
    const dx = (e.x || 0) - player.x;
    const dy = (e.y || 0) - player.y;
    const d = Math.hypot(dx, dy);
    if (d > radius + (e.r || 0)) continue;
    const index = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * sectors) % sectors;
    occupied.add(index);
    density[index] += Math.max(1, radius - d);
  }
  let bestSector = 0;
  let bestDensity = Infinity;
  for (let i = 0; i < density.length; i++) {
    if (density[i] < bestDensity) {
      bestDensity = density[i];
      bestSector = i;
    }
  }
  return { occupied: occupied.size, sectors, surrounded: occupied.size >= Math.ceil(sectors * 0.62), bestSector, density };
}

function hazardRisk(point, threat) {
  if (threat.armTime > 0.45 && threat.kind !== "warning_line" && threat.kind !== "warning_circle") return 0;
  if (threat.line) return lineRisk(point, threat);
  const dx = point.x - threat.x;
  const dy = point.y - threat.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const safeRadius = (point.r || 14) + threat.r + 24;
  if (threat.kind === "warning_line") return lineRisk(point, threat) * windupScale(threat);
  if (threat.kind === "warning_circle") {
    const scale = windupScale(threat);
    if (d < safeRadius) return (threat.weight || 1) * scale * (1 + (safeRadius - d) / safeRadius) * 8;
    return (threat.weight || 1) * scale * Math.max(0, 1 - (d - safeRadius) / 160);
  }
  if (threat.kind === "hazard_disruption" || threat.kind === "hazard_zone_soft") {
    const disruptionRadius = (point.r || 14) + threat.r + 36;
    if (d < disruptionRadius) return (threat.weight || 1) * (1 + (disruptionRadius - d) / disruptionRadius) * 14;
    return (threat.weight || 1) * Math.max(0, 1 - (d - disruptionRadius) / 110) * 2;
  }
  const severity = (threat.damage || 1) * (threat.weight || 1);
  if (d < safeRadius) return severity * (1 + (safeRadius - d) / safeRadius) * 9;
  return severity * Math.max(0, 1 - (d - safeRadius) / 150);
}

function gravityRisk(point, threat) {
  const dx = point.x - threat.x;
  const dy = point.y - threat.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const pullRadius = (threat.r || 220) + (point.r || 14);
  const coreRadius = Math.max(36, pullRadius * 0.32);
  const severity = Math.max(4, threat.damage || 1) * (threat.weight || 1);
  if (d < coreRadius) return severity * (2.2 + (coreRadius - d) / coreRadius) * 12;
  if (d < pullRadius) return severity * (1 + (pullRadius - d) / pullRadius) * 5.5;
  return severity * Math.max(0, 1 - (d - pullRadius) / 180) * 0.8;
}

function lineRisk(point, threat) {
  const vx = Math.cos(threat.angle);
  const vy = Math.sin(threat.angle);
  const dx = point.x - threat.x;
  const dy = point.y - threat.y;
  const forward = dx * vx + dy * vy;
  const half = (threat.length || 1200) / 2;
  if (forward < -half || forward > half) return 0;
  const side = Math.abs(dx * -vy + dy * vx);
  const safe = (point.r || 14) + (threat.width || 18) + 14;
  return side < safe ? (threat.damage || 1) * 12 : 0;
}

function threatPadding(threat) {
  if (threat.kind === "projectile_fast") return 34;
  if (threat.kind === "projectile_slow_field") return 42;
  if (threat.kind === "projectile_orbit" || threat.kind === "projectile_boomerang") return 46;
  if (threat.kind === "projectile") return 22;
  if (threat.kind === "enemy_dash") return 64;
  if (threat.kind === "boss_dash") return 150;
  if (threat.kind === "boss_segment_dash") return 86;
  if (threat.kind === "boss_body_chain") return 58;
  if (threat.kind === "boss_body") return 90;
  if (threat.kind === "gravity_well") return 96;
  return 38;
}

function windupScale(threat) {
  if (!threat.armTime) return 1;
  return Math.max(0.15, Math.min(1, 1 - threat.armTime / 1.2));
}

function hazardWeight(h) {
  if (h.kind === "toxic_residue" || h.kind === "frost_zone") return 1.35;
  if (h.kind === "storm_laser_net") return 1.8;
  if (h.kind === "blizzard_core") return 0.9;
  return 1.15;
}

function blackholeRadius(h) {
  return h.pullRadius || h.radius || h.r || 220;
}

function addBossSegmentThreats(threats, player, boss, queryRadius) {
  if (boss.id !== "storm_rail_devourer" && boss.behavior !== "boss_storm_rail") return;
  if (!boss.bodyDamageEnabled || !Array.isArray(boss.segments)) return;
  const fast = isBossDashLike(boss);
  const stride = fast ? 2 : 3;
  let added = 0;
  for (let i = 0; i < boss.segments.length && added < 28; i += stride) {
    const seg = boss.segments[i];
    if (!seg) continue;
    const r = typeof boss.segmentRadius === "function" ? boss.segmentRadius(seg) : (boss.r || 44) * (seg.node ? 0.74 : 0.58);
    if (distanceSq(player, seg) > (queryRadius + r + 60) ** 2) continue;
    threats.push(normalizeThreat("boss_segment", {
      x: seg.x,
      y: seg.y,
      r,
      damage: boss.damage * (fast ? 0.82 : 0.62),
      life: boss.modeTimer ?? 1,
      vx: boss.moveVx || Math.cos(boss.heading || 0) * (boss.currentSpeed || 0),
      vy: boss.moveVy || Math.sin(boss.heading || 0) * (boss.currentSpeed || 0),
      mode: boss.mode,
      dashState: boss.dashState,
      portalState: boss.portalState,
    }, fast ? 2.05 : 1.2));
    added++;
  }
}

function isBossDashLike(source) {
  if (source.mode === "dash") return true;
  if (source.mode === "portal_dash" && source.portalState === "burst") return true;
  return source.dashState === "high_speed" || source.dashState === "burst_dash" || source.dashState === "coast";
}

function enemyWeight(e) {
  const fast = Math.hypot(e.eliteDashVx || e.vx || 0, e.eliteDashVy || e.vy || 0) > 260 || e.mode === "dash" || e.dashing || e.eliteDashTime > 0;
  return e.boss ? 1.55 : fast ? 1.65 : 0.85;
}

function distanceSq(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return dx * dx + dy * dy;
}
