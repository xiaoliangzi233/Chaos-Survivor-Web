import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const SEGMENT_COUNT = 24;
const SEGMENT_GAP = 28;
const NODE_STEP = 4;
const RAIL_LENGTH = 1200;

export class StormRailDevourer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "雷铸吞星者";
    this.trait = "雷轨巨蛇";
    this.behavior = "boss_storm_rail";
    this.r = config.radius || 34;
    this.speed = config.speed || 78;
    this.damage = config.damage || 42;
    this.knockbackResistance = 0.94;
    this.mode = "emerge";
    this.modeTimer = 1.5;
    this.attackIndex = 0;
    this.phase2 = false;
    this.overdrivePulse = 0;
    this.railWindup = 0;
    this.railTime = 0;
    this.railAngle = 0;
    this.fireTimer = 0;
    this.hazardTimer = 0;
    this.netTimer = 0;
    this.path = [];
    this.segments = [];
    this.initFromEdge();
  }

  initFromEdge() {
    const p = state.player;
    const half = WORLD_SIZE / 2;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      this.x = -half + this.r;
      this.y = clamp(p.y + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
    } else if (side === 1) {
      this.x = half - this.r;
      this.y = clamp(p.y + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
    } else if (side === 2) {
      this.x = clamp(p.x + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
      this.y = -half + this.r;
    } else {
      this.x = clamp(p.x + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
      this.y = half - this.r;
    }
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.segments.push({
        x: this.x - Math.cos(a) * i * SEGMENT_GAP,
        y: this.y - Math.sin(a) * i * SEGMENT_GAP,
        angle: a,
        heat: 0,
        node: i > 0 && i % NODE_STEP === 0,
        phase: Math.random() * TAU,
      });
    }
    this.recordPath(true);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.phase2 ? 5.8 : 4.4);
    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phase2 = this.hp <= this.maxHp * 0.5;
    this.overdrivePulse = Math.max(0, this.overdrivePulse - dt * 2);
    this.modeTimer -= dt;
    this.fireTimer -= dt;
    this.hazardTimer -= dt;
    this.netTimer -= dt;
    this.flip = dx < 0 ? -1 : 1;

    if (this.phase2 && this.overdrivePulse <= 0) {
      this.overdrivePulse = 1;
      pulse(this.x, this.y, 120, "#ff4dff", 0.22);
    }

    if (this.mode === "emerge") this.updateEmerge(dt, dx, dy, d);
    else if (this.mode === "cruise") this.updateCruise(dt, dx, dy, d);
    else if (this.mode === "rail_charge") this.updateRailCharge(dt, dx, dy, d);
    else if (this.mode === "broadside_fire") this.updateBroadside(dt, dx, dy, d);
    else if (this.mode === "coil_lock") this.updateCoil(dt, dx, dy, d);
    else if (this.mode === "node_storm") this.updateNodeStorm(dt, dx, dy, d);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    this.recordPath();
    this.updateSegments();
    this.damagePlayer();
    if (this.modeTimer <= 0) this.nextMode();
  }

  updateEmerge(dt, dx, dy, d) {
    this.x += (dx / d) * this.speed * 2.1 * dt;
    this.y += (dy / d) * this.speed * 2.1 * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.12;
      trail(this.x, this.y, this.x - (dx / d) * 60, this.y - (dy / d) * 60, this.color, 16);
    }
  }

  updateCruise(dt, dx, dy, d) {
    const side = Math.sin(this.anim * 0.55 + this.phase) * 0.58;
    const mul = this.phase2 ? 1.12 : 0.92;
    this.x += (dx / d + -dy / d * side) * this.speed * mul * dt;
    this.y += (dy / d + dx / d * side) * this.speed * mul * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phase2 ? 0.7 : 0.95;
      this.fireNodeOrb(this.segments[4] || this, Math.atan2(dy, dx), 190, 0.28);
    }
  }

  updateRailCharge(dt, dx, dy, d) {
    if (this.railWindup > 0) {
      this.railWindup -= dt;
      this.railAngle = this.railAngle * 0.9 + Math.atan2(dy, dx) * 0.1;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.08;
        particle("scan", this.x, this.y, { color: this.phase2 ? "#ff4dff" : this.color, life: 0.2, length: 24, angle: this.railAngle, alpha: 0.8 });
      }
      return;
    }
    this.railTime -= dt;
    const speed = this.speed * (this.phase2 ? 4.35 : 3.65);
    this.x += Math.cos(this.railAngle) * speed * dt;
    this.y += Math.sin(this.railAngle) * speed * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.035;
      trail(this.x, this.y, this.x - Math.cos(this.railAngle) * 70, this.y - Math.sin(this.railAngle) * 70, this.phase2 ? "#ff4dff" : this.color, 18);
    }
    if (this.railTime <= 0) this.nextMode();
  }

  updateBroadside(dt, dx, dy, d) {
    const tangent = Math.atan2(dy, dx) + Math.PI / 2 * (this.attackIndex % 2 ? -1 : 1);
    const pull = d > 430 ? 0.38 : -0.18;
    this.x += (Math.cos(tangent) + (dx / d) * pull) * this.speed * 0.88 * dt;
    this.y += (Math.sin(tangent) + (dy / d) * pull) * this.speed * 0.88 * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phase2 ? 0.22 : 0.32;
      this.fireBroadside();
    }
  }

  updateCoil(dt, dx, dy, d) {
    const dir = this.attackIndex % 2 ? -1 : 1;
    const tangent = Math.atan2(dy, dx) + Math.PI / 2 * dir;
    const radial = d > 260 ? 0.25 : -0.46;
    this.x += (Math.cos(tangent) + (dx / d) * radial) * this.speed * (this.phase2 ? 1.05 : 0.86) * dt;
    this.y += (Math.sin(tangent) + (dy / d) * radial) * this.speed * (this.phase2 ? 1.05 : 0.86) * dt;
    if (this.netTimer <= 0) this.netTimer = this.phase2 ? 0.46 : 0.62;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.75;
      this.fireElectricNet();
    }
  }

  updateNodeStorm(dt, dx, dy, d) {
    const side = Math.sin(this.anim * 0.8) * 0.72;
    this.x += (dx / d * 0.18 + -dy / d * side) * this.speed * 0.62 * dt;
    this.y += (dy / d * 0.18 + dx / d * side) * this.speed * 0.62 * dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = this.phase2 ? 0.38 : 0.55;
      this.dropStormMark();
    }
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phase2 ? 0.55 : 0.78;
      this.fireNodeVolley();
    }
  }

  nextMode() {
    this.attackIndex++;
    const sequence = ["cruise", "rail_charge", "broadside_fire", "coil_lock", "node_storm"];
    const next = this.mode === "emerge" ? "cruise" : sequence[this.attackIndex % sequence.length];
    this.enterMode(next);
  }

  enterMode(mode) {
    this.mode = mode;
    this.fireTimer = 0;
    this.hazardTimer = 0;
    if (mode === "cruise") this.modeTimer = this.phase2 ? 2.0 : 2.55;
    if (mode === "broadside_fire") this.modeTimer = this.phase2 ? 2.75 : 3.25;
    if (mode === "coil_lock") this.modeTimer = this.phase2 ? 2.65 : 3.1;
    if (mode === "node_storm") this.modeTimer = this.phase2 ? 2.8 : 3.3;
    if (mode === "rail_charge") {
      const p = state.player;
      this.modeTimer = this.phase2 ? 2.0 : 1.7;
      this.railWindup = this.phase2 ? 0.58 : 0.78;
      this.railTime = this.phase2 ? 1.2 : 0.92;
      this.railAngle = Math.atan2(p.y - this.y, p.x - this.x);
      pulse(this.x, this.y, 86, this.phase2 ? "#ff4dff" : this.color, 0.28);
    }
  }

  recordPath(force = false) {
    this.path.unshift({ x: this.x, y: this.y });
    const max = SEGMENT_COUNT * SEGMENT_GAP + 80;
    if (force) while (this.path.length < max) this.path.push({ x: this.x, y: this.y });
    if (this.path.length > max) this.path.length = max;
  }

  updateSegments() {
    for (let i = 0; i < this.segments.length; i++) {
      const target = this.path[Math.min(this.path.length - 1, (i + 1) * SEGMENT_GAP)] || { x: this.x, y: this.y };
      const seg = this.segments[i];
      const dx = target.x - seg.x;
      const dy = target.y - seg.y;
      seg.x += dx * 0.48;
      seg.y += dy * 0.48;
      seg.angle = Math.atan2(dy, dx);
      seg.heat = Math.max(0, seg.heat - 0.045);
    }
  }

  hitTest(x, y, r = 0) {
    if (distSq(x, y, this.x, this.y) <= (this.r + r) ** 2) return true;
    for (const seg of this.segments) {
      const sr = seg.node ? this.r * 0.72 : this.r * 0.56;
      if (distSq(x, y, seg.x, seg.y) <= (sr + r) ** 2) return true;
    }
    return false;
  }

  damagePlayer() {
    const p = state.player;
    if (p.invuln > 0) return;
    if (distSq(this.x, this.y, p.x, p.y) <= (this.r + p.r) ** 2) return this.hitPlayer(this.mode === "rail_charge" ? 1.45 : 1.05);
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const r = (seg.node ? this.r * 0.74 : this.r * 0.55) + p.r;
      if (distSq(seg.x, seg.y, p.x, p.y) <= r * r) return this.hitPlayer(this.mode === "rail_charge" ? 1.05 : 0.62);
    }
  }

  hitPlayer(mult) {
    const p = state.player;
    applyPlayerDamage(this.damage * mult, this);
    p.invuln = 0.5;
    state.shake = Math.max(state.shake, this.mode === "rail_charge" ? 14 : 8);
    state.flash = Math.max(state.flash, 0.22);
    burst(p.x, p.y, 12, this.phase2 ? "#ff4dff" : this.color, 160);
    playSfx("hurt");
  }

  takeDamage(amount, x, y, options = {}) {
    const headHit = distSq(x, y, this.x, this.y) < (this.r * 1.4) ** 2;
    super.takeDamage(amount * (headHit ? 1.15 : 1), x, y, options);
    const nearest = this.nearestSegment(x, y);
    if (nearest && !options.statusEffect) nearest.heat = 1;
  }

  nearestSegment(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const seg of this.segments) {
      const d = distSq(x, y, seg.x, seg.y);
      if (d < bestD) {
        bestD = d;
        best = seg;
      }
    }
    return best;
  }

  fireNodeOrb(source, angle, speed, damageMul) {
    if (!source) return;
    world.enemyProjectiles.push({
      x: source.x,
      y: source.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 6,
      color: this.phase2 ? "#ff4dff" : this.color,
      damage: this.damage * damageMul,
      life: 4,
      shape: "stormOrb",
      spin: Math.random() * TAU,
      bossProjectile: true,
    });
  }

  fireBroadside() {
    const p = state.player;
    const nodes = this.segments.filter((seg) => seg.node).slice(0, this.phase2 ? 6 : 4);
    for (const seg of nodes) {
      seg.heat = 1;
      const base = Math.atan2(p.y - seg.y, p.x - seg.x);
      const offset = (Math.random() - 0.5) * 0.28;
      this.fireNodeOrb(seg, base + offset, this.phase2 ? 230 : 200, 0.34);
    }
  }

  fireNodeVolley() {
    const nodes = this.segments.filter((seg) => seg.node);
    for (let i = 0; i < nodes.length; i += 2) {
      const seg = nodes[i];
      seg.heat = 1;
      const a = (i / nodes.length) * TAU + this.phase;
      this.fireNodeOrb(seg, a, this.phase2 ? 210 : 180, 0.28);
    }
  }

  fireElectricNet() {
    const p = state.player;
    for (let i = 0; i < this.segments.length - 1; i += 3) {
      const a = this.segments[i];
      const b = this.segments[i + 1];
      if (!a || !b) continue;
      if (pointLineDistance(p.x, p.y, a.x, a.y, b.x, b.y) < p.r + 10 && p.invuln <= 0) {
        applyPlayerDamage(this.damage * 0.45, this);
        p.invuln = 0.32;
        state.flash = Math.max(state.flash, 0.16);
        state.shake = Math.max(state.shake, 6);
        break;
      }
    }
  }

  dropStormMark() {
    const p = state.player;
    const x = p.x + (Math.random() - 0.5) * 260;
    const y = p.y + (Math.random() - 0.5) * 220;
    world.hazards.push({
      x,
      y,
      r: this.phase2 ? 58 : 48,
      color: this.phase2 ? "#ff4dff" : this.color,
      damage: this.damage * 0.42,
      life: 0.95,
      maxLife: 0.95,
    });
    pulse(x, y, this.phase2 ? 58 : 48, this.phase2 ? "#ff4dff" : this.color, 0.2);
  }

  kill() {
    if (this.dead) return;
    for (const seg of this.segments) burst(seg.x, seg.y, seg.node ? 14 : 8, this.phase2 ? "#ff4dff" : this.color, 210);
    pulse(this.x, this.y, 220, "#ffffff", 0.42);
    super.kill();
  }

  draw(ctx) {
    ctx.save();
    this.drawRailTelegraph(ctx);
    this.drawShadow(ctx);
    this.drawBodyLinks(ctx);
    for (let i = this.segments.length - 1; i >= 0; i--) this.drawSegment(ctx, this.segments[i], i);
    this.drawHead(ctx);
    ctx.restore();
  }

  drawRailTelegraph(ctx) {
    if (this.mode !== "rail_charge" || this.railWindup <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.railAngle);
    const alpha = 0.18 + Math.sin(this.anim * 12) * 0.08;
    const color = this.phase2 ? "#ff4dff" : this.color;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = colorWithAlpha(color, this.phase2 ? alpha * 0.42 : alpha * 0.34);
    ctx.fillRect(0, -46, RAIL_LENGTH, 92);
    ctx.fillStyle = colorWithAlpha(color, this.phase2 ? alpha + 0.08 : alpha);
    ctx.fillRect(0, -34, RAIL_LENGTH, 68);
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.22 + alpha);
    ctx.lineWidth = 2;
    for (let i = 0; i < 11; i++) {
      const x = 90 + i * 96 + Math.sin(this.anim * 8 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(x, -44);
      ctx.lineTo(x + 26, 0);
      ctx.lineTo(x, 44);
      ctx.stroke();
    }
    ctx.strokeStyle = this.phase2 ? "rgba(255,255,255,0.65)" : "rgba(66,232,255,0.65)";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 14]);
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(RAIL_LENGTH, -34);
    ctx.moveTo(0, 34);
    ctx.lineTo(RAIL_LENGTH, 34);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.72);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(RAIL_LENGTH, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawShadow(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    for (const seg of this.segments) {
      ctx.beginPath();
      ctx.ellipse(seg.x, seg.y + 18, this.r * 0.7, this.r * 0.22, seg.angle, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 20, this.r * 1.35, this.r * 0.35, 0, 0, TAU);
    ctx.fill();
  }

  drawBodyLinks(ctx) {
    const color = this.phase2 ? "#ff4dff" : this.color;
    if (this.mode === "coil_lock") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = colorWithAlpha(color, 0.18);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      let glowPrev = { x: this.x, y: this.y };
      for (const seg of this.segments) {
        ctx.moveTo(glowPrev.x, glowPrev.y);
        ctx.lineTo(seg.x, seg.y);
        glowPrev = seg;
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = colorWithAlpha(color, this.mode === "coil_lock" ? 0.72 : 0.3);
    ctx.lineWidth = this.mode === "coil_lock" ? 3.4 : 2;
    ctx.beginPath();
    let prev = { x: this.x, y: this.y };
    for (const seg of this.segments) {
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(seg.x, seg.y);
      prev = seg;
    }
    ctx.stroke();
  }

  drawSegment(ctx, seg, i) {
    const node = seg.node;
    const color = this.phase2 ? "#ff4dff" : this.color;
    const r = this.r * (node ? 0.78 : 0.58);
    ctx.save();
    ctx.translate(seg.x, seg.y);
    ctx.rotate(seg.angle);
    ctx.fillStyle = this.flash > 0 || seg.heat > 0.55 ? "#ffffff" : node ? "#151b35" : "#101827";
    ctx.beginPath();
    ctx.moveTo(r * 1.1, 0);
    ctx.lineTo(r * 0.52, -r * 0.82);
    ctx.lineTo(-r * 0.78, -r * 0.66);
    ctx.lineTo(-r * 1.08, 0);
    ctx.lineTo(-r * 0.78, r * 0.66);
    ctx.lineTo(r * 0.52, r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, node ? 0.88 : 0.58);
    ctx.lineWidth = node ? 2.5 : 1.6;
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.72 + seg.heat * 0.24);
    ctx.fillRect(-r * 0.18, -r * 0.48, r * 0.36, r * 0.96);
    if (node) {
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.62 + Math.sin(this.anim * 3 + i) * 0.08), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHead(ctx) {
    const p = state.player;
    const angle = Math.atan2(p.y - this.y, p.x - this.x);
    const color = this.phase2 ? "#ff4dff" : this.color;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.mode === "rail_charge" ? this.railAngle : angle);
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#111827";
    ctx.beginPath();
    ctx.moveTo(this.r * 1.65, 0);
    ctx.lineTo(this.r * 0.55, -this.r * 1.04);
    ctx.lineTo(-this.r * 1.05, -this.r * 0.72);
    ctx.lineTo(-this.r * 1.28, this.r * 0.72);
    ctx.lineTo(this.r * 0.55, this.r * 1.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.r * 0.48, 0, this.r * 0.22 + Math.sin(this.anim * 8) * 1.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.r * 0.8, -this.r * 0.72);
    ctx.lineTo(this.r * 1.55, -this.r * 1.16);
    ctx.moveTo(this.r * 0.8, this.r * 0.72);
    ctx.lineTo(this.r * 1.55, this.r * 1.16);
    ctx.stroke();
    ctx.restore();
  }
}

function pointLineDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return Math.hypot(px - x, py - y);
}

function colorWithAlpha(hex, alpha) {
  if (!hex || hex[0] !== "#") return `rgba(66,232,255,${alpha})`;
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
