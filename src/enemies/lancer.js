import { WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";





const LANCER_CLOTHING_VARIANTS = ["scavenger", "guard", "hazard", "medic", "courier", "night_ops", "engineer"];

export class Lancer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.attackState = "approach";
    this.attackCooldown = this.attackCdInitial + Math.random() * this.attackCdInitialRandom;
    this.windupTime = 0;
    this.dashTime = 0;
    this.recoverTime = 0;
    this.lockAngle = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.afterimageTimer = 0;
    if (this.variantIndex != null && this.variantIndex >= 0) {
      this.clothingVariant = LANCER_CLOTHING_VARIANTS[this.variantIndex % LANCER_CLOTHING_VARIANTS.length];
    } else {
      this.clothingVariant = LANCER_CLOTHING_VARIANTS[Math.floor(Math.random() * LANCER_CLOTHING_VARIANTS.length)];
    }
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / d;
    const ny = dy / d;

    this.anim += dt * (this.attackState === "dashing" ? 12 : 4.8);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.attackState === "windup") {
      this.windupTime -= dt;
      this.x -= nx * this.speed * 0.42 * dt;
      this.y -= ny * this.speed * 0.42 * dt;
      if (this.windupTime <= 0) {
        this.attackState = "dashing";
        this.dashTime = this.dashDuration;
        this.dashVx = Math.cos(this.lockAngle) * this.dashSpeed;
        this.dashVy = Math.sin(this.lockAngle) * this.dashSpeed;
        burst(this.x, this.y, 7, "#ffe7b0", 150);
      }
    } else if (this.attackState === "dashing") {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      this.dashTime -= dt;
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.035;
        trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, "#ffcf8a", 11);
      }
      if (this.dashTime <= 0) {
        this.attackState = "recover";
        this.recoverTime = this.recoverDuration;
        this.attackCooldown = this.attackCd + Math.random() * this.attackCdRandom;
      }
    } else if (this.attackState === "recover") {
      this.recoverTime -= dt;
      this.x += nx * this.speed * 0.35 * dt;
      this.y += ny * this.speed * 0.35 * dt;
      if (this.recoverTime <= 0) this.attackState = "approach";
    } else {
      this.chase(dt, dx, dy, d, 1.02);
      if (d < this.dashTriggerRange && this.attackCooldown <= 0) {
        this.attackState = "windup";
        this.windupTime = this.windupDuration;
        this.lockAngle = Math.atan2(dy, dx);
        pulse(this.x, this.y, 40, "#ffcf8a", 0.28);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    const hitDx = p.x - this.x;
    const hitDy = p.y - this.y;
    const hitDist = Math.hypot(hitDx, hitDy);
    if (hitDist < p.r + this.r + (this.attackState === "dashing" ? 14 : 0) && p.invuln <= 0) {
      applyPlayerDamage(this.attackState === "dashing" ? this.damage * this.dashDamageMul : this.damage, this);
      p.invuln = 0.55;
      state.shake = this.attackState === "dashing" ? 11 : 7;
      state.flash = 0.26;
      burst(p.x, p.y, 10, "#ff9f6e", 130);
    }
  }

  draw(ctx) {
    const charge = this.attackState === "windup";
    const dash = this.attackState === "dashing";
    const recover = this.attackState === "recover";
    const z = this.r / 15;
    const walk = Math.sin(this.anim);
    const run = Math.cos(this.anim);
    const crouch = charge ? 3 : recover ? -1 : Math.abs(run) * -1.6;
    const lean = dash ? 7 : charge ? -5 : 2.2 + Math.sin(this.anim * 0.7) * 1.6;
    const flash = this.flash > 0;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (charge) drawLungeTelegraph(ctx, this);
    ctx.scale(this.flip || 1, 1);
    ctx.translate(lean, crouch + Math.sin(this.anim * 1.5) * (dash ? 0.4 : 1.1));

    if (dash) drawDashAfterimage(ctx);
    const outfit = lancerOutfit(this);
    drawShadow(ctx, z);
    drawLegs(ctx, z, walk, run, charge, dash, outfit);
    drawCloak(ctx, z, flash, charge, dash, run, outfit);
    drawKnifeArm(ctx, z, flash, charge, dash);
    drawOffhand(ctx, z, flash, walk, dash);
    drawHead(ctx, z, flash, charge, run, outfit);
    drawBladeGlint(ctx, charge, dash);
    ctx.restore();
  }
}

function drawLungeTelegraph(ctx, e) {
  const length = e.dashSpeed * e.dashDuration;
  const a = e.lockAngle;
  const pulseAlpha = 0.38 + Math.sin(e.anim * 10) * 0.16;
  ctx.save();
  ctx.rotate(a);
  ctx.strokeStyle = `rgba(255,207,138,${pulseAlpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,244,210,${pulseAlpha})`;
  ctx.beginPath();
  ctx.moveTo(length + 14, 0);
  ctx.lineTo(length - 6, -8);
  ctx.lineTo(length - 2, 0);
  ctx.lineTo(length - 6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDashAfterimage(ctx) {
  for (let i = 4; i >= 1; i--) {
    ctx.fillStyle = `rgba(255,159,110,${0.045 * i})`;
    ctx.beginPath();
    ctx.moveTo(-42 - i * 8, -22 + i);
    ctx.lineTo(-16 - i * 5, -14);
    ctx.lineTo(-13 - i * 5, 16);
    ctx.lineTo(-48 - i * 8, 24 - i);
    ctx.closePath();
    ctx.fill();
  }
}

function drawShadow(ctx, z) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 18 * z, 18 * z, 5 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(ctx, z, walk, run, charge, dash, outfit) {
  const bend = charge ? 2.8 : dash ? -1 : 0;
  const stride = charge ? 1.2 : dash ? 1.8 : 3.4;
  ctx.fillStyle = outfit.pants;
  ctx.save();
  ctx.translate(-6 * z + run * 2.4 * z, 4 * z + walk * stride * z + bend);
  ctx.rotate(walk * 0.22);
  ctx.fillRect(-3 * z, 0, 6 * z, 17 * z);
  ctx.restore();
  ctx.save();
  ctx.translate(6 * z - run * 2.4 * z, 4 * z - walk * stride * z + bend);
  ctx.rotate(-walk * 0.22);
  ctx.fillRect(-3 * z, 0, 6 * z, 17 * z);
  ctx.restore();
  ctx.fillStyle = "#0b1019";
  ctx.fillRect(-11 * z + run * 3.2 * z, 18 * z + walk * stride * z + bend, 10 * z, 4 * z);
  ctx.fillRect(1 * z - run * 3.2 * z, 18 * z - walk * stride * z + bend, 10 * z, 4 * z);
}

function drawCloak(ctx, z, flash, charge, dash, run, outfit) {
  const cloak = flash ? "#ffffff" : outfit.cloak;
  const lining = flash ? "#ffffff" : outfit.lining;
  const scarf = flash ? "#ffffff" : outfit.accent;
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-12 * z, -16 * z);
  ctx.lineTo(9 * z, -15 * z);
  ctx.lineTo(16 * z, 8 * z + Math.abs(run) * 1.5 * z);
  ctx.lineTo(5 * z, 18 * z);
  ctx.lineTo(-9 * z, 14 * z + (dash ? 5 * z : 0));
  ctx.lineTo((-18 - Math.abs(run) * 2) * z, 6 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lining;
  ctx.fillRect(-7 * z, -9 * z, 15 * z, 18 * z);
  ctx.fillStyle = flash ? "#ffffff" : "rgba(180,140,255,0.38)";
  ctx.fillRect(-4 * z, -8 * z, 4 * z, 16 * z);
  ctx.fillStyle = scarf;
  ctx.fillRect(-8 * z, -14 * z, 18 * z, 4 * z);
  ctx.beginPath();
  ctx.moveTo(-8 * z, -13 * z);
  ctx.lineTo((-30 - (dash ? 18 : 0)) * z, (-16 + Math.sin(run) * 3) * z);
  ctx.lineTo((-17 - (dash ? 10 : 0)) * z, -7 * z);
  ctx.closePath();
  ctx.fill();
  if (charge || dash) {
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,159,110,0.8)";
    ctx.fillRect(-17 * z, -11 * z, 10 * z, 4 * z);
  }
  if (!flash) drawLancerClothMark(ctx, z, outfit);
  ctx.strokeStyle = dash ? "#ffe7b0" : "rgba(255,207,138,0.65)";
  ctx.lineWidth = 1.7;
  ctx.stroke();
}

function drawKnifeArm(ctx, z, flash, charge, dash) {
  const arm = flash ? "#ffffff" : "#2f3653";
  const blade = flash ? "#ffffff" : "#eaf7ff";
  const grip = flash ? "#ffffff" : "#4a2a1a";
  const reach = dash ? 23 : charge ? 14 : 10;
  const y = dash ? -8 : charge ? -5 : -2;
  ctx.fillStyle = arm;
  ctx.fillRect(6 * z, y * z, reach * z, 5 * z);
  ctx.fillStyle = grip;
  ctx.fillRect((reach + 3) * z, (y - 1) * z, 5 * z, 7 * z);
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo((reach + 30) * z, (y + 1.5) * z);
  ctx.lineTo((reach + 8) * z, (y - 4) * z);
  ctx.lineTo((reach + 10) * z, (y + 7) * z);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7dd3fc";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (dash) {
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo((reach + 8) * z, (y - 5) * z);
    ctx.lineTo((reach + 34) * z, (y - 10) * z);
    ctx.stroke();
  }
}

function drawOffhand(ctx, z, flash, walk, dash) {
  ctx.fillStyle = flash ? "#ffffff" : "#232a44";
  ctx.fillRect(-15 * z, -4 * z + walk * (dash ? 0.4 : 2) * z, 9 * z, 5 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#eaf7ff";
  ctx.beginPath();
  ctx.moveTo(-31 * z, (-2 + walk * (dash ? 0.4 : 2)) * z);
  ctx.lineTo(-17 * z, (-7 + walk * (dash ? 0.4 : 2)) * z);
  ctx.lineTo(-18 * z, (3 + walk * (dash ? 0.4 : 2)) * z);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffcf8a";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawHead(ctx, z, flash, charge, run, outfit) {
  ctx.save();
  ctx.translate(0, Math.abs(run) * -0.7 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#151926";
  ctx.beginPath();
  ctx.moveTo(-2 * z, -34 * z);
  ctx.lineTo(12 * z, -27 * z);
  ctx.lineTo(13 * z, -18 * z);
  ctx.lineTo(5 * z, -11 * z);
  ctx.lineTo(-8 * z, -12 * z);
  ctx.lineTo(-13 * z, -20 * z);
  ctx.lineTo(-10 * z, -29 * z);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = flash ? "#ffffff" : outfit.accent;
  ctx.fillRect(-8 * z, -21 * z, 18 * z, 4 * z);
  ctx.fillStyle = "#060912";
  ctx.fillRect(-7 * z, -20 * z, 6 * z, 2 * z);
  ctx.fillRect(4 * z, -20 * z, 6 * z, 2 * z);
  if (charge) {
    ctx.fillStyle = "#fff4d2";
    ctx.fillRect(5 * z, -21 * z, 4 * z, 1.5 * z);
  }

  ctx.strokeStyle = "rgba(255,207,138,0.82)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawLancerClothMark(ctx, z, outfit) {
  if (outfit.mark === "cross") {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(1 * z, -6 * z, 3 * z, 9 * z);
    ctx.fillRect(-2 * z, -3 * z, 9 * z, 3 * z);
  } else if (outfit.mark === "stripe") {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-7 * z, -7 * z, 18 * z, 3 * z);
    ctx.fillRect(-5 * z, 1 * z, 16 * z, 3 * z);
  } else if (outfit.mark === "badge") {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(4 * z, -8 * z, 4 * z, 4 * z);
  } else if (outfit.mark === "pocket") {
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.fillRect(-5 * z, 0, 6 * z, 6 * z);
    ctx.fillRect(4 * z, -1 * z, 5 * z, 6 * z);
  }
}

function lancerOutfit(e) {
  if (e.clothingVariant === "guard") return { cloak: "#23395d", lining: "#0f172a", pants: "#172554", accent: "#38bdf8", mark: "badge" };
  if (e.clothingVariant === "hazard") return { cloak: "#3f3f24", lining: "#171717", pants: "#1f2937", accent: "#ffd166", mark: "stripe" };
  if (e.clothingVariant === "medic") return { cloak: "#e2e8f0", lining: "#475569", pants: "#334155", accent: "#ef4444", mark: "cross" };
  if (e.clothingVariant === "courier") return { cloak: "#4c1d95", lining: "#1e1b4b", pants: "#312e81", accent: "#fde68a", mark: "pocket" };
  if (e.clothingVariant === "night_ops") return { cloak: "#111827", lining: "#020617", pants: "#0f172a", accent: "#a78bfa", mark: "stripe" };
  if (e.clothingVariant === "engineer") return { cloak: "#7c2d12", lining: "#1f2937", pants: "#451a03", accent: "#fb923c", mark: "pocket" };
  return { cloak: "#2a2035", lining: "#111827", pants: "#1a202c", accent: "#ff9f6e", mark: "badge" };
}

function drawBladeGlint(ctx, charge, dash) {
  if (!charge && !dash) return;
  ctx.strokeStyle = dash ? "rgba(255,255,255,0.9)" : "rgba(255,231,176,0.75)";
  ctx.lineWidth = dash ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.moveTo(25, -18);
  ctx.lineTo(47, -10);
  ctx.stroke();
  if (charge) {
    ctx.fillStyle = "rgba(255,244,210,0.8)";
    ctx.fillRect(41, -13, 3, 3);
  }
  if (dash) {
    ctx.strokeStyle = "rgba(255,159,110,0.5)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(25, -3, 28, -0.5, 0.42);
    ctx.stroke();
  }
}
