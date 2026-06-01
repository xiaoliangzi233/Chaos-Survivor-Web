import { TAU } from "../constants.js";
import { state, world, input, createEasterEggState } from "../state.js";
import { particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";

const NEON_CODE = "NEON";
const NEON_DURATION = 12;
const MAGNET_DURATION = 15;
const WAVE_13_DURATION = 8;
const CENTER_RADIUS = 82;
const STILL_TRIGGER_TIME = 4;
const LUCKY_KILLS = 77;
const LUCKY_GOLD = 777;

export function handleEasterEggKey(event) {
  if (state.mode !== "playing") return;
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  const egg = ensureEasterEggState();
  const key = event.key?.toUpperCase();
  if (!key || !/^[A-Z]$/.test(key)) return;
  egg.keyBuffer = `${egg.keyBuffer}${key}`.slice(-NEON_CODE.length);
  if (egg.keyBuffer === NEON_CODE) triggerNeonOverload();
}

export function updateEasterEggs(dt) {
  const egg = ensureEasterEggState();
  if (state.mode !== "playing" || !state.player) {
    tickToast(egg, dt);
    return;
  }
  tickToast(egg, dt);
  egg.bossSignatureCooldown = Math.max(0, egg.bossSignatureCooldown - dt);
  updateNeonOverload(egg, dt);
  updateMagnetBoost(egg, dt);
  updateStillCalibration(egg, dt);
  updateLuckySignal(egg);
  updateWave13Anomaly(egg, dt);
  updateEasterObjects(dt);
}

export function maybeTriggerBossSignature(boss) {
  const egg = ensureEasterEggState();
  if (!boss?.boss || egg.bossSignatureCooldown > 0 || Math.random() > 0.28) return;
  egg.bossSignatureCooldown = 18;
  showToast("未知签名已记录", "#b48cff", 2.7);
  world.itemObjects.push({
    kind: "easter_signature",
    x: boss.x,
    y: boss.y,
    life: 5,
    maxLife: 5,
    color: "#b48cff",
    phase: Math.random() * TAU,
  });
  pulse(boss.x, boss.y, 180, "#b48cff", 0.42);
}

export function drawEasterEggToast(ctx, viewport) {
  const toast = state.easterEggs?.toast;
  if (!toast || toast.life <= 0) return;
  const t = Math.max(0, Math.min(1, toast.life / toast.maxLife));
  const alpha = Math.min(1, t * 1.4);
  const y = Math.min(viewport.height - 82, 154) - (1 - t) * 16;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "16px 'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Courier New', monospace";
  const width = Math.min(viewport.width - 40, Math.max(260, ctx.measureText(toast.text).width + 76));
  const x = viewport.width / 2 - width / 2;
  ctx.fillStyle = "rgba(5, 9, 22, 0.82)";
  ctx.strokeStyle = toast.color;
  ctx.lineWidth = 2;
  ctx.shadowColor = toast.color;
  ctx.shadowBlur = 18;
  ctx.fillRect(x, y - 24, width, 48);
  ctx.strokeRect(x + 1, y - 23, width - 2, 46);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(toast.text, viewport.width / 2, y);
  ctx.restore();
}

export function drawEasterEggObject(ctx, obj) {
  if (obj.kind === "easter_signature") return drawSignature(ctx, obj);
  if (obj.kind === "easter_terminal") return drawTerminalScan(ctx, obj);
}

function ensureEasterEggState() {
  state.easterEggs ||= createEasterEggState();
  return state.easterEggs;
}

function tickToast(egg, dt) {
  if (!egg.toast) return;
  egg.toast.life -= dt;
  if (egg.toast.life <= 0) egg.toast = null;
}

function showToast(text, color = "#42e8ff", life = 2.4) {
  const egg = ensureEasterEggState();
  egg.toast = { text, color, life, maxLife: life };
}

function triggerNeonOverload() {
  const egg = ensureEasterEggState();
  if (!state.player) return;
  egg.neonOverloadTimer = NEON_DURATION;
  if (!egg.triggered.neon) {
    egg.triggered.neon = true;
    state.gold += 12;
  }
  showToast("霓虹过载：隐藏频段已解锁 +12G", "#42e8ff", 2.8);
  pulse(state.player.x, state.player.y, 180, "#42e8ff", 0.42);
  playSfx("level");
}

function updateNeonOverload(egg, dt) {
  if (egg.neonOverloadTimer <= 0) return;
  egg.neonOverloadTimer = Math.max(0, egg.neonOverloadTimer - dt);
  const p = state.player;
  if (Math.random() < dt * 20) {
    const a = Math.random() * TAU;
    const r = 22 + Math.random() * 46;
    particle("scan", p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, {
      color: Math.random() < 0.5 ? "#42e8ff" : "#ff4dff",
      life: 0.24,
      size: 2.8,
      alpha: 0.82,
    });
  }
  if (Math.random() < dt * 11) {
    trail(p.x, p.y, p.x - p.dirX * 36, p.y - p.dirY * 36, Math.random() < 0.5 ? "#42e8ff" : "#ff4dff", 12);
  }
}

function updateMagnetBoost(egg, dt) {
  const p = state.player;
  if (egg.magnetBoostTimer > 0) {
    egg.magnetBoostTimer = Math.max(0, egg.magnetBoostTimer - dt);
    egg.baseMagnet ??= p.magnet;
    p.magnet = Math.max(p.magnet, egg.baseMagnet * 1.55);
    if (Math.random() < dt * 8) particle("mote", p.x, p.y, { color: "#77ff8a", life: 0.32, size: 3, alpha: 0.72 });
    if (egg.magnetBoostTimer <= 0 && egg.baseMagnet !== null) {
      p.magnet = Math.max(egg.baseMagnet, p.magnet / 1.55);
      egg.baseMagnet = null;
    }
  }
}

function updateStillCalibration(egg, dt) {
  if (egg.triggered.calibration) return;
  const p = state.player;
  const moving = input.up || input.down || input.left || input.right || Math.hypot(input.vx || 0, input.vy || 0) > 0.08;
  const nearCenter = Math.hypot(p.x, p.y) <= CENTER_RADIUS;
  if (!moving && nearCenter) egg.centerStillTimer += dt;
  else egg.centerStillTimer = Math.max(0, egg.centerStillTimer - dt * 2);
  if (egg.centerStillTimer < STILL_TRIGGER_TIME) return;
  egg.triggered.calibration = true;
  egg.magnetBoostTimer = MAGNET_DURATION;
  egg.baseMagnet = p.magnet;
  showToast("旧终端校准完成：拾取磁场增强", "#77ff8a", 2.8);
  world.itemObjects.push({ kind: "easter_terminal", x: 0, y: 0, life: 4.2, maxLife: 4.2, color: "#77ff8a", phase: 0 });
  pulse(0, 0, 210, "#77ff8a", 0.46);
  playSfx("wave");
}

function updateLuckySignal(egg) {
  if (egg.triggered.lucky) return;
  if (state.kills < LUCKY_KILLS && state.gold < LUCKY_GOLD) return;
  egg.triggered.lucky = true;
  state.gold += 17;
  showToast("777 幸运频段锁定 +17G", "#ffd166", 2.8);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    particle("spark", state.player.x, state.player.y, {
      color: i % 3 === 0 ? "#ffd166" : "#fff0a6",
      life: 0.45 + Math.random() * 0.25,
      size: 3.2,
      alpha: 0.9,
      vx: Math.cos(a) * (80 + Math.random() * 120),
      vy: Math.sin(a) * (80 + Math.random() * 120),
    });
  }
  playSfx("coin");
  playSfx("level");
}

function updateWave13Anomaly(egg, dt) {
  if (state.wave === 13 && !egg.wave13Seen) {
    egg.wave13Seen = true;
    egg.wave13PulseTimer = WAVE_13_DURATION;
    showToast("实验室广播残响：第 13 波异常", "#b48cff", 3);
    pulse(state.player.x, state.player.y, 260, "#b48cff", 0.5);
    playSfx("wave");
  }
  if (egg.wave13PulseTimer <= 0) return;
  egg.wave13PulseTimer = Math.max(0, egg.wave13PulseTimer - dt);
  if (Math.random() < dt * 18) {
    const a = Math.random() * TAU;
    const r = 160 + Math.random() * 520;
    particle("mote", state.player.x + Math.cos(a) * r, state.player.y + Math.sin(a) * r, {
      color: Math.random() < 0.5 ? "#b48cff" : "#42e8ff",
      life: 0.65,
      size: 3.5,
      alpha: 0.55,
    });
  }
}

function updateEasterObjects(dt) {
  for (let i = world.itemObjects.length - 1; i >= 0; i--) {
    const obj = world.itemObjects[i];
    if (obj.kind !== "easter_signature" && obj.kind !== "easter_terminal") continue;
    obj.life -= dt;
    obj.phase = (obj.phase || 0) + dt * 2.4;
    if (obj.life <= 0) world.itemObjects.splice(i, 1);
  }
}

function drawSignature(ctx, obj) {
  const t = Math.max(0, obj.life / obj.maxLife);
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(obj.phase || 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, t * 1.3);
  ctx.strokeStyle = obj.color;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 52 + Math.sin((obj.phase || 0) * 3) * 8, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(TAU / 8);
  ctx.strokeRect(-32, -32, 64, 64);
  ctx.beginPath();
  ctx.moveTo(-44, 0);
  ctx.lineTo(44, 0);
  ctx.moveTo(0, -44);
  ctx.lineTo(0, 44);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

function drawTerminalScan(ctx, obj) {
  const t = Math.max(0, obj.life / obj.maxLife);
  const sweep = (1 - t) * 260;
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, t * 1.4);
  ctx.strokeStyle = obj.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-54, -34, 108, 68);
  ctx.beginPath();
  ctx.moveTo(-70, -sweep + 130);
  ctx.lineTo(70, -sweep + 130);
  ctx.stroke();
  ctx.fillStyle = obj.color;
  for (let i = 0; i < 5; i++) ctx.fillRect(-38 + i * 19, -8 + Math.sin((obj.phase || 0) + i) * 8, 8, 4);
  ctx.restore();
}
