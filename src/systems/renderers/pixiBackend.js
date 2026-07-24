import { CAMERA_ZOOM } from "../../constants.js";
import { state, world } from "../../state.js";
import { isPixiBatchableParticle } from "../../effects.js";
import {
  isPixiBatchableEnemyProjectile,
  isPixiBatchableEnemy,
  isPixiBatchablePlayerProjectile,
  render,
  renderScreenOverlay,
  resizeCanvas,
  viewport,
} from "../renderer.js";
import { framePerformance } from "../performanceMonitor.js";
import { createDecorativeEnemy, decorativeEnemyIds } from "../enemyRegistry.js";
import { activeWaveEffect } from "../waveScenarios.js";

const PIXI_MODULE_PATH = "../../../vendor/pixi/pixi.min.mjs";

export class PixiBackend {
  constructor() {
    this.name = "pixi-webgl";
    this.app = null;
    this.canvas = null;
    this.baseCanvas = null;
    this.overlayCanvas = null;
    this.baseCtx = null;
    this.overlayCtx = null;
    this.baseTexture = null;
    this.overlayTexture = null;
    this.baseSprite = null;
    this.overlaySprite = null;
    this.layers = {};
    this.layerPools = {};
    this.layerActive = {};
    this.layerNext = {};
    this.visualHandles = new WeakMap();
    this.visualFrameId = 0;
    this.glyphTextures = new Map();
    this.enemyTextures = new Map();
    this.enemyAtlasTextures = [];
    this.runTextures = [];
    this.PIXI = null;
    this.contextLost = false;
    this.frameCounts = {};
    this.onContextLost = null;
    this.onContextRestored = null;
  }

  async init(canvas) {
    this.canvas = canvas;
    this.PIXI = await import(PIXI_MODULE_PATH);
    const { Application, Container, Sprite, Texture } = this.PIXI;
    this.app = new Application();
    await this.app.init({
      canvas,
      autoStart: false,
      preference: "webgl",
      width: Math.max(320, window.innerWidth),
      height: Math.max(420, window.innerHeight),
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: false,
      background: "#060912",
      powerPreference: "high-performance",
    });

    this.baseCanvas = document.createElement("canvas");
    this.overlayCanvas = document.createElement("canvas");
    this.baseCtx = this.baseCanvas.getContext("2d", { alpha: false });
    this.overlayCtx = this.overlayCanvas.getContext("2d", { alpha: true });
    if (!this.baseCtx || !this.overlayCtx) throw new Error("Offscreen Canvas 2D context is unavailable");

    this.resize();
    this.baseTexture = Texture.from(this.baseCanvas);
    this.overlayTexture = Texture.from(this.overlayCanvas);
    this.baseSprite = new Sprite(this.baseTexture);
    this.overlaySprite = new Sprite(this.overlayTexture);

    this.layers.root = new Container({ label: "pixi-high-volume-root" });
    this.layers.drops = this.createParticleLayer("drops", "normal");
    this.layers.playerProjectiles = this.createParticleLayer("player-projectiles", "add");
    this.layers.enemies = this.createParticleLayer("enemies", "normal");
    this.layers.enemyProjectiles = this.createParticleLayer("enemy-projectiles", "add");
    this.layers.particles = this.createParticleLayer("particles", "add");
    this.layers.root.addChild(this.layers.drops, this.layers.playerProjectiles, this.layers.enemies, this.layers.enemyProjectiles, this.layers.particles);
    this.app.stage.addChild(this.baseSprite, this.layers.root, this.overlaySprite);
    this.syncScreenSprites();

    this.onContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.baseTexture?.source?.update();
      this.overlayTexture?.source?.update();
    };
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
  }

  createParticleLayer(label, blendMode) {
    const { ParticleContainer } = this.PIXI;
    const layer = new ParticleContainer({
      label,
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        color: true,
      },
    });
    layer.blendMode = blendMode;
    this.layerPools[label] = [];
    this.layerActive[label] = [];
    this.layerNext[label] = [];
    return layer;
  }

  resize() {
    if (!this.baseCanvas || !this.app) return;
    resizeCanvas(this.baseCanvas, this.baseCtx);
    this.overlayCanvas.width = this.baseCanvas.width;
    this.overlayCanvas.height = this.baseCanvas.height;
    this.overlayCanvas.style.width = `${viewport.width}px`;
    this.overlayCanvas.style.height = `${viewport.height}px`;
    this.overlayCtx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    this.overlayCtx.imageSmoothingEnabled = false;
    this.app.renderer.resize(viewport.width, viewport.height);
    this.syncScreenSprites();
  }

  syncScreenSprites() {
    for (const sprite of [this.baseSprite, this.overlaySprite]) {
      if (!sprite) continue;
      sprite.width = viewport.width;
      sprite.height = viewport.height;
    }
  }

  async prepareRun(context, onProgress = () => {}) {
    this.releaseRunTextures();
    onProgress(0.2, "生成 Pixi 公共纹理");
    this.ensureGlyphTextures();
    this.ensureEnemyTextures((prepared, total) => {
      onProgress(0.2 + prepared / Math.max(1, total) * 0.35, `烘焙敌人纹理 ${prepared}/${total}`);
    });
    const mapCanvas = context?.map?.staticCache?.canvas;
    if (mapCanvas) {
      const mapTexture = this.PIXI.Texture.from(mapCanvas);
      mapTexture.label = "prepared-map-static-cache";
      mapTexture.source?.update();
      this.runTextures.push(mapTexture);
    }
    onProgress(0.65, "上传战斗纹理");
    for (const texture of [...this.glyphTextures.values(), ...this.enemyAtlasTextures]) texture.source?.update();
    this.baseTexture?.source?.update();
    this.overlayTexture?.source?.update();
    const prepare = this.app.renderer.prepare;
    if (prepare?.upload) {
      for (const texture of [...this.glyphTextures.values(), ...this.enemyAtlasTextures, ...this.runTextures]) {
        await prepare.upload(texture);
      }
    }
    this.app.render();
    onProgress(1, "Pixi 渲染器已就绪");
  }

  renderFrame() {
    if (this.contextLost) return null;
    framePerformance.begin("render");
    const combat = state.mode !== "menu" && state.mode !== "lobby" && !state.lobby?.active;
    const frame = render(this.baseCtx, combat ? {
      skipDrops: true,
      batchPlayerProjectile: isPixiBatchablePlayerProjectile,
      batchEnemyProjectile: isPixiBatchableEnemyProjectile,
      batchEnemy: isPixiBatchableEnemy,
      batchParticle: isPixiBatchableParticle,
      skipScreenOverlay: true,
    } : {});

    if (combat && frame) {
      this.layers.root.visible = true;
      this.syncDrops(frame);
      this.syncProjectiles(frame);
      this.syncEnemies(frame);
      this.syncParticles(frame);
      this.clearOverlay();
      renderScreenOverlay(this.overlayCtx, frame);
    } else {
      this.layers.root.visible = false;
      this.clearOverlay();
    }

    this.baseTexture.source.update();
    this.overlayTexture.source.update();
    this.app.render();
    framePerformance.end("render");
    return frame;
  }

  clearOverlay() {
    this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlayCtx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  }

  syncDrops(frame) {
    const particles = [];
    for (const gem of world.gems) {
      if (!this.isVisible(gem, frame, 40)) continue;
      particles.push({
        source: gem,
        x: gem.x,
        y: gem.y + Math.sin(state.time * 6 + (gem.phase || 0)) * 2,
        radius: 7,
        rotation: Math.PI / 4,
        tint: gem.value >= 15 ? 0xb48cff : gem.value >= 8 ? 0x77ff8a : 0x42e8ff,
        texture: this.glyphTexture("diamond"),
      });
    }
    for (const coin of world.coins) {
      if (!this.isVisible(coin, frame, 40)) continue;
      particles.push({
        source: coin,
        x: coin.x,
        y: coin.y,
        radius: coin.value >= 5 ? 6 : 5,
        rotation: 0,
        tint: 0xffd166,
        texture: this.glyphTexture("coin"),
      });
    }
    this.syncParticleLayer(this.layers.drops, "drops", particles, frame);
  }

  syncProjectiles(frame) {
    const playerParticles = [];
    for (const projectile of world.projectiles) {
      if (!isPixiBatchablePlayerProjectile(projectile) || !this.isVisible(projectile, frame, 72)) continue;
      playerParticles.push({
        source: projectile,
        x: projectile.x,
        y: projectile.y,
        radius: Math.max(4, projectile.r || 5) * 2.2,
        rotation: (projectile.angle || 0) + Math.PI / 4,
        tint: colorToNumber(projectile.color, 0xffffff),
        alpha: projectile.alpha ?? 1,
        texture: this.glyphTexture(projectile.shape === "droneBolt" ? "bolt" : "diamondGlow"),
      });
    }
    this.syncParticleLayer(this.layers.playerProjectiles, "player-projectiles", playerParticles, frame);

    const enemyParticles = [];
    for (const projectile of world.enemyProjectiles) {
      if (!isPixiBatchableEnemyProjectile(projectile) || !this.isVisible(projectile, frame, 80)) continue;
      enemyParticles.push({
        source: projectile,
        x: projectile.x,
        y: projectile.y,
        radius: Math.max(4, projectile.r || 6) * 2.1,
        rotation: projectile.angle ?? Math.atan2(projectile.vy || 0, projectile.vx || 1),
        tint: colorToNumber(projectile.color, 0xff4d6d),
        alpha: projectile.alpha ?? 1,
        texture: this.glyphTexture(projectile.shape === "laser" ? "bolt" : "orbGlow"),
      });
    }
    this.syncParticleLayer(this.layers.enemyProjectiles, "enemy-projectiles", enemyParticles, frame);
  }

  syncEnemies(frame) {
    const particles = [];
    for (const enemy of world.enemies) {
      if (!isPixiBatchableEnemy(enemy) || !this.isVisible(enemy, frame, (enemy.r || 16) + 80)) continue;
      const frames = this.enemyTextures.get(enemy.type);
      if (!frames?.length) continue;
      const frameIndex = Math.abs(Math.floor((enemy.anim || 0) / (Math.PI * 2) * frames.length)) % frames.length;
      const texture = frames[frameIndex];
      const miniScale = activeWaveEffect("mini_overdrive") ? 0.5 : 1;
      particles.push({
        source: enemy,
        x: enemy.x,
        y: enemy.y,
        displayWidth: texture.width * CAMERA_ZOOM * miniScale,
        displayHeight: texture.height * CAMERA_ZOOM * miniScale,
        scaleXSign: enemy.flip < 0 ? -1 : 1,
        rotation: 0,
        tint: enemy.flash > 0 ? 0xffd9e1 : enemy.freezeTimer > 0 ? 0xbcecff : 0xffffff,
        alpha: enemy.alpha ?? 1,
        texture,
      });
    }
    this.syncParticleLayer(this.layers.enemies, "enemies", particles, frame);
  }

  syncParticles(frame) {
    const particles = [];
    for (const item of world.particles) {
      if (!isPixiBatchableParticle(item) || !this.isVisible(item, frame, 80)) continue;
      const alpha = Math.max(0, Math.min(1, item.life / Math.max(0.001, item.maxLife))) * (item.alpha ?? 1);
      particles.push({
        source: item,
        x: item.x,
        y: item.y,
        radius: Math.max(1.5, item.size || 3),
        rotation: item.angle ?? Math.atan2(item.vy || 0, item.vx || 1),
        tint: item.kind === "dust" ? 0x8fa2a0 : colorToNumber(item.color, 0xffffff),
        alpha,
        texture: this.glyphTexture(item.kind === "ember" ? "bolt" : item.kind === "mote" ? "orbGlow" : "squareGlow"),
      });
    }
    this.syncParticleLayer(this.layers.particles, "particles", particles, frame);
  }

  syncParticleLayer(layer, poolKey, items, frame) {
    const freePool = this.layerPools[poolKey];
    const activeHandles = this.layerActive[poolKey];
    const nextHandles = this.layerNext[poolKey];
    nextHandles.length = 0;
    const { Particle } = this.PIXI;
    const frameId = ++this.visualFrameId;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let handle = this.visualHandles.get(item.source);
      if (!handle || handle.poolKey !== poolKey) {
        const particle = freePool.pop() || new Particle(this.glyphTexture("diamond"));
        particle.anchorX = 0.5;
        particle.anchorY = 0.5;
        handle = { source: item.source, particle, poolKey, seenFrame: frameId };
        this.visualHandles.set(item.source, handle);
        layer.addParticle(particle);
      }
      handle.seenFrame = frameId;
      nextHandles.push(handle);
      const particle = handle.particle;
      const screen = this.toScreen(item.x, item.y, frame);
      const textureWidth = Math.max(1, item.texture.width || 32);
      const textureHeight = Math.max(1, item.texture.height || textureWidth);
      const displayWidth = item.displayWidth ?? item.radius * 2 * CAMERA_ZOOM;
      const displayHeight = item.displayHeight ?? item.radius * 2 * CAMERA_ZOOM;
      particle.texture = item.texture;
      particle.x = screen.x;
      particle.y = screen.y;
      particle.scaleX = displayWidth / textureWidth * (item.scaleXSign || 1);
      particle.scaleY = displayHeight / textureHeight;
      particle.rotation = item.rotation || 0;
      particle.tint = item.tint;
      particle.alpha = item.alpha ?? 1;
    }
    for (const handle of activeHandles) {
      if (handle.seenFrame === frameId) continue;
      layer.removeParticle(handle.particle);
      this.visualHandles.delete(handle.source);
      freePool.push(handle.particle);
    }
    activeHandles.length = 0;
    activeHandles.push(...nextHandles);
    layer.update();
    this.frameCounts[poolKey] = items.length;
  }

  ensureGlyphTextures() {
    for (const name of ["diamond", "coin", "diamondGlow", "orbGlow", "bolt", "squareGlow"]) this.glyphTexture(name);
  }

  ensureEnemyTextures(onProgress) {
    const ids = decorativeEnemyIds();
    if (this.enemyTextures.size) {
      onProgress?.(ids.length, ids.length);
      return;
    }
    const frameCount = 8;
    const cellSize = 224;
    const columns = 18;
    const slotCount = ids.length * frameCount;
    const rows = Math.ceil(slotCount / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const { Rectangle, Texture } = this.PIXI;
    const enemies = ids.map((id) => createDecorativeEnemy(id, 0, 0));
    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
      const enemy = enemies[enemyIndex];
      if (!enemy) continue;
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const slot = enemyIndex * frameCount + frameIndex;
        const column = slot % columns;
        const row = Math.floor(slot / columns);
        ctx.save();
        ctx.translate(column * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
        enemy.x = 0;
        enemy.y = 0;
        enemy.anim = frameIndex / frameCount * Math.PI * 2;
        enemy.flip = 1;
        enemy.draw(ctx);
        ctx.restore();
      }
      onProgress?.(enemyIndex + 1, ids.length);
    }
    const atlasTexture = Texture.from(canvas);
    atlasTexture.label = "enemy-animation-atlas";
    this.enemyAtlasTextures.push(atlasTexture);
    for (let enemyIndex = 0; enemyIndex < ids.length; enemyIndex++) {
      const frames = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const slot = enemyIndex * frameCount + frameIndex;
        const column = slot % columns;
        const row = Math.floor(slot / columns);
        const texture = new Texture({
          source: atlasTexture.source,
          frame: new Rectangle(column * cellSize, row * cellSize, cellSize, cellSize),
        });
        texture.label = `enemy-${ids[enemyIndex]}-${frameIndex}`;
        frames.push(texture);
      }
      this.enemyTextures.set(ids[enemyIndex], frames);
    }
  }

  allEnemyTextures() {
    return [...this.enemyTextures.values()].flat();
  }

  glyphTexture(name) {
    let texture = this.glyphTextures.get(name);
    if (texture) return texture;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.translate(32, 32);
    if (name === "coin") drawCoinGlyph(ctx);
    else if (name === "orbGlow") drawOrbGlyph(ctx);
    else if (name === "bolt") drawBoltGlyph(ctx);
    else if (name === "squareGlow") drawSquareGlyph(ctx);
    else drawDiamondGlyph(ctx, name === "diamondGlow");
    texture = this.PIXI.Texture.from(canvas);
    this.glyphTextures.set(name, texture);
    return texture;
  }

  isVisible(object, frame, margin) {
    return object.x >= frame.camX - margin
      && object.x <= frame.camX + frame.viewW + margin
      && object.y >= frame.camY - margin
      && object.y <= frame.camY + frame.viewH + margin;
  }

  toScreen(x, y, frame) {
    return {
      x: (x - frame.camX) * CAMERA_ZOOM,
      y: (y - frame.camY) * CAMERA_ZOOM,
    };
  }

  releaseRun() {
    for (const [key, freePool] of Object.entries(this.layerPools)) {
      const layer = this.layers[key === "player-projectiles" ? "playerProjectiles" : key === "enemy-projectiles" ? "enemyProjectiles" : key];
      if (layer) {
        for (const handle of this.layerActive[key]) {
          layer.removeParticle(handle.particle);
          this.visualHandles.delete(handle.source);
          freePool.push(handle.particle);
        }
      }
      this.layerActive[key].length = 0;
    }
    this.releaseRunTextures();
    this.frameCounts = {};
  }

  releaseRunTextures() {
    for (const texture of this.runTextures) texture.destroy();
    this.runTextures.length = 0;
  }

  destroy() {
    this.canvas?.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.onContextRestored);
    for (const texture of this.glyphTextures.values()) texture.destroy();
    this.glyphTextures.clear();
    for (const texture of this.allEnemyTextures()) texture.destroy(false);
    this.enemyTextures.clear();
    for (const texture of this.enemyAtlasTextures) texture.destroy(true);
    this.enemyAtlasTextures.length = 0;
    this.releaseRunTextures();
    this.baseTexture?.destroy();
    this.overlayTexture?.destroy();
    this.app?.destroy({ removeView: false }, { children: true });
    this.app = null;
  }

  getStats() {
    return {
      backend: this.name,
      contextLost: this.contextLost,
      particles: { ...this.frameCounts },
      glyphTextures: this.glyphTextures.size,
      viewport: { ...viewport },
      ...framePerformance.getStats(),
    };
  }
}

function colorToNumber(color, fallback) {
  if (typeof color === "number") return color;
  if (typeof color !== "string") return fallback;
  const value = color.trim();
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  if (shortHex) return Number.parseInt(`${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`, 16);
  const longHex = /^#([\da-f]{6})/i.exec(value);
  if (longHex) return Number.parseInt(longHex[1], 16);
  const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(value);
  if (rgb) return (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]);
  return fallback;
}

function drawDiamondGlyph(ctx, glow) {
  if (glow) {
    const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 29);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-32, -32, 64, 64);
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(11, 0);
  ctx.lineTo(0, 15);
  ctx.lineTo(-11, 0);
  ctx.closePath();
  ctx.fill();
}

function drawCoinGlyph(ctx) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

function drawOrbGlyph(ctx) {
  const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-32, -32, 64, 64);
}

function drawBoltGlyph(ctx) {
  ctx.rotate(-Math.PI / 4);
  const gradient = ctx.createLinearGradient(-28, 0, 24, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "#ffffff");
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
}

function drawSquareGlyph(ctx) {
  const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, 25);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.82)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-28, -28, 56, 56);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-7, -7, 14, 14);
}
