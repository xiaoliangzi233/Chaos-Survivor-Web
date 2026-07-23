import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy } from "./BaseEnemy.js";

export const CHAINBREAK_PHASE_THRESHOLDS = [0.7, 0.35];
export const CHAINBREAK_SAFE_CORRIDORS = { prison: 150, collapse: 150 };
export const CHAINBREAK_SCREEN_PRESSURE = Object.freeze({
  sweepRadius: 720,
  prisonWaves: 5,
  bounceImpacts: 10,
  collapsePaths: 5,
  peakShrapnel: 96,
});

const HALF_WORLD = WORLD_SIZE / 2;
const PHASE_COLORS = ["#d89a52", "#b68cff", "#ff5a52"];
const PHASE_CORES = ["#42e8ff", "#f3f7ff", "#ffd166"];

export class ChainbreakConvict extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "终刑重犯·断锁";
    this.mode = "intro";
    this.modeTimer = 1.15;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.currentSkill = "";
    this.lastSkills = [];
    this.skillCooldowns = Object.create(null);
    this.attacksSinceRecover = 0;
    this.pendingForcedSkill = "";
    this.sceneSpin = Math.random() * TAU;
    this.chainAngle = -0.35;
    this.ballDetached = false;
    this.sequenceStep = 0;
    this.reposition = null;
    this.dash = null;
    this.motion = {
      lastX: state.player?.x || 0,
      lastY: state.player?.y || 0,
      vx: 0,
      vy: 0,
      straightness: 0.5,
      turn: 0,
      lastHeading: 0,
    };
  }

  update(dt) {
    const p = state.player;
    if (!p) return;
    this.trackPlayerMotion(dt);
    this.tickCooldowns(dt);
    this.anim += dt * (this.phaseLevel === 3 ? 5.1 : this.phaseLevel === 2 ? 4.3 : 3.6);
    this.sceneSpin += dt * (0.6 + this.phaseLevel * 0.34);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.1);
    this.flip = p.x < this.x ? -1 : 1;
    this.modeTimer -= dt;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== "phase_transition" && distance < p.r + this.r && p.invuln <= 0) {
      const multiplier = this.mode === "convict_dash" ? 0.65 : 1;
      applyPlayerDamage(this.damage * multiplier, this);
      p.invuln = 0.58;
      state.shake = Math.max(state.shake, this.mode === "convict_dash" ? 14 : 10);
      state.flash = Math.max(state.flash, 0.24);
      burst(p.x, p.y, 14, this.phaseColor(), 180);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    if (this.mode === "intro") {
      this.driftToRange(dt, 0.14);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "phase_transition") {
      this.moveToward(0, 0, this.speed * 0.55, dt);
      if (this.modeTimer <= 0) {
        const forced = this.pendingForcedSkill;
        this.pendingForcedSkill = "";
        this.beginSkill(forced);
      }
      return;
    }
    if (this.mode === "convict_recover") {
      this.driftToRange(dt, 0.04);
      this.chainAngle += (-0.35 - this.chainAngle) * Math.min(1, dt * 6);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "convict_reposition") return this.updateReposition(dt);
    if (this.mode === "convict_throw") {
      if (this.modeTimer <= 0) this.startSentenceReturn();
      return;
    }
    if (this.mode === "convict_return") {
      if (this.modeTimer <= 0) this.finishAttack(0.8);
      return;
    }
    if (this.mode === "convict_sweep" || this.mode === "convict_garrote") {
      if (this.modeTimer <= 0) this.finishAttack(this.mode === "convict_garrote" ? 0.9 : 0.65);
      return;
    }
    if (this.mode === "convict_triple") {
      if (this.modeTimer <= 0) this.advanceTriple();
      return;
    }
    if (this.mode === "convict_scene_prison") {
      this.moveToward(0, 0, this.speed * 0.75, dt);
      if (this.modeTimer <= 0) {
        this.clearOwnedEffects();
        this.finishAttack(1.3, true);
      }
      return;
    }
    if (this.mode === "convict_dash_windup") {
      if (this.modeTimer <= 0) this.launchBreakoutDash();
      return;
    }
    if (this.mode === "convict_dash") return this.updateBreakoutDash(dt);
    if (this.mode === "convict_dash_replay") {
      if (this.modeTimer <= 0) this.startBreakoutSweep();
      return;
    }
    if (this.mode === "convict_dash_sweep") {
      if (this.modeTimer <= 0) this.finishAttack(1.2);
      return;
    }
    if (this.mode === "convict_bounce") {
      if (this.modeTimer <= 0) this.finishAttack(1);
      return;
    }
    if (this.mode === "convict_scene_collapse") {
      this.moveToward(0, 0, this.speed * 0.78, dt);
      if (this.modeTimer <= 0) {
        this.clearOwnedEffects();
        this.finishAttack(1.5, true);
      }
    }
  }

  chooseSkill() {
    if (this.attacksSinceRecover >= 2) {
      this.clearOwnedEffects();
      return this.recover(this.phaseLevel === 3 ? 0.95 : 1.05);
    }
    const p = state.player;
    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y)) / HALF_WORLD;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const scores = {
      prison_sweep: 4.4 + (distance < 430 ? 2 : 0) + Math.abs(this.motion.turn) * 2.4,
      sentence_throw: 4.5 + (distance > 360 ? 2.6 : 0) + this.motion.straightness * 2.8,
      shackle_reposition: 1.4 + (distance < 175 ? 6 : 0) + (edge > 0.8 ? 5 : 0),
    };
    if (this.phaseLevel >= 2) {
      scores.convict_triple = 4.8 + (speed > 100 ? 1.2 : 0) + this.motion.straightness * 1.8;
      scores.garrote_lane = 4.6 + Math.abs(this.motion.turn) * 3 + (distance < 560 ? 1 : 0);
      scores.prison_lockdown = 1.8 + (edge > 0.72 ? 1.8 : 0);
    }
    if (this.phaseLevel >= 3) {
      scores.breakout_combo = 5.2 + (distance > 260 ? 1.6 : 0) + this.motion.straightness;
      scores.death_bounce = 5 + (speed > 90 ? 1.8 : 0);
      scores.collapse = 2.1 + (edge > 0.72 ? 1.2 : 0);
    }

    let best = "shackle_reposition";
    let bestScore = -Infinity;
    for (const [skill, baseScore] of Object.entries(scores)) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      let score = baseScore + Math.random() * 0.65;
      if (this.lastSkills[0] === skill) score -= 100;
      else if (this.lastSkills.includes(skill)) score -= 2.5;
      if (this.isSceneSkill(skill) && this.hasOwnedDanger()) score -= 100;
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    this.beginSkill(best);
  }

  beginSkill(skill) {
    this.currentSkill = skill || "prison_sweep";
    this.rememberSkill(this.currentSkill);
    if (this.currentSkill === "prison_sweep") return this.startPrisonSweep();
    if (this.currentSkill === "sentence_throw") return this.startSentenceThrow();
    if (this.currentSkill === "shackle_reposition") return this.startReposition();
    if (this.currentSkill === "convict_triple") return this.startTriple();
    if (this.currentSkill === "garrote_lane") return this.startGarrote();
    if (this.currentSkill === "prison_lockdown") return this.startPrisonLockdown();
    if (this.currentSkill === "breakout_combo") return this.startBreakoutCombo();
    if (this.currentSkill === "death_bounce") return this.startDeathBounce();
    if (this.currentSkill === "collapse") return this.startCollapse();
    this.startPrisonSweep();
  }

  startPrisonSweep() {
    const target = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const direction = this.motion.turn >= 0 ? 1 : -1;
    const sweep = direction * 178 * Math.PI / 180;
    const startAngle = target - sweep * 0.5;
    const hazard = this.createArcHazard({
      armTime: 0.75,
      activeTime: 0.78,
      radius: CHAINBREAK_SCREEN_PRESSURE.sweepRadius,
      startAngle,
      sweep,
      width: 22,
      damage: this.damage * 0.68,
      ballDamage: this.damage * 0.78,
      style: "sweep",
    });
    this.spawnLinkedBall(hazard, 31);
    this.spawnShrapnelRing(this.x, this.y, {
      count: 16,
      speed: 250,
      damage: this.damage * 0.24,
      gapAngle: target + Math.PI,
      gapWidth: 0.72,
      delay: 0.75,
    });
    this.ballDetached = true;
    this.mode = "convict_sweep";
    this.modeTimer = 1.62;
    this.skillCooldowns.prison_sweep = 4.2;
    pulse(this.x, this.y, 90, this.phaseColor(), 0.28);
  }

  startSentenceThrow() {
    const target = this.predictedPlayer(0.4, 180);
    const hazard = this.createSlamHazard(target.x, target.y, 112, 0.78, 0.22, this.damage * 0.85, "sentence");
    this.spawnLinkedBall(hazard, 31, { drop: true });
    const escapeAngle = Math.atan2(state.player.y - target.y, state.player.x - target.x);
    this.spawnShrapnelRing(target.x, target.y, {
      count: 16,
      speed: 270,
      damage: this.damage * 0.25,
      gapAngle: escapeAngle,
      gapWidth: 0.68,
      delay: 0.78,
    });
    this.ballDetached = true;
    this.mode = "convict_throw";
    this.modeTimer = 1.04;
    this.skillCooldowns.sentence_throw = 4.8;
    playSfx("wave");
  }

  startSentenceReturn() {
    const slam = this.latestOwnedHazard("convict_ball_slam");
    const x1 = slam?.x ?? state.player.x;
    const y1 = slam?.y ?? state.player.y;
    const angle = Math.atan2(this.y - y1, this.x - x1);
    const hazard = this.createLineHazard(
      x1 - Math.cos(angle) * 260,
      y1 - Math.sin(angle) * 260,
      this.x + Math.cos(angle) * 360,
      this.y + Math.sin(angle) * 360,
      0.55,
      0.32,
      25,
      this.damage * 0.55,
      "return",
    );
    hazard.movingBall = true;
    this.spawnLinkedBall(hazard, 27);
    this.mode = "convict_return";
    this.modeTimer = 0.92;
  }

  startReposition() {
    const p = state.player;
    const edge = Math.max(Math.abs(this.x), Math.abs(this.y)) / HALF_WORLD;
    let tx;
    let ty;
    if (edge > 0.72) {
      tx = this.x * 0.55;
      ty = this.y * 0.55;
    } else {
      const angle = Math.atan2(p.y - this.y, p.x - this.x) + (this.motion.turn >= 0 ? -1 : 1) * Math.PI / 2;
      const distance = clamp(Math.hypot(p.x - this.x, p.y - this.y), 180, 260);
      tx = this.x + Math.cos(angle) * distance;
      ty = this.y + Math.sin(angle) * distance;
    }
    const margin = this.r + 35;
    this.reposition = {
      fromX: this.x,
      fromY: this.y,
      toX: clamp(tx, -HALF_WORLD + margin, HALF_WORLD - margin),
      toY: clamp(ty, -HALF_WORLD + margin, HALF_WORLD - margin),
      duration: 0.72,
    };
    this.mode = "convict_reposition";
    this.modeTimer = this.reposition.duration;
    this.skillCooldowns.shackle_reposition = 3;
  }

  updateReposition(dt) {
    const data = this.reposition;
    if (!data) return this.finishAttack(0.45, false, false);
    const t = clamp(1 - this.modeTimer / data.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const oldX = this.x;
    const oldY = this.y;
    this.x = data.fromX + (data.toX - data.fromX) * eased;
    this.y = data.fromY + (data.toY - data.fromY) * eased;
    if (Math.hypot(this.x - oldX, this.y - oldY) > 1) trail(this.x, this.y, oldX, oldY, this.phaseColor(), 14);
    if (this.modeTimer <= 0) {
      this.reposition = null;
      this.finishAttack(0.5, false, false);
    }
  }

  startTriple() {
    this.sequenceStep = 0;
    this.mode = "convict_triple";
    this.skillCooldowns.convict_triple = 6.4;
    this.startTripleStage();
  }

  startTripleStage() {
    const target = this.predictedPlayer(this.sequenceStep === 0 ? 0.28 : 0.18, this.sequenceStep === 0 ? 125 : 90);
    if (this.sequenceStep === 0) {
      const hazard = this.createSlamHazard(target.x, target.y, 104, 0.68, 0.2, this.damage * 0.58, "triple_slam");
      this.spawnLinkedBall(hazard, 27, { drop: true });
      this.spawnShrapnelRing(target.x, target.y, {
        count: 12,
        speed: 245,
        damage: this.damage * 0.2,
        gapAngle: Math.atan2(state.player.y - target.y, state.player.x - target.x),
        gapWidth: 0.75,
        delay: 0.68,
      });
      this.modeTimer = 0.94;
    } else if (this.sequenceStep === 1) {
      const movementAngle = Math.atan2(this.motion.vy || state.player.dirY, this.motion.vx || state.player.dirX);
      const angle = movementAngle + Math.PI / 2;
      const half = 920;
      const hazard = this.createLineHazard(
        target.x - Math.cos(angle) * half,
        target.y - Math.sin(angle) * half,
        target.x + Math.cos(angle) * half,
        target.y + Math.sin(angle) * half,
        0.68,
        0.28,
        27,
        this.damage * 0.65,
        "triple_drag",
      );
      hazard.movingBall = true;
      this.spawnLinkedBall(hazard, 27);
      this.spawnShrapnelFan(target.x, target.y, angle + Math.PI / 2, {
        count: 9,
        spread: 1.55,
        speed: 285,
        damage: this.damage * 0.2,
        delay: 0.68,
      });
      this.modeTimer = 0.96;
    } else {
      const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
      const direction = this.motion.turn >= 0 ? -1 : 1;
      const sweep = direction * 165 * Math.PI / 180;
      const hazard = this.createArcHazard({
        armTime: 0.68,
        activeTime: 0.78,
        radius: 680,
        startAngle: targetAngle - sweep * 0.5,
        sweep,
        width: 22,
        damage: this.damage * 0.72,
        ballDamage: this.damage * 0.72,
        style: "triple_back",
      });
      this.spawnLinkedBall(hazard, 30);
      this.spawnShrapnelRing(this.x, this.y, {
        count: 14,
        speed: 275,
        damage: this.damage * 0.22,
        gapAngle: targetAngle + Math.PI,
        gapWidth: 0.7,
        delay: 0.68,
      });
      this.modeTimer = 1.5;
    }
    this.ballDetached = true;
  }

  advanceTriple() {
    this.sequenceStep++;
    if (this.sequenceStep >= 3) return this.finishAttack(1.05);
    this.startTripleStage();
  }

  startGarrote() {
    const targetAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const direction = this.motion.turn >= 0 ? 1 : -1;
    const sweep = direction * 68 * Math.PI / 180;
    const radius = clamp(Math.hypot(state.player.x - this.x, state.player.y - this.y) + 180, 520, 780);
    const playerSpeed = Math.max(120, state.player.speed || 210);
    const maxAngularSpeed = playerSpeed * 0.72 / radius;
    const activeTime = Math.max(1.35, Math.abs(sweep) / maxAngularSpeed);
    const hazard = this.createArcHazard({
      armTime: 0.9,
      activeTime,
      radius,
      startAngle: targetAngle - sweep * 0.5,
      sweep,
      width: 23,
      damage: this.damage * 0.55,
      ballDamage: this.damage * 0.62,
      style: "garrote",
    });
    this.spawnLinkedBall(hazard, 31);
    this.spawnShrapnelFan(this.x, this.y, targetAngle + direction * Math.PI / 2, {
      count: 10,
      spread: 1.75,
      speed: 260,
      damage: this.damage * 0.2,
      delay: 0.9,
    });
    this.ballDetached = true;
    this.mode = "convict_garrote";
    this.modeTimer = 0.9 + activeTime;
    this.skillCooldowns.garrote_lane = 6.2;
  }

  startPrisonLockdown() {
    this.clearOwnedEffects();
    const p = state.player;
    const corridor = CHAINBREAK_SAFE_CORRIDORS.prison;
    const chainWidth = 23;
    const halfGap = (corridor + (chainWidth + (p.r || 14)) * 2) / 2;
    const full = WORLD_SIZE * 1.08;
    const patterns = [
      { angle: 0, centerX: 0, centerY: clamp(p.y, -1100, 1100) },
      { angle: Math.PI / 2, centerX: clamp(p.x, -1100, 1100), centerY: 0 },
      { angle: Math.PI / 4, centerX: clamp(p.x * 0.35, -700, 700), centerY: clamp(p.y * 0.35, -700, 700) },
      { angle: -Math.PI / 4, centerX: clamp(p.x * 0.22, -620, 620), centerY: clamp(p.y * 0.22, -620, 620) },
      { angle: Math.atan2(this.motion.vy || p.dirY, this.motion.vx || p.dirX), centerX: clamp(p.x * 0.28, -720, 720), centerY: clamp(p.y * 0.28, -720, 720) },
    ];
    patterns.forEach((pattern, index) => {
      const nx = -Math.sin(pattern.angle);
      const ny = Math.cos(pattern.angle);
      const lines = [-halfGap, halfGap].map((offset) => ({
        x1: pattern.centerX + nx * offset - Math.cos(pattern.angle) * full * 0.5,
        y1: pattern.centerY + ny * offset - Math.sin(pattern.angle) * full * 0.5,
        x2: pattern.centerX + nx * offset + Math.cos(pattern.angle) * full * 0.5,
        y2: pattern.centerY + ny * offset + Math.sin(pattern.angle) * full * 0.5,
      }));
      this.createMultiLineHazard(lines, 0.95 + index * 0.72, 0.36, chainWidth, this.damage * 0.58, "prison", true);
    });
    const gapAngle = Math.atan2(p.y - this.y, p.x - this.x);
    for (let ring = 0; ring < 3; ring++) {
      this.spawnShrapnelRing(this.x, this.y, {
        count: 18,
        speed: 190 + ring * 52,
        damage: this.damage * 0.18,
        gapAngle,
        gapWidth: 0.62,
        delay: 0.95 + ring * 0.94,
        spinOffset: ring * 0.12,
      });
    }
    this.ballDetached = false;
    this.mode = "convict_scene_prison";
    this.modeTimer = 4.38;
    this.skillCooldowns.prison_lockdown = 14;
    pulse(0, 0, 190, this.phaseColor(), 0.5);
    playSfx("wave");
  }

  startBreakoutCombo() {
    const target = this.predictedPlayer(0.32, 160);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const endX = clamp(target.x + nx * 240, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    const endY = clamp(target.y + ny * 240, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.dash = { startX: this.x, startY: this.y, endX, endY, duration: 0.5, angle: Math.atan2(ny, nx) };
    const warningHalf = 820;
    const warningCx = (this.x + endX) * 0.5;
    const warningCy = (this.y + endY) * 0.5;
    this.createLineHazard(
      warningCx - nx * warningHalf,
      warningCy - ny * warningHalf,
      warningCx + nx * warningHalf,
      warningCy + ny * warningHalf,
      0.7,
      0.5,
      this.r * 0.72,
      0,
      "dash_warning",
      false,
      true,
    );
    this.mode = "convict_dash_windup";
    this.modeTimer = 0.7;
    this.skillCooldowns.breakout_combo = 7;
    this.ballDetached = false;
  }

  launchBreakoutDash() {
    this.mode = "convict_dash";
    this.modeTimer = this.dash?.duration || 0.46;
    playSfx("wave");
  }

  updateBreakoutDash(dt) {
    const data = this.dash;
    if (!data) return this.startBreakoutReplay();
    const t = clamp(1 - this.modeTimer / data.duration, 0, 1);
    const oldX = this.x;
    const oldY = this.y;
    this.x = data.startX + (data.endX - data.startX) * t;
    this.y = data.startY + (data.endY - data.startY) * t;
    trail(this.x, this.y, oldX, oldY, this.phaseColor(), 22);
    if (this.modeTimer <= 0) this.startBreakoutReplay();
  }

  startBreakoutReplay() {
    const data = this.dash;
    if (!data) return this.startBreakoutSweep();
    const dx = Math.cos(data.angle || 0);
    const dy = Math.sin(data.angle || 0);
    const cx = (data.startX + data.endX) * 0.5;
    const cy = (data.startY + data.endY) * 0.5;
    const hazard = this.createLineHazard(
      cx - dx * 860,
      cy - dy * 860,
      cx + dx * 860,
      cy + dy * 860,
      0.55,
      0.36,
      28,
      this.damage * 0.7,
      "dash_replay",
    );
    hazard.movingBall = true;
    this.spawnLinkedBall(hazard, 28);
    this.spawnShrapnelFan(data.endX, data.endY, (data.angle || 0) + Math.PI, {
      count: 14,
      spread: 2.1,
      speed: 315,
      damage: this.damage * 0.22,
      delay: 0.55,
    });
    this.ballDetached = true;
    this.mode = "convict_dash_replay";
    this.modeTimer = 0.91;
  }

  startBreakoutSweep() {
    const targetAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const direction = this.motion.turn >= 0 ? -1 : 1;
    const sweep = direction * 158 * Math.PI / 180;
    const hazard = this.createArcHazard({
      armTime: 0.65,
      activeTime: 0.62,
      radius: 710,
      startAngle: targetAngle - sweep * 0.5,
      sweep,
      width: 23,
      damage: this.damage * 0.72,
      ballDamage: this.damage * 0.75,
      style: "breakout",
    });
    this.spawnLinkedBall(hazard, 31);
    this.spawnShrapnelRing(this.x, this.y, {
      count: 18,
      speed: 300,
      damage: this.damage * 0.22,
      gapAngle: targetAngle + Math.PI,
      gapWidth: 0.62,
      delay: 0.65,
    });
    this.mode = "convict_dash_sweep";
    this.modeTimer = 1.27;
  }

  startDeathBounce() {
    const p = state.player;
    const heading = Math.atan2(this.motion.vy || p.dirY, this.motion.vx || p.dirX);
    const nx = Math.cos(heading);
    const ny = Math.sin(heading);
    const sx = -ny;
    const sy = nx;
    const points = [];
    let nearby = 0;
    for (let i = 0; i < CHAINBREAK_SCREEN_PRESSURE.bounceImpacts; i++) {
      let x = p.x + nx * (70 + i * 74) + sx * (i % 2 ? 185 : -185);
      let y = p.y + ny * (70 + i * 74) + sy * (i % 2 ? 185 : -185);
      if (Math.hypot(x - p.x, y - p.y) < 240) {
        if (nearby >= 2) {
          x += sx * (i % 2 ? 170 : -170);
          y += sy * (i % 2 ? 170 : -170);
        } else {
          nearby++;
        }
      }
      const margin = 100;
      points.push({ x: clamp(x, -HALF_WORLD + margin, HALF_WORLD - margin), y: clamp(y, -HALF_WORLD + margin, HALF_WORLD - margin) });
    }
    const hazards = points.map((point, index) => {
      const armTime = 0.75 + index * 0.34;
      const hazard = this.createSlamHazard(point.x, point.y, 78, armTime, 0.2, this.damage * 0.68, "bounce");
      hazard.bounceIndex = index;
      if (index === 0) hazard.bouncePoints = points;
      this.spawnShrapnelFan(point.x, point.y, heading + (index % 2 ? 1 : -1) * Math.PI / 2, {
        count: 5,
        spread: 1.45,
        speed: 255,
        damage: this.damage * 0.16,
        delay: armTime,
      });
      return hazard;
    });
    this.spawnBounceBall(hazards, 28);
    this.ballDetached = true;
    this.mode = "convict_bounce";
    this.modeTimer = 4.12;
    this.skillCooldowns.death_bounce = 7.5;
  }

  startCollapse() {
    this.clearOwnedEffects();
    const p = state.player;
    const color = this.phaseColor();
    const offsets = [-620, -310, 0, 310, 620];
    offsets.forEach((offset, index) => {
      const centerY = clamp(p.y + offset, -1350, 1350);
      const bend = (index % 2 ? -1 : 1) * (250 + index % 3 * 55);
      const points = sampleCubicPath(
        { x: -HALF_WORLD + 80, y: centerY },
        { x: -780, y: centerY + bend },
        { x: 780, y: centerY - bend },
        { x: HALF_WORLD - 80, y: centerY },
        18,
      );
      const hazard = this.createPathHazard(points, 1 + index * 0.72, 0.68, 27, this.damage * 0.58, `collapse_${index}`);
      hazard.safeCorridor = CHAINBREAK_SAFE_CORRIDORS.collapse;
      this.spawnLinkedBall(hazard, 31, { armedOnly: true });
    });
    const movementAngle = Math.atan2(this.motion.vy || p.dirY, this.motion.vx || p.dirX);
    const full = WORLD_SIZE * 1.15;
    [movementAngle, movementAngle + Math.PI / 2, movementAngle + Math.PI / 4, movementAngle - Math.PI / 4].forEach((angle, index) => {
      const cx = clamp(p.x * 0.35, -700, 700);
      const cy = clamp(p.y * 0.35, -700, 700);
      const hazard = this.createLineHazard(
        cx - Math.cos(angle) * full * 0.5,
        cy - Math.sin(angle) * full * 0.5,
        cx + Math.cos(angle) * full * 0.5,
        cy + Math.sin(angle) * full * 0.5,
        4.85 + index * 0.48,
        0.36,
        25,
        this.damage * 0.62,
        "collapse_final",
        true,
      );
      hazard.armDuration = 1.05;
      hazard.delayedWarning = true;
    });
    const gapAngle = Math.atan2(p.y - this.y, p.x - this.x);
    for (let ring = 0; ring < 3; ring++) {
      this.spawnShrapnelRing(this.x, this.y, {
        count: 22,
        speed: 205 + ring * 55,
        damage: this.damage * 0.18,
        gapAngle,
        gapWidth: 0.56,
        delay: 1.05 + ring * 1.08,
        spinOffset: ring * 0.09,
      });
    }
    this.ballDetached = true;
    this.mode = "convict_scene_collapse";
    this.modeTimer = 6.82;
    this.skillCooldowns.collapse = 18;
    pulse(0, 0, 240, color, 0.58);
    playSfx("wave");
  }

  createArcHazard({ armTime, activeTime, radius, startAngle, sweep, width, damage, ballDamage, style }) {
    const hazard = {
      kind: "convict_chain_arc",
      x: this.x,
      y: this.y,
      centerX: this.x,
      centerY: this.y,
      r: radius,
      radius,
      startAngle,
      sweep,
      currentAngle: startAngle,
      width,
      damage,
      ballDamage,
      armTime,
      armDuration: armTime,
      activeTime: 0,
      activeDuration: activeTime,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      warningType: "arc",
      style,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      convictOwner: this,
    };
    hazard.ballX = hazard.centerX + Math.cos(startAngle) * radius;
    hazard.ballY = hazard.centerY + Math.sin(startAngle) * radius;
    world.hazards.push(hazard);
    return hazard;
  }

  createSlamHazard(x, y, radius, armTime, activeTime, damage, style) {
    const hazard = {
      kind: "convict_ball_slam",
      x,
      y,
      r: radius,
      damage,
      armTime,
      armDuration: armTime,
      activeTime: 0,
      activeDuration: activeTime,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      warningType: "circle",
      style,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      convictOwner: this,
    };
    hazard.ballX = x;
    hazard.ballY = y;
    world.hazards.push(hazard);
    return hazard;
  }

  createLineHazard(x1, y1, x2, y2, armTime, activeTime, width, damage, style, scene = false, noDamage = false) {
    const hazard = {
      kind: "convict_chain_line",
      x: (x1 + x2) * 0.5,
      y: (y1 + y2) * 0.5,
      x1,
      y1,
      x2,
      y2,
      r: width,
      width,
      length: Math.hypot(x2 - x1, y2 - y1),
      angle: Math.atan2(y2 - y1, x2 - x1),
      damage,
      noDamage,
      armTime,
      armDuration: armTime,
      activeTime: 0,
      activeDuration: activeTime,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      warningType: "line",
      style,
      sceneChain: scene,
      delayedWarning: true,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      convictOwner: this,
    };
    hazard.ballX = x1;
    hazard.ballY = y1;
    world.hazards.push(hazard);
    return hazard;
  }

  createMultiLineHazard(lines, armTime, activeTime, width, damage, style, scene = false) {
    const hazard = {
      kind: "convict_chain_line",
      x: 0,
      y: 0,
      lines,
      r: width,
      width,
      damage,
      armTime,
      armDuration: 0.95,
      activeTime: 0,
      activeDuration: activeTime,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      warningType: "line",
      style,
      sceneChain: scene,
      delayedWarning: true,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      convictOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  createPathHazard(points, armTime, activeTime, width, damage, style) {
    const hazard = {
      kind: "convict_chain_path",
      x: points[Math.floor(points.length / 2)].x,
      y: points[Math.floor(points.length / 2)].y,
      points,
      r: width,
      width,
      damage,
      armTime,
      armDuration: 1,
      activeTime: 0,
      activeDuration: activeTime,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      warningType: "path",
      delayedWarning: true,
      style,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      convictOwner: this,
    };
    hazard.ballX = points[0].x;
    hazard.ballY = points[0].y;
    world.hazards.push(hazard);
    return hazard;
  }

  spawnLinkedBall(hazard, radius, options = {}) {
    world.enemyProjectiles.push({
      x: hazard.ballX ?? hazard.x,
      y: hazard.ballY ?? hazard.y,
      vx: 0,
      vy: 0,
      r: radius,
      damage: 0,
      life: hazard.maxLife + 0.05,
      shape: "convictBall",
      color: hazard.color,
      coreColor: hazard.coreColor,
      spin: Math.random() * TAU,
      linkedHazard: hazard,
      drop: Boolean(options.drop),
      armedOnly: Boolean(options.armedOnly),
      nonColliding: true,
      bossProjectile: true,
      expireWithLife: true,
      convictOwner: this,
    });
  }

  spawnBounceBall(hazards, radius) {
    const life = Math.max(0.1, ...hazards.map((hazard) => hazard.maxLife || 0)) + 0.05;
    world.enemyProjectiles.push({
      x: hazards[0]?.x || this.x,
      y: hazards[0]?.y || this.y,
      vx: 0,
      vy: 0,
      r: radius,
      damage: 0,
      life,
      shape: "convictBall",
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      spin: Math.random() * TAU,
      bounceHazards: hazards,
      drop: true,
      nonColliding: true,
      bossProjectile: true,
      expireWithLife: true,
      convictOwner: this,
    });
  }

  spawnShrapnelRing(x, y, options = {}) {
    const count = Math.max(6, options.count || 14);
    const gapAngle = options.gapAngle ?? Math.atan2(state.player.y - y, state.player.x - x);
    const gapWidth = options.gapWidth ?? 0.62;
    const spinOffset = options.spinOffset || 0;
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + spinOffset;
      if (Math.abs(wrapAngle(angle - gapAngle)) < gapWidth * 0.5) continue;
      this.spawnShrapnel(x, y, angle, options);
    }
  }

  spawnShrapnelFan(x, y, baseAngle, options = {}) {
    const count = Math.max(3, options.count || 7);
    const spread = options.spread || 1.5;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle - spread * 0.5 + i / Math.max(1, count - 1) * spread;
      this.spawnShrapnel(x, y, angle, options);
    }
  }

  spawnShrapnel(x, y, angle, options = {}) {
    const ownedShrapnel = world.enemyProjectiles.reduce(
      (count, projectile) => count + (projectile.convictOwner === this && projectile.shape === "convictShrapnel" ? 1 : 0),
      0,
    );
    if (ownedShrapnel >= CHAINBREAK_SCREEN_PRESSURE.peakShrapnel) return;
    const speed = options.speed || 260;
    const delay = Math.max(0, options.delay || 0);
    world.enemyProjectiles.push({
      x,
      y,
      vx: delay > 0 ? 0 : Math.cos(angle) * speed,
      vy: delay > 0 ? 0 : Math.sin(angle) * speed,
      launchVx: Math.cos(angle) * speed,
      launchVy: Math.sin(angle) * speed,
      activationDelay: delay,
      r: options.radius || 8,
      damage: options.damage || this.damage * 0.2,
      life: delay + (options.travelLife || 3.2),
      shape: "convictShrapnel",
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      spin: angle,
      hidden: delay > 0,
      nonColliding: delay > 0,
      bossProjectile: true,
      expireWithLife: true,
      convictOwner: this,
    });
  }

  predictedPlayer(seconds, maxDistance) {
    const p = state.player;
    const vx = this.motion.vx;
    const vy = this.motion.vy;
    const predictionLength = Math.min(maxDistance, Math.hypot(vx, vy) * seconds);
    const speed = Math.max(1, Math.hypot(vx, vy));
    return {
      x: clamp(p.x + vx / speed * predictionLength, -HALF_WORLD + 90, HALF_WORLD - 90),
      y: clamp(p.y + vy / speed * predictionLength, -HALF_WORLD + 90, HALF_WORLD - 90),
    };
  }

  driftToRange(dt, orbitScale = 0.12) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radial = distance < 240 ? -0.75 : distance > 450 ? 0.7 : 0;
    const orbit = (this.motion.turn >= 0 ? 1 : -1) * orbitScale;
    this.x += (dx / distance * radial - dy / distance * orbit) * this.speed * dt;
    this.y += (dy / distance * radial + dx / distance * orbit) * this.speed * dt;
  }

  moveToward(x, y, speed, dt) {
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 5) return;
    this.x += dx / distance * speed * dt;
    this.y += dy / distance * speed * dt;
  }

  trackPlayerMotion(dt) {
    const p = state.player;
    if (!p || dt <= 0) return;
    const rawVx = (p.x - this.motion.lastX) / dt;
    const rawVy = (p.y - this.motion.lastY) / dt;
    const blend = Math.min(1, dt * 5.5);
    this.motion.vx += (rawVx - this.motion.vx) * blend;
    this.motion.vy += (rawVy - this.motion.vy) * blend;
    const heading = Math.atan2(this.motion.vy, this.motion.vx);
    const delta = wrapAngle(heading - this.motion.lastHeading);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const straightTarget = speed < 18 ? 0.35 : 1 - Math.min(1, Math.abs(delta) / 0.45);
    this.motion.straightness += (straightTarget - this.motion.straightness) * Math.min(1, dt * 4);
    this.motion.turn += (clamp(delta / Math.max(dt, 0.001), -1, 1) - this.motion.turn) * Math.min(1, dt * 3.2);
    this.motion.lastHeading = heading;
    this.motion.lastX = p.x;
    this.motion.lastY = p.y;
  }

  tickCooldowns(dt) {
    for (const skill of Object.keys(this.skillCooldowns)) this.skillCooldowns[skill] = Math.max(0, this.skillCooldowns[skill] - dt);
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
  }

  finishAttack(recovery = 0.7, forceLong = false, countAttack = true) {
    this.ballDetached = false;
    this.dash = null;
    if (countAttack && !forceLong) this.attacksSinceRecover++;
    if (forceLong) this.attacksSinceRecover = 0;
    this.recover(recovery);
  }

  recover(duration) {
    this.mode = "convict_recover";
    this.modeTimer = duration;
    this.currentSkill = "";
    this.ballDetached = false;
    if (duration >= 0.95) this.attacksSinceRecover = 0;
  }

  isSceneSkill(skill) {
    return skill === "prison_lockdown" || skill === "collapse";
  }

  hasOwnedDanger() {
    return world.hazards.some((hazard) => hazard.convictOwner === this && hazard.damage > 0);
  }

  latestOwnedHazard(kind) {
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const hazard = world.hazards[i];
      if (hazard.convictOwner === this && hazard.kind === kind) return hazard;
    }
    return null;
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.mode === "phase_transition" || this.dead) return;
    const threshold = this.phaseLevel <= 2 ? this.maxHp * CHAINBREAK_PHASE_THRESHOLDS[this.phaseLevel - 1] : null;
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
    this.modeTimer = 1.15;
    this.currentSkill = "";
    this.pendingForcedSkill = nextPhase === 2 ? "prison_lockdown" : "collapse";
    this.phasePulse = 1;
    this.attacksSinceRecover = 0;
    this.ballDetached = false;
    this.clearOwnedEffects();
    burst(this.x, this.y, nextPhase === 3 ? 58 : 44, this.phaseColor(), 320);
    pulse(this.x, this.y, this.r + 160, this.coreColor(), 0.55);
    state.shake = Math.max(state.shake, nextPhase === 3 ? 15 : 10);
    state.flash = Math.max(state.flash, 0.32);
    playSfx("wave");
  }

  clearOwnedEffects() {
    for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
      if (world.enemyProjectiles[i].convictOwner === this) world.enemyProjectiles.splice(i, 1);
    }
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].convictOwner === this) world.hazards.splice(i, 1);
    }
  }

  kill() {
    this.clearOwnedEffects();
    super.kill();
  }

  phaseColor() {
    return PHASE_COLORS[this.phaseLevel - 1];
  }

  coreColor() {
    return PHASE_CORES[this.phaseLevel - 1];
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    drawSceneVeil(ctx, this);
    drawChainbreakConvict(ctx, this);
    ctx.restore();
  }
}

function drawSceneVeil(ctx, boss) {
  if (boss.mode !== "convict_scene_prison" && boss.mode !== "convict_scene_collapse" && boss.mode !== "phase_transition") return;
  const alpha = boss.mode === "convict_scene_collapse" ? 0.2 : boss.mode === "convict_scene_prison" ? 0.11 : 0.07;
  ctx.save();
  ctx.fillStyle = `rgba(2,3,8,${alpha})`;
  ctx.fillRect(-HALF_WORLD - boss.x, -HALF_WORLD - boss.y, WORLD_SIZE, WORLD_SIZE);
  ctx.restore();
}

function drawChainbreakConvict(ctx, boss) {
  const color = boss.phaseColor();
  const core = boss.coreColor();
  const bob = Math.sin(boss.anim * 1.25) * 2.5;
  ctx.translate(0, bob);
  ctx.scale(boss.flip, 1);

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(color, 0.22);
  ctx.lineWidth = 3;
  for (let i = 0; i < boss.phaseLevel + 1; i++) {
    ctx.beginPath();
    ctx.arc(0, -4, 66 + i * 12, boss.sceneSpin * (i % 2 ? -1 : 1) + i, boss.sceneSpin * (i % 2 ? -1 : 1) + i + 1.35);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  drawPrisonCloth(ctx, boss, color);
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#080a0e";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  polygon(ctx, [[-30, -34], [-7, -48], [27, -37], [38, 7], [24, 45], [-23, 45], [-39, 8]]);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#171b22";
  ctx.strokeStyle = rgba(core, 0.75);
  ctx.lineWidth = 2;
  polygon(ctx, [[-31, -31], [-53, -18], [-48, 16], [-31, 9]]);
  ctx.fill(); ctx.stroke();
  polygon(ctx, [[27, -34], [50, -15], [44, 19], [28, 8]]);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#0c0f14";
  ctx.fillRect(-27, 26, 21, 31);
  ctx.fillRect(8, 26, 22, 31);
  ctx.strokeStyle = "#5e6672";
  ctx.strokeRect(-27, 26, 21, 31);
  ctx.strokeRect(8, 26, 22, 31);

  ctx.fillStyle = "#05070b";
  ctx.strokeStyle = "#818896";
  polygon(ctx, [[-23, -44], [-3, -58], [23, -43], [18, -15], [-19, -15]]);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillRect(-18, -37, 34, 5);
  ctx.fillStyle = core;
  ctx.fillRect(5, -37, 8, 2);
  ctx.shadowBlur = 0;

  drawExecutionCollar(ctx, boss, color, core);
  drawConvictMarkings(ctx, boss, core);
  drawShackleArm(ctx, boss, color);
  if (!boss.ballDetached) drawHeldChainBall(ctx, boss, color, core);

  if (boss.phasePulse > 0) {
    ctx.strokeStyle = rgba(core, boss.phasePulse * 0.9);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 78 + (1 - boss.phasePulse) * 120, 0, TAU);
    ctx.stroke();
  }
}

function drawPrisonCloth(ctx, boss, color) {
  const sway = Math.sin(boss.anim * 2.2) * 8;
  ctx.fillStyle = rgba(color, boss.phaseLevel === 3 ? 0.62 : 0.42);
  ctx.beginPath();
  ctx.moveTo(-22, 10);
  ctx.quadraticCurveTo(-58, 23 + sway, -80, 50 - sway * 0.35);
  ctx.lineTo(-61, 56 - sway * 0.2);
  ctx.quadraticCurveTo(-39, 38, -13, 29);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba("#0b0d12", 0.9);
  ctx.lineWidth = 5;
  for (let x = -57; x <= -25; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x - 18, 50); ctx.stroke();
  }
}

function drawExecutionCollar(ctx, boss, color, core) {
  ctx.fillStyle = "#11151d";
  ctx.strokeStyle = "#8b929d";
  ctx.lineWidth = 3;
  ctx.fillRect(-28, -18, 56, 11);
  ctx.strokeRect(-28, -18, 56, 11);
  ctx.fillStyle = core;
  ctx.shadowColor = core;
  ctx.shadowBlur = boss.phaseLevel === 3 ? 20 : 10;
  for (let x = -20; x <= 20; x += 10) ctx.fillRect(x - 2, -16, 4, 7);
  ctx.shadowBlur = 0;
  if (boss.phaseLevel >= 2) {
    ctx.strokeStyle = rgba(color, 0.7);
    for (let i = 0; i < boss.phaseLevel + 1; i++) {
      const a = boss.sceneSpin + i * TAU / (boss.phaseLevel + 1);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, -12 + Math.sin(a) * 8);
      ctx.lineTo(Math.cos(a + 0.4) * 43, -12 + Math.sin(a + 0.4) * 14);
      ctx.stroke();
    }
  }
}

function drawConvictMarkings(ctx, boss, core) {
  ctx.save();
  ctx.fillStyle = rgba(core, 0.86);
  ctx.font = "700 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("K-13", 0, 11);
  ctx.fillStyle = rgba("#d7dbe2", 0.52);
  for (let i = 0; i < 7; i++) ctx.fillRect(-17 + i * 5, 16, i % 2 ? 2 : 1, 8);
  ctx.restore();
}

function drawShackleArm(ctx, boss, color) {
  ctx.strokeStyle = "#707986";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(35, -4);
  ctx.lineTo(58, 19);
  ctx.stroke();
  ctx.fillStyle = "#10141b";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(49, 12, 20, 17);
  ctx.strokeRect(49, 12, 20, 17);
  ctx.fillStyle = "#c8cdd5";
  ctx.fillRect(64, 17, 8, 7);
}

function drawHeldChainBall(ctx, boss, color, core) {
  const radius = boss.phaseLevel === 3 ? 106 : boss.phaseLevel === 2 ? 96 : 88;
  const angle = boss.chainAngle + Math.sin(boss.anim * 0.85) * 0.14;
  const handX = 65;
  const handY = 22;
  const ballX = handX + Math.cos(angle) * radius;
  const ballY = handY + Math.sin(angle) * radius;
  drawChainLinks(ctx, handX, handY, ballX, ballY, color, boss.phaseLevel);
  drawBall(ctx, ballX, ballY, boss.phaseLevel === 3 ? 29 : 25, color, core, boss.sceneSpin);
}

function drawChainLinks(ctx, x1, y1, x2, y2, color, phase) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const count = Math.max(3, Math.floor(distance / 12));
  const angle = Math.atan2(dy, dx);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    ctx.save();
    ctx.translate(x1 + dx * t, y1 + dy * t);
    ctx.rotate(angle + (i % 2 ? Math.PI / 2 : 0));
    ctx.strokeStyle = i % 3 === 0 && phase >= 2 ? color : "#747d89";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBall(ctx, x, y, radius, color, core, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#090c12";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const r = i % 2 ? radius * 0.82 : radius;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = core;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(-2, -5, 4, 3);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillStyle = i % 2 ? color : "#8c949f";
    ctx.beginPath();
    ctx.moveTo(radius * 0.78, -4);
    ctx.lineTo(radius * 1.28, 0);
    ctx.lineTo(radius * 0.78, 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function sampleCubicPath(p0, p1, p2, p3, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    points.push({
      x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
    });
  }
  return points;
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function rgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean, 16);
  return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${alpha})`;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}
