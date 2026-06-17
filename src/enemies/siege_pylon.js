import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";





export class SiegePylon extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "pylon";
    this.cooldown = this.cdInitial;
    this.charge = 0;
    this.volleyLeft = 0;
    this.volleyDelay = 0;
    this.angle = 0;
    this.legPhase = Math.random() * TAU;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.58);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 3.2;
    this.legPhase += dt * 5;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown -= dt;
    this.volleyDelay -= dt;
    this.flip = dx < 0 ? -1 : 1;
    this.angle = Math.atan2(dy, dx);
    this.applyDamageField();

    if (this.volleyLeft > 0 && this.volleyDelay <= 0) {
      this.fireVolley(this.angle);
      this.volleyLeft--;
      this.volleyDelay = 0.09;
    } else if (this.charge > 0) {
      this.charge -= dt;
      if (this.charge <= 0) {
        this.volleyLeft = this.elite ? this.volleyCountElite : this.volleyCount;
        this.volleyDelay = 0.01;
      }
    } else {
      const dir = d < this.keepRange ? -0.52 : d > this.fireRange ? 0.24 : 0.02;
      const strafe = Math.sin(this.anim * 0.7) * 0.08;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * this.speedMul * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * this.speedMul * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.charge = this.elite ? this.chargeTimeElite : this.chargeTime;
        this.cooldown = this.elite ? this.cdElite : this.cd + Math.random() * this.cdRandom;
        pulse(this.x, this.y, this.r * 2.1, this.color, 0.18);
      }
    }

    if (this.charge > 0 && Math.random() < dt * 10) {
      particle("scan", this.x, this.y - this.r * 1.2, { color: this.color, life: 0.28, size: 2.2, alpha: 0.75 });
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  fireVolley(angle) {
    const count = this.elite ? this.volleyShotsPerBurstElite : this.volleyShotsPerBurst;
    const spread = this.elite ? this.volleySpreadElite : this.volleySpread;
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * spread;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 8),
        y: this.y + Math.sin(a) * (this.r + 8),
        vx: Math.cos(a) * (this.elite ? this.bulletSpeedElite : this.bulletSpeed),
        vy: Math.sin(a) * (this.elite ? this.bulletSpeedElite : this.bulletSpeed),
        r: this.elite ? 5.5 : 5,
        color: this.color,
        damage: this.damage * this.bulletDamageMul,
        life: this.bulletLife,
        shape: "pylonBolt",
      });
    }
    burst(this.x + Math.cos(angle) * this.r, this.y + Math.sin(angle) * this.r, 5, this.color, 130);
  }

  applyDamageField() {
    const range2 = this.shieldRange * this.shieldRange;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss) continue;
      if (distSq(this.x, this.y, e.x, e.y) <= range2) e.shielded = true;
    }
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 20;
    const chargeK = this.charge > 0 ? 1 + Math.sin(state.time * 24) * 0.12 : 1;
    const core = flash ? "#ffffff" : this.color;
    const shell = flash ? "#ffffff" : "#173244";
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 1.2) * 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, this.r * 1.08, this.r * 0.95, this.r * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(66,232,255,${this.charge > 0 ? 0.42 : 0.2})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r * 1.15, this.r * 0.88, 0, 0, TAU);
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3 + Math.sin(this.legPhase + i) * 0.08;
      ctx.strokeStyle = "#1b2738";
      ctx.lineWidth = 5 * z;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 9 * z, Math.sin(a) * 7 * z + 8 * z);
      ctx.lineTo(Math.cos(a) * 25 * z, Math.sin(a) * 16 * z + 18 * z);
      ctx.stroke();
      ctx.fillStyle = core;
      ctx.fillRect(Math.cos(a) * 25 * z - 3 * z, Math.sin(a) * 16 * z + 17 * z, 6 * z, 3 * z);
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 1 * z;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 17 * z, Math.sin(a) * 12 * z + 13 * z, 4 * z, 0, TAU);
      ctx.stroke();
    }

    ctx.rotate(Math.sin(this.anim * 0.9) * 0.04);
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.moveTo(0, -30 * z);
    ctx.lineTo(17 * z, -8 * z);
    ctx.lineTo(12 * z, 22 * z);
    ctx.lineTo(-12 * z, 22 * z);
    ctx.lineTo(-17 * z, -8 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = core;
    ctx.lineWidth = 2.2 * z;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.1 * z;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 7 * z, -22 * z);
      ctx.lineTo(i * 5 * z, 18 * z);
      ctx.stroke();
    }

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, -11 * z, 8 * z * chargeK, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.charge > 0 ? "#ffffff" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, -11 * z, 12 * z * chargeK, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(2 * z, -13 * z, 3 * z * chargeK, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.rotate(this.angle);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(18 * z, 0);
    ctx.lineTo(31 * z, -5 * z);
    ctx.lineTo(31 * z, 5 * z);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = `rgba(66,232,255,${0.16 + Math.sin(state.time * 4) * 0.04})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, this.shieldRange, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
