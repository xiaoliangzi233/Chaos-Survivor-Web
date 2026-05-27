import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const MODES = ["snowflake_barrage", "ice_spike_field", "crystal_dash", "frost_orbit", "blizzard_core"];

export class PolarCrystalWraith extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "极霜晶魂";
    this.mode = "intro";
    this.modeTimer = 1.1;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.angle = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashLeft = 0;
    this.trailTimer = 0;
    this.orbit = Math.random() * TAU;
    this.wingPulse = Math.random() * TAU;
    this.sealCooldown = 8.5;
    this.blizzardTimer = 0;
    this.knockbackResistance = 0.94;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const oldPhase = this.phaseLevel;
    this.phaseLevel = this.hp < this.maxHp * 0.3 ? 3 : this.hp < this.maxHp * 0.65 ? 2 : 1;
    this.anim += dt * (2.8 + this.phaseLevel * 0.8);
    this.orbit += dt * (1.15 + this.phaseLevel * 0.24);
    this.wingPulse += dt * 2.1;
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.sealCooldown -= dt;
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.8);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.angle = Math.atan2(dy, dx);

    if (oldPhase !== this.phaseLevel) this.phaseShift();
    this.updateMode(dt, dx, dy, d);
    this.keepAwayFromEdges(dt);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.6;
      p.frostTimer = Math.max(p.frostTimer || 0, 1.1);
      p.frostSlow = Math.max(p.frostSlow || 0, 0.25);
      state.shake = 10;
      state.flash = 0.18;
      burst(p.x, p.y, 16, this.color, 150);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    if (this.mode === "intro") {
      this.drift(dx, dy, d, 0.12, 0.42, dt);
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "recover") {
      this.drift(dx, dy, d, d < 420 ? -0.42 : 0.18, 0.44, dt);
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "snowflake_barrage") return this.updateSnowflakeBarrage(dt, dx, dy, d);
    if (this.mode === "ice_spike_field") return this.updateIceSpikeField(dt, dx, dy, d);
    if (this.mode === "crystal_dash") return this.updateCrystalDash(dt, dx, dy, d);
    if (this.mode === "frost_orbit") return this.updateFrostOrbit(dt, dx, dy, d);
    if (this.mode === "blizzard_core") return this.updateBlizzardCore(dt, dx, dy, d);
    if (this.mode === "absolute_seal") return this.updateAbsoluteSeal(dt, dx, dy, d);
  }

  chooseMode() {
    if (this.phaseLevel >= 3 && this.sealCooldown <= 0) {
      this.mode = "absolute_seal";
      this.modeTimer = 1.2;
      this.attackCount = 0;
      this.sealCooldown = 10;
      pulse(this.x, this.y, this.r + 70, "#d9fbff", 0.28);
      return;
    }
    this.mode = MODES[this.modeIndex % MODES.length];
    this.modeIndex += this.phaseLevel === 3 ? 2 : 1;
    this.attackCount = 0;
    this.attackTimer = 0.08;
    this.modeTimer = 4;
    if (this.mode === "crystal_dash") {
      this.modeTimer = 0.62;
      this.dashLeft = this.phaseLevel;
      this.dashing = false;
      this.angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    } else if (this.mode === "blizzard_core") {
      this.modeTimer = this.phaseLevel >= 3 ? 3.9 : 3.1;
      this.blizzardTimer = 0;
    }
    pulse(this.x, this.y, this.r + 34, this.color, 0.24);
  }

  updateSnowflakeBarrage(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.4 : 0.08, 0.22, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phaseLevel >= 3 ? 0.22 : 0.32;
      const rounds = this.phaseLevel >= 3 ? 7 : this.phaseLevel >= 2 ? 5 : 4;
      const count = this.phaseLevel >= 2 ? 12 : 6;
      const base = this.orbit + this.attackCount * (this.phaseLevel >= 2 ? 0.22 : Math.PI / 6);
      for (let i = 0; i < count; i++) {
        const a = base + i / count * TAU;
        const gap = this.phaseLevel >= 3 && this.attackCount % 2 === 0 && i % 5 === 0;
        if (!gap) this.shootSnowflake(a, 155 + this.phaseLevel * 24, 6.2, this.damage * 0.3, this.phaseLevel >= 2);
      }
      this.attackCount++;
      playSfx("shoot");
      if (this.attackCount >= rounds) this.recover(0.65);
    }
  }

  updateIceSpikeField(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 440 ? -0.38 : 0.12, 0.3, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phaseLevel >= 3 ? 0.28 : 0.42;
      this.attackCount++;
      const count = this.phaseLevel >= 3 ? 4 : this.phaseLevel >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) this.placeIceSpike(i, count);
      if (this.attackCount >= (this.phaseLevel >= 2 ? 5 : 4)) this.recover(0.62);
    }
  }

  updateCrystalDash(dt, dx, dy, d) {
    if (!this.dashing) {
      this.drift(dx, dy, d, -0.12, 0.1, dt);
      if (Math.random() < dt * 14) particle("mist", this.x, this.y, { color: this.color, life: 0.35, size: 12, alpha: 0.38 });
      if (this.modeTimer <= 0) this.startDash();
      return;
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.045;
      trail(this.x, this.y, this.x - this.dashVx * 0.05, this.y - this.dashVy * 0.05, "#d9fbff", 16);
      this.dropFrostShard();
    }
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.dashLeft--;
      if (this.dashLeft > 0) {
        this.modeTimer = this.phaseLevel >= 3 ? 0.28 : 0.38;
        this.dashing = false;
        this.angle = Math.atan2(state.player.y - this.y, state.player.x - this.x) + (Math.random() - 0.5) * 0.24;
        this.attackTimer = 10;
      } else {
        this.ringBurst(10 + this.phaseLevel * 3, 165, this.damage * 0.24);
        this.recover(0.76);
      }
    }
  }

  startDash() {
    const speed = this.phaseLevel >= 3 ? 810 : this.phaseLevel >= 2 ? 720 : 640;
    this.dashVx = Math.cos(this.angle) * speed;
    this.dashVy = Math.sin(this.angle) * speed;
    this.dashing = true;
    this.attackTimer = this.phaseLevel >= 3 ? 0.38 : 0.34;
    burst(this.x, this.y, 14, "#d9fbff", 220);
    playSfx("wave");
  }

  updateFrostOrbit(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 430 ? -0.4 : 0.1, 0.42, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.16;
      this.attackCount++;
      const count = 6;
      const fireRound = this.attackCount === 5 || (this.phaseLevel >= 3 && this.attackCount === 8);
      if (fireRound) {
        for (let i = 0; i < count; i++) {
          const a = this.orbit + i / count * TAU;
          const targetA = Math.atan2(state.player.y - (this.y + Math.sin(a) * 80), state.player.x - (this.x + Math.cos(a) * 80));
          this.shootSnowflake(targetA + (i - 2.5) * 0.055, 260, 7.5, this.damage * 0.36, true, this.x + Math.cos(a) * 82, this.y + Math.sin(a) * 82);
        }
      }
      if (this.attackCount >= (this.phaseLevel >= 3 ? 10 : 7)) this.recover(0.55);
    }
  }

  updateBlizzardCore(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.2 : 0.05, 0.12, dt);
    this.blizzardTimer -= dt;
    world.hazards.push({
      kind: "blizzard_core",
      x: state.player.x - state.player.dirX * 70 + (Math.random() - 0.5) * 60,
      y: state.player.y - state.player.dirY * 70 + (Math.random() - 0.5) * 60,
      r: 82,
      color: this.color,
      damage: this.damage * 0.08,
      life: 0.22,
      maxLife: 0.22,
      frostDuration: 0.35,
      frostSlow: 0.16,
    });
    if (this.blizzardTimer <= 0) {
      this.blizzardTimer = this.phaseLevel >= 3 ? 0.18 : 0.28;
      const a = Math.random() * TAU;
      const r = 260 + Math.random() * 300;
      this.shootSnowflake(a + Math.PI + Math.random() * 0.2, 95 + Math.random() * 75, 5.2, this.damage * 0.18, false, state.player.x + Math.cos(a) * r, state.player.y + Math.sin(a) * r);
      if (this.phaseLevel >= 3 && Math.random() < 0.45) this.placeIceSpike(Math.floor(Math.random() * 3), 3);
    }
    if (this.modeTimer <= 0) this.recover(0.85);
  }

  updateAbsoluteSeal(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.16, 0.18, dt);
    if (this.attackCount === 0) {
      this.attackCount = 1;
      const missing = Math.floor(Math.random() * 6);
      const p = state.player;
      for (let i = 0; i < 6; i++) {
        if (i === missing || i === (missing + 1) % 6) continue;
        const a = i / 6 * TAU + Math.PI / 6;
        const x = clamp(p.x + Math.cos(a) * 165, -WORLD_SIZE / 2 + 100, WORLD_SIZE / 2 - 100);
        const y = clamp(p.y + Math.sin(a) * 165, -WORLD_SIZE / 2 + 100, WORLD_SIZE / 2 - 100);
        world.hazards.push({
          kind: "ice_seal",
          x,
          y,
          r: 42,
          color: this.color,
          damage: this.damage * 0.64,
          life: 1.55,
          maxLife: 1.55,
          armTime: 0.95,
          angle: a,
          frostDuration: 1.1,
          frostSlow: 0.28,
        });
      }
      playSfx("wave");
    }
    if (this.modeTimer <= 0) this.recover(0.9);
  }

  placeIceSpike(index, count) {
    const p = state.player;
    const lead = 110 + index * 42 + Math.random() * 35;
    const spread = (index - (count - 1) / 2) * 86;
    const x = clamp(p.x + p.dirX * lead - p.dirY * spread + (Math.random() - 0.5) * 42, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90);
    const y = clamp(p.y + p.dirY * lead + p.dirX * spread + (Math.random() - 0.5) * 42, -WORLD_SIZE / 2 + 90, WORLD_SIZE / 2 - 90);
    world.hazards.push({
      kind: "ice_spike",
      x,
      y,
      r: 48,
      color: this.color,
      damage: this.damage * 0.78,
      life: 1.18,
      maxLife: 1.18,
      armTime: 0.72,
      frostDuration: 1.1,
      frostSlow: 0.28,
      spikeAngle: Math.random() * TAU,
    });
    pulse(x, y, 48, this.color, 0.26);
  }

  shootSnowflake(angle, speed, radius, damage, split = false, x = this.x, y = this.y) {
    world.enemyProjectiles.push({
      x: x + Math.cos(angle) * 18,
      y: y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color: this.color,
      damage,
      life: 4.4,
      shape: "snowflake",
      spin: Math.random() * TAU,
      frostDuration: split ? 1.2 : 0.8,
      frostSlow: split ? 0.24 : 0.18,
      splitOnExpire: split && this.phaseLevel >= 2,
    });
  }

  ringBurst(count, speed, damage) {
    for (let i = 0; i < count; i++) this.shootSnowflake(this.orbit + i / count * TAU, speed, 5.2, damage, false);
  }

  dropFrostShard() {
    world.hazards.push({ kind: "frost_zone", x: this.x, y: this.y, r: 34, color: this.color, damage: this.damage * 0.16, life: 1.15, maxLife: 1.15, frostDuration: 0.7, frostSlow: 0.22 });
  }

  phaseShift() {
    this.phasePulse = 1;
    this.mode = "recover";
    this.modeTimer = 0.8;
    this.ringBurst(18 + this.phaseLevel * 4, 145, this.damage * 0.2);
    burst(this.x, this.y, 36, "#d9fbff", 260);
    pulse(this.x, this.y, this.r + 120, "#d9fbff", 0.42);
    playSfx("wave");
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  drift(dx, dy, d, forward, strafePower, dt) {
    const strafe = Math.sin(this.orbit) * strafePower;
    this.x += (dx / d * forward + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * forward + dx / d * strafe) * this.speed * dt;
  }

  keepAwayFromEdges(dt) {
    const half = WORLD_SIZE / 2 - 260;
    const tx = clamp(this.x, -half, half);
    const ty = clamp(this.y, -half, half);
    this.x += (tx - this.x) * dt * 1.5;
    this.y += (ty - this.y) * dt * 1.5;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.35) * 6));
    drawDashTelegraph(ctx, this);
    drawAuroraMist(ctx, this);
    drawCrystalWings(ctx, this);
    drawOrbitRunes(ctx, this);
    drawWraithBody(ctx, this);
    drawIceCrown(ctx, this);
    drawCore(ctx, this);
    ctx.restore();
  }
}

function drawDashTelegraph(ctx, e) {
  if (e.mode !== "crystal_dash" || e.modeTimer <= 0 || e.dashing) return;
  ctx.save();
  ctx.rotate(e.angle);
  ctx.strokeStyle = "rgba(217,251,255,0.42)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.moveTo(e.r * 0.8, 0);
  ctx.lineTo(560, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawAuroraMist(ctx, e) {
  const alpha = 0.14 + e.phaseLevel * 0.035;
  ctx.fillStyle = `rgba(159,244,255,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 8, e.r * 1.25, e.r * 1.05, Math.sin(e.anim) * 0.12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.88, e.r * 1.05, e.r * 0.18, 0, 0, TAU);
  ctx.fill();
}

function drawCrystalWings(ctx, e) {
  const flash = e.flash > 0;
  const open = 1 + Math.sin(e.wingPulse) * 0.08 + e.phasePulse * 0.22;
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(217,251,255,0.74)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + e.orbit * 0.16;
    const inner = e.r * 0.62;
    const outer = e.r * (1.45 + e.phaseLevel * 0.1) * open;
    ctx.fillStyle = flash ? "#ffffff" : i % 2 ? "rgba(159,244,255,0.52)" : "rgba(217,251,255,0.66)";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.13) * inner, Math.sin(a - 0.13) * inner * 0.9);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * 0.9);
    ctx.lineTo(Math.cos(a + 0.13) * inner, Math.sin(a + 0.13) * inner * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawOrbitRunes(ctx, e) {
  for (let layer = 0; layer < 2; layer++) {
    ctx.save();
    ctx.rotate(e.orbit * (layer ? -0.75 : 1));
    ctx.scale(1, 0.78 + layer * 0.1);
    ctx.strokeStyle = layer ? "rgba(180,140,255,0.48)" : "rgba(217,251,255,0.7)";
    ctx.lineWidth = 1.5;
    const count = layer ? 12 : 6;
    const r = e.r * (1.18 + layer * 0.34);
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + 0.18);
      ctx.stroke();
      if (!layer) drawSnowRune(ctx, Math.cos(a) * r, Math.sin(a) * r, 5, a);
    }
    ctx.restore();
  }
}

function drawWraithBody(ctx, e) {
  const flash = e.flash > 0;
  const body = flash ? "#ffffff" : "#c9fbff";
  const edge = flash ? "#ffffff" : "#58d9ff";
  const tail = Math.sin(e.anim * 2.4) * 5;
  ctx.fillStyle = "rgba(159,244,255,0.42)";
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.52, -e.r * 0.06);
  ctx.quadraticCurveTo(-e.r * 0.7, e.r * 0.42, -e.r * 0.28, e.r * 0.9 + tail);
  ctx.lineTo(0, e.r * 0.66 - tail);
  ctx.lineTo(e.r * 0.3, e.r * 0.92 + tail);
  ctx.quadraticCurveTo(e.r * 0.72, e.r * 0.42, e.r * 0.52, -e.r * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -e.r * 0.15, e.r * 0.62, e.r * 0.72, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawIceCrown(ctx, e) {
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#d9fbff";
  ctx.strokeStyle = "#7ee8ff";
  ctx.lineWidth = 1.7;
  for (let i = -2; i <= 2; i++) {
    const h = i === 0 ? 30 : i % 2 ? 22 : 16;
    ctx.beginPath();
    ctx.moveTo(i * 13, -e.r * 0.92 - h - Math.sin(e.anim + i) * 2);
    ctx.lineTo(i * 13 + 7, -e.r * 0.68);
    ctx.lineTo(i * 13 - 7, -e.r * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawCore(ctx, e) {
  const pulseScale = 1 + Math.sin(e.anim * 3.3) * 0.06 + e.phasePulse * 0.18;
  ctx.save();
  ctx.scale(pulseScale, pulseScale);
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#55f0ff";
  diamond(ctx, 0, -e.r * 0.12, e.r * 0.22, e.r * 0.42);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  diamondStroke(ctx, 0, -e.r * 0.12, e.r * 0.31, e.r * 0.54);
  ctx.fillStyle = e.phaseLevel >= 3 ? "#b48cff" : "#123146";
  ctx.beginPath();
  ctx.ellipse(Math.cos(e.angle) * 4, -e.r * 0.2 + Math.sin(e.angle) * 3, e.r * 0.1, e.r * 0.05, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSnowRune(ctx, x, y, r, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
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

function diamondStroke(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.stroke();
}
