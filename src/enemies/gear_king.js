import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";
import { drawGear } from "./gearfiend.js";

const MODES = ["gear_barrage", "saw_dash", "trap_factory", "giant_gear_rain", "summon_gears"];

export class GearKing extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "齿轮王";
    this.mode = "intro";
    this.modeTimer = 1.1;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.spin = Math.random() * TAU;
    this.aim = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.trailTimer = 0;
    this.phase2 = false;
    this.knockbackResistance = 0.96;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const wasPhase2 = this.phase2;
    this.phase2 = this.hp < this.maxHp * 0.5;
    this.anim += dt * (this.phase2 ? 5.2 : 4.1);
    this.spin += dt * (this.phase2 ? 5.8 : 4.2);
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.aim = Math.atan2(dy, dx);
    if (!wasPhase2 && this.phase2) this.phaseShift();

    this.updateMode(dt, dx, dy, d);
    this.x = clamp(this.x, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(this.y, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.7;
      state.shake = 14;
      state.flash = 0.3;
      burst(p.x, p.y, 20, this.color, 180);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    if (this.mode === "intro" || this.mode === "recover") {
      this.drift(dx, dy, d, this.mode === "intro" ? 0.08 : 0.2, dt);
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "gear_barrage") return this.updateGearBarrage(dt, dx, dy, d);
    if (this.mode === "saw_dash") return this.updateSawDash(dt);
    if (this.mode === "trap_factory") return this.updateTrapFactory(dt, dx, dy, d);
    if (this.mode === "giant_gear_rain") return this.updateGiantGearRain(dt, dx, dy, d);
    if (this.mode === "summon_gears") return this.updateSummonGears(dt, dx, dy, d);
  }

  chooseMode() {
    this.mode = MODES[this.modeIndex % MODES.length];
    this.modeIndex++;
    this.attackCount = 0;
    this.attackTimer = 0.08;
    this.modeTimer = this.mode === "saw_dash" ? 0.68 : 4;
    if (this.mode === "saw_dash") pulse(this.x, this.y, this.r + 70, "#ffd166", 0.3);
    else pulse(this.x, this.y, this.r + 46, this.color, 0.22);
  }

  updateGearBarrage(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.25 : 0.08, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.2 : 0.28;
      this.attackCount++;
      const count = this.phase2 ? 9 : 6;
      const spread = this.phase2 ? 0.78 : 0.56;
      for (let i = 0; i < count; i++) {
        const t = i - (count - 1) / 2;
        this.shootGear(this.aim + t * spread / count, 250 + i * 10, this.damage * 0.34);
      }
      if (this.attackCount >= (this.phase2 ? 6 : 4)) this.recover(0.62);
    }
  }

  updateSawDash(dt) {
    if (this.attackCount === 0) {
      this.attackCount = 1;
      this.dashVx = Math.cos(this.aim) * (this.phase2 ? 760 : 640);
      this.dashVy = Math.sin(this.aim) * (this.phase2 ? 760 : 640);
      this.modeTimer = this.phase2 ? 0.5 : 0.42;
      burst(this.x, this.y, 18, "#ffd166", 220);
      playSfx("wave");
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.055;
      trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, "#ffd166", 20);
      this.placeTrap(this.x, this.y, this.damage * 0.28, 0.8);
    }
    if (this.modeTimer <= 0) {
      for (let i = 0; i < (this.phase2 ? 16 : 10); i++) this.shootGear(this.spin + i / (this.phase2 ? 16 : 10) * TAU, 210, this.damage * 0.3);
      this.recover(0.78);
    }
  }

  updateTrapFactory(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 460 ? -0.32 : 0.08, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.34 : 0.48;
      this.attackCount++;
      const p = state.player;
      const side = this.attackCount % 2 ? 1 : -1;
      const x = p.x + Math.cos(this.aim + side * Math.PI / 2) * (90 + this.attackCount * 24);
      const y = p.y + Math.sin(this.aim + side * Math.PI / 2) * (90 + this.attackCount * 24);
      this.placeTrap(x, y, this.damage * 0.54, 3.4);
      if (this.attackCount >= (this.phase2 ? 8 : 6)) this.recover(0.7);
    }
  }

  updateSummonGears(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.1, dt);
    if (this.attackCount === 0) {
      this.attackCount = 1;
      const count = this.phase2 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const a = this.spin + i / count * TAU;
        spawnConfigured("gearfiend", this.x + Math.cos(a) * 130, this.y + Math.sin(a) * 130);
      }
      for (let i = 0; i < 18; i++) this.shootGear(this.spin + i / 18 * TAU, 165 + (i % 3) * 28, this.damage * 0.25);
      playSfx("level");
    }
    if (this.modeTimer <= 3.15) this.recover(0.85);
  }

  updateGiantGearRain(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.22 : 0.05, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.18 : 0.24;
      this.attackCount++;
      const half = WORLD_SIZE / 2;
      const lanes = this.phase2 ? 3 : 2;
      for (let i = 0; i < lanes; i++) {
        const x = clamp(state.player.x + (Math.random() - 0.5) * 900, -half + 90, half - 90);
        const y = -half - 180 - Math.random() * 220;
        world.enemyProjectiles.push({
          x,
          y,
          vx: 0,
          vy: this.phase2 ? 520 : 440,
          r: this.phase2 ? 34 : 30,
          color: this.phase2 ? "#ff4d6d" : "#ffd166",
          damage: this.damage * 0.58,
          life: 8.2,
          shape: "fastGear",
          spin: Math.random() * TAU,
          bossProjectile: true,
        });
        pulse(x, clamp(state.player.y - 260, -half + 120, half - 120), 48, "#ffd166", 0.12);
      }
      if (this.attackCount >= (this.phase2 ? 14 : 10)) this.recover(0.82);
    }
  }

  drift(dx, dy, d, power, dt) {
    const strafe = Math.sin(this.spin * 0.4) * 0.3;
    this.x += (dx / d * power + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * power + dx / d * strafe) * this.speed * dt;
  }

  shootGear(angle, speed, damage) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * (this.r * 0.75),
      y: this.y + Math.sin(angle) * (this.r * 0.75),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: this.phase2 ? 8 : 7,
      color: this.phase2 ? "#ff4d6d" : this.color,
      damage,
      life: 4.6,
      shape: "fastGear",
      spin: Math.random() * TAU,
      bossProjectile: true,
    });
  }

  placeTrap(x, y, damage, life) {
    const half = WORLD_SIZE / 2 - 80;
    world.hazards.push({
      kind: "gear_trap",
      x: clamp(x, -half, half),
      y: clamp(y, -half, half),
      r: this.phase2 ? 46 : 40,
      color: this.phase2 ? "#ff4d6d" : this.color,
      damage,
      life,
      maxLife: life,
      spin: Math.random() * TAU,
    });
    pulse(x, y, 48, this.color, 0.18);
  }

  phaseShift() {
    burst(this.x, this.y, 36, "#ff4d6d", 260);
    pulse(this.x, this.y, this.r + 130, "#ff4d6d", 0.36);
    for (let i = 0; i < 24; i++) this.shootGear(this.spin + i / 24 * TAU, 180, this.damage * 0.22);
    playSfx("wave");
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.2) * 4));
    drawGearKing(ctx, this);
    ctx.restore();
  }
}

function drawGearKing(ctx, e) {
  const flash = e.flash > 0;
  const color = flash ? "#ffffff" : e.phase2 ? "#ff4d6d" : e.color;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.76, e.r * 1.06, e.r * 0.2, 0, 0, TAU);
  ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    ctx.save();
    ctx.rotate(e.spin * (layer % 2 ? -0.5 : 0.65) + layer);
    ctx.strokeStyle = layer === 1 ? "rgba(255,255,255,0.56)" : color;
    ctx.lineWidth = layer === 0 ? 3 : 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * (1.08 + layer * 0.18), e.r * (0.62 + layer * 0.1), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  drawGear(ctx, 0, 0, e.r * 0.78, 16, e.spin, flash ? "#ffffff" : "#7b8798", color);
  drawGear(ctx, -e.r * 0.58, e.r * 0.1, e.r * 0.28, 10, -e.spin * 1.4, flash ? "#ffffff" : "#3f4a5f", color);
  drawGear(ctx, e.r * 0.58, e.r * 0.1, e.r * 0.28, 10, -e.spin * 1.4, flash ? "#ffffff" : "#3f4a5f", color);
  ctx.save();
  ctx.rotate(e.aim);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(e.r * 0.25, 0);
  ctx.lineTo(e.r * 1.15, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(e.r * 1.3, 0);
  ctx.lineTo(e.r * 0.96, -e.r * 0.14);
  ctx.lineTo(e.r * 0.96, e.r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 0.28, 0, TAU);
  ctx.fill();
  ctx.fillStyle = e.phase2 ? "#ffd166" : "#fff2a8";
  ctx.beginPath();
  ctx.arc(Math.cos(e.aim) * e.r * 0.12, Math.sin(e.aim) * e.r * 0.12, e.r * 0.1, 0, TAU);
  ctx.fill();
}
