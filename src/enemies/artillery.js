import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class Artillery extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "artillery";
    this.cooldown = this.cdInitial;
    this.charge = 0;
    this.target = { x, y };
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.62);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 3.6;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.charge > 0) {
      this.charge -= dt;
      if (Math.random() < dt * 12) particle("ember", this.x, this.y - this.r, { color: this.color, life: 0.32, size: 3.5, alpha: 0.88 });
      if (this.charge <= 0) this.launchShell();
    } else {
      const dir = d < this.keepRange ? -0.82 : d > this.fireRange ? 0.18 : -0.1;
      const strafe = Math.sin(this.anim * 0.6) * 0.12;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.fireRange) {
        this.target = predictPlayerTarget();
        this.charge = this.elite ? this.chargeTimeElite : this.chargeTime;
        this.cooldown = this.elite ? this.cdElite : this.cd + Math.random() * this.cdRandom;
        pulse(this.target.x, this.target.y, 78, this.color, 0.52);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  launchShell() {
    const count = this.elite ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : (i - 0.5) * 58;
      const angle = Math.random() * TAU;
      const x = clamp(this.target.x + Math.cos(angle) * Math.abs(spread), -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
      const y = clamp(this.target.y + Math.sin(angle) * Math.abs(spread), -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80);
      world.hazards.push({
        kind: "artillery_blast",
        x,
        y,
        r: 66,
        color: this.color,
        damage: this.damage * 1.72,
        impactDamage: this.damage * 1.35,
        impactRadius: 34,
        life: 1.65,
        maxLife: 1.65,
        armTime: 1.08,
        armDuration: 1.08,
        shellY: -620,
        pulse: Math.random() * TAU,
      });
    }
    burst(this.x, this.y - this.r, 8, this.color, 150);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 18;
    const body = flash ? "#ffffff" : "#241612";
    const edge = flash ? "#ffffff" : this.color;
    const hot = this.charge > 0 ? 1 + Math.sin(state.time * 18) * 0.18 : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 20 * z, 22 * z, 6 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(249,115,22,${this.charge > 0 ? 0.46 : 0.22})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25 * z, 20 * z, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-17 * z, -11 * z, 34 * z, 28 * z, 5 * z);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.16)";
    ctx.fillRect(-11 * z, -8 * z, 22 * z, 4 * z);
    ctx.fillRect(-9 * z, 4 * z, 18 * z, 4 * z);

    ctx.fillStyle = "#3b1c12";
    ctx.fillRect(-12 * z, -4 * z, 24 * z, 5 * z);
    ctx.fillStyle = edge;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(i * 8 * z - 2 * z, 6 * z, 4 * z, 9 * z);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-14 * z, -13 * z, 28 * z, 31 * z, 5 * z);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -16 * z);
    ctx.rotate(-Math.PI / 2 + Math.sin(this.anim * 0.7) * 0.08);
    ctx.fillStyle = "#111827";
    ctx.fillRect(-6 * z, -8 * z, 12 * z, 27 * z);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-7 * z, -9 * z, 14 * z, 29 * z);
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(0, -9 * z, 7 * z * hot, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.arc(0, -10 * z, 3 * z * hot, 0, TAU);
    ctx.fill();
    if (this.charge > 0) {
      ctx.strokeStyle = "rgba(255,242,168,0.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -9 * z, 11 * z * hot, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(249,115,22,0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-13 * z + i * 8 * z, -10 * z);
      ctx.lineTo(-8 * z + i * 8 * z, 15 * z);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function predictPlayerTarget() {
  const p = state.player;
  const lead = 150 + Math.random() * 80;
  const jitter = 35;
  return {
    x: clamp(p.x + p.dirX * lead + (Math.random() - 0.5) * jitter, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80),
    y: clamp(p.y + p.dirY * lead + (Math.random() - 0.5) * jitter, -WORLD_SIZE / 2 + 80, WORLD_SIZE / 2 - 80),
  };
}
