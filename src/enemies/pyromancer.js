import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class Pyromancer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "pyromancer";
    this.aimTime = 0;
    this.aimAngle = 0;
    this.cooldown = this.cdInitial;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.6;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown -= dt;
    this.flip = dx < 0 ? -1 : 1;

    if (this.aimTime > 0) {
      this.aimTime -= dt;
      this.aimAngle = Math.atan2(dy, dx);
      if (Math.random() < dt * 16) particle("ember", this.x, this.y - this.r * 0.8, { color: this.color, life: 0.35, size: 3, alpha: 0.8, vy: -30 });
      if (this.aimTime <= 0) this.shootVolley();
    } else {
      const dir = d < this.keepDistance ? -0.8 : 0.28;
      const strafe = Math.sin(this.anim * 0.8) * 0.34;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.aimTime = this.aimDuration;
        pulse(this.x, this.y, 46, "#ffd166", 0.28);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  shootVolley() {
    this.cooldown = this.cd + Math.random() * this.cdRandom;
    const spread = this.volleySpread;
    for (const offset of [-spread, 0, spread]) {
      const a = this.aimAngle + offset;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * 18,
        y: this.y + Math.sin(a) * 18,
        vx: Math.cos(a) * this.bulletSpeed,
        vy: Math.sin(a) * this.bulletSpeed,
        r: 8,
        color: this.color,
        damage: this.damage * this.bulletDamageMul,
        burnDuration: this.burnDuration,
        burnDps: this.damage * this.burnDpsMul,
        life: this.bulletLife,
        shape: "fireball",
        spin: Math.random() * TAU,
        emberTrail: true,
      });
    }
    burst(this.x, this.y, 14, "#ffd166", 210);
    pulse(this.x, this.y, 56, this.color, 0.28);
  }

  draw(ctx) {
    const z = this.r / 16;
    const flash = this.flash > 0;
    const flame = 1 + Math.sin(this.anim * 2.4) * 0.08;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(0, 15 * z, 17 * z, 5 * z, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = flash ? 0.9 : 0.42;
    for (let i = 0; i < 5; i++) {
      const a = this.anim * 0.45 + i / 5 * TAU;
      ctx.strokeStyle = i % 2 ? "rgba(255,209,102,0.45)" : "rgba(255,77,109,0.35)";
      ctx.lineWidth = 1.4 * z;
      ctx.beginPath();
      ctx.arc(0, -5 * z, (22 + i * 3) * z, a, a + 0.32);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = flash ? "#ffffff" : "#351005";
    ctx.beginPath();
    ctx.roundRect(-11 * z, -8 * z, 22 * z, 26 * z, 6 * z);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "#ffb347";
    ctx.lineWidth = 2 * z;
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#ff4d1f";
    ctx.beginPath();
    ctx.moveTo(0, -31 * z * flame);
    ctx.lineTo(12 * z, -12 * z);
    ctx.lineTo(6 * z, 7 * z);
    ctx.lineTo(-5 * z, 7 * z);
    ctx.lineTo(-12 * z, -12 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#ffd166";
    ctx.beginPath();
    ctx.moveTo(0, -24 * z * flame);
    ctx.lineTo(6 * z, -10 * z);
    ctx.lineTo(2 * z, 4 * z);
    ctx.lineTo(-4 * z, 4 * z);
    ctx.lineTo(-7 * z, -10 * z);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,209,102,0.65)";
    ctx.lineWidth = 2 * z;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 9 * z, 0);
      ctx.quadraticCurveTo(side * 21 * z, -8 * z, side * 28 * z, -2 * z + Math.sin(this.anim * 1.8) * 3 * z);
      ctx.stroke();
      ctx.fillStyle = this.aimTime > 0 ? "#fff2a8" : this.color;
      ctx.beginPath();
      ctx.arc(side * 30 * z, -2 * z + Math.sin(this.anim * 1.8) * 3 * z, (this.aimTime > 0 ? 5 : 3) * z, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.arc(0, -8 * z, 5 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#3b1608";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.aimTime > 0) {
      ctx.strokeStyle = "rgba(255,209,102,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -8 * z, 22 * z + Math.sin(this.anim * 8) * 3, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,77,109,0.42)";
      ctx.beginPath();
      ctx.arc(0, -8 * z, 32 * z - Math.sin(this.anim * 9) * 4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
