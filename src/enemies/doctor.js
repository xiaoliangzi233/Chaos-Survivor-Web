import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class Doctor extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "doctor";
    this.cooldown = this.cdInitial;
    this.healTarget = null;
    this.healTargets = [];
    this.channel = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.24);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.8;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown -= dt;
    this.flip = dx < 0 ? -1 : 1;

    this.healTargets = this.findHealTargets();
    this.healTarget = null;
    if (this.healTargets.length && this.cooldown <= 0) {
      this.channel = 0.9;
      for (const target of this.healTargets) particle("healPlus", target.x, target.y - target.r - 8, { color: "#72ffb4", life: 0.42, size: 9, alpha: 0.9, vy: -18 });
    }
    if (this.channel > 0 && this.healTargets.length) {
      this.channel -= dt;
      const healRate = 20 + state.wave * 1.8;
      for (const target of this.healTargets) {
        if (target.dead || target.hp >= target.maxHp) continue;
        target.hp = Math.min(target.maxHp, target.hp + healRate * dt);
        if (Math.random() < dt * 14) particle("healPlus", target.x, target.y - target.r - 8, { color: "#72ffb4", life: 0.42, size: 9, alpha: 0.9, vy: -18 });
      }
      if (this.channel <= 0) {
        this.cooldown = this.cd + Math.random() * this.cdRandom;
        pulse(this.x, this.y, this.healRange, "#72ffb4", 0.18);
        playSfx("level");
      }
      this.moveRelative(dx, dy, d, dt, d < this.keepDistance ? -0.75 : 0.15);
    } else {
      this.channel = 0;
      this.moveRelative(dx, dy, d, dt, d < this.keepDistance ? -0.85 : 0.32);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  moveRelative(dx, dy, d, dt, dir) {
    const strafe = Math.sin(this.anim * 0.65) * 0.38;
    this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
  }

  findHealTargets() {
    const targets = [];
    const range2 = this.healRange * this.healRange;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss || e.hp >= e.maxHp) continue;
      if (distSq(this.x, this.y, e.x, e.y) > range2) continue;
      targets.push(e);
    }
    return targets;
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const bob = Math.sin(this.anim * 1.6) * 3;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 7 - bob, this.r * 0.9, this.r * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#eafff5";
    ctx.strokeStyle = flash ? "#ffffff" : "#72ffb4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-14 * z, -15 * z, 28 * z, 27 * z, 7 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#134e3a";
    ctx.fillRect(-3 * z, -10 * z, 6 * z, 18 * z);
    ctx.fillRect(-9 * z, -4 * z, 18 * z, 6 * z);
    ctx.strokeStyle = "#72ffb4";
    ctx.beginPath();
    ctx.arc(0, 0, 21 * z + Math.sin(this.anim * 3) * 2, 0, TAU);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#26344a";
      ctx.fillRect(side * 15 * z, -5 * z, side * 9 * z, 7 * z);
      ctx.fillStyle = "#72ffb4";
      ctx.beginPath();
      ctx.arc(side * 25 * z, -2 * z, 3 * z, 0, TAU);
      ctx.fill();
    }
    if (this.channel > 0 && this.healTargets.length) {
      ctx.strokeStyle = "rgba(114,255,180,0.34)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, this.healRange, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
