import { WORLD_SIZE } from "../constants.js";
import { riskAtPoint } from "./riskModel.js";

export function scoreRoute({ from, to, threats = [], movement = {}, samples = 8 }) {
  const count = clampInt(samples, 2, 32, 8);
  let totalRisk = 0;
  let maxRisk = 0;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      r: from.r || to.r || 14,
    };
    const risk = riskAtPoint(point, threats, { ...movement, samples: count });
    totalRisk += risk;
    maxRisk = Math.max(maxRisk, risk);
  }
  const endpointRisk = riskAtPoint({ x: to.x, y: to.y, r: from.r || to.r || 14 }, threats, movement);
  const averageRisk = totalRisk / (count + 1);
  const distance = Math.hypot((to.x || 0) - (from.x || 0), (to.y || 0) - (from.y || 0));
  const safeLimit = movement.safeRouteRisk || movement.collectRouteRisk || movement.collectRiskLimit || 32;
  return {
    maxRisk,
    averageRisk,
    endpointRisk,
    distance,
    safe: maxRisk <= safeLimit && averageRisk <= safeLimit * 0.72,
    score: maxRisk * 0.62 + averageRisk * 0.28 + endpointRisk * 0.1,
  };
}

export function findEscapeRoute({ player, threats = [], context = {}, movement = {}, samples = 8 }) {
  const candidates = clampInt(movement.escapeCandidates, 8, 32, 16);
  const distance = movement.escapeDistance || 260;
  const centerBias = normalize(-(player.x || 0), -(player.y || 0));
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < candidates; i++) {
    const angle = Number.isFinite(context.breakoutAngle) && i === 0 ? context.breakoutAngle : (i / candidates) * Math.PI * 2;
    const to = {
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
      r: player.r || 14,
    };
    const route = scoreRoute({ from: player, to, threats, movement, samples });
    const dir = normalize(to.x - player.x, to.y - player.y);
    const centerScore = 1 - (dir.x * centerBias.x + dir.y * centerBias.y);
    const edgePenalty = edgePressure(to) * 18;
    const breakoutBonus = Number.isFinite(context.breakoutAngle) ? Math.max(0, dir.x * Math.cos(context.breakoutAngle) + dir.y * Math.sin(context.breakoutAngle)) * 12 : 0;
    const score = route.score + centerScore * 8 + edgePenalty - breakoutBonus;
    if (score < bestScore) {
      bestScore = score;
      best = {
        kind: "escape_route",
        x: to.x,
        y: to.y,
        priority: 105,
        route,
        safe: route.safe,
      };
    }
  }
  return best;
}

export function routePressureLevel(route, movement = {}) {
  if (!route) return "unknown";
  const safe = movement.safeRouteRisk || 28;
  if (route.maxRisk > safe * 1.7 || route.averageRisk > safe) return "high";
  if (route.maxRisk > safe || route.averageRisk > safe * 0.65) return "medium";
  return "low";
}

function edgePressure(point) {
  const half = WORLD_SIZE / 2 - 80;
  const x = Math.max(0, Math.abs(point.x || 0) - half);
  const y = Math.max(0, Math.abs(point.y || 0) - half);
  return (x + y) / 100;
}

function normalize(x, y) {
  const d = Math.max(1, Math.hypot(x, y));
  return { x: x / d, y: y / d };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback;
}
