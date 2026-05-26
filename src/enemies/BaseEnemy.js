import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { clamp, distSq } from "../utils.js";
import { burst, pulse } from "../effects.js";
import { playSfx } from "../audio.js";

export class BaseEnemy {
  constructor(config, x, y) {
    Object.assign(this, config);
    const scale = this.boss ? 1 : 1 + state.wave * 0.08;
    this.type = config.id;
    this.x = x;
    this.y = y;
    this.r = config.radius;
    this.hp = config.hp * scale;
    this.maxHp = this.hp;
    this.speed = config.speed;
    this.damage = config.damage;
    this.xp = config.xp;
    this.color = config.color;
    this.dead = false;
    this.flash = 0;
    this.hitTimer = 0;
    this.anim = Math.random() * TAU;
    this.cooldown = 0.8 + Math.random() * 1.2;
    this.flip = 1;
    this.phase = 0;
    this.shielded = false;
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.knockbackResistance = config.knockbackResistance ?? (this.boss ? 0.92 : this.elite ? 0.58 : Math.min(0.62, Math.max(0.16, (this.r - 10) / 36)));
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (2.4 + this.speed * 0.025);
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    this.runBehavior(dt, dx, dy, d);
    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      p.hp -= this.damage;
      p.invuln = 0.55;
      state.shake = 8;
      state.flash = 0.28;
      burst(p.x, p.y, 12, "#ff4d6d", 120);
      playSfx("hurt");
      if (this.behavior === "exploder") this.hp = 0;
    }
  }

  runBehavior(dt, dx, dy, d) {
    if (this.behavior === "ranged" || this.behavior === "gunner" || this.behavior === "wizard" || this.behavior === "pylon") return this.ranged(dt, dx, dy, d);
    if (this.behavior === "hazard_mage" || this.behavior === "boss_void") return this.hazardMage(dt, dx, dy, d);
    if (this.behavior === "blink") return this.blink(dt, dx, dy, d);
    if (this.behavior === "mine" || this.behavior === "artillery") return this.mine(dt, dx, dy, d);
    if (this.behavior === "summoner") return this.summoner(dt, dx, dy, d);
    if (this.behavior === "lancer" || this.behavior === "line_raider") return this.lancer(dt, dx, dy, d);
    if (this.behavior === "bat") return this.bat(dt, dx, dy, d);
    if (this.behavior === "shield") return this.shield(dt, dx, dy, d);
    if (this.behavior === "berserker" && this.hp < this.maxHp * 0.5) this.speed *= 1 + dt * 0.35;
    if (this.boss) return this.bossMove(dt, dx, dy, d);
    return this.chase(dt, dx, dy, d);
  }

  chase(dt, dx, dy, d, mul = 1) {
    const wobble = Math.sin(state.time * 2 + this.x * 0.01) * 0.18;
    this.x += (dx / d + -dy / d * wobble) * this.speed * mul * dt;
    this.y += (dy / d + dx / d * wobble) * this.speed * mul * dt;
  }

  ranged(dt, dx, dy, d) {
    const desired = this.behavior === "pylon" ? 620 : 360;
    const dir = d < desired ? -1 : 0.35;
    this.x += (dx / d) * this.speed * dir * dt;
    this.y += (dy / d) * this.speed * dir * dt;
    if (this.cooldown <= 0) {
      this.cooldown = this.elite ? 0.75 : 1.25;
      spawnEnemyBullet(this.x, this.y, Math.atan2(dy, dx), this.color, this.elite ? 220 : 180, this.damage * 0.65);
    }
  }

  hazardMage(dt, dx, dy, d) {
    this.ranged(dt, dx, dy, d);
    if (this.cooldown <= 0.08) addHazard(state.player.x + (Math.random() - 0.5) * 120, state.player.y + (Math.random() - 0.5) * 120, this.color, this.damage * 0.45);
  }

  blink(dt, dx, dy, d) {
    this.chase(dt, dx, dy, d, 0.85);
    if (this.cooldown <= 0) {
      this.cooldown = this.elite ? 1.1 : 1.8;
      this.x = state.player.x - state.player.dirX * 150 + (Math.random() - 0.5) * 80;
      this.y = state.player.y - state.player.dirY * 150 + (Math.random() - 0.5) * 80;
      pulse(this.x, this.y, 42, this.color, 0.22);
    }
  }

  mine(dt, dx, dy, d) {
    this.chase(dt, dx, dy, d, 0.7);
    if (this.cooldown <= 0) {
      this.cooldown = 1.7;
      addHazard(this.x, this.y, this.color, this.damage);
    }
  }

  summoner(dt, dx, dy, d) {
    this.chase(dt, dx, dy, d, 0.55);
    if (this.cooldown <= 0) {
      this.cooldown = this.elite ? 1.2 : 2.0;
      spawnMinion(this.x, this.y);
    }
  }

  lancer(dt, dx, dy, d) {
    const charge = Math.sin(this.anim * 1.3) > 0.72 ? 2.8 : 0.8;
    this.chase(dt, dx, dy, d, charge);
  }

  bat(dt, dx, dy, d) {
    this.x += (dx / d) * this.speed * dt + Math.cos(this.anim * 2) * 80 * dt;
    this.y += (dy / d) * this.speed * dt + Math.sin(this.anim * 2) * 80 * dt;
  }

  shield(dt, dx, dy, d) {
    this.chase(dt, dx, dy, d, 0.45);
    for (const e of world.enemies) if (e !== this && distSq(e.x, e.y, this.x, this.y) < 180 * 180) e.shielded = true;
  }

  bossMove(dt, dx, dy, d) {
    this.phase += dt;
    this.chase(dt, dx, dy, d, this.behavior === "boss_snake" ? 1.1 : 0.55);
    if (this.cooldown <= 0) {
      this.cooldown = this.behavior === "boss_crystal" ? 1.0 : 1.45;
      const count = this.behavior === "boss_crystal" ? 18 : 10;
      for (let i = 0; i < count; i++) spawnEnemyBullet(this.x, this.y, (i / count) * TAU + this.phase, this.color, 170, this.damage * 0.45);
      if (this.behavior === "boss_void") addHazard(state.player.x, state.player.y, this.color, this.damage * 0.5);
    }
  }

  takeDamage(amount, x, y) {
    if (this.dead) return;
    this.hp -= amount * (this.shielded ? 0.35 : 1) * state.player.damageScale;
    this.flash = 1;
    burst(x, y, 3, this.color, 120);
    if (this.hp <= 0) this.kill();
  }

  kill() {
    this.dead = true;
    state.kills++;
    if (this.boss && world.boss === this) world.boss = null;
    burst(this.x, this.y, this.boss ? 48 : 12, this.color, this.boss ? 240 : 140);
    playSfx(this.boss ? "explode" : "hit");
    import("../entities.js").then(({ coinAmountForEnemy, dropGem, dropCoin }) => {
      dropGem(this.x, this.y, this.xp);
      const amount = coinAmountForEnemy(this);
      if (amount > 0) dropCoin(this.x, this.y, amount);
    });
    const i = world.enemies.indexOf(this);
    if (i >= 0) world.enemies.splice(i, 1);
    if (this.behavior === "split_large") splitInto("slime_medium", this.x, this.y, 2, this.r * 0.8);
    if (this.behavior === "split_medium") splitInto("slime_small", this.x, this.y, 2, this.r * 0.9);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.boss) drawBossShape(ctx, this);
    else drawEnemyShape(ctx, this);
    ctx.restore();
  }
}

export let spawnConfigured = () => {};
export function setSpawnConfigured(fn) {
  spawnConfigured = fn;
}

export function spawnEnemyBullet(x, y, angle, color, speed, damage) {
  world.enemyProjectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5, color, damage, life: 4 });
}

function spawnMinion(x, y) {
  spawnConfigured("zombie", x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
}

function splitInto(id, x, y, count, spread) {
  const offset = Math.random() * TAU;
  for (let n = 0; n < count; n++) {
    const a = offset + (n / count) * TAU;
    spawnConfigured(id, x + Math.cos(a) * spread, y + Math.sin(a) * spread);
  }
}

function addHazard(x, y, color, damage) {
  world.hazards.push({ x, y, r: 56, color, damage, life: 3, maxLife: 3 });
  pulse(x, y, 56, color, 0.4);
}

function drawEnemyShape(ctx, e) {
  if (e.behavior?.includes("split")) {
    drawFallbackSlimeShape(ctx, e);
  } else if (e.behavior === "pylon" || e.behavior === "shield") {
    ctx.rotate(Math.sin(e.anim) * 0.1);
    ctx.fillStyle = e.flash > 0 ? "#fff" : e.color;
    ctx.fillRect(-e.r * 0.75, -e.r * 1.2, e.r * 1.5, e.r * 2.2);
    ctx.strokeStyle = e.elite ? "#ffd166" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = e.elite ? 3 : 1.5;
    ctx.strokeRect(-e.r * 0.75, -e.r * 1.2, e.r * 1.5, e.r * 2.2);
  } else {
    drawZombieShape(ctx, e);
  }
}

function drawFallbackSlimeShape(ctx, e) {
  const lift = Math.max(0, Math.sin(e.anim * 2.2)) * 4;
  const squash = 1 + Math.sin(e.anim * 3.2) * 0.07;
  const r = e.r * (e.type === "slime_large" ? 1.18 : e.type === "slime_medium" ? 1.06 : 1);
  const flash = e.flash > 0;
  const body = flash ? "#ffffff" : e.color;
  const core = flash ? "#ffffff" : "#9dffac";
  const dark = flash ? "#eaffef" : "#2f8b4b";

  ctx.translate(0, -lift);
  ctx.scale(squash, 1 / squash);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.68 + lift, r * 0.92, r * 0.18, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, r * 0.18);
  ctx.bezierCurveTo(-r, -r * 0.58, -r * 0.42, -r * 0.94, 0, -r * 0.94);
  ctx.bezierCurveTo(r * 0.5, -r * 0.92, r, -r * 0.55, r, r * 0.16);
  ctx.bezierCurveTo(r * 0.82, r * 0.75, r * 0.36, r * 0.94, 0, r * 0.86);
  ctx.bezierCurveTo(-r * 0.44, r * 0.94, -r * 0.86, r * 0.74, -r * 0.98, r * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(r * 0.08, r * 0.02, r * 0.68, r * 0.52, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(r * -0.15, r * -0.08, r * 0.11, 0, TAU);
  ctx.arc(r * 0.31, r * -0.08, r * 0.11, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.4, r * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(r * 0.08, r * 0.14, r * 0.18, Math.PI * 0.16, Math.PI * 0.84);
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.48, r * 0.2, r * 0.1, -0.5, 0, TAU);
  ctx.fill();
}

function drawZombieShape(ctx, e) {
  const visualScale = e.id === "zombie" || e.type === "zombie" ? 1.08 : 0.88;
  const z = e.r / 14 * visualScale;
  const walk = Math.sin(e.anim * 2.15);
  const step = Math.cos(e.anim * 2.15);
  const bob = Math.abs(step) * -1.5 * z;
  const sway = Math.sin(e.anim * 1.05) * 2.1 * z;
  const flash = e.flash > 0;
  const skin = flash ? "#ffffff" : zombieSkin(e);
  const dark = flash ? "#dfefff" : "#315436";
  const cloth = flash ? "#ffffff" : zombieCloth(e);
  const wound = flash ? "#ffffff" : "#b91c1c";

  ctx.scale(e.flip || 1, 1);
  ctx.translate(sway, bob);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.beginPath();
  ctx.ellipse(0, 15 * z, 16 * z, 5 * z, 0, 0, TAU);
  ctx.fill();

  ctx.rotate(Math.sin(e.anim * 0.9) * 0.055);
  drawZombieLeg(ctx, -6 * z, -1 * z, walk, z, dark);
  drawZombieLeg(ctx, 5 * z, -1 * z, -walk, z, dark);

  ctx.save();
  ctx.rotate(Math.sin(e.anim * 1.3) * 0.08);
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(-12 * z, -15 * z);
  ctx.lineTo(10 * z, -16 * z);
  ctx.lineTo(13 * z, 9 * z);
  ctx.lineTo(4 * z, 13 * z);
  ctx.lineTo(-8 * z, 12 * z);
  ctx.lineTo(-13 * z, 6 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(-10 * z, -3 * z, 21 * z, 5 * z);
  ctx.fillStyle = wound;
  ctx.fillRect(1 * z, -11 * z, 8 * z, 10 * z);
  ctx.fillStyle = flash ? "#ffffff" : "#26344a";
  ctx.fillRect(-9 * z, -13 * z, 8 * z, 5 * z);
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(7,16,13,0.72)";
  ctx.lineWidth = 1.4 * z;
  ctx.stroke();
  ctx.restore();

  drawZombieArm(ctx, -11 * z, -9 * z, -1, walk, z, skin, dark);
  drawZombieArm(ctx, 10 * z, -10 * z, 1, -walk, z, skin, dark);

  ctx.save();
  ctx.translate(Math.sin(e.anim * 1.45) * 1.6 * z, -2.2 * z);
  ctx.rotate(Math.sin(e.anim * 1.1) * 0.08);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-9 * z, -31 * z);
  ctx.lineTo(8 * z, -32 * z);
  ctx.lineTo(11 * z, -19 * z);
  ctx.lineTo(5 * z, -12 * z);
  ctx.lineTo(-7 * z, -13 * z);
  ctx.lineTo(-11 * z, -22 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(-10 * z, -32 * z, 9 * z, 5 * z);
  ctx.fillRect(-11 * z, -25 * z, 5 * z, 8 * z);
  ctx.fillRect(6 * z, -31 * z, 4 * z, 8 * z);
  ctx.fillStyle = "#182018";
  ctx.fillRect(-5 * z, -24 * z, 4 * z, 4 * z);
  ctx.fillRect(4 * z, -24 * z, 4 * z, 4 * z);
  ctx.fillStyle = "#f3f7ff";
  ctx.fillRect(5 * z, -25 * z, 2 * z, 2 * z);
  ctx.fillStyle = wound;
  ctx.fillRect(-1 * z, -17 * z, 8 * z, 2.5 * z);
  ctx.fillRect(7 * z, -20 * z, 3 * z, 4 * z);

  ctx.strokeStyle = flash ? "#ffffff" : "rgba(8,18,14,0.65)";
  ctx.lineWidth = 1.5 * z;
  ctx.stroke();
  ctx.restore();
}

function drawZombieLeg(ctx, x, y, phase, z, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(phase * 0.18);
  ctx.fillStyle = color;
  ctx.fillRect(-3 * z, 0, 6 * z, 17 * z);
  ctx.fillStyle = "#16202b";
  ctx.fillRect(-5 * z, 14 * z, 9 * z, 4 * z);
  ctx.restore();
}

function drawZombieArm(ctx, x, y, side, phase, z, skin, sleeve) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(side * (0.12 + phase * 0.18));
  ctx.fillStyle = sleeve;
  rectDir(ctx, 0, -3 * z, side * 9 * z, 6 * z);
  ctx.fillStyle = skin;
  rectDir(ctx, side * 7 * z, -3 * z, side * 10 * z, 6 * z);
  rectDir(ctx, side * 15 * z, -2 * z, side * 5 * z, 5 * z);
  ctx.restore();
}

function rectDir(ctx, x, y, w, h) {
  ctx.fillRect(Math.min(x, x + w), y, Math.abs(w), h);
}

function zombieSkin(e) {
  if (e.behavior === "ranged" || e.behavior === "gunner" || e.behavior === "wizard") return "#9fe7df";
  if (e.behavior === "blink") return "#b991ff";
  if (e.behavior === "mine" || e.behavior === "exploder" || e.behavior === "artillery") return "#ffb06e";
  return "#7ccf68";
}

function zombieCloth(e) {
  if (e.id === "tank" || e.type === "tank") return "#6d5bbf";
  if (e.behavior === "lancer" || e.behavior === "line_raider") return "#d6b64f";
  if (e.behavior === "ranged" || e.behavior === "gunner" || e.behavior === "wizard") return "#2b8da4";
  if (e.behavior === "hazard_mage") return "#5f4aa8";
  if (e.behavior === "summoner") return "#4d7c0f";
  return "#345a78";
}

function drawBossShape(ctx, e) {
  const pulseScale = 1 + Math.sin(e.anim) * 0.04;
  ctx.scale(pulseScale, pulseScale);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(-e.r * 0.9, e.r * 0.55, e.r * 1.8, e.r * 0.28);
  ctx.rotate(e.phase * 0.25);
  ctx.fillStyle = e.flash > 0 ? "#fff" : e.color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = i % 2 ? e.r * 0.72 : e.r;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
}
