import { TAU, WORLD_SIZE } from "../constants.js";
import { state } from "../state.js";
import { burst, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

export class Thief extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "thief";
    this.wanderAngle = Math.random() * TAU;
    this.turnTimer = 0.2;
    this.coinDrop = config.coinDrop || 24;
    this.damage = 0;
  }

  update(dt) {
    this.anim += dt * 5;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      const away = Math.atan2(this.y - state.player.y, this.x - state.player.x);
      this.wanderAngle = away + (Math.random() - 0.5) * 1.6;
      this.turnTimer = 0.45 + Math.random() * 0.65;
    }
    const px = this.x;
    const py = this.y;
    this.x += Math.cos(this.wanderAngle) * this.speed * dt;
    this.y += Math.sin(this.wanderAngle) * this.speed * dt;
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
    if (Math.hypot(this.x - px, this.y - py) > 2) trail(this.x, this.y, px, py, this.color, 5);
  }

  kill() {
    const x = this.x;
    const y = this.y;
    super.kill();
    import("../systems/entities.js").then(({ dropCoin }) => dropCoin(x, y, this.coinDrop));
    burst(x, y, 18, "#ffd166", 180);
  }

  draw(ctx) {
    const z = this.r / 13;
    const flash = this.flash > 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 5, this.r, this.r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#ffffff" : "#1f2937";
    ctx.fillRect(-8 * z, -12 * z, 16 * z, 22 * z);
    ctx.fillStyle = flash ? "#ffffff" : "#ffd166";
    ctx.fillRect(-5 * z, -20 * z, 10 * z, 8 * z);
    ctx.fillRect(5 * z, -2 * z, 8 * z, 9 * z);
    ctx.strokeStyle = flash ? "#ffffff" : "#42e8ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-9 * z, -13 * z, 18 * z, 24 * z);
    ctx.restore();
  }
}
