import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { angleDiff, clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { MechWorm } from "./mech_worm.js";
import { applyPlayerDamage } from "../systems/items.js";

const SEGMENT_COUNT = 42;
const SEGMENT_GAP = 26;
const NODE_STEP = 4;
const BODY_RADIUS_SCALE = 0.58;
const MAX_BODY_BEND = 0.58;
const PHASE2_HP = 0.66;
const PHASE3_HP = 0.32;
const NET_LENGTH = 3600;
const PORTAL_ENTER_TIME = 0.62;
const PORTAL_EMERGE_TIME = 0.72;

export class StormRailDevourer extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "雷铸吞星者";
    this.trait = "重铸雷轨";
    this.behavior = "boss_storm_rail";
    this.r = config.radius || 34;
    this.speed = config.speed || 92;
    this.damage = config.damage || 44;
    this.segmentGap = SEGMENT_GAP;
    this.knockbackResistance = 0.96;
    this.mode = "emerge";
    this.modeTimer = 1.2;
    this.attackIndex = 0;
    this.phaseLevel = 1;
    this.phasePulse = 0;
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.heading = 0;
    this.visualHeading = 0;
    this.fireTimer = 0;
    this.modeShotTimer = 0;
    this.dashWindup = 0;
    this.dashTime = 0;
    this.dashCoast = 0;
    this.dashLoops = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.portalTimer = 0;
    this.portalLoops = 0;
    this.portalState = "ready";
    this.portalPhase = 0;
    this.portalEnter = null;
    this.portalExit = null;
    this.netTimer = 0;
    this.netCount = 0;
    this.deathLaserAngle = 0;
    this.deathLaserTargetAngle = 0;
    this.deathLaserSpin = 1;
    this.summoned = false;
    this.roamAngle = Math.random() * TAU;
    this.roamTimer = 0.7;
    this.observeTimer = 1.4;
    this.roamRadius = 780;
    this.path = [];
    this.segments = [];
    this.initFromEdge();
  }

  initFromEdge() {
    const p = state.player;
    const half = WORLD_SIZE / 2;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      this.x = -half + this.r;
      this.y = clamp(p.y + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
    } else if (side === 1) {
      this.x = half - this.r;
      this.y = clamp(p.y + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
    } else if (side === 2) {
      this.x = clamp(p.x + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
      this.y = -half + this.r;
    } else {
      this.x = clamp(p.x + (Math.random() - 0.5) * 620, -half + this.r, half - this.r);
      this.y = half - this.r;
    }
    this.heading = Math.atan2(p.y - this.y, p.x - this.x);
    this.visualHeading = this.heading;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.segments.push({
        x: this.x - Math.cos(this.heading) * (i + 1) * this.segmentGap,
        y: this.y - Math.sin(this.heading) * (i + 1) * this.segmentGap,
        angle: this.heading,
        heat: 0,
        node: i > 0 && i % NODE_STEP === 0,
        phase: Math.random() * TAU,
      });
    }
    this.seedPath();
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const prevX = this.x;
    const prevY = this.y;
    const oldPhase = this.phaseLevel;
    this.phaseLevel = this.hp <= this.maxHp * PHASE3_HP ? 3 : this.hp <= this.maxHp * PHASE2_HP ? 2 : 1;
    this.anim += dt * (4.4 + this.phaseLevel * 1.2);
    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.8);
    this.modeTimer -= dt;
    this.fireTimer -= dt;
    this.modeShotTimer -= dt;
    this.netTimer -= dt;
    this.portalTimer -= dt;
    this.flip = dx < 0 ? -1 : 1;
    if (oldPhase !== this.phaseLevel) this.phaseShift();

    if (this.mode === "emerge") this.updateCruise(dt, dx, dy, d, 1.4);
    else if (this.mode === "cruise") this.updateCruise(dt, dx, dy, d);
    else if (this.mode === "dash") this.updateDash(dt, dx, dy, d);
    else if (this.mode === "coil") this.updateCoil(dt, dx, dy, d);
    else if (this.mode === "laser_net") this.updateLaserNet(dt);
    else if (this.mode === "reaper_flame") this.updateReaperFlame(dt);
    else if (this.mode === "portal_dash") this.updatePortalDash(dt, dx, dy, d);
    else if (this.mode === "summon") this.updateSummon(dt);
    else if (this.mode === "death_laser") this.updateDeathLaser(dt);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    this.recordPath(prevX, prevY);
    this.updateSegments();
    if (this.mode === "death_laser") this.heatLaserSegments();
    this.damagePlayer();
    this.updateVisualHeading(dt, prevX, prevY);
    if (this.modeTimer <= 0) this.nextMode();
  }

  updateCruise(dt, dx, dy, d, boost = 1) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.roamTimer -= dt;
    this.observeTimer = Math.max(0, this.observeTimer - dt);
    if (this.roamTimer <= 0) {
      const far = d < 560 ? 1 : d > 1100 ? -1 : Math.random() < 0.5 ? -1 : 1;
      this.roamAngle = Math.atan2(dy, dx) + far * (Math.PI * (0.45 + Math.random() * 0.36));
      this.roamRadius = 680 + Math.random() * 420 + this.phaseLevel * 70;
      this.roamTimer = 0.7 + Math.random() * 0.75;
    }
    const p = state.player;
    const desiredX = p.x - Math.cos(this.roamAngle) * this.roamRadius;
    const desiredY = p.y - Math.sin(this.roamAngle) * this.roamRadius;
    const toX = desiredX - this.x;
    const toY = desiredY - this.y;
    const toD = Math.max(1, Math.hypot(toX, toY));
    const huntBias = this.observeTimer <= 0 && d < 980 ? 0.38 : d > 1250 ? 0.52 : 0.12;
    const moveX = toX / toD * (1 - huntBias) + dx / d * huntBias;
    const moveY = toY / toD * (1 - huntBias) + dy / d * huntBias;
    const target = Math.atan2(moveY, moveX);
    this.heading += angleDiff(target, this.heading) * Math.min(1, dt * (1.65 + this.phaseLevel * 0.36));
    const speed = this.speed * boost * (1.08 + this.phaseLevel * 0.16);
    this.x += Math.cos(this.heading) * speed * dt;
    this.y += Math.sin(this.heading) * speed * dt;
    if (this.observeTimer <= 0 && this.fireTimer <= 0 && d < 1050) {
      this.fireTimer = this.phaseLevel >= 3 ? 0.22 : this.phaseLevel === 2 ? 0.32 : 0.42;
      this.fireHeadBarrage(Math.atan2(dy, dx));
    }
  }

  updateDash(dt, dx, dy, d) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    if (this.dashWindup > 0) {
      this.dashWindup -= dt;
      this.turnToward(Math.atan2(dy, dx), dt, 9.5);
      if (this.dashWindup <= 0) this.heading = Math.atan2(state.player.y - this.y, state.player.x - this.x);
      this.visualHeading = this.heading;
      return;
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const speed = this.speed * (this.phaseLevel >= 3 ? 10.8 : this.phaseLevel === 2 ? 8.9 : 7.2);
      this.dashVx = Math.cos(this.heading) * speed;
      this.dashVy = Math.sin(this.heading) * speed;
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      if (this.modeShotTimer <= 0) {
        this.modeShotTimer = 0.035;
        trail(this.x, this.y, this.x - Math.cos(this.heading) * 82, this.y - Math.sin(this.heading) * 82, this.phaseColor(), 20);
      }
      if (this.dashTime <= 0) this.dashCoast = this.phaseLevel >= 3 ? 0.46 : 0.36;
      return;
    }
    if (this.dashCoast > 0) {
      this.dashCoast -= dt;
      const drag = Math.pow(0.08, dt);
      this.dashVx *= drag;
      this.dashVy *= drag;
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      if (this.dashCoast <= 0 && this.dashLoops > 0) {
        this.dashLoops--;
        this.dashWindup = this.phaseLevel >= 3 ? 0.08 : 0.16;
        this.dashTime = this.phaseLevel >= 3 ? 0.5 : 0.42;
        this.dashVx = 0;
        this.dashVy = 0;
        this.turnToward(Math.atan2(state.player.y - this.y, state.player.x - this.x), dt, 18);
        this.visualHeading = this.heading;
      }
    }
  }

  updateCoil(dt, dx, dy, d) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    const p = state.player;
    const radius = 330 + this.phaseLevel * 38;
    const orbitSpeed = (this.phaseLevel >= 3 ? 2.25 : this.phaseLevel === 2 ? 1.75 : 1.35) * (this.attackIndex % 2 ? -1 : 1);
    this.heading += orbitSpeed * dt;
    const targetX = p.x + Math.cos(this.heading) * radius;
    const targetY = p.y + Math.sin(this.heading) * radius;
    this.x += (targetX - this.x) * Math.min(1, dt * 4.2);
    this.y += (targetY - this.y) * Math.min(1, dt * 4.2);
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phaseLevel >= 2 ? 0.44 : 0.62;
      this.fireSegmentFlames(0.18, false);
    }
  }

  updateLaserNet(dt) {
    this.bodyDamageEnabled = false;
    this.bodyAlpha = 0.28;
    this.driftAroundPlayer(dt, 0.22);
    if (this.netTimer <= 0 && this.netCount < 3) {
      this.netTimer = 0.72;
      this.netCount++;
      this.spawnLaserNet(this.netCount % 2 ? "cross" : "diagonal");
    }
    if (this.netCount >= 3 && this.netTimer <= 0) this.nextMode();
  }

  updateReaperFlame(dt) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.driftAroundPlayer(dt, 0.62);
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phaseLevel >= 3 ? 0.18 : 0.26;
      this.fireSegmentFlames(0.42, true);
    }
  }

  updatePortalDash(dt, dx, dy, d) {
    this.bodyDamageEnabled = this.portalState === "burst";
    this.bodyAlpha = this.portalState === "ready" ? 0.86 : 1;
    if (this.portalState === "enter") {
      this.portalPhase += dt / PORTAL_ENTER_TIME;
      this.bodyDamageEnabled = false;
      if (this.portalPhase >= 1) this.finishPortalEnter();
      return;
    }
    if (this.portalState === "emerge") {
      this.portalPhase += dt / PORTAL_EMERGE_TIME;
      this.bodyDamageEnabled = false;
      this.heading += angleDiff(Math.atan2(state.player.y - this.y, state.player.x - this.x), this.heading) * Math.min(1, dt * 4.5);
      if (this.portalPhase >= 1) {
        this.portalState = "burst";
        this.portalPhase = 1;
        this.dashLoops = 0;
        this.dashTime = this.phaseLevel >= 3 ? 0.5 : 0.42;
        this.dashCoast = this.phaseLevel >= 3 ? 0.42 : 0.32;
        this.firePurpleFireballs();
        pulse(this.x, this.y, 112, "#b48cff", 0.32);
      }
      return;
    }
    if (this.portalState === "burst" && this.dashTime > 0) return this.updateDash(dt, dx, dy, d);
    if (this.portalState === "burst" && this.dashCoast > 0) return this.updateDash(dt, dx, dy, d);
    this.portalState = "ready";
    if (this.portalTimer > 0) return;
    if (this.portalLoops <= 0) {
      this.nextMode();
      return;
    }
    const p = state.player;
    const a = Math.random() * TAU;
    this.portalEnter = { x: this.x, y: this.y, angle: this.heading };
    this.portalExit = {
      x: clamp(p.x + Math.cos(a) * (760 + Math.random() * 260), -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r),
      y: clamp(p.y + Math.sin(a) * (760 + Math.random() * 260), -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r),
    };
    this.portalExit.angle = Math.atan2(p.y - this.portalExit.y, p.x - this.portalExit.x);
    this.portalState = "enter";
    this.portalPhase = 0;
    world.itemObjects.push({ kind: "storm_portal", x: this.portalEnter.x, y: this.portalEnter.y, r: 48, color: "#b48cff", life: 1.05, maxLife: 1.05, phase: "enter" });
    world.itemObjects.push({ kind: "storm_portal", x: this.portalExit.x, y: this.portalExit.y, r: 58, color: "#ff4dff", life: 1.32, maxLife: 1.32, phase: "exit" });
    this.portalLoops--;
    this.portalTimer = this.phaseLevel >= 3 ? 0.58 : 0.78;
    pulse(this.x, this.y, 92, "#b48cff", 0.28);
  }

  finishPortalEnter() {
    if (!this.portalExit) return;
    this.x = this.portalExit.x;
    this.y = this.portalExit.y;
    this.heading = this.portalExit.angle;
    this.visualHeading = this.heading;
    this.portalState = "emerge";
    this.portalPhase = 0;
    this.dashWindup = 0;
    this.dashTime = 0;
    this.dashCoast = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.seedPath();
  }

  updateSummon(dt) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.driftAroundPlayer(dt, 0.4);
    if (!this.summoned) {
      this.summoned = true;
      this.summonMechWorms();
    }
  }

  updateDeathLaser(dt) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.deathLaserTargetAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    this.deathLaserAngle += angleDiff(this.deathLaserTargetAngle, this.deathLaserAngle) * Math.min(1, dt * (1.15 + this.phaseLevel * 0.28));
    this.deathLaserAngle += this.deathLaserSpin * dt * (this.phaseLevel >= 3 ? 1.15 : 0.82);
    this.heading = this.deathLaserAngle;
    this.x += Math.cos(this.heading + Math.PI / 2) * this.speed * 0.32 * dt;
    this.y += Math.sin(this.heading + Math.PI / 2) * this.speed * 0.32 * dt;
    this.damageDeathLaser(dt);
  }

  driftAroundPlayer(dt, pull) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const tangent = Math.atan2(dy, dx) + Math.PI / 2;
    const radial = d > 480 ? pull : -pull * 0.45;
    this.x += (Math.cos(tangent) + dx / d * radial) * this.speed * (0.8 + this.phaseLevel * 0.2) * dt;
    this.y += (Math.sin(tangent) + dy / d * radial) * this.speed * (0.8 + this.phaseLevel * 0.2) * dt;
    this.heading = Math.atan2(dy, dx);
  }

  nextMode() {
    this.attackIndex++;
    const phase1 = ["cruise", "dash", "coil"];
    const phase2 = ["cruise", "dash", "coil", "laser_net", "reaper_flame", "portal_dash"];
    const phase3 = ["summon", "death_laser", "portal_dash", "dash", "reaper_flame", "laser_net", "coil", "cruise"];
    const sequence = this.phaseLevel >= 3 ? phase3 : this.phaseLevel === 2 ? phase2 : phase1;
    this.enterMode(sequence[this.attackIndex % sequence.length]);
  }

  enterMode(mode) {
    this.mode = mode;
    this.fireTimer = 0;
    this.modeShotTimer = 0;
    this.netTimer = 0;
    this.netCount = 0;
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    this.portalState = "ready";
    this.portalPhase = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    const speed = this.phaseLevel >= 3 ? 0.72 : this.phaseLevel === 2 ? 0.86 : 1;
    if (mode === "emerge") this.modeTimer = 1.1;
    if (mode === "cruise") {
      this.modeTimer = (this.phaseLevel >= 3 ? 2.0 : 2.65) * speed;
      this.observeTimer = this.phaseLevel >= 3 ? 0.65 : 0.95;
    }
    if (mode === "coil") this.modeTimer = (this.phaseLevel >= 3 ? 2.6 : 3.5) * speed;
    if (mode === "reaper_flame") this.modeTimer = 2.4 * speed;
    if (mode === "laser_net") {
      this.modeTimer = 2.4 * speed;
      this.bodyDamageEnabled = false;
      this.bodyAlpha = 0.28;
    }
    if (mode === "dash") {
      this.modeTimer = (this.phaseLevel >= 3 ? 2.25 : 2.6) * speed;
      this.dashLoops = this.phaseLevel >= 3 ? 4 : this.phaseLevel === 2 ? 3 : 2;
      this.dashWindup = this.phaseLevel >= 3 ? 0.08 : 0.18;
      this.dashTime = this.phaseLevel >= 3 ? 0.52 : 0.42;
      this.dashCoast = 0;
      this.heading = Math.atan2(state.player.y - this.y, state.player.x - this.x);
      this.visualHeading = this.heading;
      pulse(this.x, this.y, 96, this.phaseColor(), 0.28);
    }
    if (mode === "portal_dash") {
      this.modeTimer = this.phaseLevel >= 3 ? 7.6 : 6.4;
      this.portalLoops = this.phaseLevel >= 3 ? 4 : 3;
      this.portalTimer = 0;
      this.observeTimer = 0;
    }
    if (mode === "summon") {
      this.modeTimer = 2.6 * speed;
      this.summoned = false;
    }
    if (mode === "death_laser") {
      this.modeTimer = this.phaseLevel >= 3 ? 5.2 : 4.6;
      this.deathLaserAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
      this.deathLaserTargetAngle = this.deathLaserAngle;
      this.deathLaserSpin = Math.random() < 0.5 ? -1 : 1;
    }
  }

  seedPath() {
    this.path.length = 0;
    for (let i = 0; i < SEGMENT_COUNT * this.segmentGap + 90; i++) {
      this.path.push({ x: this.x - Math.cos(this.heading) * i, y: this.y - Math.sin(this.heading) * i });
    }
  }

  recordPath(prevX = this.x, prevY = this.y) {
    const distance = Math.hypot(this.x - prevX, this.y - prevY);
    const samples = Math.max(1, Math.min(8, Math.ceil(distance / 22)));
    for (let i = samples; i >= 1; i--) {
      const t = i / samples;
      this.path.unshift({ x: prevX + (this.x - prevX) * t, y: prevY + (this.y - prevY) * t });
    }
    const max = SEGMENT_COUNT * this.segmentGap + 90;
    if (this.path.length > max) this.path.length = max;
  }

  updateSegments() {
    let leadX = this.x;
    let leadY = this.y;
    let leadAngle = this.heading;
    const maxBend = this.mode === "coil" ? 0.74 : this.mode === "dash" || this.mode === "portal_dash" ? 0.5 : MAX_BODY_BEND;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const pathTarget = this.samplePath((i + 1) * this.segmentGap);
      const pathFront = this.samplePath(i * this.segmentGap);
      let angle = pathTarget ? Math.atan2((pathFront?.y ?? leadY) - pathTarget.y, (pathFront?.x ?? leadX) - pathTarget.x) : Math.atan2(leadY - seg.y, leadX - seg.x);
      const bend = angleDiff(angle, leadAngle);
      if (Math.abs(bend) > maxBend) angle = leadAngle + Math.sign(bend) * maxBend;
      const targetX = leadX - Math.cos(angle) * this.segmentGap;
      const targetY = leadY - Math.sin(angle) * this.segmentGap;
      const follow = this.mode === "dash" || this.mode === "portal_dash" ? 0.82 : 0.92;
      seg.x += (targetX - seg.x) * follow;
      seg.y += (targetY - seg.y) * follow;
      seg.angle = angle;
      seg.heat = Math.max(0, seg.heat - 0.06);
      leadX = seg.x;
      leadY = seg.y;
      leadAngle = angle;
    }
    this.relaxSegmentOverlaps();
  }

  samplePath(distance) {
    if (!this.path.length) return null;
    if (distance <= 0) return this.path[0];
    let traveled = 0;
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1];
      const b = this.path[i];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (span <= 0.001) continue;
      if (traveled + span >= distance) {
        const t = (distance - traveled) / span;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      traveled += span;
    }
    return this.path[this.path.length - 1];
  }

  relaxSegmentOverlaps() {
    const points = [{ x: this.x, y: this.y, r: this.r, fixed: true }, ...this.segments.map((seg) => ({ x: seg.x, y: seg.y, r: this.segmentRadius(seg), seg }))];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 3; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const min = (a.r + b.r) * 0.72;
        if (d >= min) continue;
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        if (!a.fixed && a.seg) {
          a.seg.x -= nx * push;
          a.seg.y -= ny * push;
          a.x = a.seg.x;
          a.y = a.seg.y;
        }
        if (!b.fixed && b.seg) {
          b.seg.x += nx * push;
          b.seg.y += ny * push;
          b.x = b.seg.x;
          b.y = b.seg.y;
        }
      }
    }
  }

  turnToward(target, dt, rate) {
    this.heading += angleDiff(target, this.heading) * Math.min(1, dt * rate);
  }

  updateVisualHeading(dt, prevX, prevY) {
    if (this.mode === "dash" || this.mode === "portal_dash" || this.dashWindup > 0) {
      this.visualHeading = this.heading;
      return;
    }
    const moveX = this.x - prevX;
    const moveY = this.y - prevY;
    const moved = Math.hypot(moveX, moveY);
    const target = moved > 0.8 ? Math.atan2(moveY, moveX) : this.heading;
    this.visualHeading += angleDiff(target, this.visualHeading) * Math.min(1, dt * 8);
  }

  hitTest(x, y, r = 0) {
    if (distSq(x, y, this.x, this.y) <= (this.r + r) ** 2) return true;
    for (const seg of this.segments) {
      if (distSq(x, y, seg.x, seg.y) <= (this.segmentRadius(seg) + r) ** 2) return true;
    }
    return false;
  }

  damagePlayer() {
    const p = state.player;
    if (p.invuln > 0) return;
    if (distSq(this.x, this.y, p.x, p.y) <= (this.r + p.r) ** 2) return this.hitPlayer(this.mode === "dash" || this.mode === "portal_dash" ? 1.55 : 1.1);
    if (!this.bodyDamageEnabled) return;
    for (const seg of this.segments) {
      const r = this.segmentRadius(seg) + p.r;
      if (distSq(seg.x, seg.y, p.x, p.y) <= r * r) return this.hitPlayer(this.mode === "coil" ? 0.86 : 0.62);
    }
  }

  hitPlayer(mult) {
    const p = state.player;
    applyPlayerDamage(this.damage * mult, this);
    p.invuln = 0.5;
    state.shake = Math.max(state.shake, 12);
    state.flash = Math.max(state.flash, 0.22);
    burst(p.x, p.y, 12, this.phaseColor(), 170);
    playSfx("hurt");
  }

  takeDamage(amount, x, y, options = {}) {
    const headHit = distSq(x, y, this.x, this.y) < (this.r * 1.4) ** 2;
    super.takeDamage(amount * (headHit ? 1.15 : 1), x, y, options);
    const nearest = this.nearestSegment(x, y);
    if (nearest && !options.statusEffect) nearest.heat = 1;
  }

  nearestSegment(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const seg of this.segments) {
      const d = distSq(x, y, seg.x, seg.y);
      if (d < bestD) {
        bestD = d;
        best = seg;
      }
    }
    return best;
  }

  fireHeadBarrage(angle) {
    const count = this.phaseLevel >= 3 ? 3 : this.phaseLevel === 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * 0.18;
      this.fireOrb(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, a, this.phaseLevel >= 3 ? 250 : 210, 0.26, "storm_rail_head_barrage");
    }
    playSfx("shoot");
  }

  fireSegmentFlames(damageMul, sweep) {
    const nodes = this.segments.filter((seg) => seg.node);
    for (let i = 0; i < nodes.length; i += sweep ? 1 : 2) {
      const seg = nodes[i];
      const a = sweep ? seg.angle + Math.sin(this.phase + i) * 0.8 : Math.atan2(state.player.y - seg.y, state.player.x - seg.x);
      seg.heat = 1;
      world.enemyProjectiles.push({
        x: seg.x,
        y: seg.y,
        vx: Math.cos(a) * (sweep ? 320 : 240),
        vy: Math.sin(a) * (sweep ? 320 : 240),
        r: sweep ? 5 : 6,
        color: this.phaseLevel >= 2 ? "#ff4dff" : this.color,
        damage: this.damage * damageMul,
        life: sweep ? 1.8 : 3.2,
        shape: "laserShard",
        long: true,
        source: "storm_rail_reaper_flame",
        bossProjectile: true,
      });
    }
    playSfx("shoot");
  }

  firePurpleFireballs() {
    const base = this.heading;
    const count = this.phaseLevel >= 3 ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.16;
      this.fireOrb(this.x, this.y, a, 310, 0.34, "storm_rail_void_fireball", "#b48cff", true);
    }
    playSfx("wave");
  }

  fireDeathLaserPulse() {
    world.enemyProjectiles.push({
      x: this.x,
      y: this.y,
      vx: Math.cos(this.deathLaserAngle) * 740,
      vy: Math.sin(this.deathLaserAngle) * 740,
      r: 7,
      color: "#ff4dff",
      damage: this.damage * 0.32,
      life: 0.6,
      shape: "laserShard",
      long: true,
      source: "storm_rail_death_laser",
      bossProjectile: true,
    });
  }

  damageDeathLaser(dt) {
    const p = state.player;
    if (p.invuln > 0) return;
    const origin = this.laserOrigin();
    const dist = pointRayDistance(p.x, p.y, origin.x, origin.y, this.deathLaserAngle, 1550);
    if (dist < p.r + 34) {
      applyPlayerDamage(this.damage * 1.7 * dt, this);
      p.invuln = Math.max(p.invuln, 0.08);
      state.flash = Math.max(state.flash, 0.12);
    }
  }

  heatLaserSegments() {
    for (let i = 0; i < Math.min(8, this.segments.length); i++) {
      this.segments[i].heat = Math.max(this.segments[i].heat, 0.58 - i * 0.045);
      this.segments[i].angle += angleDiff(this.deathLaserAngle, this.segments[i].angle) * 0.18;
    }
  }

  laserOrigin() {
    const jaw = this.r * 1.54;
    return {
      x: this.x + Math.cos(this.deathLaserAngle) * jaw,
      y: this.y + Math.sin(this.deathLaserAngle) * jaw,
    };
  }

  fireOrb(x, y, angle, speed, damageMul, source, color = this.phaseColor(), split = false) {
    world.enemyProjectiles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: split ? 8 : 6,
      color,
      damage: this.damage * damageMul,
      life: split ? 2.2 : 4,
      shape: split ? "voidFireball" : "stormOrb",
      spin: Math.random() * TAU,
      source,
      splitOnExpire: split,
      bossProjectile: true,
    });
  }

  spawnLaserNet(pattern) {
    const p = state.player;
    const color = pattern === "diagonal" ? "#b48cff" : "#42e8ff";
    const offsets = [-260, 0, 260];
    const netWave = this.netCount;
    for (const offset of offsets) {
      const angle = pattern === "diagonal" ? Math.PI / 4 : 0;
      world.hazards.push({
        kind: "storm_laser_net",
        x: p.x,
        y: p.y + offset,
        angle,
        length: NET_LENGTH,
        width: 34,
        surgeTime: 0.22,
        netWave,
        color,
        damage: this.damage * 0.72,
        life: 1.45,
        maxLife: 1.45,
        armTime: 0.55,
        armDuration: 0.55,
      });
      if (pattern === "cross") {
        world.hazards.push({
          kind: "storm_laser_net",
          x: p.x + offset,
          y: p.y,
          angle: Math.PI / 2,
          length: NET_LENGTH,
          width: 34,
          surgeTime: 0.22,
          netWave,
          color: "#ff4dff",
          damage: this.damage * 0.72,
          life: 1.45,
          maxLife: 1.45,
          armTime: 0.55,
          armDuration: 0.55,
        });
      }
    }
    playSfx("wave");
  }

  summonMechWorms() {
    const p = state.player;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4;
      const worm = new MechWorm({
        id: "mech_worm",
        name: "雷铸机械蠕虫",
        hp: 260 + state.wave * 18,
        speed: 136,
        damage: 28,
        radius: 18,
        xp: 0,
        color: "#b48cff",
        behavior: "mech_worm",
      }, p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420);
      worm.empowered = true;
      worm.hp *= 2.4;
      worm.maxHp = worm.hp;
      worm.speed *= 1.42;
      worm.damage *= 1.35;
      worm.knockbackResistance = Math.max(worm.knockbackResistance, 0.68);
      worm.cooldown = 0.35 + i * 0.08;
      worm.color = i % 2 ? "#ff4dff" : "#42e8ff";
      world.enemies.push(worm);
    }
    pulse(this.x, this.y, 180, "#b48cff", 0.36);
    playSfx("wave");
  }

  phaseShift() {
    this.phasePulse = 1;
    pulse(this.x, this.y, 180, this.phaseColor(), 0.4);
    burst(this.x, this.y, 32, this.phaseColor(), 260);
    if (this.phaseLevel >= 3) this.attackIndex = 0;
  }

  kill() {
    if (this.dead) return;
    for (const seg of this.segments) burst(seg.x, seg.y, seg.node ? 14 : 7, this.phaseColor(), 220);
    pulse(this.x, this.y, 240, "#ffffff", 0.46);
    super.kill();
  }

  segmentRadius(seg) {
    return this.r * (seg.node ? 0.74 : BODY_RADIUS_SCALE);
  }

  phaseColor() {
    return this.phaseLevel >= 2 ? "#ff4dff" : this.color;
  }

  draw(ctx) {
    ctx.save();
    this.drawTelegraphs(ctx);
    this.drawShadow(ctx);
    this.drawBodyLinks(ctx);
    for (let i = this.segments.length - 1; i >= 0; i--) this.drawSegment(ctx, this.segments[i], i);
    this.drawHead(ctx);
    if (this.mode === "death_laser") this.drawDeathLaser(ctx);
    ctx.restore();
  }

  drawTelegraphs(ctx) {
    if (this.mode !== "dash" || this.dashWindup <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.visualHeading);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(this.phaseColor(), 0.65);
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(this.r, 0);
    ctx.lineTo(920, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawShadow(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    for (const seg of this.segments) {
      ctx.beginPath();
      ctx.ellipse(seg.x, seg.y + 18, this.segmentRadius(seg), this.r * 0.18, seg.angle, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 20, this.r * 1.35, this.r * 0.35, 0, 0, TAU);
    ctx.fill();
  }

  drawBodyLinks(ctx) {
    const color = this.phaseColor();
    ctx.save();
    ctx.globalAlpha = this.bodyAlpha * this.portalBodyAlpha();
    ctx.strokeStyle = colorWithAlpha("#07111f", 0.9);
    ctx.lineWidth = this.mode === "coil" ? 18 : 13;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    for (const seg of this.segments) ctx.lineTo(seg.x, seg.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha(color, this.mode === "coil" ? 0.88 : 0.58);
    ctx.lineWidth = this.mode === "coil" ? 5 : 3.2;
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#ffffff", 0.24);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([14, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.mode === "coil" || this.mode === "laser_net") {
      ctx.strokeStyle = colorWithAlpha(color, 0.18);
      ctx.lineWidth = 24;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSegment(ctx, seg, i) {
    const color = this.phaseColor();
    const r = this.segmentRadius(seg);
    const portalAlpha = this.portalSegmentAlpha(i + 1);
    if (portalAlpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = this.bodyAlpha * portalAlpha;
    ctx.translate(seg.x, seg.y);
    ctx.rotate(seg.angle);
    const hot = Math.max(seg.heat, this.phasePulse * 0.6);
    ctx.shadowColor = colorWithAlpha(color, 0.7);
    ctx.shadowBlur = seg.node ? 16 + hot * 18 : 7 + hot * 12;
    ctx.fillStyle = this.flash > 0 || seg.heat > 0.55 ? "#ffffff" : seg.node ? "#141a30" : "#0b1323";
    ctx.beginPath();
    ctx.moveTo(r * 1.22, 0);
    ctx.lineTo(r * 0.62, -r * 0.96);
    ctx.lineTo(-r * 0.72, -r * 0.72);
    ctx.lineTo(-r * 1.18, -r * 0.28);
    ctx.lineTo(-r * 1.02, r * 0.28);
    ctx.lineTo(-r * 0.72, r * 0.72);
    ctx.lineTo(r * 0.62, r * 0.96);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colorWithAlpha(color, seg.node ? 1 : 0.7);
    ctx.lineWidth = seg.node ? 3.2 : 2;
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha("#ffffff", 0.08);
    ctx.fillRect(-r * 0.76, -r * 0.42, r * 1.1, r * 0.18);
    ctx.fillRect(-r * 0.76, r * 0.24, r * 1.1, r * 0.18);
    ctx.fillStyle = colorWithAlpha(color, 0.62 + hot * 0.28);
    ctx.fillRect(-r * 0.2, -r * 0.56, r * 0.4, r * 1.12);
    ctx.fillStyle = colorWithAlpha("#ffffff", 0.68 + hot * 0.22);
    ctx.fillRect(r * 0.22, -r * 0.09, r * 0.38, r * 0.18);
    for (const side of [-1, 1]) {
      ctx.fillStyle = colorWithAlpha(seg.node ? color : "#1f2a44", seg.node ? 0.82 : 0.72);
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, side * r * 0.64);
      ctx.lineTo(-r * 0.88, side * r * 1.16);
      ctx.lineTo(r * 0.72, side * r * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = colorWithAlpha("#ffffff", 0.18);
      ctx.stroke();
    }
    if (seg.node) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = colorWithAlpha(color, 0.84);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.72 + Math.sin(this.anim * 3 + i) * 0.08), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHead(ctx) {
    const color = this.phaseColor();
    const portalAlpha = this.portalSegmentAlpha(0);
    if (portalAlpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = portalAlpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.visualHeading);
    ctx.shadowColor = colorWithAlpha(color, 0.84);
    ctx.shadowBlur = 22;
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#0a1020";
    ctx.beginPath();
    ctx.moveTo(this.r * 2.05, 0);
    ctx.lineTo(this.r * 0.78, -this.r * 1.18);
    ctx.lineTo(-this.r * 0.92, -this.r * 0.92);
    ctx.lineTo(-this.r * 1.44, -this.r * 0.34);
    ctx.lineTo(-this.r * 1.3, this.r * 0.34);
    ctx.lineTo(-this.r * 0.92, this.r * 0.92);
    ctx.lineTo(this.r * 0.78, this.r * 1.18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha("#ffffff", 0.1);
    ctx.fillRect(-this.r * 0.82, -this.r * 0.58, this.r * 1.46, this.r * 0.18);
    ctx.fillRect(-this.r * 0.82, this.r * 0.4, this.r * 1.46, this.r * 0.18);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.r * 0.66, 0, this.r * 0.28 + Math.sin(this.anim * 8) * 1.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, 0.92);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.r * 0.84, 0);
    ctx.lineTo(this.r * 1.94, 0);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha(color, 0.8);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(this.r * 0.52, -this.r * 0.78);
    ctx.lineTo(this.r * 1.42, -this.r * 1.44);
    ctx.lineTo(this.r * 1.78, -this.r * 1.08);
    ctx.moveTo(this.r * 0.52, this.r * 0.78);
    ctx.lineTo(this.r * 1.42, this.r * 1.44);
    ctx.lineTo(this.r * 1.78, this.r * 1.08);
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha("#ff4dff", this.phaseLevel >= 2 ? 0.55 : 0.22);
    ctx.fillRect(-this.r * 0.36, -this.r * 0.18, this.r * 0.58, this.r * 0.36);
    ctx.restore();
  }

  drawDeathLaser(ctx) {
    const origin = this.laserOrigin();
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(this.deathLaserAngle);
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.82 + Math.sin(this.phase * 18) * 0.18;
    ctx.strokeStyle = colorWithAlpha("#ff4dff", 0.5);
    ctx.lineWidth = 46 * pulse;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1550, 0);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha("#42e8ff", 0.3);
    ctx.lineWidth = 70 * pulse;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1550, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1550, 0);
    ctx.stroke();
    ctx.restore();
  }

  portalBodyAlpha() {
    if (this.portalState !== "enter" && this.portalState !== "emerge") return 1;
    return 0.34 + this.portalPhase * 0.28;
  }

  portalSegmentAlpha(index) {
    if (this.portalState !== "enter" && this.portalState !== "emerge") return 1;
    const order = index / (this.segments.length + 1);
    const sweep = this.portalPhase * 1.18 - order;
    if (this.portalState === "enter") return clamp(1 - sweep * 4.2, 0, 1);
    return clamp(sweep * 4.2, 0, 1);
  }
}

function pointRayDistance(px, py, x, y, angle, length) {
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);
  const dx = px - x;
  const dy = py - y;
  const forward = dx * vx + dy * vy;
  if (forward < 0 || forward > length) return Infinity;
  return Math.abs(dx * -vy + dy * vx);
}

function colorWithAlpha(hex, alpha) {
  if (!hex || hex[0] !== "#") return `rgba(66,232,255,${alpha})`;
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
