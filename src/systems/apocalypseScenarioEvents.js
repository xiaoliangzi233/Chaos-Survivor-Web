import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { applyPlayerDamage } from "./items.js";
import { clamp, distSq, hexToRgba } from "../utils.js";

const APOCALYPSE_EVENT_TYPES = new Set([
  "quadrant_verdict",
  "ember_convoy",
  "doom_ledger",
  "causal_echo_route",
  "ceasefire_credit",
  "sanctuary_quota",
  "mercy_faultline",
]);
const EVENT_COLOR = "#ff5a36";
const SAFE_COLOR = "#72ffb4";
const WARNING_COLOR = "#ffd166";
const VOID_COLOR = "#b32246";
const PIXEL_FONT = "'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Courier New', monospace";
const SHELTER_CENTERS = [
  { x: -330, y: -210 },
  { x: 350, y: -130 },
  { x: 60, y: 330 },
  { x: -360, y: 170 },
];
const SEAM_ANGLES = [Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2];

export function startApocalypseScenarioEvent(event) {
  clearApocalypseScenarioEvent();
  if (!event || !APOCALYPSE_EVENT_TYPES.has(event.type)) return null;
  const runtime = {
    type: event.type,
    config: event,
    elapsed: 0,
    phase: "warning",
    phaseTime: 0,
    cycleIndex: 0,
    damageCooldown: 0,
    enemyPulseCooldown: 0,
    pathTimer: 0,
    path: [],
    target: null,
    targetTimer: 0,
    targetCooldown: 0,
    charge: 0,
    seamAngle: SEAM_ANGLES[0],
    previewCount: 0,
    overcrowded: false,
    center: { ...SHELTER_CENTERS[0] },
    pattern: quadrantParity(state.player?.x || 0, state.player?.y || 0),
  };
  state.waveScenarioRuntime = runtime;
  return runtime;
}

export function clearApocalypseScenarioEvent() {
  const runtime = state.waveScenarioRuntime;
  if (runtime?.type === "ceasefire_credit") restoreStasisProjectiles();
  if (runtime?.type === "mercy_faultline") clearFaultlineProjectileState();
  state.waveScenarioRuntime = null;
}

export function updateApocalypseScenarioEvent(dt) {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || !APOCALYPSE_EVENT_TYPES.has(runtime.type) || !state.player) return;
  runtime.elapsed += dt;
  runtime.damageCooldown = Math.max(0, runtime.damageCooldown - dt);
  runtime.enemyPulseCooldown = Math.max(0, runtime.enemyPulseCooldown - dt);
  if (runtime.type === "quadrant_verdict") updateQuadrantVerdict(runtime, dt);
  if (runtime.type === "ember_convoy") updateEmberConvoy(runtime, dt);
  if (runtime.type === "doom_ledger") updateDoomLedger(runtime, dt);
  if (runtime.type === "causal_echo_route") updateCausalEchoRoute(runtime, dt);
  if (runtime.type === "ceasefire_credit") updateCeasefireCredit(runtime, dt);
  if (runtime.type === "sanctuary_quota") updateSanctuaryQuota(runtime, dt);
  if (runtime.type === "mercy_faultline") updateMercyFaultline(runtime, dt);
}

export function apocalypseScenarioRiskAtPoint(point, runtime = state.waveScenarioRuntime) {
  if (!runtime || !point) return 0;
  const warningScale = runtime.phase === "warning" ? 0.28 : 1;
  if (runtime.type === "quadrant_verdict" && (runtime.phase === "warning" || runtime.phase === "active")) {
    return isSafeQuadrant(point.x, point.y, runtime.pattern || 0) ? 0 : 72 * warningScale;
  }
  if (runtime.type === "ember_convoy" && runtime.elapsed >= (runtime.config.intro || 0)) {
    const beacon = convoyPosition(runtime);
    const distance = Math.hypot(point.x - beacon.x, point.y - beacon.y);
    return distance <= runtime.config.radius ? 0 : Math.min(96, 26 + (distance - runtime.config.radius) * 0.12);
  }
  if (runtime.type === "doom_ledger" && runtime.target && runtime.targetTimer <= 1.2) {
    const radius = runtime.config.detonationRadius || 270;
    const distance = Math.hypot(point.x - runtime.target.x, point.y - runtime.target.y);
    return distance <= radius + (point.r || 14) ? 88 : 0;
  }
  if (runtime.type === "causal_echo_route" && (runtime.phase === "warning" || runtime.phase === "active")) {
    const distance = distanceToEchoPath(point, runtime);
    if (!Number.isFinite(distance)) return 0;
    return distance <= runtime.config.safeWidth ? 0 : 82 * warningScale;
  }
  if (runtime.type === "sanctuary_quota" && (runtime.phase === "warning" || runtime.phase === "active")) {
    const inside = distSq(point.x, point.y, runtime.center.x, runtime.center.y) <= runtime.config.radius ** 2;
    const safeInside = runtime.phase === "warning" ? runtime.previewCount <= runtime.config.quota : !runtime.overcrowded;
    return inside === safeInside ? 0 : 78 * warningScale;
  }
  return 0;
}

export function drawApocalypseScenarioEvent(ctx, pass = "background") {
  const runtime = state.waveScenarioRuntime;
  if (!runtime || !APOCALYPSE_EVENT_TYPES.has(runtime.type)) return;
  if (runtime.type === "quadrant_verdict") drawQuadrantVerdict(ctx, runtime, pass);
  if (runtime.type === "ember_convoy") drawEmberConvoy(ctx, runtime, pass);
  if (runtime.type === "doom_ledger") drawDoomLedger(ctx, runtime, pass);
  if (runtime.type === "causal_echo_route") drawCausalEchoRoute(ctx, runtime, pass);
  if (runtime.type === "ceasefire_credit") drawCeasefireCredit(ctx, runtime, pass);
  if (runtime.type === "sanctuary_quota") drawSanctuaryQuota(ctx, runtime, pass);
  if (runtime.type === "mercy_faultline") drawMercyFaultline(ctx, runtime, pass);
}

function updateQuadrantVerdict(runtime) {
  const cfg = runtime.config;
  const timing = cycleTiming(runtime, cfg.cycle, cfg.warning, cfg.active, cfg.intro);
  if (timing.cycleIndex !== runtime.cycleIndex) {
    runtime.pattern = quadrantParity(state.player.x, state.player.y);
  }
  Object.assign(runtime, timing);
  if (runtime.phase !== "active") return;
  const p = state.player;
  if (!isSafeQuadrant(p.x, p.y, runtime.pattern)) damagePlayer(runtime, cfg.damage, 0.62);
  if (runtime.enemyPulseCooldown > 0) return;
  runtime.enemyPulseCooldown = 0.72;
  damageEnemies((enemy) => !isSafeQuadrant(enemy.x, enemy.y, runtime.pattern), cfg.enemyDamage, 72);
}

function updateEmberConvoy(runtime) {
  runtime.phase = runtime.elapsed < runtime.config.intro ? "warning" : "active";
  const beacon = convoyPosition(runtime);
  runtime.beaconX = beacon.x;
  runtime.beaconY = beacon.y;
  if (runtime.phase !== "active") return;
  const p = state.player;
  if (distSq(p.x, p.y, beacon.x, beacon.y) > runtime.config.radius ** 2) {
    damagePlayer(runtime, runtime.config.damage, 0.68);
  }
  if (runtime.enemyPulseCooldown > 0) return;
  runtime.enemyPulseCooldown = 1.05;
  const radius = runtime.config.radius * 0.82;
  damageEnemies((enemy) => distSq(enemy.x, enemy.y, beacon.x, beacon.y) <= radius * radius, runtime.config.enemyDamage, 56);
}

function updateDoomLedger(runtime, dt) {
  runtime.phase = runtime.elapsed < runtime.config.intro ? "warning" : "active";
  if (runtime.phase !== "active") return;
  runtime.targetCooldown = Math.max(0, runtime.targetCooldown - dt);
  if (runtime.target && (runtime.target.dead || !world.enemies.includes(runtime.target))) {
    detonateLedgerTarget(runtime, runtime.target, true);
    runtime.target = null;
    runtime.targetCooldown = 1.1;
  }
  if (!runtime.target && runtime.targetCooldown <= 0) {
    runtime.target = selectLedgerTarget();
    runtime.targetTimer = runtime.config.sentenceTime;
    if (runtime.target) pulse(runtime.target.x, runtime.target.y, 110, WARNING_COLOR, 0.34);
  }
  const target = runtime.target;
  if (!target) return;
  runtime.targetTimer -= dt;
  const pullRadiusSq = runtime.config.pullRadius ** 2;
  let pulled = 0;
  for (const enemy of world.enemies) {
    if (enemy === target || enemy.dead || enemy.boss || pulled >= 96) continue;
    const d2 = distSq(enemy.x, enemy.y, target.x, target.y);
    if (d2 > pullRadiusSq || d2 < 16) continue;
    const distance = Math.sqrt(d2);
    const strength = 48 * (1 - distance / runtime.config.pullRadius);
    enemy.x += (target.x - enemy.x) / distance * strength * dt;
    enemy.y += (target.y - enemy.y) / distance * strength * dt;
    pulled++;
  }
  if (runtime.targetTimer > 0) return;
  detonateLedgerTarget(runtime, target, false);
  runtime.target = null;
  runtime.targetCooldown = 2.2;
}

function updateCausalEchoRoute(runtime, dt) {
  const cfg = runtime.config;
  runtime.pathTimer -= dt;
  if (runtime.pathTimer <= 0) {
    runtime.pathTimer += 0.1;
    runtime.path.push({ x: state.player.x, y: state.player.y, age: 0 });
    if (runtime.path.length > cfg.objectCap) runtime.path.splice(0, runtime.path.length - cfg.objectCap);
  }
  for (const point of runtime.path) point.age += dt;
  runtime.path = runtime.path.filter((point) => point.age <= cfg.delay + cfg.memory + 1);
  Object.assign(runtime, cycleTiming(runtime, cfg.cycle, cfg.warning, cfg.active, cfg.intro));
  if (runtime.phase === "active" && distanceToEchoPath(state.player, runtime) > cfg.safeWidth) {
    damagePlayer(runtime, cfg.damage, 0.62);
  }
}

function updateCeasefireCredit(runtime, dt) {
  const cfg = runtime.config;
  if (runtime.elapsed < cfg.intro) {
    runtime.phase = "warning";
    restoreStasisProjectiles();
    return;
  }
  const cyclePosition = (runtime.elapsed - cfg.intro) % cfg.cycle;
  runtime.cycleIndex = Math.floor((runtime.elapsed - cfg.intro) / cfg.cycle);
  runtime.phaseTime = cyclePosition;
  runtime.phase = cyclePosition < cfg.stasis ? "stasis" : "release";
  if (runtime.phase !== "stasis") {
    restoreStasisProjectiles();
    return;
  }
  let frozen = 0;
  for (const projectile of world.enemyProjectiles) {
    if (projectile.bossProjectile || projectile.life <= 0) continue;
    if (!projectile.apocalypseStasis && frozen >= cfg.projectileCap) continue;
    if (!projectile.apocalypseStasis) {
      projectile.apocalypseStasis = {
        vx: projectile.vx,
        vy: projectile.vy,
        nonColliding: Boolean(projectile.nonColliding),
      };
    }
    projectile.vx = 0;
    projectile.vy = 0;
    projectile.nonColliding = true;
    projectile.life += dt;
    frozen++;
  }
  runtime.frozenCount = frozen;
}

function updateSanctuaryQuota(runtime) {
  const cfg = runtime.config;
  const timing = cycleTiming(runtime, cfg.cycle, cfg.warning, cfg.active, cfg.intro);
  if (timing.cycleIndex !== runtime.cycleIndex) {
    runtime.center = { ...SHELTER_CENTERS[timing.cycleIndex % SHELTER_CENTERS.length] };
    runtime.overcrowded = false;
  }
  const previousPhase = runtime.phase;
  Object.assign(runtime, timing);
  runtime.previewCount = countEnemiesInCircle(runtime.center.x, runtime.center.y, cfg.radius, cfg.quota + 8);
  if (runtime.phase === "active" && previousPhase !== "active") {
    runtime.overcrowded = runtime.previewCount > cfg.quota;
    pulse(runtime.center.x, runtime.center.y, cfg.radius, runtime.overcrowded ? EVENT_COLOR : SAFE_COLOR, 0.4);
  }
  if (runtime.phase !== "active") return;
  const inside = distSq(state.player.x, state.player.y, runtime.center.x, runtime.center.y) <= cfg.radius ** 2;
  const safeInside = !runtime.overcrowded;
  if (inside !== safeInside) damagePlayer(runtime, cfg.damage, 0.62);
}

function updateMercyFaultline(runtime, dt) {
  const cfg = runtime.config;
  runtime.phase = runtime.elapsed < cfg.intro ? "warning" : "active";
  if (runtime.phase !== "active") return;
  const orientationIndex = Math.floor((runtime.elapsed - cfg.intro) / cfg.rotateEvery) % SEAM_ANGLES.length;
  const nextAngle = SEAM_ANGLES[orientationIndex];
  if (nextAngle !== runtime.seamAngle) {
    runtime.seamAngle = nextAngle;
    clearFaultlineProjectileState();
  }
  let inspected = 0;
  for (let i = world.enemyProjectiles.length - 1; i >= 0 && inspected < cfg.projectileCap; i--) {
    const projectile = world.enemyProjectiles[i];
    if (projectile.bossProjectile || projectile.life <= 0) continue;
    inspected++;
    const side = seamSide(projectile.x, projectile.y, runtime.seamAngle);
    if (projectile.apocalypseSeamSide == null) {
      projectile.apocalypseSeamSide = side;
      continue;
    }
    if (side === projectile.apocalypseSeamSide || side === 0) continue;
    const x = projectile.x;
    const y = projectile.y;
    world.enemyProjectiles.splice(i, 1);
    runtime.charge++;
    runtime.lastIntercept = { x, y, life: 0.35 };
    pulse(x, y, 42, SAFE_COLOR, 0.18);
    if (runtime.charge < cfg.chargeNeeded) continue;
    runtime.charge -= cfg.chargeNeeded;
    damageEnemies((enemy) => distSq(enemy.x, enemy.y, x, y) <= cfg.blastRadius ** 2, cfg.enemyDamage, 72);
    burst(x, y, 18, SAFE_COLOR, 180);
    pulse(x, y, cfg.blastRadius, SAFE_COLOR, 0.32);
  }
  if (runtime.lastIntercept) {
    runtime.lastIntercept.life -= dt;
    if (runtime.lastIntercept.life <= 0) runtime.lastIntercept = null;
  }
}

function cycleTiming(runtime, cycle, warning, active, intro = 0) {
  if (runtime.elapsed < intro) {
    return { phase: "warning", phaseTime: runtime.elapsed, cycleIndex: 0 };
  }
  const elapsed = runtime.elapsed - intro;
  const phaseTime = elapsed % cycle;
  return {
    phase: phaseTime < warning ? "warning" : phaseTime < warning + active ? "active" : "rest",
    phaseTime,
    cycleIndex: Math.floor(elapsed / cycle),
  };
}

function isSafeQuadrant(x, y, pattern) {
  return quadrantParity(x, y) === pattern;
}

function quadrantParity(x, y) {
  const quadrant = x >= 0 ? (y >= 0 ? 0 : 3) : (y >= 0 ? 1 : 2);
  return quadrant % 2;
}

function convoyPosition(runtime) {
  const t = Math.max(0, runtime.elapsed - runtime.config.intro) * 0.24;
  return {
    x: Math.cos(t) * 520,
    y: Math.sin(t * 2) * 310,
  };
}

function selectLedgerTarget() {
  const p = state.player;
  const candidates = world.enemies.filter((enemy) => !enemy.dead && !enemy.boss);
  candidates.sort((a, b) => distSq(a.x, a.y, p.x, p.y) - distSq(b.x, b.y, p.x, p.y));
  return candidates.find((enemy) => distSq(enemy.x, enemy.y, p.x, p.y) <= 820 ** 2) || candidates[0] || null;
}

function detonateLedgerTarget(runtime, target, wasKilled) {
  if (!target) return;
  const radius = runtime.config.detonationRadius;
  damageEnemies(
    (enemy) => enemy !== target && distSq(enemy.x, enemy.y, target.x, target.y) <= radius ** 2,
    runtime.config.enemyDamage * (wasKilled ? 1.2 : 1),
    80,
  );
  if (!wasKilled && distSq(state.player.x, state.player.y, target.x, target.y) <= (radius * 0.68) ** 2) {
    damagePlayer(runtime, runtime.config.damage, 0.1);
  }
  burst(target.x, target.y, wasKilled ? 22 : 15, wasKilled ? SAFE_COLOR : EVENT_COLOR, 190);
  pulse(target.x, target.y, radius, wasKilled ? SAFE_COLOR : EVENT_COLOR, 0.3);
}

function distanceToEchoPath(point, runtime) {
  const minAge = runtime.config.delay;
  const maxAge = minAge + runtime.config.memory;
  let best = Infinity;
  for (const sample of runtime.path) {
    if (sample.age < minAge || sample.age > maxAge) continue;
    best = Math.min(best, Math.hypot(point.x - sample.x, point.y - sample.y));
  }
  return best;
}

function damagePlayer(runtime, amount, cooldown) {
  if (runtime.damageCooldown > 0 || state.player.invuln > 0) return false;
  const result = applyPlayerDamage(amount, {
    kind: "apocalypse_scene",
    scenarioEventId: runtime.type,
    damage: amount,
  });
  runtime.damageCooldown = cooldown;
  state.player.invuln = Math.max(state.player.invuln, 0.32);
  if (result.damaged) {
    pulse(state.player.x, state.player.y, 54, EVENT_COLOR, 0.18);
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

function countEnemiesInCircle(x, y, radius, cap) {
  let count = 0;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.boss) continue;
    if (distSq(enemy.x, enemy.y, x, y) <= radius ** 2 && ++count >= cap) break;
  }
  return count;
}

function restoreStasisProjectiles() {
  for (const projectile of world.enemyProjectiles) {
    const stored = projectile.apocalypseStasis;
    if (!stored) continue;
    projectile.vx = stored.vx;
    projectile.vy = stored.vy;
    projectile.nonColliding = stored.nonColliding;
    delete projectile.apocalypseStasis;
  }
}

function clearFaultlineProjectileState() {
  for (const projectile of world.enemyProjectiles) delete projectile.apocalypseSeamSide;
}

function seamSide(x, y, angle) {
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const value = x * normalX + y * normalY;
  return Math.abs(value) < 0.01 ? 0 : Math.sign(value);
}

function drawQuadrantVerdict(ctx, runtime, pass) {
  const half = WORLD_SIZE / 2;
  if (pass === "background") {
    ctx.save();
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const safe = quadrant % 2 === (runtime.pattern || 0);
      const x = quadrant === 0 || quadrant === 3 ? 0 : -half;
      const y = quadrant === 0 || quadrant === 1 ? 0 : -half;
      ctx.fillStyle = hexToRgba(safe ? SAFE_COLOR : EVENT_COLOR, safe ? 0.055 : runtime.phase === "active" ? 0.16 : 0.085);
      ctx.fillRect(x, y, half, half);
    }
    ctx.strokeStyle = hexToRgba(WARNING_COLOR, 0.34);
    ctx.lineWidth = 5;
    ctx.setLineDash([30, 18]);
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawWorldLabel(ctx, 0, -72, runtime.phase === "active" ? "裁决执行" : "安全象限校准", runtime.phase === "active" ? EVENT_COLOR : WARNING_COLOR);
}

function drawEmberConvoy(ctx, runtime, pass) {
  const beacon = convoyPosition(runtime);
  const radius = runtime.config.radius;
  if (pass === "background") {
    fillOutsideCircle(ctx, beacon.x, beacon.y, radius, hexToRgba(EVENT_COLOR, runtime.phase === "active" ? 0.115 : 0.055));
    ctx.save();
    ctx.strokeStyle = hexToRgba(SAFE_COLOR, 0.22);
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 20]);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80 * TAU;
      const x = Math.cos(t) * 520;
      const y = Math.sin(t * 2) * 310;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawBeacon(ctx, beacon.x, beacon.y, radius, runtime.elapsed);
  drawWorldLabel(ctx, beacon.x, beacon.y - radius - 28, runtime.phase === "active" ? "跟随火种" : "迁徙路线同步", SAFE_COLOR);
}

function drawDoomLedger(ctx, runtime, pass) {
  const target = runtime.target;
  if (!target) return;
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = hexToRgba(VOID_COLOR, 0.22);
    ctx.lineWidth = 2;
    let links = 0;
    for (const enemy of world.enemies) {
      if (enemy === target || enemy.dead || links >= 12) continue;
      if (distSq(enemy.x, enemy.y, target.x, target.y) > runtime.config.pullRadius ** 2) continue;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      links++;
    }
    ctx.restore();
    return;
  }
  const urgency = clamp(1 - runtime.targetTimer / runtime.config.sentenceTime, 0, 1);
  drawTargetSigil(ctx, target.x, target.y, runtime.config.detonationRadius, urgency);
  drawWorldLabel(ctx, target.x, target.y - target.r - 54, `替罪倒计时 ${Math.max(0, runtime.targetTimer).toFixed(1)}`, urgency > 0.72 ? EVENT_COLOR : WARNING_COLOR);
}

function drawCausalEchoRoute(ctx, runtime, pass) {
  const points = runtime.path.filter((point) => point.age >= runtime.config.delay && point.age <= runtime.config.delay + runtime.config.memory);
  if (pass !== "background" || points.length < 2) return;
  if (runtime.phase === "active") {
    ctx.fillStyle = hexToRgba(VOID_COLOR, 0.1);
    ctx.fillRect(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  }
  ctx.save();
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "rgba(3,8,18,0.78)";
  ctx.lineWidth = runtime.config.safeWidth * 2 + 18;
  drawPolyline(ctx, points);
  ctx.strokeStyle = hexToRgba(SAFE_COLOR, runtime.phase === "active" ? 0.32 : 0.18);
  ctx.lineWidth = runtime.config.safeWidth * 2;
  drawPolyline(ctx, points);
  ctx.strokeStyle = hexToRgba("#ffffff", 0.58);
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);
  drawPolyline(ctx, points);
  ctx.restore();
}

function drawCeasefireCredit(ctx, runtime, pass) {
  if (pass === "background") {
    ctx.save();
    const color = runtime.phase === "stasis" ? "#42e8ff" : EVENT_COLOR;
    ctx.fillStyle = hexToRgba(color, runtime.phase === "stasis" ? 0.055 : 0.035);
    ctx.fillRect(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
    ctx.strokeStyle = hexToRgba(color, 0.16);
    ctx.lineWidth = 3;
    const step = 240;
    for (let x = -WORLD_SIZE / 2; x <= WORLD_SIZE / 2; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, -WORLD_SIZE / 2);
      ctx.lineTo(x, WORLD_SIZE / 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const p = state.player;
  drawWorldLabel(ctx, p.x, p.y - 96, runtime.phase === "stasis" ? `停火借秒 · ${runtime.frozenCount || 0}` : "债务齐射", runtime.phase === "stasis" ? "#42e8ff" : EVENT_COLOR);
}

function drawSanctuaryQuota(ctx, runtime, pass) {
  const { x, y } = runtime.center;
  const radius = runtime.config.radius;
  const previewSafeInside = runtime.previewCount <= runtime.config.quota;
  const safeInside = runtime.phase === "active" ? !runtime.overcrowded : previewSafeInside;
  if (pass === "background") {
    if (safeInside) fillOutsideCircle(ctx, x, y, radius, hexToRgba(EVENT_COLOR, runtime.phase === "active" ? 0.12 : 0.055));
    else {
      ctx.fillStyle = hexToRgba(EVENT_COLOR, runtime.phase === "active" ? 0.14 : 0.065);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.strokeStyle = hexToRgba(safeInside ? SAFE_COLOR : EVENT_COLOR, 0.72);
    ctx.lineWidth = 6;
    ctx.setLineDash([28, 14]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const label = runtime.phase === "active"
    ? runtime.overcrowded ? "配额超限 · 立即撤离" : "配额通过 · 内圈赦免"
    : `生者计数 ${runtime.previewCount}/${runtime.config.quota}`;
  drawWorldLabel(ctx, x, y - radius - 30, label, safeInside ? SAFE_COLOR : EVENT_COLOR);
}

function drawMercyFaultline(ctx, runtime, pass) {
  const halfLength = WORLD_SIZE * 0.72;
  const dx = Math.cos(runtime.seamAngle) * halfLength;
  const dy = Math.sin(runtime.seamAngle) * halfLength;
  if (pass === "background") {
    ctx.save();
    ctx.strokeStyle = "rgba(3,8,18,0.88)";
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(-dx, -dy);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(SAFE_COLOR, runtime.phase === "active" ? 0.68 : 0.28);
    ctx.lineWidth = 5;
    ctx.setLineDash([32, 18, 6, 18]);
    ctx.beginPath();
    ctx.moveTo(-dx, -dy);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const p = state.player;
  const charge = `${runtime.charge}/${runtime.config.chargeNeeded}`;
  drawWorldLabel(ctx, p.x, p.y - 104, runtime.phase === "active" ? `恩赦断层 · 净化 ${charge}` : "断层正在对齐", SAFE_COLOR);
}

function fillOutsideCircle(ctx, x, y, radius, color) {
  const half = WORLD_SIZE / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(-half, -half, WORLD_SIZE, WORLD_SIZE);
  ctx.arc(x, y, radius, 0, TAU, true);
  ctx.fill("evenodd");
  ctx.restore();
}

function drawBeacon(ctx, x, y, radius, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexToRgba(SAFE_COLOR, 0.62);
  ctx.lineWidth = 5;
  ctx.setLineDash([26, 16]);
  ctx.lineDashOffset = -time * 42;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = hexToRgba(ring === 1 ? WARNING_COLOR : SAFE_COLOR, 0.42 - ring * 0.08);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 + ring * 17 + Math.sin(time * 4 + ring) * 4, 0, TAU);
    ctx.stroke();
  }
  ctx.rotate(time * 0.7);
  ctx.fillStyle = hexToRgba("#ffffff", 0.82);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillRect(42, -3, 18, 6);
  }
  ctx.fillStyle = SAFE_COLOR;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

function drawTargetSigil(ctx, x, y, radius, urgency) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.time * (0.35 + urgency));
  ctx.strokeStyle = hexToRgba(urgency > 0.72 ? EVENT_COLOR : WARNING_COLOR, 0.58 + urgency * 0.28);
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 12]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6);
    ctx.beginPath();
    ctx.moveTo(radius * 0.78, -10);
    ctx.lineTo(radius, 0);
    ctx.lineTo(radius * 0.78, 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPolyline(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawWorldLabel(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = `700 16px ${PIXEL_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 26;
  ctx.fillStyle = "rgba(3,8,18,0.86)";
  ctx.fillRect(x - width / 2, y - 16, width, 32);
  ctx.strokeStyle = hexToRgba(color, 0.78);
  ctx.lineWidth = 2;
  ctx.strokeRect(x - width / 2, y - 16, width, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
