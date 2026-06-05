import { AI_CONFIG } from "./aiConfig.js";
import { bossContext, bossMovementTarget } from "./bossStrategy.js";
import { solveAvoidanceVelocity } from "./orcaAvoidance.js";
import { collectThreats, pathRisk, riskAtPoint, surroundScore } from "./riskModel.js";
import { getCachedDropClusters } from "./aiTickCache.js";
import { findEscapeRoute, routePressureLevel, scoreRoute } from "./routePlanner.js";

export function planMovement({ state, world, runtime = {}, config = AI_CONFIG }) {
  const p = state.player;
  if (!p) return { velocity: { x: 0, y: 0 }, target: null, risk: 0 };
  const movement = config.movement || AI_CONFIG.movement;
  const threats = collectThreats(state, world, movement);
  const context = movementContext({ state, world, threats, movement });
  const target = chooseTarget({ state, world, threats, context, runtime, movement, config });
  const desired = desiredVelocityForTarget(p, target);
  const velocity = solveAvoidanceVelocity({
    player: p,
    desired,
    threats,
    options: {
      ...movement,
      orca: config.orca,
      lastVelocity: runtime.lastVelocity,
      breakoutAngle: context.breakoutAngle,
      budgetLevel: runtime.budgetLevel || 0,
      riskCacheGrid: config.performance?.riskCacheGrid,
    },
  });
  updateStuckState(runtime, p, velocity, context);
  runtime.currentTarget = target;
  runtime.lastVelocity = velocity;
  return { velocity, target, threats, risk: riskAtPoint(p, threats, movement), context };
}

export function movementContext({ state, world, threats, movement }) {
  const p = state.player;
  const nearEnemies = (world.enemies || []).filter((e) => !e.dead && dist(p, e) < 280);
  const surround = surroundScore(p, nearEnemies, { radius: 260, sectors: 16 });
  const projectilePressure = threats.filter((t) => t.baseKind === "projectile" || t.kind?.startsWith("projectile")).length / Math.max(1, movement.maxNeighbors || 28);
  return {
    surrounded: surround.surrounded,
    breakoutAngle: (surround.bestSector / surround.sectors) * Math.PI * 2,
    projectilePressure,
    lowHp: p.hp < p.maxHp * 0.38,
    bossActive: Boolean(world.boss),
  };
}

function chooseTarget({ state, world, threats, context, runtime, movement, config }) {
  const p = state.player;
  const gravityEscape = blackholeEscapeTarget(p, world.blackhole, runtime);
  if (gravityEscape) return gravityEscape;
  const disruptionMove = disruptionMoveTarget(p, world.hazards || [], runtime);
  if (disruptionMove) return disruptionMove;
  const laserNetEscape = stormLaserNetEscapeTarget(p, world.hazards || [], runtime);
  if (laserNetEscape) return laserNetEscape;
  const stormRailEscape = stormRailDashEscapeTarget(p, world.boss, runtime);
  if (stormRailEscape) return stormRailEscape;
  if (runtime.stuckTimer > (movement.stuckSeconds || 1.2) || context.surrounded) {
    return escapeTarget(p, threats, context, movement, config) || { kind: "breakout", x: p.x + Math.cos(context.breakoutAngle) * 260, y: p.y + Math.sin(context.breakoutAngle) * 260, priority: 100 };
  }
  if (context.lowHp || context.projectilePressure > 0.42) {
    if (world.boss && !context.lowHp) {
      const bossPressureTarget = blendedTarget({ state, world, threats, context, runtime, movement, config });
      if (bossPressureTarget) return bossPressureTarget;
    }
    return escapeTarget(p, threats, context, movement, config) || safestNearbyPoint(p, threats, movement, config);
  }
  const blended = blendedTarget({ state, world, threats, context, runtime, movement, config });
  if (blended) return blended;
  const collect = bestCollectTarget(p, world, threats, movement, state, runtime);
  if (collect) return collect;
  const nearest = nearestEnemy(p, world.enemies || []);
  if (nearest) return { kind: "farm", x: p.x - normalize(nearest.x - p.x, nearest.y - p.y).x * 180, y: p.y - normalize(nearest.x - p.x, nearest.y - p.y).y * 180, priority: 35 };
  return { kind: "idle", x: p.x, y: p.y, priority: 0 };
}

export function blendedTarget({ state, world, threats, context, runtime, movement, config = AI_CONFIG }) {
  const objectives = buildMovementObjectives({ state, world, threats, context, runtime, movement, config });
  return blendMovementObjectives(objectives, state.player);
}

export function buildMovementObjectives({ state, world, threats, context, runtime, movement, config = AI_CONFIG }) {
  const p = state.player;
  const situation = runtime.situation || (world.boss ? { phase: "boss" } : {});
  const weights = config.objectiveWeights || {};
  const objectives = [];
  const survive = escapeTarget(p, threats, context, movement, config) || safestNearbyPoint(p, threats, movement, config);
  objectives.push({ ...survive, weight: objectiveWeight("survive", situation, weights) });
  const gravityEscape = blackholeEscapeTarget(p, world.blackhole, runtime);
  if (gravityEscape) objectives.push({ ...gravityEscape, weight: objectiveWeight("survive", situation, weights) * 2.4 });
  const disruptionMove = disruptionMoveTarget(p, world.hazards || [], runtime);
  if (disruptionMove) objectives.push({ ...disruptionMove, weight: objectiveWeight("survive", situation, weights) * 1.6 });
  const laserNetEscape = stormLaserNetEscapeTarget(p, world.hazards || [], runtime);
  if (laserNetEscape) objectives.push({ ...laserNetEscape, weight: objectiveWeight("survive", situation, weights) * 3.1 });
  const stormRailEscape = stormRailDashEscapeTarget(p, world.boss, runtime);
  if (stormRailEscape) objectives.push({ ...stormRailEscape, weight: objectiveWeight("survive", situation, weights) * 2.8 });
  const collect = bestCollectTarget(p, world, threats, movement, state, runtime);
  if (collect) objectives.push({ ...collect, weight: objectiveWeight("collect", situation, weights) });
  if (world.boss) {
    const boss = bossMovementTarget(state, world, threats, bossContext(state, world), state.ai?.training, runtime.bossMemory);
    if (boss) objectives.push({ ...boss, weight: objectiveWeight("bossDamage", situation, weights) * (boss.reason === "regen_trade" ? 1.75 : 1) });
  }
  if (context.surrounded || situation.objective === "breakout") {
    objectives.push({ kind: "breakout", x: p.x + Math.cos(context.breakoutAngle) * 300, y: p.y + Math.sin(context.breakoutAngle) * 300, weight: objectiveWeight("breakout", situation, weights) });
  }
  if (situation.position === "edge" || situation.position === "corner") {
    objectives.push({ kind: "center_return", x: p.x * 0.4, y: p.y * 0.4, weight: objectiveWeight("centerReturn", situation, weights) });
  }
  return objectives.filter((item) => item && item.weight > 0);
}

export function blendMovementObjectives(objectives, player) {
  if (!objectives?.length || !player) return null;
  let x = 0;
  let y = 0;
  let total = 0;
  let top = objectives[0];
  for (const objective of objectives) {
    const weight = objective.weight || 0;
    x += (objective.x || player.x) * weight;
    y += (objective.y || player.y) * weight;
    total += weight;
    if (weight > (top.weight || 0)) top = objective;
  }
  if (total <= 0) return null;
  return { kind: top.kind, x: x / total, y: y / total, priority: top.priority || 50, components: objectives.length, blended: objectives.length > 1 };
}

function objectiveWeight(name, situation, weights) {
  let weight = weights[name] ?? 1;
  if (name === "survive" && (situation.survival === "critical" || situation.pressure === "high")) weight *= 2.2;
  if (name === "collect" && situation.phase === "boss") weight *= 0.35;
  if (name === "collect" && situation.objective === "shop_prepare") weight *= 1.5;
  if (name === "bossDamage" && situation.phase === "boss") weight *= 1.55;
  if ((name === "breakout" || name === "centerReturn") && (situation.position === "edge" || situation.position === "corner")) weight *= 1.8;
  return weight;
}

function bestCollectTarget(p, world, threats, movement, state, runtime = {}) {
  let best = null;
  let bestScore = -Infinity;
  const clusters = getCachedDropClusters(runtime.tickCache, () => clusterDrops(world.gems || [], world.coins || [], 180));
  const limit = runtime.budgetLevel >= 2 ? 18 : 42;
  for (const cluster of clusters.slice(0, limit)) {
    const d = dist(p, cluster);
    if (d < (p.magnet || 90) * 0.85) continue;
    if (d > (world.boss ? 520 : 820)) continue;
    const scored = scoreDropCluster(cluster, state, threats, movement, runtime);
    if (!scored.safe) continue;
    const score = scored.score;
    if (score > bestScore) {
      bestScore = score;
      best = { kind: "collect", x: cluster.x, y: cluster.y, dropKind: cluster.coinValue > cluster.gemValue ? "coin" : "gem", priority: score };
    }
  }
  return best;
}

function blackholeEscapeTarget(p, blackhole, runtime = {}) {
  if (!blackhole || (blackhole.life ?? 1) <= 0) return null;
  const radius = blackhole.pullRadius || blackhole.radius || blackhole.r || 220;
  const dx = p.x - (blackhole.x || 0);
  const dy = p.y - (blackhole.y || 0);
  const d = Math.hypot(dx, dy);
  if (d > radius + (p.r || 14) + 90) return null;
  const fallback = normalize(runtime.lastVelocity?.x || 1, runtime.lastVelocity?.y || 0);
  const away = d > 1 ? { x: dx / d, y: dy / d } : fallback;
  const pull = Math.max(1, blackhole.pull || 1);
  const distanceScale = d < radius * 0.55 ? 420 : 320;
  return {
    kind: "blackhole_escape",
    x: p.x + away.x * distanceScale + fallback.x * Math.min(80, pull * 0.08),
    y: p.y + away.y * distanceScale + fallback.y * Math.min(80, pull * 0.08),
    priority: 120,
  };
}

function disruptionMoveTarget(p, hazards, runtime = {}) {
  let best = null;
  let bestD = Infinity;
  for (const h of hazards || []) {
    if (h.kind !== "blizzard_core" || (h.life ?? 1) <= 0) continue;
    const radius = h.r || h.triggerRadius || 120;
    const d = dist(p, h);
    if (d > radius + (p.r || 14) + 48) continue;
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  if (!best) return null;
  const dx = p.x - (best.x || 0);
  const dy = p.y - (best.y || 0);
  const d = Math.hypot(dx, dy);
  const last = normalize(runtime.lastVelocity?.x || 0, runtime.lastVelocity?.y || 0);
  const away = d > 1 ? { x: dx / d, y: dy / d } : (Math.hypot(last.x, last.y) > 0 ? last : { x: 1, y: 0 });
  const tangent = { x: -away.y, y: away.x };
  const drift = (runtime.disruptionTurn || 1) >= 0 ? tangent : { x: -tangent.x, y: -tangent.y };
  runtime.disruptionTurn = runtime.disruptionTurn || 1;
  return {
    kind: "disruption_move",
    x: p.x + away.x * 260 + drift.x * 110,
    y: p.y + away.y * 260 + drift.y * 110,
    priority: 95,
  };
}

function stormLaserNetEscapeTarget(p, hazards, runtime = {}) {
  let escapeX = 0;
  let escapeY = 0;
  let activeLines = 0;
  let mostUrgent = 0;
  const last = runtime.lastVelocity || { x: 0, y: 0 };
  const turn = runtime.stormLaserNetTurn ||= 1;
  for (const h of hazards || []) {
    if (h.kind !== "storm_laser_net" || (h.life ?? 1) <= 0) continue;
    const angle = h.angle || 0;
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const nx = -vy;
    const ny = vx;
    const dx = (p.x || 0) - (h.x || 0);
    const dy = (p.y || 0) - (h.y || 0);
    const forward = dx * vx + dy * vy;
    const half = (h.length || 1200) / 2;
    if (forward < -half - 80 || forward > half + 80) continue;
    const side = dx * nx + dy * ny;
    const arm = Math.max(0, h.armTime || 0);
    const warningPadding = arm > 0 ? 92 : 124;
    const safe = (p.r || 14) + (h.width || 34) + warningPadding;
    const absSide = Math.abs(side);
    if (absSide > safe) continue;
    let sign = Math.sign(side);
    if (!sign) {
      const lastSide = (last.x || 0) * nx + (last.y || 0) * ny;
      sign = Math.sign(lastSide) || turn;
      runtime.stormLaserNetTurn = -turn;
    }
    const urgency = 1 + Math.max(0, (safe - absSide) / safe) * (arm > 0 ? 2.2 : 3.2) + Math.max(0, 0.55 - arm) * 1.8;
    escapeX += nx * sign * urgency;
    escapeY += ny * sign * urgency;
    activeLines++;
    mostUrgent = Math.max(mostUrgent, urgency);
  }
  if (!activeLines) return null;
  const dir = normalize(escapeX, escapeY);
  const distance = Math.min(520, 280 + activeLines * 80 + mostUrgent * 24);
  return {
    kind: "storm_laser_net_escape",
    x: p.x + dir.x * distance,
    y: p.y + dir.y * distance,
    priority: 135,
    lines: activeLines,
  };
}

function stormRailDashEscapeTarget(p, boss, runtime = {}) {
  if (!boss || boss.dead || (boss.id !== "storm_rail_devourer" && boss.behavior !== "boss_storm_rail")) return null;
  if (!stormRailDashActive(boss)) return null;
  const heading = boss.heading ?? Math.atan2(boss.moveVy || 0, boss.moveVx || 1);
  const vx = Math.cos(heading);
  const vy = Math.sin(heading);
  const dx = p.x - boss.x;
  const dy = p.y - boss.y;
  const forward = dx * vx + dy * vy;
  const side = dx * -vy + dy * vx;
  const dashReach = boss.dashState === "burst_dash" ? 980 : 720;
  const corridor = (boss.r || 44) + (p.r || 14) + (boss.dashState === "burst_dash" ? 180 : 130);
  const closeToHead = Math.hypot(dx, dy) < corridor + 140;
  if (!closeToHead && (forward < -180 || forward > dashReach || Math.abs(side) > corridor)) return null;
  const preferredSide = side >= 0 ? 1 : -1;
  const last = runtime.lastVelocity || { x: 0, y: 0 };
  const lastSide = last.x * -vy + last.y * vx;
  const escapeSide = Math.abs(side) < corridor * 0.35 && Math.abs(lastSide) > 1 ? Math.sign(lastSide) : preferredSide;
  const awayFromHead = normalize(p.x - boss.x, p.y - boss.y);
  const lateralX = -vy * escapeSide;
  const lateralY = vx * escapeSide;
  return {
    kind: "storm_rail_dash_evade",
    x: p.x + lateralX * 420 + awayFromHead.x * 160,
    y: p.y + lateralY * 420 + awayFromHead.y * 160,
    priority: 125,
  };
}

function escapeTarget(p, threats, context, movement, config = AI_CONFIG) {
  const routeConfig = config.routePlanner || {};
  if (routeConfig.enabled === false) return null;
  const route = findEscapeRoute({
    player: p,
    threats,
    context,
    movement: { ...movement, ...routeConfig },
    samples: Math.max(2, (routeConfig.samples || 8) - Math.max(0, (config.budgetLevel || 0) * 2)),
  });
  if (!route) return null;
  route.kind = context.surrounded ? "breakout" : "survive";
  return route;
}

function safestNearbyPoint(p, threats, movement, config = AI_CONFIG) {
  let best = { kind: "survive", x: p.x, y: p.y, priority: 90 };
  let bestRisk = riskAtPoint(p, threats, movement);
  const routeConfig = config.routePlanner || {};
  const candidates = routeConfig.enabled === false ? 24 : Math.min(24, routeConfig.escapeCandidates || 16);
  for (let i = 0; i < candidates; i++) {
    const a = (i / candidates) * Math.PI * 2;
    const point = { x: p.x + Math.cos(a) * 220, y: p.y + Math.sin(a) * 220, r: p.r || 14 };
    const route = routeConfig.enabled === false ? null : scoreRoute({ from: p, to: point, threats, movement: { ...movement, ...routeConfig }, samples: routeConfig.samples || 8 });
    const risk = route ? route.score : riskAtPoint(point, threats, movement);
    if (risk < bestRisk) {
      bestRisk = risk;
      best = { kind: "survive", x: point.x, y: point.y, priority: 90, route };
    }
  }
  return best;
}

export function clusterDrops(gems = [], coins = [], radius = 180) {
  const drops = [
    ...gems.map((g) => ({ x: g.x, y: g.y, value: g.value || 1, type: "gem" })),
    ...coins.map((c) => ({ x: c.x, y: c.y, value: c.value || 1, type: "coin" })),
  ];
  const clusters = [];
  const used = new Set();
  for (let i = 0; i < drops.length; i++) {
    if (used.has(i)) continue;
    const members = [drops[i]];
    used.add(i);
    for (let j = i + 1; j < drops.length; j++) {
      if (used.has(j)) continue;
      if (Math.hypot(drops[j].x - drops[i].x, drops[j].y - drops[i].y) <= radius) {
        members.push(drops[j]);
        used.add(j);
      }
    }
    const totalValue = members.reduce((sum, item) => sum + item.value, 0);
    const gemValue = members.filter((item) => item.type === "gem").reduce((sum, item) => sum + item.value, 0);
    const coinValue = members.filter((item) => item.type === "coin").reduce((sum, item) => sum + item.value, 0);
    clusters.push({
      x: members.reduce((sum, item) => sum + item.x * item.value, 0) / totalValue,
      y: members.reduce((sum, item) => sum + item.y * item.value, 0) / totalValue,
      count: members.length,
      totalValue,
      gemValue,
      coinValue,
    });
  }
  return clusters.sort((a, b) => b.totalValue - a.totalValue);
}

export function scoreDropCluster(cluster, state, threats, movement, runtime = {}) {
  const p = state.player;
  const d = dist(p, cluster);
  const xpNeed = Math.max(1, p.xpNeed || 100);
  const xpRatio = Math.min(1, (p.xp || 0) / xpNeed);
  const gemWeight = xpRatio > 0.75 ? 2.1 : 1.1;
  const coinWeight = state.gold < 35 ? 2.2 : 1.2;
  const bossPenalty = state.bossWaveActive ? 0.65 : 1;
  const greed = movement.greed || 1;
  const riskTolerance = movement.riskTolerance || 1;
  const routePlanner = state.ai?.config?.routePlanner || {};
  const route = routePlanner.enabled === false
    ? null
    : scoreRoute({
      from: { x: p.x, y: p.y, r: p.r || 14 },
      to: { x: cluster.x, y: cluster.y, r: p.r || 14 },
      threats,
      movement: { ...movement, ...routePlanner },
      samples: Math.max(2, (routePlanner.samples || 8) - Math.max(0, runtime.budgetLevel || 0)),
    });
  const routeRisk = route ? route.score : pathRisk({ x: p.x, y: p.y, r: p.r || 14 }, { x: cluster.x, y: cluster.y, r: p.r || 14 }, threats, { ...movement, samples: movement.samples || 8 });
  const value = cluster.gemValue * gemWeight + cluster.coinValue * coinWeight + cluster.count * 1.5;
  const pressure = routePressureLevel(route, routePlanner);
  const pressureLimit = pressure === "high" ? (p.magnet || 90) * 1.35 : pressure === "medium" ? 520 : Infinity;
  return {
    score: value * 160 * greed / Math.max(90, d) * bossPenalty - routeRisk * 0.55,
    safe: d <= pressureLimit && routeRisk < (routePlanner.collectRouteRisk || movement.collectRiskLimit || 32) * riskTolerance,
    routeRisk,
    route,
  };
}

function desiredVelocityForTarget(p, target) {
  if (!target) return { x: 0, y: 0 };
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) return { x: 0, y: 0 };
  return { x: dx / d * (p.speed || 200), y: dy / d * (p.speed || 200) };
}

function updateStuckState(runtime, p, velocity, context) {
  const last = runtime.lastPosition;
  if (last) {
    const moved = Math.hypot(p.x - last.x, p.y - last.y);
    const trying = Math.hypot(velocity.x, velocity.y) > 60;
    runtime.stuckTimer = trying && moved < 2 ? (runtime.stuckTimer || 0) + 0.05 : Math.max(0, (runtime.stuckTimer || 0) - 0.1);
  }
  if (runtime.stuckTimer > 1.2 && !runtime.wasStuck) {
    runtime.stuckEvents = (runtime.stuckEvents || 0) + 1;
    runtime.wasStuck = true;
  }
  if (!context.surrounded && runtime.stuckTimer < 0.2) runtime.wasStuck = false;
  runtime.lastPosition = { x: p.x, y: p.y };
}

function nearestEnemy(p, enemies) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(p, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function normalize(x, y) {
  const d = Math.max(1, Math.hypot(x, y));
  return { x: x / d, y: y / d };
}

function stormRailDashActive(boss) {
  if (boss.mode === "dash") return true;
  if (boss.mode === "portal_dash" && boss.portalState === "burst") return true;
  return boss.dashState === "high_speed" || boss.dashState === "burst_dash" || boss.dashState === "coast";
}

function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}
