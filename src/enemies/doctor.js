import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

const HEAL_RANGE = 260;
const KEEP_DISTANCE = 330;

export class Doctor extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "doctor";
    this.cooldown = 0.8;
    this.healTarget = null;
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

    this.healTarget = this.findHealTarget();
    if (this.healTarget && this.cooldown <= 0) this.channel = 0.9;
    if (this.channel > 0 && this.healTarget && !this.healTarget.dead) {
      this.channel -= dt;
      this.healTarget.hp = Math.min(this.healTarget.maxHp, this.healTarget.hp + (28 + state.wave * 2) * dt);
      this.healTarget.flash = Math.max(this.healTarget.flash, 0.22);
      trail(this.x, this.y, this.healTarget.x, this.healTarget.y, "#72ffb4", 3);
      if (Math.random() < dt * 9) particle("mote", this.healTarget.x, this.healTarget.y, { color: "#72ffb4", life: 0.38, size: 3, alpha: 0.8 });
      if (this.channel <= 0) {
        this.cooldown = 2.4;
        pulse(this.healTarget.x, this.healTarget.y, 42, "#72ffb4", 0.22);
        playSfx("level");
      }
      this.moveRelative(dx, dy, d, dt, d < KEEP_DISTANCE ? -0.75 : 0.15);
    } else {
      this.channel = 0;
      this.moveRelative(dx, dy, d, dt, d < KEEP_DISTANCE ? -0.85 : 0.32);
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

  findHealTarget() {
    let best = null;
    let bestRatio = 0.98;
    const range2 = HEAL_RANGE * HEAL_RANGE;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss || e.hp >= e.maxHp) continue;
      if (distSq(this.x, this.y, e.x, e.y) > range2) continue;
      const ratio = e.hp / Math.max(1, e.maxHp);
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = e;
      }
    }
    return best;
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
    if (this.healTarget && this.channel > 0) {
      ctx.strokeStyle = "rgba(114,255,180,0.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this.healTarget.x - this.x, this.healTarget.y - this.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
