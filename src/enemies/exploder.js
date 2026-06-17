import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";




export class Exploder extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "exploder";
    this.fuse = 0;
    this.armed = false;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.18);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.armed ? 11 : 5);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (!this.armed && d < this.armRange) {
      this.armed = true;
      this.fuse = this.fuseTime;
      pulse(this.x, this.y, this.explodeRadius, this.color, 0.25);
    }
    if (this.armed) {
      this.fuse -= dt;
      this.x += (dx / d) * this.speed * this.armedSpeedMul * dt;
      this.y += (dy / d) * this.speed * this.armedSpeedMul * dt;
      if (this.fuse <= 0) this.explode();
    } else {
      this.x += (dx / d) * this.speed * dt;
      this.y += (dy / d) * this.speed * dt;
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  explode() {
    const p = state.player;
    if (distSq(this.x, this.y, p.x, p.y) < (this.explodeRadius + p.r) ** 2 && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.52;
      state.flash = 0.38;
      state.shake = 14;
      playSfx("hurt");
    }
    pulse(this.x, this.y, this.explodeRadius, this.color, 0.48);
    burst(this.x, this.y, 24, this.color, 230);
    this.kill();
  }

  draw(ctx) {
    const z = this.r / 13;
    const flash = this.flash > 0 || (this.armed && Math.sin(this.anim * 2.7) > 0.45);
    const pulseScale = this.armed ? 1 + Math.sin(this.anim * 1.9) * 0.15 : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulseScale, pulseScale);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 15 * z, 16 * z, 5 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.armed ? "rgba(255,77,109,0.62)" : "rgba(255,176,110,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, (20 + Math.sin(this.anim * 1.2) * 2) * z, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#2a1214";
    ctx.beginPath();
    ctx.arc(0, 0, 15 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.2)";
    ctx.beginPath();
    ctx.arc(-4 * z, -3 * z, 9 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "#ffb06e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + Math.sin(this.anim) * 0.18;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4 * z, Math.sin(a) * 4 * z);
      ctx.lineTo(Math.cos(a) * 14 * z, Math.sin(a) * 14 * z);
      ctx.stroke();
    }
    ctx.fillStyle = flash ? "#ffffff" : this.armed ? "#ffffff" : "#ff4d6d";
    ctx.beginPath();
    ctx.arc(0, 0, (4.5 + (this.armed ? Math.sin(this.anim * 4) * 1.8 : 0)) * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = this.anim * 0.25 + i * TAU / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 9 * z, Math.sin(a) * 9 * z, 2 * z, 0, TAU);
      ctx.stroke();
    }
    if (this.armed) {
      ctx.strokeStyle = "rgba(255,77,109,0.48)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.explodeRadius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
