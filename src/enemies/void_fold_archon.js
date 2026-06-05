import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy } from "./BaseEnemy.js";

const MODES = ["singularity_seed", "orbit_lattice", "fold_dash", "horizon_breath", "core_exposed"];

export class VoidFoldArchon extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "虚空折叠师";
    this.mode = "intro";
    this.modeTimer = 1.1;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.orbit = Math.random() * TAU;
    this.aim = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.trailTimer = 0;
    this.phase2 = false;
    this.finalFoldUsed = false;
    this.knockbackResistance = 0.96;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const wasPhase2 = this.phase2;
    this.phase2 = this.hp < this.maxHp * 0.55;
    this.anim += dt * (this.phase2 ? 4.8 : 3.6);
    this.orbit += dt * (this.phase2 ? 2.2 : 1.45);
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.aim = Math.atan2(dy, dx);
    this.flip = dx < 0 ? -1 : 1;
    if (!wasPhase2 && this.phase2) this.phaseShift();
    if (!this.finalFoldUsed && this.hp < this.maxHp * 0.25) this.enterFinalFold();

    this.updateMode(dt, dx, dy, d);
    this.x = clamp(this.x, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(this.y, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.62;
      state.shake = 11;
      state.flash = 0.24;
      burst(p.x, p.y, 16, this.color, 150);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    if (this.mode === "intro" || this.mode === "recover" || this.mode === "core_exposed") {
      this.drift(dx, dy, d, this.mode === "core_exposed" ? 0.08 : 0.18, dt);
      if (this.mode === "core_exposed" && this.attackTimer <= 0) {
        this.attackTimer = 0.24;
        pulse(this.x, this.y, this.r + 42, "#f3f7ff", 0.14);
      }
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "singularity_seed") return this.updateSingularitySeed(dt, dx, dy, d);
    if (this.mode === "orbit_lattice") return this.updateOrbitLattice(dt, dx, dy, d);
    if (this.mode === "fold_dash") return this.updateFoldDash(dt);
    if (this.mode === "horizon_breath") return this.updateHorizonBreath(dt, dx, dy, d);
    if (this.mode === "final_fold") return this.updateFinalFold(dt, dx, dy, d);
  }

  chooseMode() {
    this.mode = MODES[this.modeIndex % MODES.length];
    this.modeIndex++;
    this.attackCount = 0;
    this.attackTimer = 0.08;
    this.modeTimer = this.mode === "fold_dash" ? 0.72 : this.mode === "core_exposed" ? 1.25 : 3.8;
    pulse(this.x, this.y, this.r + 58, this.mode === "core_exposed" ? "#f3f7ff" : this.color, 0.24);
  }

  updateSingularitySeed(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 480 ? -0.22 : 0.06, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.56 : 0.72;
      this.attackCount++;
      const p = state.player;
      const side = this.attackCount % 2 ? 1 : -1;
      const tx = p.x + (p.dirX || dx / d) * (120 + this.attackCount * 18) + -dy / d * side * 80;
      const ty = p.y + (p.dirY || dy / d) * (120 + this.attackCount * 18) + dx / d * side * 80;
      this.placeGravityWell(tx, ty, this.phase2 ? 126 : 112, 2.6);
      if (this.attackCount >= (this.phase2 ? 4 : 3)) this.recover(0.55);
    }
  }

  updateOrbitLattice(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 430 ? -0.18 : 0.05, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.24 : 0.32;
      this.attackCount++;
      const count = this.phase2 ? 9 : 7;
      for (let i = 0; i < count; i++) {
        const a = this.orbit + i / count * TAU;
        this.shootShard(a, 145 + (i % 3) * 28, this.damage * 0.24);
      }
      if (this.attackCount >= (this.phase2 ? 6 : 5)) this.recover(0.72);
    }
  }

  updateFoldDash(dt) {
    if (this.attackCount === 0) {
      this.attackCount = 1;
      this.dashVx = Math.cos(this.aim) * (this.phase2 ? 720 : 610);
      this.dashVy = Math.sin(this.aim) * (this.phase2 ? 720 : 610);
      this.modeTimer = this.phase2 ? 0.44 : 0.38;
      pulse(this.x + Math.cos(this.aim) * 170, this.y + Math.sin(this.aim) * 170, 74, this.color, 0.18);
      playSfx("wave");
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.045;
      trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, this.color, 18);
    }
    if (this.modeTimer <= 0) {
      for (let i = 0; i < (this.phase2 ? 14 : 10); i++) this.shootShard(this.orbit + i / (this.phase2 ? 14 : 10) * TAU, 180, this.damage * 0.22);
      this.recover(0.82);
    }
  }

  updateHorizonBreath(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.16 : 0.04, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.16;
      this.attackCount++;
      const count = this.phase2 ? 5 : 4;
      const spread = this.phase2 ? 0.74 : 0.58;
      for (let i = 0; i < count; i++) {
        const t = i - (count - 1) / 2;
        this.shootShard(this.aim + t * spread / count, 245, this.damage * (Math.abs(t) < 0.5 ? 0.34 : 0.22), true);
      }
      if (this.attackCount >= (this.phase2 ? 13 : 10)) this.recover(0.65);
    }
  }

  enterFinalFold() {
    this.finalFoldUsed = true;
    this.mode = "final_fold";
    this.modeTimer = 2.9;
    this.attackTimer = 0.3;
    this.attackCount = 0;
    pulse(this.x, this.y, this.r + 180, "#f3f7ff", 0.46);
    burst(this.x, this.y, 40, this.color, 260);
  }

  updateFinalFold(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.05, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.28;
      this.attackCount++;
      const count = 12;
      const gap = this.attackCount % count;
      for (let i = 0; i < count; i++) {
        if (i === gap || i === (gap + 1) % count) continue;
        this.shootShard(this.orbit + i / count * TAU, 210, this.damage * 0.2);
      }
    }
    if (this.modeTimer <= 0) this.recover(1.0);
  }

  drift(dx, dy, d, power, dt) {
    const strafe = Math.sin(this.orbit) * 0.36;
    this.x += (dx / d * power + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * power + dx / d * strafe) * this.speed * dt;
  }

  shootShard(angle, speed, damage, long = false) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * this.r * 0.78,
      y: this.y + Math.sin(angle) * this.r * 0.78,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: long ? 6.5 : 5.5,
      color: long ? "#d8c8ff" : this.color,
      damage,
      life: 4.2,
      shape: long ? "voidFireball" : "starShard",
      spin: Math.random() * TAU,
      bossProjectile: true,
    });
  }

  placeGravityWell(x, y, r, life) {
    const half = WORLD_SIZE / 2 - 100;
    const hx = clamp(x, -half, half);
    const hy = clamp(y, -half, half);
    world.hazards.push({
      kind: "gravity_well",
      x: hx,
      y: hy,
      r,
      color: this.color,
      damage: 0,
      life,
      maxLife: life,
      armTime: 0.46,
      pull: this.phase2 ? 245 : 205,
      spin: Math.random() * TAU,
    });
    pulse(hx, hy, r, this.color, 0.24);
  }

  phaseShift() {
    burst(this.x, this.y, 34, "#f3f7ff", 240);
    pulse(this.x, this.y, this.r + 140, this.color, 0.38);
    for (let i = 0; i < 20; i++) this.shootShard(this.orbit + i / 20 * TAU, 165, this.damage * 0.18);
    playSfx("wave");
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.2) * 4));
    ctx.scale(this.flip || 1, 1);
    drawVoidFoldArchon(ctx, this);
    ctx.restore();
  }
}

function drawVoidFoldArchon(ctx, e) {
  const hurt = e.flash > 0;
  const color = e.phase2 ? "#d8c8ff" : e.color;
  if (hurt) ctx.translate(Math.sin(e.anim * 11) * 3, 0);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.78, e.r * 1.05, e.r * 0.22, 0, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(e.orbit * (i % 2 ? -0.55 : 0.72) + i);
    ctx.strokeStyle = i === 1 ? "rgba(243,247,255,0.55)" : color;
    ctx.lineWidth = i === 0 ? 3 : 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -e.r * 0.12, e.r * (1.02 + i * 0.22), e.r * (0.45 + i * 0.11), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = hurt ? "#ffffff" : "#140b22";
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.52, -e.r * 0.78);
  ctx.quadraticCurveTo(0, -e.r * 1.18, e.r * 0.52, -e.r * 0.78);
  ctx.lineTo(e.r * 0.78, e.r * 0.74);
  ctx.quadraticCurveTo(e.r * 0.16, e.r * 1.0, 0, e.r * 0.72);
  ctx.quadraticCurveTo(-e.r * 0.2, e.r * 1.0, -e.r * 0.78, e.r * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = hurt ? "#ffffff" : "#070411";
  ctx.beginPath();
  ctx.ellipse(0, -e.r * 0.54, e.r * 0.38, e.r * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f3f7ff";
  ctx.fillRect(-e.r * 0.2, -e.r * 0.58, e.r * 0.12, e.r * 0.05);
  ctx.fillRect(e.r * 0.08, -e.r * 0.58, e.r * 0.12, e.r * 0.05);

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = e.mode === "core_exposed" ? "#ffffff" : color;
  ctx.beginPath();
  ctx.arc(0, -e.r * 0.08, e.r * (e.mode === "core_exposed" ? 0.24 : 0.16), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(243,247,255,0.5)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = e.orbit + i * TAU / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * e.r * 0.28, Math.sin(a) * e.r * 0.28 - e.r * 0.08);
    ctx.lineTo(Math.cos(a) * e.r * 0.54, Math.sin(a) * e.r * 0.54 - e.r * 0.08);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}
