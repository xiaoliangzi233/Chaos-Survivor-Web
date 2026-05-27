import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

const TETHER_RANGE = 920;
const RESONANCE_HP = 0.4;

export class TwinAbyssalEyes extends BaseEnemy {
  constructor(config, x, y, shared = null, role = "crimson") {
    const eyeConfig = role === "azure" ? azureConfig(config) : crimsonConfig(config);
    super(eyeConfig, x, y);
    this.role = role;
    this.type = role === "azure" ? "azure_oculus" : "crimson_oculus";
    this.name = role === "azure" ? "裂渊双瞳·苍雷魔瞳" : "裂渊双瞳·绯裂魔瞳";
    this.color = role === "azure" ? "#42e8ff" : "#ff4d6d";
    this.r = role === "azure" ? config.radius * 0.96 : config.radius;
    this.behavior = role === "azure" ? "boss_twin_azure" : "boss_twin_crimson";
    this.shared = shared || createSharedState();
    this.shared.rewardXp = config.xp;
    this.mode = "intro";
    this.modeTimer = 0.9 + Math.random() * 0.25;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.angle = 0;
    this.orbit = Math.random() * TAU;
    this.dashVx = 0;
    this.dashVy = 0;
    this.trailTimer = 0;
    this.enraged = false;
    this.knockbackResistance = 0.93;

    this.shared.members.add(this);
    if (role === "crimson") {
      const spawnA = Math.random() * TAU;
      const mate = new TwinAbyssalEyes(config, x + Math.cos(spawnA) * 180, y + Math.sin(spawnA) * 180, this.shared, "azure");
      world.enemies.push(mate);
    }
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.enraged ? 6.2 : 4.5);
    this.orbit += dt * (this.role === "azure" ? 2.1 : 2.9);
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.angle = Math.atan2(dy, dx);
    this.updateShared(dt);

    if (this.role === "crimson") this.updateCrimson(dt, dx, dy, d);
    else this.updateAzure(dt, dx, dy, d);
    this.keepTethered(dt);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.58;
      state.shake = 10;
      state.flash = 0.22;
      burst(p.x, p.y, 12, this.color, 150);
      playSfx("hurt");
    }
  }

  updateShared(dt) {
    const alive = this.aliveTwinMembers();
    this.shared.resonance = alive.length >= 2 && alive.every((e) => e.hp / e.maxHp < RESONANCE_HP);
    this.shared.comboTimer -= dt;
    if (this.shared.resonance && this.shared.comboTimer <= 0 && this.role === "azure") {
      this.shared.comboTimer = this.enraged ? 5.2 : 6.8;
      this.startCombo();
    }
    const other = this.otherEye();
    this.enraged = !other || other.dead;
  }

  updateCrimson(dt, dx, dy, d) {
    if (this.mode === "intro") {
      this.drift(dx, dy, d, 0.18, 0.65, dt);
      if (this.modeTimer <= 0) this.chooseCrimsonMode(d);
      return;
    }
    if (this.mode === "orbit") {
      this.drift(dx, dy, d, d < 260 ? -0.55 : 0.48, 0.85, dt);
      if (this.modeTimer <= 0) this.chooseCrimsonMode(d);
      return;
    }
    if (this.mode === "dash_windup") {
      this.drift(dx, dy, d, -0.18, 0.24, dt);
      if (Math.random() < dt * 12) particle("ember", this.x, this.y, { color: this.color, life: 0.26, size: 3, alpha: 0.82 });
      if (this.modeTimer <= 0) this.startDash();
      return;
    }
    if (this.mode === "dash") {
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.04;
        trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, this.color, 14);
        if (this.enraged || this.shared.resonance) this.addEmberWake();
      }
      if (this.modeTimer <= 0) {
        if (this.attackCount < (this.enraged ? 3 : this.shared.resonance ? 2 : 1)) {
          this.attackCount++;
          this.mode = "dash_windup";
          this.modeTimer = 0.34;
          this.angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
        } else {
          this.bladeBurst();
          this.recover(0.5);
        }
      }
      return;
    }
    if (this.mode === "blade_burst") {
      if (this.attackTimer <= 0) {
        this.attackTimer = 0.13;
        this.attackCount++;
        const base = this.angle + Math.sin(this.attackCount) * 0.12;
        const count = this.enraged ? 7 : 5;
        for (let i = 0; i < count; i++) this.shoot(base + (i - (count - 1) / 2) * 0.17, 255, 5.4, "stormBlade", this.damage * 0.32, this.color);
        if (this.attackCount >= (this.enraged ? 4 : 3)) this.recover(0.62);
      }
      return;
    }
    if (this.mode === "recover" && this.modeTimer <= 0) this.chooseCrimsonMode(d);
  }

  chooseCrimsonMode(d) {
    if (d < 620 || Math.random() < 0.68) {
      this.mode = "dash_windup";
      this.modeTimer = this.enraged ? 0.34 : 0.52;
      this.attackCount = 0;
      this.angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
      pulse(this.x, this.y, this.r + 24, this.color, 0.22);
    } else {
      this.mode = "blade_burst";
      this.modeTimer = 1.2;
      this.attackTimer = 0.05;
      this.attackCount = 0;
    }
  }

  startDash() {
    this.mode = "dash";
    this.modeTimer = this.enraged ? 0.44 : 0.36;
    const speed = this.enraged ? 850 : this.shared.resonance ? 790 : 710;
    this.dashVx = Math.cos(this.angle) * speed;
    this.dashVy = Math.sin(this.angle) * speed;
    burst(this.x, this.y, 12, this.color, 200);
    playSfx("wave");
  }

  bladeBurst() {
    this.mode = "blade_burst";
    this.attackTimer = 0.03;
    this.attackCount = 0;
    pulse(this.x, this.y, 70, this.color, 0.18);
  }

  updateAzure(dt, dx, dy, d) {
    if (this.mode === "intro") {
      this.drift(dx, dy, d, d < 520 ? -0.36 : 0.18, 0.48, dt);
      if (this.modeTimer <= 0) this.chooseAzureMode(d);
      return;
    }
    if (this.mode === "keep_distance") {
      this.drift(dx, dy, d, d < 520 ? -0.7 : d > 760 ? 0.34 : 0.02, 0.62, dt);
      if (this.modeTimer <= 0) this.chooseAzureMode(d);
      return;
    }
    if (this.mode === "laser_aim") {
      this.drift(dx, dy, d, -0.12, 0.16, dt);
      const lagX = state.player.x - state.player.dirX * 92;
      const lagY = state.player.y - state.player.dirY * 92;
      this.angle += angleDiff(Math.atan2(lagY - this.y, lagX - this.x), this.angle) * Math.min(1, dt * 2.1);
      if (this.modeTimer <= 0) {
        this.mode = "laser_fire";
        this.modeTimer = this.enraged ? 0.72 : 0.52;
        pulse(this.x, this.y, 52, this.color, 0.24);
      }
      return;
    }
    if (this.mode === "laser_fire") {
      this.angle += angleDiff(Math.atan2(dy, dx), this.angle) * Math.min(1, dt * (this.enraged ? 0.75 : 0.45));
      this.damageLaser(dt, this.enraged ? 13 : 10);
      if (this.modeTimer <= 0) this.recover(0.48);
      return;
    }
    if (this.mode === "prism_burst") {
      this.drift(dx, dy, d, d < 500 ? -0.45 : 0.06, 0.28, dt);
      if (this.attackTimer <= 0) {
        this.attackTimer = this.enraged ? 0.24 : 0.33;
        this.attackCount++;
        const count = this.enraged ? 9 : 7;
        const offset = this.orbit + this.attackCount * 0.25;
        for (let i = 0; i < count; i++) this.shoot(offset + i / count * TAU, 180 + i % 2 * 35, 5, "stormOrb", this.damage * 0.3, this.color);
        if (this.attackCount >= (this.enraged ? 5 : 4)) this.recover(0.6);
      }
      return;
    }
    if (this.mode === "arc_field") {
      this.drift(dx, dy, d, -0.1, 0.2, dt);
      if (this.attackTimer <= 0) {
        this.attackTimer = 0.42;
        this.attackCount++;
        this.dropArcMine();
        if (this.attackCount >= (this.enraged ? 5 : 3)) this.recover(0.66);
      }
      return;
    }
    if (this.mode === "recover" && this.modeTimer <= 0) this.chooseAzureMode(d);
  }

  chooseAzureMode() {
    const roll = Math.random();
    this.attackCount = 0;
    if (this.shared.resonance && roll < 0.35) {
      this.mode = "prism_burst";
      this.attackTimer = 0.05;
      return;
    }
    if (roll < 0.42) {
      this.mode = "laser_aim";
      this.modeTimer = this.enraged ? 0.58 : 0.78;
    } else if (roll < 0.72) {
      this.mode = "arc_field";
      this.attackTimer = 0.08;
    } else {
      this.mode = "prism_burst";
      this.attackTimer = 0.06;
    }
  }

  dropArcMine() {
    const p = state.player;
    const lead = 110 + this.attackCount * 28;
    const side = this.attackCount % 2 ? 72 : -72;
    const x = clamp(p.x + p.dirX * lead - p.dirY * side, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
    const y = clamp(p.y + p.dirY * lead + p.dirX * side, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
    world.hazards.push({ kind: "twin_arc_field", x, y, r: this.enraged ? 74 : 62, color: this.color, damage: this.damage * 0.42, life: 1.8, maxLife: 1.8 });
    pulse(x, y, 64, this.color, 0.34);
  }

  startCombo() {
    const other = this.otherEye();
    if (!other || other.dead) return;
    const mode = Math.random() < 0.5 ? "cross" : "rail";
    if (mode === "cross") {
      this.mode = "laser_aim";
      this.modeTimer = 0.62;
      other.mode = "dash_windup";
      other.modeTimer = 0.5;
      other.attackCount = 0;
      other.angle = Math.atan2(state.player.y - other.y, state.player.x - other.x) + Math.PI * 0.12;
    } else {
      this.shared.railTimer = 1.1;
      pulse((this.x + other.x) / 2, (this.y + other.y) / 2, 120, "#ffffff", 0.28);
    }
  }

  keepTethered(dt) {
    const other = this.otherEye();
    if (!other || other.dead) return;
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (d > TETHER_RANGE) {
      const pull = (d - TETHER_RANGE) * 0.42;
      this.x += dx / d * pull * dt;
      this.y += dy / d * pull * dt;
    }
    if (this.shared.railTimer > 0) {
      this.shared.railTimer -= dt;
      if (this.shared.railTimer <= 0 && this.role === "azure") this.fireRailCombo(other);
    }
  }

  fireRailCombo(other) {
    const a = Math.atan2(other.y - this.y, other.x - this.x);
    for (let side of [-1, 1]) {
      const sx = side < 0 ? this.x : other.x;
      const sy = side < 0 ? this.y : other.y;
      const angle = side < 0 ? a : a + Math.PI;
      for (let i = 0; i < 9; i++) {
        this.shoot(angle + (i - 4) * 0.035, 260 + i * 8, 5.6, "pylonBolt", this.damage * 0.26, i % 2 ? "#42e8ff" : "#ff4d6d", sx, sy);
      }
    }
    state.shake = Math.max(state.shake, 8);
    playSfx("wave");
  }

  addEmberWake() {
    world.hazards.push({ kind: "magma_crack", x: this.x, y: this.y, r: 34, color: this.color, damage: this.damage * 0.28, life: 0.7, maxLife: 0.7, angle: this.angle });
  }

  damageLaser(dt, width) {
    const p = state.player;
    const vx = Math.cos(this.angle);
    const vy = Math.sin(this.angle);
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const forward = dx * vx + dy * vy;
    if (forward < 0 || forward > 980) return;
    const dist = Math.abs(dx * -vy + dy * vx);
    if (dist < p.r + width) {
      applyPlayerDamage(this.damage * (this.enraged ? 1.55 : 1.15) * dt, this);
      state.flash = Math.max(state.flash, 0.1);
      state.shake = Math.max(state.shake, 3);
      if (Math.random() < dt * 16) burst(p.x, p.y, 2, this.color, 80);
    }
  }

  drift(dx, dy, d, forward, strafePower, dt) {
    const strafe = Math.sin(this.orbit) * strafePower;
    this.x += (dx / d * forward + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * forward + dx / d * strafe) * this.speed * dt;
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  shoot(angle, speed, radius, shape, damage, color = this.color, x = this.x, y = this.y) {
    world.enemyProjectiles.push({
      x: x + Math.cos(angle) * (this.r * 0.72),
      y: y + Math.sin(angle) * (this.r * 0.72),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color,
      damage,
      life: 4.6,
      shape,
      spin: Math.random() * TAU,
    });
  }

  takeDamage(amount, x, y) {
    if (this.dead) return;
    this.hp -= amount * state.player.damageScale;
    this.flash = 1;
    burst(x, y, 4, this.color, 120);
    if (this.hp <= 0) this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    state.kills++;
    burst(this.x, this.y, 34, this.color, 240);
    playSfx("explode");
    const idx = world.enemies.indexOf(this);
    if (idx >= 0) world.enemies.splice(idx, 1);
    const other = this.otherEye();
    if (other && !other.dead) {
      other.enraged = true;
      other.maxHp *= 1.08;
      other.hp = Math.min(other.maxHp, other.hp + other.maxHp * 0.18);
      other.mode = "recover";
      other.modeTimer = 0.65;
      world.boss = other;
      pulse(other.x, other.y, 130, other.color, 0.36);
      return;
    }
    world.boss = null;
    if (!this.shared.rewardDropped) {
      this.shared.rewardDropped = true;
      import("../systems/entities.js").then(({ dropGem }) => dropGem(this.x, this.y, this.shared.rewardXp || this.xp));
    }
  }

  otherEye() {
    for (const e of this.shared.members) if (e !== this && !e.dead) return e;
    return null;
  }

  aliveTwinMembers() {
    return [...this.shared.members].filter((e) => !e.dead);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.2) * 4));
    const other = this.otherEye();
    if (other && !other.dead && this.role === "azure") {
      ctx.save();
      ctx.translate(-this.x, -this.y);
      drawLink(ctx, this, other, this.shared.resonance);
      ctx.restore();
    }
    if (this.role === "crimson") drawCrimsonEye(ctx, this);
    else drawAzureEye(ctx, this);
    if (this.role === "azure" && (this.mode === "laser_aim" || this.mode === "laser_fire")) drawLaserTelegraph(ctx, this);
    if (this.role === "crimson" && this.mode === "dash_windup") drawDashTelegraph(ctx, this);
    ctx.restore();
  }
}

function createSharedState() {
  return { members: new Set(), resonance: false, comboTimer: 5.5, railTimer: 0 };
}

function crimsonConfig(config) {
  return { ...config, id: "twin_abyssal_eyes", hp: config.hp * 0.58, speed: config.speed * 1.16, damage: config.damage * 1.05, xp: Math.ceil(config.xp * 0.5), color: "#ff4d6d" };
}

function azureConfig(config) {
  return { ...config, id: "twin_abyssal_eyes", hp: config.hp * 0.54, speed: config.speed * 0.88, damage: config.damage * 0.95, xp: Math.ceil(config.xp * 0.5), color: "#42e8ff" };
}

function drawCrimsonEye(ctx, e) {
  drawEyeShadow(ctx, e);
  const flash = e.flash > 0;
  const hot = e.enraged ? 1.2 : e.shared.resonance ? 1.1 : 1;
  ctx.rotate(Math.sin(e.anim * 0.8) * 0.08);
  for (let i = 0; i < 8; i++) {
    const a = e.orbit + i * TAU / 8;
    const r = e.r * (1.08 + (i % 2) * 0.18);
    ctx.fillStyle = flash ? "#ffffff" : i % 2 ? "#7f1d1d" : "#ff4d6d";
    polygon(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.78, e.r * 0.18 * hot, 3, a, true);
  }
  ctx.fillStyle = flash ? "#ffffff" : "#26080c";
  ctx.beginPath();
  ctx.ellipse(0, 0, e.r * 1.18, e.r * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#ff4d6d";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = flash ? "#ffffff" : "#ff7a1a";
  ctx.beginPath();
  ctx.ellipse(0, 0, e.r * 0.62 * hot, e.r * 0.44, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#120308";
  ctx.beginPath();
  ctx.ellipse(Math.cos(e.angle) * 4, Math.sin(e.angle) * 3, e.r * 0.13, e.r * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,242,168,0.58)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.6, -e.r * 0.18);
  ctx.lineTo(e.r * 0.58, e.r * 0.12);
  ctx.stroke();
}

function drawAzureEye(ctx, e) {
  drawEyeShadow(ctx, e);
  const flash = e.flash > 0;
  const open = e.mode === "laser_fire" || e.mode === "laser_aim" ? 1.18 : 1;
  for (let i = 0; i < 6; i++) {
    const a = e.orbit * -0.8 + i * TAU / 6;
    ctx.save();
    ctx.translate(Math.cos(a) * e.r * 1.18, Math.sin(a) * e.r * 0.92);
    ctx.rotate(a + Math.PI / 4);
    ctx.fillStyle = flash ? "#ffffff" : i % 2 ? "#d9fbff" : "#42e8ff";
    ctx.fillRect(-e.r * 0.16, -e.r * 0.16, e.r * 0.32, e.r * 0.32);
    ctx.restore();
  }
  ctx.fillStyle = flash ? "#ffffff" : "#071827";
  ctx.beginPath();
  ctx.ellipse(0, 0, e.r * 1.08 * open, e.r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#42e8ff";
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(217,251,255,0.72)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, e.r * (0.45 + i * 0.16) * open, e.orbit + i, e.orbit + i + Math.PI * 0.78);
    ctx.stroke();
  }
  ctx.fillStyle = e.mode === "laser_fire" ? "#ffffff" : "#42e8ff";
  ctx.fillRect(-e.r * 0.5, -e.r * 0.08, e.r, e.r * 0.16);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.cos(e.angle) * 5 - e.r * 0.13, -e.r * 0.04, e.r * 0.26, e.r * 0.08);
}

function drawEyeShadow(ctx, e) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 1.02, e.r * 1.1, e.r * 0.22, 0, 0, TAU);
  ctx.fill();
}

function drawLaserTelegraph(ctx, e) {
  ctx.save();
  ctx.rotate(e.angle);
  const firing = e.mode === "laser_fire";
  ctx.strokeStyle = firing ? "rgba(255,255,255,0.86)" : "rgba(66,232,255,0.38)";
  ctx.lineWidth = firing ? 8 : 2.5;
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(980, 0);
  ctx.stroke();
  if (firing) {
    ctx.strokeStyle = "rgba(66,232,255,0.86)";
    ctx.lineWidth = 15;
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(e.r, 0);
    ctx.lineTo(980, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDashTelegraph(ctx, e) {
  ctx.save();
  ctx.rotate(e.angle);
  ctx.strokeStyle = "rgba(255,77,109,0.42)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.moveTo(e.r, 0);
  ctx.lineTo(520, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawLink(ctx, a, b, resonance) {
  ctx.strokeStyle = resonance ? "rgba(255,255,255,0.48)" : "rgba(100,180,255,0.22)";
  ctx.lineWidth = resonance ? 4 : 2;
  ctx.setLineDash(resonance ? [10, 7] : [6, 10]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
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

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return diff;
}
