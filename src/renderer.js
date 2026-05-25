import { CAMERA_ZOOM, TAU, WORLD_SIZE } from "./constants.js";
import { state, world, input } from "./state.js";
import { clamp, hexToRgba } from "./utils.js";
import { drawMap } from "./map.js";
import { drawEffects } from "./effects.js";

export const viewport = { width: 1, height: 1, dpr: 1 };

export function resizeCanvas(canvas, ctx) {
  viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.width = Math.max(320, Math.floor(window.innerWidth));
  viewport.height = Math.max(420, Math.floor(window.innerHeight));
  canvas.width = Math.floor(viewport.width * viewport.dpr);
  canvas.height = Math.floor(viewport.height * viewport.dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

export function updateCamera(dt) {
  const p = state.player;
  const tx = clampCameraX(p.x);
  const ty = clampCameraY(p.y);
  state.cameraX += (tx - state.cameraX) * Math.min(1, dt * 8);
  state.cameraY += (ty - state.cameraY) * Math.min(1, dt * 8);
  state.cameraX = clampCameraX(state.cameraX);
  state.cameraY = clampCameraY(state.cameraY);
}

export function render(ctx) {
  const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
  const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
  const viewW = visibleWorldWidth();
  const viewH = visibleWorldHeight();
  const camX = clampViewX(state.cameraX - viewW / 2 - sx / CAMERA_ZOOM);
  const camY = clampViewY(state.cameraY - viewH / 2 - sy / CAMERA_ZOOM);

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "#060912";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
  ctx.translate(-camX, -camY);
  drawMap(ctx, state.map, camX, camY, viewW, viewH, state.time);
  drawBounds(ctx);
  drawGems(ctx);
  drawProjectiles(ctx);
  for (const e of world.enemies) if (inView(e.x, e.y, e.r + 80)) e.draw(ctx);
  drawOrbitOrbs(ctx);
  drawPlayer(ctx);
  drawEnemyProjectiles(ctx);
  drawHazards(ctx);
  drawEffects(ctx);
  ctx.restore();
  drawBossBar(ctx);
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,77,109,${state.flash * 0.18})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }
}

function drawBounds(ctx) {
  const half = WORLD_SIZE / 2;
  ctx.strokeStyle = "rgba(255,77,109,0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(-half, -half, WORLD_SIZE, WORLD_SIZE);
}

function drawPlayer(ctx) {
  const p = state.player;
  const moving = input.up || input.down || input.left || input.right || Math.abs(input.vx) > 0.05 || Math.abs(input.vy) > 0.05;
  const hurt = p.invuln > 0;
  const low = p.hp / p.maxHp < 0.35;
  const mood = hurt ? "hurt" : low ? "worried" : moving ? "happy" : ["blink", "smile", "curious", "happy"][Math.floor(state.time * 1.15) % 4];
  const bob = Math.sin(state.time * 7) * (moving ? 2.2 : 1.1);
  const squash = 1 + Math.sin(state.time * 5) * 0.025;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 20, 24, 8, 0, 0, TAU); ctx.fill();
  drawDashedCircle(ctx, 0, 0, p.magnet, "rgba(90,140,210,0.38)");
  glow(ctx, 0, 0, 24, hurt ? 0.32 : 0.42, hurt ? "#ff9ab0" : "#ffd6a8");
  ctx.scale(1.02, squash);
  ctx.fillStyle = hurt ? "#ffd7dd" : "#ffd6a8";
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffbd8a";
  ctx.beginPath(); ctx.arc(-13, 5, 5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(13, 5, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = "#fff4d8";
  ctx.beginPath(); ctx.arc(-7, -9, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -9, 7, 0, TAU); ctx.fill();
  drawPlayerEyes(ctx, mood);
  drawPlayerMouth(ctx, mood);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath(); ctx.arc(-8, -13, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f3b05f";
  ctx.beginPath(); ctx.arc(0, -1, 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#7b4a2b";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawPlayerEyes(ctx, mood) {
  ctx.strokeStyle = "#2a1d18";
  ctx.fillStyle = "#2a1d18";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  if (mood === "blink") {
    ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-5, -5); ctx.moveTo(5, -5); ctx.lineTo(12, -5); ctx.stroke();
  } else if (mood === "happy") {
    ctx.beginPath(); ctx.arc(-8, -6, 4, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, -6, 4, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
  } else if (mood === "hurt") {
    ctx.beginPath();
    ctx.moveTo(-12, -9); ctx.lineTo(-5, -3); ctx.moveTo(-5, -9); ctx.lineTo(-12, -3);
    ctx.moveTo(5, -9); ctx.lineTo(12, -3); ctx.moveTo(12, -9); ctx.lineTo(5, -3);
    ctx.stroke();
  } else if (mood === "worried") {
    ctx.fillRect(-11, -6, 5, 6); ctx.fillRect(6, -6, 5, 6);
    ctx.strokeStyle = "#7b4a2b";
    ctx.beginPath(); ctx.moveTo(-13, -12); ctx.lineTo(-5, -10); ctx.moveTo(5, -10); ctx.lineTo(13, -12); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(-8, -6, 3.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -6, 3.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(-7, -8, 1.6, 1.6); ctx.fillRect(9, -8, 1.6, 1.6);
  }
}

function drawPlayerMouth(ctx, mood) {
  ctx.strokeStyle = "#7b2f2f";
  ctx.fillStyle = "#7b2f2f";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (mood === "hurt") {
    ctx.beginPath(); ctx.arc(0, 8, 4, 0, TAU); ctx.stroke();
  } else if (mood === "worried") {
    ctx.beginPath(); ctx.arc(0, 12, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else if (mood === "curious") {
    ctx.beginPath(); ctx.arc(0, 8, 3, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, 4, 8, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
  }
}

function drawProjectiles(ctx) {
  for (const b of world.projectiles) {
    if (!inView(b.x, b.y, 60)) continue;
    const tail = b.shape === "missile" ? 58 : b.shape === "dagger" ? 30 : 44;
    const tx = b.x - Math.cos(b.angle) * tail;
    const ty = b.y - Math.sin(b.angle) * tail;
    const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
    grad.addColorStop(0, hexToRgba(b.color, 0));
    grad.addColorStop(1, "#fff");
    ctx.strokeStyle = grad; ctx.lineWidth = b.shape === "dagger" ? 4 : 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineCap = "butt";
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle + (b.shape === "boomerang" ? state.time * 18 : 0));
    if (b.shape === "boomerang") star(ctx, b.r * 2, b.color);
    else diamond(ctx, b.r * 2.6, b.r, b.color);
    ctx.restore();
  }
}

function drawOrbitOrbs(ctx) {
  const w = state.weapons.orb;
  if (!w || w.level <= 0) return;
  const p = state.player;
  for (let i = 0; i < w.count; i++) {
    const a = w.angle + (i / w.count) * TAU;
    const x = p.x + Math.cos(a) * w.radius;
    const y = p.y + Math.sin(a) * w.radius;
    glow(ctx, x, y, 14, 0.6, "#ffd166");
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
  }
}

function drawGems(ctx) {
  for (const g of world.gems) {
    if (!inView(g.x, g.y, 40)) continue;
    ctx.fillStyle = g.value >= 15 ? "#b48cff" : g.value >= 8 ? "#77ff8a" : "#42e8ff";
    diamondAt(ctx, g.x, g.y + Math.sin(state.time * 6 + g.phase) * 2, 6);
  }
}

function drawEnemyProjectiles(ctx) {
  for (const b of world.enemyProjectiles) {
    if (b.shape === "snowflake") {
      drawSnowflakeProjectile(ctx, b);
      continue;
    }
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
  }
}

function drawSnowflakeProjectile(ctx, b) {
  const spin = (b.spin || 0) + state.time * 7;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(spin);
  glow(ctx, 0, 0, b.r * 1.5, 0.42, b.color);
  ctx.strokeStyle = "#dffcff";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const len = b.r * 2.15;
    ctx.beginPath();
    ctx.moveTo(ca * 2, sa * 2);
    ctx.lineTo(ca * len, sa * len);
    ctx.stroke();
    const bx = Math.cos(a - 0.55) * b.r * 1.2;
    const by = Math.sin(a - 0.55) * b.r * 1.2;
    const cx = ca * b.r * 1.2;
    const cy = sa * b.r * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + bx * 0.38, cy + by * 0.38);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a + 0.55) * b.r * 0.46, cy + Math.sin(a + 0.55) * b.r * 0.46);
    ctx.stroke();
  }
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 0.62, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawHazards(ctx) {
  for (const h of world.hazards) {
    const alpha = Math.max(0, h.life / h.maxLife);
    ctx.fillStyle = hexToRgba(h.color, alpha * 0.18);
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexToRgba(h.color, alpha * 0.7);
    ctx.lineWidth = 2; ctx.stroke();
  }
}

function drawBossBar(ctx) {
  const b = world.boss;
  if (!b || b.dead) return;
  const w = Math.min(620, viewport.width - 48);
  const x = (viewport.width - w) / 2;
  const y = 72;
  ctx.fillStyle = "rgba(6,9,18,0.78)";
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, b.hp / b.maxHp), 14);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.strokeRect(x, y, w, 18);
  ctx.fillStyle = "#f3f7ff";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${b.name} · ${b.trait}`, viewport.width / 2, y - 8);
}

function inView(x, y, pad) {
  return Math.abs(x - state.cameraX) < visibleWorldWidth() / 2 + pad && Math.abs(y - state.cameraY) < visibleWorldHeight() / 2 + pad;
}

function visibleWorldWidth() { return viewport.width / CAMERA_ZOOM; }
function visibleWorldHeight() { return viewport.height / CAMERA_ZOOM; }
function clampCameraX(x) { const h = WORLD_SIZE / 2, v = visibleWorldWidth() / 2; return clamp(x, -h + v, h - v); }
function clampCameraY(y) { const h = WORLD_SIZE / 2, v = visibleWorldHeight() / 2; return clamp(xOr(y), -h + v, h - v); }
function xOr(v) { return v; }
function clampViewX(x) { const h = WORLD_SIZE / 2; return clamp(x, -h, h - visibleWorldWidth()); }
function clampViewY(y) { const h = WORLD_SIZE / 2; return clamp(y, -h, h - visibleWorldHeight()); }

function glow(ctx, x, y, r, alpha, color) { for (let i = 3; i >= 1; i--) { ctx.fillStyle = hexToRgba(color, alpha / (i * 2.2)); ctx.beginPath(); ctx.arc(x, y, r * (1 + i * 0.32), 0, TAU); ctx.fill(); } }
function polygon(ctx, x, y, r, sides, angle, color, fill) { ctx.beginPath(); for (let i = 0; i < sides; i++) { const a = angle + (i / sides) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); } }
function drawArrow(ctx, angle, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(Math.cos(angle) * (r + 12), Math.sin(angle) * (r + 12)); ctx.lineTo(Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * 5, Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * 5); ctx.lineTo(Math.cos(angle) * r - Math.cos(angle + Math.PI / 2) * 5, Math.sin(angle) * r - Math.sin(angle + Math.PI / 2) * 5); ctx.fill(); }
function drawDashedCircle(ctx, x, y, r, color) { ctx.strokeStyle = color; ctx.lineWidth = 1; for (let i = 0; i < 18; i += 2) { const a1 = (i / 18) * TAU, a2 = a1 + TAU / 18 * 0.55; ctx.beginPath(); ctx.moveTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r); ctx.lineTo(x + Math.cos(a2) * r, y + Math.sin(a2) * r); ctx.stroke(); } }
function diamond(ctx, len, w, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(0, w); ctx.lineTo(-len * 0.35, 0); ctx.lineTo(0, -w); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke(); }
function star(ctx, r, color) { ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU, rr = i % 2 ? r * 0.35 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke(); }
function diamondAt(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); }
