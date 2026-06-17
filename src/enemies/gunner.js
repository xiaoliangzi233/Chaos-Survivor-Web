import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse } from "../effects.js";
import { clamp } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";




export class Gunner extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "gunner";
    this.cooldown = this.cdInitial;
    this.burstLeft = 0;
    this.burstDelay = 0;
    this.angle = 0;
    this.step = Math.random() * TAU;
    this.pattern = "triangle";
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5.2;
    this.step += dt * 8;
    this.cooldown -= dt;
    this.burstDelay -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;
    this.angle = Math.atan2(dy, dx);

    const dir = d < this.idealRange * 0.75 ? -1.0 : d > this.idealRange * 1.25 ? 0.55 : 0;
    const strafe = Math.sin(this.anim * 0.65) * 0.85;
    this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;

    if (this.burstLeft > 0 && this.burstDelay <= 0) {
      this.fireShot(this.angle);
      this.burstLeft--;
      this.burstDelay = this.burstDelayTime;
    } else if (this.cooldown <= 0 && d < this.fireRange) {
      this.pattern = ["triangle", "square", "hexagon", "circle"][Math.floor(Math.random() * 4)];
      this.burstLeft = 1;
      this.burstDelay = 0.01;
      this.cooldown = this.elite ? this.cdElite : this.cd + Math.random() * this.cdRandom;
      pulse(this.x, this.y, 24, this.color, 0.12);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  fireShot(angle) {
    const points = geometryPatternPoints(this.pattern, this.elite);
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const speed = this.elite ? this.bulletSpeedElite : this.bulletSpeed;
    for (const point of points) {
      world.enemyProjectiles.push({
        x: this.x + forwardX * (this.r + 16) + sideX * point.x + forwardX * point.y,
        y: this.y + forwardY * (this.r + 16) + sideY * point.x + forwardY * point.y,
        vx: forwardX * speed,
        vy: forwardY * speed,
        r: this.elite ? 4.5 : 4,
        color: point.accent ? "#42e8ff" : "#f3f7ff",
        damage: this.damage * this.bulletDamageMul,
        life: 3.1,
        shape: "gunnerShot",
      });
    }
    burst(this.x + forwardX * this.r, this.y + forwardY * this.r, 5, "#f3f7ff", 110);
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const body = flash ? "#ffffff" : "#d8e5f7";
    const dark = flash ? "#ffffff" : "#26344a";
    const accent = flash ? "#ffffff" : "#42e8ff";
    ctx.save();
    ctx.translate(this.x, this.y + Math.abs(Math.sin(this.step)) * -1.5);
    ctx.scale(this.flip, 1);
    ctx.fillStyle = "rgba(0,0,0,0.27)";
    ctx.beginPath();
    ctx.ellipse(0, 17 * z, 17 * z, 5 * z, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : "rgba(66,232,255,0.24)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * z, 18 * z, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = dark;
    ctx.fillRect(-7 * z, 4 * z, 5 * z, 15 * z);
    ctx.fillRect(3 * z, 4 * z, 5 * z, 15 * z);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -22 * z);
    ctx.lineTo(15 * z, -8 * z);
    ctx.lineTo(11 * z, 11 * z);
    ctx.lineTo(-12 * z, 11 * z);
    ctx.lineTo(-15 * z, -8 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "rgba(66,232,255,0.18)";
    ctx.fillRect(-9 * z, -5 * z, 18 * z, 3 * z);
    ctx.fillRect(-7 * z, 4 * z, 14 * z, 3 * z);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-14 * z, -6 * z);
    ctx.lineTo(14 * z, -6 * z);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(0, -9 * z, 7 * z, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-3 * z, -11 * z, 6 * z, 3 * z);
    ctx.fillStyle = accent;
    ctx.fillRect(-6 * z, -5 * z, 12 * z, 2 * z);

    ctx.save();
    const localAngle = this.flip > 0 ? this.angle : Math.PI - this.angle;
    ctx.rotate(localAngle);
    ctx.fillStyle = dark;
    ctx.fillRect(6 * z, -4 * z, 25 * z, 8 * z);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(12 * z, -2 * z, 12 * z, 4 * z);
    ctx.fillStyle = accent;
    ctx.fillRect(26 * z, -2 * z, 8 * z, 4 * z);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(5 * z, -5 * z, 30 * z, 10 * z);
    if (this.burstLeft > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(36 * z, 0, 4 * z + Math.sin(state.time * 30), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }
}

function geometryPatternPoints(pattern, elite) {
  const scale = elite ? 1.18 : 1;
  const points = [];
  if (pattern === "triangle") {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3;
      points.push({ x: Math.cos(a) * 38 * scale, y: Math.sin(a) * 38 * scale, accent: i === 0 });
    }
    return points;
  }
  if (pattern === "square") {
    for (const x of [-34, 34]) for (const y of [-34, 34]) points.push({ x: x * scale, y: y * scale, accent: x === y });
    return points;
  }
  const count = pattern === "hexagon" ? 6 : 10;
  const radius = pattern === "hexagon" ? 44 : 40;
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count;
    points.push({ x: Math.cos(a) * radius * scale, y: Math.sin(a) * radius * scale, accent: i % 3 === 0 });
  }
  if (pattern === "circle") points.push({ x: 0, y: 0, accent: true });
  return points;
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
