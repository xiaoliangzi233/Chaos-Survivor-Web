import { CAMERA_ZOOM, PARTICLE_LIMIT, TAU } from "./constants.js";
import { getSetting } from "./systems/settings.js";
import { state, world } from "./state.js";
import { viewport } from "./systems/renderer.js";
import { clamp, hexToRgba } from "./utils.js";

const AMBIENT_LIMIT = 56;
const AMBIENT_MAX_SPAWN = 2;
const FX_PARTICLE_SCALE = 0.72;
const FX_ALPHA_SCALE = 0.7;
const FX_TRAIL_ALPHA_SCALE = 0.62;
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
    seed: options.seed ?? Math.random() * 999,
    text: options.text ?? "",
    critical: Boolean(options.critical),
    ambient: Boolean(options.ambient),
    t: 0,
  });
}

export function burst(x, y, count, color, speed = 140) {
  const scaledCount = Math.max(1, Math.ceil(count * FX_PARTICLE_SCALE));
  for (let i = 0; i < scaledCount; i++) {
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
  particle("ring", x, y, { radius: radius * 0.94, color, life: life * 0.82, size: 1.6, alpha: FX_ALPHA_SCALE });
}

export function trail(x, y, px, py, color, size = 5) {
  particle("trail", x, y, { px, py, color, size: size * 0.82, life: 0.14, alpha: FX_TRAIL_ALPHA_SCALE });
}

export function spawnDamageText(amount, target, options = {}) {
  if (!getSetting("showDamageNumbers")) return null;
  if (!target || target.dead) return null;
  world.damageTexts.push({
    x: target.x + (Math.random() - 0.5) * 16,
    y: target.y - target.r - 4,
    vx: (Math.random() - 0.5) * 30,
    vy: -60 - Math.random() * 40,
    text: String(Math.round(amount)),
    life: 0.7 + Math.random() * 0.3,
    maxLife: 0.7 + Math.random() * 0.3,
    size: options.critical ? 25 : 21,
    critical: Boolean(options.critical),
  });
  return null;
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
  ambientTimer = 0.09 + Math.random() * 0.12;
  let ambientCount = 0;
  for (const p of world.particles) if (p.ambient) ambientCount++;
  if (ambientCount >= AMBIENT_LIMIT) return;

  const camX = state.cameraX - viewW / 2;
  const camY = state.cameraY - viewH / 2;
  const spawned = spawnAmbientFromMap(map, camX, camY, viewW, viewH, Math.min(AMBIENT_MAX_SPAWN, AMBIENT_LIMIT - ambientCount));
  if (spawned < 2 && Math.random() < 0.55) spawnAmbientMote(camX, camY, viewW, viewH, map.palette?.accent?.[0] || "#42e8ff");
}

function spawnAmbientFromMap(map, camX, camY, viewW, viewH, budget) {
  let spawned = 0;
  for (let attempts = 0; attempts < 6 && spawned < budget; attempts++) {
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
  const tw = tile.w || map.tileSize;
  const th = tile.h || map.tileSize;
  if (!tile.glow || !rectVisible(tile.x, tile.y, tw, th, camX, camY, viewW, viewH, 80)) return false;
  const x = tile.x + 12 + Math.random() * Math.max(8, tw - 24);
  const y = tile.y + 12 + Math.random() * Math.max(8, th - 24);
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
  const color = prop.color || map.palette?.accent?.[0] || "#42e8ff";
  const angle = Math.random() * TAU;
  const r = prop.size * (0.45 + Math.random() * 1.35);
  const x = prop.x + Math.cos(angle) * r;
  const y = prop.y + Math.sin(angle) * r;
  if (prop.kind === "ventPipe" || prop.kind === "cryoPod" || prop.kind === "coolantTank" || prop.kind === "cryoArray") {
    spawnAmbientMist(x, y, color, prop.kind === "cryoPod" ? 0.065 : 0.05);
  } else if (prop.kind === "bioCanister" || prop.kind === "containmentChamber") {
    if (Math.random() < 0.74) spawnAmbientMist(x, y, color, 0.062);
    else spawnAmbientMoteAt(x, y, color, 0.28);
  } else if (prop.kind === "wallLight" || prop.kind === "overheadLightRig" || prop.kind === "deconGate") {
    if (Math.random() < 0.72) spawnAmbientMoteAt(x, y, color, 0.42);
    else spawnAmbientEmber(x, y, color, 0.55);
  } else if (prop.kind === "terminal" || prop.kind === "reactorCore" || prop.kind === "serverCabinet" || prop.kind === "serverWall" || prop.kind === "commandConsole" || prop.kind === "largeGenerator" || prop.kind === "labBench") {
    spawnAmbientScan(x, y, prop.rot || Math.random() * TAU, color);
  } else if (prop.kind === "hangingCable") {
    if (Math.random() < 0.62) spawnAmbientEmber(x, y, "#ff7a1a", 0.5);
    else spawnAmbientMoteAt(x, y, "#9aa7b4", 0.16);
  } else if (prop.kind === "brokenRack" || prop.kind === "crateStack" || prop.kind === "brokenGlass") {
    if (Math.random() < 0.55) spawnAmbientMoteAt(x, y, "#9aa7b4", 0.16);
    else spawnAmbientEmber(x, y, "#ff7a1a", 0.42);
  } else if (Math.random() < 0.78) spawnAmbientMoteAt(x, y, color, 0.38);
  else spawnAmbientEmber(x, y, color);
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

function spawnAmbientEmber(x, y, color, alpha = 0.8) {
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const speed = 18 + Math.random() * 42;
  particle("ember", x, y, {
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    life: 0.75 + Math.random() * 0.75,
    size: 2 + Math.random() * 3,
    color,
    alpha,
    drift: 18,
    ambient: true,
  });
}

function spawnAmbientMist(x, y, color, alpha = 0.075) {
  particle("mist", x, y, {
    vx: 4 + Math.random() * 10,
    vy: (Math.random() - 0.5) * 5,
    life: 3.2 + Math.random() * 2.4,
    size: 22 + Math.random() * 38,
    color,
    alpha,
    drift: 6,
    angle: Math.random() * TAU,
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
  const viewW = (window.innerWidth || 1280) / CAMERA_ZOOM;
  const viewH = (window.innerHeight || 720) / CAMERA_ZOOM;
  const maxDx = viewW * 0.75 + 520;
  const maxDy = viewH * 0.75 + 520;
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
    if (p.life <= 0 || (p.ambient && (Math.abs(p.x - state.cameraX) > maxDx || Math.abs(p.y - state.cameraY) > maxDy))) world.particles.splice(i, 1);
  }
}

export function drawEffects(ctx) {
  const viewW = (window.innerWidth || 1280) / CAMERA_ZOOM;
  const viewH = (window.innerHeight || 720) / CAMERA_ZOOM;
  const maxDx = viewW * 0.65 + 180;
  const maxDy = viewH * 0.65 + 180;
  for (const p of world.particles) {
    if (Math.abs(p.x - state.cameraX) > maxDx || Math.abs(p.y - state.cameraY) > maxDy) continue;
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
    } else if (p.kind === "healPlus") {
      drawHealPlus(ctx, p, alpha);
    } else if (p.kind === "damageText") {
      drawDamageText(ctx, p, alpha);
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

function drawDamageText(ctx, p, alpha) {
  const a = alpha * p.alpha;
  const s = Math.max(12, p.size);
  const progress = clamp(p.t / Math.max(0.001, p.maxLife), 0, 1);
  const punch = p.critical
    ? 1 + Math.max(0, 1 - progress * 4.2) * 0.44
    : 1 + Math.max(0, 1 - progress * 4.8) * 0.14;
  const lift = Math.sin(progress * Math.PI) * (p.critical ? 5 : 3);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y - lift));
  ctx.scale(punch, punch);
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = hexToRgba(p.critical ? "#ff174d" : "#ffd166", a * 0.45);
  ctx.shadowBlur = p.critical ? 8 : 4;
  ctx.font = `${s}px "Zpix", "Fusion Pixel 12px Monospaced SC", "Cubic 11", "Press Start 2P", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = p.critical ? 8 : 6;
  ctx.strokeStyle = `rgba(1,3,10,${a * 0.96})`;
  ctx.strokeText(p.text, 0, 0);
  ctx.lineWidth = p.critical ? 4 : 3;
  ctx.strokeStyle = hexToRgba(p.critical ? "#ffffff" : "#5b2b00", a * (p.critical ? 0.78 : 0.52));
  ctx.strokeText(p.text, 0, 0);
  ctx.fillStyle = hexToRgba(p.color, a);
  ctx.fillText(p.text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = hexToRgba("#ffffff", a * (p.critical ? 0.95 : 0.68));
  ctx.fillRect(-s * 0.28, -s * 0.55, Math.max(3, s * 0.26), p.critical ? 3 : 2);
  if (p.critical) {
    ctx.font = `${Math.max(8, s * 0.34)}px "Zpix", "Fusion Pixel 12px Monospaced SC", "Courier New", monospace`;
    ctx.fillStyle = hexToRgba("#ffffff", a * 0.86);
    ctx.fillText("CRIT", 0, -s * 0.95);
  }
  ctx.restore();
}

function drawHealPlus(ctx, p, alpha) {
  const a = alpha * p.alpha;
  const s = Math.max(5, p.size);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = hexToRgba(p.color, a * 0.72);
  ctx.lineWidth = Math.max(2, s * 0.24);
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, 0);
  ctx.lineTo(s * 0.55, 0);
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(0, s * 0.55);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#ffffff", a * 0.62);
  ctx.lineWidth = 1;
  ctx.strokeRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
  ctx.restore();
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
  grad.addColorStop(0, hexToRgba("#ffffff", a * 0.26));
  grad.addColorStop(0.32, hexToRgba(p.color, a * 0.34));
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
  const wobble = Math.sin(p.t * 0.7 + p.seed) * 0.08;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + wobble);
  drawMistBlob(ctx, 0, 0, p.size * 1.45, p.size * 0.64, p.color, a * 0.34);
  for (let i = 0; i < 2; i++) {
    const localSeed = p.seed + i * 2.37;
    const ox = Math.sin(localSeed + p.t * 0.18) * p.size * (0.34 + i * 0.035);
    const oy = Math.cos(localSeed * 1.31 + p.t * 0.14) * p.size * 0.22;
    const r = p.size * (0.28 + (i % 3) * 0.08);
    drawMistBlob(ctx, ox, oy, r * 1.1, r * 0.74, p.color, a * (0.2 - i * 0.025));
  }
  ctx.restore();
}

function drawMistBlob(ctx, x, y, rx, ry, color, alpha) {
  const radius = Math.max(rx, ry);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, hexToRgba(color, alpha));
  g.addColorStop(0.45, hexToRgba(color, alpha * 0.42));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx / radius, ry / radius);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
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
  grad.addColorStop(0.5, hexToRgba("#ffffff", a * 0.32));
  grad.addColorStop(1, hexToRgba(p.color, a * 0.42));
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

export function updateDamageTexts(dt) {
  if (!world.damageTexts) return;
  for (let i = world.damageTexts.length - 1; i >= 0; i--) {
    const dt2 = world.damageTexts[i];
    dt2.life -= dt;
    if (dt2.life <= 0) {
      world.damageTexts.splice(i, 1);
      continue;
    }
    dt2.y += dt2.vy * dt;
    dt2.x += dt2.vx * dt;
  }
}

const DAMAGE_FONT = "'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Press Start 2P', 'Pixelify Sans', 'Silkscreen', 'Courier New', monospace";

export function drawDamageTexts(ctx, cx, cy, zoom) {
  if (!world.damageTexts) return;
  for (const dt2 of world.damageTexts) {
    const alpha = Math.max(0, dt2.life / dt2.maxLife);
    const screenX = (dt2.x - cx) * zoom;
    const screenY = (dt2.y - cy) * zoom;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold " + dt2.size + "px " + DAMAGE_FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = dt2.critical ? "#ffd166" : "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeText(dt2.text, screenX, screenY);
    ctx.fillText(dt2.text, screenX, screenY);
    ctx.restore();
  }
}

