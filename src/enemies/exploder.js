import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const ARM_RANGE = 92;
const EXPLODE_RADIUS = 92;

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

    if (!this.armed && d < ARM_RANGE) {
      this.armed = true;
      this.fuse = 1.05;
      pulse(this.x, this.y, EXPLODE_RADIUS, this.color, 0.25);
    }
    if (this.armed) {
      this.fuse -= dt;
      this.x += (dx / d) * this.speed * 0.42 * dt;
      this.y += (dy / d) * this.speed * 0.42 * dt;
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
    if (distSq(this.x, this.y, p.x, p.y) < (EXPLODE_RADIUS + p.r) ** 2 && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.52;
      state.flash = 0.38;
      state.shake = 14;
      playSfx("hurt");
    }
    pulse(this.x, this.y, EXPLODE_RADIUS, this.color, 0.48);
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
    ctx.fillStyle = flash ? "#ffffff" : "#2a1214";
    ctx.beginPath();
    ctx.arc(0, 0, 15 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = flash ? "#ffffff" : "#ffb06e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + Math.sin(this.anim) * 0.18;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4 * z, Math.sin(a) * 4 * z);
      ctx.lineTo(Math.cos(a) * 14 * z, Math.sin(a) * 14 * z);
      ctx.stroke();
    }
    if (this.armed) {
      ctx.strokeStyle = "rgba(255,77,109,0.48)";
      ctx.beginPath();
      ctx.arc(0, 0, EXPLODE_RADIUS, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
