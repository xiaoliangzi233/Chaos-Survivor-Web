import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class Wizard extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "wizard";
    this.castTime = 0;
    this.castAngle = 0;
    this.cooldown = this.cdInitial;
    this.orbit = Math.random() * TAU;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.6;
    this.orbit += dt * 2.7;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.castTime > 0) {
      this.castTime -= dt;
      const target = Math.atan2(dy, dx);
      this.castAngle += angleDiff(target, this.castAngle) * Math.min(1, dt * 2.5);
      if (Math.random() < dt * 14) {
        particle("mote", this.x, this.y - this.r * 0.9, { color: this.color, life: 0.42, size: 3, alpha: 0.85 });
      }
      if (this.castTime <= 0) this.releaseSpell();
    } else {
      const dir = d < this.keepDistance ? -0.75 : d > this.castRange ? 0.48 : 0.04;
      const strafe = Math.sin(this.anim * 0.52) * 0.42;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.castRange) {
        this.castTime = this.elite ? this.castTimeElite : this.castDuration;
        this.castAngle = Math.atan2(dy, dx);
        pulse(this.x, this.y, 38, this.color, 0.28);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  releaseSpell() {
    this.cooldown = this.elite ? this.cdElite : this.cd + Math.random() * this.cdRandom;
    const count = this.elite ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const a = this.castAngle + (count === 1 ? 0 : (i - 0.5) * 0.16);
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 10),
        y: this.y + Math.sin(a) * (this.r + 10),
        vx: Math.cos(a) * 205,
        vy: Math.sin(a) * 205,
        r: 8,
        color: this.color,
        damage: this.damage * 0.72,
        life: 4.4,
        shape: "arcaneOrb",
        spin: Math.random() * TAU,
      });
    }
    burst(this.x, this.y - this.r * 0.5, 7, this.color, 140);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const bob = Math.sin(this.anim * 1.35) * 4;
    const cast = this.castTime > 0;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8 - bob, this.r * 0.95, this.r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(180,140,255,${0.22 + (cast ? 0.18 : 0)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, -4 * z, 24 * z, 30 * z, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#241946";
    ctx.beginPath();
    ctx.moveTo(0, -24 * z);
    ctx.lineTo(15 * z, -2 * z);
    ctx.lineTo(9 * z, 18 * z);
    ctx.lineTo(-10 * z, 18 * z);
    ctx.lineTo(-15 * z, -2 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.12)";
    ctx.fillRect(-8 * z, -2 * z, 16 * z, 3 * z);
    ctx.fillRect(-6 * z, 7 * z, 12 * z, 3 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.65)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-17 * z, -3 * z);
    ctx.lineTo(17 * z, -3 * z);
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#0f172a";
    ctx.beginPath();
    ctx.arc(0, -7 * z, 9 * z, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.moveTo(0, -15 * z);
    ctx.lineTo(7 * z, -7 * z);
    ctx.lineTo(0, 1 * z);
    ctx.lineTo(-7 * z, -7 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(217,251,255,0.72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -7 * z, 12 * z, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.rotate(this.castAngle);
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12 * z, 10 * z);
    ctx.lineTo(34 * z, 18 * z);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#ffd166";
    ctx.beginPath();
    ctx.arc(37 * z, 19 * z, (3 + (cast ? Math.sin(this.anim * 8) : 0)) * z, 0, TAU);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const a = this.orbit + i * TAU / 3;
      const rr = (cast ? 25 : 20) * z;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.55 - 7 * z;
      ctx.fillStyle = flash ? "#ffffff" : i === 0 ? "#ffffff" : this.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + this.anim);
      ctx.fillRect(-3 * z, -3 * z, 6 * z, 6 * z);
      ctx.restore();
    }
    if (cast) {
      ctx.strokeStyle = "rgba(255,209,102,0.5)";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) {
        const a = this.orbit * -0.6 + i * TAU / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 12 * z, -7 * z + Math.sin(a) * 8 * z);
        ctx.lineTo(Math.cos(a) * 30 * z, -7 * z + Math.sin(a) * 16 * z);
        ctx.stroke();
      }
    }

    if (cast) {
      ctx.strokeStyle = "rgba(180,140,255,0.76)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -7 * z, (24 + Math.sin(this.anim * 9) * 3) * z, 0, TAU);
      ctx.stroke();
      ctx.save();
      ctx.rotate(this.castAngle);
      ctx.strokeStyle = "rgba(255,255,255,0.36)";
      ctx.beginPath();
      ctx.moveTo(12 * z, 0);
      ctx.lineTo(48 * z, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return diff;
}
