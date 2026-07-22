import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const MODES = ["fan", "ring", "dash", "summon"];
const FAR_DASH_DISTANCE = 760;

export class StormTyrant extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "风暴暴君·雷冕核心";
    this.enhancedProfile = state.waveScenario?.bossProfile === "singularity_three_phase";
    this.mode = "intro";
    this.modeTimer = 1.0;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.lockAngle = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashTrailTimer = 0;
    this.chainDashesRemaining = 0;
    this.chainDashState = "idle";
    this.phaseLevel = 1;
    this.phase2 = false;
    this.phase3 = false;
    this.phasePulse = 0;
    this.ringSpin = Math.random() * TAU;
    this.surgeTimer = 4.8;
    this.eyeBlink = Math.random() * TAU;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.syncPhase();
    this.anim += dt * (this.phase3 ? 5.1 : this.phase2 ? 4.2 : 3.1);
    this.ringSpin += dt * (this.phase3 ? 2.45 : this.phase2 ? 1.8 : 1.25);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.8);
    this.eyeBlink += dt * 2.2;
    if ((!this.enhancedProfile && this.hp < this.maxHp * 0.25) || (this.enhancedProfile && this.phase3)) {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) {
        this.surgeTimer = this.enhancedProfile ? 5.4 : 4.2;
        this.stormSurge();
      }
    }

    this.updateMode(dt, dx, dy, d);
    this.keepNearArena(dt, dx, dy, d);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.65;
      state.shake = 14;
      state.flash = 0.32;
      burst(p.x, p.y, 18, this.phaseColor(), 180);
      playSfx("hurt");
    }
  }

  syncPhase() {
    if (!this.enhancedProfile) {
      this.phase2 = this.hp < this.maxHp * 0.55;
      this.phase3 = false;
      this.phaseLevel = this.phase2 ? 2 : 1;
      return;
    }
    const next = this.hp < this.maxHp * 0.35 ? 3 : this.hp < this.maxHp * 0.7 ? 2 : 1;
    if (next > this.phaseLevel) this.startPhaseTransition(next);
  }

  startPhaseTransition(level) {
    this.phaseLevel = level;
    this.phase2 = level >= 2;
    this.phase3 = level >= 3;
    this.mode = "phase_transition";
    this.modeTimer = 0.82;
    this.currentAttack = null;
    this.attackCount = 0;
    this.phasePulse = 1;
    this.clearOwnedStormEffects();
    const color = this.phaseColor();
    burst(this.x, this.y, level === 3 ? 46 : 36, color, 280);
    pulse(this.x, this.y, this.r + 120, color, 0.48);
    state.shake = Math.max(state.shake, level === 3 ? 12 : 8);
    playSfx("wave");
    if (level === 3) this.summonStormShards(4, true);
  }

  clearOwnedStormEffects() {
    for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
      if (world.enemyProjectiles[i].stormTyrantOwner === this) world.enemyProjectiles.splice(i, 1);
    }
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].stormTyrantOwner === this) world.hazards.splice(i, 1);
    }
  }

  updateMode(dt, dx, dy, d) {
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    if (this.mode === "intro") {
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "phase_transition") {
      this.drift(dx, dy, d, -0.08, dt);
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "windup") {
      this.drift(dx, dy, d, -0.18, dt);
      if (this.modeTimer <= 0) this.startAttack();
      return;
    }
    if (this.mode === "fan") return this.updateFan(dt, dx, dy);
    if (this.mode === "ring") return this.updateRing(dt);
    if (this.mode === "dash") return this.updateDash(dt);
    if (this.mode === "chain_dash") return this.updateChainDash(dt);
    if (this.mode === "thunder_cage") return this.updateThunderCage(dt, dx, dy, d);
    if (this.mode === "tempest_eye") return this.updateTempestEye(dt);
    if (this.mode === "summon") return this.updateSummon(dt);
    if (this.mode === "recover") {
      this.drift(dx, dy, d, 0.28, dt);
      if (this.modeTimer <= 0) this.chooseMode();
    }
  }

  chooseMode() {
    this.mode = "windup";
    const sequence = this.enhancedProfile
      ? this.phase3
        ? ["thunder_cage", "tempest_eye", "chain_dash", "fan"]
        : this.phase2
          ? ["fan", "thunder_cage", "chain_dash", "ring", "summon"]
          : MODES
      : MODES;
    const scheduledAttack = sequence[this.modeIndex % sequence.length];
    const d = Math.hypot(state.player.x - this.x, state.player.y - this.y);
    if (!this.enhancedProfile && d > FAR_DASH_DISTANCE && scheduledAttack !== "dash") {
      this.currentAttack = "dash";
    } else {
      this.currentAttack = scheduledAttack;
      this.modeIndex++;
    }
    this.modeTimer = this.currentAttack === "dash" || this.currentAttack === "chain_dash"
      ? 0.66
      : this.currentAttack === "summon" || this.currentAttack === "thunder_cage"
        ? 0.78
        : this.currentAttack === "tempest_eye" ? 0.88 : 0.5;
    this.attackCount = 0;
    this.lockAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    pulse(this.x, this.y, this.r + 28, this.phaseColor(), 0.24);
  }

  startAttack() {
    this.mode = this.currentAttack;
    this.attackTimer = 0;
    if (this.mode === "fan") this.modeTimer = this.phase2 ? 1.62 : 1.28;
    if (this.mode === "ring") this.modeTimer = this.phase2 ? 1.86 : 1.46;
    if (this.mode === "summon") this.modeTimer = 0.62;
    if (this.mode === "thunder_cage") {
      this.modeTimer = 1.32;
      this.spawnThunderCage();
    }
    if (this.mode === "tempest_eye") this.modeTimer = 2.05;
    if (this.mode === "chain_dash") {
      this.chainDashesRemaining = this.phase3 ? 3 : 2;
      this.beginChainDash();
    }
    if (this.mode === "dash") {
      this.modeTimer = this.phase2 ? 0.46 : 0.4;
      this.dashVx = Math.cos(this.lockAngle) * (this.phase2 ? 760 : 650);
      this.dashVy = Math.sin(this.lockAngle) * (this.phase2 ? 760 : 650);
      burst(this.x, this.y, 16, "#d9fbff", 220);
      playSfx("wave");
    }
  }

  updateFan(dt, dx, dy) {
    this.drift(dx, dy, Math.max(1, Math.hypot(dx, dy)), 0.24, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.2 : 0.23;
      this.attackCount++;
      const rounds = this.phase3 ? 5 : this.phase2 ? 6 : 4;
      const count = this.phase3 ? 12 : this.phase2 ? 11 : 8;
      const base = Math.atan2(dy, dx) + Math.sin(this.attackCount * 0.9) * 0.13;
      for (let i = 0; i < count; i++) {
        const t = i - (count - 1) / 2;
        this.shoot(base + t * 0.14, 220 + this.attackCount * 11, 6.5, "stormBlade", this.damage * 0.46);
      }
      if (this.phase2 && this.attackCount % 2 === 0) {
        this.shoot(base + Math.PI * 0.5, 178, 5.2, "stormOrb", this.damage * 0.3);
        this.shoot(base - Math.PI * 0.5, 178, 5.2, "stormOrb", this.damage * 0.3);
      }
      playSfx("shoot");
      if (this.attackCount >= rounds) this.recover(0.42);
    }
  }

  updateRing(dt) {
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.29 : 0.38;
      this.attackCount++;
      const count = this.phase3 ? 28 : this.phase2 ? 26 : 18;
      const offset = this.ringSpin + this.attackCount * 0.22;
      for (let i = 0; i < count; i++) {
        const gap = this.attackCount % 2 === 0 && i % 7 === 0;
        if (!gap) this.shoot(offset + i / count * TAU, this.phase2 ? 205 : 175, 5.7, "stormOrb", this.damage * 0.38);
      }
      if (this.phase2) {
        for (let i = 0; i < 14; i++) this.shoot(offset * -0.7 + i / 14 * TAU, 138, 4.6, "stormOrb", this.damage * 0.3);
      }
      pulse(this.x, this.y, this.r + this.attackCount * 22, this.phaseColor(), 0.18);
      playSfx("shoot");
      if (this.attackCount >= (this.phase2 ? 4 : 3)) this.recover(0.56);
    }
  }

  updateDash(dt) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt);
    if (this.modeTimer <= 0) {
      if (this.phase2) for (let i = 0; i < 10; i++) this.shoot(i / 10 * TAU + this.ringSpin, 210, 5.2, "stormOrb", this.damage * 0.36);
      this.recover(0.68);
    }
  }

  beginChainDash() {
    this.chainDashState = "dashing";
    this.lockAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const speed = this.phase3 ? 790 : 720;
    this.dashVx = Math.cos(this.lockAngle) * speed;
    this.dashVy = Math.sin(this.lockAngle) * speed;
    this.modeTimer = this.phase3 ? 0.34 : 0.31;
    this.dashTrailTimer = 0;
    burst(this.x, this.y, 18, this.phaseColor(), 230);
    playSfx("wave");
  }

  updateChainDash(dt) {
    if (this.chainDashState === "windup") {
      this.lockAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
      if (this.modeTimer <= 0) this.beginChainDash();
      return;
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt);
    if (this.modeTimer > 0) return;
    this.chainDashesRemaining--;
    for (let i = 0; i < 8; i++) this.shoot(this.ringSpin + i / 8 * TAU, 190, 4.8, "stormOrb", this.damage * 0.28);
    if (this.chainDashesRemaining <= 0) {
      this.chainDashState = "idle";
      this.recover(0.72);
      return;
    }
    this.chainDashState = "windup";
    this.modeTimer = 0.48;
    pulse(this.x, this.y, this.r + 54, this.phaseColor(), 0.28);
  }

  leaveDashTrail(dt) {
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer > 0) return;
    this.dashTrailTimer = 0.045;
    const color = this.phaseColor();
    trail(this.x, this.y, this.x - this.dashVx * 0.05, this.y - this.dashVy * 0.05, color, 16);
    world.hazards.push({
      x: this.x,
      y: this.y,
      r: this.phase3 ? 44 : this.phase2 ? 42 : 36,
      color,
      damage: this.damage * 0.36,
      life: 0.72,
      maxLife: 0.72,
      stormTyrantOwner: this,
    });
  }

  spawnThunderCage() {
    const p = state.player;
    const vertical = Math.abs(p.dirX || 0) >= Math.abs(p.dirY || 0);
    const spread = this.phase3 ? 300 : 340;
    const speed = this.phase3 ? 82 : 70;
    for (const side of [-1, 1]) {
      world.hazards.push({
        kind: "storm_laser_net",
        x: vertical ? p.x + side * spread : p.x,
        y: vertical ? p.y : p.y + side * spread,
        vx: vertical ? -side * speed : 0,
        vy: vertical ? 0 : -side * speed,
        angle: vertical ? Math.PI / 2 : 0,
        length: 1600,
        width: this.phase3 ? 24 : 21,
        color: this.phaseColor(),
        damage: this.damage * 0.42,
        life: 3.25,
        maxLife: 3.25,
        armTime: 0.9,
        armDuration: 0.9,
        surgeTime: 0.24,
        stormTyrantOwner: this,
      });
    }
    pulse(p.x, p.y, spread, this.phaseColor(), 0.34);
  }

  updateThunderCage(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.12, dt);
    if (this.modeTimer <= 0) this.recover(0.58);
  }

  updateTempestEye() {
    if (this.attackTimer > 0) return;
    this.attackTimer = 0.38;
    this.attackCount++;
    const count = 30;
    const gap = (this.attackCount * 4) % count;
    const offset = this.ringSpin + this.attackCount * 0.24;
    for (let i = 0; i < count; i++) {
      const opposite = (gap + count / 2) % count;
      const gapDistance = Math.min(Math.abs(i - gap), count - Math.abs(i - gap));
      const oppositeDistance = Math.min(Math.abs(i - opposite), count - Math.abs(i - opposite));
      if (gapDistance <= 2 || oppositeDistance <= 2) continue;
      this.shoot(offset + i / count * TAU, 158 + this.attackCount * 12, 5.4, "stormOrb", this.damage * 0.34);
    }
    pulse(this.x, this.y, this.r + this.attackCount * 34, this.phaseColor(), 0.24);
    playSfx("shoot");
    if (this.attackCount >= 4) this.recover(0.66);
  }

  updateSummon() {
    if (this.attackCount === 0) {
      this.attackCount = 1;
      const count = this.phase2 ? 5 : 3;
      this.summonStormShards(count, this.phase2);
      pulse(this.x, this.y, 130, "#9ff4ff", 0.34);
      playSfx("level");
    }
    if (this.modeTimer <= 0) this.recover(0.76);
  }

  summonStormShards(count, empowered) {
    for (let i = 0; i < count; i++) {
      const a = this.ringSpin + i / count * TAU;
      world.enemies.push(new StormShard(this.x + Math.cos(a) * 105, this.y + Math.sin(a) * 105, empowered));
    }
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  keepNearArena(dt, dx, dy, d) {
    if (this.mode === "dash" || (this.mode === "chain_dash" && this.chainDashState === "dashing")) return;
    const desired = 430;
    const dir = d < desired ? -0.34 : 0.22;
    this.drift(dx, dy, d, dir, dt);
  }

  drift(dx, dy, d, power, dt) {
    const orbit = Math.sin(state.time * 1.4) * 0.42;
    this.x += (dx / d * power + -dy / d * orbit) * this.speed * dt;
    this.y += (dy / d * power + dx / d * orbit) * this.speed * dt;
  }

  shoot(angle, speed, radius, shape, damage) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * (this.r * 0.75),
      y: this.y + Math.sin(angle) * (this.r * 0.75),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color: this.phaseColor(),
      damage,
      life: 4.8,
      shape,
      spin: Math.random() * TAU,
      bossProjectile: true,
      stormTyrantOwner: this,
    });
  }

  takeDamage(amount, x, y, options = {}) {
    const wasPhase2 = this.phase2;
    super.takeDamage(amount, x, y, options);
    if (!this.enhancedProfile && !wasPhase2 && this.hp > 0 && this.hp < this.maxHp * 0.45) {
      this.phasePulse = 1;
      burst(this.x, this.y, 34, "#b48cff", 260);
      playSfx("wave");
    }
  }

  stormSurge() {
    const count = 24;
    for (let i = 0; i < count; i++) {
      const a = this.ringSpin + i / count * TAU;
      this.shoot(a, 185 + (i % 3) * 24, 5.2, "stormOrb", this.damage * 0.34);
    }
    pulse(this.x, this.y, this.r + 90, this.phaseColor(), 0.34);
    burst(this.x, this.y, 22, "#d9fbff", 220);
    playSfx("wave");
  }

  phaseColor() {
    return this.phase3 ? "#ffd166" : this.phase2 ? "#b48cff" : "#42e8ff";
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.4) * 5));
    drawTelegraph(ctx, this);
    drawStormMantle(ctx, this);
    drawWings(ctx, this);
    drawRings(ctx, this);
    drawCore(ctx, this);
    drawCrown(ctx, this);
    drawFace(ctx, this);
    ctx.restore();
  }
}

class StormShard {
  constructor(x, y, empowered) {
    this.type = "storm_shard";
    this.name = "风暴碎片";
    this.x = x;
    this.y = y;
    this.r = empowered ? 15 : 13;
    this.hp = empowered ? 48 : 34;
    this.maxHp = this.hp;
    this.speed = empowered ? 105 : 88;
    this.damage = empowered ? 12 : 9;
    this.xp = 0;
    this.color = empowered ? "#b48cff" : "#9ff4ff";
    this.dead = false;
    this.flash = 0;
    this.hitTimer = 0;
    this.anim = Math.random() * TAU;
    this.cooldown = 0.7 + Math.random() * 0.4;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.x += dx / d * this.speed * dt;
    this.y += dy / d * this.speed * dt;
    if (this.cooldown <= 0 && d < 520) {
      this.cooldown = 1.1;
      const a = Math.atan2(dy, dx);
      world.enemyProjectiles.push({ x: this.x, y: this.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 4, color: this.color, damage: this.damage, life: 3.2, shape: "stormOrb", spin: Math.random() * TAU });
    }
    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.45;
      playSfx("hurt");
    }
  }

  takeDamage(amount, x, y, options = {}) {
    this.hp -= amount * state.player.damageScale;
    if (!options.statusEffect) {
      this.flash = 1;
      burst(x, y, 4, this.color, 120);
    }
    if (this.hp <= 0) this.kill();
  }

  kill() {
    this.dead = true;
    const i = world.enemies.indexOf(this);
    if (i >= 0) world.enemies.splice(i, 1);
    burst(this.x, this.y, 10, this.color, 160);
    playSfx("hit");
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.anim);
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    polygon(ctx, 0, 0, this.r, 4, Math.PI / 4, true);
    ctx.strokeStyle = "#e9feff";
    ctx.lineWidth = 2;
    polygon(ctx, 0, 0, this.r + 4, 4, Math.PI / 4, false);
    ctx.restore();
  }
}

function drawTelegraph(ctx, e) {
  const chainWindup = e.mode === "chain_dash" && e.chainDashState === "windup";
  if (e.mode !== "windup" && !chainWindup) return;
  const attack = chainWindup ? "chain_dash" : e.currentAttack;
  const alpha = 0.35 + Math.sin(e.anim * 9) * 0.16;
  const color = e.phaseColor();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (attack === "dash" || attack === "chain_dash") {
    ctx.rotate(e.lockAngle);
    ctx.strokeStyle = hex(color, alpha * 0.28);
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(392, 0);
    ctx.stroke();
    ctx.strokeStyle = hex(color, alpha);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(360, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = 72 + i * 48;
      ctx.beginPath();
      ctx.moveTo(x, -18);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x, 18);
      ctx.stroke();
    }
  } else if (attack === "ring" || attack === "tempest_eye") {
    const r = e.r + 30 + Math.sin(e.anim * 8) * 10;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? `rgba(255,255,255,${alpha * 0.42})` : hex(color, alpha * (0.9 - i * 0.18));
      ctx.lineWidth = i === 0 ? 5 : 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r + i * 18, e.ringSpin * (i ? -0.7 : 0.9), e.ringSpin * (i ? -0.7 : 0.9) + Math.PI * 1.62);
      ctx.stroke();
    }
  } else if (attack === "thunder_cage") {
    ctx.strokeStyle = hex(color, alpha);
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 96, -112);
      ctx.lineTo(side * 70, -42);
      ctx.lineTo(side * 92, 18);
      ctx.lineTo(side * 64, 108);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.54})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-58, -86, 116, 172);
  } else {
    ctx.rotate(e.lockAngle);
    ctx.fillStyle = hex(color, alpha * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(280, -72);
    ctx.lineTo(280, 72);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hex(color, alpha * 0.74);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(26, -8);
    ctx.lineTo(288, -74);
    ctx.moveTo(26, 8);
    ctx.lineTo(288, 74);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.46})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const x = 86 + i * 46;
      ctx.beginPath();
      ctx.moveTo(x, -28 + i % 2 * 12);
      ctx.lineTo(x + 28, 0);
      ctx.lineTo(x, 28 - i % 2 * 12);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWings(ctx, e) {
  const color = e.phase3 ? "rgba(255,209,102,0.5)" : e.phase2 ? "rgba(180,140,255,0.46)" : "rgba(66,232,255,0.42)";
  const flap = Math.sin(e.anim * 2.4) * 9;
  ctx.strokeStyle = e.phase3 ? "rgba(255,242,168,0.62)" : e.phase2 ? "rgba(255,255,255,0.5)" : "rgba(217,251,255,0.5)";
  ctx.lineWidth = 2;
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 28, -26);
    ctx.bezierCurveTo(side * (70 + flap), -64, side * (125 + flap), -46, side * (142 + flap), -8);
    ctx.bezierCurveTo(side * (98 + flap), -18, side * (112 + flap), 42, side * 42, 28);
    ctx.bezierCurveTo(side * 52, 10, side * 42, -8, side * 28, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const y = -34 + i * 27;
      ctx.beginPath();
      ctx.moveTo(side * 42, y);
      ctx.quadraticCurveTo(side * (76 + flap), y - 10, side * (118 + flap), y + 2);
      ctx.stroke();
    }
  }
}

function drawRings(ctx, e) {
  const ringColor = e.phaseColor();
  for (let layer = 0; layer < 3; layer++) {
    ctx.save();
    ctx.rotate(e.ringSpin * (layer % 2 ? -1 : 1) * (1 + layer * 0.15));
    ctx.scale(1, 0.78 + layer * 0.07);
    ctx.strokeStyle = layer === 1 ? "rgba(255,255,255,0.62)" : ringColor;
    ctx.lineWidth = layer === 0 ? 3 : 1.7;
    for (let i = 0; i < 9 + layer * 2; i++) {
      const a = i / (9 + layer * 2) * TAU;
      const r = 50 + layer * 15;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + 0.28);
      ctx.stroke();
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (layer !== 2) polygon(ctx, x, y, layer ? 4 : 5, 3, a, true);
    }
    ctx.restore();
  }
}

function drawCore(ctx, e) {
  const flash = e.flash > 0;
  const pulseScale = 1 + Math.sin(e.anim * 3) * 0.05 + e.phasePulse * 0.18;
  ctx.save();
  ctx.scale(pulseScale, pulseScale);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.74, e.r * 0.92, e.r * 0.18, 0, 0, TAU);
  ctx.fill();
  const body = flash ? "#fff" : e.phaseColor();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -e.r * 0.86);
  ctx.bezierCurveTo(e.r * 0.62, -e.r * 0.72, e.r * 0.82, -e.r * 0.05, e.r * 0.55, e.r * 0.48);
  ctx.bezierCurveTo(e.r * 0.26, e.r * 0.86, -e.r * 0.26, e.r * 0.86, -e.r * 0.55, e.r * 0.48);
  ctx.bezierCurveTo(-e.r * 0.82, -e.r * 0.05, -e.r * 0.62, -e.r * 0.72, 0, -e.r * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(3,6,12,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 8, e.r * 0.34, e.r * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : "#d9fbff";
  polygon(ctx, 0, 6, e.r * 0.28, 4, Math.PI / 4 + e.ringSpin, true);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -e.r * 0.86);
  ctx.bezierCurveTo(e.r * 0.62, -e.r * 0.72, e.r * 0.82, -e.r * 0.05, e.r * 0.55, e.r * 0.48);
  ctx.bezierCurveTo(e.r * 0.26, e.r * 0.86, -e.r * 0.26, e.r * 0.86, -e.r * 0.55, e.r * 0.48);
  ctx.bezierCurveTo(-e.r * 0.82, -e.r * 0.05, -e.r * 0.62, -e.r * 0.72, 0, -e.r * 0.86);
  ctx.stroke();
  ctx.restore();
}

function drawCrown(ctx, e) {
  ctx.fillStyle = e.phase3 ? "#fff2a8" : e.phase2 ? "#efe7ff" : "#d9fbff";
  ctx.strokeStyle = e.phaseColor();
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const h = i === 0 ? 34 : i % 2 ? 25 : 18;
    ctx.beginPath();
    ctx.moveTo(i * 14, -e.r - h + Math.sin(e.anim * 2 + i) * 3);
    ctx.lineTo(i * 14 + 8, -e.r + 4);
    ctx.lineTo(i * 14 - 8, -e.r + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawStormMantle(ctx, e) {
  const color = e.phaseColor();
  const a = 0.12 + Math.sin(e.anim * 1.8) * 0.03;
  ctx.fillStyle = `rgba(3,6,18,0.42)`;
  ctx.beginPath();
  ctx.ellipse(0, 18, e.r * 1.18, e.r * 0.92, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const angle = e.ringSpin * (i % 2 ? -0.8 : 0.9) + i * TAU / 5;
    const x = Math.cos(angle) * e.r * (0.62 + i * 0.04);
    const y = Math.sin(angle) * e.r * 0.36;
    ctx.strokeStyle = hex(color, a + i * 0.015);
    ctx.lineWidth = 5 - i * 0.45;
    ctx.beginPath();
    ctx.arc(x * 0.2, y * 0.2, e.r * (0.72 + i * 0.08), angle, angle + Math.PI * 0.9);
    ctx.stroke();
  }
}

function drawFace(ctx, e) {
  const color = e.phase3 ? "#fff2a8" : e.phase2 ? "#ffd166" : "#ffffff";
  const blink = Math.sin(e.eyeBlink) > 0.94 ? 0.18 : 1;
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 16, -12, 7, 4 * blink, side * 0.16, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = e.phase3 ? "#ff7a1a" : e.phase2 ? "#ffd166" : "#d9fbff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 17);
  ctx.quadraticCurveTo(0, 25 + Math.sin(e.anim * 3) * 3, 14, 17);
  ctx.stroke();
}

function hex(color, alpha) {
  const c = color.replace("#", "");
  const n = Number.parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function polygon(ctx, x, y, r, sides, angle, fill) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + i / sides * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}
