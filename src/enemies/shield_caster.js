import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { particle, pulse, trail } from "../effects.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class ShieldCaster extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "shield";
    this.cooldown = this.cdInitial;
    this.channel = 0;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.4);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 3.8;
    this.cooldown -= dt;
    this.channel = Math.max(0, this.channel - dt);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    const cluster = this.findClusterCenter();
    if (cluster) {
      const tx = cluster.x - this.x;
      const ty = cluster.y - this.y;
      const td = Math.max(1, Math.hypot(tx, ty));
      if (td > 90) {
        this.x += (tx / td) * this.speed * 0.38 * dt;
        this.y += (ty / td) * this.speed * 0.38 * dt;
      }
    } else {
      const dir = d < this.keepRange ? -0.82 : 0.22;
      const strafe = Math.sin(this.anim * 0.8) * 0.35;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
    }

    let shielded = 0;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss) continue;
      if (distSq(e.x, e.y, this.x, this.y) <= this.shieldRange * this.shieldRange) {
        e.shielded = true;
        e.shieldPulse = Math.max(e.shieldPulse || 0, 0.18);
        shielded++;
        if (shielded <= 2 && Math.random() < dt * 4) trail(this.x, this.y, e.x, e.y, this.color, 2);
      }
    }

    if (shielded > 0 && this.cooldown <= 0) {
      this.cooldown = this.cd + Math.random() * this.cdRandom;
      this.channel = this.channelDuration;
      pulse(this.x, this.y, this.shieldRange * 0.36, this.color, 0.16);
    }
    if (this.channel > 0 && Math.random() < dt * 12) particle("mote", this.x, this.y, { color: this.color, life: 0.35, size: 2.5, alpha: 0.72 });

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  findClusterCenter() {
    let x = 0;
    let y = 0;
    let count = 0;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss) continue;
      if (distSq(e.x, e.y, this.x, this.y) < this.clusterRange * this.clusterRange) {
        x += e.x;
        y += e.y;
        count++;
      }
    }
    return count >= 2 ? { x: x / count, y: y / count } : null;
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const core = flash ? "#ffffff" : this.color;
    const body = flash ? "#ffffff" : "#dff7ff";
    const wingOpen = 1 + Math.sin(this.anim * 2.2) * 0.12 + this.channel * 0.35;
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 1.5) * 2.5);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 7, this.r * 0.9, this.r * 0.23, 0, 0, TAU);
    ctx.fill();

    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = "rgba(125,211,252,0.22)";
      ctx.strokeStyle = core;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(5 * z, -10 * z);
      ctx.lineTo(24 * z * wingOpen, -17 * z);
      ctx.lineTo(30 * z * wingOpen, 8 * z);
      ctx.lineTo(8 * z, 13 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = body;
    diamond(ctx, 0, 0, 14 * z, 22 * z);
    ctx.strokeStyle = core;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = core;
    diamond(ctx, 0, 0, 7 * z, 11 * z);
    ctx.strokeStyle = core;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + this.anim * 0.45;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 22 * z, Math.sin(a) * 22 * z);
      ctx.lineTo(Math.cos(a) * 28 * z, Math.sin(a) * 28 * z);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function diamond(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
}
