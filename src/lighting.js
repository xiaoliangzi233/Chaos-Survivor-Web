import { CAMERA_ZOOM, TAU } from "./constants.js";
import { state, world } from "./state.js";
import { hexToRgba } from "./utils.js";

const LIGHT_SCALE = 0.5;
const MAX_PROJECTILE_LIGHTS = 90;
const MAX_GEM_LIGHTS = 42;
const MAX_MAP_LIGHTS = 80;
const MAX_ENEMY_LIGHTS = 28;

let lightCanvas = null;
let lightCtx = null;

export function renderLighting(ctx, camera, viewport) {
  if (!state.player) return;
  ensureLightBuffer(viewport);
  const w = lightCanvas.width;
  const h = lightCanvas.height;
  lightCtx.setTransform(1, 0, 0, 1, 0, 0);
  lightCtx.clearRect(0, 0, w, h);
  drawDarkness(lightCtx, w, h);

  const lights = collectLights(camera, viewport);
  lightCtx.globalCompositeOperation = "destination-out";
  for (const light of lights) carveLight(lightCtx, light);

  lightCtx.globalCompositeOperation = "source-over";
  for (const light of lights) tintLight(lightCtx, light);

  drawVignette(lightCtx, w, h);
  lightCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, viewport.width, viewport.height);
  ctx.imageSmoothingEnabled = false;
  ctx.restore();
}

function ensureLightBuffer(viewport) {
  lightCanvas ||= document.createElement("canvas");
  lightCtx ||= lightCanvas.getContext("2d", { alpha: true });
  const width = Math.max(160, Math.floor(viewport.width * LIGHT_SCALE));
  const height = Math.max(210, Math.floor(viewport.height * LIGHT_SCALE));
  if (lightCanvas.width !== width || lightCanvas.height !== height) {
    lightCanvas.width = width;
    lightCanvas.height = height;
  }
}

function drawDarkness(ctx, width, height) {
  const boss = world.boss && !world.boss.dead;
  const danger = state.player.hp / state.player.maxHp < 0.32;
  ctx.fillStyle = boss ? "rgba(1,3,9,0.58)" : danger ? "rgba(4,2,8,0.55)" : "rgba(1,4,11,0.48)";
  ctx.fillRect(0, 0, width, height);
}

function collectLights(camera, viewport) {
  const lights = [];
  addPlayerLight(lights, camera, viewport);
  addMapLights(lights, camera, viewport);
  addEntityLights(lights, camera, viewport);
  addProjectileLights(lights, camera, viewport);
  addGemLights(lights, camera, viewport);
  addFxLights(lights, camera, viewport);
  return lights;
}

function addPlayerLight(lights, camera, viewport) {
  const p = state.player;
  const lowHp = p.hp / p.maxHp < 0.32;
  addWorldLight(lights, camera, viewport, {
    x: p.x,
    y: p.y,
    radius: lowHp ? 220 : 250,
    color: lowHp ? "#ff4d6d" : "#ffd6a8",
    strength: lowHp ? 0.92 : 0.82,
    core: 0.32,
  });
}

function addMapLights(lights, camera, viewport) {
  const map = state.map;
  if (!map) return;
  let count = 0;
  for (const prop of map.props || []) {
    if (count >= MAX_MAP_LIGHTS) break;
    if (prop.kind === "rubble") continue;
    if (!worldVisible(prop.x, prop.y, 220, camera)) continue;
    const pulse = 0.75 + Math.sin(state.time * 2.2 + prop.phase) * 0.25;
    const radiusMul = prop.kind === "beacon" ? 5.2 : prop.kind === "dataCore" ? 4.5 : prop.kind === "relayPad" ? 3.2 : 3.8;
    const strengthBase = prop.kind === "beacon" ? 0.46 : prop.kind === "relayPad" ? 0.24 : prop.kind === "dataCore" ? 0.36 : 0.32;
    addWorldLight(lights, camera, viewport, {
      x: prop.x,
      y: prop.y,
      radius: prop.size * radiusMul,
      color: prop.color,
      strength: strengthBase * pulse,
      core: 0.18,
    });
    count++;
  }

  for (const line of map.energyLines || []) {
    if (count >= MAX_MAP_LIGHTS) break;
    const x = (line.x1 + line.x2) / 2;
    const y = (line.y1 + line.y2) / 2;
    if (!worldVisible(x, y, 280, camera)) continue;
    addWorldLight(lights, camera, viewport, {
      x,
      y,
      radius: 160,
      color: line.color,
      strength: 0.18 + Math.max(0, Math.sin(state.time * 3 + line.phase)) * 0.16,
      core: 0.08,
    });
    count++;
  }

  for (const tile of map.tiles || []) {
    if (count >= MAX_MAP_LIGHTS) break;
    if (!tile.glow || !worldVisible(tile.x + map.tileSize / 2, tile.y + map.tileSize / 2, 120, camera)) continue;
    addWorldLight(lights, camera, viewport, {
      x: tile.x + map.tileSize / 2,
      y: tile.y + map.tileSize / 2,
      radius: 92,
      color: tile.glow,
      strength: 0.1,
      core: 0.06,
    });
    count++;
  }
}

function addEntityLights(lights, camera, viewport) {
  let enemyLights = 0;
  for (const e of world.enemies) {
    if (e.dead || !worldVisible(e.x, e.y, e.r + 120, camera)) continue;
    if (e.boss) {
      addWorldLight(lights, camera, viewport, {
        x: e.x,
        y: e.y,
        radius: e.r * 4.8,
        color: e.color,
        strength: 0.55 + Math.sin(state.time * 4) * 0.12,
        core: 0.22,
      });
      continue;
    }
    if (enemyLights >= MAX_ENEMY_LIGHTS) continue;
    const frozen = e.freezeTimer > 0;
    const flashing = e.flash > 0.4;
    const shielded = e.shielded;
    const pulse = 0.78 + Math.sin(state.time * 3.4 + (e.phase || e.anim || 0)) * 0.22;
    addWorldLight(lights, camera, viewport, {
      x: e.x,
      y: e.y,
      radius: e.r * (frozen ? 4 : shielded || flashing ? 3.2 : 2.45),
      color: frozen ? "#9ff4ff" : e.color,
      strength: (flashing ? 0.34 : shielded || frozen ? 0.26 : 0.13) * pulse,
      core: frozen || flashing ? 0.14 : 0.1,
    });
    enemyLights++;
  }
}

function addProjectileLights(lights, camera, viewport) {
  let count = 0;
  for (const b of world.projectiles) {
    if (count >= MAX_PROJECTILE_LIGHTS) break;
    if (!worldVisible(b.x, b.y, 80, camera)) continue;
    addWorldLight(lights, camera, viewport, {
      x: b.x,
      y: b.y,
      radius: b.shape === "missile" ? 115 : b.shape === "boomerang" ? 86 : 74,
      color: b.color,
      strength: b.shape === "missile" ? 0.52 : 0.4,
      core: 0.2,
    });
    count++;
  }

  for (const b of world.enemyProjectiles) {
    if (count >= MAX_PROJECTILE_LIGHTS) break;
    if (!worldVisible(b.x, b.y, 80, camera)) continue;
    addWorldLight(lights, camera, viewport, {
      x: b.x,
      y: b.y,
      radius: 70,
      color: b.color || "#ff4d6d",
      strength: 0.36,
      core: 0.18,
    });
    count++;
  }
}

function addGemLights(lights, camera, viewport) {
  let count = 0;
  for (const g of world.gems) {
    if (count >= MAX_GEM_LIGHTS) break;
    if (g.value < 8 || !worldVisible(g.x, g.y, 60, camera)) continue;
    addWorldLight(lights, camera, viewport, {
      x: g.x,
      y: g.y,
      radius: g.value >= 15 ? 66 : 48,
      color: g.value >= 15 ? "#b48cff" : "#42e8ff",
      strength: 0.2,
      core: 0.08,
    });
    count++;
  }
}

function addFxLights(lights, camera, viewport) {
  for (const fx of world.weaponFx) {
    const k = Math.max(0, fx.life / fx.maxLife);
    if (fx.kind === "arc") {
      for (const seg of fx.segments) {
        addWorldLight(lights, camera, viewport, {
          x: seg.x2,
          y: seg.y2,
          radius: 110,
          color: fx.color,
          strength: 0.42 * k,
          core: 0.14,
        });
      }
    } else if (fx.x !== undefined && worldVisible(fx.x, fx.y, fx.radius || 160, camera)) {
      addWorldLight(lights, camera, viewport, {
        x: fx.x,
        y: fx.y,
        radius: fx.kind === "explosion" ? fx.radius * 1.45 : 90,
        color: fx.color || "#ffffff",
        strength: fx.kind === "explosion" ? 0.75 * k : 0.36 * k,
        core: 0.18,
      });
    }
  }
}

function addWorldLight(lights, camera, viewport, light) {
  const x = (light.x - camera.camX) * CAMERA_ZOOM * LIGHT_SCALE;
  const y = (light.y - camera.camY) * CAMERA_ZOOM * LIGHT_SCALE;
  const radius = light.radius * CAMERA_ZOOM * LIGHT_SCALE;
  const pad = radius * 1.15;
  if (x < -pad || x > viewport.width * LIGHT_SCALE + pad || y < -pad || y > viewport.height * LIGHT_SCALE + pad) return;
  lights.push({
    x,
    y,
    radius,
    color: light.color,
    strength: light.strength,
    core: light.core ?? 0.18,
  });
}

function carveLight(ctx, light) {
  const g = ctx.createRadialGradient(light.x, light.y, light.radius * light.core, light.x, light.y, light.radius);
  g.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, light.strength)})`);
  g.addColorStop(0.45, `rgba(255,255,255,${light.strength * 0.55})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(light.x, light.y, light.radius, 0, TAU);
  ctx.fill();
}

function tintLight(ctx, light) {
  const g = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius * 1.05);
  g.addColorStop(0, hexToRgba(light.color, light.strength * 0.24));
  g.addColorStop(0.55, hexToRgba(light.color, light.strength * 0.08));
  g.addColorStop(1, hexToRgba(light.color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(light.x, light.y, light.radius * 1.05, 0, TAU);
  ctx.fill();
}

function drawVignette(ctx, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(width, height) * 0.6;
  const g = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.72, "rgba(0,0,0,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0.36)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function worldVisible(x, y, pad, camera) {
  return x >= camera.camX - pad && x <= camera.camX + camera.viewW + pad && y >= camera.camY - pad && y <= camera.camY + camera.viewH + pad;
}
