import { WORLD_SIZE, TAU } from "./constants.js";
import { mulberry32, hexToRgba } from "./utils.js";

export function generateMap() {
  const palettes = [
    { floor: ["#0d1f2a", "#12313a", "#163b34", "#213646"], accent: ["#42e8ff", "#77ff8a", "#ffd166"] },
    { floor: ["#171728", "#20213a", "#27304a", "#23314a"], accent: ["#b48cff", "#42e8ff", "#ff4d6d"] },
    { floor: ["#1a2020", "#22322b", "#2b3b32", "#3a3b2b"], accent: ["#77ff8a", "#ffd166", "#42e8ff"] },
  ];
  const palette = palettes[Math.floor(Math.random() * palettes.length)];
  const rng = mulberry32(Math.floor(Math.random() * 2147483647));
  const tileSize = 128;
  const half = WORLD_SIZE / 2;
  const tiles = [];
  const props = [];

  for (let y = -half; y < half; y += tileSize) {
    for (let x = -half; x < half; x += tileSize) {
      const color = palette.floor[Math.floor(rng() * palette.floor.length)];
      tiles.push({ x, y, color, detail: rng(), crack: rng() > 0.62, glow: rng() > 0.86 ? palette.accent[Math.floor(rng() * palette.accent.length)] : null });
      if (rng() > 0.88) {
        props.push({
          x: x + 20 + rng() * 88,
          y: y + 18 + rng() * 92,
          size: 10 + rng() * 28,
          kind: rng() > 0.5 ? "crystal" : "rubble",
          color: palette.accent[Math.floor(rng() * palette.accent.length)],
          phase: rng() * TAU,
        });
      }
    }
  }
  return { tileSize, tiles, props };
}

export function drawMap(ctx, map, camX, camY, viewW, viewH, time) {
  if (!map) return;
  const pad = map.tileSize;
  for (const tile of map.tiles) {
    if (tile.x > camX + viewW + pad || tile.x + map.tileSize < camX - pad || tile.y > camY + viewH + pad || tile.y + map.tileSize < camY - pad) continue;
    ctx.fillStyle = tile.color;
    ctx.fillRect(tile.x, tile.y, map.tileSize, map.tileSize);
    ctx.fillStyle = tile.detail > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(tile.x + 8, tile.y + 8, map.tileSize - 16, map.tileSize - 16);
    if (tile.glow) {
      ctx.strokeStyle = hexToRgba(tile.glow, 0.35);
      ctx.lineWidth = 2;
      ctx.strokeRect(tile.x + 4, tile.y + 4, map.tileSize - 8, map.tileSize - 8);
    }
    if (tile.crack) {
      ctx.strokeStyle = "rgba(3,6,12,0.34)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tile.x + 18, tile.y + 20 + tile.detail * 60);
      ctx.lineTo(tile.x + 46, tile.y + 44);
      ctx.lineTo(tile.x + 82, tile.y + 36 + tile.detail * 46);
      ctx.lineTo(tile.x + 110, tile.y + 88);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(66,232,255,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 64;
  const startX = Math.floor(camX / step) * step;
  const startY = Math.floor(camY / step) * step;
  for (let x = startX; x < camX + viewW + step; x += step) {
    ctx.moveTo(x, camY - step);
    ctx.lineTo(x, camY + viewH + step);
  }
  for (let y = startY; y < camY + viewH + step; y += step) {
    ctx.moveTo(camX - step, y);
    ctx.lineTo(camX + viewW + step, y);
  }
  ctx.stroke();

  for (const prop of map.props) {
    if (prop.x < camX - 80 || prop.x > camX + viewW + 80 || prop.y < camY - 80 || prop.y > camY + viewH + 80) continue;
    ctx.save();
    ctx.translate(prop.x, prop.y);
    if (prop.kind === "crystal") {
      const pulse = 0.75 + Math.sin(time * 3 + prop.phase) * 0.25;
      ctx.fillStyle = hexToRgba(prop.color, 0.34 * pulse);
      diamond(ctx, prop.size + 10);
      ctx.fillStyle = prop.color;
      diamond(ctx, prop.size);
    } else {
      ctx.fillStyle = "rgba(3,6,12,0.42)";
      ctx.fillRect(-prop.size * 0.6, -prop.size * 0.35, prop.size * 1.2, prop.size * 0.7);
      ctx.fillStyle = hexToRgba(prop.color, 0.28);
      ctx.fillRect(-prop.size * 0.45, -prop.size * 0.22, prop.size * 0.9, prop.size * 0.44);
    }
    ctx.restore();
  }
}

function diamond(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fill();
}
