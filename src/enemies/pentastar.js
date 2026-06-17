import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class Pentastar extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "pentastar";
    this.cooldown = this.cdInitial;
    this.windup = 0;
    this.spin = Math.random() * TAU;
    this.fireAngle = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.4);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.2;
    this.spin += dt * (this.windup > 0 ? -8.5 : 1.7);
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.windup > 0) {
      this.windup -= dt;
      if (Math.random() < dt * 12) particle("scan", this.x, this.y, { color: this.color, life: 0.26, size: 2.5, alpha: 0.8 });
      if (this.windup <= 0) this.firePentagram();
    } else {
      const dir = d < this.stopRange * 0.72 ? -0.55 : d > this.stopRange ? 0.42 : 0;
      const strafe = Math.sin(this.anim * 0.42) * 0.2;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.windup = this.windupTime;
        this.fireAngle = Math.atan2(dy, dx) + Math.random() * 0.3 - 0.15;
        pulse(this.x, this.y, 42, this.color, 0.24);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  firePentagram() {
    this.cooldown = this.cd + Math.random() * this.cdRandom;
    for (let i = 0; i < 5; i++) {
      const a = this.fireAngle + i * TAU / 5;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 8),
        y: this.y + Math.sin(a) * (this.r + 8),
        vx: Math.cos(a) * this.bulletSpeed,
        vy: Math.sin(a) * this.bulletSpeed,
        r: 5.5,
        color: this.color,
        damage: this.damage * this.bulletDamageMul,
        life: this.bulletLife,
        shape: "starShard",
        spin: Math.random() * TAU,
      });
    }
    burst(this.x, this.y, 10, this.color, 160);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const hot = this.windup > 0 ? 1 + Math.sin(this.anim * 8) * 0.14 : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8, this.r * 1.05, this.r * 0.22, 0, 0, TAU);
    ctx.fill();
    const aura = 0.45 + Math.sin(this.anim * 2.4) * 0.15;
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(66,232,255,${0.18 + aura * 0.22})`;
    ctx.lineWidth = 1.4 * z;
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(this.spin * (i ? -0.45 : 0.35) + i * 0.6);
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a = p * TAU / 5 - Math.PI / 2;
        const x = Math.cos(a) * (27 + i * 7) * z;
        const y = Math.sin(a) * (27 + i * 7) * z;
        if (!p) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(this.spin);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 - Math.PI / 2;
      ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.24)";
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 18 * z, Math.sin(a) * 18 * z, 3.2 * z * hot, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = flash ? "#ffffff" : "#101827";
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 - Math.PI / 2;
      const r = i % 2 === 0 ? 19 * z * hot : 8 * z;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6 * z * hot, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * z * hot, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.35)";
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + this.anim * 0.12;
      ctx.fillRect(Math.cos(a) * 11 * z - 1.2 * z, Math.sin(a) * 11 * z - 1.2 * z, 2.4 * z, 2.4 * z);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 7 * z, Math.sin(a) * 7 * z);
      ctx.lineTo(Math.cos(a) * 19 * z, Math.sin(a) * 19 * z);
      ctx.stroke();
    }
    ctx.restore();
  }
}
