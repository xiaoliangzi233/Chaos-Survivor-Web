import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { applyPlayerDamage } from "./items.js";
import { clamp, distSq, hexToRgba } from "../utils.js";

const VOID_CROWN_EVENT_TYPES = new Set([
  "crown_levy",
  "fold_transit",
  "void_relay",
  "crown_ingress",
  "sovereign_exchange",
  "exile_balance",
]);
const CROWN_COLOR = "#d86cff";
const VOID_COLOR = "#4b1b78";
const SAFE_COLOR = "#66f7d0";
const WARNING_COLOR = "#ffd166";
const DANGER_COLOR = "#ff4d7d";
const PIXEL_FONT = "'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Courier New', monospace";
const HALF = WORLD_SIZE / 2;
const RELAY_POINTS = [
  { x: -850, y: -520 },
  { x: 820, y: -440 },
  { x: 80, y: 820 },
];
const INGRESS_POINTS = [
  { x: 0, y: -HALF + 170 },
  { x: HALF - 170, y: 0 },
  { x: 0, y: HALF - 170 },
  { x: -HALF + 170, y: 0 },
];
const FOLD_PAIRS = [
  [{ x: -1500, y: -620 }, { x: 1500, y: 620 }],
  [{ x: 1280, y: -980 }, { x: -1280, y: 980 }],
  [{ x: -1700, y: 320 }, { x: 1700, y: -320 }],
];
const BALANCE_ANGLES = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];

export function startVoidCrownScenarioEvent(event) {
  if (!event || !VOID_CROWN_EVENT_TYPES.has(event.type)) return null;
  const runtime = {
    type: event.type,
    config: event,
    elapsed: 0,
    phase: "warning",
    phaseTime: 0,
    cycleIndex: 0,
    damageCooldown: 0,
    enemyPulseCooldown: 0,
    targetCooldown: 0,
    targetTimer: 0,
    target: null,
    targetLastPosition: null,
    stepIndex: 0,
    stepTimer: event.stepTime || 0,
    completedRelays: 0,
    sealedGate: null,
    spawnCursor: 0,
    heavySide: 0,
    leftCount: 0,
    rightCount: 0,
    balanceAngle: 0,
    treasury: { x: 0, y: 0 },
    collected: 0,
    foldPair: FOLD_PAIRS[0],
  };
  state.waveScenarioRuntime = runtime;
  return runtime;
}

export function clearVoidCrownScenarioEvent() {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || !VOID_CROWN_EVENT_TYPES.has(runtime.type)) return;
  if (state.player) delete state.player.voidTransitCooldown;
  for (const enemy of world.enemies) delete enemy.voidTransitCooldown;
  state.waveScenarioRuntime = null;
}

export function updateVoidCrownScenarioEvent(dt) {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || !VOID_CROWN_EVENT_TYPES.has(runtime.type) || !state.player) return;
  runtime.elapsed += dt;
  runtime.damageCooldown = Math.max(0, runtime.damageCooldown - dt);
  runtime.enemyPulseCooldown = Math.max(0, runtime.enemyPulseCooldown - dt);
  state.player.voidTransitCooldown = Math.max(0, (state.player.voidTransitCooldown || 0) - dt);
  if (runtime.type === "crown_levy") updateCrownLevy(runtime, dt);
  if (runtime.type === "fold_transit") updateFoldTransit(runtime, dt);
  if (runtime.type === "void_relay") updateVoidRelay(runtime, dt);
  if (runtime.type === "crown_ingress") updateCrownIngress(runtime);
  if (runtime.type === "sovereign_exchange") updateSovereignExchange(runtime, dt);
  if (runtime.type === "exile_balance") updateExileBalance(runtime);
}

export function voidCrownScenarioRiskAtPoint(point, runtime = state.waveScenarioRuntime) {
  if (!runtime || !point || !VOID_CROWN_EVENT_TYPES.has(runtime.type)) return 0;
  if (runtime.type === "fold_transit" && runtime.phase === "active") {
    const radius = runtime.config.gateRadius + (point.r || 14);
    return runtime.foldPair.some((gate) => distSq(point.x, point.y, gate.x, gate.y) <= radius ** 2) ? 20 : 0;
  }
  if (runtime.type === "void_relay" && runtime.phase === "active") {
    const target = RELAY_POINTS[runtime.stepIndex % RELAY_POINTS.length];
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    const urgency = clamp(1 - runtime.stepTimer / runtime.config.stepTime, 0, 1);
    return Math.max(0, distance - runtime.config.radius) * 0.04 * (0.35 + urgency);
  }
  if (runtime.type === "crown_ingress" && runtime.phase === "choose") {
    return Math.hypot(point.x, point.y) >= runtime.config.selectionRadius ? 0 : 12;
  }
  if (runtime.type === "exile_balance" && (runtime.phase === "warning" || runtime.phase === "active") && runtime.heavySide) {
    if (sideOfBalance(point.x, point.y, runtime.balanceAngle) !== runtime.heavySide) return 0;
    return runtime.phase === "active" ? 82 : 26;
  }
  return 0;
}

export function voidCrownSpawnPosition(radius = 20) {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || runtime.type !== "crown_ingress" || runtime.sealedGate == null) return null;
  const available = INGRESS_POINTS
    .map((_, index) => index)
    .filter((index) => index !== runtime.sealedGate);
  const gateIndex = available[runtime.spawnCursor++ % available.length];
  const gate = INGRESS_POINTS[gateIndex];
  const tangentX = gate.y === 0 ? 0 : 1;
  const tangentY = gate.x === 0 ? 0 : 1;
  const jitter = (Math.random() - 0.5) * 360;
  const inwardX = -Math.sign(gate.x) * (70 + Math.random() * 80);
  const inwardY = -Math.sign(gate.y) * (70 + Math.random() * 80);
  return {
    x: clamp(gate.x + inwardX + tangentX * jitter, -HALF + radius, HALF - radius),
    y: clamp(gate.y + inwardY + tangentY * jitter, -HALF + radius, HALF - radius),
  };
}

export function drawVoidCrownScenarioEvent(ctx, pass = "background") {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || !VOID_CROWN_EVENT_TYPES.has(runtime.type)) return;
  if (runtime.type === "crown_levy") drawCrownLevy(ctx, runtime, pass);
  if (runtime.type === "fold_transit") drawFoldTransit(ctx, runtime, pass);
  if (runtime.type === "void_relay") drawVoidRelay(ctx, runtime, pass);
  if (runtime.type === "crown_ingress") drawCrownIngress(ctx, runtime, pass);
  if (runtime.type === "sovereign_exchange") drawSovereignExchange(ctx, runtime, pass);
  if (runtime.type === "exile_balance") drawExileBalance(ctx, runtime, pass);
}

function updateCrownLevy(runtime, dt) {
  const cfg = runtime.config;
  runtime.phase = runtime.elapsed < cfg.intro ? "warning" : "active";
  const t = Math.max(0, runtime.elapsed - cfg.intro) * 0.28;
  runtime.treasury.x = Math.cos(t) * cfg.orbitRadius;
  runtime.treasury.y = Math.sin(t * 1.5) * cfg.orbitRadius * 0.62;
  if (runtime.phase !== "active") return;
  let moved = 0;
  runtime.collected = 0;
  for (const resource of [...world.gems, ...world.coins]) {
    if (moved >= cfg.objectCap) break;
    const dx = runtime.treasury.x - resource.x;
    const dy = runtime.treasury.y - resource.y;
    const distance = Math.hypot(dx, dy);
    if (distance > cfg.pullRadius || distance < 1) continue;
    const speed = cfg.pullSpeed * (0.3 + 0.7 * (1 - distance / cfg.pullRadius));
    resource.x += dx / distance * speed * dt;
    resource.y += dy / distance * speed * dt;
    if (distance <= cfg.treasuryRadius) runtime.collected++;
    moved++;
  }
}

function updateFoldTransit(runtime, dt) {
  const cfg = runtime.config;
  const timing = cycleTiming(runtime, cfg.cycle, cfg.warning, cfg.active, cfg.intro);
  runtime.foldPair = FOLD_PAIRS[timing.cycleIndex % FOLD_PAIRS.length];
  Object.assign(runtime, timing);
  for (const enemy of world.enemies) {
    enemy.voidTransitCooldown = Math.max(0, (enemy.voidTransitCooldown || 0) - dt);
  }
  if (runtime.phase !== "active") return;
  const [a, b] = runtime.foldPair;
  tryTransit(state.player, a, b, cfg);
  tryTransit(state.player, b, a, cfg);
  let checked = 0;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.boss || checked++ >= 64) continue;
    tryTransit(enemy, a, b, cfg);
    tryTransit(enemy, b, a, cfg);
  }
}

function updateVoidRelay(runtime, dt) {
  const cfg = runtime.config;
  runtime.phase = runtime.elapsed < cfg.intro ? "warning" : "active";
  if (runtime.phase !== "active") return;
  runtime.stepTimer -= dt;
  const target = RELAY_POINTS[runtime.stepIndex % RELAY_POINTS.length];
  if (distSq(state.player.x, state.player.y, target.x, target.y) <= cfg.radius ** 2) {
    pulse(target.x, target.y, cfg.radius * 1.35, SAFE_COLOR, 0.32);
    runtime.stepIndex = (runtime.stepIndex + 1) % RELAY_POINTS.length;
    runtime.stepTimer = cfg.stepTime;
    if (runtime.stepIndex === 0) {
      runtime.completedRelays++;
      damageEnemies(() => true, cfg.enemyDamage, 72);
      burst(target.x, target.y, 22, SAFE_COLOR, 190);
    }
    return;
  }
  if (runtime.stepTimer > 0) return;
  damagePlayer(runtime, cfg.damage, 0.1);
  runtime.stepIndex = (runtime.stepIndex + 1) % RELAY_POINTS.length;
  runtime.stepTimer = cfg.stepTime;
}

function updateCrownIngress(runtime) {
  const cfg = runtime.config;
  if (runtime.elapsed < cfg.intro) {
    runtime.phase = "warning";
    return;
  }
  const elapsed = runtime.elapsed - cfg.intro;
  const epoch = cfg.chooseTime + cfg.holdTime;
  const epochIndex = Math.floor(elapsed / epoch);
  const phaseTime = elapsed % epoch;
  if (epochIndex !== runtime.cycleIndex) {
    runtime.cycleIndex = epochIndex;
    runtime.sealedGate = null;
  }
  runtime.phaseTime = phaseTime;
  runtime.phase = phaseTime < cfg.chooseTime && runtime.sealedGate == null ? "choose" : "sealed";
  if (runtime.phase !== "choose") return;
  const playerDistance = Math.hypot(state.player.x, state.player.y);
  const chosen = playerDistance >= cfg.selectionRadius
    ? nearestPointIndex(state.player, INGRESS_POINTS)
    : -1;
  if (chosen >= 0) {
    runtime.sealedGate = chosen;
    runtime.phase = "sealed";
    pulse(INGRESS_POINTS[chosen].x, INGRESS_POINTS[chosen].y, cfg.gateRadius * 1.2, SAFE_COLOR, 0.36);
  } else if (phaseTime >= cfg.chooseTime - 0.05) {
    runtime.sealedGate = nearestPointIndex(state.player, INGRESS_POINTS);
    runtime.phase = "sealed";
  }
}

function updateSovereignExchange(runtime, dt) {
  const cfg = runtime.config;
  runtime.phase = runtime.elapsed < cfg.intro ? "warning" : "active";
  if (runtime.phase !== "active") return;
  runtime.targetCooldown = Math.max(0, runtime.targetCooldown - dt);
  if (runtime.target && (runtime.target.dead || !world.enemies.includes(runtime.target))) {
    resolveExecutedExchange(runtime);
  }
  if (!runtime.target && runtime.targetCooldown <= 0) {
    runtime.target = selectExchangeTarget();
    runtime.targetTimer = cfg.sentenceTime;
    if (runtime.target) {
      runtime.targetLastPosition = { x: runtime.target.x, y: runtime.target.y };
      pulse(runtime.target.x, runtime.target.y, cfg.targetRadius, WARNING_COLOR, 0.34);
    }
  }
  if (!runtime.target) return;
  runtime.targetLastPosition = { x: runtime.target.x, y: runtime.target.y };
  runtime.targetTimer -= dt;
  if (runtime.targetTimer > 0) return;
  const target = runtime.target;
  const playerX = state.player.x;
  const playerY = state.player.y;
  state.player.x = clamp(target.x, -HALF + 60, HALF - 60);
  state.player.y = clamp(target.y, -HALF + 60, HALF - 60);
  target.x = clamp(playerX, -HALF + target.r, HALF - target.r);
  target.y = clamp(playerY, -HALF + target.r, HALF - target.r);
  state.player.invuln = Math.max(state.player.invuln, 0.45);
  burst(state.player.x, state.player.y, 18, CROWN_COLOR, 180);
  burst(target.x, target.y, 18, VOID_COLOR, 180);
  runtime.target = null;
  runtime.targetCooldown = cfg.rest;
}

function updateExileBalance(runtime) {
  const cfg = runtime.config;
  const timing = cycleTiming(runtime, cfg.cycle, cfg.warning, cfg.active, cfg.intro);
  runtime.balanceAngle = BALANCE_ANGLES[timing.cycleIndex % BALANCE_ANGLES.length];
  Object.assign(runtime, timing);
  let left = 0;
  let right = 0;
  let counted = 0;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.boss || counted++ >= 160) continue;
    if (sideOfBalance(enemy.x, enemy.y, runtime.balanceAngle) < 0) left++;
    else right++;
  }
  runtime.leftCount = left;
  runtime.rightCount = right;
  const difference = right - left;
  runtime.heavySide = Math.abs(difference) >= cfg.tolerance ? Math.sign(difference) : 0;
  if (runtime.phase !== "active" || !runtime.heavySide) return;
  if (sideOfBalance(state.player.x, state.player.y, runtime.balanceAngle) === runtime.heavySide) {
    damagePlayer(runtime, cfg.damage, 0.68);
  }
  if (runtime.enemyPulseCooldown > 0) return;
  runtime.enemyPulseCooldown = 1;
  damageEnemies(
    (enemy) => sideOfBalance(enemy.x, enemy.y, runtime.balanceAngle) === runtime.heavySide,
    cfg.enemyDamage,
    48,
  );
}

function cycleTiming(runtime, cycle, warning, active, intro = 0) {
  if (runtime.elapsed < intro) return { phase: "warning", phaseTime: runtime.elapsed, cycleIndex: 0 };
  const elapsed = runtime.elapsed - intro;
  const phaseTime = elapsed % cycle;
  return {
    phase: phaseTime < warning ? "warning" : phaseTime < warning + active ? "active" : "rest",
    phaseTime,
    cycleIndex: Math.floor(elapsed / cycle),
  };
}

function tryTransit(entity, from, to, cfg) {
  if ((entity.voidTransitCooldown || 0) > 0) return false;
  if (distSq(entity.x, entity.y, from.x, from.y) > (cfg.gateRadius + (entity.r || 0)) ** 2) return false;
  const offsetX = entity.x - from.x;
  const offsetY = entity.y - from.y;
  entity.x = clamp(to.x - offsetX, -HALF + (entity.r || 14), HALF - (entity.r || 14));
  entity.y = clamp(to.y - offsetY, -HALF + (entity.r || 14), HALF - (entity.r || 14));
  entity.voidTransitCooldown = cfg.cooldown;
  pulse(from.x, from.y, cfg.gateRadius, CROWN_COLOR, 0.22);
  pulse(to.x, to.y, cfg.gateRadius, SAFE_COLOR, 0.22);
  return true;
}

function selectExchangeTarget() {
  const p = state.player;
  const candidates = world.enemies
    .filter((enemy) => !enemy.dead && !enemy.boss)
    .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - p.x, enemy.y - p.y) }))
    .filter(({ distance }) => distance >= 260)
    .sort((a, b) => b.distance - a.distance);
  return candidates.find(({ distance }) => distance <= 1100)?.enemy || candidates[0]?.enemy || null;
}

function resolveExecutedExchange(runtime) {
  const point = runtime.targetLastPosition;
  if (point) {
    damageEnemies(
      (enemy) => distSq(enemy.x, enemy.y, point.x, point.y) <= runtime.config.targetRadius ** 2,
      runtime.config.enemyDamage,
      36,
    );
    burst(point.x, point.y, 20, SAFE_COLOR, 190);
    pulse(point.x, point.y, runtime.config.targetRadius, SAFE_COLOR, 0.3);
  }
  runtime.target = null;
  runtime.targetCooldown = runtime.config.rest;
}

function damagePlayer(runtime, amount, cooldown) {
  if (runtime.damageCooldown > 0 || state.player.invuln > 0) return false;
  const result = applyPlayerDamage(amount, {
    kind: "void_crown_scene",
    scenarioEventId: runtime.type,
    damage: amount,
  });
  runtime.damageCooldown = cooldown;
  state.player.invuln = Math.max(state.player.invuln, 0.32);
  if (result.damaged) {
    pulse(state.player.x, state.player.y, 58, DANGER_COLOR, 0.2);
    state.shake = Math.max(state.shake, 4);
  }
  return result.damaged;
}

function damageEnemies(predicate, amount, cap) {
  let damaged = 0;
  for (const enemy of [...world.enemies]) {
    if (damaged >= cap || enemy.dead || enemy.boss || !predicate(enemy)) continue;
    enemy.takeDamage?.(amount, enemy.x, enemy.y, { statusEffect: true });
    damaged++;
  }
  return damaged;
}

function nearestPointIndex(point, points) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index++) {
    const distance = distSq(point.x, point.y, points[index].x, points[index].y);
    if (distance >= bestDistance) continue;
    best = index;
    bestDistance = distance;
  }
  return best;
}

function sideOfBalance(x, y, angle) {
  const value = x * Math.cos(angle) + y * Math.sin(angle);
  return Math.abs(value) < 1 ? 1 : Math.sign(value);
}

function drawCrownLevy(ctx, runtime, pass) {
  const treasury = runtime.treasury;
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = hexToRgba(CROWN_COLOR, 0.22);
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.ellipse(0, 0, runtime.config.orbitRadius, runtime.config.orbitRadius * 0.62, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    let links = 0;
    for (const resource of [...world.gems, ...world.coins]) {
      if (links++ >= 12) break;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(resource.x, resource.y);
      ctx.lineTo(treasury.x, treasury.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  drawCrownSigil(ctx, treasury.x, treasury.y, runtime.config.treasuryRadius, runtime.elapsed);
  drawWorldLabel(ctx, treasury.x, treasury.y - runtime.config.treasuryRadius - 30, `王冠征税 · 截获 ${runtime.collected}`, WARNING_COLOR);
}

function drawFoldTransit(ctx, runtime, pass) {
  const active = runtime.phase === "active";
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = hexToRgba(active ? SAFE_COLOR : CROWN_COLOR, active ? 0.34 : 0.16);
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    ctx.moveTo(runtime.foldPair[0].x, runtime.foldPair[0].y);
    ctx.lineTo(runtime.foldPair[1].x, runtime.foldPair[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  for (let index = 0; index < runtime.foldPair.length; index++) {
    const gate = runtime.foldPair[index];
    drawFoldGate(ctx, gate.x, gate.y, runtime.config.gateRadius, runtime.elapsed + index * 1.7, active);
  }
  const label = active ? "折叠通路已接通" : runtime.phase === "warning" ? "折叠坐标校准" : "折叠通路冷却";
  drawWorldLabel(ctx, 0, -84, label, active ? SAFE_COLOR : CROWN_COLOR);
}

function drawVoidRelay(ctx, runtime, pass) {
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = hexToRgba(CROWN_COLOR, 0.2);
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 14]);
    ctx.beginPath();
    ctx.moveTo(RELAY_POINTS[0].x, RELAY_POINTS[0].y);
    for (let i = 1; i < RELAY_POINTS.length; i++) ctx.lineTo(RELAY_POINTS[i].x, RELAY_POINTS[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    return;
  }
  for (let index = 0; index < RELAY_POINTS.length; index++) {
    const point = RELAY_POINTS[index];
    drawRelaySigil(ctx, point.x, point.y, runtime.config.radius, index === runtime.stepIndex, runtime.elapsed + index);
  }
  const target = RELAY_POINTS[runtime.stepIndex];
  drawWorldLabel(ctx, target.x, target.y - runtime.config.radius - 28, `虚空接力 ${runtime.stepIndex + 1}/3 · ${Math.max(0, runtime.stepTimer).toFixed(1)}`, WARNING_COLOR);
}

function drawCrownIngress(ctx, runtime, pass) {
  if (pass === "background") {
    ctx.save();
    ctx.fillStyle = hexToRgba(VOID_COLOR, 0.045);
    ctx.fillRect(-HALF, -HALF, WORLD_SIZE, WORLD_SIZE);
    if (runtime.phase === "choose") {
      ctx.strokeStyle = hexToRgba(CROWN_COLOR, 0.2);
      ctx.lineWidth = 3;
      ctx.setLineDash([24, 18]);
      for (const gate of INGRESS_POINTS) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(gate.x, gate.y);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }
  for (let index = 0; index < INGRESS_POINTS.length; index++) {
    const gate = INGRESS_POINTS[index];
    const sealed = runtime.sealedGate === index;
    drawIngressGate(ctx, gate.x, gate.y, runtime.config.gateRadius, runtime.elapsed + index, sealed);
  }
  const label = runtime.phase === "choose"
    ? `向一座门移动并封印 · ${Math.max(0, runtime.config.chooseTime - runtime.phaseTime).toFixed(1)}`
    : runtime.sealedGate == null ? "王冠门正在显现" : `第 ${runtime.sealedGate + 1} 门已封印`;
  drawWorldLabel(ctx, 0, -92, label, runtime.phase === "choose" ? WARNING_COLOR : SAFE_COLOR);
}

function drawSovereignExchange(ctx, runtime, pass) {
  const target = runtime.target;
  if (!target) return;
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = hexToRgba(CROWN_COLOR, 0.36);
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 13, 4, 13]);
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawCrownSigil(ctx, target.x, target.y, runtime.config.targetRadius, runtime.elapsed);
  drawWorldLabel(ctx, target.x, target.y - target.r - 58, `王权换位 · ${Math.max(0, runtime.targetTimer).toFixed(1)}`, DANGER_COLOR);
}

function drawExileBalance(ctx, runtime, pass) {
  if (pass === "background") {
    if (runtime.heavySide) {
      ctx.save();
      ctx.rotate(runtime.balanceAngle);
      ctx.fillStyle = hexToRgba(DANGER_COLOR, runtime.phase === "active" ? 0.13 : 0.055);
      if (runtime.heavySide > 0) ctx.fillRect(0, -WORLD_SIZE, WORLD_SIZE, WORLD_SIZE * 2);
      else ctx.fillRect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE, WORLD_SIZE * 2);
      ctx.restore();
    }
    ctx.save();
    ctx.rotate(runtime.balanceAngle);
    ctx.strokeStyle = hexToRgba(runtime.heavySide ? WARNING_COLOR : SAFE_COLOR, 0.58);
    ctx.lineWidth = 6;
    ctx.setLineDash([30, 18, 6, 18]);
    ctx.beginPath();
    ctx.moveTo(0, -WORLD_SIZE);
    ctx.lineTo(0, WORLD_SIZE);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const stateLabel = runtime.heavySide ? (runtime.heavySide < 0 ? "左庭超载" : "右庭超载") : "两庭平衡";
  drawWorldLabel(ctx, 0, -92, `${stateLabel} · ${runtime.leftCount}:${runtime.rightCount}`, runtime.heavySide ? DANGER_COLOR : SAFE_COLOR);
}

function drawCrownSigil(ctx, x, y, radius, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 0.7) * 0.08);
  ctx.fillStyle = "rgba(4,4,18,0.86)";
  ctx.strokeStyle = hexToRgba(CROWN_COLOR, 0.82);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.72, radius * 0.2);
  ctx.lineTo(-radius * 0.56, -radius * 0.42);
  ctx.lineTo(-radius * 0.18, -radius * 0.08);
  ctx.lineTo(0, -radius * 0.7);
  ctx.lineTo(radius * 0.2, -radius * 0.08);
  ctx.lineTo(radius * 0.58, -radius * 0.46);
  ctx.lineTo(radius * 0.72, radius * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SAFE_COLOR;
  ctx.fillRect(-radius * 0.1, -radius * 0.02, radius * 0.2, radius * 0.2);
  ctx.strokeStyle = hexToRgba(WARNING_COLOR, 0.6);
  ctx.strokeRect(-radius * 0.58, radius * 0.26, radius * 1.16, radius * 0.18);
  ctx.restore();
}

function drawFoldGate(ctx, x, y, radius, time, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * (active ? 0.5 : 0.16));
  for (let ring = 0; ring < 3; ring++) {
    const size = radius * (0.52 + ring * 0.2);
    ctx.strokeStyle = hexToRgba(ring === 1 ? SAFE_COLOR : CROWN_COLOR, active ? 0.72 - ring * 0.12 : 0.32);
    ctx.lineWidth = 4;
    ctx.strokeRect(-size, -size, size * 2, size * 2);
    ctx.rotate(Math.PI / 8);
  }
  ctx.fillStyle = hexToRgba(VOID_COLOR, active ? 0.55 : 0.22);
  ctx.fillRect(-radius * 0.42, -radius * 0.42, radius * 0.84, radius * 0.84);
  ctx.restore();
}

function drawRelaySigil(ctx, x, y, radius, active, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * (active ? 0.65 : 0.2));
  ctx.strokeStyle = hexToRgba(active ? WARNING_COLOR : CROWN_COLOR, active ? 0.88 : 0.34);
  ctx.lineWidth = active ? 6 : 3;
  ctx.strokeRect(-radius * 0.52, -radius * 0.52, radius * 1.04, radius * 1.04);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-radius * 0.36, -radius * 0.36, radius * 0.72, radius * 0.72);
  ctx.fillStyle = active ? WARNING_COLOR : VOID_COLOR;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
}

function drawIngressGate(ctx, x, y, radius, time, sealed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexToRgba(sealed ? SAFE_COLOR : CROWN_COLOR, sealed ? 0.86 : 0.52);
  ctx.lineWidth = sealed ? 7 : 4;
  ctx.setLineDash(sealed ? [20, 12] : [8, 12]);
  ctx.lineDashOffset = -time * 30;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillStyle = sealed ? SAFE_COLOR : CROWN_COLOR;
    ctx.fillRect(radius * 0.72, -4, radius * 0.2, 8);
  }
  if (sealed) {
    ctx.fillStyle = "rgba(4,4,18,0.86)";
    ctx.fillRect(-32, -32, 64, 64);
    ctx.strokeRect(-32, -32, 64, 64);
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.lineTo(22, 22);
    ctx.moveTo(22, -22);
    ctx.lineTo(-22, 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldLabel(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = `700 16px ${PIXEL_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 26;
  ctx.fillStyle = "rgba(3,5,18,0.88)";
  ctx.fillRect(x - width / 2, y - 16, width, 32);
  ctx.strokeStyle = hexToRgba(color, 0.82);
  ctx.lineWidth = 2;
  ctx.strokeRect(x - width / 2, y - 16, width, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
