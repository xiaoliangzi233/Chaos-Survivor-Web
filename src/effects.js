import { PARTICLE_LIMIT, TAU } from "./constants.js";
import { state, world } from "./state.js";
import { clamp, hexToRgba } from "./utils.js";

const AMBIENT_LIMIT = 130;
const AMBIENT_MAX_SPAWN = 5;
let ambientTimer = 0;

export function particle(kind, x, y, options = {}) {
  if (world.particles.length >= PARTICLE_LIMIT) world.particles.shift();
  world.particles.push({
    kind,
    x,
    y,
    px: options.px ?? x,
    py: options.py ?? y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    life: options.life ?? 0.35,
    maxLife: options.life ?? 0.35,
    radius: options.radius ?? 20,
    size: options.size ?? 4,
    color: options.color ?? "#42e8ff",
    alpha: options.alpha ?? 1,
    drift: options.drift ?? 0,
    spin: options.spin ?? 0,
    angle: options.angle ?? 0,
    length: options.length ?? 10,
    ambient: Boolean(options.ambient),
    t: 0,
  });
}

export function burst(x, y, count, color, speed = 140) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.35 + Math.random() * 0.9);
    particle("spark", x, y, {
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.28 + Math.random() * 0.35,
      size: 2 + Math.random() * 5,
      color,
    });
  }
}

export function pulse(x, y, radius, color, life = 0.26) {
  particle("ring", x, y, { radius, color, life, size: 2 });
}

export function trail(x, y, px, py, color, size = 5) {
  particle("trail", x, y, { px, py, color, size, life: 0.18 });
}

export function dust(x, y, vx, vy) {
  particle("dust", x, y, {
    vx: vx * 36 + (Math.random() - 0.5) * 24,
    vy: vy * 36 + (Math.random() - 0.5) * 24,
    life: 0.45,
    size: 6 + Math.random() * 8,
    color: "#8fa2a0",
  });
}

export function updateAmbientParticles(dt, viewW, viewH) {
  const map = state.map;
  if (!map || !state.player) return;
  ambientTimer -= dt;
  if (ambientTimer > 0) return;
  ambientTimer = 0.045 + Math.random() * 0.075;
  const ambientCount = world.particles.reduce((sum, p) => sum + (p.ambient ? 1 : 0), 0);
  if (ambientCount >= AMBIENT_LIMIT) return;

  const camX = state.cameraX - viewW / 2;
  const camY = state.cameraY - viewH / 2;
  const spawned = spawnAmbientFromMap(map, camX, camY, viewW, viewH, Math.min(AMBIENT_MAX_SPAWN, AMBIENT_LIMIT - ambientCount));
  if (spawned < 2 && Math.random() < 0.55) spawnAmbientMote(camX, camY, viewW, viewH, map.palette?.accent?.[0] || "#42e8ff");
}

function spawnAmbientFromMap(map, camX, camY, viewW, viewH, budget) {
  let spawned = 0;
  for (let attempts = 0; attempts < 10 && spawned < budget; attempts++) {
    const roll = Math.random();
    if (roll < 0.28 && sampleGlowTile(map, camX, camY, viewW, viewH)) spawned++;
    else if (roll < 0.52 && sampleEnergyLine(map, camX, camY, viewW, viewH)) spawned++;
    else if (roll < 0.78 && sampleProp(map, camX, camY, viewW, viewH)) spawned++;
    else if (sampleFog(map, camX, camY, viewW, viewH)) spawned++;
  }
  return spawned;
}

function sampleGlowTile(map, camX, camY, viewW, viewH) {
  if (!map.tiles?.length) return false;
  const tile = map.tiles[Math.floor(Math.random() * map.tiles.length)];
  if (!tile.glow || !rectVisible(tile.x, tile.y, map.tileSize, map.tileSize, camX, camY, viewW, viewH, 80)) return false;
  const x = tile.x + 18 + Math.random() * (map.tileSize - 36);
  const y = tile.y + 18 + Math.random() * (map.tileSize - 36);
  if (Math.random() < 0.65) spawnAmbientMoteAt(x, y, tile.glow, 0.45);
  else spawnAmbientEmber(x, y, tile.glow);
  return true;
}

function sampleEnergyLine(map, camX, camY, viewW, viewH) {
  if (!map.energyLines?.length) return false;
  const line = map.energyLines[Math.floor(Math.random() * map.energyLines.length)];
  const x = line.x1 + (line.x2 - line.x1) * Math.random();
  const y = line.y1 + (line.y2 - line.y1) * Math.random();
  if (!pointVisible(x, y, camX, camY, viewW, viewH, 90)) return false;
  const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
  if (Math.random() < 0.72) spawnAmbientScan(x, y, angle, line.color || map.palette?.accent?.[0] || "#42e8ff");
  else spawnAmbientEmber(x, y, line.color || "#42e8ff");
  return true;
}

function sampleProp(map, camX, camY, viewW, viewH) {
  if (!map.props?.length) return false;
  const prop = map.props[Math.floor(Math.random() * map.props.length)];
  if (prop.kind === "rubble" || !pointVisible(prop.x, prop.y, camX, camY, viewW, viewH, 120)) return false;
  const angle = Math.random() * TAU;
  const r = prop.size * (0.7 + Math.random() * 1.9);
  const x = prop.x + Math.cos(angle) * r;
  const y = prop.y + Math.sin(angle) * r;
  if (Math.random() < 0.78) spawnAmbientMoteAt(x, y, prop.color || "#77ff8a", 0.55);
  else spawnAmbientEmber(x, y, prop.color || "#77ff8a");
  return true;
}

function sampleFog(map, camX, camY, viewW, viewH) {
  if (!map.fogBanks?.length) return false;
  const fog = map.fogBanks[Math.floor(Math.random() * map.fogBanks.length)];
  if (!pointVisible(fog.x, fog.y, camX, camY, viewW, viewH, Math.max(fog.rx, fog.ry) + 140)) return false;
  const a = Math.random() * TAU;
  const x = fog.x + Math.cos(a) * fog.rx * Math.sqrt(Math.random());
  const y = fog.y + Math.sin(a) * fog.ry * Math.sqrt(Math.random());
  spawnAmbientMist(x, y, fog.color || "#90a7ff");
  return true;
}

function spawnAmbientMote(camX, camY, viewW, viewH, color) {
  spawnAmbientMoteAt(
    camX + Math.random() * viewW,
    camY + Math.random() * viewH,
    color,
    0.28,
  );
}

function spawnAmbientMoteAt(x, y, color, alpha) {
  particle("mote", x, y, {
    vx: (Math.random() - 0.5) * 10,
    vy: -4 - Math.random() * 10,
    life: 2.2 + Math.random() * 2.1,
    size: 1.5 + Math.random() * 2.8,
    color,
    alpha,
    drift: 8 + Math.random() * 18,
    ambient: true,
  });
}

function spawnAmbientEmber(x, y, color) {
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const speed = 18 + Math.random() * 42;
  particle("ember", x, y, {
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    life: 0.75 + Math.random() * 0.75,
    size: 2 + Math.random() * 3,
    color,
    alpha: 0.8,
    drift: 18,
    ambient: true,
  });
}

function spawnAmbientMist(x, y, color) {
  particle("mist", x, y, {
    vx: 10 + Math.random() * 18,
    vy: (Math.random() - 0.5) * 8,
    life: 3.2 + Math.random() * 2.2,
    size: 24 + Math.random() * 46,
    color,
    alpha: 0.16,
    drift: 10,
    ambient: true,
  });
}

function spawnAmbientScan(x, y, angle, color) {
  particle("scan", x, y, {
    vx: Math.cos(angle) * (18 + Math.random() * 36),
    vy: Math.sin(angle) * (18 + Math.random() * 36),
    life: 0.42 + Math.random() * 0.4,
    size: 2,
    length: 16 + Math.random() * 28,
    angle,
    color,
    alpha: 0.72,
    ambient: true,
  });
}

export function updateEffects(dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    if (p.drift) {
      p.vx += Math.sin(p.t * 1.7 + p.x * 0.015) * p.drift * dt;
      p.vy += Math.cos(p.t * 1.3 + p.y * 0.014) * p.drift * 0.45 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.t += dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
}

export function drawEffects(ctx) {
  for (const p of world.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === "ring") {
      ctx.strokeStyle = hexToRgba(p.color, alpha * 0.75);
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (1 - alpha * 0.16), 0, TAU);
      ctx.stroke();
    } else if (p.kind === "trail") {
      const grad = ctx.createLinearGradient(p.px, p.py, p.x, p.y);
      grad.addColorStop(0, hexToRgba(p.color, 0));
      grad.addColorStop(1, hexToRgba(p.color, alpha * 0.55));
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.size * alpha;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else if (p.kind === "dust") {
      ctx.fillStyle = `rgba(143,162,160,${alpha * 0.28})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === "mote") {
      drawMote(ctx, p, alpha);
    } else if (p.kind === "ember") {
      drawEmber(ctx, p, alpha);
    } else if (p.kind === "mist") {
      drawMist(ctx, p, alpha);
    } else if (p.kind === "scan") {
      drawScan(ctx, p, alpha);
    } else {
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
}

function drawMote(ctx, p, alpha) {
  const a = alpha * p.alpha;
  ctx.fillStyle = hexToRgba(p.color, a * 0.55);
  ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, p.size), Math.max(1, p.size));
  ctx.fillStyle = hexToRgba("#ffffff", a * 0.22);
  ctx.fillRect(Math.round(p.x + 1), Math.round(p.y), 1, 1);
}

function drawEmber(ctx, p, alpha) {
  const a = alpha * p.alpha;
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
  grad.addColorStop(0, hexToRgba("#ffffff", a * 0.55));
  grad.addColorStop(0.32, hexToRgba(p.color, a * 0.5));
  grad.addColorStop(1, hexToRgba(p.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hexToRgba(p.color, a);
  ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, p.size), Math.max(1, p.size));
}

function drawMist(ctx, p, alpha) {
  const a = alpha * p.alpha;
  ctx.fillStyle = hexToRgba(p.color, a);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.size * 1.6, p.size * 0.55, Math.sin(p.t) * 0.18, 0, TAU);
  ctx.fill();
}

function drawScan(ctx, p, alpha) {
  const a = alpha * p.alpha;
  const ca = Math.cos(p.angle);
  const sa = Math.sin(p.angle);
  const x1 = p.x - ca * p.length * 0.45;
  const y1 = p.y - sa * p.length * 0.45;
  const x2 = p.x + ca * p.length * 0.55;
  const y2 = p.y + sa * p.length * 0.55;
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, hexToRgba(p.color, 0));
  grad.addColorStop(0.5, hexToRgba("#ffffff", a * 0.6));
  grad.addColorStop(1, hexToRgba(p.color, a * 0.65));
  ctx.strokeStyle = grad;
  ctx.lineWidth = p.size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function pointVisible(x, y, camX, camY, viewW, viewH, pad = 0) {
  return x >= camX - pad && x <= camX + viewW + pad && y >= camY - pad && y <= camY + viewH + pad;
}

function rectVisible(x, y, w, h, camX, camY, viewW, viewH, pad = 0) {
  return x + w >= camX - pad && x <= camX + viewW + pad && y + h >= camY - pad && y <= camY + viewH + pad;
}
