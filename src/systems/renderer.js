import { CAMERA_ZOOM, TAU, WORLD_SIZE } from "../constants.js";
import { state, world, input } from "../state.js";
import { clamp, hexToRgba } from "../utils.js";
import { drawMap } from "./map.js";
import { drawEffects } from "../effects.js";
import { renderLighting } from "./lighting.js";
import { drawBlackhole } from "../blackhole.js";
import { createDecorativeEnemy, decorativeEnemyIds } from "./enemyRegistry.js";
import { drawEasterEggObject, drawEasterEggToast } from "./easterEggs.js";
import { activeWaveEffect } from "./waveScenarios.js";

export const viewport = { width: 1, height: 1, dpr: 1 };

export function bossHudLayout(view, boss) {
  const twin = Boolean(boss?.shared?.members);
  const barHeight = twin ? 38 : 28;
  return {
    title: {
      text: boss?.name || "Boss",
      x: 0,
      y: 42,
      w: view.width,
    },
    bar: {
      x: 0,
      y: view.height - barHeight,
      w: view.width,
      h: barHeight,
      showText: true,
      text: boss?.maxHp ? `${Math.ceil(Math.max(0, boss.hp || 0))} / ${Math.ceil(boss.maxHp)}` : "",
    },
  };
}

export function enemyProjectileHasHalo(projectile) {
  return !projectile?.bossProjectile;
}

export function eliteOutlineStyle(enemy) {
  if (!enemy?.elite) return null;
  return {
    color: enemy.eliteVariant === "giant" ? "#ff9f6e" : "#ffd166",
    width: enemy.eliteVariant === "giant" ? 4 : 2.5,
  };
}

export function scenarioOverlayStyle(effect) {
  if (effect === "blind") return { color: "rgba(0,0,0,0.34)" };
  if (effect === "ice_skate") return { color: "rgba(159,244,255,0.12)" };
  return null;
}

export function bossDirectionIndicator(view, camera, boss) {
  if (!boss || boss.dead) return { visible: false };
  const screenX = (boss.x - camera.x) * CAMERA_ZOOM + view.width / 2;
  const screenY = (boss.y - camera.y) * CAMERA_ZOOM + view.height / 2;
  const margin = Math.max(46, (boss.r || 32) * 0.72);
  if (screenX >= margin && screenX <= view.width - margin && screenY >= margin && screenY <= view.height - margin) {
    return { visible: false, x: screenX, y: screenY, angle: 0 };
  }
  const cx = view.width / 2;
  const cy = view.height / 2;
  const dx = screenX - cx;
  const dy = screenY - cy;
  const angle = Math.atan2(dy, dx);
  const edgeX = cx + Math.cos(angle) * Math.min(view.width / 2 - margin, Math.abs((view.height / 2 - margin) / Math.sin(angle || 0.0001) * Math.cos(angle)));
  const edgeY = cy + Math.sin(angle) * Math.min(view.height / 2 - margin, Math.abs((view.width / 2 - margin) / Math.cos(angle || 0.0001) * Math.sin(angle)));
  return {
    visible: true,
    x: clamp(edgeX, margin, view.width - margin),
    y: clamp(edgeY, margin, view.height - margin),
    angle,
    name: boss.name || "Boss",
    panel: false,
  };
}

const QUALITY_COLORS = {
  common: "#cbd5e1",
  uncommon: "#77ff8a",
  rare: "#42e8ff",
  epic: "#b48cff",
  legendary: "#ffd166",
};

const CANVAS_PIXEL_FONT = "'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Press Start 2P', 'Pixelify Sans', 'Silkscreen', 'Courier New', monospace";
const MENU_DECOR_ENEMY_COUNT = 12;
const menuScene = {
  time: 0,
  last: 0,
  enemies: [],
  particles: [],
  cameraX: 0,
  cameraY: 0,
};

function qualityColor(quality, fallback) {
  return !quality || quality === "common" ? fallback : QUALITY_COLORS[quality] || fallback;
}

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
  if (state.mode === "menu") {
    renderMenuScene(ctx);
    return;
  }
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
  drawCoins(ctx);
  drawProjectiles(ctx);
  for (const e of world.enemies) {
    if (!inView(e.x, e.y, e.r + 80)) continue;
    e.draw(ctx);
    drawEliteOutline(ctx, e);
    if (e.shielded) drawEnemyShield(ctx, e);
  }
  drawDrones(ctx);
  drawPlayer(ctx);
  drawEnemyProjectiles(ctx);
  drawHazards(ctx);
  drawItemObjects(ctx);
  drawBlackhole(ctx);
  drawEffects(ctx);
  drawWeaponFx(ctx);
  ctx.restore();
  renderLighting(ctx, { camX, camY, viewW, viewH }, viewport);
  drawBossBar(ctx);
  drawBossDirectionIndicator(ctx);
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,77,109,${state.flash * 0.18})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }
  drawScenarioOverlay(ctx);
  drawEasterEggToast(ctx, viewport);
}

function renderMenuScene(ctx) {
  const now = performance.now() / 1000;
  const dt = Math.min(0.033, menuScene.last ? now - menuScene.last : 1 / 60);
  menuScene.last = now;
  menuScene.time += dt;
  ensureMenuScene();
  updateMenuDecor(dt);

  const viewW = visibleWorldWidth();
  const viewH = visibleWorldHeight();
  menuScene.cameraX = Math.sin(menuScene.time * 0.08) * 420 + Math.cos(menuScene.time * 0.045) * 260;
  menuScene.cameraY = Math.cos(menuScene.time * 0.07) * 360 + Math.sin(menuScene.time * 0.05) * 220;
  const camX = clampViewX(menuScene.cameraX - viewW / 2);
  const camY = clampViewY(menuScene.cameraY - viewH / 2);

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "#02050c";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
  ctx.translate(-camX, -camY);
  drawMap(ctx, state.map, camX, camY, viewW, viewH, menuScene.time);
  drawMenuEnemyGlows(ctx, camX, camY, viewW, viewH);
  for (const actor of menuScene.enemies) {
    if (!isMenuActorInView(actor, camX, camY, viewW, viewH)) continue;
    actor.enemy.draw(ctx);
  }
  ctx.restore();
  drawMenuScreenFx(ctx);
}

function ensureMenuScene() {
  if (menuScene.enemies.length) return;
  const ids = decorativeEnemyIds();
  if (!ids.length) return;
  const spreadX = visibleWorldWidth() * 0.65;
  const spreadY = visibleWorldHeight() * 0.55;
  for (let i = 0; i < MENU_DECOR_ENEMY_COUNT; i++) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const angle = Math.random() * TAU;
    const radius = 160 + Math.random() * 620;
    const x = Math.cos(angle) * radius + (Math.random() - 0.5) * spreadX;
    const y = Math.sin(angle) * radius + (Math.random() - 0.5) * spreadY;
    const enemy = createDecorativeEnemy(id, x, y);
    if (!enemy) continue;
    menuScene.enemies.push({
      enemy,
      homeX: x,
      homeY: y,
      phase: Math.random() * TAU,
      speed: 0.25 + Math.random() * 0.45,
      drift: 38 + Math.random() * 96,
    });
  }
  for (let i = 0; i < 90; i++) spawnMenuParticle(true);
}

function updateMenuDecor(dt) {
  for (const actor of menuScene.enemies) {
    const e = actor.enemy;
    actor.phase += dt * actor.speed;
    e.x = actor.homeX + Math.cos(actor.phase * 1.3) * actor.drift + Math.sin(menuScene.time * 0.2 + actor.homeY * 0.01) * 16;
    e.y = actor.homeY + Math.sin(actor.phase) * actor.drift * 0.7;
    e.anim += dt * (2.2 + e.speed * 0.018);
    e.flip = Math.cos(actor.phase) < 0 ? -1 : 1;
  }
  for (const p of menuScene.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.spin += dt * p.twist;
  }
  menuScene.particles = menuScene.particles.filter((p) => p.life > 0);
  while (menuScene.particles.length < 90) spawnMenuParticle(false);
}

function spawnMenuParticle(initial) {
  const life = 2.8 + Math.random() * 4.6;
  menuScene.particles.push({
    x: Math.random() * viewport.width,
    y: initial ? Math.random() * viewport.height : viewport.height + 20,
    vx: (Math.random() - 0.5) * 20,
    vy: -18 - Math.random() * 58,
    r: 1 + Math.random() * 2.8,
    life,
    maxLife: life,
    spin: Math.random() * TAU,
    twist: (Math.random() - 0.5) * 2,
    color: Math.random() < 0.52 ? "#42e8ff" : Math.random() < 0.78 ? "#b48cff" : "#ffd166",
  });
}

function drawMenuEnemyGlows(ctx, camX, camY, viewW, viewH) {
  for (const actor of menuScene.enemies) {
    const e = actor.enemy;
    if (!isMenuActorInView(actor, camX, camY, viewW, viewH)) continue;
    glow(ctx, e.x, e.y, e.r * 2.8, 0.18, e.color || "#42e8ff");
  }
}

function isMenuActorInView(actor, camX, camY, viewW, viewH) {
  const e = actor.enemy;
  return e.x > camX - 140 && e.x < camX + viewW + 140 && e.y > camY - 140 && e.y < camY + viewH + 140;
}

function drawMenuScreenFx(ctx) {
  const t = menuScene.time;
  const pulse = 0.45 + Math.sin(t * 1.4) * 0.15;
  const centerGlow = ctx.createRadialGradient(viewport.width / 2, viewport.height * 0.5, 40, viewport.width / 2, viewport.height * 0.5, viewport.width * 0.62);
  centerGlow.addColorStop(0, `rgba(66,232,255,${0.1 * pulse})`);
  centerGlow.addColorStop(0.45, "rgba(180,140,255,0.08)");
  centerGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  for (const p of menuScene.particles) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = hexToRgba(p.color, 0.18 + alpha * 0.55);
    ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = hexToRgba(p.color, alpha * 0.35);
    ctx.fillRect(-p.r * 0.45, -p.r * 0.45, p.r * 0.9, p.r * 0.9);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = Math.floor((t * 26) % 9); y < viewport.height; y += 9) {
    ctx.fillRect(0, y, viewport.width, 1);
  }
  const vignette = ctx.createRadialGradient(viewport.width / 2, viewport.height / 2, viewport.height * 0.2, viewport.width / 2, viewport.height / 2, viewport.width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.72, "rgba(0,0,0,0.18)");
  vignette.addColorStop(1, "rgba(0,0,0,0.74)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
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
  const breathe = Math.sin(state.time * 4.2);
  const squash = 1 + Math.sin(state.time * 5) * 0.025;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 21, 22, 7, 0, 0, TAU); ctx.fill();
  glow(ctx, 0, -3, 29, hurt ? 0.35 : 0.44, hurt ? "#ff9ab0" : "#ffd6a8");
  glow(ctx, 0, -8, 22, 0.17, low ? "#ff4d6d" : "#42e8ff");
  ctx.scale(1.02 + breathe * 0.01, squash);

  const skin = hurt ? "#ffd7dd" : "#ffd6a8";
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -3, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffbd8a";
  ctx.beginPath(); ctx.arc(-13, 2, 5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(13, 2, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = low ? "#ff4d6d" : "#42e8ff";
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 18, -2);
    ctx.quadraticCurveTo(side * (27 + breathe * 1.5), 4, side * 19, 12);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff4d8";
  ctx.beginPath(); ctx.arc(-7, -10, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -10, 7, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(0, -4);
  drawPlayerEyes(ctx, mood);
  drawPlayerMouth(ctx, mood);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath(); ctx.arc(-8, -16, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f3b05f";
  ctx.beginPath(); ctx.arc(0, -4, 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#7b4a2b";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -3, 22, 0, TAU); ctx.stroke();
  ctx.strokeStyle = hexToRgba(low ? "#ff4d6d" : "#42e8ff", 0.38 + Math.abs(breathe) * 0.18);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -3, 25 + breathe * 1.2, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
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
    if (b.shape === "singularity") {
      drawSingularityProjectile(ctx, b);
      continue;
    }
    if (b.shape === "starfall") {
      drawStarfallProjectile(ctx, b);
      continue;
    }
    if (b.shape === "phaseNeedle") {
      drawPhaseNeedleProjectile(ctx, b);
      continue;
    }
    const boosted = b.quality === "epic" || b.quality === "legendary";
    const tail = b.shape === "missile" ? (boosted ? 82 : 64) : b.shape === "droneBolt" ? (boosted ? 38 : 28) : 48;
    const tx = b.x - Math.cos(b.angle) * tail;
    const ty = b.y - Math.sin(b.angle) * tail;
    const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
    grad.addColorStop(0, hexToRgba(b.color, 0));
    grad.addColorStop(1, "#fff");
    ctx.strokeStyle = grad; ctx.lineWidth = b.shape === "droneBolt" ? (boosted ? 5 : 4) : (boosted ? 8 : 6); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineCap = "butt";
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle + (b.shape === "boomerang" ? b.spin : 0));
    glow(ctx, 0, 0, b.r * (boosted ? 2.15 : 1.7), boosted ? 0.48 : 0.36, b.color);
    if (b.shape === "boomerang") drawBoomerangProjectile(ctx, b);
    else if (b.shape === "missile") drawMissileProjectile(ctx, b);
    else if (b.shape === "ice") drawIceProjectile(ctx, b);
    else if (b.shape === "droneBolt") drawDroneBolt(ctx, b);
    else diamond(ctx, b.r * 2.6, b.r, b.color);
    ctx.restore();
  }
}

function drawDrones(ctx) {
  const w = state.weapons.drone;
  if (!w || w.level <= 0) return;
  for (const d of w.drones) {
    if (!inView(d.x, d.y, 60)) continue;
    drawDrone(ctx, d.x, d.y, d.anim, d.mode === "attack", d.energy, d.batteryMax || w.batteryMax, d.color || qualityColor(d.quality, "#77ff8a"), d.quality || "common");
  }
}

function drawWeaponFx(ctx) {
  for (const fx of world.weaponFx) {
    if (fx.delay > 0) continue;
    const k = Math.max(0, fx.life / fx.maxLife);
    if (fx.kind === "arc") {
      drawArcFx(ctx, fx, k);
    } else if (fx.kind === "explosion") {
      drawExplosionFx(ctx, fx, k);
    } else if (fx.kind === "iceHit") {
      drawIceHitFx(ctx, fx, k);
    } else if (fx.kind === "muzzle") {
      drawMuzzleFx(ctx, fx, k);
    } else if (fx.kind === "pulse") {
      ctx.strokeStyle = hexToRgba(fx.color, k * 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1 - k), 0, TAU);
      ctx.stroke();
    } else if (fx.kind === "doublePulse") {
      drawDoublePulseFx(ctx, fx, k);
    } else if (fx.kind === "shockRing") {
      drawShockRingFx(ctx, fx, k);
    } else if (fx.kind === "frostZone") {
      drawFrostZoneFx(ctx, fx, k);
    } else if (fx.kind === "prismRail") {
      drawPrismRailFx(ctx, fx, k);
    } else if (fx.kind === "prismImpact") {
      drawPrismImpactFx(ctx, fx, k);
    } else if (fx.kind === "voidPulse") {
      drawVoidPulseFx(ctx, fx, k);
    } else if (fx.kind === "voidCollapse") {
      drawVoidCollapseFx(ctx, fx, k);
    } else if (fx.kind === "teslaChain") {
      drawTeslaChainFx(ctx, fx, k);
    } else if (fx.kind === "teslaNodePulse") {
      drawTeslaNodePulseFx(ctx, fx, k);
    } else if (fx.kind === "teslaField") {
      drawTeslaFieldFx(ctx, fx, k);
    } else if (fx.kind === "prismBurst") {
      drawPrismBurstFx(ctx, fx, k);
    } else if (fx.kind === "bladeBloom") {
      drawBladeBloomFx(ctx, fx, k);
    } else if (fx.kind === "droneBeam") {
      drawDroneBeamFx(ctx, fx, k);
    } else if (fx.kind === "turretBeam") {
      drawTurretBeamFx(ctx, fx, k);
    } else if (fx.kind === "itemMineBlast") {
      drawItemMineBlastFx(ctx, fx, k);
    } else if (fx.kind === "starImpact") {
      drawStarImpactFx(ctx, fx, k);
    } else if (fx.kind === "starfallWarning") {
      drawStarfallWarningFx(ctx, fx, k);
    } else if (fx.kind === "starfallImpact") {
      drawStarfallImpactFx(ctx, fx, k);
    } else if (fx.kind === "starScar") {
      drawStarScarFx(ctx, fx, k);
    } else if (fx.kind === "starConstellation") {
      drawStarConstellationFx(ctx, fx, k);
    } else if (fx.kind === "phaseNeedleHit") {
      drawPhaseNeedleHitFx(ctx, fx, k);
    } else if (fx.kind === "phaseNeedleMark") {
      drawPhaseNeedleMarkFx(ctx, fx, k);
    } else if (fx.kind === "phaseNeedleBurst") {
      drawPhaseNeedleBurstFx(ctx, fx, k);
    } else if (fx.kind === "phaseNeedleRift") {
      drawPhaseNeedleRiftFx(ctx, fx, k);
    } else if (fx.kind === "echoCone") {
      drawEchoConeFx(ctx, fx, k);
    } else if (fx.kind === "echoWave") {
      drawEchoWaveFx(ctx, fx, k);
    } else if (fx.kind === "echoResonance") {
      drawEchoResonanceFx(ctx, fx, k);
    } else if (fx.kind === "riftLoom") {
      drawRiftLoomFx(ctx, fx, k);
    } else if (fx.kind === "riftCollapse") {
      drawRiftCollapseFx(ctx, fx, k);
    } else if (fx.kind === "riftScar") {
      drawRiftScarFx(ctx, fx, k);
    } else {
      ctx.strokeStyle = hexToRgba(fx.color, k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 18 * (1 - k), 0, TAU);
      ctx.stroke();
    }
  }
}

function drawIceProjectile(ctx, b) {
  const r = b.r;
  const bladeLen = r * 4.15;
  const tang = r * 0.95;
  ctx.fillStyle = "#dffcff";
  ctx.beginPath();
  ctx.moveTo(bladeLen, 0);
  ctx.lineTo(r * 0.85, tang);
  ctx.lineTo(-r * 1.15, r * 0.45);
  ctx.lineTo(-r * 1.72, 0);
  ctx.lineTo(-r * 1.15, -r * 0.45);
  ctx.lineTo(r * 0.85, -tang);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hexToRgba(b.color, 0.28);
  ctx.beginPath();
  ctx.moveTo(r * 0.25, 0);
  ctx.lineTo(r * 2.8, -r * 0.42);
  ctx.lineTo(r * 1.75, 0);
  ctx.lineTo(r * 2.8, r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-r * 1.55, -r * 0.32, r * 0.8, r * 0.64);
  if (b.variant === "iceShard" || b.quality === "legendary") {
    ctx.strokeStyle = hexToRgba(b.color, 0.9);
    ctx.lineWidth = 1.4;
    for (const s of [-0.75, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, 0);
      ctx.lineTo(r * 1.4, r * s);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, 0);
  ctx.lineTo(r * 3.15, 0);
  ctx.stroke();
}

function drawMissileProjectile(ctx, b) {
  const r = b.r;
  ctx.fillStyle = "#fff1c4";
  ctx.beginPath();
  ctx.moveTo(r * 3.1, 0);
  ctx.lineTo(r * 0.8, r * 1.25);
  ctx.lineTo(-r * 2.1, r * 0.8);
  ctx.lineTo(-r * 2.45, 0);
  ctx.lineTo(-r * 2.1, -r * 0.8);
  ctx.lineTo(r * 0.8, -r * 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ff7a2f";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#42e8ff";
  ctx.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
  ctx.fillStyle = b.variant === "legendMissile" ? "#ffd166" : "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(-r * 2.3, -r * 0.65);
  ctx.lineTo(-r * (b.variant === "microMissile" ? 3.1 : 3.8), 0);
  ctx.lineTo(-r * 2.3, r * 0.65);
  ctx.closePath();
  ctx.fill();
  if (b.variant === "legendMissile") {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, TAU);
    ctx.stroke();
  }
}

function drawBoomerangProjectile(ctx, b) {
  const r = b.r;
  const t = Math.sin(b.spin * 0.7) * 0.08;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(-r * 2.8, -r * 0.72);
  ctx.quadraticCurveTo(-r * 0.35, -r * 2.35, r * 2.9, -r * 0.36 + t * r);
  ctx.quadraticCurveTo(r * 1.25, r * 0.35, r * 0.18, r * 0.58);
  ctx.quadraticCurveTo(-r * 0.82, r * 0.78, -r * 2.05, r * 1.42);
  ctx.lineTo(-r * 2.75, r * 0.65);
  ctx.quadraticCurveTo(-r * 1.25, r * 0.1, -r * 0.18, -r * 0.08);
  ctx.quadraticCurveTo(-r * 1.26, -r * 0.18, -r * 2.8, -r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#42e8ff", 0.82);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-r * 1.85, -r * 0.42);
  ctx.quadraticCurveTo(-r * 0.1, -r * 1.55, r * 1.75, -r * 0.28);
  ctx.stroke();
  ctx.fillStyle = hexToRgba("#ffffff", 0.72);
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.15, r * 0.42, 0, TAU);
  ctx.fill();
  if (b.variant === "dualBoomerang" || b.quality === "legendary") {
    ctx.strokeStyle = hexToRgba(b.color, 0.78);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.55, 0, TAU);
    ctx.stroke();
  }
}

function drawDroneBolt(ctx, b) {
  const r = b.r;
  ctx.fillStyle = "#ffffff";
  diamond(ctx, r * 2.2, r * 0.75, "#ffffff");
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, -r * 0.95);
  ctx.lineTo(r * 1.7, 0);
  ctx.lineTo(-r * 1.2, r * 0.95);
  ctx.stroke();
  if (b.variant === "homingDroneBolt") {
    ctx.strokeStyle = hexToRgba(b.color, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.8, -0.9, 0.9);
    ctx.stroke();
  }
}

function drawSingularityProjectile(ctx, b) {
  const rank = b.qualityRank || 0;
  const coreR = b.r * (0.92 + Math.sin(state.time * 8 + b.seed) * 0.05);
  const horizon = b.damageRadius || b.r * 3;
  const diskR = b.pullRadius * 0.58;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalCompositeOperation = "lighter";

  glow(ctx, 0, 0, diskR * 0.56, 0.22 + rank * 0.035, b.color);
  ctx.save();
  ctx.rotate(b.spin * 0.35);
  ctx.scale(1, 0.42);
  const disk = ctx.createRadialGradient(0, 0, coreR * 0.5, 0, 0, diskR);
  disk.addColorStop(0, "rgba(0,0,0,0)");
  disk.addColorStop(0.34, hexToRgba("#ffffff", 0.12));
  disk.addColorStop(0.52, hexToRgba(b.color, 0.42));
  disk.addColorStop(0.72, hexToRgba(rank >= 4 ? "#ffd166" : "#ff65d8", 0.26));
  disk.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(0, 0, diskR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(rank >= 4 ? "#ffd166" : b.color, 0.72);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, diskR * 0.54, b.spin, b.spin + Math.PI * 1.35);
  ctx.stroke();
  if (rank >= 4) {
    ctx.rotate(-b.spin * 0.72);
    ctx.strokeStyle = hexToRgba("#ffd166", 0.46);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, diskR * 0.82, 0, Math.PI * 1.55);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = hexToRgba(b.color, 0.18);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, b.pullRadius * (0.82 + Math.sin(state.time * 2 + b.seed) * 0.03), 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < 12; i++) {
    const a = b.spin * (i % 2 ? -0.55 : 0.72) + i * TAU / 12;
    const r = horizon * (0.78 + (i % 3) * 0.22);
    const size = 2 + (i % 3);
    ctx.fillStyle = hexToRgba(i % 2 ? "#ffffff" : b.color, 0.32 + (i % 3) * 0.1);
    ctx.fillRect(Math.cos(a) * r - size / 2, Math.sin(a) * r - size / 2, size, size);
  }

  const event = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR * 1.75);
  event.addColorStop(0, "rgba(0,0,0,1)");
  event.addColorStop(0.52, "rgba(0,0,0,0.95)");
  event.addColorStop(0.7, hexToRgba("#ffffff", 0.84));
  event.addColorStop(0.84, hexToRgba(b.color, 0.88));
  event.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = event;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 1.75, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#02020a";
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexToRgba("#ffffff", 0.58);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 1.18, -b.spin, -b.spin + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawStarfallProjectile(ctx, b) {
  if ((b.delay || 0) > 0) return;
  const rank = b.qualityRank || 0;
  const r = b.r || 10;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate((b.spin || 0) + b.angle);
  ctx.globalCompositeOperation = "lighter";

  const tail = b.major ? 118 : 82;
  const grad = ctx.createLinearGradient(-tail, 0, r * 1.5, 0);
  grad.addColorStop(0, hexToRgba(b.color, 0));
  grad.addColorStop(0.55, hexToRgba(rank >= 4 ? "#ffd166" : b.color, 0.34));
  grad.addColorStop(1, hexToRgba("#ffffff", 0.88));
  ctx.strokeStyle = grad;
  ctx.lineWidth = b.major ? 12 : 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-tail, 0);
  ctx.lineTo(r * 1.4, 0);
  ctx.stroke();
  ctx.lineCap = "butt";

  glow(ctx, 0, 0, r * (b.major ? 4.2 : 3.2), b.major ? 0.5 : 0.36, b.color);
  ctx.fillStyle = "#ffffff";
  drawStarShape(ctx, 0, 0, r * (b.major ? 1.35 : 1.05), r * 0.42, 10);
  ctx.fill();
  ctx.strokeStyle = b.major ? "#ffd166" : b.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(rank >= 4 ? "#ffd166" : b.color, 0.72);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.75, state.time * 3, state.time * 3 + Math.PI * 1.4);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 - state.time * 4;
    ctx.fillStyle = hexToRgba(i % 2 ? "#ffffff" : b.color, 0.55);
    ctx.fillRect(Math.cos(a) * r * 2.2 - 1.5, Math.sin(a) * r * 2.2 - 1.5, 3, 3);
  }
  ctx.restore();
}

function drawPhaseNeedleProjectile(ctx, b) {
  const rank = b.qualityRank || 0;
  const r = b.r || 5;
  const tail = b.major ? 104 : 72;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  ctx.globalCompositeOperation = "lighter";

  const trailGrad = ctx.createLinearGradient(-tail, 0, r * 3, 0);
  trailGrad.addColorStop(0, hexToRgba("#42e8ff", 0));
  trailGrad.addColorStop(0.35, hexToRgba("#42e8ff", 0.22));
  trailGrad.addColorStop(0.72, hexToRgba(b.color, 0.42));
  trailGrad.addColorStop(1, hexToRgba("#ffffff", 0.9));
  ctx.strokeStyle = trailGrad;
  ctx.lineWidth = b.major ? 7.5 : 4.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-tail, Math.sin(state.time * 38 + b.seed) * 1.4);
  ctx.lineTo(r * 3.4, 0);
  ctx.stroke();
  ctx.lineCap = "butt";

  glow(ctx, 0, 0, r * (b.major ? 4.6 : 3.4), b.major ? 0.42 : 0.32, b.color);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(r * (b.major ? 5.4 : 4.4), 0);
  ctx.lineTo(r * 0.7, r * (b.major ? 1.15 : 0.9));
  ctx.lineTo(-r * 1.9, r * 0.42);
  ctx.lineTo(-r * 2.8, 0);
  ctx.lineTo(-r * 1.9, -r * 0.42);
  ctx.lineTo(r * 0.7, -r * (b.major ? 1.15 : 0.9));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = b.major ? "#ffd166" : b.color;
  ctx.lineWidth = b.major ? 2.1 : 1.5;
  ctx.stroke();

  ctx.strokeStyle = hexToRgba("#42e8ff", 0.78);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * r * 0.78;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, off);
    ctx.lineTo(r * (2.4 + rank * 0.2), off * 0.22);
    ctx.stroke();
  }
  if (rank >= 2) {
    ctx.strokeStyle = hexToRgba(b.color, 0.68);
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 2.2, state.time * 7, state.time * 7 + Math.PI * 1.35);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDrone(ctx, x, y, t, attacking, energy = 1, maxEnergy = 1, color = "#77ff8a", quality = "common") {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 9) * 1.5);
  ctx.rotate(Math.sin(t * 3) * 0.12);
  const core = attacking ? color : "#42e8ff";
  glow(ctx, 0, 0, attacking ? 27 : 20, attacking ? 0.6 : 0.38, attacking ? color : "#ffd166");
  ctx.strokeStyle = core;
  ctx.lineWidth = 2;
  for (const sx of [-18, 18]) {
    ctx.save();
    ctx.translate(sx, 0);
    ctx.rotate(t * 18 * (sx < 0 ? -1 : 1));
    ctx.strokeStyle = hexToRgba("#ffffff", 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(core, 0.92);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "rgba(10,16,28,0.92)";
  ctx.beginPath();
  ctx.roundRect(-13, -9, 26, 18, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hexToRgba(core, attacking ? 0.95 : 0.7);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 5);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
  if (quality === "epic" || quality === "legendary") {
    ctx.strokeStyle = quality === "legendary" ? "#ffd166" : color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.stroke();
  }
  const ratio = Math.max(0, Math.min(1, energy / Math.max(1, maxEnergy)));
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-13, 12, 26, 3);
  ctx.fillStyle = ratio > 0.35 ? "#77ff8a" : "#ff4d6d";
  ctx.fillRect(-13, 12, 26 * ratio, 3);
  ctx.restore();
}

function drawAllyTurret(ctx, turret) {
  const t = state.time + (turret.t || 0);
  ctx.save();
  ctx.translate(turret.x, turret.y);
  ctx.rotate(turret.targetAngle || 0);
  glow(ctx, 0, 0, 32, 0.34, "#42e8ff");
  ctx.fillStyle = "rgba(3,8,18,0.86)";
  ctx.beginPath();
  ctx.roundRect(-17, -14, 34, 28, 7);
  ctx.fill();
  ctx.strokeStyle = "#42e8ff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#dffcff";
  ctx.fillRect(5, -5, 24, 10);
  ctx.fillStyle = "#42e8ff";
  ctx.fillRect(22, -3, 8, 6);
  ctx.rotate(-turret.targetAngle || 0);
  ctx.strokeStyle = hexToRgba("#42e8ff", 0.28 + Math.sin(t * 6) * 0.08);
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawAllyMine(ctx, mine) {
  const armed = !mine.triggered;
  const blink = 0.55 + Math.sin(state.time * 8 + mine.t) * 0.22;
  ctx.save();
  ctx.translate(mine.x, mine.y);
  glow(ctx, 0, 0, armed ? 20 : 70, armed ? 0.18 : 0.55, "#ff7a2f");
  ctx.fillStyle = armed ? "rgba(26,10,4,0.9)" : "rgba(255,122,47,0.2)";
  ctx.beginPath();
  ctx.arc(0, 0, armed ? 13 : mine.radius * 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(armed ? "#ffd166" : "#ffffff", armed ? blink : 0.8);
  ctx.lineWidth = armed ? 2 : 4;
  ctx.beginPath();
  ctx.arc(0, 0, armed ? 17 : mine.radius * 0.82, 0, TAU);
  ctx.stroke();
  if (armed) {
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#ff7a2f", 0.62);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + state.time;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFallingStar(ctx, starObj) {
  if ((starObj.delay || 0) > 0) return;
  ctx.save();
  ctx.translate(starObj.x, starObj.y);
  ctx.rotate(state.time * 8 + starObj.x * 0.01);
  glow(ctx, 0, 0, 34, 0.48, "#ffd166");
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 - Math.PI / 2;
    const r = i % 2 ? 5 : 14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff3b0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawTeslaNode(ctx, node) {
  const t = state.time + (node.seed || 0);
  const rank = node.qualityRank || 0;
  const armed = (node.armTime || 0) <= 0;
  const charge = armed ? 1 : 0.45 + Math.sin(t * 18) * 0.12;
  const color = node.color || "#42e8ff";
  const r = node.r || 16;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * (armed ? 3.1 : 2.1), armed ? 0.28 : 0.16, color);

  ctx.strokeStyle = hexToRgba(color, armed ? 0.26 : 0.14);
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, node.triggerRadius * (0.98 + Math.sin(t * 2) * 0.015), 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.rotate(t * 1.2);
  ctx.strokeStyle = hexToRgba(rank >= 4 ? "#ffd166" : color, 0.42);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(TAU / 3);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 2.2, r * 0.72, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(5,10,18,0.92)";
  ctx.strokeStyle = hexToRgba(color, 0.86);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + Math.PI / 6;
    const px = Math.cos(a) * r * 1.22;
    const py = Math.sin(a) * r * 1.22;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexToRgba("#ffffff", 0.74 * charge);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const x = -r * 0.45 + i * r * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, -r * 0.68);
    ctx.lineTo(x + Math.sin(t * 9 + i) * 3, r * 0.7);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.85);
  core.addColorStop(0, hexToRgba("#ffffff", 0.92 * charge));
  core.addColorStop(0.46, hexToRgba(color, 0.72 * charge));
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, TAU);
  ctx.fill();

  const sparks = rank >= 3 ? 8 : 5;
  ctx.strokeStyle = hexToRgba(rank >= 4 ? "#ffd166" : color, 0.62);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < sparks; i++) {
    const a = t * (i % 2 ? -1.8 : 2.1) + i * TAU / sparks;
    const bend = a + Math.sin(t * 7 + i) * 0.18;
    const inner = r * (0.95 + (i % 2) * 0.12);
    const outer = r * (1.55 + (i % 3) * 0.18);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(bend) * outer, Math.sin(bend) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArcFx(ctx, fx, k) {
  ctx.lineCap = "round";
  for (const seg of fx.segments) {
    const points = jaggedLine(seg.x1, seg.y1, seg.x2, seg.y2, 8, 10, seg.seed + state.time * 80);
    ctx.strokeStyle = hexToRgba("#ffffff", k);
    ctx.lineWidth = 5 * k;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba(fx.color, k);
    ctx.lineWidth = 2;
    strokePolyline(ctx, points);
    glow(ctx, seg.x2, seg.y2, 18, k * 0.35, fx.color);
  }
  ctx.lineCap = "butt";
}

function drawExplosionFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * progress;
  glow(ctx, fx.x, fx.y, fx.radius * 0.5, k * 0.42, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k);
  ctx.lineWidth = 4 * k;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r * 0.65, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 + fx.seed;
    const inner = r * 0.35;
    const outer = r * (0.82 + (i % 3) * 0.08);
    ctx.beginPath();
    ctx.moveTo(fx.x + Math.cos(a) * inner, fx.y + Math.sin(a) * inner);
    ctx.lineTo(fx.x + Math.cos(a) * outer, fx.y + Math.sin(a) * outer);
    ctx.stroke();
  }
}

function drawIceHitFx(ctx, fx, k) {
  glow(ctx, fx.x, fx.y, 20, k * 0.32, fx.color);
  ctx.strokeStyle = hexToRgba("#dffcff", k);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + state.time;
    ctx.beginPath();
    ctx.moveTo(fx.x, fx.y);
    ctx.lineTo(fx.x + Math.cos(a) * 26 * (1 - k), fx.y + Math.sin(a) * 26 * (1 - k));
    ctx.stroke();
  }
}

function drawMuzzleFx(ctx, fx, k) {
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate(fx.angle);
  ctx.fillStyle = hexToRgba(fx.color, k);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(24 * (1 - k), 0);
  ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDoublePulseFx(ctx, fx, k) {
  const progress = 1 - k;
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = hexToRgba(i ? "#ffffff" : fx.color, k * (i ? 0.55 : 0.85));
    ctx.lineWidth = i ? 2 : 3;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * (progress * (i ? 0.72 : 1.08)), 0, TAU);
    ctx.stroke();
  }
}

function drawShockRingFx(ctx, fx, k) {
  const r = fx.radius * (1 - k);
  glow(ctx, fx.x, fx.y, r * 0.36, k * 0.22, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.82);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.8);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 + state.time;
    ctx.beginPath();
    ctx.moveTo(fx.x + Math.cos(a) * r * 0.72, fx.y + Math.sin(a) * r * 0.72);
    ctx.lineTo(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
    ctx.stroke();
  }
}

function drawFrostZoneFx(ctx, fx, k) {
  const r = fx.radius * (0.92 + Math.sin(state.time * 5) * 0.02);
  ctx.fillStyle = hexToRgba(fx.color, k * 0.08);
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#dffcff", k * 0.55);
  ctx.lineWidth = 1.4;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + state.time * 0.7;
    const x = fx.x + Math.cos(a) * r * 0.55;
    const y = fx.y + Math.sin(a) * r * 0.55;
    ctx.fillStyle = hexToRgba("#ffffff", k * 0.62);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

function drawPrismRailFx(ctx, fx, k) {
  const dx = fx.x2 - fx.x1;
  const dy = fx.y2 - fx.y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const width = fx.width || 12;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  const glowWidth = width * (fx.secondary ? 2.5 : 3.6) * k;
  ctx.strokeStyle = hexToRgba(fx.color, k * (fx.secondary ? 0.2 : 0.32));
  ctx.lineWidth = glowWidth;
  ctx.beginPath();
  ctx.moveTo(fx.x1, fx.y1);
  ctx.lineTo(fx.x2, fx.y2);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.95);
  ctx.lineWidth = Math.max(2, width * 0.34) * k;
  ctx.beginPath();
  ctx.moveTo(fx.x1, fx.y1);
  ctx.lineTo(fx.x2, fx.y2);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(fx.color, k * 0.88);
  ctx.lineWidth = Math.max(1.4, width * 0.16);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(fx.x1 + nx * width * side, fx.y1 + ny * width * side);
    ctx.lineTo(fx.x2 + nx * width * side, fx.y2 + ny * width * side);
    ctx.stroke();
  }

  const ticks = Math.min(12, Math.max(5, Math.floor(len / 120)));
  ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : "#ff65d8", k * 0.62);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < ticks; i++) {
    const t = ((i + state.time * 6 + (fx.seed || 0)) % ticks) / ticks;
    const x = fx.x1 + dx * t;
    const y = fx.y1 + dy * t;
    ctx.beginPath();
    ctx.moveTo(x - nx * width * 1.4 - ux * 8, y - ny * width * 1.4 - uy * 8);
    ctx.lineTo(x + nx * width * 1.4 + ux * 8, y + ny * width * 1.4 + uy * 8);
    ctx.stroke();
  }

  if (fx.rank >= 3) {
    ctx.strokeStyle = hexToRgba("#b48cff", k * 0.42);
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      const x = fx.x1 + dx * t;
      const y = fx.y1 + dy * t;
      const size = width * (0.55 + (i % 2) * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  for (const impact of fx.impacts || []) {
    glow(ctx, impact.x, impact.y, width * 1.4, k * 0.42, fx.color);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.82);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, width * (1.2 - k * 0.35), 0, TAU);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawPrismImpactFx(ctx, fx, k) {
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 5);
  ctx.globalCompositeOperation = "lighter";
  const r = fx.radius * (1 - k * 0.18);
  glow(ctx, 0, 0, r * 0.7, k * 0.48, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.88);
  ctx.lineWidth = 2.4 * k;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.84);
  ctx.lineWidth = 1.7;
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  if (fx.rank >= 2) {
    ctx.strokeStyle = hexToRgba("#ff65d8", k * 0.58);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.strokeRect(-r * 0.36, -r * 0.36, r * 0.72, r * 0.72);
    }
  }
  ctx.restore();
}

function drawVoidPulseFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.28 + progress * 0.82);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 0.42, k * 0.34, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.58);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.86);
  ctx.lineWidth = 2.8;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, r, (fx.seed || 0) + state.time * 2.2, (fx.seed || 0) + state.time * 2.2 + Math.PI * 1.7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : "#ff65d8", k * 0.48);
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 - state.time * 1.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48);
    ctx.lineTo(Math.cos(a + 0.08) * r * 0.94, Math.sin(a + 0.08) * r * 0.94);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVoidCollapseFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * progress;
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 2.5);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, fx.radius * 0.56, k * 0.5, fx.color);
  const blast = ctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(4, r));
  blast.addColorStop(0, hexToRgba("#ffffff", k * 0.72));
  blast.addColorStop(0.22, hexToRgba(fx.color, k * 0.5));
  blast.addColorStop(0.62, hexToRgba("#14001f", k * 0.28));
  blast.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = blast;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.9);
  ctx.lineWidth = 4 * k;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : "#b48cff", k * 0.76);
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const a = i * TAU / 14;
    const bend = a + Math.sin(state.time + i) * 0.08;
    const inner = r * (0.18 + (i % 2) * 0.12);
    const outer = r * (0.8 + (i % 3) * 0.08);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(bend) * outer, Math.sin(bend) * outer);
    ctx.stroke();
  }
  if (fx.rank >= 3) {
    ctx.strokeStyle = hexToRgba("#ff65d8", k * 0.52);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.92, r * 0.28, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTeslaChainFx(ctx, fx, k) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const seg of fx.segments || []) {
    const points = jaggedLine(seg.x1, seg.y1, seg.x2, seg.y2, seg.relay ? 7 : 9, seg.relay ? 7 : 12, (seg.seed || 0) + state.time * 190);
    ctx.strokeStyle = hexToRgba(fx.color, k * 0.22);
    ctx.lineWidth = (fx.rank >= 4 ? 13 : 10) * k;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.98);
    ctx.lineWidth = Math.max(1.8, 4.2 * k);
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba(seg.relay ? "#ffd166" : fx.color, k * 0.92);
    ctx.lineWidth = 1.8;
    strokePolyline(ctx, points);
    glow(ctx, seg.x2, seg.y2, 24, k * 0.32, seg.relay ? "#ffd166" : fx.color);
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawTeslaNodePulseFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.18 + progress * 0.92);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 3.2);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 0.38, k * 0.28, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.72);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : fx.color, k * 0.84);
  ctx.lineWidth = 2.6;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 1.72);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68);
    ctx.lineTo(Math.cos(a + 0.05) * r, Math.sin(a + 0.05) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeslaFieldFx(ctx, fx, k) {
  const r = fx.radius * (0.96 + Math.sin(state.time * 7 + (fx.seed || 0)) * 0.025);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 0.8);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexToRgba(fx.color, k * 0.075);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.52);
  ctx.lineWidth = 1.4;
  for (let ring = 0; ring < 3; ring++) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + ring * 0.18;
      const rr = r * (0.36 + ring * 0.22);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.34);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 - state.time * 1.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPrismBurstFx(ctx, fx, k) {
  glow(ctx, fx.x, fx.y, 22, k * 0.34, fx.color);
  for (const p of fx.points || []) {
    const points = jaggedLine(fx.x, fx.y, p.x, p.y, 4, 7, state.time * 120 + p.x);
    ctx.strokeStyle = hexToRgba("#ffffff", k);
    ctx.lineWidth = 3.5 * k;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba(fx.color, k);
    ctx.lineWidth = 1.6;
    strokePolyline(ctx, points);
  }
}

function drawBladeBloomFx(ctx, fx, k) {
  const r = fx.radius * (1 - k);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.spin || 0) + state.time * 7);
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.9);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6);
    ctx.beginPath();
    ctx.moveTo(r * 0.18, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.65);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawDroneBeamFx(ctx, fx, k) {
  const points = jaggedLine(fx.x1, fx.y1, fx.x2, fx.y2, 6, fx.radius * 0.22, state.time * 110);
  ctx.lineCap = "round";
  ctx.strokeStyle = hexToRgba("#ffffff", k);
  ctx.lineWidth = Math.max(2, fx.radius * 0.24) * k;
  strokePolyline(ctx, points);
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.92);
  ctx.lineWidth = Math.max(1, fx.radius * 0.1);
  strokePolyline(ctx, points);
  ctx.lineCap = "butt";
}

function drawTurretBeamFx(ctx, fx, k) {
  const points = jaggedLine(fx.x1, fx.y1, fx.x2, fx.y2, 5, 5, state.time * 160 + fx.x1);
  ctx.lineCap = "round";
  ctx.strokeStyle = hexToRgba("#ffffff", k);
  ctx.lineWidth = 4 * k;
  strokePolyline(ctx, points);
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.85);
  ctx.lineWidth = 2;
  strokePolyline(ctx, points);
  glow(ctx, fx.x2, fx.y2, 18, k * 0.32, fx.color);
  ctx.lineCap = "butt";
}

function drawItemMineBlastFx(ctx, fx, k) {
  const r = fx.radius * (1 - k);
  glow(ctx, fx.x, fx.y, r * 0.55, k * 0.5, fx.color);
  ctx.strokeStyle = hexToRgba("#fff3b0", k);
  ctx.lineWidth = 4 * k;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.82);
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const a = i * TAU / 14 + fx.seed;
    ctx.beginPath();
    ctx.moveTo(fx.x + Math.cos(a) * r * 0.28, fx.y + Math.sin(a) * r * 0.28);
    ctx.lineTo(fx.x + Math.cos(a) * r * 1.08, fx.y + Math.sin(a) * r * 1.08);
    ctx.stroke();
  }
}

function drawStarImpactFx(ctx, fx, k) {
  const r = fx.radius * (1 - k);
  glow(ctx, fx.x, fx.y, r * 0.44, k * 0.45, fx.color);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate(state.time * 5);
  ctx.strokeStyle = hexToRgba("#fff3b0", k);
  ctx.lineWidth = 3 * k;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.beginPath();
    ctx.moveTo(r * 0.12, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.82);
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r * 0.58, 0, TAU);
  ctx.stroke();
}

function drawStarfallWarningFx(ctx, fx, k) {
  const charge = 1 - k;
  const r = fx.radius * (0.9 + Math.sin(state.time * 8 + (fx.seed || 0)) * 0.025);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 1.8);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 0.38, (0.12 + charge * 0.18) * k, fx.color);
  ctx.strokeStyle = hexToRgba(fx.major ? "#ffd166" : fx.color, 0.64 * k);
  ctx.lineWidth = fx.major ? 2.4 : 1.7;
  ctx.setLineDash([9, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = hexToRgba("#ffffff", 0.46 * k);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    ctx.lineTo(Math.cos(a) * r * (0.82 + charge * 0.16), Math.sin(a) * r * (0.82 + charge * 0.16));
    ctx.stroke();
  }
  drawStarShape(ctx, 0, 0, r * 0.22 * (0.7 + charge * 0.5), r * 0.08, 10);
  ctx.strokeStyle = hexToRgba(fx.major ? "#ffd166" : fx.color, 0.76 * k);
  ctx.stroke();
  ctx.restore();
}

function drawStarfallImpactFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.18 + progress * 0.95);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 3);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, fx.radius * 0.56, k * 0.48, fx.color);
  const blast = ctx.createRadialGradient(0, 0, 3, 0, 0, Math.max(4, r));
  blast.addColorStop(0, hexToRgba("#ffffff", k * 0.72));
  blast.addColorStop(0.28, hexToRgba(fx.major ? "#ffd166" : fx.color, k * 0.48));
  blast.addColorStop(0.78, hexToRgba("#ff65d8", k * 0.12));
  blast.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = blast;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.86);
  ctx.lineWidth = 3.5 * k;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.major ? "#ffd166" : fx.color, k * 0.86);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const bend = a + Math.sin(state.time + i) * 0.08;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
    ctx.lineTo(Math.cos(bend) * r, Math.sin(bend) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStarScarFx(ctx, fx, k) {
  const r = fx.radius * (0.96 + Math.sin(state.time * 7 + (fx.seed || 0)) * 0.025);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 0.55);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexToRgba(fx.color, k * 0.075);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.52);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(TAU / 3);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r * 0.28, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.34);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 - state.time;
    drawStarShape(ctx, Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, 5 + (i % 3), 2, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStarConstellationFx(ctx, fx, k) {
  const points = fx.points || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const line = jaggedLine(a.x, a.y, b.x, b.y, 5, 5, (fx.seed || 0) + state.time * 80 + i);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.72);
    ctx.lineWidth = 3 * k;
    strokePolyline(ctx, line);
    ctx.strokeStyle = hexToRgba(fx.color, k * 0.82);
    ctx.lineWidth = 1.4;
    strokePolyline(ctx, line);
    glow(ctx, a.x, a.y, 18, k * 0.26, fx.color);
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawPhaseNeedleHitFx(ctx, fx, k) {
  const r = (fx.major ? 34 : 24) * (1 - k);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.angle || 0) + Math.PI / 2);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 0.72, k * 0.34, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.88);
  ctx.lineWidth = fx.major ? 3 : 2;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(r * 0.15, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.9);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.26, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPhaseNeedleMarkFx(ctx, fx, k) {
  const charge = 1 - k;
  const r = 18 + charge * 14 + Math.sin(state.time * 16 + (fx.seed || 0)) * 1.8;
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * (fx.major ? 4.2 : 3.2));
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 1.15, (0.14 + charge * 0.18) * k, fx.color);
  ctx.strokeStyle = hexToRgba("#42e8ff", 0.52 * k);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = hexToRgba(fx.color, 0.84 * k);
  ctx.lineWidth = fx.major ? 2.3 : 1.6;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.lineTo(r * 0.28, 0);
    ctx.lineTo(0, r * 0.78);
    ctx.lineTo(-r * 0.28, 0);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", (0.34 + charge * 0.46) * k);
  ctx.beginPath();
  ctx.moveTo(-r * 0.52, 0);
  ctx.lineTo(r * 0.52, 0);
  ctx.moveTo(0, -r * 0.52);
  ctx.lineTo(0, r * 0.52);
  ctx.stroke();
  ctx.restore();
}

function drawPhaseNeedleBurstFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.2 + progress * 0.9);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 5.2);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, fx.radius * 0.72, k * 0.5, fx.color);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(5, r));
  grad.addColorStop(0, hexToRgba("#ffffff", k * 0.72));
  grad.addColorStop(0.32, hexToRgba("#42e8ff", k * 0.36));
  grad.addColorStop(0.62, hexToRgba(fx.color, k * 0.24));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.86);
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.major ? "#ffd166" : fx.color, k * 0.9);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const bend = a + Math.sin((fx.seed || 0) + i + state.time * 3) * 0.12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
    ctx.lineTo(Math.cos(bend) * r * (0.82 + (i % 3) * 0.08), Math.sin(bend) * r * (0.82 + (i % 3) * 0.08));
    ctx.stroke();
  }
  ctx.restore();
}

function drawPhaseNeedleRiftFx(ctx, fx, k) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const seg of fx.segments || []) {
    const points = jaggedLine(seg.x1, seg.y1, seg.x2, seg.y2, fx.major ? 9 : 7, fx.major ? 14 : 10, (seg.seed || 0) + state.time * 150);
    ctx.strokeStyle = hexToRgba(fx.color, k * 0.28);
    ctx.lineWidth = fx.major ? 12 : 8;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.86);
    ctx.lineWidth = fx.major ? 4 : 3;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba("#42e8ff", k * 0.72);
    ctx.lineWidth = 1.5;
    strokePolyline(ctx, points);
  }
  glow(ctx, fx.x, fx.y, fx.radius * 0.36, k * 0.26, fx.color);
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawEchoConeFx(ctx, fx, k) {
  const progress = 1 - k;
  const start = fx.angle - fx.coneAngle / 2;
  const end = fx.angle + fx.coneAngle / 2;
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, fx.range * 0.28, k * 0.08, fx.color);
  for (let band = 0; band < 4; band++) {
    const radius = fx.range * (0.26 + band * 0.22 + progress * 0.18);
    const alpha = k * (0.2 - band * 0.025);
    ctx.fillStyle = hexToRgba(band % 2 ? "#ffffff" : fx.color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hexToRgba(band % 2 ? "#ffffff" : fx.color, alpha * 2.6);
    ctx.lineWidth = fx.secondary ? 1.3 : 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.58);
  ctx.lineWidth = 2.4 * k;
  for (const a of [start, fx.angle, end]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
    ctx.lineTo(Math.cos(a) * fx.range * (0.95 + progress * 0.04), Math.sin(a) * fx.range * (0.95 + progress * 0.04));
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : fx.color, k * 0.78);
  ctx.lineWidth = fx.rank >= 4 ? 2.2 : 1.4;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const a = start + fx.coneAngle * t + Math.sin(state.time * 8 + i + (fx.seed || 0)) * 0.012;
    const r1 = fx.range * (0.18 + progress * 0.12);
    const r2 = fx.range * (0.82 + Math.sin(i + state.time * 5) * 0.025);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEchoWaveFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.16 + progress * 0.92);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 1.8);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * 0.42, k * 0.26, fx.color);
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.72);
  ctx.lineWidth = fx.secondary ? 1.6 : 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(fx.color, k * 0.86);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.72 + i * 0.14), Math.sin(state.time + i), TAU - Math.cos(state.time + i));
    ctx.stroke();
  }
  ctx.fillStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : fx.color, k * 0.65);
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 + state.time * (i % 2 ? -1.1 : 1.4);
    const pr = r * (0.74 + (i % 3) * 0.09);
    const s = 2 + (i % 3);
    ctx.fillRect(Math.cos(a) * pr - s / 2, Math.sin(a) * pr - s / 2, s, s);
  }
  ctx.restore();
}

function drawEchoResonanceFx(ctx, fx, k) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const side = fx.angle + Math.PI / 2;
  for (let i = -2; i <= 2; i++) {
    const offset = i * 16;
    const x1 = fx.x + Math.cos(side) * offset;
    const y1 = fx.y + Math.sin(side) * offset;
    const x2 = fx.x2 + Math.cos(side) * offset * 0.35;
    const y2 = fx.y2 + Math.sin(side) * offset * 0.35;
    const points = jaggedLine(x1, y1, x2, y2, 8, 7 + Math.abs(i) * 1.2, (fx.seed || 0) + i * 31 + state.time * 110);
    ctx.strokeStyle = hexToRgba(fx.color, k * 0.2);
    ctx.lineWidth = fx.rank >= 4 ? 10 : 7;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.76);
    ctx.lineWidth = Math.max(1, (3 - Math.abs(i) * 0.42) * k);
    strokePolyline(ctx, points);
  }
  glow(ctx, fx.x2, fx.y2, 42 + fx.rank * 7, k * 0.32, fx.rank >= 4 ? "#ffd166" : fx.color);
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawRiftLoomFx(ctx, fx, k) {
  const progress = 1 - k;
  const points = [];
  const radius = (fx.baseRadius || fx.radius) * (1 - progress * 0.34);
  for (let i = 0; i < fx.anchors; i++) {
    const a = (fx.spin || 0) + i * TAU / fx.anchors + Math.sin(state.time * 5 + i + (fx.seed || 0)) * 0.025;
    const r = radius * (0.92 + Math.sin(state.time * 5 + i + (fx.seed || 0)) * 0.035);
    points.push({ x: fx.x + Math.cos(a) * r, y: fx.y + Math.sin(a) * r });
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, fx.x, fx.y, radius * 0.58, k * 0.2, fx.color);
  ctx.lineCap = "round";
  drawRiftSegments(ctx, points, fx.rank || 0, fx.color, k, fx.seed || 0, fx.secondary);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const pulse = 1 + Math.sin(state.time * 9 + i + (fx.seed || 0)) * 0.08;
    glow(ctx, p.x, p.y, 18 * pulse, k * 0.36, fx.rank >= 4 ? "#ffd166" : fx.color);
    ctx.fillStyle = hexToRgba("#ffffff", k * 0.92);
    diamondAt(ctx, p.x, p.y, 5.5 * pulse);
    ctx.strokeStyle = hexToRgba(fx.rank >= 4 ? "#ffd166" : fx.color, k * 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12 * pulse, state.time * 4, state.time * 4 + Math.PI * 1.35);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", k * 0.18);
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, radius * (0.88 + Math.sin(state.time * 4 + (fx.seed || 0)) * 0.025), 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawRiftSegments(ctx, points, rank, color, k, seed, secondary) {
  if (points.length < 2) return;
  const segments = [];
  for (let i = 0; i < points.length; i++) segments.push([points[i], points[(i + 1) % points.length], false]);
  if (rank >= 2 && points.length >= 4) {
    for (let i = 0; i < points.length; i++) segments.push([points[i], points[(i + 2) % points.length], true]);
  }
  for (let i = 0; i < segments.length; i++) {
    const [a, b, diagonal] = segments[i];
    const line = jaggedLine(a.x, a.y, b.x, b.y, diagonal ? 5 : 7, diagonal ? 5 : 8, seed + i * 17 + state.time * 95);
    ctx.strokeStyle = hexToRgba(color, k * (secondary ? 0.2 : 0.28));
    ctx.lineWidth = diagonal ? 6 : 9;
    strokePolyline(ctx, line);
    ctx.strokeStyle = hexToRgba("#ffffff", k * (diagonal ? 0.48 : 0.78));
    ctx.lineWidth = diagonal ? 1.4 : 2.4;
    strokePolyline(ctx, line);
    ctx.strokeStyle = hexToRgba(rank >= 4 ? "#ffd166" : "#42e8ff", k * 0.64);
    ctx.lineWidth = diagonal ? 0.8 : 1.2;
    strokePolyline(ctx, line);
  }
}

function drawRiftCollapseFx(ctx, fx, k) {
  const progress = 1 - k;
  const r = fx.radius * (0.18 + progress * 0.78);
  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate((fx.seed || 0) + state.time * 5.5);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, fx.radius * 0.62, k * 0.5, fx.color);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(5, r));
  grad.addColorStop(0, hexToRgba("#ffffff", k * 0.86));
  grad.addColorStop(0.28, hexToRgba(fx.rank >= 4 ? "#ffd166" : fx.color, k * 0.44));
  grad.addColorStop(0.72, hexToRgba("#42e8ff", k * 0.14));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    ctx.strokeStyle = hexToRgba(i % 2 ? "#ffffff" : fx.color, k * 0.82);
    ctx.lineWidth = i % 2 ? 2.8 * k : 5.5 * k;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
    ctx.lineTo(Math.cos(a + Math.sin(state.time + i) * 0.04) * fx.radius * 0.9, Math.sin(a + Math.sin(state.time + i) * 0.04) * fx.radius * 0.9);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawRiftScarFx(ctx, fx, k) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < (fx.segments || []).length; i++) {
    const seg = fx.segments[i];
    const points = jaggedLine(seg.x1, seg.y1, seg.x2, seg.y2, 6, 7, (fx.seed || 0) + i * 23 + state.time * 70);
    ctx.strokeStyle = hexToRgba(fx.color, k * 0.22);
    ctx.lineWidth = 7;
    strokePolyline(ctx, points);
    ctx.strokeStyle = hexToRgba("#ffffff", k * 0.5);
    ctx.lineWidth = 1.6;
    strokePolyline(ctx, points);
  }
  ctx.lineCap = "butt";
  ctx.restore();
}

function jaggedLine(x1, y1, x2, y2, steps, amp, seed) {
  const points = [];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jitter = i === 0 || i === steps ? 0 : Math.sin(seed + i * 12.9898) * amp;
    points.push({ x: x1 + dx * t + nx * jitter, y: y1 + dy * t + ny * jitter });
  }
  return points;
}

function strokePolyline(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawGems(ctx) {
  for (const g of world.gems) {
    if (!inView(g.x, g.y, 40)) continue;
    ctx.fillStyle = g.value >= 15 ? "#b48cff" : g.value >= 8 ? "#77ff8a" : "#42e8ff";
    diamondAt(ctx, g.x, g.y + Math.sin(state.time * 6 + g.phase) * 2, 6);
  }
}

function drawCoins(ctx) {
  for (const c of world.coins) {
    if (!inView(c.x, c.y, 40)) continue;
    const r = c.value >= 5 ? 5.5 : 4.5;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#fff3b0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.58, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(3,6,12,0.45)";
    ctx.fillRect(c.x - 1, c.y - r * 0.42, 2, r * 0.84);
  }
}

function drawEnemyProjectiles(ctx) {
  for (const b of world.enemyProjectiles) {
    if (b.shape === "snowflake" || b.shape === "frostComet") {
      drawSnowflakeProjectile(ctx, b);
      continue;
    }
    if (b.shape === "fireball") {
      drawFireballProjectile(ctx, b);
      continue;
    }
    if (b.shape === "voidFireball") {
      drawVoidFireballProjectile(ctx, b);
      continue;
    }
    if (b.shape === "stormBlade" || b.shape === "stormOrb") {
      drawStormProjectile(ctx, b);
      continue;
    }
    if (b.shape === "pylonBolt" || b.shape === "gunnerShot" || b.shape === "laserShard") {
      drawEnemyBolt(ctx, b);
      continue;
    }
    if (b.shape === "arcaneOrb" || b.shape === "starShard" || b.shape === "phaseShard" || b.shape === "razorBoomerang" || b.shape === "fastGear") {
      drawSpecialEnemyProjectile(ctx, b);
      continue;
    }
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
  }
}

function drawItemObjects(ctx) {
  for (const obj of world.itemObjects) {
    if (!inView(obj.x, obj.y, 120)) continue;
    if (obj.kind === "turret") drawAllyTurret(ctx, obj);
    else if (obj.kind === "landmine") drawAllyMine(ctx, obj);
    else if (obj.kind === "fallingStar") drawFallingStar(ctx, obj);
    else if (obj.kind === "tesla_node") drawTeslaNode(ctx, obj);
    else if (obj.kind === "storm_portal") drawStormPortal(ctx, obj);
    else if (obj.kind === "easter_signature" || obj.kind === "easter_terminal") drawEasterEggObject(ctx, obj);
  }
}

function drawSpecialEnemyProjectile(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate((b.spin || 0) + (b.shape === "razorBoomerang" ? angle : 0));
  if (enemyProjectileHasHalo(b)) glow(ctx, 0, 0, b.r * 2.2, 0.42, b.color);
  if (b.shape === "arcaneOrb") {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.55, 0, TAU);
    ctx.stroke();
    ctx.rotate(TAU / 8);
    ctx.strokeRect(-b.r, -b.r, b.r * 2, b.r * 2);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.62, 0, TAU);
    ctx.fill();
  } else if (b.shape === "starShard") {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 - Math.PI / 2;
      const r = i % 2 ? b.r * 0.55 : b.r * 1.75;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (b.shape === "phaseShard") {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(b.r * 2, 0);
    ctx.lineTo(-b.r * 0.9, -b.r * 0.9);
    ctx.lineTo(-b.r * 0.35, 0);
    ctx.lineTo(-b.r * 0.9, b.r * 0.9);
    ctx.closePath();
    ctx.fill();
  } else if (b.shape === "razorBoomerang") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(-b.r * 2.2, -b.r * 0.35);
    ctx.quadraticCurveTo(0, -b.r * 2.2, b.r * 2.2, -b.r * 0.25);
    ctx.lineTo(b.r * 1.2, b.r * 0.6);
    ctx.quadraticCurveTo(0, -b.r * 0.25, -b.r * 1.2, b.r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (b.shape === "fastGear") {
    drawMiniGear(ctx, 0, 0, b.r * 1.8, 10, b.color);
  }
  ctx.restore();
}

function drawEnemyBolt(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(angle);
  const long = b.shape === "pylonBolt" || b.shape === "laserShard" || b.long;
  const pulse = 0.78 + Math.sin(state.time * 18 + (b.spin || 0)) * 0.22;
  ctx.globalCompositeOperation = "lighter";
  if (enemyProjectileHasHalo(b)) glow(ctx, -b.r * 1.4, 0, b.r * (long ? 3.6 : 2.2), long ? 0.72 : 0.34, b.color);
  ctx.strokeStyle = hexToRgba(b.color, long ? 0.34 : 0.22);
  ctx.lineWidth = long ? 12 : 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-b.r * (long ? 4.2 : 2.5), 0);
  ctx.lineTo(b.r * (long ? 2.8 : 1.9), 0);
  ctx.stroke();
  ctx.strokeStyle = long ? "#ffffff" : b.color;
  ctx.lineWidth = long ? 4.2 : 2.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-b.r * (long ? 3.2 : 2), 0);
  ctx.lineTo(b.r * (long ? 2.6 : 1.8), 0);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = hexToRgba("#ffffff", long ? 0.45 : 0.26);
  ctx.lineWidth = 1.1;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(-b.r * 2.4, i * b.r * 0.85);
    ctx.lineTo(b.r * 1.5, i * b.r * 0.18);
    ctx.stroke();
  }
  ctx.fillStyle = long ? b.color : "#ffffff";
  ctx.beginPath();
  ctx.moveTo(b.r * (2.8 + pulse * 0.2), 0);
  ctx.lineTo(-b.r * 0.45, -b.r * 0.82);
  ctx.lineTo(-b.r * 0.45, b.r * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(b.r * 0.5, 0, b.r * 0.42, b.r * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFireballProjectile(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(angle);
  if (enemyProjectileHasHalo(b)) {
    glow(ctx, 0, 0, b.r * 3.2, 0.62, "#ff4d1f");
    glow(ctx, -b.r * 1.3, 0, b.r * 2.4, 0.36, "#ffd166");
  }
  ctx.fillStyle = "rgba(255,77,31,0.26)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(-b.r * (1.3 + i * 0.52), Math.sin(state.time * 10 + i) * b.r * 0.18, b.r * (1.8 - i * 0.24), b.r * (0.72 - i * 0.08), 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,122,26,0.5)";
  ctx.beginPath();
  ctx.ellipse(-b.r * 1.1, 0, b.r * 1.8, b.r * 0.78, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.rotate((b.spin || 0) + state.time * 8);
  ctx.strokeStyle = "rgba(255,242,168,0.72)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.beginPath();
    ctx.moveTo(-b.r * 0.2, 0);
    ctx.lineTo(b.r * 1.8, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = "#ff4d1f";
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 1.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff2a8";
  ctx.beginPath();
  ctx.arc(b.r * 0.28, -b.r * 0.15, b.r * 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 1.25, -0.8, 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawStormProjectile(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.shape === "stormBlade" ? angle : (b.spin || 0) + state.time * 8);
  ctx.globalCompositeOperation = "lighter";
  if (enemyProjectileHasHalo(b)) glow(ctx, 0, 0, b.r * 3.1, 0.62, b.color);
  if (b.shape === "stormBlade") {
    ctx.fillStyle = hexToRgba(b.color, 0.22);
    ctx.beginPath();
    ctx.ellipse(-b.r * 1.25, 0, b.r * 3.1, b.r * 1.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(b.r * 2.8, 0);
    ctx.lineTo(-b.r * 0.8, -b.r * 0.95);
    ctx.lineTo(-b.r * 1.8, 0);
    ctx.lineTo(-b.r * 0.8, b.r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = hexToRgba("#d9fbff", 0.62);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.r * 2.2, 0);
    ctx.lineTo(-b.r * 0.65, 0);
    ctx.stroke();
  } else {
    ctx.strokeStyle = hexToRgba(b.color, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.85, state.time * 2, state.time * 2 + Math.PI * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.28, -state.time * 2.6, -state.time * 2.6 + Math.PI * 1.1);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath();
      ctx.moveTo(-b.r * 1.4, 0);
      ctx.lineTo(b.r * 1.4, 0);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.05, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.38, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSnowflakeProjectile(ctx, b) {
  const spin = (b.spin || 0) + state.time * 7;
  const comet = b.shape === "frostComet";
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(spin);
  ctx.globalCompositeOperation = "lighter";
  if (enemyProjectileHasHalo(b)) glow(ctx, 0, 0, b.r * (comet ? 3.25 : 2.1), comet ? 0.72 : 0.52, comet ? "#b48cff" : b.color);
  if (comet) {
    const angle = Math.atan2(b.vy, b.vx) - spin;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(180,140,255,0.32)";
    ctx.beginPath();
    ctx.ellipse(-b.r * 2.35, 0, b.r * 3.2, b.r * 0.82, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-b.r * 4.8, -b.r * 0.28);
    ctx.lineTo(-b.r * 0.8, 0);
    ctx.lineTo(-b.r * 4.8, b.r * 0.28);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "#dffcff";
  ctx.lineWidth = comet ? 2.2 : 1.6;
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
  ctx.arc(0, 0, b.r * (comet ? 0.78 : 0.62), 0, TAU);
  ctx.fill();
  if (comet) {
    ctx.strokeStyle = "rgba(180,140,255,0.8)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.35, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawHazards(ctx) {
  for (const h of world.hazards) {
    const alpha = Math.max(0, h.life / h.maxLife);
    if (h.kind === "ember_mine") {
      drawEmberMineHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "artillery_blast") {
      drawArtilleryHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "gear_trap") {
      drawGearTrapHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "magma_crack") {
      drawMagmaCrackHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "twin_arc_field") {
      drawTwinArcFieldHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "ice_spike" || h.kind === "ice_seal") {
      drawIceHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "frost_zone" || h.kind === "blizzard_core") {
      drawFrostZoneHazard(ctx, h, alpha);
      continue;
    }
    if (h.kind === "storm_laser_net") {
      drawStormLaserNetHazard(ctx, h, alpha);
      continue;
    }
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, 0, 0, h.r * 0.86, alpha * 0.34, h.color);
    ctx.fillStyle = hexToRgba(h.color, alpha * 0.16);
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexToRgba("#ffffff", alpha * 0.32);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, h.r * (0.72 + Math.sin(state.time * 8 + h.x) * 0.05), 0, TAU); ctx.stroke();
    ctx.strokeStyle = hexToRgba(h.color, alpha * 0.78);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawGearTrapHazard(ctx, h, alpha) {
  ctx.save();
  ctx.translate(h.x, h.y);
  drawMiniGear(ctx, 0, 0, h.r * 0.8, 14, h.color, (h.spin || 0) + state.time * 7);
  ctx.strokeStyle = hexToRgba(h.color, alpha * 0.52);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, h.r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMagmaCrackHazard(ctx, h, alpha) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle || 0);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, h.r * 1.15, alpha * 0.58, h.color);
  ctx.fillStyle = hexToRgba(h.color, alpha * 0.26);
  ctx.beginPath();
  ctx.ellipse(0, 0, h.r * 1.62, h.r * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ff4d6d", alpha * 0.54);
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-h.r * 1.28, 0);
  ctx.lineTo(-h.r * 0.38, -h.r * 0.18);
  ctx.lineTo(h.r * 0.15, h.r * 0.2);
  ctx.lineTo(h.r * 1.28, 0);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#fff2a8", alpha * 0.86);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-h.r * 1.2, 0);
  ctx.lineTo(-h.r * 0.35, -h.r * 0.16);
  ctx.lineTo(h.r * 0.15, h.r * 0.18);
  ctx.lineTo(h.r * 1.2, 0);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = -h.r * 0.9 + i * h.r * 0.6;
    ctx.strokeStyle = hexToRgba("#ffd166", alpha * (0.22 + i * 0.06));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, -h.r * 0.2);
    ctx.lineTo(x + h.r * 0.18, -h.r * (0.48 + (i % 2) * 0.12));
    ctx.moveTo(x + h.r * 0.08, h.r * 0.16);
    ctx.lineTo(x + h.r * 0.26, h.r * (0.42 + (i % 2) * 0.12));
    ctx.stroke();
  }
  ctx.restore();
}

function drawTwinArcFieldHazard(ctx, h, alpha) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.82 + Math.sin(state.time * 9 + h.x * 0.03) * 0.18;
  glow(ctx, 0, 0, h.r * 1.05, alpha * 0.46, h.color);
  ctx.fillStyle = hexToRgba(h.color, alpha * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, h.r * pulse, 0, TAU);
  ctx.fill();
  for (let ring = 0; ring < 3; ring++) {
    const r = h.r * (0.42 + ring * 0.24);
    ctx.strokeStyle = ring === 1 ? hexToRgba("#ffffff", alpha * 0.42) : hexToRgba(h.color, alpha * 0.72);
    ctx.lineWidth = ring === 0 ? 3 : 1.6;
    ctx.setLineDash(ring === 2 ? [8, 7] : []);
    ctx.beginPath();
    ctx.arc(0, 0, r, state.time * (ring + 1) * 0.8, state.time * (ring + 1) * 0.8 + Math.PI * 1.55);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = hexToRgba("#d9fbff", alpha * 0.72);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + state.time * 1.25;
    const r1 = h.r * 0.22;
    const r2 = h.r * (0.72 + (i % 2) * 0.14);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.12) * r2, Math.sin(a + 0.12) * r2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMiniGear(ctx, x, y, r, teeth, color, spin = state.time * 10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = i * TAU / (teeth * 2);
    const rr = i % 2 ? r * 0.72 : r;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawIceHazard(ctx, h, alpha) {
  const armed = (h.armTime || 0) <= 0;
  const warn = Math.max(0, h.armTime || 0) / (h.kind === "ice_seal" ? 0.95 : 0.72);
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle || h.spikeAngle || 0);
  if (!armed) {
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, 0, 0, h.r * (0.76 + (1 - warn) * 0.24), 0.16 + (1 - warn) * 0.26, h.color);
    ctx.fillStyle = hexToRgba(h.color, 0.07 + (1 - warn) * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#d9fbff", 0.48 + Math.sin(state.time * 18) * 0.12);
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, h.r * (0.7 + (1 - warn) * 0.28), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = hexToRgba(h.color, 0.7);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * h.r * 0.25, Math.sin(a) * h.r * 0.25);
      ctx.lineTo(Math.cos(a) * h.r * 0.95, Math.sin(a) * h.r * 0.95);
      ctx.stroke();
    }
  } else {
    const k = Math.max(0, h.life / 0.34);
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, 0, 0, h.r * 0.9, k * 0.62, h.color);
    ctx.fillStyle = hexToRgba(h.color, k * 0.45);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    const count = h.kind === "ice_seal" ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * h.r * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, -h.r * 0.95);
      ctx.lineTo(x + h.r * 0.24, h.r * 0.35);
      ctx.lineTo(x - h.r * 0.24, h.r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFrostZoneHazard(ctx, h, alpha) {
  ctx.save();
  ctx.translate(h.x, h.y);
  const r = h.r * (1 + Math.sin(state.time * 5 + h.x) * 0.04);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, r * (h.kind === "blizzard_core" ? 1.25 : 0.8), alpha * (h.kind === "blizzard_core" ? 0.32 : 0.2), h.color);
  ctx.fillStyle = hexToRgba(h.color, alpha * (h.kind === "blizzard_core" ? 0.1 : 0.18));
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.25, r * 0.75, Math.sin(state.time + h.y) * 0.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#d9fbff", alpha * 0.44);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.45 + i * 0.22), state.time * 0.8 + i, state.time * 0.8 + i + Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArtilleryHazard(ctx, h, alpha) {
  const armed = (h.armTime || 0) <= 0;
  const armDuration = h.armDuration || 0.82;
  const warn = Math.max(0, h.armTime || 0) / armDuration;
  ctx.save();
  ctx.translate(h.x, h.y);
  if (!armed) {
    const shellY = (h.shellY || -420) * warn;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexToRgba(h.color, 0.62);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, shellY - 90);
    ctx.lineTo(0, -8);
    ctx.stroke();
    ctx.fillStyle = hexToRgba("#fff2a8", 0.9);
    ctx.beginPath();
    ctx.ellipse(0, shellY, h.r * 0.13, h.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hexToRgba(h.color, 0.08 + (1 - warn) * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#ffffff", 0.38 + Math.sin(state.time * 18) * 0.12);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, h.r * (0.86 + (1 - warn) * 0.18), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = hexToRgba(h.color, 0.74);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + state.time * 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * h.r * 0.62, Math.sin(a) * h.r * 0.62);
      ctx.lineTo(Math.cos(a) * h.r, Math.sin(a) * h.r);
      ctx.stroke();
    }
  } else {
    const k = Math.max(0, h.life / 0.26);
    glow(ctx, 0, 0, h.r * 0.72, k * 0.5, h.color);
    ctx.fillStyle = hexToRgba(h.color, k * 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#fff2a8", k);
    ctx.lineWidth = 4 * k;
    ctx.beginPath();
    ctx.arc(0, 0, h.r * (1.05 - k * 0.2), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemyShield(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const r = e.r + 8 + Math.sin(state.time * 6 + e.x * 0.01) * 2;
  ctx.strokeStyle = hexToRgba("#7dd3fc", 0.34);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + Math.PI / 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawEliteOutline(ctx, e) {
  const style = eliteOutlineStyle(e);
  if (!style) return;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash(e.eliteVariant === "giant" ? [10, 5] : [5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, e.r + 8 + Math.sin(state.time * 5) * 2, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawScenarioOverlay(ctx) {
  const effect = activeWaveEffect("blind") ? "blind" : activeWaveEffect("ice_skate") ? "ice_skate" : null;
  const style = scenarioOverlayStyle(effect);
  if (!style) return;
  ctx.fillStyle = style.color;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawEmberMineHazard(ctx, h, alpha) {
  const armed = (h.armTime || 0) <= 0;
  const blink = armed ? 0.55 + Math.sin(state.time * 9 + (h.pulse || 0)) * 0.25 : 0.22;
  const r = h.triggered ? h.r : h.baseRadius || h.r;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.fillStyle = hexToRgba("#150905", 0.78 * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(h.color, blink * alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * (armed ? 1.15 : 0.86), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = hexToRgba("#ffd166", (armed ? 0.8 : 0.35) * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(3, r * 0.18), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(h.color, 0.42 * alpha);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + state.time * 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
    ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBossBar(ctx) {
  const b = world.boss;
  if (!b || b.dead) return;
  const layout = bossHudLayout(viewport, b);
  const { x, y, w } = layout.bar;
  if (b.shared?.members) {
    drawTwinBossBar(ctx, b, x, y, w);
    return;
  }
  const hpRatio = Math.max(0, b.hp / b.maxHp);
  ctx.fillStyle = "rgba(6,9,18,0.9)";
  ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 6, y + 5, w - 12, 18);
  const fill = ctx.createLinearGradient(x, y, x + w, y);
  fill.addColorStop(0, "#ff345f");
  fill.addColorStop(0.58, "#ff6b4a");
  fill.addColorStop(1, "#ffd166");
  ctx.fillStyle = fill;
  ctx.fillRect(x + 6, y + 5, (w - 12) * hpRatio, 18);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 6, y + 5, (w - 12) * hpRatio, 4);
  ctx.strokeStyle = "rgba(255,209,102,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, 26);
  drawBossHpText(ctx, layout.bar.text, y + 20, 14);
}

function drawStormPortal(ctx, obj) {
  const alpha = Math.max(0, obj.life / obj.maxLife);
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.86 + Math.sin(state.time * 12 + obj.x * 0.01) * 0.1;
  const r = obj.r * (0.72 + (1 - alpha) * 0.42) * pulse;
  glow(ctx, 0, 0, r * 1.75, alpha * 0.52, obj.color);
  ctx.strokeStyle = hexToRgba(obj.color, alpha * 0.86);
  ctx.lineWidth = obj.phase === "exit" ? 5.5 : 4;
  ctx.rotate(state.time * (obj.phase === "exit" ? -5 : 4));
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.66, r, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#42e8ff", alpha * 0.42);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.92, r * 1.18, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#ffffff", alpha * 0.58);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.36, r * 0.72, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawStormLaserNetHazard(ctx, h, alpha) {
  const armed = (h.armTime || 0) <= 0;
  const warn = Math.max(0, h.armTime || 0) / 0.55;
  const age = Math.max(0, (h.maxLife || 1) - h.life);
  const activeAge = Math.max(0, age - (h.armDuration || 0.55));
  const surge = armed ? Math.max(0, 1 - Math.abs(activeAge - (h.surgeTime || 0.22)) / 0.18) : 0;
  const flicker = armed ? 0.72 + Math.sin(state.time * 46 + h.x * 0.01) * 0.28 : 1;
  const power = armed ? Math.max(0.42, flicker + surge * 1.35) : 1;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle || 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexToRgba(armed ? h.color : "#ffffff", armed ? alpha * Math.min(1, 0.58 + power * 0.34) : 0.24 + (1 - warn) * 0.36);
  ctx.lineWidth = armed ? (h.width || 22) * power : 5;
  ctx.lineCap = "round";
  if (!armed) ctx.setLineDash([28, 16]);
  ctx.beginPath();
  ctx.moveTo(-(h.length || 1200) / 2, 0);
  ctx.lineTo((h.length || 1200) / 2, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  if (armed) {
    ctx.strokeStyle = hexToRgba("#ff4dff", alpha * surge * 0.58);
    ctx.lineWidth = (h.width || 22) * 1.7;
    ctx.beginPath();
    ctx.moveTo(-(h.length || 1200) / 2, 0);
    ctx.lineTo((h.length || 1200) / 2, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", armed ? alpha * Math.min(1, 0.62 + surge * 0.38) : 0.5);
  ctx.lineWidth = armed ? 5 + surge * 6 : 1.5;
  ctx.beginPath();
  ctx.moveTo(-(h.length || 1200) / 2, 0);
  ctx.lineTo((h.length || 1200) / 2, 0);
  ctx.stroke();
  ctx.restore();
}

function drawVoidFireballProjectile(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(angle);
  if (enemyProjectileHasHalo(b)) glow(ctx, 0, 0, b.r * 3.0, 0.52, b.color || "#b48cff");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexToRgba("#b48cff", 0.34);
  ctx.beginPath();
  ctx.ellipse(-b.r * 1.1, 0, b.r * 2.4, b.r * 0.78, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba("#ffffff", 0.72);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-b.r * 1.8, -b.r * 0.72);
  ctx.lineTo(b.r * 1.35, 0);
  ctx.lineTo(-b.r * 1.8, b.r * 0.72);
  ctx.stroke();
  ctx.fillStyle = b.color || "#b48cff";
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 1.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(b.r * 0.24, -b.r * 0.12, b.r * 0.42, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBossHpText(ctx, text, y, size = 12) {
  if (!text) return;
  ctx.fillStyle = "#f3f7ff";
  ctx.font = `${size}px ${CANVAS_PIXEL_FONT}`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, viewport.width / 2, y);
  ctx.shadowBlur = 0;
}

function drawBossDirectionIndicator(ctx) {
  const indicator = bossDirectionIndicator(viewport, { x: state.cameraX, y: state.cameraY }, world.boss);
  if (!indicator.visible) return;
  const pulse = 0.85 + Math.sin(state.time * 8) * 0.15;
  ctx.save();
  ctx.translate(indicator.x, indicator.y);
  ctx.rotate(indicator.angle);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, 24 * pulse, 0.24, "#ff4d6d");
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(-13, -15);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-13, 15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "#fff3b0";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.lineTo(-5, 0);
  ctx.stroke();
  ctx.restore();
}

function drawTwinBossBar(ctx, b, x, y, w) {
  const members = [...b.shared.members];
  const crimson = members.find((e) => e.role === "crimson");
  const azure = members.find((e) => e.role === "azure");
  const alive = members.filter((e) => !e.dead);
  if (alive.length === 1) {
    const solo = alive[0];
    const hpRatio = Math.max(0, solo.hp / solo.maxHp);
    ctx.fillStyle = "rgba(6,9,18,0.9)";
    ctx.fillRect(x, y + 10, w, 28);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 6, y + 15, w - 12, 18);
    const fill = ctx.createLinearGradient(x, y, x + w, y);
    fill.addColorStop(0, solo.role === "azure" ? "#42e8ff" : "#ff345f");
    fill.addColorStop(1, solo.role === "azure" ? "#b48cff" : "#ff9f6e");
    ctx.fillStyle = fill;
    ctx.fillRect(x + 6, y + 15, (w - 12) * hpRatio, 18);
    ctx.strokeStyle = "rgba(255,209,102,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 11, w - 2, 26);
    drawBossHpText(ctx, `${Math.ceil(Math.max(0, solo.hp))} / ${Math.ceil(solo.maxHp)}`, y + 30, 14);
    return;
  }
  ctx.fillStyle = "rgba(6,9,18,0.9)";
  ctx.fillRect(x, y, w, 38);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 6, y + 6, w - 12, 11);
  ctx.fillRect(x + 6, y + 22, w - 12, 11);
  if (crimson && !crimson.dead) {
    const crimsonFill = ctx.createLinearGradient(x, y, x + w, y);
    crimsonFill.addColorStop(0, "#ff345f");
    crimsonFill.addColorStop(1, "#ff9f6e");
    ctx.fillStyle = crimsonFill;
    ctx.fillRect(x + 6, y + 6, (w - 12) * Math.max(0, crimson.hp / crimson.maxHp), 11);
  }
  if (azure && !azure.dead) {
    const azureFill = ctx.createLinearGradient(x, y, x + w, y);
    azureFill.addColorStop(0, "#42e8ff");
    azureFill.addColorStop(1, "#b48cff");
    ctx.fillStyle = azureFill;
    ctx.fillRect(x + 6, y + 22, (w - 12) * Math.max(0, azure.hp / azure.maxHp), 11);
  }
  ctx.strokeStyle = b.shared.resonance ? "rgba(255,255,255,0.95)" : "rgba(255,209,102,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, 36);
  const leftHp = crimson && !crimson.dead ? `${Math.ceil(crimson.hp)}/${Math.ceil(crimson.maxHp)}` : "绯裂已毁";
  const rightHp = azure && !azure.dead ? `${Math.ceil(azure.hp)}/${Math.ceil(azure.maxHp)}` : "苍雷已毁";
  drawBossHpText(ctx, `${leftHp}    ${rightHp}`, y + 27, 12);
}
function drawBossTitle(ctx, text, x, y, w) {
  ctx.save();
  const labelWidth = Math.max(220, Math.min(w - 24, 560));
  const labelX = (viewport.width - labelWidth) / 2;
  ctx.fillStyle = "rgba(6,9,18,0.82)";
  ctx.fillRect(labelX, y - 18, labelWidth, 26);
  ctx.strokeStyle = "rgba(255,209,102,0.36)";
  ctx.lineWidth = 1;
  ctx.strokeRect(labelX, y - 18, labelWidth, 26);
  ctx.fillStyle = "#f3f7ff";
  ctx.font = `18px ${CANVAS_PIXEL_FONT}`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(255,77,109,0.65)";
  ctx.shadowBlur = 10;
  ctx.fillText(text, viewport.width / 2, y + 2);
  ctx.restore();
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
function drawStarShape(ctx, x, y, outer, inner, points = 10) { ctx.beginPath(); for (let i = 0; i < points; i++) { const a = -Math.PI / 2 + i * TAU / points; const r = i % 2 ? inner : outer; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
function diamondAt(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); }
