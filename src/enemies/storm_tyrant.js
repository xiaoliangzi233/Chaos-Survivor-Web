import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";
import {
  addBossHazard,
  addBossProjectile,
  bossHazardCount,
  bossProjectileCount,
  clearBossEffects,
  findBossHazard,
} from "../systems/bossEffectRegistry.js";

export const STORM_TYRANT_PHASE_THRESHOLDS = [0.68, 0.34];
export const STORM_TYRANT_SAFE_CORRIDORS = Object.freeze({
  cage: 190,
  enhancedCage: 160,
  skyfallGapAngle: 0.82,
});
export const STORM_TYRANT_SCREEN_PRESSURE = Object.freeze({
  lanceLength: 1560,
  cageWaves: 3,
  throneBeams: [6, 7],
  peakProjectiles: 84,
  peakHazards: 18,
});

const HALF_WORLD = WORLD_SIZE / 2;
const PHASE_COLORS = ["#42e8ff", "#b48cff", "#ffd166"];
const PHASE_CORES = ["#e8feff", "#f5edff", "#fff6c7"];
const STORM_BODY_SPRITES = new Map();
const SKILL_COOLDOWNS = Object.freeze({
  thunder_lance: 2.5,
  crown_volley: 2.8,
  storm_step: 3.2,
  echo_lance: 5.4,
  thunder_cage: 12,
  skyfall_decree: 6.4,
  tempest_throne: 16,
});

export class StormTyrant extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "风暴暴君·雷冕";
    this.enhancedProfile = state.waveScenario?.bossProfile === "singularity_three_phase"
      || state.difficultyId === "singularity";
    this.mode = "intro";
    this.modeTimer = 1.15;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.currentSkill = "";
    this.currentAttack = "";
    this.lastSkills = [];
    this.skillCooldowns = Object.create(null);
    this.attacksSinceLongRecover = 0;
    this.pendingForcedSkill = "";
    this.attackTimer = 0;
    this.attackCount = 0;
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
    this.echoPending = false;
    this.sceneGapAngle = Math.random() * TAU;
    this.sceneWave = 0;
    this.sceneSpin = Math.random() * TAU;
    this.crownSpin = Math.random() * TAU;
    this.weaponAngle = -0.5;
    this.stepStartX = x;
    this.stepStartY = y;
    this.stepTargetX = x;
    this.stepTargetY = y;
    this.stepDuration = 0.42;
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
    this.anim += dt * (3.1 + this.phaseLevel * 0.72);
    this.sceneSpin += dt * (0.68 + this.phaseLevel * 0.34);
    this.crownSpin += dt * (1.15 + this.phaseLevel * 0.42);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.2);
    this.flip = p.x < this.x ? -1 : 1;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== "phase_transition" && distance < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.62;
      state.shake = Math.max(state.shake, 13);
      state.flash = Math.max(state.flash, 0.28);
      burst(p.x, p.y, 16, this.phaseColor(), 185);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    this.modeTimer -= dt;
    this.attackTimer -= dt;

    if (this.mode === "intro") {
      this.driftToIdealRange(dt, 0.08);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "phase_transition") {
      this.moveToward(0, 0, this.speed * 0.48, dt);
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
    if (this.mode === "storm_lance_dash") return this.updateLanceDash(dt, false);
    if (this.mode === "storm_echo_windup") {
      this.weaponAngle += (0.1 - this.weaponAngle) * Math.min(1, dt * 7);
      if (this.modeTimer <= 0) this.launchEchoReturn();
      return;
    }
    if (this.mode === "storm_echo_dash") return this.updateLanceDash(dt, true);
    if (this.mode === "storm_volley") return this.updateCrownVolley();
    if (this.mode === "storm_reposition") return this.updateStormStep(dt);
    if (this.mode === "storm_cage_scene") {
      this.moveToward(0, 0, this.speed * 0.52, dt);
      if (this.modeTimer <= 0) this.finishAttack(1.28, true);
      return;
    }
    if (this.mode === "storm_skyfall_scene") {
      this.driftToIdealRange(dt, -0.04);
      if (this.modeTimer <= 0) this.finishAttack(1.08, true);
      return;
    }
    if (this.mode === "storm_tempest_throne") return this.updateTempestThrone(dt);
    if (this.mode === "storm_recover") {
      this.weaponAngle += (-0.52 - this.weaponAngle) * Math.min(1, dt * 6);
      this.driftToIdealRange(dt, 0.06);
      if (this.modeTimer <= 0) this.chooseSkill();
    }
  }

  chooseSkill() {
    const p = state.player;
    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    const playerSpeed = Math.hypot(this.motion.vx, this.motion.vy);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y)) / HALF_WORLD;
    const scores = {
      thunder_lance: 4.6 + (distance > 360 ? 2.8 : 0) + this.motion.straightness * 2.2,
      crown_volley: 4.8 + (distance >= 260 && distance <= 760 ? 2.1 : 0) + Math.abs(this.motion.turn),
      storm_step: 1.4 + (distance < 210 ? 4.5 : 0) + (edge > 0.82 ? 3.6 : 0),
    };
    if (this.phaseLevel >= 2) {
      scores.echo_lance = 5.1 + this.motion.straightness * 2.5 + (distance > 310 ? 1.2 : 0);
      scores.thunder_cage = 2.8 + (edge > 0.7 ? 3.2 : 0) + Math.abs(this.motion.turn) * 1.5;
    }
    if (this.phaseLevel >= 3) {
      scores.skyfall_decree = 5 + (playerSpeed > 85 ? 2.1 : 0) + (1 - this.motion.straightness);
      scores.tempest_throne = 3.1 + this.motion.straightness * 1.7 + (edge > 0.58 ? 1.4 : 0);
    }

    let best = "thunder_lance";
    let bestScore = -Infinity;
    for (const [skill, baseScore] of Object.entries(scores)) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      let score = baseScore + Math.random() * 0.65;
      if (this.lastSkills[0] === skill) score -= 100;
      else if (this.lastSkills.includes(skill)) score -= 2;
      if (this.isSceneSkill(skill) && this.hasOwnedActiveHazards()) score -= 100;
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    this.beginSkill(best);
  }

  chooseMode() {
    const distance = Math.hypot(state.player.x - this.x, state.player.y - this.y);
    if (distance > 760) {
      this.currentAttack = "dash";
      this.beginSkill("thunder_lance");
      return;
    }
    this.chooseSkill();
    this.currentAttack = this.currentSkill;
  }

  beginSkill(skill) {
    this.currentSkill = skill || "thunder_lance";
    this.attackCount = 0;
    this.attackTimer = 0;
    this.mode = "windup";
    const windups = {
      thunder_lance: 0.72,
      crown_volley: 0.62,
      storm_step: 0.34,
      echo_lance: 0.78,
      thunder_cage: 0.95,
      skyfall_decree: 0.72,
      tempest_throne: 1.02,
    };
    this.modeTimer = windups[this.currentSkill] || 0.62;

    if (this.currentSkill === "thunder_lance" || this.currentSkill === "echo_lance") {
      this.prepareLance(this.modeTimer);
    } else if (this.currentSkill === "thunder_cage") {
      this.prepareThunderCage(this.modeTimer);
    } else if (this.currentSkill === "skyfall_decree") {
      this.prepareSkyfall(this.modeTimer);
    } else if (this.currentSkill === "tempest_throne") {
      this.prepareTempestThrone(this.modeTimer);
    } else if (this.currentSkill === "storm_step") {
      this.prepareStormStep();
    } else {
      this.lockAngle = this.angleToPredictedPlayer(0.22);
    }
    pulse(this.x, this.y, this.r + 42, this.phaseColor(), 0.24);
  }

  launchSkill(skill) {
    this.rememberSkill(skill);
    if (skill === "thunder_lance" || skill === "echo_lance") return this.launchLance(skill === "echo_lance");
    if (skill === "crown_volley") return this.launchCrownVolley();
    if (skill === "storm_step") return this.launchStormStep();
    if (skill === "thunder_cage") return this.launchThunderCage();
    if (skill === "skyfall_decree") return this.launchSkyfall();
    if (skill === "tempest_throne") return this.launchTempestThrone();
    this.finishAttack();
  }

  prepareLance(warning) {
    const target = this.predictedPlayer(0.32);
    this.lockAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.lockTargetX = target.x;
    this.lockTargetY = target.y;
    this.dashStartX = this.x;
    this.dashStartY = this.y;
    const targetDistance = Math.hypot(target.x - this.x, target.y - this.y);
    const distance = clamp(targetDistance + 420, 980, STORM_TYRANT_SCREEN_PRESSURE.lanceLength);
    this.dashEndX = this.x + Math.cos(this.lockAngle) * distance;
    this.dashEndY = this.y + Math.sin(this.lockAngle) * distance;
    this.spawnStormLine({
      x: (this.dashStartX + this.dashEndX) * 0.5,
      y: (this.dashStartY + this.dashEndY) * 0.5,
      angle: this.lockAngle,
      length: distance,
      width: this.phaseLevel >= 3 ? 30 : 27,
      armTime: warning,
      activeTime: 0.48,
      damage: this.damage * 0.58,
      style: "lance",
    });
  }

  launchLance(echo) {
    this.echoPending = echo;
    this.mode = "storm_lance_dash";
    this.modeTimer = 0.46;
    const distance = Math.hypot(this.dashEndX - this.dashStartX, this.dashEndY - this.dashStartY);
    const speed = distance / this.modeTimer;
    this.dashVx = Math.cos(this.lockAngle) * speed;
    this.dashVy = Math.sin(this.lockAngle) * speed;
    this.dashTrailTimer = 0;
    this.weaponAngle = 0.08;
    burst(this.x, this.y, 20, this.phaseColor(), 250);
    playSfx("wave");
  }

  updateLanceDash(dt, returning) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.leaveDashTrail(dt);
    if (this.modeTimer > 0) return;
    if (!returning && this.echoPending) {
      this.echoPending = false;
      this.mode = "storm_echo_windup";
      this.modeTimer = 0.68;
      const angle = this.lockAngle + Math.PI;
      this.spawnStormLine({
        x: (this.dashStartX + this.dashEndX) * 0.5,
        y: (this.dashStartY + this.dashEndY) * 0.5,
        angle: this.lockAngle,
        length: Math.hypot(this.dashEndX - this.dashStartX, this.dashEndY - this.dashStartY),
        width: this.phaseLevel >= 3 ? 32 : 29,
        armTime: this.modeTimer,
        activeTime: 0.46,
        damage: this.damage * 0.62,
        style: "echo",
      });
      this.dashVx = Math.cos(angle);
      this.dashVy = Math.sin(angle);
      pulse(this.x, this.y, this.r + 68, this.phaseColor(), 0.3);
      return;
    }
    this.fireDashWake(returning ? 10 : 8);
    this.finishAttack(returning ? 0.92 : 0.72);
  }

  launchEchoReturn() {
    const angle = this.lockAngle + Math.PI;
    const distance = Math.hypot(this.dashEndX - this.dashStartX, this.dashEndY - this.dashStartY);
    this.mode = "storm_echo_dash";
    this.modeTimer = 0.46;
    this.dashVx = Math.cos(angle) * distance / this.modeTimer;
    this.dashVy = Math.sin(angle) * distance / this.modeTimer;
    this.dashTrailTimer = 0;
    burst(this.x, this.y, 22, this.phaseColor(), 260);
    playSfx("wave");
  }

  leaveDashTrail(dt) {
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer > 0) return;
    this.dashTrailTimer = 0.042;
    const backX = this.x - this.dashVx * 0.035;
    const backY = this.y - this.dashVy * 0.035;
    trail(this.x, this.y, backX, backY, this.phaseColor(), 18);
  }

  fireDashWake(count) {
    const gap = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + this.crownSpin;
      if (angleDistance(angle, gap) < 0.42) continue;
      this.shoot(angle, 225 + (i % 2) * 28, 6, "stormOrb", this.damage * 0.3);
    }
  }

  launchCrownVolley() {
    this.mode = "storm_volley";
    this.modeTimer = 1.3;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.lockAngle = this.angleToPredictedPlayer(0.28);
    this.weaponAngle = 0.7;
  }

  updateCrownVolley() {
    if (this.attackTimer > 0) return;
    this.attackTimer = 0.3;
    this.attackCount++;
    const count = 10 + (this.phaseLevel - 1) * 2 + (this.enhancedProfile ? 2 : 0);
    const spread = 1.28 + this.phaseLevel * 0.08;
    const gap = 0.17;
    for (let i = 0; i < count; i++) {
      const offset = -spread * 0.5 + i / Math.max(1, count - 1) * spread;
      if (Math.abs(offset) < gap) continue;
      this.shoot(
        this.lockAngle + offset + Math.sin(this.attackCount * 1.7) * 0.04,
        315 + (i % 3) * 22,
        7,
        "stormCrownShard",
        this.damage * 0.38,
      );
    }
    pulse(this.x, this.y, this.r + 34 + this.attackCount * 12, this.phaseColor(), 0.16);
    playSfx("shoot");
    if (this.attackCount >= (this.phaseLevel >= 3 ? 4 : 3)) this.finishAttack(0.72);
  }

  prepareStormStep() {
    const p = state.player;
    const away = Math.atan2(this.y - p.y, this.x - p.x);
    const side = this.motion.turn >= 0 ? -1 : 1;
    const angle = away + side * Math.PI * 0.42;
    const distance = 290;
    this.stepStartX = this.x;
    this.stepStartY = this.y;
    this.stepTargetX = clamp(this.x + Math.cos(angle) * distance, -HALF_WORLD + 130, HALF_WORLD - 130);
    this.stepTargetY = clamp(this.y + Math.sin(angle) * distance, -HALF_WORLD + 130, HALF_WORLD - 130);
    if (this.edgeSafety(this.stepTargetX, this.stepTargetY) < 170) {
      this.stepTargetX = clamp(p.x + Math.cos(angle + Math.PI) * 360, -HALF_WORLD + 170, HALF_WORLD - 170);
      this.stepTargetY = clamp(p.y + Math.sin(angle + Math.PI) * 360, -HALF_WORLD + 170, HALF_WORLD - 170);
    }
  }

  launchStormStep() {
    this.mode = "storm_reposition";
    this.modeTimer = this.stepDuration;
    this.attackTimer = 0;
    burst(this.x, this.y, 14, this.phaseColor(), 170);
    playSfx("wave");
  }

  updateStormStep(dt) {
    const progress = 1 - Math.max(0, this.modeTimer) / this.stepDuration;
    const eased = 1 - Math.pow(1 - progress, 3);
    this.x = this.stepStartX + (this.stepTargetX - this.stepStartX) * eased;
    this.y = this.stepStartY + (this.stepTargetY - this.stepStartY) * eased;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.055;
      trail(this.x, this.y, this.stepStartX, this.stepStartY, this.phaseColor(), 11);
    }
    if (this.modeTimer <= 0) {
      burst(this.x, this.y, 12, this.phaseColor(), 150);
      this.finishAttack(0.38);
    }
  }

  prepareThunderCage(warning) {
    const p = state.player;
    const motionAngle = Math.hypot(this.motion.vx, this.motion.vy) > 28
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : Math.atan2(p.y - this.y, p.x - this.x);
    const center = this.predictedPlayer(0.42);
    const corridor = this.enhancedProfile
      ? STORM_TYRANT_SAFE_CORRIDORS.enhancedCage
      : STORM_TYRANT_SAFE_CORRIDORS.cage;
    const width = this.enhancedProfile ? 28 : 25;
    const offset = corridor * 0.5 + width + (p.r || 14);

    for (let waveIndex = 0; waveIndex < STORM_TYRANT_SCREEN_PRESSURE.cageWaves; waveIndex++) {
      const angle = motionAngle + (waveIndex % 2 ? Math.PI / 2 : 0);
      const normalX = -Math.sin(angle);
      const normalY = Math.cos(angle);
      const shift = (waveIndex - 1) * 54;
      const waveCenterX = center.x + Math.cos(angle) * shift;
      const waveCenterY = center.y + Math.sin(angle) * shift;
      const armTime = warning + waveIndex * 0.58;
      for (const side of [-1, 1]) {
        this.spawnStormLine({
          x: waveCenterX + normalX * offset * side,
          y: waveCenterY + normalY * offset * side,
          angle,
          length: WORLD_SIZE + 420,
          width,
          armTime,
          activeTime: 0.28,
          damage: this.damage * 0.48,
          style: "cage",
          cageWave: waveIndex,
        });
      }
    }
    this.sceneGapAngle = motionAngle;
  }

  launchThunderCage() {
    this.mode = "storm_cage_scene";
    this.modeTimer = 1.78;
    this.weaponAngle = -1.18;
    this.attacksSinceLongRecover = 0;
    burst(this.x, this.y, 28, this.phaseColor(), 220);
    playSfx("wave");
  }

  prepareSkyfall(warning) {
    const center = this.predictedPlayer(0.48);
    const movementAngle = Math.hypot(this.motion.vx, this.motion.vy) > 25
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : this.sceneSpin;
    const escapeAngle = movementAngle + (this.motion.turn >= 0 ? -1 : 1) * Math.PI * 0.62;
    this.sceneGapAngle = escapeAngle;
    const waves = this.enhancedProfile ? 4 : 3;
    const radius = this.enhancedProfile ? 72 : 68;

    for (let waveIndex = 0; waveIndex < waves; waveIndex++) {
      const ringRadius = 150 + waveIndex * 52;
      const count = 5;
      for (let i = 0; i < count; i++) {
        const angle = movementAngle + i / count * TAU + waveIndex * 0.34;
        if (angleDistance(angle, escapeAngle) < STORM_TYRANT_SAFE_CORRIDORS.skyfallGapAngle * 0.5) continue;
        const x = clamp(center.x + Math.cos(angle) * ringRadius, -HALF_WORLD + 90, HALF_WORLD - 90);
        const y = clamp(center.y + Math.sin(angle) * ringRadius, -HALF_WORLD + 90, HALF_WORLD - 90);
        this.spawnStormStrike(x, y, radius, warning + waveIndex * 0.24 + i * 0.035);
      }
    }
  }

  launchSkyfall() {
    this.mode = "storm_skyfall_scene";
    this.modeTimer = this.enhancedProfile ? 1.22 : 1.02;
    this.weaponAngle = -1.35;
    burst(this.x, this.y, 24, this.phaseColor(), 210);
    playSfx("wave");
  }

  prepareTempestThrone(warning) {
    const beams = STORM_TYRANT_SCREEN_PRESSURE.throneBeams[this.enhancedProfile ? 1 : 0];
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 24
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : this.sceneSpin;
    this.sceneGapAngle = base + Math.PI / 2;
    for (let i = 0; i < beams; i++) {
      const armTime = warning + i * 0.48;
      this.spawnStormLine({
        x: 0,
        y: 0,
        angle: base + i * Math.PI / beams,
        length: WORLD_SIZE + 520,
        width: this.enhancedProfile ? 31 : 28,
        armTime,
        activeTime: 0.25,
        damage: this.damage * 0.56,
        style: "throne",
        throneIndex: i,
      });
    }
  }

  launchTempestThrone() {
    this.mode = "storm_tempest_throne";
    const beams = STORM_TYRANT_SCREEN_PRESSURE.throneBeams[this.enhancedProfile ? 1 : 0];
    this.modeTimer = (beams - 1) * 0.48 + 0.42;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.sceneWave = 0;
    this.weaponAngle = -1.48;
    this.attacksSinceLongRecover = 0;
    burst(this.x, this.y, 38, this.phaseColor(), 285);
    pulse(this.x, this.y, this.r + 180, this.phaseColor(), 0.48);
    state.shake = Math.max(state.shake, 11);
    playSfx("wave");
  }

  updateTempestThrone(dt) {
    this.moveToward(0, 0, this.speed * 0.76, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.48;
      this.fireThroneVolley(this.attackCount++);
    }
    if (this.modeTimer <= 0) this.finishAttack(1.45, true);
  }

  fireThroneVolley(waveIndex) {
    const count = this.enhancedProfile ? 22 : 18;
    const gapAngle = this.sceneGapAngle + waveIndex * 0.38;
    const opposite = gapAngle + Math.PI;
    for (let i = 0; i < count; i++) {
      const angle = this.crownSpin + i / count * TAU;
      if (angleDistance(angle, gapAngle) < 0.3 || angleDistance(angle, opposite) < 0.3) continue;
      this.shoot(angle, 205 + (i % 3) * 26, 6.2, "stormOrb", this.damage * 0.32);
    }
    pulse(this.x, this.y, this.r + 70 + waveIndex * 14, this.phaseColor(), 0.2);
    playSfx("shoot");
  }

  spawnStormLine({
    x,
    y,
    angle,
    length,
    width,
    armTime,
    activeTime,
    damage,
    style,
    cageWave = 0,
    throneIndex = 0,
  }) {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const halfLength = length * 0.5;
    const x1 = x - directionX * halfLength;
    const y1 = y - directionY * halfLength;
    const x2 = x + directionX * halfLength;
    const y2 = y + directionY * halfLength;
    const hazard = {
      kind: "storm_laser_net",
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      length,
      width,
      color: this.phaseColor(),
      damage,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      armTime,
      armDuration: armTime,
      surgeTime: 0.1,
      style,
      cageWave,
      throneIndex,
      directionX,
      directionY,
      x1,
      y1,
      x2,
      y2,
      minX: Math.min(x1, x2) - width,
      minY: Math.min(y1, y2) - width,
      maxX: Math.max(x1, x2) + width,
      maxY: Math.max(y1, y2) + width,
      bossOwner: this,
      stormTyrantOwner: this,
    };
    return addBossHazard(this, hazard, STORM_TYRANT_SCREEN_PRESSURE.peakHazards);
  }

  spawnStormStrike(x, y, radius, armTime) {
    const hazard = {
      kind: "storm_strike",
      warningType: "circle",
      x,
      y,
      r: radius,
      color: this.phaseColor(),
      damage: this.damage * 0.5,
      life: armTime + 0.2,
      maxLife: armTime + 0.2,
      armTime,
      armDuration: armTime,
      spin: Math.random() * TAU,
      bossOwner: this,
      stormTyrantOwner: this,
    };
    return addBossHazard(this, hazard, STORM_TYRANT_SCREEN_PRESSURE.peakHazards);
  }

  shoot(angle, speed, radius, shape, damage) {
    const projectile = {
      x: this.x + Math.cos(angle) * this.r * 0.72,
      y: this.y + Math.sin(angle) * this.r * 0.72,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color: this.phaseColor(),
      damage,
      life: 5.2,
      shape,
      spin: Math.random() * TAU,
      bossProjectile: true,
      expireWithLife: true,
      bossOwner: this,
      stormTyrantOwner: this,
    };
    return addBossProjectile(this, projectile, STORM_TYRANT_SCREEN_PRESSURE.peakProjectiles);
  }

  finishAttack(recovery = null, forceLong = false, countAttack = true) {
    if (countAttack) this.attacksSinceLongRecover++;
    const long = forceLong || this.attacksSinceLongRecover >= 2;
    this.mode = "storm_recover";
    this.modeTimer = recovery ?? (long ? 1.04 : 0.5);
    if (long) this.attacksSinceLongRecover = 0;
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
    const profileScale = this.enhancedProfile ? 0.9 : 1;
    this.skillCooldowns[skill] = Math.max(
      this.skillCooldowns[skill] || 0,
      (SKILL_COOLDOWNS[skill] || 2) * profileScale,
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
    const previousVx = this.motion.vx;
    const previousVy = this.motion.vy;
    const blend = Math.min(1, dt * 7);
    this.motion.vx += (rawVx - this.motion.vx) * blend;
    this.motion.vy += (rawVy - this.motion.vy) * blend;
    const oldSpeed = Math.hypot(previousVx, previousVy);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    if (oldSpeed > 20 && speed > 20) {
      const dot = (previousVx * this.motion.vx + previousVy * this.motion.vy) / (oldSpeed * speed);
      const cross = (previousVx * this.motion.vy - previousVy * this.motion.vx) / (oldSpeed * speed);
      this.motion.straightness += ((dot + 1) * 0.5 - this.motion.straightness) * Math.min(1, dt * 3.5);
      this.motion.turn += (cross - this.motion.turn) * Math.min(1, dt * 4);
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

  driftToIdealRange(dt, bias = 0) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desired = this.phaseLevel >= 3 ? 390 : 430;
    const radial = distance < desired - 120 ? -0.46 : distance > desired + 160 ? 0.38 : bias;
    const edgePressure = Math.max(Math.abs(this.x), Math.abs(this.y)) / HALF_WORLD;
    const orbitSign = this.motion.turn >= 0 ? -1 : 1;
    const orbit = edgePressure > 0.82 ? 0 : orbitSign * (0.32 + this.phaseLevel * 0.04);
    this.x += (dx / distance * radial - dy / distance * orbit) * this.speed * dt;
    this.y += (dy / distance * radial + dx / distance * orbit) * this.speed * dt;
    if (edgePressure > 0.86) this.moveToward(0, 0, this.speed * 0.44, dt);
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
    return skill === "thunder_cage" || skill === "skyfall_decree" || skill === "tempest_throne";
  }

  hasOwnedActiveHazards() {
    return Boolean(findBossHazard(this, (hazard) => (hazard.armTime || 0) <= 0));
  }

  ownedProjectileCount() {
    return bossProjectileCount(this);
  }

  ownedHazardCount() {
    return bossHazardCount(this);
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.mode === "phase_transition" || this.dead) return;
    const threshold = this.phaseLevel <= 2
      ? this.maxHp * STORM_TYRANT_PHASE_THRESHOLDS[this.phaseLevel - 1]
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
    this.modeTimer = 1.18;
    this.currentSkill = "";
    this.pendingForcedSkill = nextPhase === 2 ? "thunder_cage" : "tempest_throne";
    this.phasePulse = 1;
    this.attacksSinceLongRecover = 0;
    this.clearOwnedEffects();
    burst(this.x, this.y, nextPhase === 3 ? 56 : 42, this.phaseColor(), 310);
    pulse(this.x, this.y, this.r + 160, this.phaseColor(), 0.52);
    state.shake = Math.max(state.shake, nextPhase === 3 ? 14 : 10);
    state.flash = Math.max(state.flash, 0.32);
    playSfx("wave");
  }

  clearOwnedEffects() {
    clearBossEffects(this);
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
    drawSkillTelegraph(ctx, this);
    drawStormTyrant(ctx, this);
    ctx.restore();
  }
}

function drawSkillTelegraph(ctx, boss) {
  if (boss.mode !== "windup" && boss.mode !== "storm_echo_windup") return;
  const skill = boss.mode === "storm_echo_windup" ? "echo_lance" : boss.currentSkill;
  const color = boss.phaseColor();
  const pulseAlpha = 0.42 + Math.sin(boss.anim * 10) * 0.18;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (skill === "thunder_lance" || skill === "echo_lance") {
    ctx.rotate(boss.mode === "storm_echo_windup" ? boss.lockAngle + Math.PI : boss.lockAngle);
    ctx.strokeStyle = hex(color, pulseAlpha);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(330, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${pulseAlpha * 0.72})`;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const x = 72 + i * 42;
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x + 18, 0);
      ctx.lineTo(x, 17);
      ctx.stroke();
    }
  } else if (skill === "crown_volley") {
    ctx.rotate(boss.lockAngle);
    ctx.fillStyle = hex(color, 0.12 + pulseAlpha * 0.08);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(300, -105);
    ctx.lineTo(300, 105);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hex(color, pulseAlpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(34, -12);
    ctx.lineTo(300, -105);
    ctx.moveTo(34, 12);
    ctx.lineTo(300, 105);
    ctx.stroke();
  } else {
    const rings = skill === "tempest_throne" ? 4 : 3;
    for (let i = 0; i < rings; i++) {
      ctx.strokeStyle = i === 1 ? `rgba(255,255,255,${pulseAlpha * 0.65})` : hex(color, pulseAlpha * (0.9 - i * 0.15));
      ctx.lineWidth = i === 0 ? 4 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, boss.r + 34 + i * 20, boss.sceneSpin * (i % 2 ? -1 : 1), boss.sceneSpin * (i % 2 ? -1 : 1) + Math.PI * 1.55);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStormTyrant(ctx, boss) {
  const bob = Math.sin(boss.anim * 1.32) * 4;
  const color = boss.phaseColor();
  const core = boss.coreColor();
  ctx.translate(0, bob);
  drawShadow(ctx, boss);
  drawStormVanes(ctx, boss, color);
  const body = stormBodySprite(boss);
  ctx.drawImage(body, -body.width / 2, -body.height / 2);
  drawArmsAndSpear(ctx, boss, color, core);
  drawPhaseAura(ctx, boss, color);
}

function stormBodySprite(boss) {
  const key = `${boss.phaseLevel}:${boss.flash > 0 ? 1 : 0}`;
  const cached = STORM_BODY_SPRITES.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 288;
  const ctx = canvas.getContext("2d", { alpha: true });
  const pose = {
    ...boss,
    anim: 0,
    sceneSpin: 0,
    phasePulse: 0,
    flash: boss.flash > 0 ? 1 : 0,
    coreColor: () => PHASE_CORES[boss.phaseLevel - 1],
  };
  const color = PHASE_COLORS[boss.phaseLevel - 1];
  const core = PHASE_CORES[boss.phaseLevel - 1];
  ctx.translate(canvas.width / 2, canvas.height / 2 + 8);
  drawRoyalMantle(ctx, pose, color);
  drawFloatingGreaves(ctx, pose, color);
  drawTorsoArmor(ctx, pose, color, core);
  drawCrownHelm(ctx, pose, color, core);
  STORM_BODY_SPRITES.set(key, canvas);
  return canvas;
}

function drawShadow(ctx, boss) {
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(0, boss.r * 0.96, boss.r * 1.08, boss.r * 0.22, 0, 0, TAU);
  ctx.fill();
}

function drawStormVanes(ctx, boss, color) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const angle = boss.crownSpin * (i % 2 ? -0.72 : 0.84) + i * TAU / count;
    const x = Math.cos(angle) * (82 + boss.phaseLevel * 8);
    const y = Math.sin(angle) * 32 - 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = "rgba(4,10,20,0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(13, -6);
    ctx.lineTo(7, 22);
    ctx.lineTo(0, 12);
    ctx.lineTo(-7, 22);
    ctx.lineTo(-13, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boss.coreColor();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 12);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawRoyalMantle(ctx, boss, color) {
  const sway = Math.sin(boss.anim * 1.8) * 9;
  ctx.fillStyle = boss.phaseLevel === 3 ? "rgba(58,40,18,0.9)" : "rgba(5,10,25,0.94)";
  ctx.strokeStyle = hex(color, 0.76);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-38, -34);
  ctx.bezierCurveTo(-78, 4, -72 + sway, 74, -36 + sway * 0.45, 104);
  ctx.lineTo(-10, 72);
  ctx.lineTo(0, 103 + Math.sin(boss.anim * 2) * 5);
  ctx.lineTo(12, 70);
  ctx.bezierCurveTo(56 + sway * 0.2, 82, 78 + sway, 8, 38, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hex(color, 0.35);
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 30, -24);
    ctx.quadraticCurveTo(side * (48 + sway * 0.25), 34, side * (28 + sway * 0.4), 82);
    ctx.stroke();
  }
}

function drawFloatingGreaves(ctx, boss, color) {
  for (const side of [-1, 1]) {
    const lift = Math.sin(boss.anim * 2.4 + side) * 3;
    ctx.save();
    ctx.translate(side * 19, 65 + lift);
    ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#0b1325";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -14);
    ctx.lineTo(12, -11);
    ctx.lineTo(9, 19);
    ctx.lineTo(2, 30);
    ctx.lineTo(-10, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boss.coreColor();
    ctx.fillRect(-3, -7, 6, 24);
    ctx.restore();
  }
}

function drawTorsoArmor(ctx, boss, color, core) {
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#10182a";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-42, -35);
  ctx.lineTo(-55, -6);
  ctx.lineTo(-34, 49);
  ctx.lineTo(0, 63);
  ctx.lineTo(34, 49);
  ctx.lineTo(55, -6);
  ctx.lineTo(42, -35);
  ctx.lineTo(0, -48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hex(color, boss.phaseLevel === 3 ? 0.74 : 0.52);
  ctx.beginPath();
  ctx.moveTo(-34, -27);
  ctx.lineTo(-48, -5);
  ctx.lineTo(-24, 8);
  ctx.lineTo(-6, -18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, -27);
  ctx.lineTo(48, -5);
  ctx.lineTo(24, 8);
  ctx.lineTo(6, -18);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = color;
  ctx.shadowBlur = boss.phaseLevel === 3 ? 20 : 12;
  ctx.fillStyle = core;
  polygon(ctx, 0, 12, 15 + boss.phaseLevel * 2, 6, Math.PI / 6 + boss.sceneSpin * 0.18, true);
  ctx.fillStyle = "#ffffff";
  polygon(ctx, 0, 12, 6, 4, Math.PI / 4, true);
  ctx.restore();

  ctx.strokeStyle = hex(core, 0.72);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-20, 30);
  ctx.lineTo(0, 50);
  ctx.lineTo(20, 30);
  ctx.closePath();
  ctx.stroke();
}

function drawArmsAndSpear(ctx, boss, color, core) {
  const attacking = boss.mode.includes("dash") || boss.mode === "windup";
  const cast = boss.mode.includes("scene") || boss.mode === "storm_tempest_throne" || boss.mode === "phase_transition";
  const spearAngle = cast ? -1.46 : attacking ? 0.02 : boss.weaponAngle;
  for (const side of [-1, 1]) {
    const shoulderX = side * 52;
    const shoulderY = -20;
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#131f35";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    polygon(ctx, 0, 0, 23, 5, -Math.PI / 2, true);
    ctx.stroke();
    const armAngle = side === 1 ? spearAngle : cast ? -1.05 : 0.5;
    ctx.rotate(armAngle);
    ctx.fillStyle = "#0b1325";
    ctx.fillRect(5, -8, 45, 16);
    ctx.strokeRect(5, -8, 45, 16);
    ctx.fillStyle = core;
    ctx.fillRect(18, -3, 19, 6);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(52, -20);
  ctx.rotate(spearAngle);
  ctx.strokeStyle = "#07101d";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(39, 0);
  ctx.lineTo(139, 0);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(39, 0);
  ctx.lineTo(146, 0);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(157, 0);
  ctx.lineTo(126, -17);
  ctx.lineTo(136, 0);
  ctx.lineTo(126, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(96, 0);
  ctx.lineTo(79, -14);
  ctx.lineTo(87, 0);
  ctx.lineTo(79, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCrownHelm(ctx, boss, color, core) {
  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#09111f";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, -55);
  ctx.lineTo(-34, -83);
  ctx.lineTo(-18, -101);
  ctx.lineTo(0, -107);
  ctx.lineTo(18, -101);
  ctx.lineTo(34, -83);
  ctx.lineTo(30, -55);
  ctx.lineTo(0, -42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = core;
  const visorHeight = Math.sin(boss.anim * 2.1) > 0.96 ? 2 : 7;
  ctx.beginPath();
  ctx.moveTo(-22, -77);
  ctx.lineTo(-5, -82);
  ctx.lineTo(0, -75);
  ctx.lineTo(5, -82);
  ctx.lineTo(22, -77);
  ctx.lineTo(13, -77 + visorHeight);
  ctx.lineTo(0, -71);
  ctx.lineTo(-13, -77 + visorHeight);
  ctx.closePath();
  ctx.fill();

  for (let i = -2; i <= 2; i++) {
    const height = i === 0 ? 38 : Math.abs(i) === 1 ? 29 : 20;
    ctx.fillStyle = i === 0 ? core : color;
    ctx.beginPath();
    ctx.moveTo(i * 14 - 6, -98);
    ctx.lineTo(i * 14, -98 - height + Math.sin(boss.anim * 1.8 + i) * 2);
    ctx.lineTo(i * 14 + 7, -98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawPhaseAura(ctx, boss, color) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hex(color, 0.24 + boss.phasePulse * 0.5);
  ctx.lineWidth = 2 + boss.phasePulse * 4;
  const radius = 108 + (1 - boss.phasePulse) * 34 + Math.sin(boss.anim * 1.7) * 5;
  for (let i = 0; i < boss.phaseLevel; i++) {
    ctx.beginPath();
    ctx.arc(0, -10, radius + i * 18, boss.sceneSpin * (i % 2 ? -1 : 1), boss.sceneSpin * (i % 2 ? -1 : 1) + Math.PI * 1.12);
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
