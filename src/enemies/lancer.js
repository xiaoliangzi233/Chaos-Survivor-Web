import { WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

export class Lancer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.attackState = "approach";
    this.attackCooldown = 0.75 + Math.random() * 0.65;
    this.windupTime = 0;
    this.dashTime = 0;
    this.recoverTime = 0;
    this.lockAngle = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.afterimageTimer = 0;
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
        this.dashTime = 0.28;
        this.dashVx = Math.cos(this.lockAngle) * 560;
        this.dashVy = Math.sin(this.lockAngle) * 560;
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
        this.recoverTime = 0.34;
        this.attackCooldown = 1.35;
      }
    } else if (this.attackState === "recover") {
      this.recoverTime -= dt;
      this.x += nx * this.speed * 0.35 * dt;
      this.y += ny * this.speed * 0.35 * dt;
      if (this.recoverTime <= 0) this.attackState = "approach";
    } else {
      this.chase(dt, dx, dy, d, 1.02);
      if (d < 360 && this.attackCooldown <= 0) {
        this.attackState = "windup";
        this.windupTime = 0.52;
        this.lockAngle = Math.atan2(dy, dx);
        pulse(this.x, this.y, 40, "#ffcf8a", 0.28);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r + (this.attackState === "dashing" ? 10 : 0) && p.invuln <= 0) {
      p.hp -= this.attackState === "dashing" ? this.damage * 1.35 : this.damage;
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
    const z = 1.02;
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
    drawShadow(ctx, z);
    drawLegs(ctx, z, walk, run, charge, dash);
    drawCloak(ctx, z, flash, charge, dash, run);
    drawKnifeArm(ctx, z, flash, charge, dash);
    drawOffhand(ctx, z, flash, walk, dash);
    drawHead(ctx, z, flash, charge, run);
    drawBladeGlint(ctx, charge, dash);
    ctx.restore();
  }
}

function drawLungeTelegraph(ctx, e) {
  const length = 170;
  const a = e.lockAngle;
  const pulseAlpha = 0.38 + Math.sin(e.anim * 10) * 0.16;
  ctx.save();
  ctx.rotate(a);
  ctx.strokeStyle = `rgba(255,207,138,${pulseAlpha})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 9]);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.setLineDash([]);
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
    ctx.fillStyle = `rgba(255,159,110,${0.055 * i})`;
    ctx.fillRect(-34 - i * 7, -25 + i, 23, 46 - i * 2);
  }
}

function drawShadow(ctx, z) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 18 * z, 18 * z, 5 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(ctx, z, walk, run, charge, dash) {
  const bend = charge ? 2.8 : dash ? -1 : 0;
  const stride = charge ? 1.2 : dash ? 1.8 : 3.4;
  ctx.fillStyle = "#1a202c";
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

function drawCloak(ctx, z, flash, charge, dash, run) {
  const cloak = flash ? "#ffffff" : "#2a2035";
  const scarf = flash ? "#ffffff" : "#ff9f6e";
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-11 * z, -15 * z);
  ctx.lineTo(10 * z, -14 * z);
  ctx.lineTo(14 * z, 11 * z + Math.abs(run) * 1.5 * z);
  ctx.lineTo(4 * z, 16 * z);
  ctx.lineTo(-8 * z, 13 * z + (dash ? 4 * z : 0));
  ctx.lineTo((-14 - Math.abs(run) * 2) * z, 8 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#141827";
  ctx.fillRect(-7 * z, -9 * z, 15 * z, 18 * z);
  ctx.fillStyle = scarf;
  ctx.fillRect(-8 * z, -14 * z, 18 * z, 4 * z);
  if (charge || dash) {
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,159,110,0.8)";
    ctx.fillRect(-17 * z, -11 * z, 10 * z, 4 * z);
  }
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
}

function drawOffhand(ctx, z, flash, walk, dash) {
  ctx.fillStyle = flash ? "#ffffff" : "#232a44";
  ctx.fillRect(-15 * z, -4 * z + walk * (dash ? 0.4 : 2) * z, 9 * z, 5 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#ffcf8a";
  ctx.fillRect(-18 * z, -3 * z + walk * (dash ? 0.4 : 2) * z, 4 * z, 4 * z);
}

function drawHead(ctx, z, flash, charge, run) {
  ctx.save();
  ctx.translate(0, Math.abs(run) * -0.7 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#171c2b";
  ctx.beginPath();
  ctx.moveTo(-9 * z, -30 * z);
  ctx.lineTo(9 * z, -29 * z);
  ctx.lineTo(12 * z, -18 * z);
  ctx.lineTo(5 * z, -11 * z);
  ctx.lineTo(-7 * z, -12 * z);
  ctx.lineTo(-12 * z, -20 * z);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = flash ? "#ffffff" : "#ff9f6e";
  ctx.fillRect(-8 * z, -20 * z, 17 * z, 5 * z);
  ctx.fillStyle = "#111827";
  ctx.fillRect(-6 * z, -19 * z, 5 * z, 2 * z);
  ctx.fillRect(4 * z, -19 * z, 5 * z, 2 * z);
  if (charge) {
    ctx.fillStyle = "#fff4d2";
    ctx.fillRect(5 * z, -20 * z, 3 * z, 1.5 * z);
  }

  ctx.strokeStyle = "rgba(255,207,138,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
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
}
