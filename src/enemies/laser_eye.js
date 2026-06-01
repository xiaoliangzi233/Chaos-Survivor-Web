import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";
import { playSfx } from "../audio.js";

export class LaserEye extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "laser_eye";
    this.state = "move";
    this.aimTime = 0;
    this.fireTime = 0;
    this.angle = 0;
    this.cooldown = 1.4 + Math.random();
    this.nextAttack = "beam";
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.4;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown -= dt;
    this.flip = dx < 0 ? -1 : 1;

    if (this.state === "aim") {
      this.aimTime -= dt;
      const target = Math.atan2(dy, dx);
      this.angle = turnToward(this.angle, target, dt * 2.2);
      if (this.aimTime <= 0) {
        this.state = "fire";
        this.fireTime = 0.46;
        pulse(this.x, this.y, 46, this.color, 0.25);
      }
    } else if (this.state === "fire") {
      this.fireTime -= dt;
      const target = Math.atan2(dy, dx);
      this.angle = turnToward(this.angle, target, dt * 0.7);
      this.damageLaser(dt);
      if (this.fireTime <= 0) {
        this.state = "move";
        this.cooldown = 2.4;
      }
    } else {
      const dir = d < 480 ? -0.75 : 0.22;
      const strafe = Math.sin(this.anim * 0.72) * 0.45;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < 820) {
        if (this.nextAttack === "shards") {
          this.fireLaserShardVolley(Math.atan2(dy, dx));
          this.nextAttack = "beam";
          this.cooldown = 2.1;
          return;
        }
        this.state = "aim";
        this.aimTime = 0.75;
        this.angle = Math.atan2(dy, dx);
        this.nextAttack = "shards";
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  damageLaser(dt) {
    const p = state.player;
    const dist = pointLineDistance(p.x, p.y, this.x, this.y, this.angle);
    const beamWidth = this.r * 0.5 + 10;
    if (dist < p.r + beamWidth) {
      const result = applyPlayerDamage(this.damage * 1.35 * dt, this);
      state.flash = Math.max(state.flash, 0.12);
      state.shake = Math.max(state.shake, 3);
      if (result.damaged) {
        p.invuln = Math.max(p.invuln, 0.12);
        playSfx("hurt");
        if (Math.random() < dt * 24) burst(p.x, p.y, 3, this.color, 100);
      }
    }
  }

  fireLaserShardVolley(angle) {
    this.angle = angle;
    for (let i = 0; i < 3; i++) {
      const a = angle + (i - 1) * 0.09;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 12),
        y: this.y + Math.sin(a) * (this.r + 12),
        vx: Math.cos(a) * 420,
        vy: Math.sin(a) * 420,
        r: 5,
        color: this.color,
        damage: this.damage * 0.56,
        life: 2.2,
        shape: "laserShard",
        long: true,
        spin: Math.random() * TAU,
      });
    }
    pulse(this.x, this.y, 38, this.color, 0.18);
    playSfx("shoot");
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const aiming = this.state === "aim" || this.state === "fire";
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 1.4) * 3);
    if (aiming) drawLaser(ctx, this);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8, this.r, this.r * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(255,77,109,${aiming ? 0.42 : 0.2})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(this.anim * (i ? -0.18 : 0.22));
      ctx.beginPath();
      ctx.ellipse(0, 0, (22 + i * 6) * z, (15 + i * 4) * z, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(Math.sin(this.anim * 0.8) * 0.1);
    for (const side of [-1, 1]) {
      ctx.fillStyle = flash ? "#ffffff" : "rgba(66,232,255,0.32)";
      ctx.beginPath();
      ctx.moveTo(side * 12 * z, -5 * z);
      ctx.lineTo(side * 28 * z, -13 * z);
      ctx.lineTo(side * 21 * z, 3 * z);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = flash ? "#ffffff" : "#d7f8ff";
    ctx.beginPath();
    ctx.arc(0, 0, 16 * z, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    const ex = Math.cos(this.angle) * 5 * z;
    const ey = Math.sin(this.angle) * 5 * z;
    ctx.fillStyle = "#101827";
    ctx.beginPath();
    ctx.arc(ex, ey, 8 * z, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.state === "fire" ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.arc(ex, ey, 4 * z + (this.state === "aim" ? Math.sin(this.anim * 8) * 1.2 : 0), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.state === "fire" ? "#ffffff" : this.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(ex, ey, (11 + Math.sin(this.anim * 5) * 1.5) * z, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + this.anim * 0.35;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 20 * z, Math.sin(a) * 20 * z);
      ctx.lineTo(Math.cos(a) * 27 * z, Math.sin(a) * 27 * z);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawLaser(ctx, e) {
  ctx.save();
  ctx.rotate(e.angle);
  const alpha = e.state === "fire" ? 0.82 : 0.24 + Math.sin(e.anim * 9) * 0.08;
  ctx.strokeStyle = `rgba(255,77,109,${alpha})`;
  ctx.lineWidth = e.state === "fire" ? 9 : 2;
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(920, 0);
  ctx.stroke();
  if (e.state === "fire") {
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.r, 0);
    ctx.lineTo(920, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function turnToward(current, target, amount) {
  let diff = target - current;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return current + diff * Math.min(1, amount);
}

function pointLineDistance(px, py, x, y, angle) {
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const dx = px - x;
  const dy = py - y;
  const forward = dx * vx + dy * vy;
  if (forward < 0 || forward > 920) return Infinity;
  return Math.abs(dx * -vy + dy * vx);
}
