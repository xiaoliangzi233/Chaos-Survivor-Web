import { TAU } from "../constants.js";
import { hexToRgba } from "../utils.js";

export function drawPlayerAvatar(ctx, avatar = {}, options = {}) {
  const time = Number(options.time) || 0;
  const moving = Boolean(options.moving);
  const hurt = Boolean(options.hurt);
  const low = Boolean(options.low);
  const mood = options.mood || (hurt ? "hurt" : low ? "worried" : moving ? "happy" : "smile");
  const breathe = Math.sin(time * 4.2);
  const squash = options.squash ?? (1 + Math.sin(time * 5) * 0.025);
  const lookX = Math.max(-1, Math.min(1, Number(avatar.dirX) || 0));
  const lookY = Math.max(-1, Math.min(1, Number(avatar.dirY) || 0));
  const scale = Number(options.scale) || 1;

  ctx.save();
  ctx.scale(scale * (1.02 + breathe * 0.01), scale * squash);
  avatarGlow(ctx, 0, -3, 29, hurt ? 0.35 : 0.44, hurt ? "#ff9ab0" : "#ffd6a8");
  avatarGlow(ctx, 0, -8, 22, 0.17, low ? "#ff4d6d" : "#42e8ff");

  const skin = hurt ? "#ffd7dd" : "#ffd6a8";
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -3, 22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffbd8a";
  ctx.beginPath();
  ctx.arc(-13, 2, 5, 0, TAU);
  ctx.arc(13, 2, 5, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = low ? "#ff4d6d" : "#42e8ff";
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 18, -2);
    ctx.quadraticCurveTo(side * (27 + breathe * 1.5), 4, side * 19, 12);
    ctx.stroke();
  }

  ctx.fillStyle = "#fff4d8";
  ctx.beginPath();
  ctx.arc(-7, -10, 7, 0, TAU);
  ctx.arc(7, -10, 7, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(lookX * 1.4, -4 + lookY * 1.2);
  drawPlayerEyes(ctx, mood);
  drawPlayerMouth(ctx, mood);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.arc(-8, -16, 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f3b05f";
  ctx.beginPath();
  ctx.arc(0, -4, 2.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7b4a2b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -3, 22, 0, TAU);
  ctx.stroke();
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
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-5, -5);
    ctx.moveTo(5, -5);
    ctx.lineTo(12, -5);
    ctx.stroke();
  } else if (mood === "happy") {
    ctx.beginPath();
    ctx.arc(-8, -6, 4, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, -6, 4, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
  } else if (mood === "hurt") {
    ctx.beginPath();
    ctx.moveTo(-12, -9);
    ctx.lineTo(-5, -3);
    ctx.moveTo(-5, -9);
    ctx.lineTo(-12, -3);
    ctx.moveTo(5, -9);
    ctx.lineTo(12, -3);
    ctx.moveTo(12, -9);
    ctx.lineTo(5, -3);
    ctx.stroke();
  } else if (mood === "worried") {
    ctx.fillRect(-11, -6, 5, 6);
    ctx.fillRect(6, -6, 5, 6);
    ctx.strokeStyle = "#7b4a2b";
    ctx.beginPath();
    ctx.moveTo(-13, -12);
    ctx.lineTo(-5, -10);
    ctx.moveTo(5, -10);
    ctx.lineTo(13, -12);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-8, -6, 3.3, 0, TAU);
    ctx.arc(8, -6, 3.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-7, -8, 1.6, 1.6);
    ctx.fillRect(9, -8, 1.6, 1.6);
  }
}

function drawPlayerMouth(ctx, mood) {
  ctx.strokeStyle = "#7b2f2f";
  ctx.fillStyle = "#7b2f2f";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (mood === "hurt") {
    ctx.beginPath();
    ctx.arc(0, 8, 4, 0, TAU);
    ctx.stroke();
  } else if (mood === "worried") {
    ctx.beginPath();
    ctx.arc(0, 12, 6, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (mood === "curious") {
    ctx.beginPath();
    ctx.arc(0, 8, 3, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 4, 8, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  }
}

function avatarGlow(ctx, x, y, radius, alpha, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, hexToRgba(color, alpha));
  gradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}
