import { TAU, WORLD_SIZE } from "./constants.js";
import { input, state, world } from "./state.js";
import { clamp, distSq, hexToRgba } from "./utils.js";
import { burst, particle, pulse } from "./effects.js";
import { playSfx } from "./audio.js";

const BASE_RADIUS = 94;
const MAX_RADIUS = 184;
const BASE_PULL = 285;
const BASE_DAMAGE = 8;
const BASE_LIFE = 7.2;
const MAX_LIFE = 10.5;

export function summonOrEmpowerBlackhole(x, y, dirX, dirY, color = "#8d6bff") {
  const half = WORLD_SIZE / 2;
  const len = Math.max(1, Math.hypot(dirX, dirY));
  const nx = dirX / len;
  const ny = dirY / len;
  if (!world.blackhole) {
    world.blackhole = {
      x: clamp(x, -half + BASE_RADIUS, half - BASE_RADIUS),
      y: clamp(y, -half + BASE_RADIUS, half - BASE_RADIUS),
      vx: nx,
      vy: ny,
      r: BASE_RADIUS,
      level: 1,
      pull: BASE_PULL,
      damage: BASE_DAMAGE,
      life: BASE_LIFE,
      maxLife: BASE_LIFE,
      color,
      spin: Math.random() * TAU,
      pulse: 1,
      damageTick: 0,
    };
    pulse(x, y, BASE_RADIUS, color, 0.42);
    burst(x, y, 18, color, 190);
    playSfx("wave");
    return world.blackhole;
  }

  const h = world.blackhole;
  h.level = Math.min(6, h.level + 1);
  h.r = Math.min(MAX_RADIUS, h.r + 18);
  h.pull += 38;
  h.damage += 3;
  h.life = Math.min(MAX_LIFE, h.life + 1.7);
  h.maxLife = Math.max(h.maxLife, h.life);
  h.vx = nx;
  h.vy = ny;
  h.color = color;
  h.pulse = 1;
  pulse(h.x, h.y, h.r + 20, color, 0.34);
  burst(h.x, h.y, 12 + h.level * 3, color, 210);
  playSfx("level");
  return h;
}

export function updateBlackhole(dt) {
  const h = world.blackhole;
  if (!h || !state.player) return;
  h.life -= dt;
  h.spin += dt * (1.45 + h.level * 0.22);
  h.pulse = Math.max(0, h.pulse - dt * 2.6);

  const speed = Math.max(20, 76 - h.level * 9 - h.r * 0.08);
  const dx = state.player.x - h.x;
  const dy = state.player.y - h.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  h.vx = h.vx * 0.94 + (dx / d) * 0.06;
  h.vy = h.vy * 0.94 + (dy / d) * 0.06;
  h.x += h.vx * speed * dt;
  h.y += h.vy * speed * dt;
  const half = WORLD_SIZE / 2;
  h.x = clamp(h.x, -half + h.r, half - h.r);
  h.y = clamp(h.y, -half + h.r, half - h.r);

  pullBody(state.player, h, dt, 1.0, 1.46);
  state.player.x = clamp(state.player.x, -half + state.player.r, half - state.player.r);
  state.player.y = clamp(state.player.y, -half + state.player.r, half - state.player.r);

  h.damageTick -= dt;
  if (h.damageTick <= 0) {
    h.damageTick = 0.25;
    damagePlayerInBlackhole(h);
  }

  if (Math.random() < dt * (10 + h.level * 2)) spawnAccretionParticle(h);

  if (h.life <= 0) collapseBlackhole(h);
}

function pullBody(body, h, dt, mul, rangeMul = 1.55) {
  const dx = h.x - body.x;
  const dy = h.y - body.y;
  const d2 = dx * dx + dy * dy;
  const range = h.r * rangeMul;
  if (d2 > range * range) return;
  const d = Math.max(1, Math.sqrt(d2));
  const falloff = 1 - d / range;
  const escape = playerEscapeResistance(dx, dy, d);
  const innerDamp = d < h.r * 0.48 ? 0.72 : 1;
  const pull = h.pull * (0.1 + falloff * falloff * 0.82) * escape * innerDamp * mul;
  body.x += (dx / d) * pull * dt;
  body.y += (dy / d) * pull * dt;
}

function playerEscapeResistance(toHoleX, toHoleY, distance) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.vx;
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.vy;
  const m = Math.hypot(mx, my);
  if (m <= 0.05) return 1;
  mx /= m;
  my /= m;
  const awayX = -toHoleX / distance;
  const awayY = -toHoleY / distance;
  const awayIntent = Math.max(0, mx * awayX + my * awayY);
  return 1 - awayIntent * 0.68;
}

function damagePlayerInBlackhole(h) {
  const p = state.player;
  const d2 = distSq(h.x, h.y, p.x, p.y);
  if (d2 > (h.r + p.r) * (h.r + p.r)) return;
  const d = Math.sqrt(d2);
  const inner = d < h.r * 0.48;
  const damage = h.damage * (inner ? 0.46 : 0.26);
  p.hp -= damage;
  state.flash = Math.max(state.flash, inner ? 0.2 : 0.12);
  state.shake = Math.max(state.shake, inner ? 8 : 4);
  playSfx("hurt");
}

function spawnAccretionParticle(h) {
  const a = Math.random() * TAU;
  const r = h.r * (0.78 + Math.random() * 0.9);
  const x = h.x + Math.cos(a) * r;
  const y = h.y + Math.sin(a) * r * 0.56;
  particle("scan", x, y, {
    vx: -Math.sin(a) * 38,
    vy: Math.cos(a) * 20,
    life: 0.32 + Math.random() * 0.28,
    size: 1.5,
    length: 16 + h.level * 2,
    angle: a + Math.PI / 2,
    color: h.color,
    alpha: 0.82,
  });
}

function collapseBlackhole(h) {
  pulse(h.x, h.y, h.r + 24, h.color, 0.38);
  burst(h.x, h.y, 28, h.color, 230);
  world.blackhole = null;
  playSfx("explode");
}

export function drawBlackhole(ctx) {
  const h = world.blackhole;
  if (!h) return;
  const k = clamp(h.life / Math.max(1, h.maxLife), 0, 1);
  const pulseScale = 1 + h.pulse * 0.16 + Math.sin(h.spin * 2) * 0.025;
  const r = h.r * pulseScale;
  ctx.save();
  ctx.translate(h.x, h.y);
  drawLens(ctx, h, r, k);
  drawAccretionDisk(ctx, h, r);
  drawEventHorizon(ctx, h, r);
  drawRunes(ctx, h, r);
  ctx.restore();
}

function drawLens(ctx, h, r, k) {
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = hexToRgba(i ? "#ffffff" : h.color, (0.18 - i * 0.035) * k);
    ctx.lineWidth = 2 + i;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1.18 + i * 0.18), r * (0.82 + i * 0.08), h.spin * 0.18 + i * 0.4, 0, TAU);
    ctx.stroke();
  }
}

function drawAccretionDisk(ctx, h, r) {
  ctx.save();
  ctx.rotate(h.spin);
  ctx.scale(1, 0.42);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = hexToRgba(i === 0 ? "#ffffff" : h.color, i === 0 ? 0.62 : 0.38);
    ctx.lineWidth = i === 0 ? 3 : 5;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.78 + i * 0.15), Math.PI * 0.08 + i * 0.35, Math.PI * 1.62 + i * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEventHorizon(ctx, h, r) {
  const g = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r * 0.56);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.58, "rgba(0,0,0,0.98)");
  g.addColorStop(0.82, hexToRgba(h.color, 0.52));
  g.addColorStop(1, hexToRgba("#ffffff", 0.16));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ffffff", 0.28 + h.pulse * 0.36);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.stroke();
}

function drawRunes(ctx, h, r) {
  ctx.save();
  ctx.rotate(-h.spin * 0.6);
  ctx.strokeStyle = hexToRgba(h.color, 0.42 + h.pulse * 0.22);
  ctx.lineWidth = 2;
  const count = 7 + h.level;
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU;
    const rr = r * 0.96;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(x, y, 5, a, a + Math.PI * 1.1);
    ctx.stroke();
  }
  ctx.restore();
}
