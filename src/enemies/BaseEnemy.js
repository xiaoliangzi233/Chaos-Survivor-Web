import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { clamp, distSq } from "../utils.js";
import { burst, pulse, spawnDamageText } from "../effects.js";
import { playSfx } from "../audio.js";
import { currentDifficulty } from "../difficulty.js";
import { applyPlayerDamage } from "../systems/items.js";
import { maybeTriggerBossSignature } from "../systems/easterEggs.js";

export class BaseEnemy {
  constructor(config, x, y) {
    Object.assign(this, config);
    const waveLevel = Math.max(0, (state.wave || 1) - 1);
    const hpScale = this.boss ? 1 : 1 + waveLevel * 0.075;
    const damageScale = this.boss ? 1 : 1 + waveLevel * 0.038;
    const speedScale = this.boss ? 1 : Math.min(1.42, 1 + waveLevel * 0.012);
    const defenseScale = this.boss ? 0 : waveLevel * 0.55 + Math.max(0, waveLevel - 8) * 0.35;
    const difficulty = currentDifficulty();
    const hpMul = this.boss ? difficulty.bossHp : difficulty.enemyHp;
    const damageMul = this.boss ? difficulty.bossDamage : difficulty.enemyDamage;
    const speedMul = this.boss ? Math.min(1.12, difficulty.enemySpeed || 1) : difficulty.enemySpeed;
    this.type = config.id;
    this.x = x;
    this.y = y;
    this.r = config.radius;
    this.hp = config.hp * hpScale * (hpMul || 1);
    this.maxHp = this.hp;
    this.speed = config.speed * speedScale * (speedMul || 1);
    this.damage = config.damage * damageScale * (damageMul || 1);
    this.defense = this.boss ? config.defense || 0 : (config.defense || 0) + defenseScale;
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
    this.difficultyAttackSpeed = difficulty.enemyAttackSpeed || 1;
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
      applyPlayerDamage(this.damage, this);
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
    this.chase(dt, dx, dy, d, 0.55);
    if (this.cooldown <= 0) {
      this.cooldown = this.behavior === "boss_crystal" ? 1.0 : 1.45;
      const count = this.behavior === "boss_crystal" ? 18 : 10;
      for (let i = 0; i < count; i++) spawnEnemyBullet(this.x, this.y, (i / count) * TAU + this.phase, this.color, 170, this.damage * 0.45, { bossProjectile: true });
      if (this.behavior === "boss_void") addHazard(state.player.x, state.player.y, this.color, this.damage * 0.5);
    }
  }

  takeDamage(amount, x, y, options = {}) {
    if (this.dead) return;
    const scaled = amount * (this.shielded ? 0.35 : 1) * state.player.damageScale;
    const reduced = Math.max(1, scaled - (this.defense || 0));
    this.hp -= reduced;
    const damageText = options.damageText || (!options.statusEffect ? spawnDamageText : null);
    damageText?.(reduced, this, options);
    if (!options.statusEffect) {
      this.flash = 1;
      burst(x, y, 3, this.color, 120);
    }
    if (this.hp <= 0) this.kill();
  }

  kill() {
    this.dead = true;
    state.kills++;
    if (this.boss) maybeTriggerBossSignature(this);
    if (this.boss && world.boss === this) world.boss = null;
    burst(this.x, this.y, this.boss ? 48 : 12, this.color, this.boss ? 240 : 140);
    playSfx(this.boss ? "explode" : "hit");
    import("../systems/entities.js").then(({ coinAmountForEnemy, dropGem, dropCoin }) => {
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

export function spawnEnemyBullet(x, y, angle, color, speed, damage, options = {}) {
  world.enemyProjectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5, color, damage, life: 4, ...options });
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
  const outfit = zombieOutfit(e);
  const cloth = flash ? "#ffffff" : outfit.cloth;
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
  if (!flash && e.clothingVariant === "scientist") {
    ctx.fillStyle = "#e8f7ff";
    ctx.fillRect(-11 * z, -14 * z, 6 * z, 26 * z);
    ctx.fillRect(6 * z, -15 * z, 6 * z, 25 * z);
    ctx.fillStyle = "#4ee7ff";
    ctx.fillRect(5 * z, -9 * z, 4 * z, 3 * z);
    ctx.strokeStyle = "rgba(26,55,70,0.7)";
    ctx.lineWidth = 1 * z;
    ctx.beginPath();
    ctx.moveTo(-1 * z, -13 * z);
    ctx.lineTo(-1 * z, 10 * z);
    ctx.stroke();
  } else if (!flash && e.clothingVariant === "medic") {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(-9 * z, -13 * z, 18 * z, 7 * z);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-2 * z, -12 * z, 4 * z, 5 * z);
    ctx.fillRect(-5 * z, -10 * z, 10 * z, 2 * z);
  } else if (!flash && e.clothingVariant === "engineer") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-10 * z, -15 * z, 20 * z, 4 * z);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(-8 * z, -4 * z, 5 * z, 8 * z);
    ctx.fillRect(5 * z, -3 * z, 4 * z, 7 * z);
  } else if (!flash && e.clothingVariant === "prisoner") {
    ctx.fillStyle = "#111827";
    for (let y = -12; y <= 7; y += 7) ctx.fillRect(-10 * z, y * z, 22 * z, 3 * z);
  } else if (!flash && e.clothingVariant === "courier") {
    ctx.fillStyle = "#7c2d12";
    ctx.fillRect(-13 * z, -7 * z, 7 * z, 15 * z);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(3 * z, -13 * z, 6 * z, 5 * z);
  } else if (!flash && outfit.accent) {
    ctx.fillStyle = outfit.accent;
    ctx.fillRect(-8 * z, -12 * z, 15 * z, 3 * z);
    ctx.fillRect(6 * z, 2 * z, 4 * z, 8 * z);
  }
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

function zombieOutfit(e) {
  if (e.clothingVariant === "scientist") return { cloth: "#f4fbff", accent: "#4ee7ff" };
  if (e.clothingVariant === "worker") return { cloth: "#d6b64f", accent: "#f97316" };
  if (e.clothingVariant === "runner") return { cloth: "#9f7aea", accent: "#42e8ff" };
  if (e.clothingVariant === "hazard") return { cloth: "#334155", accent: "#ffd166" };
  if (e.clothingVariant === "security") return { cloth: "#264b63", accent: "#77ff8a" };
  if (e.clothingVariant === "medic") return { cloth: "#e2e8f0", accent: "#ef4444" };
  if (e.clothingVariant === "engineer") return { cloth: "#475569", accent: "#facc15" };
  if (e.clothingVariant === "janitor") return { cloth: "#0f766e", accent: "#67e8f9" };
  if (e.clothingVariant === "prisoner") return { cloth: "#f97316", accent: "#111827" };
  if (e.clothingVariant === "courier") return { cloth: "#7c3aed", accent: "#fde68a" };
  if (e.clothingVariant === "lab_guard") return { cloth: "#172554", accent: "#38bdf8" };
  if (e.clothingVariant === "chemist") return { cloth: "#5b21b6", accent: "#a7f3d0" };
  if (e.clothingVariant === "mechanic") return { cloth: "#78350f", accent: "#fb923c" };
  if (e.id === "tank" || e.type === "tank") return { cloth: "#6d5bbf", accent: "#ffd166" };
  if (e.behavior === "lancer" || e.behavior === "line_raider") return { cloth: "#d6b64f", accent: "#ffef99" };
  if (e.behavior === "ranged" || e.behavior === "gunner" || e.behavior === "wizard") return { cloth: "#2b8da4", accent: "#d9fbff" };
  if (e.behavior === "hazard_mage") return { cloth: "#5f4aa8", accent: "#b48cff" };
  if (e.behavior === "summoner") return { cloth: "#4d7c0f", accent: "#9dffac" };
  return { cloth: "#345a78", accent: null };
}

function zombieCloth(e) {
  const outfit = zombieOutfit(e);
  return typeof outfit === "string" ? outfit : outfit.cloth;
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
