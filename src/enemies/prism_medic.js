import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class PrismMedic extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "棱镜协助者";
    this.trait = "机动增幅";
    this.behavior = "prism_medic";
    this.cooldown = this.cdInitial;
    this.channel = 0;
    this.targets = [];
    this.orbit = Math.random() * TAU;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.28);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.8;
    this.orbit += dt * 3.5;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    this.targets = this.findTargets();
    if (this.targets.length && this.cooldown <= 0 && this.channel <= 0) this.channel = this.channelDuration;

    if (this.channel > 0 && this.targets.length) {
      this.channel -= dt;
      this.applyAssist(dt);
      if (this.channel <= 0) {
        this.cooldown = this.cd + Math.random() * this.cdRandom;
        pulse(this.x, this.y, this.assistRange, this.color, 0.16);
      }
      this.move(dx, dy, d, dt, d < this.keepDistance ? -0.8 : 0.08);
    } else {
      this.channel = 0;
      this.move(dx, dy, d, dt, d < this.keepDistance ? -0.9 : 0.25);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  move(dx, dy, d, dt, dir) {
    const strafe = Math.sin(this.anim * 0.58) * 0.42;
    this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
  }

  findTargets() {
    const targets = [];
    const range2 = this.assistRange * this.assistRange;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss) continue;
      if (distSq(this.x, this.y, e.x, e.y) > range2) continue;
      targets.push(e);
    }
    return targets.sort((a, b) => distSq(this.x, this.y, a.x, a.y) - distSq(this.x, this.y, b.x, b.y)).slice(0, this.maxTargets);
  }

  applyAssist(dt) {
    for (const target of this.targets) {
      target.prismAssistTimer = Math.max(target.prismAssistTimer || 0, this.assistBuffDuration);
      target.prismAssistSpeedMult = target.elite ? this.assistSpeedMulElite : this.assistSpeedMul;
      target.prismAssistAttackSpeedMult = target.elite ? this.assistAttackSpeedMulElite : this.assistAttackSpeedMul;
      target.flash = Math.max(target.flash, 0.08);
      trail(this.x, this.y, target.x, target.y, this.color, 2);
      if (Math.random() < dt * 5) particle("mote", target.x, target.y, { color: this.color, life: 0.32, size: 2.6, alpha: 0.76 });
    }
    if (Math.random() < dt * 10) burst(this.x, this.y, 2, this.color, 60);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const bob = Math.sin(this.anim * 1.55) * 3;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8 - bob, this.r, this.r * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(114,255,180,${this.channel > 0 ? 0.56 : 0.26})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25 * z, 17 * z, this.orbit * 0.1, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = flash ? "#ffffff" : "#dffcff";
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22 * z);
    ctx.lineTo(18 * z, -4 * z);
    ctx.lineTo(10 * z, 18 * z);
    ctx.lineTo(-10 * z, 18 * z);
    ctx.lineTo(-18 * z, -4 * z);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#123045";
    ctx.fillRect(-4 * z, -15 * z, 8 * z, 29 * z);
    ctx.fillRect(-13 * z, -4 * z, 26 * z, 8 * z);
    ctx.fillStyle = flash ? "#ffffff" : "rgba(66,232,255,0.26)";
    ctx.fillRect(-11 * z, -15 * z, 22 * z, 3 * z);
    ctx.fillRect(-9 * z, 12 * z, 18 * z, 3 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(66,232,255,0.72)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -18 * z);
    ctx.lineTo(0, 18 * z);
    ctx.moveTo(-14 * z, 0);
    ctx.lineTo(14 * z, 0);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, (3.4 + Math.sin(this.anim * 4) * 0.6) * z, 0, TAU);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
      const a = this.orbit + i * TAU / 6;
      const x = Math.cos(a) * 25 * z;
      const y = Math.sin(a) * 14 * z;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = flash ? "#ffffff" : this.color;
      ctx.beginPath();
      ctx.moveTo(5 * z, 0);
      ctx.lineTo(0, 4 * z);
      ctx.lineTo(-5 * z, 0);
      ctx.lineTo(0, -4 * z);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.stroke();
      ctx.restore();
    }
    if (this.channel > 0 && this.targets.length) {
      ctx.strokeStyle = "rgba(114,255,180,0.74)";
      ctx.lineWidth = 2;
      for (const target of this.targets.slice(0, 5)) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(target.x - this.x, target.y - this.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
