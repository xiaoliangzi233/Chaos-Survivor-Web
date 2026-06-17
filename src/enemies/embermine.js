import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";



export class Embermine extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "embermine";
    this.plantTime = 0;
    this.cooldown = this.cdInitial;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.2;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.cooldown -= dt;
    this.flip = dx < 0 ? -1 : 1;

    if (this.plantTime > 0) {
      this.plantTime -= dt;
      if (this.plantTime <= 0) this.dropMine();
    } else {
      const desired = 210;
      const dir = d < desired ? -0.55 : 0.8;
      const strafe = Math.sin(this.anim * 0.9) * 0.4;
      this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
      this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
      if (this.cooldown <= 0 && d < this.armRange) {
        this.plantTime = this.plantDuration;
        this.cooldown = this.cd + Math.random() * this.cdRandom;
        pulse(this.x, this.y, 32, this.color, 0.22);
      }
    }

    if (Math.random() < dt * 7) particle("ember", this.x, this.y + this.r * 0.5, { color: this.color, life: 0.32, size: 2.5, alpha: 0.75 });
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  dropMine() {
    const mines = world.hazards.filter((h) => h.kind === "ember_mine");
    if (mines.length >= this.maxMines) {
      const oldest = mines.reduce((a, b) => (a.life < b.life ? a : b));
      const idx = world.hazards.indexOf(oldest);
      if (idx >= 0) world.hazards.splice(idx, 1);
    }
    world.hazards.push({
      kind: "ember_mine",
      x: this.x,
      y: this.y,
      r: 13,
      baseRadius: 13,
      triggerRadius: 38,
      explodeRadius: 76,
      color: this.color,
      damage: this.damage * 1.35,
      life: 9,
      maxLife: 9,
      armTime: 0.55,
      triggered: false,
    });
    burst(this.x, this.y, 7, this.color, 120);
  }

  draw(ctx) {
    const z = this.r / 14;
    const flash = this.flash > 0;
    const crouch = this.plantTime > 0 ? 0.72 : 1 + Math.sin(this.anim * 2.4) * 0.04;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.flip, crouch);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 15 * z, 18 * z, 5 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(255,122,26,${0.22 + Math.sin(this.anim * 3) * 0.08})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 2 * z, 21 * z, 16 * z, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#23110a";
    ctx.beginPath();
    ctx.roundRect(-15 * z, -11 * z, 30 * z, 22 * z, 8 * z);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(255,209,102,0.18)";
    ctx.fillRect(-10 * z, -5 * z, 20 * z, 4 * z);
    ctx.fillRect(-8 * z, 3 * z, 16 * z, 3 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(255,209,102,0.75)";
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 10 * z, -9 * z);
      ctx.lineTo(side * 20 * z, -15 * z + Math.sin(this.anim * 4) * 2 * z);
      ctx.stroke();
      ctx.fillStyle = flash ? "#ffffff" : this.color;
      ctx.fillRect(side * 20 * z - 2 * z, -17 * z, 4 * z, 4 * z);
    }
    ctx.fillStyle = flash ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.arc(1 * z, -13 * z, 8 * z, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(4 * z, -15 * z, 3 * z + Math.sin(this.anim * 6), 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#120805";
    for (const x of [-10, -2, 8, 14]) ctx.fillRect(x * z, 9 * z, 5 * z, 7 * z);
    ctx.fillStyle = flash ? "#ffffff" : "#ff7a1a";
    for (let i = 0; i < 3; i++) {
      const x = (-8 + i * 8) * z;
      ctx.beginPath();
      ctx.arc(x, 12 * z, (1.6 + Math.sin(this.anim * 7 + i) * 0.4) * z, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
