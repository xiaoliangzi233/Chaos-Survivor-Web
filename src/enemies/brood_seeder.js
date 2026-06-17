import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy, spawnConfigured } from "./BaseEnemy.js";




export class BroodSeeder extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "summoner";
    this.cooldown = this.cdInitial;
    this.spawnWindup = 0;
    this.seedPulse = Math.random() * TAU;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.34);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.1;
    this.seedPulse += dt * 5.4;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.spawnWindup > 0) {
      this.spawnWindup -= dt;
      if (Math.random() < dt * 12) particle("mote", this.x, this.y, { color: this.color, life: 0.35, size: 3, alpha: 0.7 });
      if (this.spawnWindup <= 0) this.spawnBrood();
    } else {
      const dir = d < this.keepRange ? -0.85 : 0.35;
      const strafe = Math.sin(this.anim * 0.75) * 0.45;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && this.canSummon()) {
        this.spawnWindup = this.spawnWindupTime;
        this.cooldown = this.cd + Math.random() * this.cdRandom;
        pulse(this.x, this.y, 42, this.color, 0.24);
      }
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  canSummon() {
    const nearbyBrood = world.enemies.filter((e) => e.type === "slime_small" || e.type === "zombie").length;
    return world.enemies.length < 145 && nearbyBrood < 60;
  }

  spawnBrood() {
    const count = Math.min(SUMMON_LIMIT, 2 + Math.floor(state.wave / 8));
    const choice = state.wave > 13 && Math.random() < 0.38 ? "slime_small" : "zombie";
    const offset = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      const a = offset + i * TAU / count;
      spawnConfigured(choice, this.x + Math.cos(a) * 40, this.y + Math.sin(a) * 40);
    }
    burst(this.x, this.y, 12, this.color, 120);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 17;
    const pulseK = 1 + Math.sin(this.seedPulse) * 0.09 + (this.spawnWindup > 0 ? Math.sin(state.time * 22) * 0.08 : 0);
    const body = flash ? "#ffffff" : "#243514";
    const sac = flash ? "#ffffff" : this.color;
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.anim * 1.6) * 2);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(0, 18 * z, 20 * z, 5 * z, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#39521e";
    ctx.lineWidth = 3 * z;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5 * z, 6 * z);
      ctx.quadraticCurveTo(i * 11 * z, 16 * z, i * 18 * z, 20 * z + Math.sin(this.anim + i) * 2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18 * z, 21 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = sac;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = flash ? 1 : 0.72;
    ctx.fillStyle = sac;
    ctx.beginPath();
    ctx.ellipse(1 * z, 0, 12 * z * pulseK, 15 * z * pulseK, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#17210d";
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + this.anim * 0.45;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 7 * z, Math.sin(a) * 8 * z, 2.2 * z, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "#eaff9a";
    ctx.lineWidth = 1.2 * z;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * z + Math.sin(this.anim * 3) * 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
