import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class Gearfiend extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "gearfiend";
    this.cooldown = this.cdInitial;
    this.windup = 0;
    this.mode = "fast";
    this.angle = 0;
    this.spin = Math.random() * TAU;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.48);
    this.fastOnly = false;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.5;
    this.spin += dt * 8;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.applyScenario();

    if (this.windup > 0) {
      this.windup -= dt;
      this.angle = Math.atan2(dy, dx);
      if (this.windup <= 0) this.fireGear();
    } else {
      const dir = d < this.keepDistance ? -0.7 : d > this.keepDistance * 1.25 ? 0.35 : 0;
      const strafe = Math.sin(this.anim * 0.72) * 0.36;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.windup = 0.42;
        if (!this.fastOnly) this.mode = Math.random() < 0.56 ? "fast" : "slow";
        else this.mode = "fast";
        pulse(this.x, this.y, this.mode === "fast" ? 28 : 40, this.color, 0.2);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  applyScenario() {
    this.fastOnly = state.waveScenario?.gearfiendMode === "fast_only";
    if (this.fastOnly) this.mode = "fast";
  }

  fireGear() {
    this.applyScenario();
    if (this.mode === "fast") {
      const a = this.angle + (Math.random() - 0.5) * 0.08;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 8),
        y: this.y + Math.sin(a) * (this.r + 8),
        vx: Math.cos(a) * 330,
        vy: Math.sin(a) * 330,
        r: 7,
        color: this.color,
        damage: this.damage * 0.64,
        life: 2.4,
        shape: "fastGear",
        spin: Math.random() * TAU,
      });
      this.cooldown = this.cd + Math.random() * this.cdRandom;
    } else {
      const a = this.angle;
      const x = clamp(this.x + Math.cos(a) * 180, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
      const y = clamp(this.y + Math.sin(a) * 180, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
      const travel = Math.max(0.35, Math.hypot(x - this.x, y - this.y) / 240);
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 8),
        y: this.y + Math.sin(a) * (this.r + 8),
        vx: (x - this.x) / travel,
        vy: (y - this.y) / travel,
        r: 14,
        color: this.color,
        damage: this.damage * 0.42,
        life: travel,
        shape: "fastGear",
        spin: Math.random() * TAU,
        landTrapOnExpire: true,
        trapRadius: 38,
        trapDamage: this.damage * 0.82,
        trapLife: 3.4,
      });
      this.cooldown = this.cdAlt + Math.random() * this.cdAltRandom;
    }
    burst(this.x, this.y, 6, this.color, 140);
  }

  draw(ctx) {
    const hurt = this.flash > 0;
    const z = this.r / 16;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (hurt) {
      ctx.translate(Math.sin(this.anim * 8) * 2.5, 0);
      ctx.scale(1.04, 0.98);
    }
    ctx.fillStyle = "rgba(0,0,0,0.29)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 7, this.r * 1.05, this.r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hurt ? "rgba(255,77,109,0.45)" : "rgba(66,232,255,0.28)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(this.spin * (i ? -0.18 : 0.14));
      ctx.beginPath();
      ctx.ellipse(0, 0, (25 + i * 6) * z, (17 + i * 4) * z, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    drawGear(ctx, 0, 0, 19 * z, 12, this.spin, hurt ? "#8a5560" : "#7b8798", hurt ? "#ff4d6d" : this.color);
    ctx.fillStyle = hurt ? "#1f1420" : "#101827";
    ctx.beginPath();
    ctx.arc(0, 0, 10 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hurt ? "rgba(255,77,109,0.72)" : "rgba(255,209,102,0.72)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * z, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = this.windup > 0 ? "#fff2a8" : "#ff7a1a";
    ctx.beginPath();
    ctx.arc(Math.cos(this.angle) * 3 * z, Math.sin(this.angle) * 3 * z, 4.5 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.windup > 0 ? "#ffffff" : this.color;
    ctx.lineWidth = 1.4;
    ctx.save();
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.moveTo(13 * z, 0);
    ctx.lineTo(28 * z, 0);
    ctx.stroke();
    ctx.restore();
    for (const side of [-1, 1]) {
      drawGear(ctx, side * 20 * z, 5 * z, 7 * z, 8, -this.spin * 1.6, hurt ? "#5b3340" : "#3f4a5f", hurt ? "#ff4d6d" : this.color);
    }
    ctx.restore();
  }
}

export function drawGear(ctx, x, y, r, teeth, spin, fill, stroke) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = i * TAU / (teeth * 2);
    const rr = i % 2 === 0 ? r : r * 0.76;
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
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.fill();
  ctx.restore();
}
