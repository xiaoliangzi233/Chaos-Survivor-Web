import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const MAP_HALF = WORLD_SIZE / 2;




export class LineRaider extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "line_raider";
    this.state = "drift";
    this.timer = this.initialTimer + Math.random() * this.initialTimerRandom;
    this.angle = 0;
    this.lineStart = { x, y };
    this.lineEnd = { x, y };
    this.dashT = 0;
    this.hitPlayer = false;
    this.knockbackResistance = 0.86;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 8.5;
    this.flash = Math.max(0, this.flash - dt * 10);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.timer -= dt;

    if (this.state === "warn") {
      if (Math.random() < dt * 16) particle("scan", this.x, this.y, { color: "#ffffff", life: 0.22, size: 2, alpha: 0.75 });
      if (this.timer <= 0) this.beginDash();
    } else if (this.state === "dash") {
      this.dashT += (this.dashSpeed * dt) / Math.max(1, distance(this.lineStart, this.lineEnd));
      const t = Math.min(1, this.dashT);
      const px = this.x;
      const py = this.y;
      this.x = lerp(this.lineStart.x, this.lineEnd.x, t);
      this.y = lerp(this.lineStart.y, this.lineEnd.y, t);
      if (Math.random() < dt * 30) particle("scan", this.x, this.y, { color: "#bde7ff", life: 0.18, size: 3, alpha: 0.85 });
      this.damagePlayerAlongLine(px, py);
      if (t >= 1) {
        this.state = "drift";
        this.timer = this.cooldownTime;
        this.hitPlayer = false;
        pulse(this.x, this.y, 30, "#ffffff", 0.16);
      }
    } else {
      const orbit = Math.sin(this.anim * 0.35) * 0.72;
      this.x += (dx / d * 0.15 + -dy / d * orbit) * this.speed * dt;
      this.y += (dy / d * 0.15 + dx / d * orbit) * this.speed * dt;
      if (this.timer <= 0 && d < 1000) this.prepareLine();
    }

    this.x = clamp(this.x, -MAP_HALF + this.r, MAP_HALF - this.r);
    this.y = clamp(this.y, -MAP_HALF + this.r, MAP_HALF - this.r);
  }

  prepareLine() {
    const p = state.player;
    const leadX = p.x + p.dirX * 120;
    const leadY = p.y + p.dirY * 120;
    this.angle = Math.atan2(leadY - this.y, leadX - this.x) + (Math.random() - 0.5) * 0.16;
    this.lineStart = edgePoint(leadX, leadY, this.angle + Math.PI);
    this.lineEnd = edgePoint(leadX, leadY, this.angle);
    this.x = this.lineStart.x;
    this.y = this.lineStart.y;
    this.state = "warn";
    this.timer = this.warningTime;
    this.dashT = 0;
    pulse(leadX, leadY, 50, "#ffffff", 0.18);
  }

  beginDash() {
    this.state = "dash";
    this.timer = 1.0;
    this.dashT = 0;
    this.hitPlayer = false;
  }

  damagePlayerAlongLine(prevX, prevY) {
    const p = state.player;
    if (this.hitPlayer || p.invuln > 0) return;
    const dist = segmentDistance(p.x, p.y, prevX, prevY, this.x, this.y);
    if (dist < p.r + this.r * 0.72) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.62;
      state.shake = Math.max(state.shake, 9);
      state.flash = Math.max(state.flash, 0.22);
      this.hitPlayer = true;
      burst(p.x, p.y, 16, "#ffffff", 180);
    }
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.state === "dash" || this.state === "warn") {
      amount *= this.state === "dash" ? this.dashDefenseMul : this.warnDefenseMul;
    }
    super.takeDamage(amount, x, y, options);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const color = flash ? "#ffffff" : this.color;
    if (this.state === "warn") drawWarningLine(ctx, this);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.state === "dash" ? this.angle : this.angle + Math.sin(this.anim) * 0.25);
    const stretch = this.state === "dash" ? 1.75 : 1;
    ctx.scale(stretch, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(-8, 0, this.r * 2.2, this.r * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    blade(ctx, this.r * 1.8, this.r * 0.58);
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#9d4edd";
    blade(ctx, this.r * 0.9, this.r * 0.32);
    ctx.restore();
  }
}

function drawWarningLine(ctx, e) {
  const k = Math.max(0, e.timer / this.warningTime);
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + (1 - k) * 0.32})`;
  ctx.lineWidth = 18 + Math.sin(state.time * 18) * 2;
  ctx.beginPath();
  ctx.moveTo(e.lineStart.x, e.lineStart.y);
  ctx.lineTo(e.lineEnd.x, e.lineEnd.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(66,232,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function blade(ctx, len, w) {
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(0, -w);
  ctx.lineTo(-len * 0.72, 0);
  ctx.lineTo(0, w);
  ctx.closePath();
  ctx.fill();
}

function edgePoint(cx, cy, angle) {
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const tx = vx > 0 ? (MAP_HALF - cx) / vx : (-MAP_HALF - cx) / vx;
  const ty = vy > 0 ? (MAP_HALF - cy) / vy : (-MAP_HALF - cy) / vy;
  const t = Math.min(Math.abs(tx), Math.abs(ty));
  return { x: clamp(cx + vx * t, -MAP_HALF, MAP_HALF), y: clamp(cy + vy * t, -MAP_HALF, MAP_HALF) };
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
