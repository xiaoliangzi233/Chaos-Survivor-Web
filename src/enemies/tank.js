import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";
import { playSfx } from "../audio.js";

export class Tank extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "tank";
    this.armor = 0.42;
    this.stance = 0;
    this.stanceCooldown = 1.4 + Math.random();
    this.cooldown = 0.8;
    this.attackRange = 560;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.82);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 3.2;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.cooldown -= dt;
    this.stanceCooldown -= dt;
    if (this.stanceCooldown <= 0) {
      this.stance = 1.15;
      this.stanceCooldown = 5.2;
    }
    this.stance = Math.max(0, this.stance - dt);
    const speedMul = this.stance > 0 ? 0.45 : 0.9;
    if (this.stance <= 0 && this.cooldown <= 0 && d < this.attackRange) this.fireBurst(Math.atan2(dy, dx));
    this.x += (dx / d) * this.speed * speedMul * dt;
    this.y += (dy / d) * this.speed * speedMul * dt;
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.55;
      state.shake = 11;
      state.flash = 0.28;
      burst(p.x, p.y, 12, this.color, 120);
    }
  }

  takeDamage(amount, x, y, options = {}) {
    const reduction = this.stance > 0 ? 0.9 : this.armor;
    super.takeDamage(amount * (1 - reduction), x, y, options);
    if (!options.statusEffect && Math.random() < 0.6) burst(x, y, 2, "#ffd166", 160);
  }

  fireBurst(angle) {
    this.cooldown = 2.35;
    const baseSpeed = 250;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i - 1.5) * 0.075;
      world.enemyProjectiles.push({
        x: this.x + Math.cos(a) * (this.r + 8),
        y: this.y + Math.sin(a) * (this.r + 8),
        vx: Math.cos(a) * (baseSpeed + i * 18),
        vy: Math.sin(a) * (baseSpeed + i * 18),
        r: 5.2,
        color: "#ffd166",
        damage: this.damage * 0.42,
        life: 3.2,
        shape: "gunnerShot",
        source: "tank_burst",
        spin: Math.random() * TAU,
      });
    }
    playSfx("shoot");
  }

  draw(ctx) {
    const z = this.r / 24;
    const flash = this.flash > 0;
    const brace = this.stance > 0;
    const bob = Math.abs(Math.sin(this.anim * 1.3)) * 2;
    ctx.save();
    ctx.translate(this.x, this.y - bob);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 25 * z + bob, 27 * z, 8 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = brace ? "rgba(255,209,102,0.7)" : "rgba(66,232,255,0.22)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-29 * z, -22 * z, 58 * z, 47 * z, 9 * z);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#26344a";
    ctx.beginPath();
    ctx.roundRect(-24 * z, -18 * z, 48 * z, 38 * z, 7 * z);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "#ffd166";
    ctx.lineWidth = brace ? 4 : 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#111827";
    ctx.fillRect(-18 * z, -10 * z, 36 * z, 11 * z);
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,255,255,0.12)";
    ctx.fillRect(-19 * z, 3 * z, 38 * z, 5 * z);
    ctx.fillRect(-15 * z, -15 * z, 30 * z, 3 * z);
    ctx.fillStyle = brace ? "#ffffff" : "#ff4d6d";
    ctx.fillRect(7 * z, -7 * z, 8 * z, 5 * z);
    ctx.fillStyle = brace ? "#ffd166" : "#42e8ff";
    ctx.fillRect(-15 * z, -7 * z, 8 * z, 5 * z);
    ctx.fillStyle = "#ffd166";
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 13 * z - 4 * z, 13 * z, 8 * z, 5 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "#0b1020";
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 25 * z, -7 * z);
      ctx.lineTo(side * 35 * z, -12 * z);
      ctx.lineTo(side * 35 * z, 13 * z);
      ctx.lineTo(side * 25 * z, 17 * z);
      ctx.stroke();
    }
    if (brace) {
      ctx.strokeStyle = "rgba(255,209,102,0.72)";
      ctx.beginPath();
      ctx.arc(0, 0, 34 * z, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(0, 0, 42 * z, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
}
