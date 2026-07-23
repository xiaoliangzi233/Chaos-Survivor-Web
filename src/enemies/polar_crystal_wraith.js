import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";
import { applyFrostMark } from "../systems/statusEffects.js";

export const POLAR_WRAITH_PHASE_THRESHOLDS = [0.7, 0.35];
export const POLAR_WRAITH_SAFE_CORRIDORS = Object.freeze({
  gallery: 170,
  absoluteZero: 176,
  whiteoutGapAngle: 0.86,
});
export const POLAR_WRAITH_PRESSURE_LIMITS = Object.freeze({
  dashLength: 1480,
  galleryWaves: 3,
  absoluteWaves: 5,
  peakProjectiles: 72,
  peakHazards: 16,
});

const HALF_WORLD = WORLD_SIZE / 2;
const PHASE_COLORS = ["#9ff4ff", "#5ea7ff", "#e5d6ff"];
const PHASE_ACCENTS = ["#d9fbff", "#8b7dff", "#d77dff"];
const SKILL_COOLDOWNS = Object.freeze({
  glacial_lance: 1.8,
  shard_fan: 2,
  frost_step: 2.6,
  ice_cross: 3.8,
  frozen_gallery: 9.5,
  whiteout_hunt: 4.4,
  absolute_zero: 13,
});

export class PolarCrystalWraith extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "极霜冰魂";
    this.mode = "intro";
    this.modeTimer = 0.92;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.currentSkill = "";
    this.currentAttack = "";
    this.pendingForcedSkill = "";
    this.lastSkills = [];
    this.skillCooldowns = Object.create(null);
    this.attacksSinceLongRecover = 0;
    this.lockAngle = 0;
    this.lockTargetX = x;
    this.lockTargetY = y;
    this.dashStartX = x;
    this.dashStartY = y;
    this.dashEndX = x;
    this.dashEndY = y;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashTrailTimer = 0;
    this.stepStartX = x;
    this.stepStartY = y;
    this.stepTargetX = x;
    this.stepTargetY = y;
    this.stepDuration = 0.32;
    this.sceneSpin = Math.random() * TAU;
    this.coffinSpin = Math.random() * TAU;
    this.weaponPose = -0.45;
    this.sceneGapAngles = [];
    this.knockbackResistance = 0.96;
    this.motion = {
      lastX: state.player.x,
      lastY: state.player.y,
      vx: 0,
      vy: 0,
      straightness: 0.5,
      turn: 0,
    };
  }

  update(dt) {
    const p = state.player;
    this.trackPlayerMotion(dt);
    this.tickCooldowns(dt);
    this.anim += dt * (3.6 + this.phaseLevel * 0.86);
    this.sceneSpin += dt * (0.9 + this.phaseLevel * 0.42);
    this.coffinSpin += dt * (0.62 + this.phaseLevel * 0.24);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.35);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = p.x < this.x ? -1 : 1;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== "phase_transition" && distance < p.r + this.r && p.invuln <= 0) {
      const result = applyPlayerDamage(this.damage, this);
      p.invuln = 0.58;
      if (result.damaged) applyFrostMark(p, { duration: 8, slow: 0.22, freezeDuration: 2.4 });
      state.shake = Math.max(state.shake, 12);
      state.flash = Math.max(state.flash, 0.24);
      burst(p.x, p.y, 16, this.phaseColor(), 180);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    this.modeTimer -= dt;
    this.attackTimer -= dt;

    if (this.mode === "intro") {
      this.driftToHuntingRange(dt, 0.16);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "phase_transition") {
      this.moveToward(0, 0, this.speed * 0.56, dt);
      if (this.modeTimer <= 0) {
        const forced = this.pendingForcedSkill;
        this.pendingForcedSkill = "";
        this.beginSkill(forced);
      }
      return;
    }
    if (this.mode === "windup" || this.mode === "crystal_dash") {
      this.driftToHuntingRange(dt, -0.12);
      if (this.modeTimer <= 0) this.launchSkill(this.currentSkill || "glacial_lance");
      return;
    }
    if (this.mode === "polar_glacial_dash") return this.updateGlacialDash(dt);
    if (this.mode === "polar_shard_fan") return this.updateShardFan();
    if (this.mode === "polar_reposition") return this.updateFrostStep(dt);
    if (this.mode === "polar_cross_scene") {
      this.driftToHuntingRange(dt, 0.08);
      if (this.modeTimer <= 0) this.finishAttack(0.46);
      return;
    }
    if (this.mode === "polar_gallery_scene") {
      this.moveToward(0, 0, this.speed * 0.62, dt);
      if (this.modeTimer <= 0) this.finishAttack(1.15, true);
      return;
    }
    if (this.mode === "polar_whiteout_scene") {
      this.driftToHuntingRange(dt, 0.04);
      if (this.modeTimer <= 0) this.finishAttack(0.58);
      return;
    }
    if (this.mode === "polar_absolute_zero_scene") return this.updateAbsoluteZero(dt);
    if (this.mode === "polar_recover") {
      this.weaponPose += (-0.45 - this.weaponPose) * Math.min(1, dt * 7);
      this.driftToHuntingRange(dt, 0.2);
      if (this.modeTimer <= 0) this.chooseSkill();
    }
  }

  chooseSkill() {
    const p = state.player;
    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y)) / HALF_WORLD;
    const scores = {
      glacial_lance: 6.2 + (distance > 330 ? 3.3 : 0) + this.motion.straightness * 2.7,
      shard_fan: 6 + (distance >= 220 && distance <= 720 ? 2.4 : 0) + Math.abs(this.motion.turn),
      frost_step: 1.8 + (distance < 190 ? 5.2 : 0) + (edge > 0.84 ? 4.3 : 0),
    };
    if (this.phaseLevel >= 2) {
      scores.ice_cross = 6.4 + Math.abs(this.motion.turn) * 2.8 + (speed > 80 ? 1.4 : 0);
      scores.frozen_gallery = 3.8 + (edge > 0.66 ? 3.4 : 0) + this.motion.straightness;
    }
    if (this.phaseLevel >= 3) {
      scores.whiteout_hunt = 6.8 + (speed > 90 ? 2.2 : 0) + (1 - this.motion.straightness) * 1.5;
      scores.absolute_zero = 4.2 + this.motion.straightness * 2.2 + (edge > 0.58 ? 1.8 : 0);
    }

    let best = "glacial_lance";
    let bestScore = -Infinity;
    for (const [skill, baseScore] of Object.entries(scores)) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      let score = baseScore + Math.random() * 0.6;
      if (this.lastSkills[0] === skill) score -= 100;
      else if (this.lastSkills.includes(skill)) score -= 2.1;
      if (this.isSceneSkill(skill) && this.hasOwnedActiveHazards()) score -= 100;
      if (score > bestScore) {
        best = skill;
        bestScore = score;
      }
    }
    this.beginSkill(best);
  }

  chooseMode() {
    const distance = Math.hypot(state.player.x - this.x, state.player.y - this.y);
    if (distance > 760) {
      this.beginSkill("glacial_lance");
      this.mode = "crystal_dash";
      return;
    }
    this.chooseSkill();
  }

  beginSkill(skill) {
    this.currentSkill = skill || "glacial_lance";
    this.currentAttack = this.currentSkill;
    this.attackCount = 0;
    this.attackTimer = 0;
    this.mode = "windup";
    const windups = {
      glacial_lance: 0.68,
      shard_fan: 0.5,
      frost_step: 0.28,
      ice_cross: 0.72,
      frozen_gallery: 0.92,
      whiteout_hunt: 0.72,
      absolute_zero: 1,
    };
    this.modeTimer = windups[this.currentSkill] || 0.58;

    if (this.currentSkill === "glacial_lance") this.prepareGlacialLance(this.modeTimer);
    else if (this.currentSkill === "ice_cross") this.prepareIceCross(this.modeTimer);
    else if (this.currentSkill === "frozen_gallery") this.prepareFrozenGallery(this.modeTimer);
    else if (this.currentSkill === "whiteout_hunt") this.prepareWhiteoutHunt(this.modeTimer);
    else if (this.currentSkill === "absolute_zero") this.prepareAbsoluteZero(this.modeTimer);
    else if (this.currentSkill === "frost_step") this.prepareFrostStep();
    else this.lockAngle = this.angleToPredictedPlayer(0.24);
    pulse(this.x, this.y, this.r + 42, this.phaseColor(), 0.22);
  }

  launchSkill(skill) {
    this.rememberSkill(skill);
    if (skill === "glacial_lance") return this.launchGlacialLance();
    if (skill === "shard_fan") return this.launchShardFan();
    if (skill === "frost_step") return this.launchFrostStep();
    if (skill === "ice_cross") return this.launchIceCross();
    if (skill === "frozen_gallery") return this.launchFrozenGallery();
    if (skill === "whiteout_hunt") return this.launchWhiteoutHunt();
    if (skill === "absolute_zero") return this.launchAbsoluteZero();
    this.finishAttack();
  }

  prepareGlacialLance(warning) {
    const target = this.predictedPlayer(0.34);
    this.lockAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.lockTargetX = target.x;
    this.lockTargetY = target.y;
    this.dashStartX = this.x;
    this.dashStartY = this.y;
    const targetDistance = Math.hypot(target.x - this.x, target.y - this.y);
    const distance = clamp(targetDistance + 440, 1040, POLAR_WRAITH_PRESSURE_LIMITS.dashLength);
    this.dashEndX = this.x + Math.cos(this.lockAngle) * distance;
    this.dashEndY = this.y + Math.sin(this.lockAngle) * distance;
    this.spawnIceLane({
      x: (this.dashStartX + this.dashEndX) * 0.5,
      y: (this.dashStartY + this.dashEndY) * 0.5,
      angle: this.lockAngle,
      length: distance,
      width: this.phaseLevel >= 3 ? 32 : 29,
      armTime: warning,
      activeTime: 0.44,
      damage: this.damage * 0.62,
      style: "lance",
    });
  }

  launchGlacialLance() {
    this.mode = "polar_glacial_dash";
    this.modeTimer = 0.44;
    const distance = Math.hypot(this.dashEndX - this.dashStartX, this.dashEndY - this.dashStartY);
    const speed = distance / this.modeTimer;
    this.dashVx = Math.cos(this.lockAngle) * speed;
    this.dashVy = Math.sin(this.lockAngle) * speed;
    this.dashTrailTimer = 0;
    this.weaponPose = 0.08;
    burst(this.x, this.y, 20, this.phaseColor(), 245);
    playSfx("wave");
  }

  updateGlacialDash(dt) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer <= 0) {
      this.dashTrailTimer = 0.05;
      trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, this.phaseColor(), 17);
    }
    if (this.modeTimer > 0) return;
    this.fireDashShards();
    this.finishAttack(0.38);
  }

  fireDashShards() {
    const count = 10 + (this.phaseLevel - 1) * 2;
    const safeAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    for (let i = 0; i < count; i++) {
      const angle = this.sceneSpin + i / count * TAU;
      if (angleDistance(angle, safeAngle) < 0.42) continue;
      this.shootIce(angle, 230 + (i % 2) * 26, 5.8, this.damage * 0.28, "snowflake");
    }
  }

  launchShardFan() {
    this.mode = "polar_shard_fan";
    this.modeTimer = 1.04;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.lockAngle = this.angleToPredictedPlayer(0.26);
    this.weaponPose = 0.72;
  }

  updateShardFan() {
    if (this.attackTimer > 0) return;
    this.attackTimer = this.phaseLevel >= 3 ? 0.23 : 0.27;
    this.attackCount++;
    const count = 10 + (this.phaseLevel - 1) * 2;
    const spread = 1.34 + this.phaseLevel * 0.08;
    for (let i = 0; i < count; i++) {
      const offset = -spread * 0.5 + i / Math.max(1, count - 1) * spread;
      if (Math.abs(offset) < 0.17) continue;
      this.shootIce(
        this.lockAngle + offset + Math.sin(this.attackCount * 1.6) * 0.045,
        320 + (i % 3) * 24,
        6.6,
        this.damage * 0.34,
        i % 4 === 0 && this.phaseLevel >= 2 ? "frostComet" : "snowflake",
      );
    }
    pulse(this.x, this.y, this.r + 38 + this.attackCount * 12, this.phaseColor(), 0.15);
    playSfx("shoot");
    if (this.attackCount >= (this.phaseLevel >= 3 ? 4 : 3)) this.finishAttack(0.34);
  }

  prepareFrostStep() {
    const p = state.player;
    const away = Math.atan2(this.y - p.y, this.x - p.x);
    const side = this.motion.turn >= 0 ? -1 : 1;
    const angle = away + side * Math.PI * 0.46;
    this.stepStartX = this.x;
    this.stepStartY = this.y;
    this.stepTargetX = clamp(this.x + Math.cos(angle) * 310, -HALF_WORLD + 150, HALF_WORLD - 150);
    this.stepTargetY = clamp(this.y + Math.sin(angle) * 310, -HALF_WORLD + 150, HALF_WORLD - 150);
    if (this.edgeSafety(this.stepTargetX, this.stepTargetY) < 170) {
      this.stepTargetX = clamp(p.x + Math.cos(angle + Math.PI) * 350, -HALF_WORLD + 180, HALF_WORLD - 180);
      this.stepTargetY = clamp(p.y + Math.sin(angle + Math.PI) * 350, -HALF_WORLD + 180, HALF_WORLD - 180);
    }
  }

  launchFrostStep() {
    this.mode = "polar_reposition";
    this.modeTimer = this.stepDuration;
    this.attackTimer = 0;
    burst(this.x, this.y, 12, this.phaseColor(), 155);
    playSfx("wave");
  }

  updateFrostStep(dt) {
    const progress = 1 - Math.max(0, this.modeTimer) / this.stepDuration;
    const eased = 1 - Math.pow(1 - progress, 3);
    this.x = this.stepStartX + (this.stepTargetX - this.stepStartX) * eased;
    this.y = this.stepStartY + (this.stepTargetY - this.stepStartY) * eased;
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.06;
      trail(this.x, this.y, this.stepStartX, this.stepStartY, this.phaseColor(), 10);
    }
    if (this.modeTimer <= 0) {
      burst(this.x, this.y, 10, this.phaseColor(), 145);
      this.chooseSkill();
    }
  }

  prepareIceCross(warning) {
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const baseAngle = speed > 28 ? Math.atan2(this.motion.vy, this.motion.vx) : this.angleToPredictedPlayer(0.2);
    const center = this.predictedPlayer(0.36);
    this.lockAngle = baseAngle;
    this.spawnIceLane({
      x: center.x,
      y: center.y,
      angle: baseAngle,
      length: WORLD_SIZE + 420,
      width: 29,
      armTime: warning,
      activeTime: 0.26,
      damage: this.damage * 0.56,
      style: "cross_primary",
    });
    this.spawnIceLane({
      x: center.x,
      y: center.y,
      angle: baseAngle + Math.PI / 2,
      length: WORLD_SIZE + 420,
      width: 29,
      armTime: warning + 0.46,
      activeTime: 0.26,
      damage: this.damage * 0.56,
      style: "cross_echo",
    });
  }

  launchIceCross() {
    this.mode = "polar_cross_scene";
    this.modeTimer = 0.92;
    this.weaponPose = -1.18;
    burst(this.x, this.y, 24, this.phaseColor(), 210);
    playSfx("wave");
  }

  prepareFrozenGallery(warning) {
    const p = state.player;
    const movementAngle = Math.hypot(this.motion.vx, this.motion.vy) > 28
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : this.angleToPredictedPlayer(0);
    const center = this.predictedPlayer(0.42);
    const width = 28;
    const offset = POLAR_WRAITH_SAFE_CORRIDORS.gallery * 0.5 + width + (p.r || 14);

    for (let waveIndex = 0; waveIndex < POLAR_WRAITH_PRESSURE_LIMITS.galleryWaves; waveIndex++) {
      const angle = movementAngle + (waveIndex % 2 ? Math.PI / 2 : 0);
      const normalX = -Math.sin(angle);
      const normalY = Math.cos(angle);
      const shift = (waveIndex - 1) * 64;
      const centerX = center.x + Math.cos(angle) * shift;
      const centerY = center.y + Math.sin(angle) * shift;
      const armTime = warning + waveIndex * 0.5;
      for (const side of [-1, 1]) {
        this.spawnIceLane({
          x: centerX + normalX * offset * side,
          y: centerY + normalY * offset * side,
          angle,
          length: WORLD_SIZE + 460,
          width,
          armTime,
          activeTime: 0.25,
          damage: this.damage * 0.52,
          style: "gallery",
          waveIndex,
        });
      }
    }
  }

  launchFrozenGallery() {
    this.mode = "polar_gallery_scene";
    this.modeTimer = 1.46;
    this.weaponPose = -1.38;
    this.attacksSinceLongRecover = 0;
    burst(this.x, this.y, 30, this.phaseColor(), 235);
    pulse(this.x, this.y, this.r + 150, this.phaseColor(), 0.38);
    playSfx("wave");
  }

  prepareWhiteoutHunt(warning) {
    const center = this.predictedPlayer(0.48);
    const movementAngle = Math.hypot(this.motion.vx, this.motion.vy) > 24
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : this.sceneSpin;
    const escapeAngle = movementAngle + (this.motion.turn >= 0 ? -1 : 1) * Math.PI * 0.6;
    const waves = 4;
    this.sceneGapAngles = [escapeAngle];
    for (let waveIndex = 0; waveIndex < waves; waveIndex++) {
      const ringRadius = 150 + waveIndex * 58;
      const count = 5;
      for (let i = 0; i < count; i++) {
        const angle = movementAngle + i / count * TAU + waveIndex * 0.31;
        if (angleDistance(angle, escapeAngle) < POLAR_WRAITH_SAFE_CORRIDORS.whiteoutGapAngle * 0.5) continue;
        const x = clamp(center.x + Math.cos(angle) * ringRadius, -HALF_WORLD + 90, HALF_WORLD - 90);
        const y = clamp(center.y + Math.sin(angle) * ringRadius, -HALF_WORLD + 90, HALF_WORLD - 90);
        this.spawnIceBurst(x, y, 58, warning + waveIndex * 0.24 + i * 0.03, "whiteout");
      }
    }
  }

  launchWhiteoutHunt() {
    this.mode = "polar_whiteout_scene";
    this.modeTimer = 1.08;
    this.weaponPose = -1.46;
    burst(this.x, this.y, 26, this.phaseColor(), 225);
    playSfx("wave");
  }

  prepareAbsoluteZero(warning) {
    const p = state.player;
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 26
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : this.sceneSpin;
    const width = 30;
    const offset = POLAR_WRAITH_SAFE_CORRIDORS.absoluteZero * 0.5 + width + (p.r || 14);
    this.sceneGapAngles = [];
    for (let waveIndex = 0; waveIndex < POLAR_WRAITH_PRESSURE_LIMITS.absoluteWaves; waveIndex++) {
      const angle = base + waveIndex * Math.PI / 5;
      const normalX = -Math.sin(angle);
      const normalY = Math.cos(angle);
      const centerShift = (waveIndex % 2 ? 1 : -1) * 70;
      const centerX = normalX * centerShift;
      const centerY = normalY * centerShift;
      const armTime = warning + waveIndex * 0.46;
      this.sceneGapAngles.push(angle);
      for (const side of [-1, 1]) {
        this.spawnIceLane({
          x: centerX + normalX * offset * side,
          y: centerY + normalY * offset * side,
          angle,
          length: WORLD_SIZE + 520,
          width,
          armTime,
          activeTime: 0.24,
          damage: this.damage * 0.58,
          style: "absolute_zero",
          waveIndex,
        });
      }
    }
  }

  launchAbsoluteZero() {
    this.mode = "polar_absolute_zero_scene";
    this.modeTimer = (POLAR_WRAITH_PRESSURE_LIMITS.absoluteWaves - 1) * 0.46 + 0.4;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.weaponPose = -1.55;
    this.attacksSinceLongRecover = 0;
    burst(this.x, this.y, 42, this.phaseColor(), 300);
    pulse(this.x, this.y, this.r + 190, this.phaseColor(), 0.48);
    state.shake = Math.max(state.shake, 13);
    playSfx("wave");
  }

  updateAbsoluteZero(dt) {
    this.moveToward(0, 0, this.speed * 0.82, dt);
    if (this.attackTimer <= 0 && this.attackCount < POLAR_WRAITH_PRESSURE_LIMITS.absoluteWaves) {
      this.attackTimer = 0.46;
      this.fireAbsoluteVolley(this.attackCount++);
    }
    if (this.modeTimer <= 0) this.finishAttack(1.3, true);
  }

  fireAbsoluteVolley(waveIndex) {
    const count = 18;
    const gapAngle = this.sceneGapAngles[waveIndex] || this.sceneSpin;
    const opposite = gapAngle + Math.PI;
    for (let i = 0; i < count; i++) {
      const angle = this.sceneSpin + i / count * TAU;
      if (angleDistance(angle, gapAngle) < 0.32 || angleDistance(angle, opposite) < 0.32) continue;
      this.shootIce(
        angle,
        215 + (i % 3) * 28,
        6.2,
        this.damage * 0.3,
        i % 4 === 0 ? "frostComet" : "snowflake",
      );
    }
    pulse(this.x, this.y, this.r + 78 + waveIndex * 14, this.phaseColor(), 0.18);
    playSfx("shoot");
  }

  spawnIceLane({
    x,
    y,
    angle,
    length,
    width,
    armTime,
    activeTime,
    damage,
    style,
    waveIndex = 0,
  }) {
    if (this.ownedHazardCount() >= POLAR_WRAITH_PRESSURE_LIMITS.peakHazards) return null;
    const hazard = {
      kind: "polar_ice_lane",
      warningType: "line",
      x,
      y,
      angle,
      length,
      width,
      r: width,
      color: this.phaseColor(),
      accent: this.phaseAccent(),
      damage,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      armTime,
      armDuration: armTime,
      style,
      waveIndex,
      frostDuration: 8,
      frostSlow: 0.22,
      frostMarks: true,
      freezeDuration: 2.4,
      bossOwner: this,
      polarOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  spawnIceBurst(x, y, radius, armTime, style) {
    if (this.ownedHazardCount() >= POLAR_WRAITH_PRESSURE_LIMITS.peakHazards) return null;
    const hazard = {
      kind: "ice_spike",
      warningType: "circle",
      x,
      y,
      r: radius,
      color: this.phaseColor(),
      damage: this.damage * 0.48,
      life: armTime + 0.28,
      maxLife: armTime + 0.28,
      armTime,
      armDuration: armTime,
      spikeAngle: Math.random() * TAU,
      style,
      frostDuration: 8,
      frostSlow: 0.22,
      frostMarks: true,
      freezeDuration: 2.4,
      bossOwner: this,
      polarOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  shootIce(angle, speed, radius, damage, shape = "snowflake") {
    if (this.ownedProjectileCount() >= POLAR_WRAITH_PRESSURE_LIMITS.peakProjectiles) return null;
    const projectile = {
      x: this.x + Math.cos(angle) * this.r * 0.7,
      y: this.y + Math.sin(angle) * this.r * 0.7,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color: this.phaseColor(),
      damage,
      life: 4.8,
      shape,
      spin: Math.random() * TAU,
      frostDuration: 8,
      frostSlow: shape === "frostComet" ? 0.24 : 0.2,
      frostMarks: true,
      freezeDuration: 2.4,
      bossProjectile: true,
      expireWithLife: true,
      bossOwner: this,
      polarOwner: this,
    };
    world.enemyProjectiles.push(projectile);
    return projectile;
  }

  finishAttack(recovery = 0.4, forceLong = false, countAttack = true) {
    if (countAttack) this.attacksSinceLongRecover++;
    const long = forceLong || this.attacksSinceLongRecover >= 3;
    this.mode = "polar_recover";
    this.modeTimer = long ? Math.max(recovery, 0.9) : recovery;
    if (long) this.attacksSinceLongRecover = 0;
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
    this.skillCooldowns[skill] = Math.max(
      this.skillCooldowns[skill] || 0,
      SKILL_COOLDOWNS[skill] || 1.8,
    );
  }

  tickCooldowns(dt) {
    for (const skill of Object.keys(this.skillCooldowns)) {
      this.skillCooldowns[skill] = Math.max(0, this.skillCooldowns[skill] - dt);
    }
  }

  trackPlayerMotion(dt) {
    const p = state.player;
    const safeDt = Math.max(0.001, dt);
    const rawVx = clamp((p.x - this.motion.lastX) / safeDt, -520, 520);
    const rawVy = clamp((p.y - this.motion.lastY) / safeDt, -520, 520);
    const oldVx = this.motion.vx;
    const oldVy = this.motion.vy;
    const blend = Math.min(1, dt * 7.5);
    this.motion.vx += (rawVx - this.motion.vx) * blend;
    this.motion.vy += (rawVy - this.motion.vy) * blend;
    const oldSpeed = Math.hypot(oldVx, oldVy);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    if (oldSpeed > 20 && speed > 20) {
      const dot = (oldVx * this.motion.vx + oldVy * this.motion.vy) / (oldSpeed * speed);
      const cross = (oldVx * this.motion.vy - oldVy * this.motion.vx) / (oldSpeed * speed);
      this.motion.straightness += ((dot + 1) * 0.5 - this.motion.straightness) * Math.min(1, dt * 4);
      this.motion.turn += (cross - this.motion.turn) * Math.min(1, dt * 4.4);
    }
    this.motion.lastX = p.x;
    this.motion.lastY = p.y;
  }

  predictedPlayer(seconds) {
    const p = state.player;
    return {
      x: clamp(p.x + this.motion.vx * seconds, -HALF_WORLD + 70, HALF_WORLD - 70),
      y: clamp(p.y + this.motion.vy * seconds, -HALF_WORLD + 70, HALF_WORLD - 70),
    };
  }

  angleToPredictedPlayer(seconds) {
    const target = this.predictedPlayer(seconds);
    return Math.atan2(target.y - this.y, target.x - this.x);
  }

  driftToHuntingRange(dt, bias = 0) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desired = this.phaseLevel >= 3 ? 310 : 350;
    const radial = distance < desired - 90 ? -0.42 : distance > desired + 120 ? 0.56 : bias;
    const edgePressure = Math.max(Math.abs(this.x), Math.abs(this.y)) / HALF_WORLD;
    const orbit = edgePressure > 0.84 ? 0 : (this.motion.turn >= 0 ? -1 : 1) * 0.38;
    this.x += (dx / distance * radial - dy / distance * orbit) * this.speed * dt;
    this.y += (dy / distance * radial + dx / distance * orbit) * this.speed * dt;
    if (edgePressure > 0.87) this.moveToward(0, 0, this.speed * 0.58, dt);
  }

  moveToward(x, y, speed, dt) {
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 8) return;
    this.x += dx / distance * speed * dt;
    this.y += dy / distance * speed * dt;
  }

  edgeSafety(x, y) {
    return Math.min(HALF_WORLD - Math.abs(x), HALF_WORLD - Math.abs(y));
  }

  isSceneSkill(skill) {
    return skill === "ice_cross"
      || skill === "frozen_gallery"
      || skill === "whiteout_hunt"
      || skill === "absolute_zero";
  }

  hasOwnedActiveHazards() {
    return world.hazards.some((hazard) => hazard.polarOwner === this && (hazard.armTime || 0) <= 0);
  }

  ownedProjectileCount() {
    return world.enemyProjectiles.reduce(
      (count, projectile) => count + (projectile.polarOwner === this ? 1 : 0),
      0,
    );
  }

  ownedHazardCount() {
    return world.hazards.reduce(
      (count, hazard) => count + (hazard.polarOwner === this ? 1 : 0),
      0,
    );
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.mode === "phase_transition" || this.dead) return;
    const threshold = this.phaseLevel <= 2
      ? this.maxHp * POLAR_WRAITH_PHASE_THRESHOLDS[this.phaseLevel - 1]
      : null;
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
    this.modeTimer = 1.05;
    this.currentSkill = "";
    this.currentAttack = "";
    this.pendingForcedSkill = nextPhase === 2 ? "frozen_gallery" : "absolute_zero";
    this.phasePulse = 1;
    this.attacksSinceLongRecover = 0;
    this.clearOwnedEffects();
    burst(this.x, this.y, nextPhase === 3 ? 58 : 44, this.phaseColor(), 315);
    pulse(this.x, this.y, this.r + 170, this.phaseColor(), 0.5);
    state.shake = Math.max(state.shake, nextPhase === 3 ? 15 : 11);
    state.flash = Math.max(state.flash, 0.32);
    playSfx("wave");
  }

  clearOwnedEffects() {
    for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
      if (world.enemyProjectiles[i].polarOwner === this) world.enemyProjectiles.splice(i, 1);
    }
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].polarOwner === this) world.hazards.splice(i, 1);
    }
  }

  kill() {
    this.clearOwnedEffects();
    pulse(this.x, this.y, this.r + 210, this.phaseColor(), 0.6);
    burst(this.x, this.y, 62, this.phaseAccent(), 330);
    state.shake = Math.max(state.shake, 18);
    super.kill();
  }

  phaseColor() {
    return PHASE_COLORS[this.phaseLevel - 1];
  }

  phaseAccent() {
    return PHASE_ACCENTS[this.phaseLevel - 1];
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    drawSceneVeil(ctx, this);
    drawLocalTelegraph(ctx, this);
    drawPolarWraith(ctx, this);
    ctx.restore();
  }
}

function drawSceneVeil(ctx, boss) {
  const scene = boss.mode === "polar_gallery_scene"
    || boss.mode === "polar_whiteout_scene"
    || boss.mode === "polar_absolute_zero_scene"
    || boss.mode === "phase_transition";
  if (!scene) return;
  const alpha = boss.mode === "polar_absolute_zero_scene" ? 0.18 : boss.mode === "phase_transition" ? 0.13 : 0.09;
  ctx.fillStyle = hex(boss.phaseColor(), alpha);
  ctx.fillRect(-HALF_WORLD - boss.x, -HALF_WORLD - boss.y, WORLD_SIZE, WORLD_SIZE);
}

function drawLocalTelegraph(ctx, boss) {
  if (boss.mode !== "windup" && boss.mode !== "crystal_dash") return;
  const color = boss.phaseColor();
  const alpha = 0.42 + Math.sin(boss.anim * 11) * 0.16;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (boss.currentSkill === "glacial_lance") {
    ctx.rotate(boss.lockAngle);
    ctx.strokeStyle = hex(color, alpha * 0.48);
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.lineTo(360, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.lineTo(350, 0);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = 82 + i * 46;
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x, 17);
      ctx.stroke();
    }
  } else if (boss.currentSkill === "shard_fan") {
    ctx.rotate(boss.lockAngle);
    ctx.fillStyle = hex(color, 0.13);
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(310, -108);
    ctx.lineTo(310, 108);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hex(color, alpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(34, -10);
    ctx.lineTo(310, -108);
    ctx.moveTo(34, 10);
    ctx.lineTo(310, 108);
    ctx.stroke();
  } else {
    const rings = boss.currentSkill === "absolute_zero" ? 4 : 3;
    for (let i = 0; i < rings; i++) {
      ctx.strokeStyle = i === 1 ? `rgba(255,255,255,${alpha * 0.7})` : hex(color, alpha * (0.92 - i * 0.15));
      ctx.lineWidth = i === 0 ? 4 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, boss.r + 38 + i * 20, boss.sceneSpin * (i % 2 ? -1 : 1), boss.sceneSpin * (i % 2 ? -1 : 1) + Math.PI * 1.56);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPolarWraith(ctx, boss) {
  const bob = Math.sin(boss.anim * 1.45) * 4.5;
  const color = boss.phaseColor();
  const accent = boss.phaseAccent();
  ctx.translate(0, bob);
  drawShadow(ctx, boss);
  drawCoffinSpines(ctx, boss, color, accent);
  drawAuroraShroud(ctx, boss, color);
  drawWraithTail(ctx, boss, color);
  drawFrostArmor(ctx, boss, color, accent);
  drawExecutionArms(ctx, boss, color, accent);
  drawMaskAndCrown(ctx, boss, color, accent);
  drawFrozenHeart(ctx, boss, color, accent);
  drawPhaseHalo(ctx, boss, color, accent);
}

function drawShadow(ctx, boss) {
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.beginPath();
  ctx.ellipse(0, boss.r * 1.04, boss.r * 1.18, boss.r * 0.23, 0, 0, TAU);
  ctx.fill();
}

function drawCoffinSpines(ctx, boss, color, accent) {
  const count = 6;
  for (let i = 0; i < count; i++) {
    const side = i < count / 2 ? -1 : 1;
    const row = i % 3;
    const sway = Math.sin(boss.anim * 1.25 + i) * 5;
    const x = side * (48 + row * 27);
    const y = -38 + row * 38 + sway;
    const angle = side * (-0.52 + row * 0.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "rgba(8,18,36,0.94)";
    ctx.strokeStyle = row === 1 ? accent : color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -38 - boss.phaseLevel * 4);
    ctx.lineTo(14, -10);
    ctx.lineTo(10, 31);
    ctx.lineTo(0, 42);
    ctx.lineTo(-10, 31);
    ctx.lineTo(-14, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hex(row === 1 ? accent : color, 0.62);
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(5, 2);
    ctx.lineTo(0, 27);
    ctx.lineTo(-5, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawAuroraShroud(ctx, boss, color) {
  const sway = Math.sin(boss.anim * 1.8) * 10;
  ctx.fillStyle = boss.phaseLevel === 3 ? "rgba(30,18,48,0.86)" : "rgba(5,15,31,0.9)";
  ctx.strokeStyle = hex(color, 0.68);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-42, -46);
  ctx.bezierCurveTo(-78, -4, -70 + sway, 78, -32 + sway * 0.45, 116);
  ctx.lineTo(-7, 82);
  ctx.lineTo(0, 122 + Math.sin(boss.anim * 2.2) * 6);
  ctx.lineTo(10, 82);
  ctx.bezierCurveTo(48 + sway * 0.2, 94, 78 + sway, 2, 42, -46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(color, 0.3);
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 32, -32);
    ctx.quadraticCurveTo(side * (52 + sway * 0.2), 36, side * (28 + sway * 0.35), 91);
    ctx.stroke();
  }
}

function drawWraithTail(ctx, boss, color) {
  const tail = Math.sin(boss.anim * 2.3) * 7;
  ctx.fillStyle = hex(color, 0.34);
  ctx.beginPath();
  ctx.moveTo(-28, 48);
  ctx.quadraticCurveTo(-38, 82, -17 + tail, 120);
  ctx.lineTo(0, 93 - tail * 0.25);
  ctx.lineTo(18 + tail, 122);
  ctx.quadraticCurveTo(40, 78, 28, 48);
  ctx.closePath();
  ctx.fill();
}

function drawFrostArmor(ctx, boss, color, accent) {
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#101b31";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-44, -42);
  ctx.lineTo(-58, -10);
  ctx.lineTo(-35, 52);
  ctx.lineTo(0, 68);
  ctx.lineTo(35, 52);
  ctx.lineTo(58, -10);
  ctx.lineTo(44, -42);
  ctx.lineTo(0, -55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hex(color, 0.52);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 38, -34);
    ctx.lineTo(side * 53, -8);
    ctx.lineTo(side * 24, 12);
    ctx.lineTo(side * 7, -21);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = hex(accent, 0.72);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(-22, 29);
  ctx.lineTo(0, 55);
  ctx.lineTo(22, 29);
  ctx.closePath();
  ctx.stroke();
}

function drawExecutionArms(ctx, boss, color, accent) {
  const attacking = boss.mode.includes("dash") || boss.mode === "windup" || boss.mode === "crystal_dash";
  const scene = boss.mode.includes("scene") || boss.mode === "phase_transition";
  for (const side of [-1, 1]) {
    const shoulderX = side * 53;
    const shoulderY = -26;
    const armAngle = scene ? side * -1.1 : attacking ? side * 0.06 : side * (0.42 + Math.sin(boss.anim * 1.8) * 0.08);
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#15243d";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    polygon(ctx, 0, 0, 23, 5, -Math.PI / 2, true);
    ctx.stroke();
    ctx.rotate(armAngle);
    ctx.fillRect(side < 0 ? -48 : 5, -7, 43, 14);
    ctx.strokeRect(side < 0 ? -48 : 5, -7, 43, 14);
    ctx.restore();

    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(armAngle);
    const handX = side < 0 ? -43 : 43;
    ctx.translate(handX, 0);
    ctx.rotate(side < 0 ? Math.PI : 0);
    ctx.strokeStyle = "#07101e";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(95, 0);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(101, 0);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(96, 0);
    ctx.quadraticCurveTo(79, -42, 45, -50);
    ctx.quadraticCurveTo(70, -20, 55, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawMaskAndCrown(ctx, boss, color, accent) {
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#e9feff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-30, -58);
  ctx.lineTo(-35, -88);
  ctx.lineTo(-19, -108);
  ctx.lineTo(0, -115);
  ctx.lineTo(19, -108);
  ctx.lineTo(35, -88);
  ctx.lineTo(30, -58);
  ctx.lineTo(0, -45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#081426";
  ctx.beginPath();
  ctx.moveTo(-23, -82);
  ctx.lineTo(-5, -87);
  ctx.lineTo(0, -79);
  ctx.lineTo(5, -87);
  ctx.lineTo(23, -82);
  ctx.lineTo(13, -72);
  ctx.lineTo(0, -68);
  ctx.lineTo(-13, -72);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = -2; i <= 2; i++) {
    const height = i === 0 ? 42 : Math.abs(i) === 1 ? 32 : 23;
    ctx.fillStyle = i === 0 ? accent : color;
    ctx.beginPath();
    ctx.moveTo(i * 15 - 7, -103);
    ctx.lineTo(i * 15, -103 - height + Math.sin(boss.anim * 1.6 + i) * 2);
    ctx.lineTo(i * 15 + 7, -103);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawFrozenHeart(ctx, boss, color, accent) {
  const scale = 1 + Math.sin(boss.anim * 3.1) * 0.06 + boss.phasePulse * 0.22;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = accent;
  ctx.shadowBlur = boss.phaseLevel === 3 ? 22 : 13;
  ctx.fillStyle = accent;
  polygon(ctx, 0, 14, 18 + boss.phaseLevel * 2, 6, Math.PI / 6 + boss.sceneSpin * 0.15, true);
  ctx.fillStyle = "#ffffff";
  polygon(ctx, 0, 14, 7, 4, Math.PI / 4, true);
  ctx.restore();
}

function drawPhaseHalo(ctx, boss, color, accent) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const radius = 115 + (1 - boss.phasePulse) * 38 + Math.sin(boss.anim * 1.5) * 5;
  for (let i = 0; i < boss.phaseLevel; i++) {
    ctx.strokeStyle = hex(i === boss.phaseLevel - 1 ? accent : color, 0.25 + boss.phasePulse * 0.5);
    ctx.lineWidth = 2 + boss.phasePulse * 4;
    ctx.beginPath();
    ctx.arc(0, -9, radius + i * 19, boss.coffinSpin * (i % 2 ? -1 : 1), boss.coffinSpin * (i % 2 ? -1 : 1) + Math.PI * 1.14);
    ctx.stroke();
  }
  ctx.restore();
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function hex(color, alpha) {
  const value = color.replace("#", "");
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
}

function polygon(ctx, x, y, radius, sides, angle, fill) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + i / sides * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}
