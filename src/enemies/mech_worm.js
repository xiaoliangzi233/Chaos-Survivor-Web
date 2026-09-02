import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { angleDiff, clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const BASE_SEGMENT_COUNT = 8;
const BASE_SEGMENT_GAP = 12;
const STRIKE_RANGE = 360;
const DIFFICULTY_RANK = { ember: 0, neon: 1, overclock: 2, singularity: 3, apocalypse: 4, void_crown: 5 };

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
    this.coastTime = 0;
    this.difficultyRank = DIFFICULTY_RANK[state.difficulty?.id || state.difficultyId] ?? 1;
    this.segmentGap = BASE_SEGMENT_GAP + this.difficultyRank * 0.75;
    this.segmentCount = BASE_SEGMENT_COUNT + Math.floor(this.difficultyRank / 2);
    this.coastTurnRate = 0.95 + this.difficultyRank * 0.42;
    this.headAngle = Math.atan2(state.player.y - y, state.player.x - x);
    this.pathCapacity = 0;
    this.pathX = null;
    this.pathY = null;
    this.pathHead = 0;
    this.pathCount = 0;
    this.pathSampleSpacing = 3;
    this.segments = [];
    for (let i = 0; i < this.segmentCount; i++) {
      this.segments.push({ x: x - (i + 1) * this.segmentGap, y, angle: 0, phase: Math.random() * TAU });
    }
    if (state.waveScenario?.mechWormMode === "colossus") {
      this.name = "超长机械蠕虫";
      this.hp *= 4.8;
      this.maxHp = this.hp;
      this.damage *= 1.28;
      this.speed *= 0.78;
      this.knockbackResistance = Math.max(this.knockbackResistance, 0.7);
      this.extendSegments(4.4);
    }
    this.ensurePathCapacity();
    this.seedPath();
  }

  extendSegments(multiplier) {
    const target = Math.max(this.segmentCount, Math.round(this.segmentCount * multiplier));
    this.segmentCount = target;
    while (this.segments.length < target) {
      const tail = this.segments[this.segments.length - 1] || { x: this.x, y: this.y, angle: this.strikeAngle || 0 };
      this.segments.push({
        x: tail.x - Math.cos(tail.angle) * this.segmentGap,
        y: tail.y - Math.sin(tail.angle) * this.segmentGap,
        angle: tail.angle,
        phase: Math.random() * TAU,
      });
    }
    if (this.pathX) this.ensurePathCapacity();
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
    const desiredHeadAngle = this.state === "strike" || this.state === "coast"
      ? this.strikeAngle
      : Math.atan2(dy, dx);
    this.headAngle += angleDiff(desiredHeadAngle, this.headAngle) * Math.min(1, dt * (this.state === "strike" ? 12 : 7));

    if (this.state === "charge") {
      this.updateCharge(dt, dx, dy, d);
    } else if (this.state === "strike") {
      this.updateStrike(dt);
    } else if (this.state === "coast") {
      this.updateCoast(dt);
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
    const side = Math.sin(this.anim * 0.65 + this.phase) * 0.18;
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
    this.strikeAngle += angleDiff(Math.atan2(dy, dx), this.strikeAngle) * 0.12;
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
    const weave = Math.sin(this.strikeTime * 22 + this.phase) * 0.045;
    const angle = this.strikeAngle + weave;
    this.strikeAngle = angle;
    this.x += Math.cos(angle) * speed * dt;
    this.y += Math.sin(angle) * speed * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.035;
      trail(this.x, this.y, this.x - Math.cos(angle) * 28, this.y - Math.sin(angle) * 28, this.color, 10);
    }
    if (this.strikeTime <= 0) {
      this.state = "coast";
      this.coastTime = 0.46 + this.difficultyRank * 0.05;
      this.cooldown = 1.65;
    }
  }

  updateCoast(dt) {
    const p = state.player;
    const target = Math.atan2(p.y - this.y, p.x - this.x);
    this.strikeAngle += angleDiff(target, this.strikeAngle) * Math.min(1, this.coastTurnRate * dt);
    const speed = this.speed * 1.65;
    this.x += Math.cos(this.strikeAngle) * speed * dt;
    this.y += Math.sin(this.strikeAngle) * speed * dt;
    this.coastTime -= dt;
    if (this.coastTime <= 0) this.state = "hunt";
  }

  recordPath() {
    const lastIndex = (this.pathHead - 1 + this.pathCapacity) % this.pathCapacity;
    if (this.pathCount > 0) {
      const dx = this.x - this.pathX[lastIndex];
      const dy = this.y - this.pathY[lastIndex];
      if (dx * dx + dy * dy < this.pathSampleSpacing * this.pathSampleSpacing) return;
    }
    this.pathX[this.pathHead] = this.x;
    this.pathY[this.pathHead] = this.y;
    this.pathHead = (this.pathHead + 1) % this.pathCapacity;
    this.pathCount = Math.min(this.pathCapacity, this.pathCount + 1);
  }

  updateSegments() {
    if (!this.pathCount) return;
    let newerX = this.x;
    let newerY = this.y;
    let accumulated = 0;
    let targetDistance = this.segmentGap;
    let segmentIndex = 0;
    for (let step = 0; step < this.pathCount && segmentIndex < this.segments.length; step++) {
      const index = (this.pathHead - 1 - step + this.pathCapacity) % this.pathCapacity;
      const olderX = this.pathX[index];
      const olderY = this.pathY[index];
      const dx = olderX - newerX;
      const dy = olderY - newerY;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      while (segmentIndex < this.segments.length && accumulated + length >= targetDistance) {
        const local = (targetDistance - accumulated) / length;
        const baseX = newerX + dx * local;
        const baseY = newerY + dy * local;
        const tangent = Math.atan2(-dy, -dx);
        const amplitude = this.r * (this.state === "strike" ? 0.12 : 0.34) * (1 - segmentIndex / Math.max(1, this.segments.length) * 0.38);
        const wave = Math.sin(this.anim * 1.25 - segmentIndex * 0.82 + this.segments[segmentIndex].phase) * amplitude;
        const targetX = baseX - Math.sin(tangent) * wave;
        const targetY = baseY + Math.cos(tangent) * wave;
        const seg = this.segments[segmentIndex];
        seg.x += (targetX - seg.x) * 0.82;
        seg.y += (targetY - seg.y) * 0.82;
        seg.angle += angleDiff(tangent, seg.angle) * 0.72;
        segmentIndex++;
        targetDistance = (segmentIndex + 1) * this.segmentGap;
      }
      accumulated += length;
      newerX = olderX;
      newerY = olderY;
    }
    while (segmentIndex < this.segments.length) {
      const previous = segmentIndex ? this.segments[segmentIndex - 1] : { x: this.x, y: this.y, angle: this.headAngle };
      const seg = this.segments[segmentIndex];
      const targetX = previous.x - Math.cos(previous.angle) * this.segmentGap;
      const targetY = previous.y - Math.sin(previous.angle) * this.segmentGap;
      seg.x += (targetX - seg.x) * 0.72;
      seg.y += (targetY - seg.y) * 0.72;
      seg.angle += angleDiff(previous.angle, seg.angle) * 0.65;
      segmentIndex++;
    }
  }

  ensurePathCapacity() {
    const desired = Math.max(64, Math.ceil((this.segmentCount * this.segmentGap + 120) / this.pathSampleSpacing) + 8);
    if (desired <= this.pathCapacity) return;
    this.pathCapacity = desired;
    this.pathX = new Float32Array(desired);
    this.pathY = new Float32Array(desired);
    this.pathHead = 0;
    this.pathCount = 0;
  }

  seedPath() {
    const angle = this.headAngle;
    const samples = Math.min(this.pathCapacity, Math.ceil((this.segmentCount * this.segmentGap + 36) / this.pathSampleSpacing));
    for (let i = samples - 1; i >= 0; i--) {
      this.pathX[this.pathHead] = this.x - Math.cos(angle) * i * this.pathSampleSpacing;
      this.pathY[this.pathHead] = this.y - Math.sin(angle) * i * this.pathSampleSpacing;
      this.pathHead = (this.pathHead + 1) % this.pathCapacity;
      this.pathCount++;
    }
  }

  getVisualState() {
    return {
      clip: this.state === "charge" ? "windup" : this.state === "strike" ? "attack" : this.state === "coast" ? "recover" : "move",
      progress: ((this.anim % TAU) + TAU) % TAU / TAU,
      facing: 1,
      heading: this.headAngle,
    };
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
    applyPlayerDamage(this.damage * mult, this);
    p.invuln = 0.48;
    state.shake = this.state === "strike" ? 10 : 6;
    state.flash = 0.24;
    burst(p.x, p.y, 8, this.color, 120);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    ctx.save();
    drawWormShadow(ctx, this);
    drawWormBodyRibbon(ctx, this, flash);
    for (let i = this.segments.length - 1; i >= 0; i--) drawSegment(ctx, this, this.segments[i], i, flash);
    drawHead(ctx, this, flash);
    if (this.state === "charge") drawCharge(ctx, this);
    ctx.restore();
  }
}

function drawWormBodyRibbon(ctx, e, flash) {
  if (!e.segments.length) return;
  const points = [{ x: e.x, y: e.y }, ...e.segments];
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index++) {
      const current = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
    }
    const tail = points[points.length - 1];
    ctx.lineTo(tail.x, tail.y);
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(3, 7, 14, 0.9)";
  ctx.lineWidth = e.r * 1.34;
  trace();
  ctx.stroke();
  ctx.strokeStyle = flash ? "rgba(255,255,255,0.9)" : "rgba(68, 232, 255, 0.22)";
  ctx.lineWidth = e.r * 0.62;
  trace();
  ctx.stroke();
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,101,216,0.64)";
  ctx.lineWidth = Math.max(2, e.r * 0.16);
  trace();
  ctx.stroke();
  ctx.restore();
}

function drawWormShadow(ctx, e) {
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  for (let i = e.segments.length - 1; i >= 0; i--) {
    const seg = e.segments[i];
    const rx = Math.max(e.r * 0.28, e.r * (0.9 - i * 0.025));
    const ry = Math.max(e.r * 0.1, e.r * 0.28);
    ctx.beginPath();
    ctx.ellipse(seg.x, seg.y + 12, rx, ry, seg.angle, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 13, e.r * 1.22, e.r * 0.36, e.headAngle, 0, TAU);
  ctx.fill();
}

function drawSegment(ctx, e, seg, i, flash) {
  const taper = Math.max(0.48, 0.9 - i * 0.022);
  const r = e.r * taper;
  const pulseGlow = 0.5 + Math.sin(e.anim * 1.7 - i * 0.65) * 0.5;
  const core = flash ? "#ffffff" : i % 2 ? "#121a26" : "#182231";
  const plate = flash ? "#ffffff" : i % 2 ? "#273244" : "#202a3b";
  const accent = flash ? "#ffffff" : e.color;
  ctx.save();
  ctx.translate(seg.x, seg.y);
  ctx.rotate(seg.angle);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 1.04, r * 0.66, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.roundRect(-r * 0.96, -r * 0.54, r * 1.92, r * 1.08, Math.max(3, r * 0.18));
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#050912";
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, side * r * 0.48);
    ctx.lineTo(-r * 0.1, side * r * 0.7);
    ctx.lineTo(r * 0.78, side * r * 0.42);
    ctx.lineTo(r * 0.64, side * r * 0.12);
    ctx.lineTo(-r * 0.5, side * r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(79, 208, 226, 0.34)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = flash ? "#ffffff" : `rgba(66, 232, 255, ${0.42 + pulseGlow * 0.38})`;
  ctx.shadowColor = flash ? "#ffffff" : "#42e8ff";
  ctx.shadowBlur = 9 + pulseGlow * 8;
  ctx.beginPath();
  ctx.roundRect(-r * 0.14, -r * 0.42, r * 0.28, r * 0.84, Math.max(2, r * 0.08));
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(-r * 0.68, -r * 0.18);
  ctx.lineTo(r * 0.62, -r * 0.28);
  ctx.moveTo(-r * 0.68, r * 0.18);
  ctx.lineTo(r * 0.62, r * 0.28);
  ctx.stroke();

  if (i > e.segments.length - 4) {
    ctx.fillStyle = flash ? "#ffffff" : `rgba(255, 101, 216, ${0.3 + pulseGlow * 0.34})`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.lineTo(-r * 1.48, -r * 0.28);
    ctx.lineTo(-r * 1.42, r * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(ctx, e, flash) {
  const angle = e.headAngle;
  const charge = e.state === "charge";
  const strike = e.state === "strike";
  const heat = charge || strike ? 1 : 0.45 + Math.sin(e.anim * 2.2) * 0.18;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(angle);
  const body = flash ? "#ffffff" : "#111824";
  const plate = flash ? "#ffffff" : "#253145";
  const accent = flash ? "#ffffff" : e.color;

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(-e.r * 0.08, e.r * 0.16, e.r * 1.44, e.r * 0.76, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(e.r * 1.78, 0);
  ctx.lineTo(e.r * 1.1, -e.r * 0.82);
  ctx.lineTo(-e.r * 0.72, -e.r * 0.74);
  ctx.lineTo(-e.r * 1.34, -e.r * 0.34);
  ctx.lineTo(-e.r * 1.18, e.r * 0.34);
  ctx.lineTo(-e.r * 0.72, e.r * 0.74);
  ctx.lineTo(e.r * 1.1, e.r * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#050912";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = plate;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.86, side * e.r * 0.28);
    ctx.lineTo(e.r * 0.36, side * e.r * 0.62);
    ctx.lineTo(e.r * 1.06, side * e.r * 0.46);
    ctx.lineTo(e.r * 0.76, side * e.r * 0.14);
    ctx.lineTo(-e.r * 0.62, side * e.r * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = accent;
  ctx.shadowBlur = charge ? 18 : 9;
  ctx.beginPath();
  ctx.moveTo(-e.r * 1.0, 0);
  ctx.lineTo(e.r * 1.42, 0);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = flash ? "#ffffff" : "#080c13";
  ctx.beginPath();
  ctx.moveTo(e.r * 1.78, 0);
  ctx.lineTo(e.r * 1.12, -e.r * 0.2);
  ctx.lineTo(e.r * 0.5, 0);
  ctx.lineTo(e.r * 1.12, e.r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = flash ? "#ffffff" : `rgba(66, 232, 255, ${0.52 + heat * 0.32})`;
  ctx.shadowColor = "#42e8ff";
  ctx.shadowBlur = 12 + heat * 10;
  ctx.beginPath();
  ctx.moveTo(e.r * 0.08, -e.r * 0.22);
  ctx.lineTo(e.r * 0.88, -e.r * 0.14);
  ctx.lineTo(e.r * 0.66, 0);
  ctx.lineTo(e.r * 0.88, e.r * 0.14);
  ctx.lineTo(e.r * 0.08, e.r * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = charge || strike ? "#ffffff" : "#ffb8f2";
  ctx.shadowColor = accent;
  ctx.shadowBlur = charge ? 14 : 5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(e.r * 0.26, side * e.r * 0.44);
    ctx.lineTo(e.r * 0.94, side * e.r * 0.42);
    ctx.lineTo(e.r * 0.52, side * e.r * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.54)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.84, -e.r * 0.38);
  ctx.lineTo(-e.r * 0.18, -e.r * 0.48);
  ctx.moveTo(-e.r * 0.84, e.r * 0.38);
  ctx.lineTo(-e.r * 0.18, e.r * 0.48);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  for (const [x, y] of [[1.03, -0.05], [1.31, 0.08]]) {
    ctx.beginPath();
    ctx.moveTo(e.r * x, e.r * y);
    ctx.lineTo(e.r * (x - 0.22), e.r * 0.46);
    ctx.lineTo(e.r * (x - 0.29), e.r * 0.02);
    ctx.closePath();
    ctx.fill();
  }
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
  ctx.strokeStyle = `rgba(66,232,255,${0.28 + Math.sin(e.anim * 10) * 0.1})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(240, 0);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,101,216,${0.28 + Math.sin(e.anim * 12) * 0.1})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.r * 1.1, -e.r * 0.28);
  ctx.lineTo(226, -18);
  ctx.moveTo(e.r * 1.1, e.r * 0.28);
  ctx.lineTo(226, 18);
  ctx.stroke();
  ctx.restore();
}

function hitCircle(x, y, r, px, py) {
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= r * r;
}
