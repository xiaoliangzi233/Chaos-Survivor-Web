import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";

const MODES = ["crown_bounce", "gel_ring", "slime_rain", "royal_split"];

export class SlimeKing extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "史莱姆王";
    this.mode = "intro";
    this.modeTimer = 1.0;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.orbit = Math.random() * TAU;
    this.jumpVx = 0;
    this.jumpVy = 0;
    this.jumpTimer = 0;
    this.phase2 = false;
    this.crownSpin = Math.random() * TAU;
    this.knockbackResistance = 0.94;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const wasPhase2 = this.phase2;
    this.phase2 = this.hp < this.maxHp * 0.52;
    this.anim += dt * (this.phase2 ? 4.6 : 3.4);
    this.orbit += dt * (this.phase2 ? 1.6 : 1.05);
    this.crownSpin += dt * (this.phase2 ? 1.7 : 1.1);
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    if (!wasPhase2 && this.phase2) this.phaseShift();

    this.updateMode(dt, dx, dy, d);
    this.x = clamp(this.x, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(this.y, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.65;
      state.shake = 12;
      state.flash = 0.24;
      burst(p.x, p.y, 18, this.color, 130);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    if (this.mode === "intro" || this.mode === "recover") {
      this.drift(dx, dy, d, this.mode === "intro" ? 0.1 : 0.2, dt);
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "crown_bounce") return this.updateCrownBounce(dt, dx, dy, d);
    if (this.mode === "gel_ring") return this.updateGelRing(dt);
    if (this.mode === "slime_rain") return this.updateSlimeRain(dt, dx, dy, d);
    if (this.mode === "royal_split") return this.updateRoyalSplit(dt, dx, dy, d);
  }

  chooseMode() {
    this.mode = MODES[this.modeIndex % MODES.length];
    this.modeIndex++;
    this.attackCount = 0;
    this.attackTimer = 0.08;
    this.modeTimer = 4;
    if (this.mode === "crown_bounce") {
      this.modeTimer = 0.55;
      this.jumpTimer = 0;
    }
    pulse(this.x, this.y, this.r + 50, this.color, 0.24);
  }

  updateCrownBounce(dt, dx, dy, d) {
    if (this.jumpTimer <= 0) {
      const speed = this.phase2 ? 680 : 560;
      this.jumpVx = dx / d * speed;
      this.jumpVy = dy / d * speed;
      this.jumpTimer = this.phase2 ? 0.34 : 0.3;
      burst(this.x, this.y, 14, "#caffb8", 180);
      playSfx("wave");
    }
    this.jumpTimer -= dt;
    this.x += this.jumpVx * dt;
    this.y += this.jumpVy * dt;
    trail(this.x, this.y, this.x - this.jumpVx * 0.035, this.y - this.jumpVy * 0.035, "#77ff8a", 18);
    if (this.jumpTimer <= 0) {
      this.gelSplash(this.phase2 ? 18 : 12, this.damage * 0.28);
      this.recover(0.72);
    }
  }

  updateGelRing(dt) {
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.32 : 0.42;
      this.attackCount++;
      this.gelSplash(this.phase2 ? 22 : 16, this.damage * 0.24, this.attackCount * 0.18);
      pulse(this.x, this.y, this.r + this.attackCount * 30, this.color, 0.16);
      if (this.attackCount >= (this.phase2 ? 4 : 3)) this.recover(0.65);
    }
  }

  updateSlimeRain(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 430 ? -0.34 : 0.08, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.22 : 0.32;
      this.attackCount++;
      const p = state.player;
      const a = Math.random() * TAU;
      const r = 90 + Math.random() * 260;
      this.spawnGelPatch(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 48 + Math.random() * 18, this.damage * 0.38);
      if (this.attackCount >= (this.phase2 ? 10 : 7)) this.recover(0.8);
    }
  }

  updateRoyalSplit(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.12, dt);
    if (this.attackCount === 0) {
      this.attackCount = 1;
      const count = this.phase2 ? 8 : 5;
      const ids = ["slime_small", "slime_medium", "slime_glow", "slime_gold"];
      for (let i = 0; i < count; i++) {
        const a = this.orbit + i / count * TAU;
        const id = ids[i % ids.length];
        spawnConfigured(id, this.x + Math.cos(a) * 105, this.y + Math.sin(a) * 105);
      }
      this.gelSplash(this.phase2 ? 20 : 14, this.damage * 0.22);
      playSfx("level");
    }
    if (this.modeTimer <= 3.15) this.recover(0.9);
  }

  drift(dx, dy, d, power, dt) {
    const strafe = Math.sin(this.orbit) * 0.35;
    this.x += (dx / d * power + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * power + dx / d * strafe) * this.speed * dt;
  }

  gelSplash(count, damage, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = offset + this.orbit + i / count * TAU;
      const speed = 150 + (i % 4) * 24 + (this.phase2 ? 34 : 0);
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * this.r * 0.72,
        y: this.y + Math.sin(a) * this.r * 0.72,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: this.phase2 ? 7 : 6,
        color: i % 3 === 0 ? "#ffd166" : this.color,
        damage,
        life: 4,
        shape: "stormOrb",
        spin: Math.random() * TAU,
        bossProjectile: true,
      });
    }
  }

  spawnGelPatch(x, y, r, damage) {
    const half = WORLD_SIZE / 2 - 80;
    world.hazards.push({
      kind: "frost_zone",
      x: clamp(x, -half, half),
      y: clamp(y, -half, half),
      r,
      color: this.phase2 ? "#ffd166" : this.color,
      damage,
      life: 1.7,
      maxLife: 1.7,
    });
    pulse(x, y, r, this.color, 0.22);
  }

  phaseShift() {
    burst(this.x, this.y, 38, "#ffd166", 260);
    pulse(this.x, this.y, this.r + 120, "#ffd166", 0.38);
    this.gelSplash(28, this.damage * 0.24);
    playSfx("wave");
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  takeDamage(amount, x, y, options = {}) {
    if (!this.splitChild && !this.hasSplit && this.hp - amount * state.player.damageScale <= 0) {
      this.flash = 1;
      this.splitIntoHeirs();
      return;
    }
    super.takeDamage(amount, x, y, options);
  }

  splitIntoHeirs() {
    this.hasSplit = true;
    this.dead = true;
    burst(this.x, this.y, 44, "#ffd166", 260);
    pulse(this.x, this.y, this.r + 140, "#77ff8a", 0.42);
    const index = world.enemies.indexOf(this);
    if (index >= 0) world.enemies.splice(index, 1);
    const heirs = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const heir = new SlimeKing(this, this.x + side * this.r * 0.9, this.y);
      heir.name = i ? "史莱姆王·右冠" : "史莱姆王·左冠";
      heir.splitChild = true;
      heir.rewardScale = 0.5;
      heir.phase2 = true;
      heir.r = this.r * 0.68;
      heir.radius = heir.r;
      heir.maxHp = this.maxHp * 0.38;
      heir.hp = heir.maxHp;
      heir.damage = this.damage * 0.82;
      heir.speed = this.speed * 1.12;
      heir.modeIndex = this.modeIndex;
      heir.color = i ? "#ffd166" : "#77ff8a";
      heirs.push(heir);
      world.enemies.push(heir);
    }
    world.boss = heirs[0];
    playSfx("slimeLand");
  }

  kill() {
    super.kill();
    if (!this.splitChild) return;
    const sibling = world.enemies.find((enemy) => enemy instanceof SlimeKing && enemy.splitChild && !enemy.dead);
    if (sibling) world.boss = sibling;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.4) * 5));
    drawSlimeKing(ctx, this);
    ctx.restore();
  }
}

function drawSlimeKing(ctx, e) {
  const flash = e.flash > 0;
  const body = flash ? "#ffffff" : e.phase2 ? "#ffd166" : e.color;
  const core = flash ? "#ffffff" : e.phase2 ? "#fff2a8" : "#caffb8";
  const squash = 1 + Math.sin(e.anim * 2.1) * 0.055;
  ctx.scale(squash, 1 / squash);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.72, e.r * 1.02, e.r * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-e.r * 1.06, e.r * 0.18);
  ctx.bezierCurveTo(-e.r * 1.1, -e.r * 0.5, -e.r * 0.48, -e.r * 1.05, 0, -e.r * 1.0);
  ctx.bezierCurveTo(e.r * 0.78, -e.r * 0.96, e.r * 1.14, -e.r * 0.28, e.r * 1.06, e.r * 0.2);
  ctx.bezierCurveTo(e.r * 0.9, e.r * 0.72, e.r * 0.46, e.r * 0.96, e.r * 0.08, e.r * 0.82);
  ctx.bezierCurveTo(-e.r * 0.18, e.r * 1.02, -e.r * 0.72, e.r * 0.92, -e.r * 1.06, e.r * 0.18);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, -e.r * 0.02, e.r * 0.62, e.r * 0.48, 0, 0, TAU);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = flash ? "#ffffff" : side > 0 ? "rgba(255,209,102,0.56)" : "rgba(119,255,138,0.5)";
    ctx.beginPath();
    ctx.ellipse(side * e.r * 0.72, e.r * 0.2 + Math.sin(e.anim + side) * 3, e.r * 0.26, e.r * 0.18, side * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawCrown(ctx, e);
  ctx.fillStyle = "#173b1c";
  ctx.beginPath();
  ctx.arc(-e.r * 0.24, -e.r * 0.1, e.r * 0.075, 0, TAU);
  ctx.arc(e.r * 0.28, -e.r * 0.1, e.r * 0.075, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = e.phase2 ? "#7c2d12" : "#20662d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, e.r * 0.08, e.r * 0.24, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
}

function drawCrown(ctx, e) {
  ctx.save();
  ctx.rotate(Math.sin(e.crownSpin) * 0.08);
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#ffd166";
  ctx.strokeStyle = "#fff2a8";
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const h = i === 0 ? 34 : i % 2 ? 25 : 18;
    ctx.beginPath();
    ctx.moveTo(i * 15, -e.r * 0.92 - h + Math.sin(e.anim + i) * 3);
    ctx.lineTo(i * 15 + 10, -e.r * 0.68);
    ctx.lineTo(i * 15 - 10, -e.r * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
