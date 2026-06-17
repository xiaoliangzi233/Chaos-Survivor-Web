import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

export class Wisp extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.preferredRange = this.preferredDist;
    this.closeRange = this.closeDist;
    this.farRange = this.farDist;
    this.shootCooldown = this.shootInitialCd + Math.random() * this.shootInitialCdRandom;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.hoverPhase = Math.random() * TAU;
    this.trailTimer = Math.random() * 0.12;
    this.lastX = x;
    this.lastY = y;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / d;
    const ny = dy / d;
    const strafe = Math.sin(state.time * 1.8 + this.hoverPhase) * 0.35 + this.strafeDir * 0.65;
    let moveX = -ny * strafe;
    let moveY = nx * strafe;

    this.lastX = this.x;
    this.lastY = this.y;
    this.anim += dt * 3.2;
    this.cooldown -= dt;
    this.shootCooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (d < this.closeRange) {
      moveX -= nx * 1.45;
      moveY -= ny * 1.45;
    } else if (d > this.farRange) {
      moveX += nx * 0.75;
      moveY += ny * 0.75;
    }

    const len = Math.max(1, Math.hypot(moveX, moveY));
    this.x += (moveX / len) * this.speed * dt;
    this.y += (moveY / len) * this.speed * dt;

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (this.shootCooldown <= 0 && d < this.fireRange) {
      this.shootCooldown = this.elite ? this.shootCdElite : this.shootCd;
      this.fireSnowflake(Math.atan2(dy, dx), d);
    }

    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && Math.hypot(this.x - this.lastX, this.y - this.lastY) > 1) {
      this.trailTimer = 0.09 + Math.random() * 0.04;
      trail(this.x, this.y, this.lastX, this.lastY, "#9ff4ff", 8);
    }

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.55;
      state.shake = 6;
      state.flash = 0.22;
      burst(p.x, p.y, 10, "#9ff4ff", 105);
    }
  }

  fireSnowflake(angle, distance) {
    const speed = this.elite ? this.bulletSpeedElite : this.bulletSpeed;
    const spread = distance < this.preferredRange ? 0.1 : 0.04;
    const count = this.elite ? this.bulletCountElite : this.bulletCount;
    const start = -(count - 1) * 0.12;
    pulse(this.x, this.y, 34, "#9ff4ff", 0.28);
    burst(this.x, this.y, 5, "#d9fbff", 80);

    for (let i = 0; i < count; i++) {
      const a = angle + start + i * 0.24 + (Math.random() - 0.5) * spread;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * 16,
        y: this.y + Math.sin(a) * 16,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: this.elite ? 7 : 6,
        color: "#9ff4ff",
        damage: this.damage * this.bulletDamageMul,
        life: 4.2,
        shape: "snowflake",
        spin: Math.random() * TAU,
      });
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.anim * 2.2 + this.hoverPhase) * 4;
    const sway = Math.sin(this.anim * 1.1 + this.hoverPhase) * 0.08;
    const flash = this.flash > 0;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + bob));
    ctx.rotate(sway);
    drawWispAura(ctx, this, flash);
    drawWispBody(ctx, this, flash);
    drawIceCrown(ctx, this, flash);
    drawOrbitShards(ctx, this, flash);
    ctx.restore();
  }
}

function drawWispAura(ctx, e, flash) {
  const pulseSize = 1 + Math.sin(e.anim * 2.6) * 0.08;
  const glow = flash ? "#ffffff" : "#67e8ff";
  ctx.globalAlpha = flash ? 0.34 : 0.2;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 5, 26 * pulseSize, 34 * pulseSize, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 18, 5, 0, 0, TAU);
  ctx.fill();
}

function drawWispBody(ctx, e, flash) {
  const body = flash ? "#ffffff" : "#baf8ff";
  const edge = flash ? "#ffffff" : "#58d9ff";
  const core = flash ? "#e9fdff" : "#55f0ff";
  const ripple = Math.sin(e.anim * 4) * 2;

  ctx.fillStyle = "rgba(126,232,255,0.42)";
  ctx.beginPath();
  ctx.moveTo(-15, -5);
  ctx.quadraticCurveTo(-19, 10, -11, 24 + ripple);
  ctx.lineTo(-4, 18 - ripple);
  ctx.lineTo(2, 26 + ripple);
  ctx.lineTo(9, 17);
  ctx.quadraticCurveTo(20, 10, 15, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -5, 16, 18, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = core;
  diamond(ctx, 0, -7, 9, 15);
  ctx.fillStyle = "#123146";
  ctx.fillRect(-7, -8, 4, 4);
  ctx.fillRect(4, -8, 4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-6, -9, 1.4, 1.4);
  ctx.fillRect(5, -9, 1.4, 1.4);

  ctx.strokeStyle = "#247b95";
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -1, 7, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawIceCrown(ctx, e, flash) {
  const color = flash ? "#ffffff" : "#d8fbff";
  const edge = flash ? "#ffffff" : "#65dfff";
  ctx.strokeStyle = edge;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = -1; i <= 1; i++) {
    const x = i * 8;
    const h = i === 0 ? 14 : 9;
    ctx.beginPath();
    ctx.moveTo(x, -33 - h * 0.2);
    ctx.lineTo(x + 4, -21);
    ctx.lineTo(x, -17);
    ctx.lineTo(x - 4, -21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawOrbitShards(ctx, e, flash) {
  const color = flash ? "#ffffff" : "#8ff4ff";
  ctx.fillStyle = color;
  ctx.strokeStyle = "#e9feff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const a = e.anim * 1.35 + i * TAU / 3;
    const x = Math.cos(a) * 24;
    const y = Math.sin(a) * 9 - 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 4);
    diamond(ctx, 0, 0, 4, 9);
    ctx.stroke();
    ctx.restore();
  }
}

function diamond(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
}
