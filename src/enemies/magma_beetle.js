import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class MagmaBeetle extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "magma_beetle";
    this.cooldown = this.cdInitial;
    this.state = "crawl";
    this.windup = 0;
    this.chargeTime = 0;
    this.chargeAngle = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.7);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.4;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.state === "windup") {
      this.windup -= dt;
      this.chargeAngle = Math.atan2(dy, dx);
      if (Math.random() < dt * 16) particle("ember", this.x, this.y, { color: this.color, life: 0.28, size: 3, alpha: 0.85 });
      if (this.windup <= 0) {
        this.state = "charge";
        this.chargeTime = this.chargeDuration;
        pulse(this.x, this.y, 38, this.color, 0.2);
      }
    } else if (this.state === "charge") {
      this.chargeTime -= dt;
      const speed = this.speed * this.chargeSpeedMul;
      const oldX = this.x;
      const oldY = this.y;
      this.x += Math.cos(this.chargeAngle) * speed * dt;
      this.y += Math.sin(this.chargeAngle) * speed * dt;
      if (Math.random() < dt * 18) this.dropTrail((oldX + this.x) / 2, (oldY + this.y) / 2);
      if (this.chargeTime <= 0) {
        this.state = "crawl";
        this.cooldown = this.cd + Math.random() * this.cdRandom;
      }
    } else {
      this.x += dx / d * this.speed * dt;
      this.y += dy / d * this.speed * dt;
      if (this.cooldown <= 0 && d < this.chargeRange) {
        this.state = "windup";
        this.windup = this.windupTime;
        this.chargeAngle = Math.atan2(dy, dx);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  dropTrail(x, y) {
    world.hazards.push({
      kind: "magma_crack",
      x,
      y,
      r: 34,
      color: this.color,
      damage: this.damage * this.trailDamageMul,
      life: this.trailLife,
      maxLife: this.trailLife,
      angle: this.chargeAngle,
    });
    burst(x, y, 3, this.color, 80);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 22;
    const hot = this.state === "windup" ? 1 + Math.sin(this.anim * 8) * 0.18 : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.31)";
    ctx.beginPath();
    ctx.ellipse(0, 22 * z, 27 * z, 7 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(255,122,26,${0.24 + hot * 0.14})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 1 * z, 31 * z, 20 * z, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#1d1717";
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25 * z, 17 * z, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.16)";
    ctx.beginPath();
    ctx.ellipse(-6 * z, -1 * z, 15 * z, 9 * z, 0, 0, TAU);
    ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.strokeStyle = flash ? "#ffffff" : `rgba(255,122,26,${0.35 + hot * 0.18})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i * 8 * z, -14 * z);
      ctx.lineTo(i * 4 * z, 14 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.62)";
    ctx.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) {
      const x = i * 9 * z;
      ctx.beginPath();
      ctx.moveTo(x - 4 * z, -7 * z);
      ctx.lineTo(x + 3 * z, -2 * z);
      ctx.lineTo(x - 2 * z, 5 * z);
      ctx.stroke();
    }
    ctx.fillStyle = flash ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.ellipse(17 * z, -1 * z, 11 * z * hot, 9 * z, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#fff2a8";
    ctx.beginPath();
    ctx.arc(21 * z, -3 * z, 2.5 * z * hot, 0, TAU);
    ctx.arc(21 * z, 3 * z, 2.5 * z * hot, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#fff2a8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24 * z, -5 * z);
    ctx.lineTo(37 * z, -14 * z);
    ctx.moveTo(24 * z, 5 * z);
    ctx.lineTo(37 * z, 14 * z);
    ctx.stroke();
    ctx.fillStyle = "#0b1020";
    for (const y of [-13, 0, 13]) {
      ctx.fillRect(-18 * z, y * z, 34 * z, 3 * z);
    }
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,122,26,0.55)";
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = (-10 + i * 9) * z;
        const y = (-12 + i * 12) * z;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 13 * z, y + side * 8 * z);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
