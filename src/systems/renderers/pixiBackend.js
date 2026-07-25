import { CAMERA_ZOOM } from "../../constants.js";
import { state, world } from "../../state.js";
import { isPixiBatchableParticle } from "../../effects.js";
import {
  isPixiBatchableEnemyProjectile,
  isPixiBatchableEnemy,
  isPixiBatchableHazard,
  isPixiBatchablePlayerProjectile,
  render,
  renderScreenOverlay,
  resizeCanvas,
  viewport,
} from "../renderer.js";
import { framePerformance } from "../performanceMonitor.js";
import { availableEnemyIdsForWave, createDecorativeEnemy, decorativeEnemyIds } from "../enemyRegistry.js";
import { activeWaveEffect } from "../waveScenarios.js";
import {
  applyEnemyBakePose,
  enemyVisualProfile,
  enemyVisualState,
  ENEMY_VISUAL_CLIPS,
  projectileVisualProfile,
  projectileVisualIds,
} from "../visualProfiles.js";

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
    this.layerByPoolKey = {};
    this.itemScratchPools = {};
    this.itemScratchLists = {};
    this.visualHandles = new WeakMap();
    this.visualFrameId = 0;
    this.glyphTextures = new Map();
    this.enemyTextures = new Map();
    this.enemyAtlasTextures = [];
    this.enemyAtlasSignature = "";
    this.specialVisualSources = new WeakMap();
    this.colorCache = new Map();
    this.clipScratch = new Float64Array(4);
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
    this.layers.enemyTethers = this.createParticleLayer("enemy-tethers", "add");
    this.layers.enemies = this.createParticleLayer("enemies", "normal");
    this.layers.wormSegments = this.createParticleLayer("worm-segments", "normal");
    this.layers.enemyProjectiles = this.createParticleLayer("enemy-projectiles", "add");
    this.layers.bossHazards = this.createParticleLayer("boss-hazards", "add");
    this.layers.particles = this.createParticleLayer("particles", "add");
    this.layers.root.addChild(
      this.layers.drops,
      this.layers.playerProjectiles,
      this.layers.enemyTethers,
      this.layers.enemies,
      this.layers.wormSegments,
      this.layers.enemyProjectiles,
      this.layers.bossHazards,
      this.layers.particles,
    );
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
    this.layerByPoolKey[label] = layer;
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
    const enemyIds = this.enemyIdsForRun(context);
    this.ensureEnemyTextures(enemyIds, (prepared, total) => {
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
      batchHazard: isPixiBatchableHazard,
      batchParticle: isPixiBatchableParticle,
      skipScreenOverlay: true,
    } : {});

    if (combat && frame) {
      this.layers.root.visible = true;
      this.syncDrops(frame);
      this.syncProjectiles(frame);
      this.syncEnemies(frame);
      this.syncBossHazards(frame);
      this.syncParticles(frame);
      this.clearOverlay();
      renderScreenOverlay(this.overlayCtx, frame);
    } else {
      this.layers.root.visible = false;
      this.clearOverlay();
    }

    framePerformance.begin("canvasTextureUpload");
    this.baseTexture.source.update();
    this.overlayTexture.source.update();
    framePerformance.end("canvasTextureUpload");
    this.app.render();
    framePerformance.end("render");
    return frame;
  }

  clearOverlay() {
    this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlayCtx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  }

  beginItems(key) {
    const list = this.itemScratchLists[key] || (this.itemScratchLists[key] = []);
    list.length = 0;
    return list;
  }

  nextItem(key, list, source) {
    const pool = this.itemScratchPools[key] || (this.itemScratchPools[key] = []);
    const index = list.length;
    const item = pool[index] || (pool[index] = {});
    item.source = source;
    item.x = 0;
    item.y = 0;
    item.radius = undefined;
    item.displayWidth = undefined;
    item.displayHeight = undefined;
    item.scaleXSign = 1;
    item.rotation = 0;
    item.tint = 0xffffff;
    item.alpha = 1;
    item.texture = null;
    list.push(item);
    return item;
  }

  syncDrops(frame) {
    const particles = this.beginItems("drop-items");
    for (const gem of world.gems) {
      if (!this.isVisible(gem, frame, 40)) continue;
      const tier = gem.value >= 15 ? "high" : gem.value >= 8 ? "mid" : "low";
      const magnetized = distanceSq(gem.x, gem.y, state.player.x, state.player.y) < state.player.magnet ** 2;
      const animation = Math.floor((state.time * (magnetized ? 15 : 9) + (gem.phase || 0)) % 8);
      const item = this.nextItem("drop-items", particles, gem);
      item.x = gem.x;
      item.y = gem.y + Math.sin(state.time * 6 + (gem.phase || 0)) * 2;
      item.displayWidth = (tier === "high" ? 23 : tier === "mid" ? 20 : 17) * CAMERA_ZOOM * (magnetized ? 1.18 : 1);
      item.displayHeight = (tier === "high" ? 28 : tier === "mid" ? 25 : 22) * CAMERA_ZOOM * (magnetized ? 0.88 : 1);
      item.rotation = magnetized ? Math.atan2(state.player.y - gem.y, state.player.x - gem.x) + Math.PI / 2 : 0;
      item.texture = this.glyphTexture(`xp-${tier}:${animation}`);
    }
    for (const coin of world.coins) {
      if (!this.isVisible(coin, frame, 40)) continue;
      const tier = coin.value >= 8 ? "high" : coin.value >= 4 ? "mid" : "low";
      const magnetRadius = state.player.magnet * 1.12;
      const magnetized = distanceSq(coin.x, coin.y, state.player.x, state.player.y) < magnetRadius * magnetRadius;
      const animation = Math.floor((state.time * (magnetized ? 18 : 10) + (coin.phase || 0)) % 8);
      const item = this.nextItem("drop-items", particles, coin);
      item.x = coin.x;
      item.y = coin.y + Math.sin(state.time * 5.2 + (coin.phase || 0)) * 1.5;
      item.displayWidth = (tier === "high" ? 24 : tier === "mid" ? 21 : 18) * CAMERA_ZOOM * (magnetized ? 1.16 : 1);
      item.displayHeight = (tier === "high" ? 24 : tier === "mid" ? 21 : 18) * CAMERA_ZOOM * (magnetized ? 0.82 : 1);
      item.rotation = magnetized ? Math.atan2(state.player.y - coin.y, state.player.x - coin.x) : 0;
      item.texture = this.glyphTexture(`coin-${tier}:${animation}`);
    }
    this.syncParticleLayer(this.layers.drops, "drops", particles, frame);
  }

  syncProjectiles(frame) {
    const playerParticles = this.beginItems("player-projectile-items");
    for (const projectile of world.projectiles) {
      if (!isPixiBatchablePlayerProjectile(projectile) || !this.isVisible(projectile, frame, 72)) continue;
      const item = this.nextItem("player-projectile-items", playerParticles, projectile);
      item.x = projectile.x;
      item.y = projectile.y;
      item.radius = Math.max(4, projectile.r || 5) * 2.2;
      item.rotation = (projectile.angle || 0) + Math.PI / 4;
      item.tint = this.colorNumber(projectile.color, 0xffffff);
      item.alpha = projectile.alpha ?? 1;
      item.texture = this.glyphTexture(projectile.shape === "droneBolt" ? "bolt" : "diamondGlow");
    }
    this.syncParticleLayer(this.layers.playerProjectiles, "player-projectiles", playerParticles, frame);

    const enemyParticles = this.beginItems("enemy-projectile-items");
    for (const projectile of world.enemyProjectiles) {
      if (!isPixiBatchableEnemyProjectile(projectile) || !this.isVisible(projectile, frame, 80)) continue;
      const profile = projectileVisualProfile(projectile);
      const frameIndex = Math.abs(Math.floor((state.time * 14 + (projectile.spin || 0)) % profile.frames));
      const velocityAngle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
      const rotation = profile.rotation === "spin"
        ? (projectile.spin || 0) + state.time * 8
        : profile.rotation === "fixed" ? 0 : velocityAngle;
      const item = this.nextItem("enemy-projectile-items", enemyParticles, projectile);
      item.x = projectile.x;
      item.y = projectile.y;
      item.radius = Math.max(4, projectile.r || 6) * profile.scale;
      item.rotation = rotation;
      item.tint = this.colorNumber(projectile.color, 0xff4d6d);
      item.alpha = projectile.alpha ?? 1;
      item.texture = this.glyphTexture(`${profile.texture}:${frameIndex}`);
    }
    this.syncParticleLayer(this.layers.enemyProjectiles, "enemy-projectiles", enemyParticles, frame);
  }

  syncEnemies(frame) {
    const particles = this.beginItems("enemy-items");
    const wormParticles = this.beginItems("worm-items");
    const tetherParticles = this.beginItems("tether-items");
    for (const enemy of world.enemies) {
      if (!isPixiBatchableEnemy(enemy) || !this.isVisible(enemy, frame, (enemy.r || 16) + 80)) continue;
      if (enemy.type === "mech_worm") {
        this.appendWormParticles(enemy, wormParticles);
        continue;
      }
      const clips = this.enemyTextures.get(enemy.type);
      if (!clips) continue;
      const visual = enemyVisualState(enemy);
      const frames = clips.get(visual.clip) || clips.get("move");
      if (!frames?.length) continue;
      const frameIndex = Math.min(frames.length - 1, Math.floor(visual.progress * frames.length));
      const texture = frames[Math.max(0, frameIndex)];
      const miniScale = activeWaveEffect("mini_overdrive") ? 0.5 : 1;
      let poseScaleX = 1;
      let poseScaleY = 1;
      let poseRotation = 0;
      let poseOffset = 0;
      if (visual.clip === "windup") {
        const compression = Math.sin(visual.progress * Math.PI * 0.5);
        poseScaleX = 1 + compression * 0.09;
        poseScaleY = 1 - compression * 0.1;
        poseRotation = -visual.facing * compression * 0.065;
        poseOffset = -compression * Math.min(5, (enemy.r || 16) * 0.2);
      } else if (visual.clip === "attack") {
        const recoil = Math.sin(visual.progress * Math.PI);
        poseScaleX = 1 + recoil * 0.14;
        poseScaleY = 1 - recoil * 0.08;
        poseRotation = visual.facing * recoil * 0.09;
        poseOffset = recoil * Math.min(8, (enemy.r || 16) * 0.34);
      } else if (visual.clip === "recover") {
        const settle = Math.sin(visual.progress * Math.PI * 3) * Math.exp(-visual.progress * 3);
        poseScaleX = 1 + settle * 0.07;
        poseScaleY = 1 - settle * 0.06;
        poseRotation = visual.facing * settle * 0.055;
      } else if (visual.clip === "hurt") {
        const stagger = Math.sin(visual.progress * Math.PI);
        poseScaleX = 1 + stagger * 0.08;
        poseScaleY = 1 - stagger * 0.08;
        poseRotation = -visual.facing * stagger * 0.12;
        poseOffset = -stagger * Math.min(6, (enemy.r || 16) * 0.28);
      }
      const item = this.nextItem("enemy-items", particles, enemy);
      item.x = enemy.x + Math.cos(visual.heading || 0) * poseOffset;
      item.y = enemy.y + Math.sin(visual.heading || 0) * poseOffset;
      item.displayWidth = texture.width * CAMERA_ZOOM * miniScale * poseScaleX;
      item.displayHeight = texture.height * CAMERA_ZOOM * miniScale * poseScaleY;
      item.scaleXSign = visual.facing < 0 ? -1 : 1;
      item.rotation = poseRotation;
      item.tint = enemy.flash > 0 ? 0xffd9e1 : enemy.freezeTimer > 0 ? 0xbcecff : 0xffffff;
      item.alpha = enemy.alpha ?? 1;
      item.texture = texture;
      if (enemy.type === "blackhole_mage" && enemy.state === "channel" && world.blackhole) {
        const dx = world.blackhole.x - enemy.x;
        const dy = world.blackhole.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        const tether = this.nextItem("tether-items", tetherParticles, this.specialSource(enemy, "tether"));
        tether.x = enemy.x + dx * 0.5;
        tether.y = enemy.y + dy * 0.5;
        tether.displayWidth = distance * CAMERA_ZOOM;
        tether.displayHeight = 9 * CAMERA_ZOOM;
        tether.rotation = Math.atan2(dy, dx);
        tether.tint = 0xb48cff;
        tether.alpha = 0.72;
        tether.texture = this.glyphTexture("tether");
      }
    }
    this.syncParticleLayer(this.layers.enemyTethers, "enemy-tethers", tetherParticles, frame);
    this.syncParticleLayer(this.layers.enemies, "enemies", particles, frame);
    this.syncParticleLayer(this.layers.wormSegments, "worm-segments", wormParticles, frame);
  }

  appendWormParticles(enemy, target) {
    const miniScale = activeWaveEffect("mini_overdrive") ? 0.5 : 1;
    for (let index = enemy.segments.length - 1; index >= 0; index--) {
      const segment = enemy.segments[index];
      const taper = Math.max(0.58, 0.82 - index * 0.018);
      const item = this.nextItem("worm-items", target, segment);
      item.x = segment.x;
      item.y = segment.y;
      item.displayWidth = enemy.r * taper * 2.05 * CAMERA_ZOOM * miniScale;
      item.displayHeight = enemy.r * taper * 1.42 * CAMERA_ZOOM * miniScale;
      item.rotation = segment.angle;
      item.tint = enemy.flash > 0 ? 0xffffff : index % 2 ? 0xd9b8ff : 0xffffff;
      item.texture = this.glyphTexture("wormSegment");
    }
    const head = this.nextItem("worm-items", target, enemy);
    head.x = enemy.x;
    head.y = enemy.y;
    head.displayWidth = enemy.r * 2.9 * CAMERA_ZOOM * miniScale;
    head.displayHeight = enemy.r * 2.05 * CAMERA_ZOOM * miniScale;
    head.rotation = enemy.headAngle || 0;
    head.texture = this.glyphTexture(enemy.state === "charge" || enemy.state === "strike" ? "wormHeadHot" : "wormHead");
  }

  syncBossHazards(frame) {
    framePerformance.begin("hazardSync");
    const particles = this.beginItems("boss-hazard-items");
    for (const hazard of world.hazards) {
      if (!isPixiBatchableHazard(hazard)) continue;
      const armed = (hazard.armTime || 0) <= 0;
      const alpha = Math.max(0, Math.min(1, hazard.life / Math.max(0.001, hazard.maxLife || hazard.life || 1)));
      if (hazard.kind === "convict_ball_slam") {
        if (!this.isVisible(hazard, frame, (hazard.r || 80) + 60)) continue;
        const item = this.nextItem("boss-hazard-items", particles, hazard);
        item.x = hazard.x;
        item.y = hazard.y;
        item.displayWidth = (hazard.r || 80) * 2.3 * CAMERA_ZOOM;
        item.displayHeight = (hazard.r || 80) * 2.3 * CAMERA_ZOOM;
        item.rotation = state.time * (armed ? 2.2 : 0.7);
        item.tint = this.colorNumber(armed ? hazard.color : hazard.coreColor, 0xffd166);
        item.alpha = alpha;
        item.texture = this.glyphTexture(armed ? "hazardSlamActive" : "hazardSlamWarning");
        continue;
      }
      if (hazard.kind === "convict_chain_arc") {
        const end = armed ? hazard.currentAngle ?? hazard.startAngle : hazard.startAngle + hazard.sweep;
        const start = hazard.startAngle;
        const samples = Math.max(8, Math.ceil(Math.abs(end - start) * (hazard.radius || 1) / 18));
        for (let index = 0; index <= samples; index++) {
          const t = index / samples;
          const angle = start + (end - start) * t;
          const x = hazard.centerX + Math.cos(angle) * hazard.radius;
          const y = hazard.centerY + Math.sin(angle) * hazard.radius;
          if (!this.isPointVisible(x, y, frame, 40)) continue;
          const item = this.nextItem("boss-hazard-items", particles, this.specialSource(hazard, `arc-${index}`));
          item.x = x;
          item.y = y;
          item.radius = armed ? 9 : 6;
          item.rotation = angle + Math.PI / 2 + (index % 2 ? Math.PI / 2 : 0);
          item.tint = this.colorNumber(armed ? hazard.color : hazard.coreColor, 0xff9d52);
          item.alpha = armed ? alpha : 0.58;
          item.texture = this.glyphTexture(armed ? "chainLink" : "warningDash");
        }
        continue;
      }
      if (hazard.kind === "convict_chain_line") {
        const lines = hazard.lines || [{ x1: hazard.x1, y1: hazard.y1, x2: hazard.x2, y2: hazard.y2 }];
        lines.forEach((line, lineIndex) => this.appendHazardLine(particles, hazard, line, lineIndex, frame, {
          armed,
          alpha,
          chain: true,
          color: hazard.color,
          coreColor: hazard.coreColor,
          width: hazard.width,
        }));
        continue;
      }
      if (hazard.kind === "convict_chain_path") {
        for (let index = 1; index < (hazard.points || []).length; index++) {
          this.appendHazardLine(particles, hazard, {
            x1: hazard.points[index - 1].x,
            y1: hazard.points[index - 1].y,
            x2: hazard.points[index].x,
            y2: hazard.points[index].y,
          }, index, frame, {
            armed,
            alpha,
            chain: true,
            color: hazard.color,
            coreColor: hazard.coreColor,
            width: hazard.width,
          });
        }
        continue;
      }
      if (hazard.kind === "dark_entity_field") {
        if (hazard.variant === "negative_star") {
          if (!this.isVisible(hazard, frame, (hazard.r || 72) + 80)) continue;
          const item = this.nextItem("boss-hazard-items", particles, hazard);
          item.x = hazard.x;
          item.y = hazard.y;
          item.displayWidth = (hazard.r || 72) * 2.6 * CAMERA_ZOOM;
          item.displayHeight = (hazard.r || 72) * 2.6 * CAMERA_ZOOM;
          item.rotation = state.time * (armed ? 2.8 : 0.7);
          item.tint = this.colorNumber(armed ? hazard.color : hazard.warningColor, 0xb48cff);
          item.alpha = alpha;
          item.texture = this.glyphTexture(armed ? "negativeStarActive" : "negativeStarWarning");
          continue;
        }
        const lines = darkHazardLines(hazard);
        lines.forEach((line, lineIndex) => this.appendHazardLine(particles, hazard, line, lineIndex, frame, {
          armed,
          alpha,
          chain: false,
          color: hazard.color,
          coreColor: "#ffffff",
          warningColor: hazard.warningColor,
          width: line.width ?? hazard.width,
        }));
      }
    }
    this.syncParticleLayer(this.layers.bossHazards, "boss-hazards", particles, frame);
    framePerformance.end("hazardSync");
  }

  appendHazardLine(target, hazard, line, lineIndex, frame, options) {
    if (!Number.isFinite(line.x1) || !Number.isFinite(line.y1) || !Number.isFinite(line.x2) || !Number.isFinite(line.y2)) return;
    const clipped = this.clipScratch;
    if (!clipLineToView(line, frame, 90, clipped)) return;
    const dx = clipped[2] - clipped[0];
    const dy = clipped[3] - clipped[1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const width = Math.max(3, options.width || 20);
    const glow = this.nextItem("boss-hazard-items", target, this.specialSource(hazard, `line-${lineIndex}-glow`));
    glow.x = (clipped[0] + clipped[2]) * 0.5;
    glow.y = (clipped[1] + clipped[3]) * 0.5;
    glow.displayWidth = length * CAMERA_ZOOM;
    glow.displayHeight = width * (options.armed ? 2.2 : 0.34) * CAMERA_ZOOM;
    glow.rotation = angle;
    glow.tint = this.colorNumber(options.armed ? options.color : options.warningColor || options.coreColor, 0xb48cff);
    glow.alpha = options.armed ? options.alpha * 0.72 : 0.68;
    glow.texture = this.glyphTexture(options.armed ? "hazardBeam" : "warningBeam");
    if (options.armed && !options.chain) {
      const core = this.nextItem("boss-hazard-items", target, this.specialSource(hazard, `line-${lineIndex}-core`));
      core.x = (clipped[0] + clipped[2]) * 0.5;
      core.y = (clipped[1] + clipped[3]) * 0.5;
      core.displayWidth = length * CAMERA_ZOOM;
      core.displayHeight = Math.max(2, width * 0.22) * CAMERA_ZOOM;
      core.rotation = angle;
      core.tint = 0xffffff;
      core.alpha = options.alpha;
      core.texture = this.glyphTexture("hazardCore");
    }
    if (!options.chain) return;
    const spacing = options.armed ? 15 : 24;
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let index = 0; index <= count; index++) {
      const t = index / count;
      const link = this.nextItem("boss-hazard-items", target, this.specialSource(hazard, `line-${lineIndex}-link-${index}`));
      link.x = clipped[0] + dx * t;
      link.y = clipped[1] + dy * t;
      link.radius = options.armed ? 9 : 6;
      link.rotation = angle + (index % 2 ? Math.PI / 2 : 0);
      link.tint = this.colorNumber(options.armed ? options.color : options.coreColor, 0xff9d52);
      link.alpha = options.armed ? options.alpha : 0.58;
      link.texture = this.glyphTexture(options.armed ? "chainLink" : "warningDash");
    }
  }

  specialSource(owner, key) {
    let sources = this.specialVisualSources.get(owner);
    if (!sources) {
      sources = new Map();
      this.specialVisualSources.set(owner, sources);
    }
    let source = sources.get(key);
    if (!source) {
      source = {};
      sources.set(key, source);
    }
    return source;
  }

  colorNumber(color, fallback) {
    if (typeof color !== "string") return colorToNumber(color, fallback);
    const cached = this.colorCache.get(color);
    if (cached != null) return cached;
    const value = colorToNumber(color, fallback);
    this.colorCache.set(color, value);
    return value;
  }

  syncParticles(frame) {
    const particles = this.beginItems("particle-items");
    for (const item of world.particles) {
      if (!isPixiBatchableParticle(item) || !this.isVisible(item, frame, 80)) continue;
      const alpha = Math.max(0, Math.min(1, item.life / Math.max(0.001, item.maxLife))) * (item.alpha ?? 1);
      const descriptor = this.nextItem("particle-items", particles, item);
      descriptor.x = item.x;
      descriptor.y = item.y;
      descriptor.radius = Math.max(1.5, item.size || 3);
      descriptor.rotation = item.angle ?? Math.atan2(item.vy || 0, item.vx || 1);
      descriptor.tint = item.kind === "dust" ? 0x8fa2a0 : this.colorNumber(item.color, 0xffffff);
      descriptor.alpha = alpha;
      descriptor.texture = this.glyphTexture(item.kind === "ember" ? "bolt" : item.kind === "mote" ? "orbGlow" : "squareGlow");
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
    for (let index = 0; index < nextHandles.length; index++) activeHandles.push(nextHandles[index]);
    layer.update();
    this.frameCounts[poolKey] = items.length;
  }

  ensureGlyphTextures() {
    for (const name of ["diamond", "diamondGlow", "orbGlow", "bolt", "squareGlow", "tether", "wormSegment", "wormHead", "wormHeadHot",
      "chainLink", "warningDash", "hazardBeam", "warningBeam", "hazardCore", "hazardSlamActive", "hazardSlamWarning",
      "negativeStarActive", "negativeStarWarning"]) this.glyphTexture(name);
    for (const tier of ["low", "mid", "high"]) {
      for (let frame = 0; frame < 8; frame++) {
        this.glyphTexture(`coin-${tier}:${frame}`);
        this.glyphTexture(`xp-${tier}:${frame}`);
      }
    }
    for (const id of projectileVisualIds()) {
      const profile = projectileVisualProfile(id);
      for (let frame = 0; frame < profile.frames; frame++) this.glyphTexture(`${profile.texture}:${frame}`);
    }
  }

  ensureEnemyTextures(requestedIds, onProgress) {
    const allowed = new Set(decorativeEnemyIds());
    const ids = requestedIds.filter((id) => allowed.has(id) && enemyVisualProfile(id)?.strategy !== "segmented");
    const signature = [...ids].sort().join("|");
    if (this.enemyTextures.size && this.enemyAtlasSignature === signature) {
      onProgress?.(ids.length, ids.length);
      return;
    }
    this.releaseEnemyTextures();
    this.enemyAtlasSignature = signature;
    const cellSize = 128;
    const pageSize = 2048;
    const columns = pageSize / cellSize;
    const slotsPerPage = columns * columns;
    const { Rectangle, Texture } = this.PIXI;
    const slots = [];
    for (const id of ids) {
      const clips = new Map();
      this.enemyTextures.set(id, clips);
      for (const [clip, frameCount] of Object.entries(ENEMY_VISUAL_CLIPS)) {
        const frames = [];
        clips.set(clip, frames);
        for (let frame = 0; frame < frameCount; frame++) slots.push({ id, clip, frame, frameCount, frames });
      }
    }

    const preparedIds = new Set();
    for (let pageStart = 0, pageIndex = 0; pageStart < slots.length; pageStart += slotsPerPage, pageIndex++) {
      const pageSlots = slots.slice(pageStart, pageStart + slotsPerPage);
      const rows = Math.ceil(pageSlots.length / columns);
      const canvas = document.createElement("canvas");
      canvas.width = pageSize;
      canvas.height = rows * cellSize;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      for (let localSlot = 0; localSlot < pageSlots.length; localSlot++) {
        const descriptor = pageSlots[localSlot];
        const enemy = createDecorativeEnemy(descriptor.id, 0, 0);
        if (!enemy) continue;
        const column = localSlot % columns;
        const row = Math.floor(localSlot / columns);
        applyEnemyBakePose(enemy, descriptor.clip, descriptor.frame / descriptor.frameCount);
        ctx.save();
        ctx.translate(column * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
        enemy.x = 0;
        enemy.y = 0;
        enemy.draw(ctx);
        ctx.restore();
        preparedIds.add(descriptor.id);
      }
      const atlasTexture = Texture.from(canvas);
      atlasTexture.label = `enemy-state-atlas-${pageIndex}`;
      this.enemyAtlasTextures.push(atlasTexture);
      for (let localSlot = 0; localSlot < pageSlots.length; localSlot++) {
        const descriptor = pageSlots[localSlot];
        const column = localSlot % columns;
        const row = Math.floor(localSlot / columns);
        const texture = new Texture({
          source: atlasTexture.source,
          frame: new Rectangle(column * cellSize, row * cellSize, cellSize, cellSize),
        });
        texture.label = `enemy-${descriptor.id}-${descriptor.clip}-${descriptor.frame}`;
        descriptor.frames.push(texture);
      }
      onProgress?.(preparedIds.size, ids.length);
    }
  }

  allEnemyTextures() {
    const textures = [];
    for (const clips of this.enemyTextures.values()) {
      for (const frames of clips.values()) textures.push(...frames);
    }
    return textures;
  }

  enemyIdsForRun(context) {
    if (context?.runMode === "menu") return [];
    if (context?.runMode === "random") return decorativeEnemyIds();
    const ids = new Set();
    for (let wave = 1; wave <= 20; wave++) {
      for (const id of availableEnemyIdsForWave(wave)) ids.add(id);
    }
    return ids.size ? [...ids] : decorativeEnemyIds();
  }

  releaseEnemyTextures() {
    for (const texture of this.allEnemyTextures()) texture.destroy(false);
    this.enemyTextures.clear();
    for (const texture of this.enemyAtlasTextures) texture.destroy(true);
    this.enemyAtlasTextures.length = 0;
    this.enemyAtlasSignature = "";
  }

  glyphTexture(name) {
    let texture = this.glyphTextures.get(name);
    if (texture) return texture;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.translate(32, 32);
    const separator = name.lastIndexOf(":");
    const baseName = separator >= 0 ? name.slice(0, separator) : name;
    const frame = separator >= 0 ? Number(name.slice(separator + 1)) || 0 : 0;
    if (baseName.startsWith("coin-")) drawMechanicalCoinGlyph(ctx, baseName.slice(5), frame);
    else if (baseName.startsWith("xp-")) drawExperienceCoreGlyph(ctx, baseName.slice(3), frame);
    else if (baseName === "orbGlow") drawOrbGlyph(ctx);
    else if (baseName === "bolt") drawBoltGlyph(ctx);
    else if (baseName === "squareGlow") drawSquareGlyph(ctx);
    else if (baseName === "tether") drawTetherGlyph(ctx);
    else if (baseName === "wormSegment") drawWormSegmentGlyph(ctx);
    else if (baseName === "wormHead" || baseName === "wormHeadHot") drawWormHeadGlyph(ctx, baseName === "wormHeadHot");
    else if (baseName === "chainLink") drawChainLinkGlyph(ctx);
    else if (baseName === "warningDash") drawWarningDashGlyph(ctx);
    else if (baseName === "hazardBeam" || baseName === "warningBeam" || baseName === "hazardCore") drawHazardBeamGlyph(ctx, baseName);
    else if (baseName === "hazardSlamActive" || baseName === "hazardSlamWarning") drawHazardSlamGlyph(ctx, baseName.endsWith("Active"));
    else if (baseName === "negativeStarActive" || baseName === "negativeStarWarning") drawNegativeStarGlyph(ctx, baseName.endsWith("Active"));
    else if (drawEnemyProjectileGlyph(ctx, baseName, frame)) {}
    else drawDiamondGlyph(ctx, baseName === "diamondGlow");
    texture = this.PIXI.Texture.from(canvas);
    this.glyphTextures.set(name, texture);
    return texture;
  }

  isVisible(object, frame, margin) {
    return this.isPointVisible(object.x, object.y, frame, margin);
  }

  isPointVisible(x, y, frame, margin) {
    return x >= frame.camX - margin
      && x <= frame.camX + frame.viewW + margin
      && y >= frame.camY - margin
      && y <= frame.camY + frame.viewH + margin;
  }

  toScreen(x, y, frame) {
    return {
      x: (x - frame.camX) * CAMERA_ZOOM,
      y: (y - frame.camY) * CAMERA_ZOOM,
    };
  }

  releaseRun() {
    for (const [key, freePool] of Object.entries(this.layerPools)) {
      const layer = this.layerByPoolKey[key];
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
    this.releaseEnemyTextures();
    this.frameCounts = {};
    this.specialVisualSources = new WeakMap();
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
    this.colorCache.clear();
    this.releaseEnemyTextures();
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

function drawMechanicalCoinGlyph(ctx, tier, frame) {
  const phase = frame / 8 * Math.PI * 2;
  const widthScale = 0.34 + Math.abs(Math.cos(phase)) * 0.66;
  const radius = tier === "high" ? 20 : tier === "mid" ? 18 : 16;
  const accent = tier === "high" ? "#fff3b0" : tier === "mid" ? "#ffd166" : "#ffb84d";
  ctx.scale(widthScale, 1);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius + 10);
  glow.addColorStop(0, "rgba(255,255,255,0.6)");
  glow.addColorStop(0.48, "rgba(255,209,102,0.28)");
  glow.addColorStop(1, "rgba(255,160,40,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-30, -30, 60, 60);
  ctx.fillStyle = "#6f3d12";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let index = 0; index < 16; index++) {
    const angle = index / 16 * Math.PI * 2;
    const rr = radius + (index % 2 ? 1 : 4);
    const x = Math.cos(angle) * rr;
    const y = Math.sin(angle) * rr;
    if (!index) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d98b28";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff0a8";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.rotate(phase * 0.25);
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(-3, -9, 6, 18);
  ctx.fillStyle = "#7b4317";
  ctx.fillRect(-9, -3, 18, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-radius * 0.52, -radius * 0.48, 4, 3);
}

function drawExperienceCoreGlyph(ctx, tier, frame) {
  const phase = frame / 8 * Math.PI * 2;
  const color = tier === "high" ? "#b48cff" : tier === "mid" ? "#77ff8a" : "#42e8ff";
  const radius = tier === "high" ? 19 : tier === "mid" ? 17 : 15;
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius + 12);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.28, color);
  glow.addColorStop(1, "rgba(66,232,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-30, -30, 60, 60);
  ctx.rotate(Math.sin(phase) * 0.08);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#e9feff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius * 0.72, -radius * 0.18);
  ctx.lineTo(radius * 0.48, radius * 0.72);
  ctx.lineTo(0, radius);
  ctx.lineTo(-radius * 0.58, radius * 0.58);
  ctx.lineTo(-radius * 0.76, -radius * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(0, radius);
  ctx.moveTo(-radius * 0.76, -radius * 0.2);
  ctx.lineTo(radius * 0.72, -radius * 0.18);
  ctx.moveTo(0, 0);
  ctx.lineTo(radius * 0.48, radius * 0.72);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  for (let index = 0; index < 3; index++) {
    const angle = phase + index * Math.PI * 2 / 3;
    ctx.save();
    ctx.translate(Math.cos(angle) * (radius + 6), Math.sin(angle) * (radius * 0.55 + 3));
    ctx.rotate(angle);
    ctx.fillRect(-2, -3, 4, 6);
    ctx.restore();
  }
}

function drawEnemyProjectileGlyph(ctx, name, frame) {
  const phase = frame * Math.PI / 3;
  if (name === "enemyPellet") {
    drawLayeredOrb(ctx, "#ff4d6d", phase, 10);
  } else if (name === "arcaneOrb") {
    drawLayeredOrb(ctx, "#b48cff", phase, 13);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 1.5;
    for (let index = 0; index < 3; index++) {
      ctx.save();
      ctx.rotate(phase + index * Math.PI / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (name === "razorBoomerang") {
    ctx.rotate(phase);
    ctx.fillStyle = "#d9fbff";
    ctx.strokeStyle = "#7c89ff";
    ctx.lineWidth = 2;
    for (let side = 0; side < 4; side++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(2, -3);
      ctx.lineTo(23, -8);
      ctx.lineTo(14, 2);
      ctx.lineTo(4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-4, -4, 8, 8);
  } else if (name === "starShard") {
    ctx.rotate(phase);
    drawStar(ctx, 0, 0, 21, 8, 5, "#f3f7ff", "#42e8ff");
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === "snowflake") {
    ctx.rotate(phase);
    ctx.strokeStyle = "#d9fbff";
    ctx.lineWidth = 2.4;
    for (let index = 0; index < 6; index++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -21);
      ctx.moveTo(0, -12);
      ctx.lineTo(-5, -8);
      ctx.moveTo(0, -12);
      ctx.lineTo(5, -8);
      ctx.stroke();
    }
    ctx.fillStyle = "#9ff4ff";
    ctx.fillRect(-4, -4, 8, 8);
  } else if (name === "fireball" || name === "voidFireball") {
    const color = name === "voidFireball" ? "#b48cff" : "#ff7a1a";
    const gradient = ctx.createLinearGradient(-26, 0, 16, 0);
    gradient.addColorStop(0, "rgba(255,60,20,0)");
    gradient.addColorStop(0.65, color);
    gradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-27, -6);
    ctx.quadraticCurveTo(-8, -14 - Math.sin(phase) * 3, 14, -10);
    ctx.arc(14, 0, 10, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(-8, 13 + Math.cos(phase) * 3, -27, 6);
    ctx.closePath();
    ctx.fill();
  } else if (name === "laserShard" || name === "pylonBolt" || name === "gunnerShot") {
    const color = name === "pylonBolt" ? "#42e8ff" : name === "gunnerShot" ? "#ffd166" : "#ff4d6d";
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(4, -7);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-18, 4);
    ctx.lineTo(4, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(4, -2, 14, 4);
  } else if (name === "phaseShard") {
    ctx.globalAlpha = 0.42;
    drawStar(ctx, -6, 0, 16, 6, 4, "#d946ef", "#ffffff");
    ctx.globalAlpha = 1;
    drawStar(ctx, 5, 0, 17, 6, 4, "#f3f7ff", "#d946ef");
  } else if (name === "fastGear") {
    ctx.rotate(phase);
    drawGear(ctx, 18, 12, "#f59e0b");
  } else if (name === "zombieClot") {
    ctx.fillStyle = "#7ccf68";
    ctx.strokeStyle = "#d7ffb0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let index = 0; index < 10; index++) {
      const angle = index / 10 * Math.PI * 2;
      const radius = 12 + Math.sin(angle * 3 + phase) * 3;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (!index) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(-4, -5, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === "slimeOrb") {
    drawLayeredOrb(ctx, "#77ff8a", phase, 13);
    ctx.strokeStyle = "#d7ffb0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 1, 15 + Math.sin(phase) * 2, 11 - Math.sin(phase) * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (drawBossProjectileGlyph(ctx, name, phase)) {
    // Boss projectile families keep their silhouettes while sharing pre-baked textures.
  } else {
    return false;
  }
  return true;
}

function drawBossProjectileGlyph(ctx, name, phase) {
  if (name === "frostComet") {
    ctx.fillStyle = "rgba(180,140,255,0.24)";
    ctx.beginPath();
    ctx.moveTo(-30, -7);
    ctx.lineTo(10, -13);
    ctx.lineTo(24, 0);
    ctx.lineTo(10, 13);
    ctx.lineTo(-30, 7);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(phase * 0.35);
    drawSnowCrystal(ctx, 15, "#e8ffff", "#b48cff");
    return true;
  }
  if (name === "stormBlade" || name === "stormCrownShard") {
    const crown = name === "stormCrownShard";
    ctx.fillStyle = crown ? "#8bf5ff" : "#42e8ff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = crown ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(29, 0);
    ctx.lineTo(-11, crown ? -13 : -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-11, crown ? 13 : 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = crown ? "#d946ef" : "#0b3d5e";
    ctx.fillRect(-8, -2, 26, 4);
    return true;
  }
  if (name === "stormOrb") {
    drawLayeredOrb(ctx, "#42e8ff", phase, 12);
    ctx.rotate(phase);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let index = 0; index < 4; index++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(21, -4);
      ctx.lineTo(14, 4);
      ctx.stroke();
    }
    return true;
  }
  if (name === "riftbladeCrescent") {
    ctx.rotate(-0.18 + Math.sin(phase) * 0.08);
    ctx.strokeStyle = "#f2c7ff";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(-5, 0, 23, -1.15, 1.15);
    ctx.stroke();
    ctx.strokeStyle = "#d946ef";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-5, 0, 25, -1.12, 1.12);
    ctx.stroke();
    return true;
  }
  if (name === "convictBall") {
    ctx.rotate(phase * 0.5);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-29, -18);
    ctx.lineTo(-18, -12);
    ctx.lineTo(-25, -4);
    ctx.lineTo(-14, 2);
    ctx.stroke();
    drawSpikedCore(ctx, 10, 19, "#15100a", "#ff9d52");
    return true;
  }
  if (name === "convictShrapnel") {
    ctx.fillStyle = "#17100b";
    ctx.strokeStyle = "#ff9d52";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.lineTo(-9, -9);
    ctx.lineTo(-23, 0);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-6, -2, 24, 4);
    return true;
  }
  if (name === "convictSeeker") {
    ctx.fillStyle = "rgba(255,157,82,0.22)";
    ctx.fillRect(-30, -5, 38, 10);
    ctx.fillStyle = "#070a10";
    ctx.strokeStyle = "#ff9d52";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(2, -12);
    ctx.lineTo(-15, -6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-15, 6);
    ctx.lineTo(2, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(2, -3, 9, 6);
    return true;
  }
  if (name === "scientistAbyssShard") {
    drawNeedleShard(ctx, "#5ef1ff", "#e8ffff", 27);
    return true;
  }
  if (name === "scientistAbyssCore") {
    ctx.rotate(phase * 0.45);
    drawSpikedCore(ctx, 12, 23, "#08030f", "#a52aff");
    ctx.strokeStyle = "#5ef1ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 11, -0.7, Math.PI + 0.7);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-7, -2, 14, 4);
    return true;
  }
  if (name === "darkEntityLance") {
    drawNeedleShard(ctx, "#d946ef", "#ffffff", 30);
    ctx.strokeStyle = "rgba(180,140,255,0.55)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-8, 0);
    ctx.stroke();
    return true;
  }
  if (name === "darkEntityScythe") {
    ctx.rotate(phase * 0.45);
    ctx.strokeStyle = "#d946ef";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(-2, 1, 22, -1.45, 1.0);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-2, 1, 25, -1.42, 0.98);
    ctx.stroke();
    ctx.fillStyle = "#240038";
    ctx.fillRect(-16, -2, 21, 4);
    return true;
  }
  if (name === "darkEntityHunter") {
    ctx.fillStyle = "rgba(180,140,255,0.24)";
    ctx.beginPath();
    ctx.moveTo(-30, -8);
    ctx.lineTo(4, -5);
    ctx.lineTo(4, 5);
    ctx.lineTo(-30, 8);
    ctx.closePath();
    ctx.fill();
    drawStar(ctx, 8, 0, 20, 8, 4, "#13051f", "#d946ef");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(5, -3, 12, 6);
    return true;
  }
  return false;
}

function drawSnowCrystal(ctx, radius, color, accent) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  for (let index = 0; index < 6; index++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius);
    ctx.moveTo(0, -radius * 0.58);
    ctx.lineTo(-4, -radius * 0.35);
    ctx.moveTo(0, -radius * 0.58);
    ctx.lineTo(4, -radius * 0.35);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.fillRect(-3, -3, 6, 6);
}

function drawSpikedCore(ctx, inner, outer, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let index = 0; index < 16; index++) {
    const angle = index / 16 * Math.PI * 2;
    const radius = index % 2 ? inner : outer;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawNeedleShard(ctx, color, core, length) {
  ctx.fillStyle = "#08030f";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(-9, -8);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = core;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(length - 4, 0);
  ctx.stroke();
}

function drawLayeredOrb(ctx, color, phase, radius) {
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, radius + 12);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.3, color);
  glow.addColorStop(1, "rgba(180,80,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-30, -30, 60, 60);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 3 + Math.sin(phase) * 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawStar(ctx, x, y, outer, inner, points, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let index = 0; index < points * 2; index++) {
    const angle = index / (points * 2) * Math.PI * 2 - Math.PI / 2;
    const radius = index % 2 ? inner : outer;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (!index) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawGear(ctx, outer, inner, color) {
  ctx.fillStyle = "#291b0c";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let index = 0; index < 24; index++) {
    const angle = index / 24 * Math.PI * 2;
    const radius = index % 3 ? inner : outer;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (!index) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-2, -9, 4, 18);
}

function drawTetherGlyph(ctx) {
  const gradient = ctx.createLinearGradient(-30, 0, 30, 0);
  gradient.addColorStop(0, "rgba(180,140,255,0.08)");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "rgba(180,140,255,0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-32, -6, 64, 12);
  ctx.fillStyle = "#b48cff";
  ctx.fillRect(-32, -2, 64, 4);
}

function drawWormSegmentGlyph(ctx) {
  ctx.fillStyle = "#2c1740";
  ctx.strokeStyle = "#ff65d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-25, -18, 50, 36, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff65d8";
  ctx.fillRect(-5, -12, 10, 24);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-19, -8);
  ctx.lineTo(19, -8);
  ctx.stroke();
}

function drawWormHeadGlyph(ctx, hot) {
  ctx.fillStyle = "#141827";
  ctx.strokeStyle = hot ? "#ffffff" : "#ff65d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(9, -20);
  ctx.lineTo(-22, -15);
  ctx.lineTo(-27, 15);
  ctx.lineTo(9, 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hot ? "#ffffff" : "#ffb8f2";
  ctx.fillRect(4, -10, 10, 5);
  ctx.fillRect(4, 5, 10, 5);
  ctx.fillStyle = "#42e8ff";
  ctx.fillRect(-16, -3, 28, 6);
}

function drawChainLinkGlyph(ctx) {
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWarningDashGlyph(ctx) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-15, -2, 30, 4);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-17, -5, 34, 10);
}

function drawHazardBeamGlyph(ctx, kind) {
  const height = kind === "hazardCore" ? 5 : kind === "warningBeam" ? 12 : 30;
  const gradient = ctx.createLinearGradient(0, -height, 0, height);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-32, -height, 64, height * 2);
}

function drawHazardSlamGlyph(ctx, active) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = active ? 4 : 2;
  ctx.setLineDash(active ? [] : [5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-27, 0);
  ctx.lineTo(27, 0);
  ctx.moveTo(0, -27);
  ctx.lineTo(0, 27);
  ctx.stroke();
  if (active) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    for (let index = 0; index < 8; index++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(10, -2, 18, 4);
    }
  }
}

function drawNegativeStarGlyph(ctx, active) {
  drawStar(ctx, 0, 0, 25, 9, 4, active ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.12)", "#ffffff");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-4, -4, 8, 8);
}

function darkHazardLines(hazard) {
  if (Array.isArray(hazard.lines)) return hazard.lines;
  if (hazard.variant === "lane_guide") {
    const sideX = -Math.sin(hazard.angle || 0);
    const sideY = Math.cos(hazard.angle || 0);
    const forwardX = Math.cos(hazard.angle || 0);
    const forwardY = Math.sin(hazard.angle || 0);
    const half = (hazard.length || 2400) / 2;
    return [-1, 1].map((side) => {
      const offset = side * (hazard.width || 170) / 2;
      return {
        x1: hazard.x + sideX * offset - forwardX * half,
        y1: hazard.y + sideY * offset - forwardY * half,
        x2: hazard.x + sideX * offset + forwardX * half,
        y2: hazard.y + sideY * offset + forwardY * half,
        width: 4,
      };
    });
  }
  if (hazard.variant === "wing_guide") {
    return (hazard.angles || []).map((angle) => ({
      x1: hazard.x,
      y1: hazard.y,
      x2: hazard.x + Math.cos(angle) * (hazard.length || 1200),
      y2: hazard.y + Math.sin(angle) * (hazard.length || 1200),
      width: 4,
    }));
  }
  return [];
}

function clipLineToView(line, frame, margin, out) {
  const minX = frame.camX - margin;
  const maxX = frame.camX + frame.viewW + margin;
  const minY = frame.camY - margin;
  const maxY = frame.camY + frame.viewH + margin;
  let t0 = 0;
  let t1 = 1;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  for (let edge = 0; edge < 4; edge++) {
    const p = edge === 0 ? -dx : edge === 1 ? dx : edge === 2 ? -dy : dy;
    const q = edge === 0 ? line.x1 - minX : edge === 1 ? maxX - line.x1 : edge === 2 ? line.y1 - minY : maxY - line.y1;
    if (Math.abs(p) < 0.000001) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
  }
  out[0] = line.x1 + dx * t0;
  out[1] = line.y1 + dy * t0;
  out[2] = line.x1 + dx * t1;
  out[3] = line.y1 + dy * t1;
  return true;
}

function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}
