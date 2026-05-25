import { WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

export class Speeder extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.dashState = "ready";
    this.dashCooldown = 0.8 + Math.random() * 0.7;
    this.dashWindup = 0;
    this.dashTime = 0;
    this.dashVx = 0;
    this.dashVy = 0;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    this.anim += dt * 7.5;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.dashState === "windup") {
      this.dashWindup -= dt;
      this.x -= (dx / d) * this.speed * 0.25 * dt;
      this.y -= (dy / d) * this.speed * 0.25 * dt;
      if (this.dashWindup <= 0) {
        const a = Math.atan2(dy, dx);
        this.dashVx = Math.cos(a) * 500;
        this.dashVy = Math.sin(a) * 500;
        this.dashTime = 0.32;
        this.dashState = "dashing";
        burst(this.x, this.y, 8, this.color, 120);
      }
    } else if (this.dashState === "dashing") {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      this.dashTime -= dt;
      trail(this.x, this.y, this.x - this.dashVx * 0.035, this.y - this.dashVy * 0.035, this.color, 7);
      if (this.dashTime <= 0) {
        this.dashState = "ready";
        this.dashCooldown = 1.65;
      }
    } else if (d < 280 && this.dashCooldown <= 0) {
      this.dashState = "windup";
      this.dashWindup = 0.42;
      this.dashCooldown = 2.2;
      pulse(this.x, this.y, 32, this.color, 0.22);
    } else {
      this.chase(dt, dx, dy, d, 1.15);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      p.hp -= this.damage;
      p.invuln = 0.55;
      state.shake = 8;
      state.flash = 0.28;
    }
  }

  draw(ctx) {
    const z = 1.08;
    const walk = Math.sin(this.anim);
    const charge = this.dashState === "windup";
    const dash = this.dashState === "dashing";

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.scale(this.flip || 1, 1);
    ctx.translate(dash ? 4 : charge ? -2 : Math.sin(this.anim * 0.6) * 1.2, Math.sin(this.anim * 1.4) * 1.1);

    if (dash) {
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = `rgba(255,209,102,${0.08 * i})`;
        ctx.fillRect(-28 - i * 7, -18 + i, 22, 34);
      }
    }
    if (charge) {
      ctx.strokeStyle = "rgba(255,209,102,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-20, -18);
      ctx.lineTo(-32, 0);
      ctx.lineTo(-20, 18);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(-10 * z, 10 * z, 21 * z, 4 * z);

    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#d8a83f";
    ctx.fillRect(-7 * z, -12 * z, 15 * z, 25 * z);
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#ffd166";
    ctx.fillRect(-8 * z, -28 * z, 16 * z, 16 * z);

    ctx.fillStyle = "#5f3b12";
    ctx.fillRect(-9 * z, -29 * z, 18 * z, 4 * z);
    ctx.fillRect(-7 * z, 10 * z + walk * 3 * z, 6 * z, 13 * z);
    ctx.fillRect(3 * z, 10 * z - walk * 3 * z, 6 * z, 13 * z);

    ctx.fillStyle = "#2a1d18";
    ctx.fillRect(-4 * z, -23 * z, 3 * z, 3 * z);
    ctx.fillRect(4 * z, -23 * z, 3 * z, 3 * z);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(5 * z, -24 * z, 2 * z, 2 * z);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-1 * z, -17 * z, 7 * z, 2 * z);

    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-15 * z, -9 * z + walk * 3.5 * z, 9 * z, 5 * z);
    ctx.fillRect(7 * z, -8 * z - walk * 3.5 * z, 10 * z, 5 * z);

    ctx.strokeStyle = dash ? "#ffffff" : "rgba(80,45,8,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-7 * z, -12 * z, 15 * z, 25 * z);
    ctx.strokeRect(-8 * z, -28 * z, 16 * z, 16 * z);
    ctx.restore();
  }
}
