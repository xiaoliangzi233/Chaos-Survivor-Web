import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class Razorbat extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "razorbat";
    this.cooldown = this.cdInitial;
    this.swoop = Math.random() * TAU;
    this.throwWindup = 0;
    this.throwAngle = 0;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 10;
    this.swoop += dt * 2.4;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.throwWindup > 0) {
      this.throwWindup -= dt;
      this.throwAngle = Math.atan2(dy, dx) + Math.sin(this.swoop) * 0.18;
      if (this.throwWindup <= 0) this.throwBlade();
    } else {
      const dir = d < this.orbitRange ? -0.42 : 0.82;
      const strafe = 1.15 * Math.sin(this.swoop);
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.throwRange) {
        this.throwWindup = this.throwWindupTime;
        pulse(this.x, this.y, 24, this.color, 0.18);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  throwBlade() {
    this.cooldown = this.elite ? this.cdElite : this.cd + Math.random() * this.cdRandom;
    const a = this.throwAngle;
    world.enemyProjectiles.push({
      x: this.x + Math.cos(a) * (this.r + 8),
      y: this.y + Math.sin(a) * (this.r + 8),
      vx: Math.cos(a) * this.bladeSpeed,
      vy: Math.sin(a) * this.bladeSpeed,
      r: 7,
      color: this.color,
      damage: this.damage * this.bladeDamageMul,
      life: this.bladeLife,
      maxLife: this.bladeLife,
      returnAt: this.bladeReturnAt,
      owner: this,
      shape: "razorBoomerang",
      spin: Math.random() * TAU,
    });
    burst(this.x, this.y, 5, this.color, 120);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 12;
    const flap = Math.sin(this.anim) * 0.8;
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.swoop * 1.7) * 4);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8, this.r * 1.1, this.r * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(124,137,255,${0.22 + Math.abs(flap) * 0.08})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 1 * z, 18 * z, 12 * z, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#1f2440";
    ctx.beginPath();
    ctx.moveTo(-8 * z, -3 * z);
    ctx.lineTo(0, -12 * z);
    ctx.lineTo(8 * z, -3 * z);
    ctx.lineTo(6 * z, 8 * z);
    ctx.lineTo(-6 * z, 8 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.16)";
    ctx.fillRect(-4 * z, -6 * z, 8 * z, 3 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,77,109,0.72)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 8 * z);
    ctx.lineTo(0, 17 * z);
    ctx.lineTo(-4 * z, 21 * z);
    ctx.moveTo(0, 17 * z);
    ctx.lineTo(4 * z, 21 * z);
    ctx.stroke();

    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(side * flap * 0.18);
      ctx.fillStyle = flash ? "#ffffff" : "#c7d2ff";
      ctx.beginPath();
      ctx.moveTo(6 * z, -4 * z);
      ctx.quadraticCurveTo(23 * z, (-16 - flap * 8) * z, 35 * z, -2 * z);
      ctx.lineTo(24 * z, 5 * z);
      ctx.lineTo(12 * z, 4 * z);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(9 * z, (-2 + i * 2) * z);
        ctx.quadraticCurveTo((17 + i * 5) * z, (-10 - flap * 4 + i * 5) * z, (28 + i * 3) * z, (-2 + i * 4) * z);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? "#ffffff" : "#7c89ff";
      ctx.beginPath();
      ctx.moveTo(20 * z, 3 * z);
      ctx.lineTo(36 * z, -2 * z);
      ctx.lineTo(24 * z, 11 * z);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = this.throwWindup > 0 ? "#ffffff" : "#ff4d6d";
    ctx.beginPath();
    ctx.arc(0, -3 * z, 4 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.throwWindup > 0 ? "#ffffff" : this.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -3 * z, (7 + Math.sin(this.anim * 0.8) * 1.2) * z, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
