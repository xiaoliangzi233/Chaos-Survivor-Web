import { TAU } from "../constants.js";
import { ENVIRONMENT_THEME, visualSeedFrom } from "./environmentTheme.js";

export function drawGroundShadow(ctx, { x = 0, y = 0, width = 120, height = 34, alpha = 0.34 } = {}) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, width * 0.56);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gradient.addColorStop(0.58, `rgba(0,0,0,${alpha * 0.72})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.scale(1, Math.max(0.12, height / Math.max(1, width)));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y * Math.max(1, width / Math.max(1, height)), width * 0.56, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawMachineShell(ctx, {
  x = 0,
  y = 0,
  width = 120,
  height = 80,
  depth = 12,
  color = ENVIRONMENT_THEME.palette.navigation,
  cut = 10,
  active = false,
} = {}) {
  ctx.save();
  ctx.translate(x, y);
  const top = -height;
  const bottom = 0;
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  chamferPath(ctx, -width / 2 + depth * 0.45, top + depth, width, height, cut);
  ctx.fill();
  const body = ctx.createLinearGradient(0, top, 0, bottom);
  body.addColorStop(0, ENVIRONMENT_THEME.palette.armor);
  body.addColorStop(0.34, ENVIRONMENT_THEME.palette.shellRaised);
  body.addColorStop(1, ENVIRONMENT_THEME.palette.shell);
  ctx.fillStyle = body;
  ctx.strokeStyle = active ? rgba(color, 0.82) : ENVIRONMENT_THEME.palette.seam;
  ctx.lineWidth = active ? 3 : 2;
  chamferPath(ctx, -width / 2, top, width, height, cut);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgba(color, active ? 0.18 : 0.09);
  chamferPath(ctx, -width / 2 + 7, top + 7, width - 14, Math.max(12, height * 0.2), Math.max(3, cut - 4));
  ctx.fill();
  ctx.strokeStyle = "rgba(225,248,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-width / 2 + cut + 5, top + 5);
  ctx.lineTo(width / 2 - cut - 5, top + 5);
  ctx.stroke();
  drawRivets(ctx, width, height, cut, active ? color : ENVIRONMENT_THEME.palette.muted);
  ctx.restore();
}

export function drawPanelSurface(ctx, {
  x = 0,
  y = 0,
  width = 96,
  height = 50,
  color = ENVIRONMENT_THEME.palette.navigation,
  seed = 1,
  active = false,
} = {}) {
  const resolvedSeed = visualSeedFrom(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(2,8,14,0.88)";
  ctx.strokeStyle = rgba(color, active ? 0.76 : 0.36);
  ctx.lineWidth = active ? 2 : 1;
  chamferPath(ctx, -width / 2, -height / 2, width, height, Math.min(8, height * 0.18));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgba(color, active ? 0.48 : 0.22);
  const rows = 2 + resolvedSeed % 3;
  for (let row = 0; row < rows; row++) {
    const lineWidth = width * (0.24 + ((resolvedSeed >>> (row * 3)) & 7) * 0.055);
    ctx.fillRect(-width * 0.38, -height * 0.28 + row * height * 0.18, lineWidth, Math.max(2, height * 0.045));
  }
  ctx.fillStyle = active ? "rgba(238,252,255,0.76)" : rgba(color, 0.42);
  ctx.fillRect(width * 0.26, -height * 0.29, width * 0.1, height * 0.1);
  ctx.restore();
}

export function drawEmissiveStrip(ctx, {
  x = 0,
  y = 0,
  width = 90,
  height = 5,
  color = ENVIRONMENT_THEME.palette.navigation,
  intensity = 0.55,
  segments = 5,
} = {}) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + intensity * 15;
  const gap = Math.max(2, width * 0.025);
  const segmentWidth = (width - gap * (segments - 1)) / segments;
  for (let index = 0; index < segments; index++) {
    ctx.fillStyle = rgba(color, intensity * (index % 2 ? 0.72 : 1));
    ctx.fillRect(x - width / 2 + index * (segmentWidth + gap), y - height / 2, segmentWidth, height);
  }
  ctx.restore();
}

export function drawServiceDetails(ctx, {
  x = 0,
  y = 0,
  width = 120,
  height = 80,
  color = ENVIRONMENT_THEME.palette.navigation,
  seed = 1,
  density = 1,
} = {}) {
  const resolvedSeed = visualSeedFrom(seed);
  const rails = Math.max(1, Math.min(4, Math.round(density * 2)));
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(114,151,168,0.28)";
  ctx.lineWidth = 2;
  for (let index = 0; index < rails; index++) {
    const side = index % 2 ? 1 : -1;
    const offset = 9 + index * 5;
    ctx.beginPath();
    ctx.moveTo(side * width * 0.32, -height * 0.78 + offset);
    ctx.lineTo(side * width * 0.46, -height * 0.56 + offset);
    ctx.lineTo(side * width * 0.46, -height * 0.12);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(color, 0.46);
  for (let index = 0; index < 3; index++) {
    const px = -width * 0.35 + ((resolvedSeed >>> (index * 5)) & 31) / 31 * width * 0.7;
    ctx.fillRect(px - 2, -height * (0.2 + index * 0.16), 4, 4);
  }
  ctx.restore();
}

export function drawPixelDecal(ctx, {
  x = 0,
  y = 0,
  size = 18,
  color = ENVIRONMENT_THEME.palette.navigation,
  kind = "system",
  alpha = 0.58,
} = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.fillStyle = rgba(color, alpha * 0.28);
  ctx.lineWidth = Math.max(1, size * 0.09);
  const r = size * 0.42;
  if (kind === "bio" || kind === "habitat") {
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.bezierCurveTo(-r * 1.2, r * 0.2, -r * 0.9, -r, 0, -r * 0.38);
    ctx.bezierCurveTo(r * 0.9, -r, r * 1.2, r * 0.2, 0, r);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.75);
    ctx.lineTo(0, -r * 0.45);
    ctx.stroke();
  } else if (kind === "armory") {
    for (let index = 0; index < 3; index++) {
      ctx.save();
      ctx.rotate(index * TAU / 3);
      ctx.fillRect(-size * 0.08, -r, size * 0.16, r * 0.72);
      ctx.restore();
    }
    ctx.strokeRect(-size * 0.13, -size * 0.13, size * 0.26, size * 0.26);
  } else if (kind === "power" || kind === "reactor") {
    ctx.beginPath();
    for (let index = 0; index < 6; index++) {
      const angle = -Math.PI / 2 + index * TAU / 6;
      const radius = index % 2 ? r * 0.62 : r;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.16);
  } else if (kind === "archive" || kind === "control") {
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.strokeRect(-r * 0.56, -r * 0.56, r * 1.12, r * 1.12);
    ctx.fillRect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.36);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(-r * 0.34, -r * 0.34, r * 0.68, r * 0.68);
  }
  ctx.restore();
}

export function drawWearLayer(ctx, {
  x = 0,
  y = 0,
  width = 110,
  height = 70,
  seed = 1,
  amount = 0.25,
  color = "#8fb0bc",
} = {}) {
  if (amount <= 0) return;
  let value = visualSeedFrom(seed);
  const count = Math.max(2, Math.min(15, Math.round(amount * 24)));
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(color, 0.08 + amount * 0.18);
  ctx.lineWidth = 1;
  for (let index = 0; index < count; index++) {
    value = nextRandom(value);
    const px = (value / 4294967295 - 0.5) * width * 0.78;
    value = nextRandom(value);
    const py = -height * (0.12 + value / 4294967295 * 0.72);
    value = nextRandom(value);
    const length = 3 + value / 4294967295 * width * 0.12;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + length, py + (index % 2 ? -2 : 2));
    ctx.stroke();
  }
  ctx.restore();
}

function drawRivets(ctx, width, height, cut, color) {
  ctx.fillStyle = rgba(color, 0.58);
  const positions = [
    [-width / 2 + cut + 4, -height + cut + 2],
    [width / 2 - cut - 4, -height + cut + 2],
    [-width / 2 + cut + 4, -cut - 2],
    [width / 2 - cut - 4, -cut - 2],
  ];
  for (const [x, y] of positions) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
}

function chamferPath(ctx, x, y, width, height, cut) {
  const resolved = Math.max(0, Math.min(cut, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + resolved, y);
  ctx.lineTo(x + width - resolved, y);
  ctx.lineTo(x + width, y + resolved);
  ctx.lineTo(x + width, y + height - resolved);
  ctx.lineTo(x + width - resolved, y + height);
  ctx.lineTo(x + resolved, y + height);
  ctx.lineTo(x, y + height - resolved);
  ctx.lineTo(x, y + resolved);
  ctx.closePath();
}

function nextRandom(value) {
  let next = value + 0x6d2b79f5;
  next = Math.imul(next ^ next >>> 15, next | 1);
  next ^= next + Math.imul(next ^ next >>> 7, next | 61);
  return (next ^ next >>> 14) >>> 0;
}

function rgba(hex, alpha) {
  const normalized = String(hex || "#ffffff").replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((part) => part + part).join("") : normalized.padEnd(6, "f").slice(0, 6);
  return `rgba(${parseInt(full.slice(0, 2), 16)},${parseInt(full.slice(2, 4), 16)},${parseInt(full.slice(4, 6), 16)},${Math.max(0, Math.min(1, alpha))})`;
}
