import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";

export const ABYSSAL_SCIENTIST_PHASE_THRESHOLD = 0.52;
export const ABYSSAL_SCIENTIST_SAFE_CORRIDORS = Object.freeze({ entropyGap: 0.72, memoryPath: 140, manifestation: 160 });
export const ABYSSAL_SCIENTIST_LIMITS = Object.freeze({ projectiles: 96, hazards: 24, releaseDuration: 4.8 });
export const ABYSSAL_SCIENTIST_PRESSURE = Object.freeze({
  horizonWaves: 6,
  manifestationPaths: 4,
  maxSceneHazards: 5,
  maxVisibleMemoryPaths: 2,
});

const HALF_WORLD = WORLD_SIZE / 2;
const PHASE_COLORS = ["#54efff", "#a855f7"];
const CORE_COLORS = ["#e9fdff", "#ff4dd8"];

export class AbyssalSealScientist extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "蚀渊博士·维恩";
    this.mode = "intro";
    this.modeTimer = 1.2;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.currentSkill = "";
    this.lastSkills = [];
    this.skillCooldowns = Object.create(null);
    this.attacksSinceRecover = 0;
    this.phaseOneCasts = 0;
    this.horizonSceneUsed = false;
    this.pendingForcedSkill = "";
    this.orbit = Math.random() * TAU;
    this.castSpin = Math.random() * TAU;
    this.reposition = null;
    this.dash = null;
    this.releaseElapsed = 0;
    this.releaseStage = 0;
    this.releaseFinalized = false;
    this.playerTrail = [];
    this.trailSampleTimer = 0;
    this.displacement = null;
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
    if (this.mode === "scientist_abyss_release") {
      this.updateRelease(dt);
      return;
    }
    this.trackPlayerMotion(dt);
    this.tickCooldowns(dt);
    this.anim += dt * (this.phaseLevel === 2 ? 5.2 : 3.8);
    this.orbit += dt * (this.phaseLevel === 2 ? 2.15 : 1.4);
    this.castSpin += dt * (0.75 + this.phaseLevel * 0.42);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.2);
    this.flip = p.x < this.x ? -1 : 1;
    this.modeTimer -= dt;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== "phase_transition" && distance < p.r + this.r && p.invuln <= 0) {
      const dashScale = this.mode === "scientist_dash" ? 0.65 : 1;
      applyPlayerDamage(this.damage * dashScale, this);
      p.invuln = 0.58;
      state.shake = Math.max(state.shake, this.mode === "scientist_dash" ? 14 : 10);
      state.flash = Math.max(state.flash, 0.24);
      burst(p.x, p.y, 14, this.phaseColor(), 180);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    if (this.mode === "intro") {
      this.driftToRange(dt, 0.12);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "phase_transition") {
      this.moveToward(0, 0, this.speed * 0.58, dt);
      if (this.modeTimer <= 0) {
        const forced = this.pendingForcedSkill;
        this.pendingForcedSkill = "";
        this.beginSkill(forced);
      }
      return;
    }
    if (this.mode === "scientist_recover") {
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "scientist_windup") {
      this.driftToRange(dt, -0.04);
      if (this.modeTimer <= 0) this.launchSkill(this.currentSkill);
      return;
    }
    if (this.mode === "scientist_cast") {
      this.driftToRange(dt, 0.04);
      if (this.modeTimer <= 0) this.finishAttack();
      return;
    }
    if (this.mode === "scientist_reposition") return this.updateReposition(dt);
    if (this.mode === "scientist_displacement") return this.updateDisplacement(dt);
    if (this.mode === "scientist_dash") return this.updateDash(dt);
    if (this.mode === "scientist_dash_replay") {
      if (this.modeTimer <= 0) this.finishAttack(1);
      return;
    }
    if (this.mode === "scientist_scene_horizon" || this.mode === "scientist_scene_manifestation") {
      this.moveToward(0, 0, this.speed * 0.72, dt);
      if (this.modeTimer <= 0) {
        this.clearOwnedEffects();
        this.finishAttack(this.mode === "scientist_scene_manifestation" ? 1.5 : 1.35, true);
      }
    }
  }

  chooseSkill() {
    if (this.phaseLevel === 1 && !this.horizonSceneUsed && this.phaseOneCasts >= 2) return this.beginSkill("event_horizon");
    if (this.attacksSinceRecover >= 2) return this.recover(this.phaseLevel === 2 ? 1 : 1.1);
    const p = state.player;
    const distance = Math.hypot(p.x - this.x, p.y - this.y);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y)) / HALF_WORLD;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const scores = {
      entropy_bloom: 4.9 + Math.abs(this.motion.turn) * 2.4 + (distance > 300 ? 0.8 : 0),
      memory_excision: 4.7 + this.motion.straightness * 2.8 + (speed > 80 ? 1.2 : 0),
      void_culture: 4.5 + (speed > 90 ? 1.6 : 0) + (distance < 520 ? 0.8 : 0),
      gravity_inversion: 4.2 + Math.abs(this.motion.turn) * 2 + (distance > 360 ? 1.2 : 0),
      emergency_transfer: 1.2 + (distance < 190 ? 5 : 0) + (edge > 0.78 ? 5.5 : 0),
    };
    if (this.phaseLevel === 2) {
      scores.entropy_bloom += 1.2;
      scores.memory_excision += 0.8;
      scores.void_culture += 1;
      scores.host_displacement = 4.8 + (distance < 260 ? 2 : 0) + (edge > 0.72 ? 2.4 : 0);
      scores.abyss_mitosis = 5 + this.motion.straightness * 1.8 + (distance > 320 ? 1.2 : 0);
      scores.living_shadow = 4.9 + Math.abs(this.motion.turn) * 3;
    }

    let best = this.phaseLevel === 2 ? "abyss_mitosis" : "entropy_bloom";
    let bestScore = -Infinity;
    for (const [skill, baseScore] of Object.entries(scores)) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      let score = baseScore + Math.random() * 0.7;
      if (this.lastSkills[0] === skill) score -= 100;
      else if (this.lastSkills.includes(skill)) score -= 2.3;
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    this.beginSkill(best);
  }

  beginSkill(skill) {
    this.currentSkill = skill || (this.phaseLevel === 2 ? "abyss_mitosis" : "entropy_bloom");
    if (this.currentSkill === "emergency_transfer") return this.startReposition();
    this.mode = "scientist_windup";
    const windups = {
      entropy_bloom: 0.55,
      memory_excision: 0.42,
      void_culture: 0.4,
      gravity_inversion: 0.48,
      event_horizon: 0.5,
      host_displacement: 0.72,
      abyss_mitosis: 0.62,
      living_shadow: 0.5,
      manifestation: 0.55,
    };
    this.modeTimer = windups[this.currentSkill] || 0.35;
    if (this.currentSkill === "host_displacement") this.prepareDisplacement();
    pulse(this.x, this.y, this.r + 52, this.phaseColor(), 0.28);
  }

  launchSkill(skill) {
    this.rememberSkill(skill);
    if (skill === "entropy_bloom") return this.launchEntropyBloom();
    if (skill === "memory_excision") return this.launchMemoryExcision();
    if (skill === "void_culture") return this.launchVoidCulture();
    if (skill === "gravity_inversion") return this.launchGravityInversion();
    if (skill === "event_horizon") return this.launchEventHorizon();
    if (skill === "host_displacement") return this.launchHostDisplacement();
    if (skill === "abyss_mitosis") return this.launchAbyssMitosis();
    if (skill === "living_shadow") return this.launchLivingShadow();
    if (skill === "manifestation") return this.launchManifestation();
    this.finishAttack();
  }

  launchEntropyBloom() {
    const playerAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const offsets = this.phaseLevel === 2 ? [0.72, -0.82, 1.18, -1.3] : [0.62, -0.78, 1.12];
    const waves = offsets.map((offset, index) => ({
      delay: 0.78 + index * 0.5,
      duration: 0.62,
      startRadius: 105,
      endRadius: 2450,
      width: this.phaseLevel === 2 ? 34 : 31,
      gapAngle: playerAngle + offset,
      gapWidth: ABYSSAL_SCIENTIST_SAFE_CORRIDORS.entropyGap,
      damage: this.damage * (this.phaseLevel === 2 ? 0.48 : 0.42),
    }));
    this.createEntropyField(this.x, this.y, waves, "entropy_bloom");
    this.mode = "scientist_cast";
    this.modeTimer = 2.9;
    this.skillCooldowns.entropy_bloom = 4.8;
    playSfx("wave");
  }

  launchMemoryExcision() {
    const recent = this.recentPlayerPath();
    this.createMemoryPath(recent, 0.9, 0.82, this.damage * 0.52, "memory_excision");
    if (this.phaseLevel === 2) {
      const anchor = recent[recent.length - 1] || state.player;
      const mirrored = recent.map((point) => ({
        x: clamp(anchor.x * 2 - point.x, -HALF_WORLD + 70, HALF_WORLD - 70),
        y: clamp(anchor.y * 2 - point.y, -HALF_WORLD + 70, HALF_WORLD - 70),
      }));
      this.createMemoryPath(mirrored, 1.42, 0.82, this.damage * 0.48, "memory_mirror");
    }
    this.mode = "scientist_cast";
    this.modeTimer = this.phaseLevel === 2 ? 2.55 : 1.9;
    this.skillCooldowns.memory_excision = 5.4;
    playSfx("level");
  }

  launchVoidCulture() {
    const target = this.predictedPlayer(0.32, 145);
    const count = this.phaseLevel === 2 ? 4 : 3;
    const base = Math.atan2(this.motion.vy, this.motion.vx) + Math.PI / count;
    for (let i = 0; i < count; i++) {
      const angle = base + i / count * TAU;
      const radius = 145 + (i % 2) * 58;
      this.createVoidNode({
        x: clamp(target.x + Math.cos(angle) * radius, -HALF_WORLD + 85, HALF_WORLD - 85),
        y: clamp(target.y + Math.sin(angle) * radius, -HALF_WORLD + 85, HALF_WORLD - 85),
        armTime: 0.86 + i * 0.24,
        activeTime: 0.32,
        radius: this.phaseLevel === 2 ? 70 : 64,
        pullRadius: 225,
        pullStrength: this.phaseLevel === 2 ? 74 : 62,
        damage: this.damage * 0.46,
        style: "void_culture",
        shardCount: this.phaseLevel === 2 ? 4 : 3,
      });
    }
    this.mode = "scientist_cast";
    this.modeTimer = 2.05;
    this.skillCooldowns.void_culture = 5.2;
    playSfx("level");
  }

  launchGravityInversion() {
    const target = this.predictedPlayer(0.28, 120);
    const motionAngle = Math.hypot(this.motion.vx, this.motion.vy) > 18
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const nx = -Math.sin(motionAngle);
    const ny = Math.cos(motionAngle);
    for (const [index, side] of [-1, 1].entries()) {
      const fromX = clamp(target.x + nx * side * 430 - Math.cos(motionAngle) * 260, -HALF_WORLD + 90, HALF_WORLD - 90);
      const fromY = clamp(target.y + ny * side * 430 - Math.sin(motionAngle) * 260, -HALF_WORLD + 90, HALF_WORLD - 90);
      const toX = clamp(target.x - nx * side * 430 + Math.cos(motionAngle) * 260, -HALF_WORLD + 90, HALF_WORLD - 90);
      const toY = clamp(target.y - ny * side * 430 + Math.sin(motionAngle) * 260, -HALF_WORLD + 90, HALF_WORLD - 90);
      this.createVoidNode({
        x: fromX,
        y: fromY,
        fromX,
        fromY,
        toX,
        toY,
        armTime: 0.82 + index * 0.38,
        activeTime: 0.86,
        radius: 58,
        pullRadius: 250,
        pullStrength: 82,
        damage: this.damage * 0.42,
        style: "gravity_inversion",
        shardCount: 0,
      });
    }
    this.mode = "scientist_cast";
    this.modeTimer = 2.35;
    this.skillCooldowns.gravity_inversion = 5.8;
    playSfx("wave");
  }

  launchEventHorizon() {
    this.clearOwnedEffects();
    const playerAngle = Math.atan2(state.player.y, state.player.x);
    const waves = Array.from({ length: ABYSSAL_SCIENTIST_PRESSURE.horizonWaves }, (_, index) => ({
      delay: 0.95 + index * 0.67,
      duration: 0.58,
      startRadius: 90,
      endRadius: 3560,
      width: 34,
      gapAngle: playerAngle + (index % 2 ? -1 : 1) * (0.58 + index * 0.16),
      gapWidth: 0.76,
      damage: this.damage * 0.54,
    }));
    this.createEntropyField(0, 0, waves, "event_horizon", 88);
    this.horizonSceneUsed = true;
    this.mode = "scientist_scene_horizon";
    this.modeTimer = 5.15;
    this.skillCooldowns.event_horizon = 15;
    this.attacksSinceRecover = 0;
    state.shake = Math.max(state.shake, 8);
    playSfx("wave");
  }

  prepareDisplacement() {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const side = this.edgeSafety(this.x - dy / distance * 330, this.y + dx / distance * 330)
      >= this.edgeSafety(this.x + dy / distance * 330, this.y - dx / distance * 330) ? 1 : -1;
    const targetX = clamp(this.x - dy / distance * side * 330 - dx / distance * 80, -HALF_WORLD + 95, HALF_WORLD - 95);
    const targetY = clamp(this.y + dx / distance * side * 330 - dy / distance * 80, -HALF_WORLD + 95, HALF_WORLD - 95);
    this.displacement = { fromX: this.x, fromY: this.y, targetX, targetY, teleported: false };
    this.createVoidNode({
      x: this.x,
      y: this.y,
      armTime: 0.72,
      activeTime: 0.3,
      radius: 76,
      pullRadius: 0,
      pullStrength: 0,
      damage: this.damage * 0.5,
      style: "host_shell",
      shardCount: 0,
    });
    this.createVoidNode({
      x: targetX,
      y: targetY,
      armTime: 1.08,
      activeTime: 0.3,
      radius: 76,
      pullRadius: 0,
      pullStrength: 0,
      damage: this.damage * 0.5,
      style: "host_shell",
      shardCount: 0,
    });
  }

  launchHostDisplacement() {
    if (!this.displacement) this.prepareDisplacement();
    const oldX = this.x;
    const oldY = this.y;
    this.x = this.displacement.targetX;
    this.y = this.displacement.targetY;
    this.displacement.teleported = true;
    trail(this.x, this.y, oldX, oldY, this.phaseColor(), 28);
    this.mode = "scientist_displacement";
    this.modeTimer = 0.72;
    this.skillCooldowns.host_displacement = 6.1;
    playSfx("wave");
  }

  updateDisplacement() {
    if (this.modeTimer <= 0) {
      this.displacement = null;
      this.finishAttack(0.9);
    }
  }

  launchAbyssMitosis() {
    const aim = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    for (const side of [-1, 1]) {
      this.spawnAbyssCore(aim + side * 0.34, side);
    }
    this.mode = "scientist_cast";
    this.modeTimer = 1.75;
    this.skillCooldowns.abyss_mitosis = 6.4;
    playSfx("shoot");
  }

  launchLivingShadow() {
    const target = this.predictedPlayer(0.3, 145);
    const base = Math.atan2(target.y - this.y, target.x - this.x);
    for (let index = 0; index < 3; index++) {
      const angle = base + (index - 1) * 0.78;
      const start = {
        x: clamp(this.x + Math.cos(angle + Math.PI) * 780, -HALF_WORLD + 70, HALF_WORLD - 70),
        y: clamp(this.y + Math.sin(angle + Math.PI) * 780, -HALF_WORLD + 70, HALF_WORLD - 70),
      };
      const end = {
        x: clamp(target.x + Math.cos(angle) * 720, -HALF_WORLD + 70, HALF_WORLD - 70),
        y: clamp(target.y + Math.sin(angle) * 720, -HALF_WORLD + 70, HALF_WORLD - 70),
      };
      const points = sampleCubicPath(
        start,
        { x: start.x + Math.cos(angle + 0.9) * 520, y: start.y + Math.sin(angle + 0.9) * 520 },
        { x: end.x - Math.cos(angle - 0.9) * 520, y: end.y - Math.sin(angle - 0.9) * 520 },
        end,
        16,
      );
      this.createMemoryPath(points, 0.92 + index * 0.5, 0.72, this.damage * 0.54, "living_shadow");
    }
    this.mode = "scientist_cast";
    this.modeTimer = 2.8;
    this.skillCooldowns.living_shadow = 6.6;
    playSfx("wave");
  }

  launchManifestation() {
    this.clearOwnedEffects();
    const target = this.predictedPlayer(0.18, 80);
    for (let index = 0; index < ABYSSAL_SCIENTIST_PRESSURE.manifestationPaths; index++) {
      const angle = this.orbit + index / ABYSSAL_SCIENTIST_PRESSURE.manifestationPaths * TAU;
      const start = { x: Math.cos(angle) * (HALF_WORLD - 80), y: Math.sin(angle) * (HALF_WORLD - 80) };
      const end = { x: -start.x, y: -start.y };
      const bend = index % 2 ? 620 : -620;
      const points = sampleCubicPath(
        start,
        { x: target.x - Math.sin(angle) * bend, y: target.y + Math.cos(angle) * bend },
        { x: target.x + Math.sin(angle) * bend, y: target.y - Math.cos(angle) * bend },
        end,
        18,
      );
      this.createMemoryPath(points, 1 + index * 0.72, 0.3, this.damage * 0.62, "manifestation_tendril");
    }
    const playerAngle = Math.atan2(state.player.y, state.player.x);
    const waves = [0, 1, 2].map((index) => ({
      delay: 3.9 + index * 0.58,
      duration: 0.56,
      startRadius: 100,
      endRadius: 3560,
      width: 36,
      gapAngle: playerAngle + (index - 1) * 1.18,
      gapWidth: 0.8,
      damage: this.damage * 0.62,
    }));
    this.createEntropyField(0, 0, waves, "manifestation_core", 110);
    this.mode = "scientist_scene_manifestation";
    this.modeTimer = 6.05;
    this.skillCooldowns.manifestation = 18;
    this.attacksSinceRecover = 0;
    state.shake = Math.max(state.shake, 11);
    playSfx("wave");
  }

  launchSealCalibration() {
    const center = this.predictedPlayer(0.32, 160);
    const angle = Math.hypot(this.motion.vx, this.motion.vy) > 25
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    [-220, 0, 220].forEach((offset, index) => {
      this.createSealLine({
        x: center.x + nx * offset,
        y: center.y + ny * offset,
        angle,
        length: WORLD_SIZE * 1.28,
        width: 26,
        armTime: 0.92 + index * 0.36,
        activeTime: 0.2,
        damage: this.damage * 0.56,
        style: "calibration",
      });
    });
    this.mode = "scientist_cast";
    this.modeTimer = 1.92;
    this.skillCooldowns.seal_calibration = 4.6;
    playSfx("wave");
  }

  launchDarkCentrifuge() {
    const aim = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    const offsets = [-0.92, -0.56, -0.28, 0.28, 0.56, 0.92];
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < offsets.length; i++) {
        const offset = offsets[i];
        this.spawnShard(this.x, this.y, aim + offset, {
          speed: layer === 0 ? 220 : 300,
          damage: this.damage * 0.24,
          curve: (i % 2 ? 1 : -1) * (layer === 0 ? 0.18 : -0.12),
          radius: layer === 0 ? 9 : 7,
        });
      }
    }
    this.mode = "scientist_cast";
    this.modeTimer = 1.05;
    this.skillCooldowns.dark_centrifuge = 4.2;
    playSfx("shoot");
  }

  launchSuppressantDrop() {
    const p = this.predictedPlayer(0.35, 150);
    const speed = Math.max(1, Math.hypot(this.motion.vx, this.motion.vy));
    const nx = speed > 20 ? this.motion.vx / speed : 1;
    const ny = speed > 20 ? this.motion.vy / speed : 0;
    const sx = -ny;
    const sy = nx;
    for (let batch = 0; batch < 3; batch++) {
      for (const side of [-1, 1]) {
        const forward = (batch - 1) * 190;
        const lateral = side * (118 + batch * 42);
        this.createVialBlast(
          clamp(p.x + nx * forward + sx * lateral, -HALF_WORLD + 80, HALF_WORLD - 80),
          clamp(p.y + ny * forward + sy * lateral, -HALF_WORLD + 80, HALF_WORLD - 80),
          0.8 + batch * 0.46 + (side > 0 ? 0.08 : 0),
          this.damage * 0.48,
          "suppressant",
          3,
        );
      }
    }
    this.mode = "scientist_cast";
    this.modeTimer = 2.08;
    this.skillCooldowns.suppressant_drop = 5.1;
    playSfx("level");
  }

  launchSealExperiment() {
    this.clearOwnedEffects();
    const p = state.player;
    const corridor = ABYSSAL_SCIENTIST_SAFE_CORRIDORS.seal;
    const width = 25;
    const halfGap = (corridor + (width + (p.r || 14)) * 2) * 0.5;
    const center = this.predictedPlayer(0.16, 90);
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 20 ? Math.atan2(this.motion.vy, this.motion.vx) : this.orbit;
    for (let wave = 0; wave < 5; wave++) {
      const angle = base + wave * Math.PI / 5;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const lines = [-halfGap, halfGap].map((offset) => lineFromCenter(
        center.x + nx * offset,
        center.y + ny * offset,
        angle,
        WORLD_SIZE * 1.3,
      ));
      this.createSealLine({
        lines,
        width,
        armTime: 1 + wave * 0.72,
        activeTime: 0.32,
        damage: this.damage * 0.58,
        style: "seal_scene",
        scene: true,
      });
      if (wave === 1 || wave === 3) {
        this.spawnShardRing(this.x, this.y, 12, {
          speed: 185 + wave * 12,
          damage: this.damage * 0.18,
          gapAngle: Math.atan2(p.y - this.y, p.x - this.x),
          gapWidth: 0.58,
          delay: 1 + wave * 0.72,
        });
      }
    }
    this.sealSceneUsed = true;
    this.mode = "scientist_scene_seal";
    this.modeTimer = 4.25;
    this.skillCooldowns.seal_experiment = 15;
    this.attacksSinceRecover = 0;
    state.shake = Math.max(state.shake, 7);
    playSfx("wave");
  }

  startReposition() {
    const p = state.player;
    const nearEdge = Math.max(Math.abs(this.x), Math.abs(this.y)) / HALF_WORLD > 0.72;
    let tx;
    let ty;
    if (nearEdge) {
      tx = this.x * 0.48;
      ty = this.y * 0.48;
    } else {
      const angle = Math.atan2(p.y - this.y, p.x - this.x) + (this.motion.turn >= 0 ? -1 : 1) * Math.PI / 2;
      const distance = clamp(Math.hypot(p.x - this.x, p.y - this.y), 220, 340);
      tx = this.x + Math.cos(angle) * distance;
      ty = this.y + Math.sin(angle) * distance;
    }
    this.reposition = {
      fromX: this.x,
      fromY: this.y,
      toX: clamp(tx, -HALF_WORLD + 100, HALF_WORLD - 100),
      toY: clamp(ty, -HALF_WORLD + 100, HALF_WORLD - 100),
      duration: 0.58,
    };
    this.rememberSkill("emergency_transfer");
    this.mode = "scientist_reposition";
    this.modeTimer = this.reposition.duration;
    this.skillCooldowns.emergency_transfer = 3.2;
  }

  updateReposition(dt) {
    if (!this.reposition) return this.finishAttack(0.45, false, false);
    const t = clamp(1 - this.modeTimer / this.reposition.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const oldX = this.x;
    const oldY = this.y;
    this.x = this.reposition.fromX + (this.reposition.toX - this.reposition.fromX) * eased;
    this.y = this.reposition.fromY + (this.reposition.toY - this.reposition.fromY) * eased;
    trail(this.x, this.y, oldX, oldY, this.phaseColor(), 14);
    if (this.modeTimer <= 0) {
      this.reposition = null;
      this.finishAttack(0.5, false, false);
    }
  }

  prepareDash() {
    const target = this.predictedPlayer(0.3, 170);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const endX = clamp(target.x + nx * 180, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    const endY = clamp(target.y + ny * 180, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    const angle = Math.atan2(ny, nx);
    this.dash = { startX: this.x, startY: this.y, targetX: target.x, targetY: target.y, endX, endY, angle, duration: 0.44 };
    const cx = (this.x + endX) * 0.5;
    const cy = (this.y + endY) * 0.5;
    this.createSealLine({
      x: cx,
      y: cy,
      angle,
      length: Math.max(1600, distance + 520),
      width: 42,
      armTime: 0.72,
      activeTime: 0.44,
      damage: 0,
      noDamage: true,
      style: "dash_warning",
    });
  }

  launchDash() {
    this.mode = "scientist_dash";
    this.modeTimer = this.dash?.duration || 0.44;
    this.skillCooldowns.backlash_dash = 6.2;
    playSfx("wave");
  }

  updateDash(dt) {
    if (!this.dash) return this.finishAttack(1);
    const t = clamp(1 - this.modeTimer / this.dash.duration, 0, 1);
    const oldX = this.x;
    const oldY = this.y;
    this.x = this.dash.startX + (this.dash.endX - this.dash.startX) * t;
    this.y = this.dash.startY + (this.dash.endY - this.dash.startY) * t;
    trail(this.x, this.y, oldX, oldY, this.phaseColor(), 22);
    if (this.modeTimer <= 0) {
      const cx = (this.dash.startX + this.dash.endX) * 0.5;
      const cy = (this.dash.startY + this.dash.endY) * 0.5;
      this.createSealLine({
        x: cx,
        y: cy,
        angle: this.dash.angle,
        length: 1600,
        width: 31,
        armTime: 0.6,
        activeTime: 0.24,
        damage: this.damage * 0.45,
        style: "dash_replay",
      });
      this.spawnShardFan(this.dash.endX, this.dash.endY, this.dash.angle + Math.PI, 14, 2.15, {
        speed: 305,
        damage: this.damage * 0.2,
        delay: 0.6,
        centerGap: 0.22,
      });
      this.mode = "scientist_dash_replay";
      this.modeTimer = 0.94;
    }
  }

  launchDarkTide() {
    const target = this.predictedPlayer(0.24, 120);
    const baseY = clamp(target.y, -1050, 1050);
    [-420, -140, 140, 420].forEach((offset, index) => {
      const bend = (index % 2 ? -1 : 1) * (230 + index * 24);
      const points = sampleCubicPath(
        { x: -HALF_WORLD + 70, y: clamp(baseY + offset, -HALF_WORLD + 100, HALF_WORLD - 100) },
        { x: -760, y: clamp(baseY + offset + bend, -HALF_WORLD + 100, HALF_WORLD - 100) },
        { x: 760, y: clamp(baseY + offset - bend, -HALF_WORLD + 100, HALF_WORLD - 100) },
        { x: HALF_WORLD - 70, y: clamp(baseY + offset, -HALF_WORLD + 100, HALF_WORLD - 100) },
        20,
      );
      this.createTendrilPath(points, 0.9 + index * 0.45, 0.25, 30, this.damage * 0.58, "dark_tide");
    });
    this.mode = "scientist_cast";
    this.modeTimer = 2.62;
    this.skillCooldowns.dark_tide = 6.5;
    playSfx("wave");
  }

  launchCorruptionRain() {
    const p = this.predictedPlayer(0.4, 170);
    const speed = Math.max(1, Math.hypot(this.motion.vx, this.motion.vy));
    const nx = speed > 20 ? this.motion.vx / speed : 1;
    const ny = speed > 20 ? this.motion.vy / speed : 0;
    const sx = -ny;
    const sy = nx;
    const lanes = [-330, -155, 155, 330];
    for (let batch = 0; batch < 3; batch++) {
      lanes.forEach((lane, laneIndex) => {
        const forward = (batch - 1) * 235 + (laneIndex % 2 ? 40 : -40);
        const x = clamp(p.x + nx * forward + sx * lane, -HALF_WORLD + 80, HALF_WORLD - 80);
        const y = clamp(p.y + ny * forward + sy * lane, -HALF_WORLD + 80, HALF_WORLD - 80);
        this.createVialBlast(x, y, 0.78 + batch * 0.48 + laneIndex * 0.055, this.damage * 0.5, "corruption", 4);
      });
    }
    this.mode = "scientist_cast";
    this.modeTimer = 2.3;
    this.skillCooldowns.corruption_rain = 6.8;
    playSfx("level");
  }

  launchCollapseCentrifuge() {
    const gapAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    this.spawnShardRing(this.x, this.y, 14, {
      speed: 220,
      damage: this.damage * 0.2,
      gapAngle,
      gapWidth: 0.5,
      curve: 0.12,
    });
    this.spawnShardRing(this.x, this.y, 14, {
      speed: 310,
      damage: this.damage * 0.2,
      gapAngle,
      gapWidth: 0.5,
      curve: -0.1,
      delay: 0.55,
      spinOffset: 0.08,
    });
    this.mode = "scientist_cast";
    this.modeTimer = 1.45;
    this.skillCooldowns.collapse_centrifuge = 4.8;
    playSfx("shoot");
  }

  launchSealInversion() {
    this.clearOwnedEffects();
    const p = state.player;
    const center = this.predictedPlayer(0.12, 70);
    const corridor = ABYSSAL_SCIENTIST_SAFE_CORRIDORS.inversion;
    const width = 27;
    const halfGap = (corridor + (width + (p.r || 14)) * 2) * 0.5;
    const base = Math.hypot(this.motion.vx, this.motion.vy) > 20 ? Math.atan2(this.motion.vy, this.motion.vx) : this.orbit;
    for (let wave = 0; wave < 6; wave++) {
      const armTime = 1 + wave * 0.72;
      const angle = base + wave * Math.PI / 6;
      if (wave % 2 === 0) {
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const lines = [-halfGap, halfGap].map((offset) => lineFromCenter(
          center.x + nx * offset,
          center.y + ny * offset,
          angle,
          WORLD_SIZE * 1.3,
        ));
        this.createSealLine({
          lines,
          width,
          armTime,
          activeTime: 0.32,
          damage: this.damage * 0.62,
          style: "inversion",
          scene: true,
        });
      } else {
        const offset = (wave === 1 ? -1 : 1) * 310;
        const points = sampleCubicPath(
          { x: -HALF_WORLD + 70, y: clamp(center.y + offset, -HALF_WORLD + 100, HALF_WORLD - 100) },
          { x: -760, y: clamp(center.y + offset + 260, -HALF_WORLD + 100, HALF_WORLD - 100) },
          { x: 760, y: clamp(center.y + offset - 260, -HALF_WORLD + 100, HALF_WORLD - 100) },
          { x: HALF_WORLD - 70, y: clamp(center.y + offset, -HALF_WORLD + 100, HALF_WORLD - 100) },
          20,
        );
        this.createTendrilPath(points, armTime, 0.32, 30, this.damage * 0.6, "inversion");
      }
    }
    const gapAngle = Math.atan2(p.y - this.y, p.x - this.x);
    this.spawnShardRing(this.x, this.y, 24, {
      speed: 285,
      damage: this.damage * 0.18,
      gapAngle,
      gapWidth: 0.52,
      oppositeGap: true,
      delay: 5.1,
    });
    for (let i = 0; i < 2; i++) {
      this.createSealLine({
        x: center.x,
        y: center.y,
        angle: base + (i ? -Math.PI / 4 : Math.PI / 4),
        length: WORLD_SIZE * 1.28,
        width: 30,
        armTime: 5.55 + i * 0.45,
        activeTime: 0.22,
        damage: this.damage * 0.66,
        style: "inversion_final",
        scene: true,
      });
    }
    this.mode = "scientist_scene_inversion";
    this.modeTimer = 6.4;
    this.skillCooldowns.seal_inversion = 18;
    this.attacksSinceRecover = 0;
    state.shake = Math.max(state.shake, 10);
    playSfx("wave");
  }

  createEntropyField(x, y, waves, style, pullStrength = 0) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards) return null;
    const duration = Math.max(...waves.map((wave) => wave.delay + wave.duration), 0);
    const hazard = {
      kind: "scientist_entropy_field",
      warningType: "ring",
      x,
      y,
      r: Math.max(...waves.map((wave) => wave.endRadius), 0),
      waves,
      elapsed: 0,
      activeWaveIndex: -1,
      pullRadius: 720,
      pullStrength,
      damage: Math.max(...waves.map((wave) => wave.damage), 0),
      life: duration + 0.08,
      maxLife: duration + 0.08,
      style,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  createMemoryPath(points, armTime, activeTime, damage, style) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards || !points?.length) return null;
    const middle = points[Math.floor(points.length / 2)];
    const warningLead = 0.95;
    const hazard = {
      kind: "scientist_memory_path",
      warningType: "path",
      x: middle.x,
      y: middle.y,
      points,
      r: 28,
      width: 28,
      damage,
      armTime,
      armDuration: warningLead,
      delayedWarning: armTime > warningLead,
      activeDuration: activeTime,
      activeTime: 0,
      pathHead: 0,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      style,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  createVoidNode(options) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards) return null;
    const hazard = {
      kind: "scientist_void_node",
      warningType: "circle",
      x: options.x,
      y: options.y,
      fromX: options.fromX ?? options.x,
      fromY: options.fromY ?? options.y,
      toX: options.toX ?? options.x,
      toY: options.toY ?? options.y,
      r: options.radius || 64,
      pullRadius: options.pullRadius || 0,
      pullStrength: options.pullStrength || 0,
      damage: options.damage,
      armTime: options.armTime,
      armDuration: options.armTime,
      activeDuration: options.activeTime,
      activeTime: 0,
      life: options.armTime + options.activeTime,
      maxLife: options.armTime + options.activeTime,
      style: options.style,
      shardCount: options.shardCount || 0,
      shardAngle: Math.atan2(state.player.y - options.y, state.player.x - options.x),
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  recentPlayerPath() {
    const points = this.playerTrail.slice(-12).map((point) => ({ x: point.x, y: point.y }));
    if (points.length >= 5) return points;
    const p = state.player;
    const speed = Math.max(1, Math.hypot(this.motion.vx, this.motion.vy));
    const nx = speed > 18 ? this.motion.vx / speed : 1;
    const ny = speed > 18 ? this.motion.vy / speed : 0;
    return Array.from({ length: 10 }, (_, index) => ({
      x: clamp(p.x - nx * (9 - index) * 58, -HALF_WORLD + 70, HALF_WORLD - 70),
      y: clamp(p.y - ny * (9 - index) * 58, -HALF_WORLD + 70, HALF_WORLD - 70),
    }));
  }

  spawnAbyssCore(angle, side) {
    if (this.ownedProjectileCount() >= ABYSSAL_SCIENTIST_LIMITS.projectiles - 20) return;
    const speed = 145;
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * 68,
      y: this.y + Math.sin(angle) * 68,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 22,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      damage: this.damage * 0.32,
      life: 3.8,
      shape: "scientistAbyssCore",
      spin: angle,
      splitTimer: 0.9,
      splitCount: 10,
      splitSide: side,
      bossProjectile: true,
      expireWithLife: true,
      abyssScientistOwner: this,
    });
  }

  splitAbyssCore(projectile) {
    if (!projectile || this.mode === "scientist_abyss_release") return;
    const base = Math.atan2(projectile.vy, projectile.vx);
    const count = projectile.splitCount || 10;
    for (let i = 0; i < count; i++) {
      let offset = -1.45 + i / Math.max(1, count - 1) * 2.9;
      if (Math.abs(offset) < 0.28) offset = offset < 0 ? -0.28 : 0.28;
      this.spawnShard(projectile.x, projectile.y, base + offset, {
        speed: 255 + (i % 3) * 24,
        damage: this.damage * 0.2,
        curve: projectile.splitSide * (i % 2 ? 0.1 : -0.08),
        radius: 8,
      });
    }
    burst(projectile.x, projectile.y, 14, this.phaseColor(), 180);
    pulse(projectile.x, projectile.y, 92, this.coreColor(), 0.25);
  }

  edgeSafety(x, y) {
    return Math.min(HALF_WORLD - Math.abs(x), HALF_WORLD - Math.abs(y));
  }

  createSealLine(options) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards) return null;
    const lines = options.lines || null;
    const hazard = {
      kind: "scientist_seal_line",
      x: options.x ?? 0,
      y: options.y ?? 0,
      angle: options.angle || 0,
      length: options.length || 0,
      lines,
      r: options.width || 24,
      width: options.width || 24,
      damage: options.damage || 0,
      noDamage: Boolean(options.noDamage),
      armTime: options.armTime,
      armDuration: options.armTime,
      activeDuration: options.activeTime,
      activeTime: 0,
      life: options.armTime + options.activeTime,
      maxLife: options.armTime + options.activeTime,
      warningType: "line",
      delayedWarning: Boolean(options.delayedWarning),
      style: options.style,
      sceneSeal: Boolean(options.scene),
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    if (lines?.length) {
      hazard.x = lines.reduce((sum, line) => sum + (line.x1 + line.x2) * 0.5, 0) / lines.length;
      hazard.y = lines.reduce((sum, line) => sum + (line.y1 + line.y2) * 0.5, 0) / lines.length;
    }
    world.hazards.push(hazard);
    return hazard;
  }

  createVialBlast(x, y, armTime, damage, style, shardCount) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards) return null;
    const hazard = {
      kind: "scientist_vial_blast",
      warningType: "circle",
      x,
      y,
      r: style === "corruption" ? 62 : 68,
      damage,
      armTime,
      armDuration: armTime,
      activeDuration: 0.22,
      activeTime: 0,
      life: armTime + 0.22,
      maxLife: armTime + 0.22,
      style,
      shardCount,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  createTendrilPath(points, armTime, activeTime, width, damage, style) {
    if (this.ownedHazardCount() >= ABYSSAL_SCIENTIST_LIMITS.hazards) return null;
    const middle = points[Math.floor(points.length / 2)];
    const hazard = {
      kind: "scientist_tendril_path",
      warningType: "path",
      x: middle.x,
      y: middle.y,
      points,
      r: width,
      width,
      damage,
      armTime,
      armDuration: armTime,
      activeDuration: activeTime,
      activeTime: 0,
      life: armTime + activeTime,
      maxLife: armTime + activeTime,
      style,
      delayedWarning: false,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      abyssScientistOwner: this,
    };
    world.hazards.push(hazard);
    return hazard;
  }

  releaseVialShards(hazard) {
    const count = hazard.shardCount || 0;
    if (!count || this.mode === "scientist_abyss_release") return;
    const escapeAngle = hazard.shardAngle ?? Math.atan2(state.player.y - hazard.y, state.player.x - hazard.x);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) * 0.5) * 0.7;
      this.spawnShard(hazard.x, hazard.y, escapeAngle + Math.PI + offset, {
        speed: 225 + i * 18,
        damage: this.damage * 0.16,
        radius: 7,
      });
    }
  }

  spawnShardRing(x, y, count, options = {}) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + (options.spinOffset || 0);
      const distanceFromGap = Math.abs(wrapAngle(angle - options.gapAngle));
      const oppositeDistance = Math.abs(wrapAngle(angle - options.gapAngle - Math.PI));
      if (distanceFromGap < (options.gapWidth || 0) * 0.5) continue;
      if (options.oppositeGap && oppositeDistance < (options.gapWidth || 0) * 0.5) continue;
      this.spawnShard(x, y, angle, options);
    }
  }

  spawnShardFan(x, y, baseAngle, count, spread, options = {}) {
    for (let i = 0; i < count; i++) {
      let offset = -spread * 0.5 + i / Math.max(1, count - 1) * spread;
      const gap = options.centerGap || 0;
      if (Math.abs(offset) < gap) offset = offset < 0 ? -gap : gap;
      this.spawnShard(x, y, baseAngle + offset, options);
    }
  }

  spawnShard(x, y, angle, options = {}) {
    if (this.ownedProjectileCount() >= ABYSSAL_SCIENTIST_LIMITS.projectiles) return;
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
      curve: options.curve || 0,
      r: options.radius || 8,
      color: this.phaseColor(),
      coreColor: this.coreColor(),
      damage: options.damage || this.damage * 0.2,
      life: delay + (options.life || 3.6),
      shape: "scientistAbyssShard",
      spin: angle,
      hidden: delay > 0,
      nonColliding: delay > 0,
      bossProjectile: true,
      expireWithLife: true,
      abyssScientistOwner: this,
    });
  }

  finishAttack(recovery = null, forceLong = false, countAttack = true) {
    if (countAttack && !forceLong) {
      this.attacksSinceRecover++;
      if (this.phaseLevel === 1 && this.currentSkill !== "event_horizon") this.phaseOneCasts++;
    }
    if (forceLong) this.attacksSinceRecover = 0;
    const long = forceLong || this.attacksSinceRecover >= 2;
    this.recover(recovery ?? (long ? (this.phaseLevel === 2 ? 1 : 1.1) : 0.5));
  }

  recover(duration) {
    this.mode = "scientist_recover";
    this.modeTimer = duration;
    this.currentSkill = "";
    this.dash = null;
    if (duration >= 1) this.attacksSinceRecover = 0;
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
    const cooldowns = {
      entropy_bloom: 4.8,
      memory_excision: 5.4,
      void_culture: 5.2,
      gravity_inversion: 5.8,
      emergency_transfer: 3.2,
      event_horizon: 15,
      host_displacement: 6.1,
      abyss_mitosis: 6.4,
      living_shadow: 6.6,
      manifestation: 18,
    };
    this.skillCooldowns[skill] = Math.max(this.skillCooldowns[skill] || 0, cooldowns[skill] || 1.5);
  }

  tickCooldowns(dt) {
    for (const skill of Object.keys(this.skillCooldowns)) this.skillCooldowns[skill] = Math.max(0, this.skillCooldowns[skill] - dt);
  }

  trackPlayerMotion(dt) {
    const p = state.player;
    if (!p || dt <= 0) return;
    const rawVx = clamp((p.x - this.motion.lastX) / dt, -540, 540);
    const rawVy = clamp((p.y - this.motion.lastY) / dt, -540, 540);
    const blend = Math.min(1, dt * 6);
    this.motion.vx += (rawVx - this.motion.vx) * blend;
    this.motion.vy += (rawVy - this.motion.vy) * blend;
    const heading = Math.atan2(this.motion.vy, this.motion.vx);
    const delta = wrapAngle(heading - this.motion.lastHeading);
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const straightTarget = speed < 18 ? 0.35 : 1 - Math.min(1, Math.abs(delta) / 0.48);
    this.motion.straightness += (straightTarget - this.motion.straightness) * Math.min(1, dt * 4);
    this.motion.turn += (clamp(delta / Math.max(dt, 0.001), -1, 1) - this.motion.turn) * Math.min(1, dt * 3.4);
    this.motion.lastHeading = heading;
    this.motion.lastX = p.x;
    this.motion.lastY = p.y;
    this.trailSampleTimer -= dt;
    if (this.trailSampleTimer <= 0) {
      this.trailSampleTimer = 0.1;
      const last = this.playerTrail[this.playerTrail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= 12) {
        this.playerTrail.push({ x: p.x, y: p.y });
        if (this.playerTrail.length > 18) this.playerTrail.shift();
      }
    }
  }

  predictedPlayer(seconds, maxDistance) {
    const p = state.player;
    const speed = Math.max(1, Math.hypot(this.motion.vx, this.motion.vy));
    const distance = Math.min(maxDistance, speed * seconds);
    return {
      x: clamp(p.x + this.motion.vx / speed * distance, -HALF_WORLD + 80, HALF_WORLD - 80),
      y: clamp(p.y + this.motion.vy / speed * distance, -HALF_WORLD + 80, HALF_WORLD - 80),
    };
  }

  driftToRange(dt, orbitScale = 0.1) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radial = distance < 260 ? -0.7 : distance > 520 ? 0.62 : 0;
    const orbit = (this.motion.turn >= 0 ? 1 : -1) * orbitScale;
    this.x += (dx / distance * radial - dy / distance * orbit) * this.speed * dt;
    this.y += (dy / distance * radial + dx / distance * orbit) * this.speed * dt;
  }

  moveToward(x, y, speed, dt) {
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 6) return;
    this.x += dx / distance * speed * dt;
    this.y += dy / distance * speed * dt;
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.mode === "phase_transition" || this.mode === "scientist_abyss_release" || this.releaseFinalized || this.dead) return;
    if (this.phaseLevel === 1) {
      const threshold = this.maxHp * ABYSSAL_SCIENTIST_PHASE_THRESHOLD;
      if (this.hp > threshold) {
        const factor = (this.shielded ? 0.35 : 1) * state.player.damageScale;
        const maxRawDamage = (this.hp - threshold + (this.defense || 0)) / Math.max(0.001, factor);
        super.takeDamage(Math.min(amount, maxRawDamage), x, y, options);
        if (!this.dead && this.hp <= threshold + 0.01) {
          this.hp = threshold;
          this.startPhaseTransition();
        }
        return;
      }
    }
    super.takeDamage(amount, x, y, options);
  }

  startPhaseTransition() {
    this.phaseLevel = 2;
    this.mode = "phase_transition";
    this.modeTimer = 1.4;
    this.currentSkill = "";
    this.pendingForcedSkill = "manifestation";
    this.phasePulse = 1;
    this.attacksSinceRecover = 0;
    this.clearOwnedEffects();
    burst(this.x, this.y, 58, this.phaseColor(), 330);
    pulse(this.x, this.y, this.r + 185, this.coreColor(), 0.62);
    state.shake = Math.max(state.shake, 15);
    state.flash = Math.max(state.flash, 0.34);
    playSfx("wave");
  }

  kill() {
    if (this.releaseFinalized || this.mode === "scientist_abyss_release") return;
    this.hp = 0;
    this.mode = "scientist_abyss_release";
    this.modeTimer = ABYSSAL_SCIENTIST_LIMITS.releaseDuration;
    this.releaseElapsed = 0;
    this.releaseStage = 0;
    this.currentSkill = "";
    this.clearOwnedEffects();
    pulse(this.x, this.y, this.r + 140, "#54efff", 0.55);
    state.shake = Math.max(state.shake, 12);
    state.flash = Math.max(state.flash, 0.25);
    playSfx("wave");
  }

  updateRelease(dt) {
    this.modeTimer = Math.max(0, this.modeTimer - dt);
    this.releaseElapsed = ABYSSAL_SCIENTIST_LIMITS.releaseDuration - this.modeTimer;
    this.anim += dt * (2.2 + this.releaseStage);
    this.orbit += dt * (0.9 + this.releaseStage * 0.5);
    this.flash = Math.max(0, this.flash - dt * 5);
    const nextStage = this.releaseElapsed < 1.1 ? 0 : this.releaseElapsed < 2.5 ? 1 : this.releaseElapsed < 3.8 ? 2 : 3;
    if (nextStage !== this.releaseStage) {
      this.releaseStage = nextStage;
      const colors = ["#54efff", "#a855f7", "#ff4dd8", "#12051f"];
      burst(this.x, this.y - nextStage * 34, 22 + nextStage * 8, colors[nextStage], 180 + nextStage * 45);
      pulse(this.x, this.y - nextStage * 34, this.r + 90 + nextStage * 45, colors[nextStage], 0.42);
      state.shake = Math.max(state.shake, 7 + nextStage * 3);
      state.flash = Math.max(state.flash, nextStage === 2 ? 0.28 : 0.14);
      playSfx(nextStage === 3 ? "wave" : "level");
    }
    if (this.modeTimer <= 0 && !this.releaseFinalized) {
      const entity = spawnConfigured("dark_energy_entity", this.x, this.y);
      if (!entity) return;
      this.releaseFinalized = true;
      this.clearOwnedEffects();
      super.kill();
    }
  }

  clearOwnedEffects() {
    for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
      if (world.enemyProjectiles[i].abyssScientistOwner === this) world.enemyProjectiles.splice(i, 1);
    }
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].abyssScientistOwner === this) world.hazards.splice(i, 1);
    }
  }

  ownedProjectileCount() {
    return world.enemyProjectiles.reduce((count, projectile) => count + (projectile.abyssScientistOwner === this ? 1 : 0), 0);
  }

  ownedHazardCount() {
    return world.hazards.reduce((count, hazard) => count + (hazard.abyssScientistOwner === this ? 1 : 0), 0);
  }

  phaseColor() {
    return PHASE_COLORS[this.phaseLevel - 1];
  }

  coreColor() {
    return CORE_COLORS[this.phaseLevel - 1];
  }

  draw(ctx) {
    if (this.mode === "scientist_abyss_release") drawReleaseBackdrop(ctx, this);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + (this.mode === "scientist_abyss_release" ? 0 : Math.sin(this.anim * 1.1) * 3)));
    ctx.scale(this.flip || 1, 1);
    drawScientist(ctx, this);
    ctx.restore();
  }
}

function drawScientist(ctx, boss) {
  const phase2 = boss.phaseLevel === 2;
  const releasing = boss.mode === "scientist_abyss_release";
  const kneel = releasing ? Math.min(18, boss.releaseElapsed * 12) : 0;
  const color = boss.phaseColor();
  const core = boss.coreColor();
  ctx.save();
  ctx.translate(0, kneel);
  if (boss.flash > 0) ctx.translate(Math.sin(boss.anim * 18) * 3, 0);
  drawScientistShadow(ctx, boss);
  drawSealDevices(ctx, boss, color, releasing);
  if (phase2 || releasing) drawCorruptionTendrils(ctx, boss, releasing);

  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#121827";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, -38);
  ctx.lineTo(-43, 14);
  ctx.lineTo(-35, 58);
  ctx.lineTo(-11, 48);
  ctx.lineTo(0, 60);
  ctx.lineTo(12, 48);
  ctx.lineTo(36, 58);
  ctx.lineTo(44, 14);
  ctx.lineTo(30, -38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = phase2 || releasing ? "#d7e5e8" : "#edfaff";
  ctx.beginPath();
  ctx.moveTo(-27, -30);
  ctx.lineTo(-35, 43);
  ctx.lineTo(-10, 35);
  ctx.lineTo(0, 51);
  ctx.lineTo(5, -25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#54efff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#172033";
  ctx.fillRect(-31, -2, 33, 8);
  ctx.fillStyle = "#54efff";
  ctx.fillRect(-27, 0, 6, 4);
  ctx.fillRect(-16, 0, 6, 4);

  if (phase2 || releasing) {
    ctx.fillStyle = "#160720";
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, -32);
    ctx.lineTo(34, -38);
    ctx.lineTo(45, 16);
    ctx.lineTo(31, 56);
    ctx.lineTo(6, 39);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "#ff4dd8";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(7, -18 + i * 13);
      ctx.lineTo(20 + i * 4, -10 + i * 16);
      ctx.lineTo(37, -3 + i * 12);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.fillStyle = boss.flash > 0 ? "#ffffff" : "#d6e4e8";
  ctx.beginPath();
  ctx.arc(0, -54, 25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#101827";
  ctx.beginPath();
  ctx.moveTo(-25, -57);
  ctx.lineTo(-17, -78);
  ctx.lineTo(15, -80);
  ctx.lineTo(27, -58);
  ctx.lineTo(18, -39);
  ctx.lineTo(-19, -39);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "#07121d";
  ctx.fillRect(-19, -61, 38, 12);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = core;
  ctx.fillRect(-16, -58, phase2 || releasing ? 11 : 28, 5);
  if (phase2 || releasing) {
    ctx.fillStyle = "#ff4dd8";
    ctx.fillRect(3, -58, 13, 5);
  }
  ctx.globalCompositeOperation = "source-over";

  drawSpineRig(ctx, boss, color);
  drawInjectorArm(ctx, boss, color, core);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = releasing ? "#a855f7" : core;
  ctx.beginPath();
  ctx.arc(0, -2, releasing ? 13 + boss.releaseStage * 3 : phase2 ? 12 : 8, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  if (boss.phasePulse > 0) {
    ctx.strokeStyle = rgba(color, boss.phasePulse * 0.8);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -8, 80 + (1 - boss.phasePulse) * 120, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  if (releasing && boss.releaseStage >= 1) drawReleasedEntity(ctx, boss);
}

function drawScientistShadow(ctx, boss) {
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(0, boss.r * 0.78, boss.r * 0.98, boss.r * 0.22, 0, 0, TAU);
  ctx.fill();
}

function drawSealDevices(ctx, boss, color, releasing) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const breakProgress = releasing ? clamp((boss.releaseElapsed - i * 0.22) / 1.05, 0, 1) : 0;
    const angle = boss.orbit * (i % 2 ? -0.72 : 0.9) + i / count * TAU;
    const radius = 82 + (releasing ? breakProgress * 42 : 0);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * 38 - 12 - breakProgress * 28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + boss.anim * 0.05 + breakProgress * 1.4);
    ctx.globalAlpha = 1 - breakProgress * 0.65;
    ctx.fillStyle = "#101b29";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -5);
    ctx.lineTo(8, 15);
    ctx.lineTo(-8, 15);
    ctx.lineTo(-10, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e9fdff";
    ctx.fillRect(-2, -11, 4, 20);
    ctx.restore();
    if (!releasing || breakProgress < 0.8) {
      ctx.strokeStyle = rgba(color, 0.26 * (1 - breakProgress));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(0, -4);
      ctx.stroke();
    }
  }
}

function drawSpineRig(ctx, boss, color) {
  ctx.save();
  ctx.translate(-30, -20);
  ctx.strokeStyle = "#718096";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(-10, 50);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-2 - i * 1.5, -22 + i * 13, 5, -1.4, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawInjectorArm(ctx, boss, color, core) {
  ctx.save();
  ctx.translate(-28, -3);
  ctx.rotate(-0.35 + Math.sin(boss.anim * 1.7) * 0.08);
  ctx.fillStyle = "#26354a";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(-5, -5, 38, 10);
  ctx.strokeRect(-5, -5, 38, 10);
  ctx.fillStyle = core;
  ctx.fillRect(7, -2, 19, 4);
  ctx.fillStyle = "#d9faff";
  ctx.beginPath();
  ctx.moveTo(33, -3);
  ctx.lineTo(52, 0);
  ctx.lineTo(33, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCorruptionTendrils(ctx, boss, releasing) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const angle = boss.orbit * (i % 2 ? -0.36 : 0.28) + i / 6 * TAU;
    const length = 60 + i % 3 * 18 + (releasing ? boss.releaseStage * 18 : 0);
    ctx.strokeStyle = i % 2 ? rgba("#a855f7", 0.55) : rgba("#ff4dd8", 0.42);
    ctx.lineWidth = 7 - i * 0.45;
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.quadraticCurveTo(Math.cos(angle + 0.8) * length * 0.55, Math.sin(angle + 0.8) * length * 0.55, Math.cos(angle) * length, Math.sin(angle) * length);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.52)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawReleasedEntity(ctx, boss) {
  const t = clamp((boss.releaseElapsed - 1.1) / 3.7, 0, 1);
  const escape = boss.releaseStage === 3 ? clamp((boss.releaseElapsed - 3.8) / 1, 0, 1) : 0;
  const y = -95 - t * 96 - escape * 150;
  const scale = 0.55 + Math.sin(Math.min(1, t) * Math.PI) * 0.75;
  ctx.save();
  ctx.translate(0, y);
  ctx.scale(scale * (1 - escape * 0.5), scale * (1 + escape * 0.8));
  ctx.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = rgba(ring === 1 ? "#ff4dd8" : "#a855f7", 0.48 - ring * 0.08);
    ctx.lineWidth = 9 - ring * 2;
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * TAU;
      const r = 42 + ring * 13 + Math.sin(a * 5 + boss.orbit * (ring + 1)) * 9;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.8;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = rgba("#09000f", 0.94);
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ff4dd8";
  ctx.beginPath();
  ctx.ellipse(0, -3, 26, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(0, -3, 6, 6, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawReleaseBackdrop(ctx, boss) {
  const t = clamp(boss.releaseElapsed / ABYSSAL_SCIENTIST_LIMITS.releaseDuration, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(5,0,12,${0.08 + Math.sin(t * Math.PI) * 0.38})`;
  ctx.fillRect(-HALF_WORLD, -HALF_WORLD, WORLD_SIZE, WORLD_SIZE);
  if (boss.releaseStage >= 2) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 22px 'Zpix', 'Courier New', monospace";
    ctx.fillStyle = rgba("#ff7ae8", 0.75 + Math.sin(boss.anim * 5) * 0.2);
    ctx.fillText("警告：封印对象脱离", boss.x, boss.y - 275);
  }
  if (boss.releaseStage === 3) {
    const open = clamp((boss.releaseElapsed - 3.8) / 0.7, 0, 1);
    ctx.translate(boss.x, boss.y - 230);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("#a855f7", 0.72 * (1 - Math.max(0, open - 0.75) * 3));
    ctx.lineWidth = 8 + open * 18;
    ctx.beginPath();
    ctx.moveTo(0, -170 * open);
    ctx.lineTo(0, 170 * open);
    ctx.stroke();
  }
  ctx.restore();
}

function lineFromCenter(x, y, angle, length) {
  const half = length * 0.5;
  return {
    x1: x - Math.cos(angle) * half,
    y1: y - Math.sin(angle) * half,
    x2: x + Math.cos(angle) * half,
    y2: y + Math.sin(angle) * half,
  };
}

function sampleCubicPath(p0, p1, p2, p3, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
    });
  }
  return points;
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
