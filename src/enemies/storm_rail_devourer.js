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
const PHASE2_HP = 0.66;
const PHASE3_HP = 0.32;
const NET_LENGTH = 3600;

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
    this.fireTimer = 0;
    this.modeShotTimer = 0;
    this.dashWindup = 0;
    this.dashTime = 0;
    this.dashCoast = 0;
    this.dashLoops = 0;
    this.portalTimer = 0;
    this.portalLoops = 0;
    this.netTimer = 0;
    this.netCount = 0;
    this.deathLaserAngle = 0;
    this.summoned = false;
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
    this.recordPath();
    this.updateSegments();
    this.damagePlayer();
    if (this.modeTimer <= 0) this.nextMode();
  }

  updateCruise(dt, dx, dy, d, boost = 1) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    const target = Math.atan2(dy, dx);
    this.heading += angleDiff(target, this.heading) * Math.min(1, dt * (2.2 + this.phaseLevel * 0.45));
    const speed = this.speed * boost * (1 + this.phaseLevel * 0.14);
    this.x += Math.cos(this.heading) * speed * dt;
    this.y += Math.sin(this.heading) * speed * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.phaseLevel >= 3 ? 0.22 : this.phaseLevel === 2 ? 0.32 : 0.42;
      this.fireHeadBarrage(this.heading);
    }
  }

  updateDash(dt, dx, dy, d) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    if (this.dashWindup > 0) {
      this.dashWindup -= dt;
      this.heading += angleDiff(Math.atan2(dy, dx), this.heading) * Math.min(1, dt * 5);
      return;
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const speed = this.speed * (this.phaseLevel >= 3 ? 8.2 : this.phaseLevel === 2 ? 6.7 : 5.6);
      this.x += Math.cos(this.heading) * speed * dt;
      this.y += Math.sin(this.heading) * speed * dt;
      if (this.modeShotTimer <= 0) {
        this.modeShotTimer = 0.035;
        trail(this.x, this.y, this.x - Math.cos(this.heading) * 82, this.y - Math.sin(this.heading) * 82, this.phaseColor(), 20);
      }
      if (this.dashTime <= 0) this.dashCoast = 0.28;
      return;
    }
    if (this.dashCoast > 0) {
      this.dashCoast -= dt;
      this.x += Math.cos(this.heading) * this.speed * 3.1 * dt;
      this.y += Math.sin(this.heading) * this.speed * 3.1 * dt;
      if (this.dashCoast <= 0 && this.dashLoops > 0) {
        this.dashLoops--;
        this.dashWindup = this.phaseLevel >= 3 ? 0.08 : 0.16;
        this.dashTime = this.phaseLevel >= 3 ? 0.5 : 0.42;
        this.heading = Math.atan2(dy, dx);
      }
    }
  }

  updateCoil(dt, dx, dy, d) {
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 1;
    const p = state.player;
    const radius = 245;
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
    this.x += Math.cos(this.heading) * this.speed * 0.32 * dt;
    this.y += Math.sin(this.heading) * this.speed * 0.32 * dt;
    if (this.netTimer <= 0 && this.netCount < 3) {
      this.netTimer = 0.55;
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
    this.bodyDamageEnabled = true;
    this.bodyAlpha = 0.72;
    if (this.portalTimer > 0) return;
    if (this.portalLoops <= 0) {
      this.nextMode();
      return;
    }
    const p = state.player;
    const enter = { x: this.x, y: this.y };
    const a = Math.random() * TAU;
    this.x = clamp(p.x + Math.cos(a) * 620, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(p.y + Math.sin(a) * 620, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.heading = Math.atan2(p.y - this.y, p.x - this.x);
    world.itemObjects.push({ kind: "storm_portal", x: enter.x, y: enter.y, r: 42, color: "#b48cff", life: 0.65, maxLife: 0.65 });
    world.itemObjects.push({ kind: "storm_portal", x: this.x, y: this.y, r: 54, color: "#ff4dff", life: 0.8, maxLife: 0.8 });
    this.dashWindup = 0;
    this.dashTime = 0.42;
    this.dashCoast = 0.22;
    this.firePurpleFireballs();
    this.portalLoops--;
    this.portalTimer = this.phaseLevel >= 3 ? 0.62 : 0.86;
    pulse(this.x, this.y, 92, "#b48cff", 0.28);
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
    this.deathLaserAngle += dt * (this.phaseLevel >= 3 ? 4.4 : 3.2);
    this.heading = this.deathLaserAngle;
    this.x += Math.cos(this.heading + Math.PI / 2) * this.speed * 0.32 * dt;
    this.y += Math.sin(this.heading + Math.PI / 2) * this.speed * 0.32 * dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.08;
      this.fireDeathLaserPulse();
    }
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
    const speed = this.phaseLevel >= 3 ? 0.72 : this.phaseLevel === 2 ? 0.86 : 1;
    if (mode === "emerge") this.modeTimer = 1.1;
    if (mode === "cruise") this.modeTimer = (this.phaseLevel >= 3 ? 2.0 : 2.65) * speed;
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
      pulse(this.x, this.y, 96, this.phaseColor(), 0.28);
    }
    if (mode === "portal_dash") {
      this.modeTimer = (this.phaseLevel >= 3 ? 3.4 : 2.8) * speed;
      this.portalLoops = this.phaseLevel >= 3 ? 4 : 3;
      this.portalTimer = 0;
    }
    if (mode === "summon") {
      this.modeTimer = 2.6 * speed;
      this.summoned = false;
    }
    if (mode === "death_laser") {
      this.modeTimer = 2.8 * speed;
      this.deathLaserAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    }
  }

  seedPath() {
    this.path.length = 0;
    for (let i = 0; i < SEGMENT_COUNT * this.segmentGap + 90; i++) {
      this.path.push({ x: this.x - Math.cos(this.heading) * i, y: this.y - Math.sin(this.heading) * i });
    }
  }

  recordPath() {
    this.path.unshift({ x: this.x, y: this.y });
    const max = SEGMENT_COUNT * this.segmentGap + 90;
    if (this.path.length > max) this.path.length = max;
  }

  updateSegments() {
    let leadX = this.x;
    let leadY = this.y;
    let leadAngle = this.heading;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      let angle = Math.atan2(leadY - seg.y, leadX - seg.x);
      const pathTarget = this.path[Math.min(this.path.length - 1, Math.round((i + 1) * this.segmentGap))];
      if (pathTarget) {
        const pathAngle = Math.atan2(leadY - pathTarget.y, leadX - pathTarget.x);
        angle += angleDiff(pathAngle, angle) * 0.42;
      } else {
        angle = leadAngle;
      }
      const targetX = leadX - Math.cos(angle) * this.segmentGap;
      const targetY = leadY - Math.sin(angle) * this.segmentGap;
      const follow = this.mode === "dash" || this.mode === "portal_dash" ? 0.9 : 0.76;
      seg.x += (targetX - seg.x) * follow;
      seg.y += (targetY - seg.y) * follow;
      seg.angle = angle;
      seg.heat = Math.max(0, seg.heat - 0.06);
      leadX = seg.x;
      leadY = seg.y;
      leadAngle = angle;
    }
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
    const dist = pointRayDistance(p.x, p.y, this.x, this.y, this.deathLaserAngle, 1150);
    if (dist < p.r + 18) {
      applyPlayerDamage(this.damage * 1.4 * dt, this);
      p.invuln = Math.max(p.invuln, 0.08);
      state.flash = Math.max(state.flash, 0.12);
    }
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
        width: 22,
        netWave,
        color,
        damage: this.damage * 0.72,
        life: 1.05,
        maxLife: 1.05,
        armTime: 0.55,
      });
      if (pattern === "cross") {
        world.hazards.push({
          kind: "storm_laser_net",
          x: p.x + offset,
          y: p.y,
          angle: Math.PI / 2,
          length: NET_LENGTH,
          width: 22,
          netWave,
          color: "#ff4dff",
          damage: this.damage * 0.72,
          life: 1.05,
          maxLife: 1.05,
          armTime: 0.55,
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
        name: "强化机械蠕虫",
        hp: 120,
        speed: 116,
        damage: 18,
        radius: 16,
        xp: 0,
        color: "#b48cff",
        behavior: "mech_worm",
      }, p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420);
      worm.empowered = true;
      worm.hp *= 1.8;
      worm.maxHp = worm.hp;
      worm.speed *= 1.25;
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
    ctx.rotate(this.heading);
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
    ctx.globalAlpha = this.bodyAlpha;
    ctx.strokeStyle = colorWithAlpha(color, this.mode === "coil" ? 0.78 : 0.42);
    ctx.lineWidth = this.mode === "coil" ? 5 : 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    for (const seg of this.segments) ctx.lineTo(seg.x, seg.y);
    ctx.stroke();
    if (this.mode === "coil" || this.mode === "laser_net") {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = colorWithAlpha(color, 0.18);
      ctx.lineWidth = 16;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSegment(ctx, seg, i) {
    const color = this.phaseColor();
    const r = this.segmentRadius(seg);
    ctx.save();
    ctx.globalAlpha = this.bodyAlpha;
    ctx.translate(seg.x, seg.y);
    ctx.rotate(seg.angle);
    ctx.fillStyle = this.flash > 0 || seg.heat > 0.55 ? "#ffffff" : seg.node ? "#151b35" : "#101827";
    ctx.beginPath();
    ctx.moveTo(r * 1.14, 0);
    ctx.lineTo(r * 0.5, -r * 0.82);
    ctx.lineTo(-r * 0.82, -r * 0.62);
    ctx.lineTo(-r * 1.08, 0);
    ctx.lineTo(-r * 0.82, r * 0.62);
    ctx.lineTo(r * 0.5, r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, seg.node ? 0.9 : 0.58);
    ctx.lineWidth = seg.node ? 2.6 : 1.7;
    ctx.stroke();
    ctx.fillStyle = colorWithAlpha(color, 0.72 + seg.heat * 0.24);
    ctx.fillRect(-r * 0.18, -r * 0.48, r * 0.36, r * 0.96);
    if (seg.node) {
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.62 + Math.sin(this.anim * 3 + i) * 0.08), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHead(ctx) {
    const color = this.phaseColor();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#111827";
    ctx.beginPath();
    ctx.moveTo(this.r * 1.72, 0);
    ctx.lineTo(this.r * 0.55, -this.r * 1.04);
    ctx.lineTo(-this.r * 1.05, -this.r * 0.72);
    ctx.lineTo(-this.r * 1.28, this.r * 0.72);
    ctx.lineTo(this.r * 0.55, this.r * 1.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.r * 0.5, 0, this.r * 0.22 + Math.sin(this.anim * 8) * 1.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.r * 0.8, -this.r * 0.72);
    ctx.lineTo(this.r * 1.6, -this.r * 1.18);
    ctx.moveTo(this.r * 0.8, this.r * 0.72);
    ctx.lineTo(this.r * 1.6, this.r * 1.18);
    ctx.stroke();
    ctx.restore();
  }

  drawDeathLaser(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.deathLaserAngle);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = colorWithAlpha("#ff4dff", 0.42);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(this.r, 0);
    ctx.lineTo(1150, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.r, 0);
    ctx.lineTo(1150, 0);
    ctx.stroke();
    ctx.restore();
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
