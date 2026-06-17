import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class MagnetRaider extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "magnet_raider";
    this.cooldown = this.cdInitial;
    this.orbit = Math.random() * TAU;
    this.stolen = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.34);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.4;
    this.orbit += dt * 3.8;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    const dir = d < this.keepDistance ? -0.55 : 0.65;
    const strafe = Math.sin(this.anim * 0.6) * 0.58;
    this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
    this.pullPickups(dt);
    if (this.cooldown <= 0) {
      this.cooldown = this.cd + Math.random() * this.cdRandom;
      pulse(this.x, this.y, this.absorbRange * 0.22, this.color, 0.1);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  pullPickups(dt) {
    for (const collection of [world.coins, world.gems]) {
      for (const item of collection) {
        const dx = this.x - item.x;
        const dy = this.y - item.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        if (d > this.absorbRange) continue;
        const pull = (1 - d / this.absorbRange) * this.pullStrength + this.pullBase;
        item.x += dx / d * pull * dt;
        item.y += dy / d * pull * dt;
      }
    }
    if (Math.random() < dt * 10) particle("scan", this.x, this.y, { color: this.color, life: 0.22, size: 2.4, alpha: 0.7 });
  }

  kill() {
    pulse(this.x, this.y, 82, this.color, 0.24);
    super.kill();
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 1.4) * 3);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 9, this.r * 1.05, this.r * 0.22, 0, 0, TAU);
    ctx.fill();
    const pulseAlpha = 0.18 + Math.sin(this.anim * 2.1) * 0.06;
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(66,232,255,${pulseAlpha})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, (31 + i * 8) * z, (16 + i * 5) * z, this.orbit * 0.22, 0, TAU);
      ctx.stroke();
    }

    ctx.fillStyle = flash ? "#ffffff" : "#101827";
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-10 * z, -16 * z, 20 * z, 32 * z, 6 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.13)";
    ctx.fillRect(-6 * z, -13 * z, 12 * z, 4 * z);
    ctx.fillRect(-7 * z, 10 * z, 14 * z, 3 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.72)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6 * z, -4 * z);
    ctx.lineTo(0, -8 * z);
    ctx.lineTo(6 * z, -4 * z);
    ctx.moveTo(-6 * z, 5 * z);
    ctx.lineTo(0, 9 * z);
    ctx.lineTo(6 * z, 5 * z);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#ff4d6d";
    ctx.fillRect(-25 * z, -13 * z, 15 * z, 26 * z);
    ctx.fillStyle = flash ? "#ffffff" : "#42e8ff";
    ctx.fillRect(10 * z, -13 * z, 15 * z, 26 * z);
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.22)";
    for (const sx of [-1, 1]) {
      ctx.fillRect(sx * 15 * z, -9 * z, sx * 7 * z, 3 * z);
      ctx.fillRect(sx * 15 * z, 5 * z, sx * 7 * z, 3 * z);
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 5 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,255,255,0.72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * z, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = "rgba(66,232,255,0.28)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = this.orbit + i * TAU / 3;
      ctx.beginPath();
      ctx.arc(0, 0, (22 + i * 5) * z, a, a + 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
}
