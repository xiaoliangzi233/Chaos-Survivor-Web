import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class PhaseMirage extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "phase_mirage";
    this.cooldown = this.cdInitial;
    this.phaseState = "move";
    this.windup = 0;
    this.afterImages = [];
    this.strikeTimer = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.22);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 7.2;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.afterImages = this.afterImages.map((a) => ({ ...a, life: a.life - dt })).filter((a) => a.life > 0);
    if (Math.random() < dt * 10) this.afterImages.push({ x: this.x, y: this.y, life: 0.32 });

    if (this.phaseState === "windup") {
      this.windup -= dt;
      if (Math.random() < dt * 20) particle("scan", this.x, this.y, { color: this.color, life: 0.18, size: 2, alpha: 0.8 });
      if (this.windup <= 0) this.blinkStrike();
    } else if (this.phaseState === "strike") {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.phaseState = "move";
        this.cooldown = this.cd + Math.random() * this.cdRandom;
      }
    } else {
      const dir = d < this.strikeRange * 0.8 ? -0.35 : 0.92;
      const strafe = Math.sin(this.anim * 0.7) * 0.72;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.phaseState = "windup";
        this.windup = this.windupTime;
        pulse(this.x, this.y, 32, this.color, 0.2);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  blinkStrike() {
    const p = state.player;
    const side = Math.random() < 0.5 ? -1 : 1;
    const bx = -p.dirX * 135 + -p.dirY * side * 90;
    const by = -p.dirY * 135 + p.dirX * side * 90;
    this.x = clamp(p.x + bx, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(p.y + by, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.phaseState = "strike";
    this.strikeTimer = this.strikeDuration;
    pulse(this.x, this.y, 64, this.color, 0.3);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * 12,
        y: this.y + Math.sin(a) * 12,
        vx: Math.cos(a) * this.shardSpeed,
        vy: Math.sin(a) * this.shardSpeed,
        r: 4,
        color: this.color,
        damage: this.damage * this.shardDamageMul,
        life: this.shardLife,
        shape: "phaseShard",
      });
    }
    burst(this.x, this.y, 10, this.color, 160);
  }

  draw(ctx) {
    for (const img of this.afterImages) {
      ctx.save();
      ctx.translate(img.x, img.y);
      ctx.globalAlpha = img.life / 0.32 * 0.28;
      drawMirageBody(ctx, this, this.r / 15, false);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 2) * 2);
    drawMirageBody(ctx, this, this.r / 15, this.flash > 0);
    if (this.phaseState === "windup") {
      ctx.strokeStyle = "rgba(217,70,239,0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 12 + Math.sin(this.anim * 8) * 3, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMirageBody(ctx, e, z, flash) {
  ctx.scale(e.flip, 1);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, e.r + 7, e.r * 0.9, e.r * 0.2, 0, 0, TAU);
  ctx.fill();
  const body = flash ? "#ffffff" : "#2b1748";
  const edge = flash ? "#ffffff" : e.color;
  ctx.fillStyle = body;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -23 * z);
  ctx.lineTo(12 * z, -8 * z);
  ctx.lineTo(7 * z, 16 * z);
  ctx.lineTo(-9 * z, 16 * z);
  ctx.lineTo(-12 * z, -8 * z);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(-6 * z, -18 * z);
  ctx.lineTo(7 * z, -16 * z);
  ctx.lineTo(3 * z, -7 * z);
  ctx.lineTo(-8 * z, -9 * z);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo((-16 + i * 7) * z, (-6 + i * 5) * z);
    ctx.lineTo((11 + i * 6) * z, (-11 + i * 5) * z);
    ctx.stroke();
  }
}
