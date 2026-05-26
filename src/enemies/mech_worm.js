import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

const SEGMENT_COUNT = 7;
const SEGMENT_GAP = 17;
const STRIKE_RANGE = 360;

export class MechWorm extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "\u673a\u68b0\u8815\u866b";
    this.trait = "\u86c7\u5f62\u5207\u5165";
    this.behavior = "mech_worm";
    this.r = Math.max(this.r, 16);
    this.speed *= 1.08;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.34);
    this.state = "hunt";
    this.chargeTime = 0;
    this.strikeTime = 0;
    this.cooldown = 1.1 + Math.random() * 0.7;
    this.strikeAngle = 0;
    this.trailTimer = 0;
    this.path = [];
    this.segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.segments.push({ x: x - i * SEGMENT_GAP, y, angle: 0, phase: Math.random() * TAU });
    }
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.state === "strike" ? 13 : 6);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.state === "charge") {
      this.updateCharge(dt, dx, dy, d);
    } else if (this.state === "strike") {
      this.updateStrike(dt);
    } else {
      this.updateHunt(dt, dx, dy, d);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    this.recordPath();
    this.updateSegments();
    this.damagePlayer();
  }

  updateHunt(dt, dx, dy, d) {
    const side = Math.sin(this.anim * 0.7 + this.phase) * 0.62;
    this.x += (dx / d + -dy / d * side) * this.speed * dt;
    this.y += (dy / d + dx / d * side) * this.speed * dt;
    if (d < STRIKE_RANGE && this.cooldown <= 0) {
      this.state = "charge";
      this.chargeTime = 0.46;
      this.strikeAngle = Math.atan2(dy, dx);
      pulse(this.x, this.y, 48, this.color, 0.24);
    }
  }

  updateCharge(dt, dx, dy, d) {
    this.chargeTime -= dt;
    this.strikeAngle = this.strikeAngle * 0.9 + Math.atan2(dy, dx) * 0.1;
    this.x -= (dx / d) * this.speed * 0.34 * dt;
    this.y -= (dy / d) * this.speed * 0.34 * dt;
    if (this.chargeTime <= 0) {
      this.state = "strike";
      this.strikeTime = 0.62;
      burst(this.x, this.y, 10, this.color, 180);
    }
  }

  updateStrike(dt) {
    this.strikeTime -= dt;
    const speed = this.speed * 3.25;
    const weave = Math.sin(this.strikeTime * 26 + this.phase) * 0.14;
    const angle = this.strikeAngle + weave;
    this.x += Math.cos(angle) * speed * dt;
    this.y += Math.sin(angle) * speed * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.035;
      trail(this.x, this.y, this.x - Math.cos(angle) * 28, this.y - Math.sin(angle) * 28, this.color, 10);
    }
    if (this.strikeTime <= 0) {
      this.state = "hunt";
      this.cooldown = 1.65;
    }
  }

  recordPath() {
    this.path.unshift({ x: this.x, y: this.y });
    const max = SEGMENT_COUNT * SEGMENT_GAP + 24;
    if (this.path.length > max) this.path.length = max;
  }

  updateSegments() {
    for (let i = 0; i < this.segments.length; i++) {
      const target = this.path[Math.min(this.path.length - 1, (i + 1) * SEGMENT_GAP)] || { x: this.x, y: this.y };
      const seg = this.segments[i];
      const dx = target.x - seg.x;
      const dy = target.y - seg.y;
      seg.x += dx * 0.42;
      seg.y += dy * 0.42;
      seg.angle = Math.atan2(dy, dx);
    }
  }

  damagePlayer() {
    const p = state.player;
    if (p.invuln > 0) return;
    const reach = p.r + this.r + (this.state === "strike" ? 9 : 0);
    if (hitCircle(this.x, this.y, reach, p.x, p.y)) return this.hitPlayer(this.state === "strike" ? 1.35 : 1);
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (hitCircle(seg.x, seg.y, p.r + this.r * (0.68 - i * 0.025), p.x, p.y)) return this.hitPlayer(0.72);
    }
  }

  hitPlayer(mult) {
    const p = state.player;
    p.hp -= this.damage * mult;
    p.invuln = 0.48;
    state.shake = this.state === "strike" ? 10 : 6;
    state.flash = 0.24;
    burst(p.x, p.y, 8, this.color, 120);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    ctx.save();
    drawWormShadow(ctx, this);
    for (let i = this.segments.length - 1; i >= 0; i--) drawSegment(ctx, this, this.segments[i], i, flash);
    drawHead(ctx, this, flash);
    if (this.state === "charge") drawCharge(ctx, this);
    ctx.restore();
  }
}

function drawWormShadow(ctx, e) {
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  for (let i = e.segments.length - 1; i >= 0; i--) {
    const seg = e.segments[i];
    ctx.beginPath();
    ctx.ellipse(seg.x, seg.y + 10, e.r * (0.72 - i * 0.025), e.r * 0.24, seg.angle, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 10, e.r * 0.9, e.r * 0.3, 0, 0, TAU);
  ctx.fill();
}

function drawSegment(ctx, e, seg, i, flash) {
  const r = e.r * (0.78 - i * 0.035);
  const core = flash ? "#ffffff" : i % 2 ? "#2c1740" : "#341a4f";
  const accent = flash ? "#ffffff" : e.color;
  ctx.save();
  ctx.translate(seg.x, seg.y);
  ctx.rotate(seg.angle);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.roundRect(-r * 0.82, -r * 0.58, r * 1.64, r * 1.16, 5);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(-r * 0.18, -r * 0.34, r * 0.36, r * 0.68);
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.moveTo(-r * 0.64, -r * 0.28);
  ctx.lineTo(r * 0.64, -r * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawHead(ctx, e, flash) {
  const p = state.player;
  const angle = Math.atan2(p.y - e.y, p.x - e.x);
  const charge = e.state === "charge";
  const strike = e.state === "strike";
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(angle);
  const body = flash ? "#ffffff" : "#141827";
  const accent = flash ? "#ffffff" : e.color;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(e.r * 1.35, 0);
  ctx.lineTo(e.r * 0.42, -e.r * 0.82);
  ctx.lineTo(-e.r * 0.9, -e.r * 0.6);
  ctx.lineTo(-e.r * 1.08, e.r * 0.6);
  ctx.lineTo(e.r * 0.42, e.r * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.fillStyle = charge || strike ? "#ffffff" : "#ffb8f2";
  ctx.fillRect(e.r * 0.18, -e.r * 0.35, e.r * 0.44, e.r * 0.18);
  ctx.fillRect(e.r * 0.18, e.r * 0.17, e.r * 0.44, e.r * 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.7, 0);
  ctx.lineTo(e.r * 0.82, 0);
  ctx.stroke();
  if (strike) {
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.r * 1.18, -e.r * 0.62);
    ctx.lineTo(e.r * 1.72, -e.r * 1.0);
    ctx.moveTo(e.r * 1.18, e.r * 0.62);
    ctx.lineTo(e.r * 1.72, e.r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCharge(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.strikeAngle);
  ctx.strokeStyle = `rgba(255,101,216,${0.34 + Math.sin(e.anim * 10) * 0.12})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(240, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function hitCircle(x, y, r, px, py) {
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= r * r;
}
