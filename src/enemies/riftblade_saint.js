import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy } from "./BaseEnemy.js";

export const RIFTBLADE_PHASE_THRESHOLDS = [0.68, 0.34];

const PHASE_COLORS = ["#52f7ff", "#c49aff", "#ffcf66"];
const HALF_WORLD = WORLD_SIZE / 2;

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
    for (const side of [-1, 1]) {
      const angle = base + side * 0.24;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(angle) * 54,
        y: this.y + Math.sin(angle) * 54,
        vx: Math.cos(angle) * 290,
        vy: Math.sin(angle) * 290,
        r: 15,
        color: this.phaseColor(),
        damage: this.damage * 0.52,
        life: 3.8,
        returnAt: 2.9,
        curve: side * 0.42,
        returnCurve: side * 2.7,
        returning: true,
        shape: "riftbladeCrescent",
        spin: angle,
        bossProjectile: true,
        expireWithLife: true,
        riftbladeOwner: this,
      });
    }
    this.swordAngle = 0.62;
    pulse(this.x, this.y, 88, this.phaseColor(), 0.28);
    playSfx("shoot");
    this.finishAttack();
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
    this.addSlashLine(this.x - Math.cos(this.lockAngle) * this.dashDistance * 0.5, this.y - Math.sin(this.lockAngle) * this.dashDistance * 0.5, this.lockAngle, this.dashDistance + 120, 24, 0.55, 0.2, this.damage * 0.42, "afterimage");
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
    this.addSlashLine(center.x, center.y, angle, 1700, 28, 0.85, 0.22, this.damage * 0.58, "cross");
    this.addSlashLine(center.x, center.y, angle + Math.PI / 2, 1700, 28, 1.3, 0.22, this.damage * 0.58, "cross");
    this.mode = "riftblade_cross";
    this.modeTimer = 1.58;
    this.skillCooldowns.cross_rift = 4.4;
    playSfx("wave");
  }

  launchEightGate() {
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 25 ? Math.atan2(this.motion.vy, this.motion.vx) : this.sceneSpin;
    for (let i = 0; i < 8; i++) {
      const angle = base + i * Math.PI / 4;
      this.addSlashLine(0, 0, angle, WORLD_SIZE * 1.28, 27, 0.9 + i * 0.32, 0.2, this.damage * 0.54, "gate", true);
    }
    this.mode = "riftblade_sword_array";
    this.modeTimer = 3.42;
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
      this.addSlashLine(center.x, center.y, angle + 0.72, 1250, 26, 0.45, 0.2, this.damage * 0.5, "final_cross");
      this.addSlashLine(center.x, center.y, angle - 0.72, 1250, 26, 0.8, 0.2, this.damage * 0.5, "final_cross");
      this.comboStep = 2;
      this.modeTimer = 1.08;
      return;
    }
    if (this.comboStep === 2 && this.modeTimer <= 0) {
      const base = this.angleToPredictedPlayer(0.16);
      for (const offset of [-0.52, -0.34, -0.17, 0.17, 0.34, 0.52]) this.shootCrescent(base + offset, Math.sign(offset) || 1, 330, this.damage * 0.38, false);
      this.skillCooldowns.final_combo = 6.2;
      this.finishAttack(1.05, true);
    }
  }

  launchBladeRain() {
    const p = this.predictedPlayer(0.42);
    const speed = Math.max(1, Math.hypot(this.motion.vx, this.motion.vy));
    const nx = speed > 15 ? this.motion.vx / speed : 1;
    const ny = speed > 15 ? this.motion.vy / speed : 0;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lane = 65 + Math.floor(i / 2) * 42;
      const x = clamp(p.x + nx * i * 34 - ny * side * lane, -HALF_WORLD + 70, HALF_WORLD - 70);
      const y = clamp(p.y + ny * i * 34 + nx * side * lane, -HALF_WORLD + 70, HALF_WORLD - 70);
      this.addBladeFall(x, y, 0.75 + i * 0.27);
    }
    this.mode = "riftblade_blade_rain";
    this.modeTimer = 2.38;
    this.skillCooldowns.blade_rain = 5.6;
    playSfx("level");
  }

  launchJudgment() {
    const center = this.predictedPlayer(0.35);
    const angle = Math.hypot(this.motion.vx, this.motion.vy) > 20 ? Math.atan2(this.motion.vy, this.motion.vx) : this.sceneSpin;
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 240;
      this.addSlashLine(center.x + normalX * offset, center.y + normalY * offset, angle, WORLD_SIZE * 1.28, 30, 0.95 + i * 0.45, 0.22, this.damage * 0.64, "judgment", true);
    }
    this.addSlashLine(center.x, center.y, angle + Math.PI / 4, WORLD_SIZE * 1.22, 31, 2.45, 0.22, this.damage * 0.68, "judgment_cross", true);
    this.addSlashLine(center.x, center.y, angle - Math.PI / 4, WORLD_SIZE * 1.22, 31, 2.8, 0.22, this.damage * 0.68, "judgment_cross", true);
    this.mode = "riftblade_judgment";
    this.modeTimer = 3.08;
    this.skillCooldowns.judgment = 16;
    this.attacksSinceLongRecover = 0;
    state.shake = Math.max(state.shake, 7);
    playSfx("level");
  }

  updateDash(dt, damageScale) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt, 13, damageScale);
    if (this.modeTimer <= 0) this.finishAttack();
  }

  prepareDashLine(armTime, prediction, overshoot, style) {
    const target = this.predictedPlayer(prediction);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.lockAngle = Math.atan2(dy, dx);
    this.dashDistance = clamp(Math.hypot(dx, dy) + overshoot, 300, 650);
    const cx = this.x + Math.cos(this.lockAngle) * this.dashDistance * 0.5;
    const cy = this.y + Math.sin(this.lockAngle) * this.dashDistance * 0.5;
    this.addSlashLine(cx, cy, this.lockAngle, this.dashDistance + 120, style === "final" ? 30 : 26, armTime, 0.22, this.damage * (style === "final" ? 0.68 : 0.58), style);
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
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      activeTime,
      style,
      sceneBlade,
      riftbladeOwner: this,
    });
  }

  addBladeFall(x, y, armTime) {
    world.hazards.push({
      kind: "riftblade_bladefall",
      warningType: "circle",
      x,
      y,
      r: 44,
      color: this.phaseColor(),
      damage: this.damage * 0.46,
      armTime,
      armDuration: armTime,
      life: armTime + 0.24,
      maxLife: armTime + 0.24,
      riftbladeOwner: this,
    });
  }

  shootCrescent(angle, side, speed, damage, returning = true) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * 54,
      y: this.y + Math.sin(angle) * 54,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 13,
      color: this.phaseColor(),
      damage,
      life: returning ? 3.7 : 2.8,
      returnAt: returning ? 2.8 : -1,
      curve: side * 0.28,
      returnCurve: side * 2.4,
      returning,
      shape: "riftbladeCrescent",
      spin: angle,
      bossProjectile: true,
      expireWithLife: true,
      riftbladeOwner: this,
    });
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

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const num = Number.parseInt(value, 16);
  return `rgba(${num >> 16},${num >> 8 & 255},${num & 255},${alpha})`;
}
