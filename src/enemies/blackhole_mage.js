import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { clamp } from "../utils.js";
import { burst, pulse, trail } from "../effects.js";
import { summonOrEmpowerBlackhole } from "../blackhole.js";
import { BaseEnemy } from "./BaseEnemy.js";
import { applyPlayerDamage } from "../systems/items.js";

export class BlackholeMage extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.state = "keep";
    this.castTime = 0;
    this.channelTime = 0;
    this.recoverTime = 0;
    this.cooldown = this.cdInitial;
    this.castTargetX = x;
    this.castTargetY = y;
    this.orbitSide = Math.random() < 0.5 ? -1 : 1;
    this.robePhase = Math.random() * TAU;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.state === "cast" ? 5.4 : 3.2);
    this.robePhase += dt * 2.1;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    if (this.state === "cast") this.updateCast(dt, dx, dy, d);
    else if (this.state === "channel") this.updateChannel(dt, dx, dy, d);
    else if (this.state === "recover") this.updateRecover(dt, dx, dy, d);
    else this.updateKeepDistance(dt, dx, dy, d);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      applyPlayerDamage(this.damage, this);
      p.invuln = 0.5;
      state.flash = 0.22;
      burst(p.x, p.y, 10, this.color, 120);
    }
  }

  updateKeepDistance(dt, dx, dy, d) {
    this.cooldown -= dt;
    const desired = 450;
    const dir = d < 330 ? -0.9 : d > 560 ? 0.46 : 0;
    const orbit = this.orbitSide * 0.55;
    this.x += (dx / d * dir + -dy / d * orbit) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * orbit) * this.speed * dt;
    if (Math.abs(d - desired) < 80) {
      trail(this.x, this.y, this.x - dx / d * 12, this.y - dy / d * 12, this.color, 4);
    }
    if (this.cooldown <= 0 && d < 760) {
      this.state = "cast";
      this.castTime = 1.05;
      this.castTargetX = state.player.x + state.player.dirX * 88;
      this.castTargetY = state.player.y + state.player.dirY * 88;
      pulse(this.x, this.y, 58, this.color, 0.32);
    }
  }

  updateCast(dt, dx, dy, d) {
    this.castTime -= dt;
    this.x -= (dx / d) * this.speed * 0.16 * dt;
    this.y -= (dy / d) * this.speed * 0.16 * dt;
    if (this.castTime <= 0) {
      const tx = clamp(this.castTargetX, -WORLD_SIZE / 2 + 120, WORLD_SIZE / 2 - 120);
      const ty = clamp(this.castTargetY, -WORLD_SIZE / 2 + 120, WORLD_SIZE / 2 - 120);
      summonOrEmpowerBlackhole(tx, ty, state.player.x - tx, state.player.y - ty, this.color);
      this.state = "channel";
      this.channelTime = 0.64;
      burst(this.x, this.y, 12, this.color, 160);
    }
  }

  updateChannel(dt, dx, dy, d) {
    this.channelTime -= dt;
    this.x += (-dy / d) * this.speed * 0.18 * this.orbitSide * dt;
    this.y += (dx / d) * this.speed * 0.18 * this.orbitSide * dt;
    if (world.blackhole) trail(this.x, this.y, world.blackhole.x, world.blackhole.y, this.color, 3);
    if (this.channelTime <= 0) {
      this.state = "recover";
      this.recoverTime = this.recoverDuration;
      this.cooldown = this.cd + Math.random() * this.cdRandom;
    }
  }

  updateRecover(dt, dx, dy, d) {
    this.recoverTime -= dt;
    this.x -= (dx / d) * this.speed * 0.24 * dt;
    this.y -= (dy / d) * this.speed * 0.24 * dt;
    if (this.recoverTime <= 0) this.state = "keep";
  }

  draw(ctx) {
    const casting = this.state === "cast" || this.state === "channel";
    const flash = this.flash > 0;
    const z = this.r / 15;
    const bob = Math.sin(this.anim * 1.4) * 3;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + bob));
    ctx.scale(this.flip || 1, 1);
    if (casting) drawCastAura(ctx, this, z);
    drawShadow(ctx, z);
    drawRobe(ctx, this, z, flash, casting);
    drawHood(ctx, this, z, flash, casting);
    drawAstrolabe(ctx, this, z, casting);
    if (this.state === "channel" && world.blackhole) drawTether(ctx, this, z);
    ctx.restore();
  }
}

function drawShadow(ctx, z) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 19 * z, 17 * z, 5 * z, 0, 0, TAU);
  ctx.fill();
}

function drawRobe(ctx, e, z, flash, casting) {
  const sway = Math.sin(e.robePhase) * 2.2 * z;
  ctx.fillStyle = flash ? "#ffffff" : "#221735";
  ctx.beginPath();
  ctx.moveTo(-11 * z, -20 * z);
  ctx.quadraticCurveTo(0, -27 * z, 12 * z, -20 * z);
  ctx.lineTo(17 * z + sway, 15 * z);
  ctx.quadraticCurveTo(4 * z, 22 * z, -13 * z - sway, 15 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "rgba(3,6,12,0.48)";
  ctx.beginPath();
  ctx.moveTo(0, -18 * z);
  ctx.lineTo(7 * z, 13 * z);
  ctx.lineTo(-7 * z, 13 * z);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = casting ? e.color : "rgba(180,140,255,0.55)";
  ctx.lineWidth = 1.6 * z;
  ctx.stroke();
}

function drawHood(ctx, e, z, flash, casting) {
  ctx.fillStyle = flash ? "#ffffff" : "#130e22";
  ctx.beginPath();
  ctx.moveTo(-12 * z, -21 * z);
  ctx.quadraticCurveTo(0, -40 * z, 13 * z, -21 * z);
  ctx.quadraticCurveTo(8 * z, -9 * z, -8 * z, -10 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "rgba(0,0,0,0.82)";
  ctx.beginPath();
  ctx.ellipse(0, -21 * z, 8 * z, 7 * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = casting ? "#ffffff" : "#d8c8ff";
  ctx.fillRect(-5 * z, -23 * z, 2.5 * z, 2 * z);
  ctx.fillRect(3 * z, -23 * z, 2.5 * z, 2 * z);
}

function drawAstrolabe(ctx, e, z, casting) {
  const x = 15 * z;
  const y = -8 * z;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(e.anim * (casting ? 1.8 : 0.8));
  ctx.strokeStyle = casting ? "#ffffff" : e.color;
  ctx.lineWidth = 1.5 * z;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, (7 + i * 3) * z, (3 + i * 2) * z, i * Math.PI / 3, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, 0, 3.2 * z, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawCastAura(ctx, e, z) {
  ctx.strokeStyle = `rgba(141,107,255,${0.32 + Math.sin(e.anim * 7) * 0.12})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, -6 * z, (24 + i * 9 + Math.sin(e.anim * 4 + i) * 3) * z, 0, TAU);
    ctx.stroke();
  }
}

function drawTether(ctx, e) {
  const h = world.blackhole;
  const dx = (h.x - e.x) * (e.flip || 1);
  const dy = h.y - e.y;
  ctx.strokeStyle = "rgba(216,200,255,0.42)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(15, -8);
  ctx.lineTo(dx, dy);
  ctx.stroke();
}
