import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { applyPlayerDamage } from "../systems/items.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";

const MODES = ["territory", "rail_charge", "geometry_salvo", "magnet_pulse", "brood_launch", "mine_bloom"];

export class MagrailBroodMatriarch extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "磁轨巢母";
    this.mode = "intro";
    this.modeTimer = 1.25;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.spin = Math.random() * TAU;
    this.aim = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.trailTimer = 0;
    this.phase2 = false;
    this.overheat = false;
    this.knockbackResistance = 0.97;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const wasPhase2 = this.phase2;
    const wasOverheat = this.overheat;
    this.phase2 = this.hp < this.maxHp * 0.6;
    this.overheat = this.hp < this.maxHp * 0.3;
    this.anim += dt * (this.overheat ? 5.8 : this.phase2 ? 4.6 : 3.7);
    this.spin += dt * (this.overheat ? 4.5 : 3.2);
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.aim = Math.atan2(dy, dx);
    this.flip = dx < 0 ? -1 : 1;
    if (!wasPhase2 && this.phase2) this.phaseShift("#ff7a1a");
    if (!wasOverheat && this.overheat) this.phaseShift("#ff4d6d");

    this.updateMode(dt, dx, dy, d);
    this.x = clamp(this.x, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);
    this.y = clamp(this.y, -WORLD_SIZE / 2 + this.r, WORLD_SIZE / 2 - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.72;
      state.shake = 14;
      state.flash = 0.3;
      burst(p.x, p.y, 20, this.overheat ? "#ff4d6d" : this.color, 180);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    if (this.mode === "intro" || this.mode === "recover" || this.mode === "core_exposed") {
      this.drift(dx, dy, d, this.mode === "core_exposed" ? 0.04 : d > 560 ? 0.12 : -0.06, dt);
      if (this.mode === "core_exposed" && this.attackTimer <= 0) {
        this.attackTimer = 0.22;
        pulse(this.x, this.y, this.r + 48, "#ffd166", 0.14);
      }
      if (this.modeTimer <= 0) this.chooseMode(d);
      return;
    }
    if (this.mode === "territory") return this.updateTerritory(dt, dx, dy, d);
    if (this.mode === "rail_charge") return this.updateRailCharge(dt);
    if (this.mode === "geometry_salvo") return this.updateGeometrySalvo(dt, dx, dy, d);
    if (this.mode === "magnet_pulse") return this.updateMagnetPulse(dt, dx, dy, d);
    if (this.mode === "brood_launch") return this.updateBroodLaunch(dt, dx, dy, d);
    if (this.mode === "mine_bloom") return this.updateMineBloom(dt, dx, dy, d);
  }

  chooseMode(distance) {
    if (distance > 660 && this.mode !== "rail_charge") this.mode = "rail_charge";
    else this.mode = MODES[this.modeIndex % MODES.length];
    this.modeIndex++;
    this.attackCount = 0;
    this.attackTimer = 0.08;
    this.modeTimer = this.mode === "rail_charge" ? 0.84 : this.mode === "core_exposed" ? (this.overheat ? 1.45 : 1.1) : 4.2;
    pulse(this.x, this.y, this.r + 60, this.mode === "rail_charge" ? "#42e8ff" : this.color, 0.24);
  }

  updateTerritory(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.14 : 0.04, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.overheat ? 0.52 : 0.7;
      this.attackCount++;
      if (this.attackCount % 2) this.launchPodNearPlayer();
      else this.placeMineNearPlayer();
      if (this.attackCount >= (this.overheat ? 7 : 5)) this.recover(0.75, true);
    }
  }

  updateRailCharge(dt) {
    if (this.attackCount === 0) {
      this.attackCount = 1;
      this.dashVx = Math.cos(this.aim) * (this.overheat ? 840 : this.phase2 ? 740 : 640);
      this.dashVy = Math.sin(this.aim) * (this.overheat ? 840 : this.phase2 ? 740 : 640);
      this.modeTimer = this.overheat ? 0.46 : 0.4;
      const warnX = this.x + Math.cos(this.aim) * 190;
      const warnY = this.y + Math.sin(this.aim) * 190;
      pulse(warnX, warnY, 92, "#42e8ff", 0.22);
      playSfx("wave");
    }
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.055;
      trail(this.x, this.y, this.x - this.dashVx * 0.04, this.y - this.dashVy * 0.04, "#42e8ff", 22);
      if (this.phase2) this.placeMagneticNode(this.x, this.y, 1.2);
    }
    if (this.modeTimer <= 0) this.recover(0.9, true);
  }

  updateGeometrySalvo(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 540 ? -0.18 : 0.04, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.overheat ? 0.18 : 0.25;
      this.attackCount++;
      const count = this.overheat ? 8 : this.phase2 ? 7 : 6;
      const spread = this.overheat ? 0.82 : 0.66;
      for (let i = 0; i < count; i++) {
        const t = i - (count - 1) / 2;
        this.shootGeometry(this.aim + t * spread / count, 250 + i * 5, this.damage * 0.28);
      }
      if (this.attackCount >= (this.overheat ? 10 : 8)) this.recover(0.75, true);
    }
  }

  updateMagnetPulse(dt, dx, dy, d) {
    this.drift(dx, dy, d, -0.08, dt);
    if (this.attackCount === 0) {
      this.attackCount = 1;
      this.placeMagneticNode(this.x, this.y, 2.5, 210);
      for (let i = 0; i < 14; i++) this.shootGeometry(this.spin + i / 14 * TAU, 155, this.damage * 0.18);
      playSfx("level");
    }
    if (this.modeTimer <= 2.4 && this.attackCount === 1) {
      this.attackCount = 2;
      for (let i = 0; i < (this.overheat ? 22 : 16); i++) this.shootGeometry(this.spin + i / (this.overheat ? 22 : 16) * TAU, 210, this.damage * 0.22);
      pulse(this.x, this.y, this.r + 130, "#42e8ff", 0.34);
    }
    if (this.modeTimer <= 1.4) this.recover(0.9, true);
  }

  updateBroodLaunch(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.12 : 0.04, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.overheat ? 0.42 : 0.58;
      this.attackCount++;
      this.launchPodNearPlayer();
      if (this.attackCount === 2 || (this.phase2 && this.attackCount === 4)) this.summonGuard();
      if (this.attackCount >= (this.overheat ? 7 : 5)) this.recover(0.85, true);
    }
  }

  updateMineBloom(dt, dx, dy, d) {
    this.drift(dx, dy, d, d < 520 ? -0.1 : 0.04, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.overheat ? 0.34 : 0.46;
      this.attackCount++;
      const p = state.player;
      const petals = this.overheat ? 7 : 5;
      const a = this.spin + this.attackCount * 0.42;
      const index = this.attackCount % petals;
      this.placeMine(p.x + Math.cos(a + index / petals * TAU) * 190, p.y + Math.sin(a + index / petals * TAU) * 190);
      if (this.attackCount >= (this.overheat ? 12 : 9)) this.recover(0.8, true);
    }
  }

  drift(dx, dy, d, power, dt) {
    const strafe = Math.sin(this.spin * 0.5) * 0.28;
    this.x += (dx / d * power + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * power + dx / d * strafe) * this.speed * dt;
  }

  shootGeometry(angle, speed, damage) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * this.r * 0.76,
      y: this.y + Math.sin(angle) * this.r * 0.76,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: this.overheat ? 6 : 5.4,
      color: this.overheat ? "#ff4d6d" : "#f3f7ff",
      damage,
      life: 4.4,
      shape: "gunnerShot",
      spin: Math.random() * TAU,
      bossProjectile: true,
    });
  }

  launchPodNearPlayer() {
    const p = state.player;
    const side = this.attackCount % 2 ? 1 : -1;
    const x = p.x + Math.cos(this.aim + side * Math.PI / 2) * (110 + Math.random() * 70);
    const y = p.y + Math.sin(this.aim + side * Math.PI / 2) * (110 + Math.random() * 70);
    this.placePod(x, y);
  }

  placePod(x, y) {
    const half = WORLD_SIZE / 2 - 100;
    world.hazards.push({
      kind: "brood_pod",
      x: clamp(x, -half, half),
      y: clamp(y, -half, half),
      r: this.phase2 ? 58 : 52,
      color: "#a3e635",
      damage: 0,
      life: 5.6,
      maxLife: 5.6,
      armTime: this.overheat ? 1.8 : 2.2,
      spin: Math.random() * TAU,
    });
  }

  placeMineNearPlayer() {
    const p = state.player;
    const a = this.spin + this.attackCount * 0.72;
    this.placeMine(p.x + Math.cos(a) * 220, p.y + Math.sin(a) * 220);
  }

  placeMine(x, y) {
    const half = WORLD_SIZE / 2 - 100;
    world.hazards.push({
      kind: "ember_mine",
      x: clamp(x, -half, half),
      y: clamp(y, -half, half),
      r: 13,
      baseRadius: 13,
      triggerRadius: 44,
      explodeRadius: this.overheat ? 90 : 78,
      color: "#ff7a1a",
      damage: this.damage * 0.68,
      life: 8,
      maxLife: 8,
      armTime: 0.72,
      triggered: false,
    });
  }

  placeMagneticNode(x, y, life, radius = 112) {
    const half = WORLD_SIZE / 2 - 90;
    world.hazards.push({
      kind: "magnetic_node",
      x: clamp(x, -half, half),
      y: clamp(y, -half, half),
      r: radius,
      color: "#42e8ff",
      damage: 0,
      life,
      maxLife: life,
      spin: Math.random() * TAU,
    });
  }

  summonGuard() {
    const guards = world.enemies.filter((enemy) => ["brood_seeder", "magnet_raider", "embermine"].includes(enemy.type)).length;
    if (guards >= 8 || world.enemies.length > 150) return;
    const ids = ["brood_seeder", "magnet_raider", "embermine"];
    for (let i = 0; i < 3; i++) {
      const a = this.spin + i / 3 * TAU;
      spawnConfigured(ids[i], this.x + Math.cos(a) * 135, this.y + Math.sin(a) * 135);
    }
  }

  phaseShift(color) {
    burst(this.x, this.y, 42, color, 260);
    pulse(this.x, this.y, this.r + 150, color, 0.42);
    for (let i = 0; i < 24; i++) this.shootGeometry(this.spin + i / 24 * TAU, 180, this.damage * 0.16);
    playSfx("wave");
  }

  recover(time, expose = false) {
    this.mode = expose ? "core_exposed" : "recover";
    this.modeTimer = time;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.1) * 3));
    ctx.scale(this.flip || 1, 1);
    drawMagrailMatriarch(ctx, this);
    ctx.restore();
  }
}

function drawMagrailMatriarch(ctx, e) {
  const hurt = e.flash > 0;
  const rail = e.overheat ? "#ff4d6d" : e.phase2 ? "#ff7a1a" : "#42e8ff";
  if (hurt) ctx.translate(Math.sin(e.anim * 10) * 3, 0);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.86, e.r * 1.16, e.r * 0.22, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = hurt ? "#ffffff" : "rgba(66,232,255,0.42)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    ctx.beginPath();
    ctx.moveTo(i * e.r * 0.18, e.r * 0.14);
    ctx.quadraticCurveTo(i * e.r * 0.42, e.r * 0.72, i * e.r * 0.72, e.r * 0.88 + Math.sin(e.anim + i) * 4);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  ctx.fillStyle = hurt ? "#ffffff" : "#101827";
  ctx.beginPath();
  ctx.ellipse(0, 0, e.r * 0.92, e.r * 0.72, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rail;
  ctx.lineWidth = 3;
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + Math.PI / 6;
    ctx.fillStyle = i % 2 ? "#162033" : "#0b1020";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * e.r * 0.28, Math.sin(a) * e.r * 0.22);
    ctx.lineTo(Math.cos(a + 0.34) * e.r * 0.74, Math.sin(a + 0.34) * e.r * 0.56);
    ctx.lineTo(Math.cos(a - 0.34) * e.r * 0.74, Math.sin(a - 0.34) * e.r * 0.56);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalCompositeOperation = "lighter";
  for (let i = -2; i <= 2; i++) {
    const x = i * e.r * 0.24;
    ctx.fillStyle = i % 2 ? "rgba(163,230,53,0.72)" : "rgba(255,122,26,0.62)";
    ctx.beginPath();
    ctx.ellipse(x, -e.r * 0.46 + Math.sin(e.anim * 2 + i) * 2, e.r * 0.13, e.r * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = rail;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * (0.55 + i * 0.16), e.r * (0.24 + i * 0.08), e.spin * (i % 2 ? -0.3 : 0.4), 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = e.mode === "core_exposed" ? "#ffd166" : rail;
  ctx.beginPath();
  ctx.arc(0, 0, e.r * (e.mode === "core_exposed" ? 0.22 : 0.15), 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = hurt ? "#ffffff" : "#071522";
  ctx.beginPath();
  ctx.moveTo(-e.r * 0.38, -e.r * 0.24);
  ctx.lineTo(0, -e.r * 0.64);
  ctx.lineTo(e.r * 0.38, -e.r * 0.24);
  ctx.lineTo(e.r * 0.25, e.r * 0.1);
  ctx.lineTo(-e.r * 0.25, e.r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rail;
  ctx.lineWidth = 2;
  ctx.stroke();
}
