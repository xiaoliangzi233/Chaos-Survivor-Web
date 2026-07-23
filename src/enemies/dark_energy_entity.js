import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";

export const DARK_ENTITY_THRESHOLDS = Object.freeze([2 / 3, 1 / 3]);
export const DARK_ENTITY_LIMITS = Object.freeze({
  projectiles: 96,
  hazards: 24,
  transitionDuration: 1.35,
  safeCorridor: 170,
  foldCorridor: 180,
  crownGate: 190,
});
export const DARK_ENTITY_SKILL_POOLS = Object.freeze({
  1: Object.freeze(["null_lance_matrix", "umbra_wing_shear", "dark_fold_corridor", "negative_starfall", "eclipse_exchange"]),
  2: Object.freeze(["null_lance_matrix", "umbra_wing_shear", "dark_fold_corridor", "negative_starfall", "eclipse_exchange", "entropy_prism", "night_crown_matrix"]),
  3: Object.freeze(["null_lance_matrix", "umbra_wing_shear", "dark_fold_corridor", "negative_starfall", "eclipse_exchange", "entropy_prism", "night_crown_matrix", "void_hunter_swarm", "unmaking_rite"]),
});

export const DARK_ENTITY_SKILLS = Object.freeze({
  null_lance_matrix: Object.freeze({ name: "零光矛阵", warning: 0.72, active: 1.35, recovery: 0.68, cooldown: 4.4, scene: false }),
  umbra_wing_shear: Object.freeze({ name: "黯翼剪界", warning: 0.68, active: 1.1, recovery: 0.75, cooldown: 5.2, scene: false }),
  dark_fold_corridor: Object.freeze({ name: "黑潮折面", warning: 1, active: 3.6, recovery: 1.3, cooldown: 14, scene: true }),
  negative_starfall: Object.freeze({ name: "负星坠印", warning: 0.78, active: 1.8, recovery: 0.82, cooldown: 6.2, scene: false }),
  eclipse_exchange: Object.freeze({ name: "蚀位交换", warning: 0.74, active: 0.5, recovery: 0.9, cooldown: 6.8, scene: false }),
  entropy_prism: Object.freeze({ name: "熵镜折返", warning: 0.95, active: 2.6, recovery: 1.1, cooldown: 9.5, scene: false }),
  night_crown_matrix: Object.freeze({ name: "夜冠矩阵", warning: 1.1, active: 5, recovery: 1.45, cooldown: 17, scene: true }),
  void_hunter_swarm: Object.freeze({ name: "虚无猎群", warning: 0.7, active: 2.4, recovery: 0.85, cooldown: 7.8, scene: false }),
  unmaking_rite: Object.freeze({ name: "万象归黯", warning: 1.2, active: 6.4, recovery: 1.55, cooldown: 24, scene: true }),
});

const HALF_WORLD = WORLD_SIZE / 2;
const PHASE_PALETTES = Object.freeze([
  Object.freeze({ edge: "#54efff", body: "#21103d", core: "#f5ffff", accent: "#8b5cf6", warning: "#ffe48a" }),
  Object.freeze({ edge: "#ff4dd8", body: "#28061f", core: "#fff0fb", accent: "#a855f7", warning: "#ffd166" }),
  Object.freeze({ edge: "#fff3b0", body: "#08040f", core: "#ffffff", accent: "#ff3dbb", warning: "#ffe89c" }),
]);
const SCENE_SKILLS = new Set(["dark_fold_corridor", "night_crown_matrix", "unmaking_rite"]);

export class DarkEnergyEntity extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "无相黯核·厄蚀";
    this.encounterStage = 1;
    this.encounterStageCount = 4;
    this.nextEncounterStageId = null;
    this.subStage = 1;
    this.subStageCount = 3;
    this.mode = "dark_entity_intro";
    this.modeTimer = 1.8;
    this.currentSkill = "";
    this.pendingForcedSkill = "";
    this.skillCooldowns = Object.create(null);
    this.lastSkills = [];
    this.attackState = null;
    this.ordinaryAttacksSinceScene = 0;
    this.phasePulse = 1;
    this.orbit = Math.random() * TAU;
    this.crownSpin = Math.random() * TAU;
    this.deathSettled = false;
    this.motion = {
      lastX: state.player?.x || 0,
      lastY: state.player?.y || 0,
      vx: 0,
      vy: 0,
      straightness: 0.5,
      turn: 0,
      reversals: 0,
      lastHeading: 0,
    };
  }

  update(dt) {
    const player = state.player;
    if (!player) return;
    this.trackPlayerMotion(dt);
    this.tickCooldowns(dt);
    this.anim += dt * (3.4 + this.subStage * 0.9);
    this.orbit += dt * (0.7 + this.subStage * 0.42);
    this.crownSpin += dt * (this.subStage === 3 ? -1.15 : 0.72 + this.subStage * 0.18);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 1.8);
    this.flip = player.x < this.x ? -1 : 1;
    this.modeTimer -= dt;

    this.updateMode(dt);
    this.x = clamp(this.x, -HALF_WORLD + this.r, HALF_WORLD - this.r);
    this.y = clamp(this.y, -HALF_WORLD + this.r, HALF_WORLD - this.r);

    const distance = Math.hypot(player.x - this.x, player.y - this.y);
    if (!this.mode.includes("transition") && !this.mode.includes("intro") && distance < player.r + this.r && player.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      player.invuln = 0.58;
      state.shake = Math.max(state.shake, 12);
      state.flash = Math.max(state.flash, 0.25);
      burst(player.x, player.y, 16, this.phaseColor(), 190);
      playSfx("hurt");
    }
  }

  updateMode(dt) {
    if (this.mode === "dark_entity_intro") {
      this.moveToward(0, 0, this.speed * 0.42, dt);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "dark_entity_transition") {
      this.moveToward(0, 0, this.speed * 0.62, dt);
      if (this.modeTimer <= 0) {
        const forced = this.pendingForcedSkill;
        this.pendingForcedSkill = "";
        this.beginSkill(forced);
      }
      return;
    }
    if (this.mode === "dark_entity_stage_handoff") {
      if (this.modeTimer <= 0) this.kill();
      return;
    }
    if (this.mode === "dark_entity_recover") {
      this.driftToRange(dt, 0.04);
      if (this.modeTimer <= 0) this.chooseSkill();
      return;
    }
    if (this.mode === "dark_entity_windup") {
      this.driftToRange(dt, -0.025);
      if (this.modeTimer <= 0) this.launchSkill();
      return;
    }
    if (this.mode.startsWith("dark_entity_scene_")) {
      const center = this.attackState?.sceneCenter || { x: 0, y: 0 };
      this.moveToward(center.x, center.y, this.speed * 0.7, dt);
      this.updateAttackEvents(dt);
      if (this.modeTimer <= 0) {
        this.clearOwnedEffects();
        this.finishAttack(DARK_ENTITY_SKILLS[this.currentSkill]?.recovery || 1.4);
      }
      return;
    }
    if (this.mode === "dark_entity_cast") {
      this.driftToRange(dt, 0.055);
      this.updateAttackEvents(dt);
      if (this.modeTimer <= 0) this.finishAttack(DARK_ENTITY_SKILLS[this.currentSkill]?.recovery || 0.85);
    }
  }

  chooseSkill() {
    const pool = DARK_ENTITY_SKILL_POOLS[this.subStage];
    const player = state.player;
    const distance = Math.hypot(player.x - this.x, player.y - this.y);
    const edge = Math.max(Math.abs(player.x), Math.abs(player.y)) / HALF_WORLD;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    const scores = {
      null_lance_matrix: 5.2 + this.motion.straightness * 3.1 + (distance > 460 ? 1.4 : 0) + (speed > 90 ? 0.8 : 0),
      umbra_wing_shear: 5 + Math.abs(this.motion.turn) * 3.4 + (distance > 300 ? 0.7 : 0),
      dark_fold_corridor: 3.2 + (edge > 0.72 ? 3.8 : 0) + (this.ordinaryAttacksSinceScene >= 2 ? 2.4 : -100),
      negative_starfall: 5.1 + this.motion.straightness * 2 + (speed > 70 ? 1.1 : 0),
      eclipse_exchange: 4.4 + (distance < 290 ? 4.2 : 0) + (edge > 0.78 ? 2.8 : 0),
      entropy_prism: 5.2 + Math.abs(this.motion.turn) * 3.2 + this.motion.reversals * 0.7,
      night_crown_matrix: 3.4 + (edge > 0.62 ? 2.5 : 0) + (this.ordinaryAttacksSinceScene >= 2 ? 2.8 : -100),
      void_hunter_swarm: 5.5 + (speed > 95 ? 1.8 : 0) + this.motion.straightness,
      unmaking_rite: 3.8 + (this.ordinaryAttacksSinceScene >= 2 ? 3.1 : -100),
    };

    let best = pool[0];
    let bestScore = -Infinity;
    for (const skill of pool) {
      if ((this.skillCooldowns[skill] || 0) > 0) continue;
      if (SCENE_SKILLS.has(skill) && (this.ordinaryAttacksSinceScene < 2 || this.hasOwnedDanger())) continue;
      let score = scores[skill] + Math.random() * 0.65;
      if (this.lastSkills[0] === skill) score -= 100;
      else {
        const recentIndex = this.lastSkills.indexOf(skill);
        if (recentIndex >= 0) score -= 3.2 - recentIndex * 0.65;
      }
      if (score > bestScore) {
        best = skill;
        bestScore = score;
      }
    }
    this.beginSkill(best);
  }

  beginSkill(skill) {
    const fallback = DARK_ENTITY_SKILL_POOLS[this.subStage][0];
    this.currentSkill = DARK_ENTITY_SKILLS[skill] ? skill : fallback;
    const spec = DARK_ENTITY_SKILLS[this.currentSkill];
    this.attackState = this.prepareSkill(this.currentSkill, spec);
    this.mode = "dark_entity_windup";
    this.modeTimer = spec.warning;
    this.skillCooldowns[this.currentSkill] = spec.cooldown;
    this.rememberSkill(this.currentSkill);
    if (spec.scene) this.ordinaryAttacksSinceScene = 0;
    else this.ordinaryAttacksSinceScene++;
  }

  launchSkill() {
    const spec = DARK_ENTITY_SKILLS[this.currentSkill];
    if (!spec) return this.finishAttack(0.8);
    this.mode = spec.scene ? `dark_entity_scene_${this.currentSkill}` : "dark_entity_cast";
    this.modeTimer = spec.active;
    this.attackState.elapsed = 0;
    this.attackState.nextEvent = 0;
    this.activateSkill(this.currentSkill);
    this.updateAttackEvents(0);
    state.shake = Math.max(state.shake, spec.scene ? 9 : 5);
  }

  finishAttack(recovery) {
    this.currentSkill = "";
    this.attackState = null;
    this.mode = "dark_entity_recover";
    this.modeTimer = recovery;
  }

  prepareSkill(skill, spec) {
    const predicted = this.predictPlayer(0.45);
    const playerAngle = Math.atan2(predicted.y - this.y, predicted.x - this.x);
    const motionAngle = Math.hypot(this.motion.vx, this.motion.vy) > 36
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : playerAngle;
    const attack = {
      skill,
      elapsed: 0,
      nextEvent: 0,
      events: [],
      target: predicted,
      angle: motionAngle,
      sceneCenter: clampPoint(predicted.x, predicted.y, 880),
    };
    if (skill === "null_lance_matrix") this.prepareNullLance(attack, spec);
    if (skill === "umbra_wing_shear") this.prepareWingShear(attack, spec);
    if (skill === "dark_fold_corridor") this.prepareDarkFold(attack, spec);
    if (skill === "negative_starfall") this.prepareNegativeStars(attack, spec);
    if (skill === "eclipse_exchange") this.prepareEclipseExchange(attack, spec);
    if (skill === "entropy_prism") this.prepareEntropyPrism(attack, spec);
    if (skill === "night_crown_matrix") this.prepareNightCrown(attack, spec);
    if (skill === "void_hunter_swarm") this.prepareHunterSwarm(attack, spec);
    if (skill === "unmaking_rite") this.prepareUnmakingRite(attack, spec);
    return attack;
  }

  activateSkill(skill) {
    if (skill === "eclipse_exchange") {
      const target = this.attackState.exchangeTarget;
      trail(this.x, this.y, target.x, target.y, this.phaseColor(), 18);
      this.x = target.x;
      this.y = target.y;
      burst(this.x, this.y, 24, this.phaseColor(), 220);
      pulse(this.x, this.y, this.r + 72, this.coreColor(), 0.3);
    }
    if (skill === "night_crown_matrix" || skill === "unmaking_rite" || skill === "dark_fold_corridor") {
      pulse(this.attackState.sceneCenter.x, this.attackState.sceneCenter.y, 380, this.phaseColor(), 0.45);
      playSfx("wave");
    } else {
      playSfx("shoot");
    }
  }

  updateAttackEvents(dt) {
    if (!this.attackState) return;
    this.attackState.elapsed += dt;
    const events = this.attackState.events || [];
    while (this.attackState.nextEvent < events.length && this.attackState.elapsed + 1e-6 >= events[this.attackState.nextEvent].time) {
      const event = events[this.attackState.nextEvent++];
      if (event.action === "lance_wave") this.releaseNullLanceWave(event.index);
      if (event.action === "wing_pair") this.releaseWingPair(event.index);
      if (event.action === "hunter_packet") this.releaseHunterPacket(event.index);
    }
  }

  prepareNullLance(attack, spec) {
    this.addField({
      variant: "lane_guide",
      x: attack.target.x,
      y: attack.target.y,
      angle: attack.angle,
      length: WORLD_SIZE * 1.25,
      width: DARK_ENTITY_LIMITS.safeCorridor,
      noDamage: true,
      armTime: spec.warning,
      life: spec.warning + 0.08,
    });
    attack.events = [0, 0.42, 0.84].map((time, index) => ({ time, action: "lance_wave", index }));
  }

  prepareWingShear(attack, spec) {
    this.addField({
      variant: "wing_guide",
      x: this.x,
      y: this.y,
      angles: [-0.74, -0.31, 0.31, 0.74].map((offset) => attack.angle + offset),
      length: WORLD_SIZE,
      width: 28,
      noDamage: true,
      armTime: spec.warning,
      life: spec.warning + 0.1,
    });
    attack.events = [0, 0.3, 0.6].map((time, index) => ({ time, action: "wing_pair", index }));
  }

  prepareDarkFold(attack, spec) {
    this.addField({
      variant: "fold",
      x: attack.sceneCenter.x,
      y: attack.sceneCenter.y,
      angle: attack.angle,
      length: WORLD_SIZE * 1.35,
      width: 34,
      corridor: DARK_ENTITY_LIMITS.foldCorridor,
      damage: this.damage * 0.58,
      armTime: spec.warning,
      activeDuration: spec.active,
      life: spec.warning + spec.active,
      scene: true,
    });
  }

  prepareNegativeStars(attack, spec) {
    const sideX = -Math.sin(attack.angle);
    const sideY = Math.cos(attack.angle);
    const forwardX = Math.cos(attack.angle);
    const forwardY = Math.sin(attack.angle);
    const offsets = [-260, -130, 0, 130, 260];
    const safeEscapeAngle = attack.angle + Math.PI;
    offsets.forEach((side, index) => {
      const forward = Math.abs(2 - index) * 54;
      const point = clampPoint(
        attack.target.x + sideX * side + forwardX * forward,
        attack.target.y + sideY * side + forwardY * forward,
        120,
      );
      this.addField({
        variant: "negative_star",
        x: point.x,
        y: point.y,
        r: 72,
        warningType: "circle",
        safeEscapeAngle,
        damage: this.damage * 0.62,
        shardDamage: this.damage * 0.32,
        armTime: spec.warning + index * 0.18,
        activeDuration: 0.28,
        life: spec.warning + index * 0.18 + 0.38,
      });
    });
  }

  prepareEclipseExchange(attack, spec) {
    const radius = 260;
    const base = attack.angle + Math.PI;
    const anchors = Array.from({ length: 3 }, (_, index) => {
      const angle = base + index * TAU / 3;
      return clampPoint(attack.target.x + Math.cos(angle) * radius, attack.target.y + Math.sin(angle) * radius, this.r + 32);
    });
    let exchangeIndex = 0;
    let bestCenterDistance = Infinity;
    anchors.forEach((anchor, index) => {
      const distance = Math.hypot(anchor.x, anchor.y);
      if (distance < bestCenterDistance) {
        bestCenterDistance = distance;
        exchangeIndex = index;
      }
    });
    attack.exchangeTarget = anchors[exchangeIndex];
    const lines = anchors
      .map((anchor, index) => ({ anchor, index }))
      .filter((entry) => entry.index !== exchangeIndex)
      .map((entry) => makeLine(entry.anchor.x, entry.anchor.y, attack.target.x, attack.target.y, 30));
    this.addField({
      variant: "beam",
      x: attack.target.x,
      y: attack.target.y,
      anchors,
      safeAnchor: exchangeIndex,
      lines,
      width: 30,
      damage: this.damage * 0.68,
      armTime: spec.warning,
      activeDuration: spec.active,
      life: spec.warning + spec.active,
    });
  }

  prepareEntropyPrism(attack, spec) {
    const center = attack.sceneCenter;
    const radius = 620;
    const rotation = attack.angle + Math.PI / 4;
    const mirrors = Array.from({ length: 4 }, (_, index) => ({
      x: center.x + Math.cos(rotation + index * Math.PI / 2) * radius,
      y: center.y + Math.sin(rotation + index * Math.PI / 2) * radius,
    })).map((point) => clampPoint(point.x, point.y, 90));
    this.addField({
      variant: "entropy_mirror",
      x: center.x,
      y: center.y,
      mirrors,
      lineSets: [
        [makeLine(mirrors[0].x, mirrors[0].y, mirrors[2].x, mirrors[2].y, 32)],
        [makeLine(mirrors[1].x, mirrors[1].y, mirrors[3].x, mirrors[3].y, 32)],
      ],
      width: 32,
      damage: this.damage * 0.54,
      armTime: spec.warning,
      activeDuration: spec.active,
      life: spec.warning + spec.active,
    });
  }

  prepareNightCrown(attack, spec) {
    this.addField({
      variant: "night_crown",
      x: attack.sceneCenter.x,
      y: attack.sceneCenter.y,
      radius: 520,
      sides: 6,
      gateWidth: DARK_ENTITY_LIMITS.crownGate,
      gateIndex: inwardGateIndex(attack.sceneCenter),
      width: 34,
      damage: this.damage * 0.7,
      needleDamage: this.damage * 0.3,
      armTime: spec.warning,
      activeDuration: spec.active,
      life: spec.warning + spec.active,
      scene: true,
    });
  }

  prepareHunterSwarm(attack, spec) {
    this.addField({
      variant: "hunter_guide",
      x: attack.target.x,
      y: attack.target.y,
      angle: attack.angle,
      length: 760,
      width: 120,
      noDamage: true,
      armTime: spec.warning,
      life: spec.warning + 0.08,
    });
    attack.events = [0, 0.55, 1.1, 1.65].map((time, index) => ({ time, action: "hunter_packet", index }));
  }

  prepareUnmakingRite(attack, spec) {
    const routeAngle = angleTowardCenter(attack.sceneCenter.x, attack.sceneCenter.y);
    this.addField({
      variant: "unmaking",
      x: attack.sceneCenter.x,
      y: attack.sceneCenter.y,
      routeAngle,
      width: 30,
      damage: this.damage * 0.74,
      rayDamage: this.damage * 0.48,
      shells: [
        { start: 0, duration: 1.25, fromRadius: 760, toRadius: 390, gateIndex: angleToSide(routeAngle, 8) },
        { start: 1.75, duration: 1.25, fromRadius: 640, toRadius: 280, gateIndex: angleToSide(routeAngle + Math.PI / 4, 8) },
        { start: 3.5, duration: 1.35, fromRadius: 520, toRadius: 175, gateIndex: angleToSide(routeAngle + Math.PI / 2, 8) },
      ],
      armTime: spec.warning,
      activeDuration: spec.active,
      life: spec.warning + spec.active,
      scene: true,
    });
  }

  releaseNullLanceWave(index) {
    const attack = this.attackState;
    if (!attack) return;
    const forwardX = Math.cos(attack.angle);
    const forwardY = Math.sin(attack.angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const startDistance = WORLD_SIZE * 0.54;
    const startX = attack.target.x - forwardX * startDistance;
    const startY = attack.target.y - forwardY * startDistance;
    const step = 92;
    for (let lane = -10; lane <= 10; lane++) {
      const offset = lane * step + (index % 2 ? step * 0.5 : 0);
      if (Math.abs(offset) < DARK_ENTITY_LIMITS.safeCorridor / 2) continue;
      this.pushProjectile({
        x: startX + sideX * offset,
        y: startY + sideY * offset,
        vx: forwardX * 520,
        vy: forwardY * 520,
        r: 8,
        color: this.phaseColor(),
        damage: this.damage * 0.42,
        life: 8,
        shape: "darkEntityLance",
      });
    }
  }

  releaseWingPair(index) {
    const attack = this.attackState;
    if (!attack) return;
    const spread = 0.31 + index * 0.12;
    for (const side of [-1, 1]) {
      const angle = attack.angle + side * spread;
      this.pushProjectile({
        x: this.x + Math.cos(angle) * this.r * 0.7,
        y: this.y + Math.sin(angle) * this.r * 0.7,
        vx: Math.cos(angle) * 430,
        vy: Math.sin(angle) * 430,
        heading: angle,
        curve: side * (0.24 + index * 0.04),
        r: 15,
        color: this.phaseColor(),
        damage: this.damage * 0.55,
        life: 7,
        shape: "darkEntityScythe",
      });
    }
  }

  releaseNegativeStarShards(field) {
    const slots = 10;
    for (let index = 0; index < slots; index++) {
      const angle = index * TAU / slots + 0.07;
      if (Math.abs(angleDelta(angle, field.safeEscapeAngle)) < 75 * Math.PI / 360) continue;
      this.pushProjectile({
        x: field.x,
        y: field.y,
        vx: Math.cos(angle) * 340,
        vy: Math.sin(angle) * 340,
        r: 7,
        color: this.phaseColor(),
        damage: field.shardDamage,
        life: 6,
        shape: "darkEntityLance",
      });
    }
  }

  releaseNightCrownNeedles(field) {
    const vertices = polygonVertices(field.x, field.y, field.radius, field.sides, -Math.PI / 2);
    vertices.forEach((vertex, index) => {
      if (index === field.gateIndex) return;
      const angle = Math.atan2(field.y - vertex.y, field.x - vertex.x) + (index % 2 ? 0.13 : -0.13);
      this.pushProjectile({
        x: vertex.x,
        y: vertex.y,
        vx: Math.cos(angle) * 390,
        vy: Math.sin(angle) * 390,
        r: 7,
        color: this.phaseColor(),
        damage: field.needleDamage,
        life: 5,
        shape: "darkEntityLance",
      });
    });
  }

  releaseHunterPacket(index) {
    const attack = this.attackState;
    if (!attack) return;
    const player = state.player;
    const predicted = clampPoint(
      player.x + this.motion.vx * 0.45,
      player.y + this.motion.vy * 0.45,
      100,
    );
    const motionAngle = Math.hypot(this.motion.vx, this.motion.vy) > 30
      ? Math.atan2(this.motion.vy, this.motion.vx)
      : attack.angle;
    const sourceAngle = motionAngle + Math.PI + (index - 1.5) * 0.18;
    const source = {
      x: clamp(predicted.x + Math.cos(sourceAngle) * 920, -HALF_WORLD + 48, HALF_WORLD - 48),
      y: clamp(predicted.y + Math.sin(sourceAngle) * 920, -HALF_WORLD + 48, HALF_WORLD - 48),
    };
    const sideX = -Math.sin(sourceAngle);
    const sideY = Math.cos(sourceAngle);
    for (let packet = -1; packet <= 1; packet++) {
      const start = { x: source.x + sideX * packet * 92, y: source.y + sideY * packet * 92 };
      const target = clampPoint(predicted.x + sideX * packet * 76, predicted.y + sideY * packet * 76, 80);
      const control = clampPoint(
        (start.x + target.x) / 2 + sideX * (packet || (index % 2 ? 1 : -1)) * 180,
        (start.y + target.y) / 2 + sideY * (packet || (index % 2 ? 1 : -1)) * 180,
        60,
      );
      this.pushProjectile({
        x: start.x,
        y: start.y,
        vx: 0,
        vy: 0,
        r: 12,
        color: this.phaseColor(),
        damage: this.damage * 0.46,
        life: 2.3,
        shape: "darkEntityHunter",
        pathStart: start,
        pathControl: control,
        pathEnd: target,
        pathT: 0,
        pathDuration: 2.15,
      });
    }
  }

  addField(options) {
    if (this.ownedHazardCount() >= DARK_ENTITY_LIMITS.hazards) return null;
    const armTime = Math.max(0, options.armTime || 0);
    const life = Math.max(0.05, options.life || armTime + (options.activeDuration || 0.4));
    const field = {
      kind: "dark_entity_field",
      x: options.x ?? this.x,
      y: options.y ?? this.y,
      r: options.r || 32,
      color: options.color || this.phaseColor(),
      coreColor: this.coreColor(),
      warningColor: this.palette().warning,
      width: options.width || 24,
      damage: options.damage || 0,
      armTime,
      armDuration: armTime,
      activeDuration: options.activeDuration || Math.max(0.05, life - armTime),
      activeElapsed: 0,
      life,
      maxLife: life,
      bossOwner: this,
      ...options,
    };
    world.hazards.push(field);
    return field;
  }

  pushProjectile(options) {
    if (this.ownedProjectileCount() >= DARK_ENTITY_LIMITS.projectiles) return null;
    const projectile = {
      bossProjectile: true,
      expireWithLife: true,
      bossOwner: this,
      spin: Math.random() * TAU,
      ...options,
    };
    world.enemyProjectiles.push(projectile);
    return projectile;
  }

  trackPlayerMotion(dt) {
    const player = state.player;
    const sampleDt = Math.max(0.001, dt);
    const rawVx = (player.x - this.motion.lastX) / sampleDt;
    const rawVy = (player.y - this.motion.lastY) / sampleDt;
    const blend = 1 - Math.exp(-sampleDt * 7.2);
    const previousVx = this.motion.vx;
    const previousVy = this.motion.vy;
    this.motion.vx += (clamp(rawVx, -520, 520) - this.motion.vx) * blend;
    this.motion.vy += (clamp(rawVy, -520, 520) - this.motion.vy) * blend;
    const speed = Math.hypot(this.motion.vx, this.motion.vy);
    if (speed > 18) {
      const heading = Math.atan2(this.motion.vy, this.motion.vx);
      const delta = angleDelta(heading, this.motion.lastHeading);
      this.motion.turn += (delta / sampleDt - this.motion.turn) * Math.min(1, sampleDt * 4.5);
      const oldSpeed = Math.max(1, Math.hypot(previousVx, previousVy));
      const alignment = (previousVx * this.motion.vx + previousVy * this.motion.vy) / (oldSpeed * Math.max(1, speed));
      this.motion.straightness += (clamp((alignment + 1) / 2, 0, 1) - this.motion.straightness) * Math.min(1, sampleDt * 3.8);
      if (alignment < -0.35) this.motion.reversals = Math.min(3, this.motion.reversals + 1);
      else this.motion.reversals = Math.max(0, this.motion.reversals - sampleDt * 0.8);
      this.motion.lastHeading = heading;
    }
    this.motion.lastX = player.x;
    this.motion.lastY = player.y;
  }

  predictPlayer(seconds) {
    const player = state.player;
    return clampPoint(
      player.x + this.motion.vx * seconds,
      player.y + this.motion.vy * seconds,
      100,
    );
  }

  tickCooldowns(dt) {
    for (const skill of Object.keys(this.skillCooldowns)) {
      this.skillCooldowns[skill] = Math.max(0, this.skillCooldowns[skill] - dt);
    }
  }

  rememberSkill(skill) {
    this.lastSkills.unshift(skill);
    this.lastSkills.length = Math.min(3, this.lastSkills.length);
  }

  driftToRange(dt, orbitScale = 0.08) {
    const player = state.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radial = distance < 330 ? -0.72 : distance > 590 ? 0.58 : 0;
    const orbit = (this.motion.turn >= 0 ? 1 : -1) * orbitScale;
    this.x += (dx / distance * radial - dy / distance * orbit) * this.speed * dt;
    this.y += (dy / distance * radial + dx / distance * orbit) * this.speed * dt;
  }

  moveToward(x, y, speed, dt) {
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 8) return;
    this.x += dx / distance * speed * dt;
    this.y += dy / distance * speed * dt;
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.dead || this.deathSettled || this.mode.includes("transition") || this.mode.includes("intro") || this.mode.includes("handoff")) return;
    const threshold = this.subStage <= 2 ? this.maxHp * DARK_ENTITY_THRESHOLDS[this.subStage - 1] : 0;
    if (threshold > 0 && this.hp > threshold) {
      const factor = (this.shielded ? 0.35 : 1) * state.player.damageScale;
      const maxRawDamage = (this.hp - threshold + (this.defense || 0)) / Math.max(0.001, factor);
      super.takeDamage(Math.min(amount, maxRawDamage), x, y, options);
      if (!this.dead && this.hp <= threshold + 0.01) {
        this.hp = threshold;
        this.startSubStageTransition(this.subStage + 1);
      }
      return;
    }
    super.takeDamage(amount, x, y, options);
  }

  startSubStageTransition(nextSubStage) {
    this.subStage = nextSubStage;
    this.mode = "dark_entity_transition";
    this.modeTimer = DARK_ENTITY_LIMITS.transitionDuration;
    this.pendingForcedSkill = nextSubStage === 2 ? "night_crown_matrix" : "unmaking_rite";
    this.currentSkill = "";
    this.attackState = null;
    this.phasePulse = 1;
    this.ordinaryAttacksSinceScene = 2;
    this.clearOwnedEffects();
    burst(this.x, this.y, 64 + nextSubStage * 10, this.phaseColor(), 360);
    pulse(this.x, this.y, this.r + 210, this.coreColor(), 0.68);
    state.shake = Math.max(state.shake, 17);
    state.flash = Math.max(state.flash, 0.36);
    playSfx("wave");
  }

  clearOwnedEffects() {
    for (let index = world.enemyProjectiles.length - 1; index >= 0; index--) {
      if (world.enemyProjectiles[index].bossOwner === this) world.enemyProjectiles.splice(index, 1);
    }
    for (let index = world.hazards.length - 1; index >= 0; index--) {
      if (world.hazards[index].bossOwner === this) world.hazards.splice(index, 1);
    }
  }

  hasOwnedDanger() {
    return world.hazards.some((hazard) => hazard.bossOwner === this && !hazard.noDamage && hazard.life > 0);
  }

  ownedProjectileCount() {
    return world.enemyProjectiles.reduce((count, projectile) => count + (projectile.bossOwner === this ? 1 : 0), 0);
  }

  ownedHazardCount() {
    return world.hazards.reduce((count, hazard) => count + (hazard.bossOwner === this ? 1 : 0), 0);
  }

  kill() {
    if (this.deathSettled) return;
    this.clearOwnedEffects();
    if (this.nextEncounterStageId) {
      const successor = spawnConfigured(this.nextEncounterStageId, this.x, this.y);
      if (!successor) {
        this.hp = 1;
        this.mode = "dark_entity_stage_handoff";
        this.modeTimer = 0.25;
        return;
      }
    }
    this.deathSettled = true;
    burst(this.x, this.y, 110, this.phaseColor(), 430);
    pulse(this.x, this.y, this.r + 260, this.coreColor(), 0.75);
    state.shake = Math.max(state.shake, 22);
    state.flash = Math.max(state.flash, 0.44);
    super.kill();
  }

  palette() {
    return PHASE_PALETTES[this.subStage - 1] || PHASE_PALETTES[0];
  }

  phaseColor() {
    return this.palette().edge;
  }

  coreColor() {
    return this.palette().core;
  }

  draw(ctx) {
    const palette = this.palette();
    const transition = this.mode === "dark_entity_transition";
    const pulseScale = 1 + this.phasePulse * 0.16;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.2) * 5));
    ctx.scale(pulseScale, pulseScale);
    drawOuterAura(ctx, this, palette, transition);
    drawCrownWings(ctx, this, palette, transition);
    drawMobiusArmor(ctx, this, palette);
    drawNegativeCore(ctx, this, palette, transition);
    drawEnergyTendrils(ctx, this, palette);
    ctx.restore();
  }
}

function drawOuterAura(ctx, boss, palette, transition) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = palette.edge;
  ctx.shadowBlur = transition ? 20 : 12;
  ctx.strokeStyle = palette.edge;
  ctx.globalAlpha = 0.2 + boss.subStage * 0.05;
  ctx.lineWidth = 3;
  ctx.setLineDash([13, 9]);
  ctx.rotate(boss.orbit * 0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.r * 1.42, boss.r * 1.05, 0, 0, TAU);
  ctx.stroke();
  ctx.rotate(-boss.orbit * 0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.r * 1.18, boss.r * 1.52, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCrownWings(ctx, boss, palette, transition) {
  const count = 6 + (boss.subStage - 1) * 2;
  ctx.save();
  ctx.rotate(boss.crownSpin * 0.18);
  for (let index = 0; index < count; index++) {
    const angle = index * TAU / count + Math.sin(boss.anim * 0.7 + index) * 0.035;
    const length = boss.r * (1.18 + (index % 3) * 0.16 + (transition ? 0.22 : 0));
    const width = boss.r * (0.22 + (index % 2) * 0.05);
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(boss.r * 0.54, 0);
    ctx.fillStyle = palette.body;
    ctx.strokeStyle = index % 2 ? palette.accent : palette.edge;
    ctx.lineWidth = 3;
    ctx.shadowColor = palette.edge;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(length * 0.58, -width * 0.72);
    ctx.lineTo(length, 0);
    ctx.lineTo(length * 0.48, width * 0.54);
    ctx.lineTo(length * 0.12, width);
    ctx.lineTo(length * 0.28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.warning;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(length * 0.42, -2, length * 0.32, 4);
    ctx.restore();
  }
  ctx.restore();
}

function drawMobiusArmor(ctx, boss, palette) {
  ctx.save();
  ctx.rotate(Math.sin(boss.anim * 0.55) * 0.14);
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 9;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = boss.r * 0.18;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.r * 0.78, boss.r * 0.42, Math.PI / 4, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = boss.r * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.r * 0.8, boss.r * 0.38, -Math.PI / 4, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.r * 0.92, boss.r * 0.54, boss.orbit * 0.1, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawNegativeCore(ctx, boss, palette, transition) {
  const flicker = 0.92 + Math.sin(boss.anim * 3.8) * 0.08;
  ctx.save();
  ctx.shadowColor = palette.core;
  ctx.shadowBlur = transition ? 22 : 14;
  ctx.fillStyle = "#020106";
  ctx.strokeStyle = palette.core;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let index = 0; index < 12; index++) {
    const angle = index * TAU / 12 - Math.PI / 2;
    const radius = boss.r * (index % 2 ? 0.48 : 0.66) * flicker;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (!index) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.core;
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.moveTo(0, -boss.r * 0.42);
  ctx.bezierCurveTo(boss.r * 0.24, -boss.r * 0.12, boss.r * 0.2, boss.r * 0.3, 0, boss.r * 0.48);
  ctx.bezierCurveTo(-boss.r * 0.32, boss.r * 0.18, -boss.r * 0.18, -boss.r * 0.12, 0, -boss.r * 0.42);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(-3, -boss.r * 0.26, 6, boss.r * 0.52);
  ctx.restore();
}

function drawEnergyTendrils(ctx, boss, palette) {
  ctx.save();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.48;
  ctx.shadowColor = palette.edge;
  ctx.shadowBlur = 5;
  for (let index = 0; index < 4; index++) {
    const side = index % 2 ? 1 : -1;
    const y = (index - 1.5) * boss.r * 0.28;
    const wave = Math.sin(boss.anim * 1.4 + index) * boss.r * 0.24;
    ctx.beginPath();
    ctx.moveTo(side * boss.r * 0.42, y);
    ctx.bezierCurveTo(
      side * boss.r * 0.9,
      y + wave,
      side * boss.r * 1.2,
      y - wave,
      side * boss.r * (1.45 + index * 0.08),
      y + wave * 0.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function makeLine(x1, y1, x2, y2, width = 24, damage = null) {
  return { x1, y1, x2, y2, width, damage };
}

function polygonVertices(x, y, radius, sides, rotation = 0) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + index * TAU / sides;
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
  });
}

function angleToSide(angle, sides) {
  return ((Math.round((angle + Math.PI / 2) / (TAU / sides)) % sides) + sides) % sides;
}

function inwardGateIndex(center) {
  return angleToSide(angleTowardCenter(center.x, center.y), 6);
}

function angleTowardCenter(x, y) {
  if (Math.hypot(x, y) < 80) return -Math.PI / 2;
  return Math.atan2(-y, -x);
}

function clampPoint(x, y, padding) {
  return {
    x: clamp(x, -HALF_WORLD + padding, HALF_WORLD - padding),
    y: clamp(y, -HALF_WORLD + padding, HALF_WORLD - padding),
  };
}

function angleDelta(a, b) {
  let delta = (a - b) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}
