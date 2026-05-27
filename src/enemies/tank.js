import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

export class Tank extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "tank";
    this.armor = 0.42;
    this.stance = 0;
    this.stanceCooldown = 1.4 + Math.random();
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.82);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 3.2;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.stanceCooldown -= dt;
    if (this.stanceCooldown <= 0) {
      this.stance = 1.15;
      this.stanceCooldown = 5.2;
    }
    this.stance = Math.max(0, this.stance - dt);
    const speedMul = this.stance > 0 ? 0.45 : 0.9;
    this.x += (dx / d) * this.speed * speedMul * dt;
    this.y += (dy / d) * this.speed * speedMul * dt;
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.55;
      state.shake = 11;
      state.flash = 0.28;
      burst(p.x, p.y, 12, this.color, 120);
    }
  }

  takeDamage(amount, x, y) {
    const reduction = this.stance > 0 ? 0.28 : this.armor;
    super.takeDamage(amount * (1 - reduction), x, y);
    if (Math.random() < 0.6) burst(x, y, 2, "#ffd166", 160);
  }

  draw(ctx) {
    const z = this.r / 24;
    const flash = this.flash > 0;
    const brace = this.stance > 0;
    const bob = Math.abs(Math.sin(this.anim * 1.3)) * 2;
    ctx.save();
    ctx.translate(this.x, this.y - bob);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 25 * z + bob, 27 * z, 8 * z, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#26344a";
    ctx.beginPath();
    ctx.roundRect(-24 * z, -18 * z, 48 * z, 38 * z, 7 * z);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "#ffd166";
    ctx.lineWidth = brace ? 4 : 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#111827";
    ctx.fillRect(-18 * z, -10 * z, 36 * z, 11 * z);
    ctx.fillStyle = brace ? "#ffffff" : "#ff4d6d";
    ctx.fillRect(7 * z, -7 * z, 8 * z, 5 * z);
    ctx.fillStyle = "#ffd166";
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 13 * z - 4 * z, 13 * z, 8 * z, 5 * z);
    if (brace) {
      ctx.strokeStyle = "rgba(255,209,102,0.72)";
      ctx.beginPath();
      ctx.arc(0, 0, 34 * z, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
