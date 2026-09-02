import { TAU, WORLD_SIZE } from "../constants.js";
import { burst, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { dropCoin } from "../systems/rewards.js";

export class Thief extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "thief";
    this.hp = 999999;
    this.maxHp = 999999;
    this.speed = config.speed || 560;
    this.wanderAngle = Math.random() * TAU;
    this.moveState = "wander";
    this.moveTimer = 0.45 + Math.random() * 0.75;
    this.turnTimer = 0.08;
    this.afterimageTimer = 0;
    this.fleeDistance = 430;
    this.coinDrop = config.coinDrop || 24;
    this.hitCoinDrop = config.hitCoinDrop || 2;
    this.damage = 0;
    this.controlImmune = true;
    this.knockbackResistance = 1;
    this.bagSwing = Math.random() * TAU;
  }

  update(dt) {
    const running = true;
    this.anim += dt * 14;
    this.bagSwing += dt * 9;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.freezeTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.moveTimer -= dt;
    this.turnTimer -= dt;

    if (this.turnTimer <= 0 || this.moveTimer <= 0 || this.nearArenaEdge()) {
      this.pickWanderAngle();
      this.turnTimer = 0.14 + Math.random() * 0.2;
      this.moveTimer = 0.35 + Math.random() * 0.75;
    }

    const px = this.x;
    const py = this.y;
    const weave = Math.sin(this.anim * 0.9) * 0.28;
    this.x += Math.cos(this.wanderAngle + weave) * this.speed * dt;
    this.y += Math.sin(this.wanderAngle + weave) * this.speed * dt;
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    this.flip = Math.cos(this.wanderAngle) < 0 ? -1 : 1;
    this.afterimageTimer -= dt;
    if (this.afterimageTimer <= 0 && Math.hypot(this.x - px, this.y - py) > 2) {
      this.afterimageTimer = 0.035;
      trail(this.x, this.y, px, py, "#ffd166", 8);
    }
  }

  startTaunt() {
    this.pickWanderAngle();
  }

  startFlee() {
    this.moveState = "wander";
    this.moveTimer = 0.35 + Math.random() * 0.45;
    this.turnTimer = 0;
    this.pickWanderAngle();
    burst(this.x, this.y, 7, "#ffd166", 110);
  }

  nearArenaEdge() {
    const margin = WORLD_SIZE * 0.42;
    return Math.abs(this.x) > margin || Math.abs(this.y) > margin;
  }

  pickWanderAngle() {
    const centerBiasX = Math.abs(this.x) > WORLD_SIZE * 0.38 ? -Math.sign(this.x) * 0.85 : (Math.random() - 0.5) * 0.35;
    const centerBiasY = Math.abs(this.y) > WORLD_SIZE * 0.38 ? -Math.sign(this.y) * 0.85 : (Math.random() - 0.5) * 0.35;
    const randomAngle = Math.random() * TAU;
    const randomX = Math.cos(randomAngle);
    const randomY = Math.sin(randomAngle);
    this.wanderAngle = Math.atan2(randomY + centerBiasY, randomX + centerBiasX);
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.dead) return;
    this.freezeTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;
    if (!options.statusEffect) {
      dropCoin(x ?? this.x, y ?? this.y, this.hitCoinDrop);
      this.startFlee();
    }
    super.takeDamage(amount, x, y, options);
  }

  kill() {
    const x = this.x;
    const y = this.y;
    super.kill();
    dropCoin(x, y, this.coinDrop);
    burst(x, y, 18, "#ffd166", 180);
  }

  draw(ctx) {
    const z = this.r / 13;
    const flash = this.flash > 0;
    const run = true;
    const stride = Math.sin(this.anim) * (run ? 1 : 0.25);
    const bob = Math.abs(Math.cos(this.anim)) * (run ? -3 : -0.6) * z;
    const bag = Math.sin(this.bagSwing) * (run ? 5 : 1.4) * z;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.scale(this.flip || 1, 1);
    ctx.translate(0, bob);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 5 - bob, this.r * 1.25, this.r * 0.26, 0, 0, TAU);
    ctx.fill();

    drawThiefLeg(ctx, -5 * z, 3 * z, stride, z, flash);
    drawThiefLeg(ctx, 6 * z, 3 * z, -stride, z, flash);
    drawLootBag(ctx, -13 * z + bag * 0.35, -1 * z - Math.abs(stride) * 2 * z, z, flash);
    drawThiefBody(ctx, z, flash, run, stride);
    drawThiefArm(ctx, 10 * z, -9 * z, 1, -stride, z, flash);
    drawThiefArm(ctx, -9 * z, -8 * z, -1, stride, z, flash);
    drawThiefHead(ctx, z, flash, run, stride);
    if (run) drawSpeedStreaks(ctx, z);
    ctx.restore();
  }
}

function drawThiefLeg(ctx, x, y, phase, z, flash) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(phase * 0.35);
  ctx.fillStyle = flash ? "#ffffff" : "#121826";
  ctx.fillRect(-3 * z, 0, 6 * z, 15 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#060912";
  ctx.fillRect(-5 * z, 13 * z, 11 * z, 4 * z);
  ctx.restore();
}

function drawLootBag(ctx, x, y, z, flash) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.16);
  ctx.fillStyle = flash ? "#ffffff" : "#7a4d21";
  ctx.beginPath();
  ctx.ellipse(0, 4 * z, 9 * z, 12 * z, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#b7791f";
  ctx.fillRect(-6 * z, -8 * z, 12 * z, 5 * z);
  ctx.strokeStyle = flash ? "#ffffff" : "#ffd166";
  ctx.lineWidth = 1.4 * z;
  ctx.beginPath();
  ctx.moveTo(-3 * z, -6 * z);
  ctx.lineTo(4 * z, 9 * z);
  ctx.moveTo(4 * z, -6 * z);
  ctx.lineTo(-3 * z, 9 * z);
  ctx.stroke();
  ctx.fillStyle = flash ? "#ffffff" : "#fff3b0";
  ctx.fillRect(1 * z, -1 * z, 3 * z, 3 * z);
  ctx.restore();
}

function drawThiefBody(ctx, z, flash, run, stride) {
  ctx.save();
  ctx.rotate(Math.sin(stride) * 0.06);
  ctx.fillStyle = flash ? "#ffffff" : "#1f2937";
  ctx.beginPath();
  ctx.moveTo(-10 * z, -16 * z);
  ctx.lineTo(9 * z, -17 * z);
  ctx.lineTo(13 * z, 7 * z);
  ctx.lineTo(4 * z, 14 * z);
  ctx.lineTo(-8 * z, 12 * z);
  ctx.lineTo(-14 * z, 5 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#0b1020";
  ctx.fillRect(-6 * z, -12 * z, 13 * z, 19 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#ffd166";
  ctx.fillRect(-7 * z, -15 * z, 17 * z, 4 * z);
  ctx.fillRect(3 * z, -8 * z, 4 * z, 11 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#42e8ff";
  ctx.fillRect(-5 * z, -6 * z, 4 * z, 4 * z);
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.65)";
  ctx.lineWidth = 1.4 * z;
  ctx.stroke();
  if (run) {
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.3)";
    ctx.fillRect(-18 * z, -11 * z, 10 * z, 4 * z);
  }
  ctx.restore();
}

function drawThiefArm(ctx, x, y, side, phase, z, flash) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(side * (0.22 + phase * 0.28));
  ctx.fillStyle = flash ? "#ffffff" : "#273449";
  rectDir(ctx, 0, -2 * z, side * 11 * z, 5 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#f6c177";
  rectDir(ctx, side * 9 * z, -2 * z, side * 5 * z, 5 * z);
  ctx.restore();
}

function drawThiefHead(ctx, z, flash, run, stride) {
  ctx.save();
  ctx.translate(0, -1 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#f6c177";
  ctx.beginPath();
  ctx.moveTo(-8 * z, -29 * z);
  ctx.lineTo(8 * z, -30 * z);
  ctx.lineTo(12 * z, -21 * z);
  ctx.lineTo(8 * z, -13 * z);
  ctx.lineTo(-7 * z, -13 * z);
  ctx.lineTo(-12 * z, -21 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#111827";
  ctx.fillRect(-10 * z, -30 * z, 21 * z, 7 * z);
  ctx.fillRect(-12 * z, -24 * z, 24 * z, 5 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#ffd166";
  ctx.fillRect(-5 * z, -23 * z, 4 * z, 2 * z);
  ctx.fillRect(4 * z, -23 * z, 4 * z, 2 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#0b1020";
  ctx.fillRect(-2 * z, -18 * z, 8 * z, 2 * z);
  ctx.strokeStyle = flash ? "#ffffff" : "#42e8ff";
  ctx.lineWidth = 1.2 * z;
  ctx.beginPath();
  ctx.moveTo(-9 * z, -31 * z);
  ctx.lineTo(8 * z, -34 * z + (run ? stride * 1.4 * z : 0));
  ctx.stroke();
  ctx.restore();
}

function drawSpeedStreaks(ctx, z) {
  ctx.strokeStyle = "rgba(255,209,102,0.42)";
  ctx.lineWidth = 1.4 * z;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo((-28 - i * 7) * z, (-8 + i * 7) * z);
    ctx.lineTo((-14 - i * 4) * z, (-6 + i * 5) * z);
    ctx.stroke();
  }
}

function rectDir(ctx, x, y, w, h) {
  ctx.fillRect(Math.min(x, x + w), y, Math.abs(w), h);
}
