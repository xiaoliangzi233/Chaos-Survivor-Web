import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

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
    this.faceBlink = Math.random() * 1.4;
    this.slimeColors = pickSlimeVariant(profile);
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
      p.hp -= this.damage;
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
    pulse(this.x, this.y + this.r * 0.45, this.r * this.profile.landPulse, this.slimeColors.trail, 0.18);
    if (this.profile.landBurst > 0) burst(this.x, this.y + this.r * 0.35, this.profile.landBurst, this.slimeColors.trail, 70);
  }

  jumpLift() {
    if (this.hopState !== "air") return 0;
    const t = clamp(this.hopElapsed / Math.max(0.001, this.hopDuration), 0, 1);
    return Math.sin(t * Math.PI);
  }

  draw(ctx) {
    const lift = this.jumpLift();
    const bounce = Math.sin(this.anim * 2.4) * this.profile.idleBounce;
    const squash = this.landSquash * this.profile.squash;
    const stretch = lift * this.profile.stretch;
    const scaleX = 1 + squash - stretch * 0.36;
    const scaleY = 1 - squash * 0.55 + stretch;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - lift * this.profile.jumpHeight + bounce));
    drawSlimeShadow(ctx, this, lift);
    ctx.scale(scaleX, scaleY);
    drawSlimeBody(ctx, this, lift);
    drawSlimeFace(ctx, this, lift);
    drawSlimeGloss(ctx, this, lift);
    ctx.restore();
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

const SLIME_VARIANTS = {
  green: { body: "#77ff8a", dark: "#2f8b4b", light: "#caffb8", trail: "#b8ffba", face: "#173b1c", mouth: "#20662d" },
  mint: { body: "#6fffd6", dark: "#228f7a", light: "#c9fff1", trail: "#9fffea", face: "#123f39", mouth: "#1b7d6b" },
  aqua: { body: "#72d7ff", dark: "#276f9a", light: "#d1f4ff", trail: "#a6ebff", face: "#14324a", mouth: "#23688c" },
  blue: { body: "#8fb7ff", dark: "#3d5fa4", light: "#dce8ff", trail: "#b8d2ff", face: "#1d2a55", mouth: "#3b5aa0" },
  berry: { body: "#ff8bd7", dark: "#a73675", light: "#ffd6f0", trail: "#ffb9e7", face: "#56213f", mouth: "#a13a74" },
  honey: { body: "#ffd166", dark: "#aa7422", light: "#fff1b7", trail: "#ffe08a", face: "#5f3b12", mouth: "#9b671d" },
  amber: { body: "#ffad66", dark: "#a65a22", light: "#ffe0b8", trail: "#ffc48a", face: "#5a2f15", mouth: "#914f1e" },
  lime: { body: "#b6ff69", dark: "#5f9325", light: "#e4ffc2", trail: "#d7ff9a", face: "#28440f", mouth: "#5d8f22" },
};

function pickSlimeVariant(profile) {
  const keys = profile.variants || ["green"];
  return SLIME_VARIANTS[keys[Math.floor(Math.random() * keys.length)]] || SLIME_VARIANTS.green;
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
  const flash = e.flash > 0;
  const side = Math.sin(e.anim * 2.1) * r * 0.06;
  const color = flash ? "#ffffff" : e.slimeColors.body;
  const dark = flash ? "#eaffef" : e.slimeColors.dark;
  const light = flash ? "#ffffff" : e.slimeColors.light;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, r * 0.18);
  ctx.bezierCurveTo(-r * 0.96 + side, -r * 0.62, -r * 0.44, -r * 0.95 - lift * 2, 0, -r * 0.95);
  ctx.bezierCurveTo(r * 0.48, -r * 0.95 + lift * 2, r * 0.98 + side, -r * 0.58, r * 0.98, r * 0.16);
  ctx.bezierCurveTo(r * 0.82, r * 0.72, r * 0.36, r * 0.95, 0, r * 0.86);
  ctx.bezierCurveTo(-r * 0.45, r * 0.95, -r * 0.86, r * 0.72, -r * 0.98, r * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.22, -r * 0.1, r * 0.72, r * 0.62, -0.2, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.stroke();
  ctx.strokeStyle = light;
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  ctx.arc(-r * 0.16, -r * 0.18, r * 0.62, Math.PI * 1.1, Math.PI * 1.72);
  ctx.stroke();
}

function drawSlimeFace(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  const eye = Math.max(2.2, r * 0.12 * e.profile.eyeScale);
  const blink = e.faceBlink <= 0.08;
  const faceX = (e.flip || 1) * r * 0.08;
  const faceY = r * 0.06;
  if (e.faceBlink <= -0.12) e.faceBlink = 1.4 + Math.random() * 1.8;

  ctx.save();
  ctx.translate(faceX, faceY);
  ctx.scale(e.flip || 1, 1);
  ctx.fillStyle = e.slimeColors.face;
  if (blink) {
    ctx.fillRect(-r * 0.38, -r * 0.08, eye * 1.9, 2);
    ctx.fillRect(r * 0.18, -r * 0.08, eye * 1.9, 2);
  } else {
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.1 + lift, eye, eye * 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.1 + lift, eye, eye * 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-r * 0.24, -r * 0.18 + lift, Math.max(1.5, eye * 0.4), Math.max(1.5, eye * 0.4));
    ctx.fillRect(r * 0.32, -r * 0.18 + lift, Math.max(1.5, eye * 0.4), Math.max(1.5, eye * 0.4));
  }

  ctx.strokeStyle = e.slimeColors.mouth;
  ctx.lineWidth = Math.max(1.4, r * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (e.profile.mouth === "big") ctx.arc(0, r * 0.16, r * 0.24, Math.PI * 0.12, Math.PI * 0.88);
  else if (e.profile.mouth === "tiny") ctx.arc(0, r * 0.18, r * 0.12, Math.PI * 0.18, Math.PI * 0.82);
  else ctx.arc(0, r * 0.15, r * 0.18, Math.PI * 0.16, Math.PI * 0.84);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.restore();
}

function drawSlimeGloss(ctx, e, lift) {
  const r = e.r * e.profile.bodyScale;
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.47 - lift * 2, r * 0.2, r * 0.11, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(r * 0.18, -r * 0.62, r * 0.1, r * 0.06, -0.2, 0, TAU);
  ctx.fill();
}
