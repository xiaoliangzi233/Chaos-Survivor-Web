import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

const KEEP_DISTANCE = 390;

export class Pyromancer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "pyromancer";
    this.aimTime = 0;
    this.aimAngle = 0;
    this.cooldown = 1.2 + Math.random();
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
      const dir = d < KEEP_DISTANCE ? -0.8 : 0.28;
      const strafe = Math.sin(this.anim * 0.8) * 0.34;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < 700) {
        this.aimTime = 0.55;
        pulse(this.x, this.y, 34, this.color, 0.25);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  shootVolley() {
    this.cooldown = 2.35;
    const spread = 0.18;
    for (const offset of [-spread, 0, spread]) {
      const a = this.aimAngle + offset;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * 18,
        y: this.y + Math.sin(a) * 18,
        vx: Math.cos(a) * 245,
        vy: Math.sin(a) * 245,
        r: 8,
        color: this.color,
        damage: this.damage * 0.48,
        burnDuration: 2.5,
        burnDps: this.damage * 0.28,
        life: 4,
        shape: "fireball",
      });
    }
    burst(this.x, this.y, 8, this.color, 160);
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
    ctx.fillStyle = flash ? "#ffffff" : "#2b1208";
    ctx.beginPath();
    ctx.roundRect(-10 * z, -10 * z, 20 * z, 25 * z, 5 * z);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.moveTo(0, -31 * z * flame);
    ctx.lineTo(12 * z, -12 * z);
    ctx.lineTo(6 * z, 7 * z);
    ctx.lineTo(-5 * z, 7 * z);
    ctx.lineTo(-12 * z, -12 * z);
    ctx.closePath();
    ctx.fill();
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
    }
    ctx.restore();
  }
}
