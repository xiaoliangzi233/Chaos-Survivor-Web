import { PARTICLE_LIMIT, TAU } from "./constants.js";
import { world } from "./state.js";
import { clamp, hexToRgba } from "./utils.js";

export function particle(kind, x, y, options = {}) {
  if (world.particles.length >= PARTICLE_LIMIT) world.particles.shift();
  world.particles.push({
    kind,
    x,
    y,
    px: options.px ?? x,
    py: options.py ?? y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    life: options.life ?? 0.35,
    maxLife: options.life ?? 0.35,
    radius: options.radius ?? 20,
    size: options.size ?? 4,
    color: options.color ?? "#42e8ff",
    t: 0,
  });
}

export function burst(x, y, count, color, speed = 140) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.35 + Math.random() * 0.9);
    particle("spark", x, y, {
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.28 + Math.random() * 0.35,
      size: 2 + Math.random() * 5,
      color,
    });
  }
}

export function pulse(x, y, radius, color, life = 0.26) {
  particle("ring", x, y, { radius, color, life, size: 2 });
}

export function trail(x, y, px, py, color, size = 5) {
  particle("trail", x, y, { px, py, color, size, life: 0.18 });
}

export function dust(x, y, vx, vy) {
  particle("dust", x, y, {
    vx: vx * 36 + (Math.random() - 0.5) * 24,
    vy: vy * 36 + (Math.random() - 0.5) * 24,
    life: 0.45,
    size: 6 + Math.random() * 8,
    color: "#8fa2a0",
  });
}

export function updateEffects(dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.t += dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
}

export function drawEffects(ctx) {
  for (const p of world.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === "ring") {
      ctx.strokeStyle = hexToRgba(p.color, alpha * 0.75);
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (1 - alpha * 0.16), 0, TAU);
      ctx.stroke();
    } else if (p.kind === "trail") {
      const grad = ctx.createLinearGradient(p.px, p.py, p.x, p.y);
      grad.addColorStop(0, hexToRgba(p.color, 0));
      grad.addColorStop(1, hexToRgba(p.color, alpha * 0.55));
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.size * alpha;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else if (p.kind === "dust") {
      ctx.fillStyle = `rgba(143,162,160,${alpha * 0.28})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
}
