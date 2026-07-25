import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

export class SlimeEnemy extends BaseEnemy {
  constructor(config, x, y, profile) {
    super(config, x, y);
    this.profile = profile;
    this.hopState = "ground";
    this.hopTimer = 0.12 + Math.random() * profile.restTime;
    this.hopDuration = profile.hopDuration;
    this.hopElapsed = 0;
    this.hopVx = 0;
    this.hopVy = 0;
    this.lastX = x;
    this.lastY = y;
    this.landSquash = 0;
    this.landAge = 99;
    this.faceBlink = Math.random() * 1.4;
    const variant = pickSlimeVariant(profile);
    this.slimeVariant = variant.id;
    this.slimeColors = variant.colors;
    this.color = this.slimeColors.body;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    this.lastX = this.x;
    this.lastY = this.y;
    this.anim += dt * this.profile.animSpeed;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.landSquash = Math.max(0, this.landSquash - dt * 5.5);
    this.landAge += dt;
    this.faceBlink -= dt;
    this.flip = dx < 0 ? -1 : 1;

    if (this.hopState === "air") {
      this.hopElapsed += dt;
      this.x += this.hopVx * dt;
      this.y += this.hopVy * dt;
      if (Math.hypot(this.x - this.lastX, this.y - this.lastY) > 1) {
        trail(this.x, this.y, this.lastX, this.lastY, this.slimeColors.trail, this.profile.trailSize);
      }
      if (this.hopElapsed >= this.hopDuration) this.land();
    } else {
      this.hopTimer -= dt;
      if (this.hopTimer <= 0) this.startHop(dx, dy, d);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.55;
      state.shake = this.profile.shake;
      state.flash = 0.24;
      burst(p.x, p.y, this.profile.hitBurst, this.slimeColors.body, 120);
    }
  }

  startHop(dx, dy, d) {
    const wobble = Math.sin(state.time * 2.3 + this.x * 0.01) * this.profile.wobble;
    const nx = dx / d;
    const ny = dy / d;
    const tx = nx + -ny * wobble;
    const ty = ny + nx * wobble;
    const len = Math.max(1, Math.hypot(tx, ty));
    const speed = this.speed * this.profile.hopSpeed * (0.86 + Math.random() * 0.22);
    this.hopVx = tx / len * speed;
    this.hopVy = ty / len * speed;
    this.hopElapsed = 0;
    this.hopDuration = this.profile.hopDuration * (0.88 + Math.random() * 0.18);
    this.hopState = "air";
  }

  land() {
    this.hopState = "ground";
    this.hopTimer = this.profile.restTime * (0.75 + Math.random() * 0.45);
    this.hopVx = 0;
    this.hopVy = 0;
    this.landSquash = 1;
    this.landAge = 0;
    pulse(this.x, this.y + this.r * 0.45, this.r * this.profile.landPulse, this.slimeColors.trail, 0.18);
    if (this.profile.landBurst > 0) burst(this.x, this.y + this.r * 0.35, this.profile.landBurst, this.slimeColors.trail, 70);
    playSfx("slimeLand");
  }

  jumpLift() {
    if (this.hopState !== "air") return 0;
    const t = clamp(this.hopElapsed / Math.max(0.001, this.hopDuration), 0, 1);
    return Math.sin(t * Math.PI) ** 0.82;
  }

  draw(ctx) {
    const lift = this.jumpLift();
    const bounce = Math.sin(this.anim * 2.4) * this.profile.idleBounce;
    const anticipation = this.hopState === "ground"
      ? clamp(1 - this.hopTimer / Math.max(0.08, this.profile.restTime * 0.42), 0, 1)
      : 0;
    const landingSpring = this.landAge < 0.34
      ? Math.sin((this.landAge / 0.34) * Math.PI * 2) * Math.exp(-this.landAge * 5.2)
      : 0;
    const squash = this.landSquash * this.profile.squash + anticipation * this.profile.squash * 0.58 + Math.max(0, landingSpring) * 0.1;
    const stretch = lift * this.profile.stretch + Math.max(0, -landingSpring) * 0.08;
    const scaleX = 1 + squash - stretch * 0.4;
    const scaleY = 1 - squash * 0.58 + stretch;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - lift * this.profile.jumpHeight + bounce + anticipation * 2));
    drawSlimeShadow(ctx, this, lift);
    ctx.scale((this.flip || 1) * scaleX, scaleY);
    drawSlimeBody(ctx, this, lift);
    drawSlimeCore(ctx, this, lift);
    drawSlimeVariantDetails(ctx, this, lift, "body");
    drawSlimeFace(ctx, this, lift);
    drawSlimeVariantDetails(ctx, this, lift, "front");
    drawSlimeGloss(ctx, this, lift);
    ctx.restore();
  }

  getVisualState() {
    if (this.hopState === "air") {
      return {
        clip: "move",
        progress: clamp(this.hopElapsed / Math.max(0.001, this.hopDuration), 0, 0.999999),
        facing: this.flip,
      };
    }
    if (this.landAge < 0.34) {
      return { clip: "recover", progress: clamp(this.landAge / 0.34, 0, 0.999999), facing: this.flip };
    }
    const anticipation = clamp(1 - this.hopTimer / Math.max(0.08, this.profile.restTime * 0.42), 0, 0.999999);
    return { clip: anticipation > 0 ? "windup" : "move", progress: anticipation || (((this.anim % TAU) + TAU) % TAU / TAU), facing: this.flip };
  }
}

export const SLIME_PROFILES = {
  large: {
    bodyScale: 1.18,
    hopSpeed: 2.15,
    hopDuration: 0.48,
    restTime: 0.34,
    jumpHeight: 19,
    stretch: 0.22,
    squash: 0.25,
    idleBounce: 1,
    wobble: 0.2,
    animSpeed: 3.4,
    trailSize: 9,
    trailColor: "#b8ffba",
    landPulse: 1.2,
    landBurst: 4,
    hitBurst: 13,
    shake: 9,
    mouth: "big",
    eyeScale: 1.05,
    variants: ["green", "mint", "aqua", "amber"],
  },
  medium: {
    bodyScale: 1.06,
    hopSpeed: 2.35,
    hopDuration: 0.38,
    restTime: 0.24,
    jumpHeight: 15,
    stretch: 0.2,
    squash: 0.22,
    idleBounce: 1.4,
    wobble: 0.28,
    animSpeed: 4.2,
    trailSize: 7,
    trailColor: "#9dff91",
    landPulse: 1,
    landBurst: 2,
    hitBurst: 9,
    shake: 7,
    mouth: "smile",
    eyeScale: 0.95,
    variants: ["green", "mint", "blue", "berry", "lime"],
  },
  small: {
    bodyScale: 1,
    hopSpeed: 2.65,
    hopDuration: 0.28,
    restTime: 0.14,
    jumpHeight: 10,
    stretch: 0.18,
    squash: 0.18,
    idleBounce: 1.8,
    wobble: 0.36,
    animSpeed: 5.4,
    trailSize: 5,
    trailColor: "#d7ffb0",
    landPulse: 0.8,
    landBurst: 0,
    hitBurst: 6,
    shake: 5,
    mouth: "tiny",
    eyeScale: 0.82,
    variants: ["green", "lime", "honey", "berry", "aqua"],
  },
};

export function slimeProfile(base, overrides = {}) {
  return { ...SLIME_PROFILES[base], ...overrides };
}

const SLIME_VARIANTS = {
  green: { body: "#77ff8a", core: "#9dffac", dark: "#2f8b4b", light: "#caffb8", trail: "#b8ffba", face: "#173b1c", mouth: "#20662d" },
  mint: { body: "#6fffd6", core: "#9affe7", dark: "#228f7a", light: "#c9fff1", trail: "#9fffea", face: "#123f39", mouth: "#1b7d6b" },
  aqua: { body: "#72d7ff", core: "#9be8ff", dark: "#276f9a", light: "#d1f4ff", trail: "#a6ebff", face: "#14324a", mouth: "#23688c" },
  blue: { body: "#8fb7ff", core: "#adcaff", dark: "#3d5fa4", light: "#dce8ff", trail: "#b8d2ff", face: "#1d2a55", mouth: "#3b5aa0" },
  berry: { body: "#ff8bd7", core: "#ffaee4", dark: "#a73675", light: "#ffd6f0", trail: "#ffb9e7", face: "#56213f", mouth: "#a13a74" },
  honey: { body: "#ffd166", core: "#ffe08a", dark: "#aa7422", light: "#fff1b7", trail: "#ffe08a", face: "#5f3b12", mouth: "#9b671d" },
  amber: { body: "#ffad66", core: "#ffc28a", dark: "#a65a22", light: "#ffe0b8", trail: "#ffc48a", face: "#5a2f15", mouth: "#914f1e" },
  lime: { body: "#b6ff69", core: "#cfff93", dark: "#5f9325", light: "#e4ffc2", trail: "#d7ff9a", face: "#28440f", mouth: "#5d8f22" },
  diamond: { body: "#9ff4ff", core: "#ffffff", dark: "#2b7fa3", light: "#e6fbff", trail: "#d9fbff", face: "#123447", mouth: "#1b6b8e" },
  gold: { body: "#ffd166", core: "#fff2a8", dark: "#a66a12", light: "#fff6c7", trail: "#ffe08a", face: "#5a3510", mouth: "#9b671d" },
  glow: { body: "#7df9ff", core: "#d9fbff", dark: "#137c8b", light: "#efffff", trail: "#9ff4ff", face: "#0c3a44", mouth: "#138d9c" },
  weeping: { body: "#8fb7ff", core: "#c7d2ff", dark: "#3d5fa4", light: "#e1e8ff", trail: "#b8d2ff", face: "#1d2a55", mouth: "#3b5aa0" },
  devil: { body: "#ff4d6d", core: "#ff9ab0", dark: "#8f1d38", light: "#ffd1da", trail: "#ff7a9d", face: "#3f0f1c", mouth: "#9f1f3c" },
  angel: { body: "#f8fafc", core: "#fff2a8", dark: "#9aa7b4", light: "#ffffff", trail: "#d9fbff", face: "#334155", mouth: "#64748b" },
  rainbow: { body: "#ff4dd8", core: "#fff16a", dark: "#5b21b6", light: "#7df9ff", trail: "#ff9df2", face: "#24103f", mouth: "#ffffff" },
};

function pickSlimeVariant(profile) {
  if (profile.fixedVariant) return { id: profile.fixedVariant, colors: SLIME_VARIANTS[profile.fixedVariant] || SLIME_VARIANTS.green };
  if (Math.random() > 0.9985) return { id: "rainbow", colors: SLIME_VARIANTS.rainbow };
  const keys = profile.variants || ["green"];
  const id = keys[Math.floor(Math.random() * keys.length)] || "green";
  return { id, colors: SLIME_VARIANTS[id] || SLIME_VARIANTS.green };
}

function drawSlimeShadow(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  ctx.fillStyle = `rgba(0,0,0,${0.26 - lift * 0.09})`;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.68 + lift * e.profile.jumpHeight, r * (0.95 - lift * 0.2), r * 0.18, 0, 0, TAU);
  ctx.fill();
}

function drawSlimeBody(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  const hurt = e.flash > 0;
  const wobble = Math.sin(e.anim * 2.1) * r * 0.07;
  const crown = Math.sin(e.anim * 1.6 + lift) * r * 0.035;
  const color = e.slimeColors.body;
  const dark = hurt ? "#a33a4a" : e.slimeColors.dark;
  const light = e.slimeColors.light;

  ctx.save();
  if (hurt) {
    ctx.translate(Math.sin(e.anim * 9) * r * 0.025, 0);
    ctx.scale(1.04, 0.97);
  }
  if (e.elite) {
    ctx.strokeStyle = "rgba(3,8,18,0.62)";
    ctx.lineWidth = Math.max(5, r * 0.16);
    slimeBodyPath(ctx, r, wobble, crown, lift);
    ctx.stroke();
    ctx.strokeStyle = hexToRgbaLocal(e.slimeColors.body, e.eliteVariant === "giant" ? 0.62 : 0.48);
    ctx.lineWidth = Math.max(3, r * 0.09);
    slimeBodyPath(ctx, r, wobble, crown, lift);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  slimeBodyPath(ctx, r, wobble, crown, lift);
  ctx.fill();

  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 0.18, r * 0.64, r * 0.52, -0.28, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.stroke();
  ctx.strokeStyle = hexToRgbaLocal(light, 0.78);
  ctx.lineWidth = Math.max(1.2, r * 0.038);
  ctx.beginPath();
  ctx.moveTo(-r * 0.66, -r * 0.4);
  ctx.bezierCurveTo(-r * 0.66, -r * 0.4, -r * 0.34, -r * 0.72, r * 0.18, -r * 0.66);
  ctx.stroke();
  ctx.fillStyle = hexToRgbaLocal(dark, 0.2);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.56, r * 0.63, r * 0.18, r * 0.08, side * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function slimeBodyPath(ctx, r, wobble, crown, lift) {
  ctx.beginPath();
  ctx.moveTo(-r * 1.03, r * 0.18);
  ctx.bezierCurveTo(-r * 1.08 + wobble, -r * 0.42, -r * 0.7, -r * 0.82, -r * 0.28, -r * 0.92 - crown);
  ctx.bezierCurveTo(-r * 0.1, -r * 1.1 - lift * 2, r * 0.2, -r * 1.08 + lift * 2, r * 0.4, -r * 0.9 + crown);
  ctx.bezierCurveTo(r * 0.82 + wobble * 0.35, -r * 0.74, r * 1.1 + wobble, -r * 0.28, r * 1.04, r * 0.18);
  ctx.bezierCurveTo(r * 0.98, r * 0.58, r * 0.58, r * 0.88, r * 0.18, r * 0.86);
  ctx.bezierCurveTo(r * 0.04, r * 0.98, -r * 0.22, r * 0.98, -r * 0.38, r * 0.86);
  ctx.bezierCurveTo(-r * 0.78, r * 0.84, -r * 1.0, r * 0.58, -r * 1.03, r * 0.18);
  ctx.closePath();
}

function drawSlimeCore(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  const hurt = e.flash > 0;
  const coreX = r * 0.08;
  const coreY = r * 0.02 + lift * 0.4;
  ctx.save();
  ctx.globalAlpha = hurt ? 0.72 : 0.9;
  ctx.fillStyle = e.slimeColors.core;
  ctx.beginPath();
  ctx.ellipse(coreX, coreY, r * 0.58, r * 0.42, 0.08, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.beginPath();
  ctx.ellipse(coreX - r * 0.14, coreY - r * 0.12, r * 0.34, r * 0.2, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 3; i++) {
    const a = e.anim * 0.35 + i * TAU / 3;
    ctx.beginPath();
    ctx.arc(coreX + Math.cos(a) * r * 0.28, coreY + Math.sin(a) * r * 0.18, Math.max(1.5, r * 0.035), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSlimeVariantDetails(ctx, e, lift, layer) {
  if (e.slimeVariant === "diamond") return drawDiamondSlimeDetails(ctx, e, lift, layer);
  if (e.slimeVariant === "gold") return drawGoldSlimeDetails(ctx, e, lift, layer);
  if (e.slimeVariant === "glow") return drawGlowSlimeDetails(ctx, e, lift, layer);
  if (e.slimeVariant === "weeping") return drawWeepingSlimeDetails(ctx, e, lift, layer);
  if (e.slimeVariant === "devil") return drawDevilSlimeDetails(ctx, e, lift, layer);
  if (e.slimeVariant === "angel") return drawAngelSlimeDetails(ctx, e, lift, layer);
}

function drawDiamondSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  if (layer === "body") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(255,255,255,0.54)";
    ctx.lineWidth = Math.max(1, r * 0.045);
    for (let i = 0; i < 5; i++) {
      const x = (-0.45 + i * 0.22) * r;
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.58);
      ctx.lineTo(x + r * 0.18, r * 0.38);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(43,127,163,0.62)";
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.22);
    ctx.lineTo(-r * 0.08, -r * 0.58);
    ctx.lineTo(r * 0.48, -r * 0.2);
    ctx.lineTo(r * 0.12, r * 0.42);
    ctx.closePath();
    ctx.stroke();
    diamondFacet(ctx, r * 0.1, r * 0.02 + lift * 0.4, r * 0.34, "rgba(255,255,255,0.26)", "rgba(43,127,163,0.55)");
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawCrystalShard(ctx, -r * 0.42, -r * 0.96, r * 0.28, -0.28);
  drawCrystalShard(ctx, -r * 0.05, -r * 1.12, r * 0.34, 0.03);
  drawCrystalShard(ctx, r * 0.34, -r * 0.94, r * 0.24, 0.26);
  ctx.restore();
}

function drawGoldSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  const shimmer = 0.55 + Math.sin(e.anim * 1.7) * 0.2;
  if (layer === "body") {
    ctx.save();
    ctx.strokeStyle = `rgba(255,246,199,${0.38 + shimmer * 0.22})`;
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.08, r * 0.56, Math.PI * 1.08, Math.PI * 1.72);
    ctx.stroke();
    ctx.fillStyle = "rgba(166,106,18,0.24)";
    for (let i = 0; i < 4; i++) {
      const x = (-0.46 + i * 0.31) * r;
      ctx.save();
      ctx.translate(x, r * (0.12 + (i % 2) * 0.18));
      ctx.rotate((i - 1.5) * 0.16);
      ctx.fillRect(-r * 0.12, -r * 0.045, r * 0.24, r * 0.09);
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const a = e.anim * 0.4 + i * 1.7;
    const x = Math.cos(a) * r * (0.44 + (i % 2) * 0.16);
    const y = Math.sin(a * 0.8) * r * 0.34 - r * 0.08;
    coinGlint(ctx, x, y, r * (0.055 + (i % 2) * 0.02), shimmer);
  }
  ctx.strokeStyle = "rgba(255,241,183,0.72)";
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  ctx.arc(0, r * 0.54, r * 0.72, Math.PI * 1.06, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
}

function drawGlowSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  const pulse = 0.65 + Math.sin(e.anim * 1.4) * 0.25;
  if (layer === "body") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(239,255,255,${0.34 + pulse * 0.34})`;
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    for (let i = 0; i < 3; i++) {
      const y = (-0.28 + i * 0.26) * r;
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, y);
      ctx.quadraticCurveTo(0, y - r * 0.18, r * 0.5, y + r * 0.08);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(217,251,255,${0.2 + pulse * 0.28})`;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + e.anim * 0.18;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.34, Math.max(1.5, r * 0.045), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(125,249,255,${0.42 + pulse * 0.22})`;
  ctx.lineWidth = Math.max(1, r * 0.04);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.72 + i * 0.16 + pulse * 0.04), 0.15 + i, 1.85 + i);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWeepingSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  if (layer === "body") {
    ctx.save();
    ctx.fillStyle = "rgba(225,232,255,0.28)";
    for (let i = 0; i < 4; i++) {
      const x = (-0.44 + i * 0.28) * r;
      const h = r * (0.32 + (i % 2) * 0.16);
      ctx.beginPath();
      ctx.ellipse(x, r * 0.26 + h * 0.18, r * 0.07, h, 0.08, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(61,95,164,0.52)";
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(-r * 0.68, r * 0.32);
    ctx.bezierCurveTo(-r * 0.34, r * 0.56, r * 0.28, r * 0.62, r * 0.68, r * 0.34);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(225,232,255,0.72)";
  tearDrop(ctx, -r * 0.3, -r * 0.08, r * 0.12);
  tearDrop(ctx, r * 0.28, -r * 0.03, r * 0.09);
  ctx.strokeStyle = e.slimeColors.face;
  ctx.lineWidth = Math.max(1.2, r * 0.045);
  ctx.beginPath();
  ctx.moveTo(-r * 0.38, -r * 0.18);
  ctx.lineTo(-r * 0.2, -r * 0.08);
  ctx.moveTo(r * 0.18, -r * 0.08);
  ctx.lineTo(r * 0.38, -r * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawDevilSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  if (layer === "body") {
    ctx.save();
    ctx.fillStyle = "rgba(63,15,28,0.42)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.78, r * 0.04);
      ctx.lineTo(side * r * 1.08, r * 0.18);
      ctx.lineTo(side * r * 0.78, r * 0.32);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,209,218,0.48)";
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, r * 0.34);
    ctx.quadraticCurveTo(0, r * 0.58, r * 0.58, r * 0.3);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillStyle = "#8f1d38";
    ctx.strokeStyle = "#ffd1da";
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(r * 0.18, -r * 0.88);
    ctx.quadraticCurveTo(r * 0.34, -r * 1.34, r * 0.62, -r * 0.92);
    ctx.quadraticCurveTo(r * 0.46, -r * 0.82, r * 0.28, -r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "#3f0f1c";
  ctx.lineWidth = Math.max(1.4, r * 0.055);
  ctx.beginPath();
  ctx.moveTo(-r * 0.38, -r * 0.26);
  ctx.lineTo(-r * 0.2, -r * 0.18);
  ctx.moveTo(r * 0.2, -r * 0.18);
  ctx.lineTo(r * 0.4, -r * 0.28);
  ctx.stroke();
  ctx.fillStyle = "#fff0f3";
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, r * 0.2);
  ctx.lineTo(r * 0.02, r * 0.36);
  ctx.lineTo(r * 0.09, r * 0.2);
  ctx.fill();
  ctx.restore();
}

function drawAngelSlimeDetails(ctx, e, lift, layer) {
  const r = e.r * e.profile.bodyScale;
  const haloPulse = 0.9 + Math.sin(e.anim * 1.1) * 0.08;
  if (layer === "body") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(217,251,255,0.32)";
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.ellipse(r * 0.76, -r * 0.05, r * 0.28, r * 0.52, -0.45, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.beginPath();
      ctx.moveTo(r * 0.58, -r * 0.1);
      ctx.lineTo(r * 0.96, -r * 0.3);
      ctx.moveTo(r * 0.6, r * 0.08);
      ctx.lineTo(r * 0.98, r * 0.1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255,242,168,0.9)";
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.beginPath();
  ctx.ellipse(0, -r * 1.1, r * 0.42 * haloPulse, r * 0.13 * haloPulse, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,242,168,0.24)";
  ctx.beginPath();
  ctx.ellipse(r * 0.08, r * 0.02 + lift * 0.4, r * 0.48, r * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawCrystalShard(ctx, x, y, size, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = "rgba(159,244,255,0.78)";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.48, -size * 0.08);
  ctx.lineTo(size * 0.22, size * 0.72);
  ctx.lineTo(-size * 0.34, size * 0.48);
  ctx.lineTo(-size * 0.5, -size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function diamondFacet(ctx, x, y, r, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.78, y - r * 0.18);
  ctx.lineTo(x + r * 0.42, y + r * 0.82);
  ctx.lineTo(x - r * 0.5, y + r * 0.72);
  ctx.lineTo(x - r * 0.82, y - r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function coinGlint(ctx, x, y, r, alpha) {
  ctx.fillStyle = `rgba(255,242,168,${0.48 + alpha * 0.32})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(166,106,18,0.58)";
  ctx.lineWidth = Math.max(1, r * 0.35);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.25, 0, TAU);
  ctx.stroke();
}

function tearDrop(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.bezierCurveTo(x + r, y - r * 0.15, x + r * 0.55, y + r, x, y + r);
  ctx.bezierCurveTo(x - r * 0.55, y + r, x - r, y - r * 0.15, x, y - r * 1.25);
  ctx.fill();
}

function drawSlimeFace(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  const eye = Math.max(2.2, r * 0.12 * e.profile.eyeScale);
  const blink = e.faceBlink <= 0.08;
  const faceX = r * 0.08;
  const faceY = r * 0.02 + lift * 0.4;
  const sad = e.slimeVariant === "weeping";
  if (e.faceBlink <= -0.12) e.faceBlink = 1.4 + Math.random() * 1.8;

  ctx.save();
  ctx.translate(faceX, faceY);
  ctx.fillStyle = e.slimeColors.face;
  if (blink) {
    ctx.fillRect(-r * 0.34, -r * 0.1, eye * 1.8, 2);
    ctx.fillRect(r * 0.16, -r * 0.1, eye * 1.8, 2);
  } else {
    if (sad) {
      ctx.strokeStyle = e.slimeColors.face;
      ctx.lineWidth = Math.max(1.2, r * 0.045);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.38, -r * 0.24);
      ctx.quadraticCurveTo(-r * 0.26, -r * 0.3, -r * 0.14, -r * 0.22);
      ctx.moveTo(r * 0.16, -r * 0.22);
      ctx.quadraticCurveTo(r * 0.28, -r * 0.3, r * 0.4, -r * 0.24);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(-r * 0.23, -r * 0.08, eye * (sad ? 0.95 : 1), eye * (sad ? 1.42 : 1.22), sad ? -0.16 : 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.23, -r * 0.08, eye * (sad ? 0.95 : 1), eye * (sad ? 1.42 : 1.22), sad ? 0.16 : 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-r * 0.19, -r * 0.17, Math.max(1.5, eye * 0.34), 0, TAU);
    ctx.arc(r * 0.27, -r * 0.17, Math.max(1.5, eye * 0.34), 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = hexToRgbaLocal(e.slimeColors.light, sad ? 0.38 : 0.32);
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, r * 0.09, r * 0.11, r * 0.055, -0.12, 0, TAU);
  ctx.ellipse(r * 0.42, r * 0.09, r * 0.11, r * 0.055, 0.12, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = e.slimeColors.mouth;
  ctx.lineWidth = Math.max(1.4, r * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (sad) ctx.arc(0, r * 0.28, r * 0.16, Math.PI * 1.16, Math.PI * 1.84);
  else if (e.profile.mouth === "big") ctx.arc(0, r * 0.13, r * 0.22, Math.PI * 0.12, Math.PI * 0.88);
  else if (e.profile.mouth === "tiny") ctx.arc(0, r * 0.15, r * 0.11, Math.PI * 0.18, Math.PI * 0.82);
  else ctx.arc(0, r * 0.13, r * 0.16, Math.PI * 0.16, Math.PI * 0.84);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawSlimeGloss(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255,255,255,0.66)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.5 - lift * 2, r * 0.22, r * 0.1, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(r * 0.14, -r * 0.68, r * 0.1, r * 0.052, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.08, r * 0.36, r * 0.26, r * 0.055, 0.08, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function hexToRgbaLocal(hex, alpha) {
  if (!hex || !hex.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  const value = hex.slice(1);
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`;
}
