import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy } from "./BaseEnemy.js";

export const RIFTBLADE_PHASE_THRESHOLDS = [0.68, 0.34];
export const RIFTBLADE_SCREEN_PRESSURE = Object.freeze({
  dashWarningLength: 1560,
  moonProjectiles: [8, 10, 12],
  bladeRainWaves: 3,
  bladeRainLines: 6,
  bladeRainCorridor: 190,
  judgmentLines: 9,
  peakProjectiles: 96,
});

const PHASE_COLORS = ["#52f7ff", "#c49aff", "#ffcf66"];
const HALF_WORLD = WORLD_SIZE / 2;
const SCREEN_SLASH_LENGTH = RIFTBLADE_SCREEN_PRESSURE.dashWarningLength;

export class RiftbladeSaint extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "霓渊剑圣·断界";
    this.mode = "intro";
    this.modeTimer = 1.1;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.currentSkill = "";
    this.lastSkills = [];
    this.skillCooldowns = Object.create(null);
    this.attacksSinceLongRecover = 0;
    this.sceneSpin = Math.random() * TAU;
    this.swordAngle = -0.55;
    this.lockAngle = 0;
    this.dashDistance = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashTrailTimer = 0;
    this.comboRemaining = 0;
    this.comboStep = 0;
    this.pendingForcedSkill = "";
    this.motion = {
      lastX: state.player.x,
      lastY: state.player.y,
      vx: 0,
      vy: 0,
      straightness: 0.5,
      turn: 0,
    };
    this.stepFromX = x;
    this.stepFromY = y;
    this.stepTargetX = x;
    this.stepTargetY = y;
  }

  update(dt) {
    const p = state.player;
    this.trackPlayerMotion(dt);
    this.tickCooldowns(dt);
    this.anim += dt * (this.phaseLevel === 3 ? 5.2 : this.phaseLevel === 2 ? 4.3 : 3.5);
    this.sceneSpin += dt * (0.8 + this.phaseLevel * 0.42);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.2);
    this.flip = p.x < this.x ? -1 : 1;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== "phase_transition" && d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.6;
      state.shake = Math.max(state.shake, 12);
      state.flash = Math.max(state.flash, 0.26);
      burst(p.x, p.y, 14, this.phaseColor(), 170);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    this.modeTimer -= dt;
    if (this.mode === "intro") {
      this.driftToIdealRange(dt, 0.14);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "phase_transition") {
      this.moveToward(0, 0, this.speed * 0.42, dt);
      if (this.modeTimer <= 0) {
        const forced = this.pendingForcedSkill;
        this.pendingForcedSkill = "";
        this.beginSkill(forced);
      }
      return;
    }
    if (this.mode === "windup") {
      this.driftToIdealRange(dt, -0.08);
      if (this.modeTimer <= 0) this.launchSkill(this.currentSkill);
      return;
    }
    if (this.mode === "riftblade_dash") return this.updateDash(dt, 0.82);
    if (this.mode === "riftblade_shadow_step") return this.updateShadowStep(dt);
    if (this.mode === "riftblade_mirror_combo") return this.updateMirrorCombo(dt);
    if (this.mode === "riftblade_final_combo") return this.updateFinalCombo(dt);
    if (this.mode === "riftblade_cross" || this.mode === "riftblade_blade_rain") {
      this.driftToIdealRange(dt, 0.08);
      if (this.modeTimer <= 0) this.finishAttack();
      return;
    }
    if (this.mode === "riftblade_sword_array" || this.mode === "riftblade_judgment") {
      this.moveToward(0, 0, this.speed * 0.72, dt);
      if (this.modeTimer <= 0) this.finishAttack(this.mode === "riftblade_judgment" ? 1.4 : 1.2, true);
      return;
    }
    if (this.mode === "riftblade_recover") {
      this.swordAngle += (-0.72 - this.swordAngle) * Math.min(1, dt * 7);
      if (this.modeTimer <= 0) this.chooseSkill();
    }
  }

  chooseSkill() {
    const p = state.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y)) / HALF_WORLD;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const scores = {
      flash_draw: 4 + (d > 430 ? 3.4 : 0) + this.motion.straightness * 2.2,
      moon_return: 4.2 + (d >= 210 && d <= 620 ? 2 : 0) + Math.abs(this.motion.turn) * 1.2,
      shadow_step: 1.6 + (d < 190 ? 4 : 0) + (edge > 0.82 ? 5 : 0),
    };
    if (this.phaseLevel >= 2) {
      scores.mirror_combo = 4.3 + (speed > 120 ? 1.6 : 0) + this.motion.straightness * 1.4;
      scores.cross_rift = 4.5 + Math.abs(this.motion.turn) * 3 + (d < 520 ? 1 : 0);
      scores.eight_gate = 2.4 + (edge > 0.68 ? 2.4 : 0);
    }
    if (this.phaseLevel >= 3) {
      scores.final_combo = 5.1 + (d > 260 ? 1.2 : 0);
      scores.blade_rain = 4.7 + (speed > 90 ? 1.8 : 0);
      scores.judgment = 2.8 + this.motion.straightness * 1.4;
    }

    let best = "flash_draw";
    let bestScore = -Infinity;
    for (const [skill, baseScore] of Object.entries(scores)) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      let score = baseScore + Math.random() * 0.7;
      if (this.lastSkills[0] === skill) score -= 100;
      else if (this.lastSkills.includes(skill)) score -= 1.8;
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    this.beginSkill(best);
  }

  beginSkill(skill) {
    this.currentSkill = skill || "flash_draw";
    this.mode = "windup";
    const windups = {
      flash_draw: 0.7,
      moon_return: 0.55,
      shadow_step: 0.32,
      mirror_combo: 0.18,
      cross_rift: 0.25,
      eight_gate: 0.35,
      final_combo: 0.25,
      blade_rain: 0.35,
      judgment: 0.45,
    };
    this.modeTimer = windups[this.currentSkill] || 0.45;
    if (this.currentSkill === "flash_draw") this.prepareDashLine(this.modeTimer, 0.35, 120, "draw");
    pulse(this.x, this.y, this.r + 34, this.phaseColor(), 0.22);
  }

  launchSkill(skill) {
    this.rememberSkill(skill);
    if (skill === "flash_draw") return this.launchDash();
    if (skill === "moon_return") return this.launchMoonReturn();
    if (skill === "shadow_step") return this.launchShadowStep();
    if (skill === "mirror_combo") return this.launchMirrorCombo();
    if (skill === "cross_rift") return this.launchCrossRift();
    if (skill === "eight_gate") return this.launchEightGate();
    if (skill === "final_combo") return this.launchFinalCombo();
    if (skill === "blade_rain") return this.launchBladeRain();
    if (skill === "judgment") return this.launchJudgment();
    this.finishAttack();
  }

  launchDash() {
    this.mode = "riftblade_dash";
    this.modeTimer = 0.38;
    const speed = this.dashDistance / this.modeTimer;
    this.dashVx = Math.cos(this.lockAngle) * speed;
    this.dashVy = Math.sin(this.lockAngle) * speed;
    this.dashTrailTimer = 0;
    this.swordAngle = 0.18;
    burst(this.x, this.y, 18, this.phaseColor(), 230);
    playSfx("wave");
  }

  launchMoonReturn() {
    const base = this.angleToPredictedPlayer(0.22);
    const count = RIFTBLADE_SCREEN_PRESSURE.moonProjectiles[this.phaseLevel - 1];
    const offsets = spreadWithCenterGap(count, 1.08, 0.18);
    offsets.forEach((offset, index) => {
      const side = offset < 0 ? -1 : 1;
      this.shootCrescent(base + offset, side, 310 + (index % 3) * 18, this.damage * 0.36, true, {
        radius: 14,
        curveScale: 1.18,
        life: 4.25,
        returnAt: 3.12,
      });
    });
    this.swordAngle = 0.62;
    pulse(this.x, this.y, 128, this.phaseColor(), 0.32);
    playSfx("shoot");
    this.finishAttack(0.72);
  }

  launchShadowStep() {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const sides = [-1, 1].map((side) => ({
      side,
      x: clamp(this.x - dy / d * side * 235 - dx / d * 35, -HALF_WORLD + 90, HALF_WORLD - 90),
      y: clamp(this.y + dx / d * side * 235 - dy / d * 35, -HALF_WORLD + 90, HALF_WORLD - 90),
    }));
    const target = sides.sort((a, b) => this.edgeSafety(b.x, b.y) - this.edgeSafety(a.x, a.y))[0];
    this.stepFromX = this.x;
    this.stepFromY = this.y;
    this.stepTargetX = target.x;
    this.stepTargetY = target.y;
    this.mode = "riftblade_shadow_step";
    this.modeTimer = 0.38;
    this.skillCooldowns.shadow_step = 1.8;
    playSfx("wave");
  }

  updateShadowStep(dt) {
    const t = 1 - Math.max(0, this.modeTimer) / 0.38;
    const eased = 1 - (1 - t) ** 3;
    const oldX = this.x;
    const oldY = this.y;
    this.x = this.stepFromX + (this.stepTargetX - this.stepFromX) * eased;
    this.y = this.stepFromY + (this.stepTargetY - this.stepFromY) * eased;
    trail(this.x, this.y, oldX, oldY, this.phaseColor(), 13);
    if (this.modeTimer <= 0) this.finishAttack(0.44, false, false);
  }

  launchMirrorCombo() {
    this.mode = "riftblade_mirror_combo";
    this.comboRemaining = 3;
    this.comboStep = 0;
    this.beginMirrorWindup();
  }

  beginMirrorWindup() {
    this.comboStep = 0;
    this.modeTimer = 0.46;
    this.prepareDashLine(0.46, 0.28, 105, "mirror");
  }

  updateMirrorCombo(dt) {
    if (this.comboStep === 0) {
      if (this.modeTimer <= 0) {
        this.comboStep = 1;
        this.modeTimer = 0.3;
        const speed = this.dashDistance / this.modeTimer;
        this.dashVx = Math.cos(this.lockAngle) * speed;
        this.dashVy = Math.sin(this.lockAngle) * speed;
        this.dashTrailTimer = 0;
        playSfx("wave");
      }
      return;
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt, 10);
    if (this.modeTimer > 0) return;
    this.addSlashLine(
      this.x - Math.cos(this.lockAngle) * this.dashDistance * 0.5,
      this.y - Math.sin(this.lockAngle) * this.dashDistance * 0.5,
      this.lockAngle,
      Math.max(SCREEN_SLASH_LENGTH, this.dashDistance + 360),
      30,
      0.55,
      0.2,
      this.damage * 0.42,
      "afterimage",
    );
    this.spawnCrescentFan(this.lockAngle + Math.PI, 6, 0.95, 350, this.damage * 0.22, 0.16);
    this.comboRemaining--;
    if (this.comboRemaining <= 0) {
      this.skillCooldowns.mirror_combo = 5.2;
      this.finishAttack(1.0, true);
    } else {
      this.beginMirrorWindup();
    }
  }

  launchCrossRift() {
    const center = this.predictedPlayer(0.25);
    const angle = Math.hypot(this.motion.vx, this.motion.vy) > 25 ? Math.atan2(this.motion.vy, this.motion.vx) : this.angleToPredictedPlayer(0);
    [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].forEach((offset, index) => {
      this.addSlashLine(
        center.x,
        center.y,
        angle + offset,
        WORLD_SIZE * 1.28,
        index < 2 ? 31 : 27,
        0.9 + index * 0.43,
        0.2,
        this.damage * (index < 2 ? 0.54 : 0.46),
        "cross",
        true,
      );
    });
    this.mode = "riftblade_cross";
    this.modeTimer = 2.42;
    this.skillCooldowns.cross_rift = 5.2;
    playSfx("wave");
  }

  launchEightGate() {
    const center = this.predictedPlayer(0.18);
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 25 ? Math.atan2(this.motion.vy, this.motion.vx) : this.sceneSpin;
    const halfGap = 116;
    for (let i = 0; i < 6; i++) {
      const angle = base + i * Math.PI / 3;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      for (const side of [-1, 1]) {
        this.addSlashLine(
          center.x + nx * halfGap * side,
          center.y + ny * halfGap * side,
          angle,
          WORLD_SIZE * 1.3,
          28,
          0.95 + i * 0.44,
          0.2,
          this.damage * 0.5,
          "gate",
          true,
        );
      }
    }
    this.mode = "riftblade_sword_array";
    this.modeTimer = 3.55;
    this.skillCooldowns.eight_gate = 13;
    this.attacksSinceLongRecover = 0;
    playSfx("level");
  }

  launchFinalCombo() {
    this.mode = "riftblade_final_combo";
    this.comboStep = 0;
    this.modeTimer = 0.55;
    this.prepareDashLine(0.55, 0.32, 125, "final");
  }

  updateFinalCombo(dt) {
    if (this.comboStep === 0 && this.modeTimer <= 0) {
      this.comboStep = 1;
      this.modeTimer = 0.32;
      const speed = this.dashDistance / this.modeTimer;
      this.dashVx = Math.cos(this.lockAngle) * speed;
      this.dashVy = Math.sin(this.lockAngle) * speed;
      this.dashTrailTimer = 0;
      playSfx("wave");
      return;
    }
    if (this.comboStep === 1) {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      this.leaveDashTrail(dt, 12);
      if (this.modeTimer > 0) return;
      const center = this.predictedPlayer(0.18);
      const angle = Math.atan2(center.y - this.y, center.x - this.x);
      [-0.72, 0.72, -Math.PI / 2, Math.PI / 2].forEach((offset, index) => {
        this.addSlashLine(
          center.x,
          center.y,
          angle + offset,
          WORLD_SIZE * 1.26,
          29,
          0.52 + index * 0.34,
          0.2,
          this.damage * 0.48,
          "final_cross",
          true,
        );
      });
      this.comboStep = 2;
      this.modeTimer = 1.72;
      return;
    }
    if (this.comboStep === 2 && this.modeTimer <= 0) {
      const base = this.angleToPredictedPlayer(0.16);
      this.spawnCrescentFan(base, 18, 2.45, 365, this.damage * 0.25, 0.2);
      this.skillCooldowns.final_combo = 7;
      this.finishAttack(1.15, true);
    }
  }

  launchBladeRain() {
    const center = this.predictedPlayer(0.38);
    const playerRadius = state.player.r || 14;
    const width = 31;
    const halfGap = (RIFTBLADE_SCREEN_PRESSURE.bladeRainCorridor + (width + playerRadius) * 2) * 0.5;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const baseAngle = speed > 18
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const rotations = [0, Math.PI / 3, -Math.PI / 3];
    for (let wave = 0; wave < RIFTBLADE_SCREEN_PRESSURE.bladeRainWaves; wave++) {
      const angle = baseAngle + rotations[wave];
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const halfLength = WORLD_SIZE * 0.66;
      const lines = [-halfGap, halfGap].map((offset) => {
        const cx = center.x + nx * offset;
        const cy = center.y + ny * offset;
        return {
          x1: cx - Math.cos(angle) * halfLength,
          y1: cy - Math.sin(angle) * halfLength,
          x2: cx + Math.cos(angle) * halfLength,
          y2: cy + Math.sin(angle) * halfLength,
        };
      });
      this.addBladeFallWave(center.x, center.y, lines, 0.82 + wave * 0.5, width);
    }
    this.mode = "riftblade_blade_rain";
    this.modeTimer = 2.28;
    this.skillCooldowns.blade_rain = 6.2;
    playSfx("level");
  }

  launchJudgment() {
    const center = this.predictedPlayer(0.35);
    const angle = Math.hypot(this.motion.vx, this.motion.vy) > 20 ? Math.atan2(this.motion.vy, this.motion.vx) : this.sceneSpin;
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * 238;
      this.addSlashLine(center.x + normalX * offset, center.y + normalY * offset, angle, WORLD_SIZE * 1.3, 31, 1 + i * 0.42, 0.2, this.damage * 0.58, "judgment", true);
    }
    [Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75].forEach((offset, index) => {
      this.addSlashLine(
        center.x,
        center.y,
        angle + offset,
        WORLD_SIZE * 1.26,
        32,
        3.15 + index * 0.4,
        0.2,
        this.damage * 0.62,
        "judgment_cross",
        true,
      );
    });
    this.spawnCrescentRingWithGap(center.x, center.y, angle + Math.PI, 24, 0.42, 235, this.damage * 0.2);
    this.mode = "riftblade_judgment";
    this.modeTimer = 4.68;
    this.skillCooldowns.judgment = 17;
    this.attacksSinceLongRecover = 0;
    state.shake = Math.max(state.shake, 7);
    playSfx("level");
  }

  updateDash(dt, damageScale) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt, 13, damageScale);
    if (this.modeTimer <= 0) {
      this.spawnCrescentFan(this.lockAngle + Math.PI, 8, 1.3, 350, this.damage * 0.22, 0.18);
      this.finishAttack(0.68);
    }
  }

  prepareDashLine(armTime, prediction, overshoot, style) {
    const target = this.predictedPlayer(prediction);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.lockAngle = Math.atan2(dy, dx);
    this.dashDistance = clamp(Math.hypot(dx, dy) + overshoot, 620, 980);
    const cx = this.x + Math.cos(this.lockAngle) * this.dashDistance * 0.5;
    const cy = this.y + Math.sin(this.lockAngle) * this.dashDistance * 0.5;
    this.addSlashLine(
      cx,
      cy,
      this.lockAngle,
      Math.max(SCREEN_SLASH_LENGTH, this.dashDistance + 360),
      style === "final" ? 34 : 30,
      armTime,
      0.22,
      this.damage * (style === "final" ? 0.68 : 0.58),
      style,
    );
  }

  leaveDashTrail(dt, width = 12, damageScale = 0) {
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer > 0) return;
    this.dashTrailTimer = 0.045;
    trail(this.x, this.y, this.x - this.dashVx * 0.045, this.y - this.dashVy * 0.045, this.phaseColor(), width);
    if (damageScale > 0) {
      world.hazards.push({
        kind: "riftblade_echo",
        x: this.x,
        y: this.y,
        r: 24,
        color: this.phaseColor(),
        damage: this.damage * damageScale * 0.22,
        life: 0.18,
        maxLife: 0.18,
        riftbladeOwner: this,
      });
    }
  }

  addSlashLine(x, y, angle, length, width, armTime, activeTime, damage, style, sceneBlade = false) {
    world.hazards.push({
      kind: "riftblade_slash",
      x,
      y,
      angle,
      length,
      width,
      r: width,
      color: this.phaseColor(),
      damage,
      armTime,
      armDuration: armTime,
      damageDelay: 0.05,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      activeTime,
      style,
      sceneBlade,
      riftbladeOwner: this,
    });
  }

  addBladeFallWave(x, y, lines, armTime, width) {
    world.hazards.push({
      kind: "riftblade_bladefall",
      warningType: "line",
      x,
      y,
      lines,
      width,
      r: width,
      color: this.phaseColor(),
      damage: this.damage * 0.46,
      armTime,
      armDuration: armTime,
      life: armTime + 0.24,
      maxLife: armTime + 0.24,
      activeTime: 0.24,
      style: "blade_corridor",
      riftbladeOwner: this,
    });
  }

  shootCrescent(angle, side, speed, damage, returning = true, options = {}) {
    if (this.ownedProjectileCount() >= RIFTBLADE_SCREEN_PRESSURE.peakProjectiles) return;
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * 54,
      y: this.y + Math.sin(angle) * 54,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: options.radius || 13,
      color: this.phaseColor(),
      damage,
      life: options.life || (returning ? 3.7 : 3.15),
      returnAt: options.returnAt ?? (returning ? 2.8 : -1),
      curve: side * 0.28 * (options.curveScale ?? 1),
      returnCurve: side * 2.4 * (options.curveScale ?? 1),
      returning,
      shape: "riftbladeCrescent",
      spin: angle,
      bossProjectile: true,
      expireWithLife: true,
      riftbladeOwner: this,
    });
  }

  spawnCrescentFan(baseAngle, count, spread, speed, damage, centerGap = 0) {
    const offsets = spreadWithCenterGap(count, spread, centerGap);
    offsets.forEach((offset, index) => {
      this.shootCrescent(
        baseAngle + offset,
        offset < 0 ? -1 : 1,
        speed + (index % 3 - 1) * 16,
        damage,
        false,
        { curveScale: 0.35, life: 3.35 },
      );
    });
  }

  spawnCrescentRingWithGap(x, y, gapAngle, count, gapWidth, speed, damage) {
    for (let i = 0; i < count; i++) {
      if (this.ownedProjectileCount() >= RIFTBLADE_SCREEN_PRESSURE.peakProjectiles) break;
      const angle = i / count * TAU + this.sceneSpin * 0.16;
      if (Math.abs(wrapAngle(angle - gapAngle)) < gapWidth * 0.5) continue;
      world.enemyProjectiles.push({
        x: x + Math.cos(angle) * 38,
        y: y + Math.sin(angle) * 38,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 11,
        color: this.phaseColor(),
        damage,
        life: 4.2,
        returnAt: -1,
        curve: (i % 2 ? 1 : -1) * 0.055,
        returnCurve: 0,
        returning: false,
        shape: "riftbladeCrescent",
        spin: angle,
        bossProjectile: true,
        expireWithLife: true,
        riftbladeOwner: this,
      });
    }
  }

  ownedProjectileCount() {
    return world.enemyProjectiles.reduce(
      (count, projectile) => count + (projectile.riftbladeOwner === this ? 1 : 0),
      0,
    );
  }

  finishAttack(recovery = null, forceLong = false, countAttack = true) {
    if (countAttack) this.attacksSinceLongRecover++;
    const long = forceLong || this.attacksSinceLongRecover >= 2;
    this.mode = "riftblade_recover";
    this.modeTimer = recovery ?? (long ? 1.02 : 0.46);
    if (long) this.attacksSinceLongRecover = 0;
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
    const cooldowns = {
      flash_draw: 1.8,
      moon_return: 2.2,
      shadow_step: 1.8,
      mirror_combo: 5.2,
      cross_rift: 4.4,
      eight_gate: 13,
      final_combo: 6.2,
      blade_rain: 5.6,
      judgment: 16,
    };
    this.skillCooldowns[skill] = Math.max(this.skillCooldowns[skill] || 0, cooldowns[skill] || 1.5);
  }

  tickCooldowns(dt) {
    for (const skill of Object.keys(this.skillCooldowns)) this.skillCooldowns[skill] = Math.max(0, this.skillCooldowns[skill] - dt);
  }

  trackPlayerMotion(dt) {
    const p = state.player;
    const safeDt = Math.max(0.001, dt);
    const rawVx = clamp((p.x - this.motion.lastX) / safeDt, -520, 520);
    const rawVy = clamp((p.y - this.motion.lastY) / safeDt, -520, 520);
    const oldVx = this.motion.vx;
    const oldVy = this.motion.vy;
    const blend = Math.min(1, dt * 7);
    this.motion.vx += (rawVx - this.motion.vx) * blend;
    this.motion.vy += (rawVy - this.motion.vy) * blend;
    const oldSpeed = Math.hypot(oldVx, oldVy);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    if (oldSpeed > 20 && speed > 20) {
      const dot = (oldVx * this.motion.vx + oldVy * this.motion.vy) / (oldSpeed * speed);
      const cross = (oldVx * this.motion.vy - oldVy * this.motion.vx) / (oldSpeed * speed);
      this.motion.straightness += ((dot + 1) * 0.5 - this.motion.straightness) * Math.min(1, dt * 3.5);
      this.motion.turn += (cross - this.motion.turn) * Math.min(1, dt * 4);
    }
    this.motion.lastX = p.x;
    this.motion.lastY = p.y;
  }

  predictedPlayer(seconds) {
    const p = state.player;
    return {
      x: clamp(p.x + this.motion.vx * seconds, -HALF_WORLD + 60, HALF_WORLD - 60),
      y: clamp(p.y + this.motion.vy * seconds, -HALF_WORLD + 60, HALF_WORLD - 60),
    };
  }

  angleToPredictedPlayer(seconds) {
    const target = this.predictedPlayer(seconds);
    return Math.atan2(target.y - this.y, target.x - this.x);
  }

  driftToIdealRange(dt, bias = 0) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const radial = d < 220 ? -0.46 : d > 360 ? 0.34 : bias;
    const orbit = (this.motion.turn >= 0 ? -1 : 1) * 0.34;
    this.x += (dx / d * radial - dy / d * orbit) * this.speed * dt;
    this.y += (dy / d * radial + dx / d * orbit) * this.speed * dt;
  }

  moveToward(x, y, speed, dt) {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (d < 8) return;
    this.x += dx / d * speed * dt;
    this.y += dy / d * speed * dt;
  }

  edgeSafety(x, y) {
    return Math.min(HALF_WORLD - Math.abs(x), HALF_WORLD - Math.abs(y));
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.mode === "phase_transition" || this.dead) return;
    const threshold = this.phaseLevel <= 2 ? this.maxHp * RIFTBLADE_PHASE_THRESHOLDS[this.phaseLevel - 1] : null;
    if (threshold != null && this.hp > threshold) {
      const factor = (this.shielded ? 0.35 : 1) * state.player.damageScale;
      const maxRawDamage = (this.hp - threshold + (this.defense || 0)) / Math.max(0.001, factor);
      super.takeDamage(Math.min(amount, maxRawDamage), x, y, options);
      if (!this.dead && this.hp <= threshold + 0.01) {
        this.hp = threshold;
        this.startPhaseTransition(this.phaseLevel + 1);
      }
      return;
    }
    super.takeDamage(amount, x, y, options);
  }

  startPhaseTransition(nextPhase) {
    this.phaseLevel = nextPhase;
    this.mode = "phase_transition";
    this.modeTimer = 1.2;
    this.currentSkill = "";
    this.pendingForcedSkill = nextPhase === 2 ? "eight_gate" : "judgment";
    this.phasePulse = 1;
    this.attacksSinceLongRecover = 0;
    this.clearOwnedEffects();
    burst(this.x, this.y, nextPhase === 3 ? 52 : 40, this.phaseColor(), 300);
    pulse(this.x, this.y, this.r + 145, this.phaseColor(), 0.5);
    state.shake = Math.max(state.shake, nextPhase === 3 ? 13 : 9);
    state.flash = Math.max(state.flash, 0.3);
    playSfx("wave");
  }

  clearOwnedEffects() {
    for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
      if (world.enemyProjectiles[i].riftbladeOwner === this) world.enemyProjectiles.splice(i, 1);
    }
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].riftbladeOwner === this) world.hazards.splice(i, 1);
    }
  }

  kill() {
    this.clearOwnedEffects();
    super.kill();
  }

  phaseColor() {
    return PHASE_COLORS[this.phaseLevel - 1];
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    drawSceneVeil(ctx, this);
    drawSkillTelegraph(ctx, this);
    drawRiftbladeSaint(ctx, this);
    ctx.restore();
  }
}

function drawSceneVeil(ctx, e) {
  if (e.mode !== "riftblade_sword_array" && e.mode !== "riftblade_judgment" && !(e.mode === "phase_transition" && e.phaseLevel === 3)) return;
  const alpha = e.mode === "riftblade_judgment" ? 0.2 : 0.1;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(3,4,12,${alpha})`;
  ctx.fillRect(-HALF_WORLD - e.x, -HALF_WORLD - e.y, WORLD_SIZE, WORLD_SIZE);
  ctx.restore();
}

function drawSkillTelegraph(ctx, e) {
  if (e.mode !== "windup") return;
  const pulseAlpha = 0.42 + Math.sin(e.anim * 12) * 0.18;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(e.phaseColor(), pulseAlpha);
  ctx.lineWidth = 3;
  if (e.currentSkill === "moon_return") {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, 84 + side * 9, -1.35, 1.35);
      ctx.stroke();
    }
  } else if (e.currentSkill === "shadow_step") {
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, 116, e.sceneSpin, e.sceneSpin + Math.PI * 1.4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 30 + Math.sin(e.anim * 8) * 7, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRiftbladeSaint(ctx, e) {
  const color = e.phaseColor();
  const bob = Math.sin(e.anim * 1.35) * 2.5;
  ctx.translate(0, bob);
  ctx.scale(e.flip, 1);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(color, 0.22);
  ctx.lineWidth = 3;
  for (let i = 0; i < e.phaseLevel + 1; i++) {
    ctx.beginPath();
    ctx.arc(0, -8, 62 + i * 10, e.sceneSpin * (i % 2 ? -1 : 1) + i, e.sceneSpin * (i % 2 ? -1 : 1) + i + 1.5);
    ctx.stroke();
  }
  if (e.phaseLevel >= 2) drawSwordHalo(ctx, e, color);
  ctx.globalCompositeOperation = "source-over";

  drawScarf(ctx, e, color);
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#090d19";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  polygon(ctx, [[-23, -28], [0, -43], [25, -27], [31, 16], [18, 39], [-20, 39], [-31, 12]]);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#171d2d";
  ctx.strokeStyle = rgba(color, 0.78);
  ctx.lineWidth = 2;
  polygon(ctx, [[-31, -22], [-46, -8], [-39, 15], [-25, 7]]);
  ctx.fill(); ctx.stroke();
  polygon(ctx, [[29, -23], [46, -5], [38, 16], [24, 7]]);
  ctx.fill(); ctx.stroke();
  ctx.fillRect(-24, 19, 18, 25);
  ctx.fillRect(7, 19, 18, 25);

  ctx.fillStyle = "#050813";
  ctx.strokeStyle = "#8590aa";
  polygon(ctx, [[-20, -39], [0, -51], [21, -38], [17, -14], [-17, -14]]);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillRect(-15, -33, 30, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(3, -33, 8, 2);
  ctx.shadowBlur = 0;

  drawSword(ctx, e, color);
  if (e.phasePulse > 0) {
    ctx.strokeStyle = rgba(color, e.phasePulse * 0.8);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 72 + (1 - e.phasePulse) * 100, 0, TAU);
    ctx.stroke();
  }
}

function drawSwordHalo(ctx, e, color) {
  const count = e.phaseLevel === 3 ? 8 : 4;
  for (let i = 0; i < count; i++) {
    const a = e.sceneSpin + i / count * TAU;
    const x = Math.cos(a) * 70;
    const y = Math.sin(a) * 38 - 7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = rgba(color, 0.32);
    polygon(ctx, [[0, -15], [4, 2], [0, 11], [-4, 2]]);
    ctx.fill();
    ctx.restore();
  }
}

function drawScarf(ctx, e, color) {
  const sway = Math.sin(e.anim * 2.6) * 9;
  ctx.fillStyle = rgba(color, e.phaseLevel === 3 ? 0.62 : 0.42);
  ctx.beginPath();
  ctx.moveTo(-15, -25);
  ctx.quadraticCurveTo(-55, -16 + sway, -88, -4 - sway * 0.3);
  ctx.lineTo(-73, 8 - sway * 0.2);
  ctx.quadraticCurveTo(-43, -1 + sway, -10, -13);
  ctx.closePath();
  ctx.fill();
}

function drawSword(ctx, e, color) {
  ctx.save();
  ctx.translate(24, 4);
  const attackTilt = e.mode.includes("dash") || e.mode.includes("combo") ? 0.28 : e.swordAngle;
  ctx.rotate(attackTilt);
  ctx.fillStyle = "#252d3f";
  ctx.strokeStyle = "#aeb8cc";
  ctx.lineWidth = 2;
  ctx.fillRect(-9, -6, 18, 12);
  ctx.strokeRect(-9, -6, 18, 12);
  ctx.fillStyle = "#0b101d";
  ctx.fillRect(-4, 3, 8, 28);
  ctx.strokeStyle = color;
  ctx.strokeRect(-4, 3, 8, 28);
  ctx.shadowColor = color;
  ctx.shadowBlur = e.phaseLevel === 3 ? 20 : 12;
  ctx.fillStyle = rgba(color, 0.92);
  polygon(ctx, [[-5, -8], [-2, -82 - e.phaseLevel * 8], [3, -96 - e.phaseLevel * 8], [7, -8]]);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  polygon(ctx, [[0, -12], [1, -82 - e.phaseLevel * 8], [3, -91 - e.phaseLevel * 8], [3, -12]]);
  ctx.fill();
  ctx.restore();
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function spreadWithCenterGap(count, spread, centerGap = 0) {
  if (count <= 1) return [0];
  const half = spread * 0.5;
  const values = [];
  for (let i = 0; i < count; i++) {
    const offset = -half + i / (count - 1) * spread;
    values.push(Math.abs(offset) < centerGap ? (offset < 0 ? -centerGap : centerGap) : offset);
  }
  return values;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const num = Number.parseInt(value, 16);
  return `rgba(${num >> 16},${num >> 8 & 255},${num & 255},${alpha})`;
}
