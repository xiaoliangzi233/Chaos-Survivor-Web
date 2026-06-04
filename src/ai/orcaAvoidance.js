import { riskAtPoint } from "./riskModel.js";

export function solveAvoidanceVelocity({ player, desired, threats, options = {} }) {
  const maxSpeed = player.speed || 200;
  const desiredVelocity = limitVector(desired || { x: 0, y: 0 }, maxSpeed);
  const neighbors = selectNeighbors(player, threats || [], options.maxNeighbors || 28);
  if (!neighbors.length) return desiredVelocity;

  const baseRisk = riskAtPoint(player, neighbors, options);
  const count = adaptiveCandidateCount(neighbors, baseRisk, options.orca || options, options.budgetLevel || 0);
  const candidates = candidateVelocities(desiredVelocity, maxSpeed, count, options);
  const cache = { risks: new Map(), constraints: new Map() };
  const orca = options.orca || options;
  const desiredLen = Math.hypot(desiredVelocity.x, desiredVelocity.y);
  let best = desiredVelocity;
  let bestCost = Infinity;
  for (const velocity of candidates) {
    const future = {
      x: player.x + velocity.x * (options.lookAhead || 0.85),
      y: player.y + velocity.y * (options.lookAhead || 0.85),
      r: player.r || 14,
    };
    const risk = cachedRisk(cache, future, neighbors, options);
    const constraint = cachedConstraint(cache, player, velocity, neighbors, options);
    const desire = Math.hypot(velocity.x - desiredVelocity.x, velocity.y - desiredVelocity.y) * 0.035;
    const last = options.lastVelocity || null;
    const lastBias = last ? Math.hypot(velocity.x - last.x, velocity.y - last.y) * 0.009 : 0;
    const breakoutBias = breakoutCost(velocity, options.breakoutAngle);
    const stopPenalty = Math.hypot(velocity.x, velocity.y) < maxSpeed * 0.15 ? 4 : 0;
    const cost = risk + constraint + desire + lastBias + breakoutBias + stopPenalty;
    if (cost < bestCost) {
      best = velocity;
      bestCost = cost;
    }
    if (risk < (orca.earlyExitRisk ?? 10) && constraint < (orca.earlyExitConstraint ?? 4) && directionDot(velocity, desiredVelocity, desiredLen) >= (orca.earlyExitDot ?? 0.82)) {
      best = velocity;
      break;
    }
  }
  return best;
}

export function adaptiveCandidateCount(threats, risk, orca = {}, budgetLevel = 0) {
  let count = orca.lowRiskCandidates || 16;
  if ((threats?.length || 0) > 10 || risk > 55) count = orca.highRiskCandidates || 40;
  else if ((threats?.length || 0) > 4 || risk > 22) count = orca.midRiskCandidates || 24;
  if (budgetLevel >= 3) return Math.max(8, Math.floor(count * 0.35));
  if (budgetLevel >= 2) return Math.max(10, Math.floor(count * 0.5));
  if (budgetLevel >= 1) return Math.max(12, Math.floor(count * 0.75));
  return count;
}

export function buildVelocityConstraints(player, threats, options = {}) {
  return selectNeighbors(player, threats || [], options.maxNeighbors || 28).map((threat) => {
    const relX = threat.x - player.x;
    const relY = threat.y - player.y;
    const d = Math.max(1, Math.hypot(relX, relY));
    return {
      point: { x: threat.vx || 0, y: threat.vy || 0 },
      normal: { x: -relX / d, y: -relY / d },
      weight: threat.weight || 1,
      ttl: threat.life ?? 1,
      sourceKind: threat.kind,
    };
  });
}

function velocityConstraintCost(player, velocity, threats, options) {
  let cost = 0;
  const horizon = options.lookAhead || 0.85;
  for (const threat of threats) {
    const relX = threat.x - player.x;
    const relY = threat.y - player.y;
    const relVx = (threat.vx || 0) - velocity.x;
    const relVy = (threat.vy || 0) - velocity.y;
    const relSpeedSq = relVx * relVx + relVy * relVy;
    if (relSpeedSq < 0.001) continue;
    const t = clamp(-((relX * relVx + relY * relVy) / relSpeedSq), 0, Math.min(horizon, threat.life ?? horizon));
    const cx = relX + relVx * t;
    const cy = relY + relVy * t;
    const safe = (player.r || 14) + (threat.r || 8) + (threat.kind === "projectile" ? 24 : 42);
    const d = Math.hypot(cx, cy);
    if (d < safe) cost += (safe - d) / safe * (threat.damage || 1) * (threat.weight || 1) * 12;
  }
  return cost;
}

function selectNeighbors(player, threats, maxNeighbors) {
  const special = [];
  const rest = [];
  for (const threat of threats || []) {
    if (isSpecialThreat(threat) && special.length < Math.ceil(maxNeighbors * 0.45)) special.push(threat);
    else rest.push(threat);
  }
  const scored = rest
    .map((threat) => {
      const dx = threat.x - player.x;
      const dy = threat.y - player.y;
      const dist = Math.hypot(dx, dy);
      const movingAway = (threat.vx || 0) * dx + (threat.vy || 0) * dy > 0;
      const score = (threat.damage || 1) * (threat.weight || 1) / Math.max(60, dist) * (movingAway ? 0.45 : 1);
      return { threat, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, maxNeighbors - special.length))
    .map((entry) => entry.threat);
  return [...special, ...scored];
}

function candidateVelocities(desired, maxSpeed, directions, options = {}) {
  const candidates = [desired, { x: 0, y: 0 }];
  const baseAngle = Math.atan2(desired.y, desired.x);
  const hasDesired = Math.hypot(desired.x, desired.y) > 1;
  const speeds = [maxSpeed, maxSpeed * 0.72, maxSpeed * 0.42];
  if (options.lastVelocity && Math.hypot(options.lastVelocity.x || 0, options.lastVelocity.y || 0) > 10) candidates.push(limitVector(options.lastVelocity, maxSpeed));
  if (Number.isFinite(options.breakoutAngle)) candidates.push({ x: Math.cos(options.breakoutAngle) * maxSpeed, y: Math.sin(options.breakoutAngle) * maxSpeed });
  for (const speed of speeds) {
    for (let i = 0; i < directions; i++) {
      const offset = (i / directions) * Math.PI * 2;
      const a = hasDesired ? baseAngle + offset : offset;
      candidates.push({ x: Math.cos(a) * speed, y: Math.sin(a) * speed });
    }
  }
  if (hasDesired) candidates.push({ x: -desired.x * 0.85, y: -desired.y * 0.85 });
  return candidates;
}

function breakoutCost(velocity, angle) {
  if (!Number.isFinite(angle)) return 0;
  const len = Math.hypot(velocity.x, velocity.y);
  if (len < 1) return 8;
  const vx = velocity.x / len;
  const vy = velocity.y / len;
  const dot = vx * Math.cos(angle) + vy * Math.sin(angle);
  return (1 - dot) * 7;
}

function limitVector(v, max) {
  const len = Math.hypot(v.x || 0, v.y || 0);
  if (len <= max || len < 0.001) return { x: v.x || 0, y: v.y || 0 };
  return { x: v.x / len * max, y: v.y / len * max };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cachedRisk(cache, point, threats, options) {
  const grid = options.riskCacheGrid || options.performance?.riskCacheGrid || 32;
  const key = `${Math.round(point.x / grid)},${Math.round(point.y / grid)},${Math.round(point.r || 14)}`;
  if (cache.risks.has(key)) return cache.risks.get(key);
  const value = riskAtPoint(point, threats, options);
  cache.risks.set(key, value);
  return value;
}

function cachedConstraint(cache, player, velocity, threats, options) {
  const key = `${Math.round(velocity.x / 16)},${Math.round(velocity.y / 16)}`;
  if (cache.constraints.has(key)) return cache.constraints.get(key);
  const value = velocityConstraintCost(player, velocity, threats, options);
  cache.constraints.set(key, value);
  return value;
}

function directionDot(velocity, desired, desiredLen) {
  const len = Math.hypot(velocity.x, velocity.y);
  if (len < 1 || desiredLen < 1) return 1;
  return (velocity.x * desired.x + velocity.y * desired.y) / (len * desiredLen);
}

function isSpecialThreat(threat) {
  return threat.kind === "gravity_well"
    || threat.kind === "boss_dash"
    || threat.kind === "boss_segment_dash"
    || threat.kind === "boss_body_chain"
    || threat.kind === "enemy_dash"
    || threat.baseKind === "boss"
    || threat.baseKind === "blackhole";
}
