import {
  createLobbyState,
  createPlayer,
  createWeapons,
  state,
  world,
} from "../src/state.js";
import {
  ITEM_DATA_DEFS,
  QUALITY_INFO,
  WEAPON_BASE_STATS,
  WEAPON_INFO,
  loadEditableGameData,
} from "../src/config/editableGameData.js";
import {
  createDecorativeEnemy,
  enemyConfig,
  setupEnemyRegistry,
} from "../src/systems/enemyRegistry.js";
import {
  applyEnemyVisualVariant,
  applyEnemyBakePose,
  ENEMY_VISUAL_CLIPS,
  enemyVisualVariantIds,
  projectileVisualIds,
  projectileVisualProfile,
} from "../src/systems/visualProfiles.js";
import { drawPlayerAvatar } from "../src/systems/playerAvatar.js";
import {
  LOBBY_NPCS,
  LOBBY_ROOMS,
  enterLobby,
} from "../src/systems/lobby.js";
import {
  drawLobbyNpcAvatar,
  renderLobby,
} from "../src/systems/lobbyRenderer.js";
import { drawWeaponHologram, weaponPreviewColor } from "../src/ui/weaponPreview.js";
import { drawEffects } from "../src/effects.js";
import { drawMap, generateMap } from "../src/systems/map.js";
import {
  drawHazardsForExport,
  drawWeaponFxForExport,
  render,
  viewport,
} from "../src/systems/renderer.js";
import { PixiBackend } from "../src/systems/renderers/pixiBackend.js";

const OUTPUT_ROOT = "assets/exported";
const QUALITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const PARTICLE_KINDS = ["spark", "ring", "trail", "dust", "mote", "healPlus", "damageText", "ember", "mist", "scan"];
const UI_IDS = [
  "hud",
  "waveEventNotice",
  "lobbyHud",
  "startOverlay",
  "lobbyDialogueOverlay",
  "adventureStatsOverlay",
  "debugAuthOverlay",
  "debugPanelOverlay",
  "helpOverlay",
  "codexOverlay",
  "levelOverlay",
  "runLoadingOverlay",
  "loadoutOverlay",
  "storyOverlay",
  "shopOverlay",
  "pauseOverlay",
  "inventoryOverlay",
  "endOverlay",
];
const GLYPH_EFFECTS = [
  "diamond",
  "diamondGlow",
  "orbGlow",
  "bolt",
  "squareGlow",
  "tether",
  "wormSegment",
  "wormHead",
  "wormHeadHot",
  "chainLink",
  "warningDash",
  "hazardBeam",
  "warningBeam",
  "hazardCore",
  "hazardSlamActive",
  "hazardSlamWarning",
  "negativeStarActive",
  "negativeStarWarning",
];
const WEAPON_FX_KINDS = [
  "arc",
  "explosion",
  "iceHit",
  "muzzle",
  "droneLock",
  "iceShardTrail",
  "boomerangRecall",
  "scorchRing",
  "pulse",
  "doublePulse",
  "shockRing",
  "frostZone",
  "prismRail",
  "prismChargeGhost",
  "prismImpact",
  "voidPulse",
  "voidCollapse",
  "voidCollapseWarning",
  "teslaChain",
  "teslaNodePulse",
  "teslaField",
  "prismBurst",
  "bladeBloom",
  "droneBeam",
  "turretBeam",
  "itemMineBlast",
  "starImpact",
  "starfallWarning",
  "starfallImpact",
  "starScar",
  "starConstellation",
  "phaseNeedleHit",
  "phaseNeedleMark",
  "phaseNeedleBurst",
  "phaseNeedleRift",
  "echoCone",
  "echoWave",
  "echoResonance",
  "riftLoom",
  "riftCollapse",
  "riftScar",
  "riftAfterimage",
];
const HAZARD_KINDS = [
  "dark_entity_field",
  "ember_mine",
  "artillery_blast",
  "gear_trap",
  "magma_crack",
  "toxic_residue",
  "twin_arc_field",
  "riftblade_slash",
  "riftblade_bladefall",
  "riftblade_echo",
  "convict_chain_arc",
  "convict_ball_slam",
  "convict_chain_line",
  "convict_chain_path",
  "scientist_seal_line",
  "scientist_vial_blast",
  "scientist_tendril_path",
  "scientist_entropy_field",
  "scientist_memory_path",
  "scientist_void_node",
  "ice_spike",
  "ice_seal",
  "polar_ice_lane",
  "frost_zone",
  "blizzard_core",
  "storm_laser_net",
  "storm_strike",
  "gravity_well",
  "prism_reflector",
  "magnetic_node",
  "brood_pod",
  "phase_tear",
  "inferno_beacon",
];

const elements = {
  serverBadge: document.querySelector("#serverBadge"),
  mode: document.querySelector("#exportMode"),
  resume: document.querySelector("#resumeExisting"),
  start: document.querySelector("#startExport"),
  cancel: document.querySelector("#cancelExport"),
  clearLog: document.querySelector("#clearLog"),
  title: document.querySelector("#progressTitle"),
  count: document.querySelector("#progressCount"),
  bar: document.querySelector("#progressBar"),
  categories: document.querySelector("#categoryGrid"),
  preview: document.querySelector("#previewCanvas"),
  previewPath: document.querySelector("#previewPath"),
  log: document.querySelector("#exportLog"),
};

const runtime = {
  cancelled: false,
  running: false,
  pixiBackend: null,
  categoryCards: new Map(),
  manifest: null,
  taskIndex: 0,
};

elements.start.addEventListener("click", () => startExport().catch(handleFatalError));
elements.cancel.addEventListener("click", () => {
  runtime.cancelled = true;
  log("收到停止请求，将在当前 PNG 写入完成后停止。", "warn");
});
elements.clearLog.addEventListener("click", () => {
  elements.log.textContent = "";
});

initialize();

async function initialize() {
  try {
    const response = await fetch("/__visual_export/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    if (!status.ok) throw new Error(status.error || "服务状态异常");
    elements.serverBadge.className = "server-badge ready";
    elements.serverBadge.textContent = `写入服务已连接 · ${status.outputRoot}`;
    elements.start.disabled = false;
    log("本地写入服务连接成功。");
    if (new URLSearchParams(location.search).get("autorun") === "1") {
      await startExport();
    }
  } catch (error) {
    elements.serverBadge.className = "server-badge error";
    elements.serverBadge.textContent = "写入服务不可用，请使用启动脚本打开";
    elements.start.disabled = true;
    log(`无法连接写入服务：${error.message}`, "error");
  }
}

async function startExport() {
  if (runtime.running) return;
  runtime.running = true;
  runtime.cancelled = false;
  runtime.taskIndex = 0;
  runtime.categoryCards.clear();
  elements.categories.replaceChildren();
  elements.start.disabled = true;
  elements.cancel.disabled = false;
  elements.mode.disabled = true;
  elements.resume.disabled = true;

  const mode = elements.mode.value === "smoke" ? "smoke" : "full";
  const resumeExisting = elements.resume.checked;
  runtime.manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    resumeExisting,
    outputRoot: OUTPUT_ROOT,
    coordinatePolicy: {
      playerFacing: "right-only; derive left in Unity by horizontal flip",
      transparentObjects: true,
      scenesAndUi: "opaque or styled background",
    },
    source: {
      page: location.pathname,
      game: "native JavaScript Canvas/Pixi/DOM renderer",
    },
    totals: { planned: 0, exported: 0, reused: 0, failed: 0, skipped: 0 },
    categories: {},
    files: [],
    errors: [],
  };

  try {
    log(`开始${mode === "full" ? "完整" : "快速验证"}导出，正在加载游戏数据……`);
    await prepareGameData();
    const tasks = await buildTasks(mode);
    const existingFiles = resumeExisting ? await loadExistingCatalog() : {};
    runtime.manifest.totals.planned = tasks.length;
    initializeCategoryCards(tasks);
    updateProgress("准备完成", 0, tasks.length);
    log(`共计划生成 ${tasks.length} 个 PNG。`);

    for (let index = 0; index < tasks.length; index++) {
      if (runtime.cancelled) {
        runtime.manifest.totals.skipped = tasks.length - index;
        log(`已停止，跳过 ${tasks.length - index} 个待处理文件。`, "warn");
        break;
      }
      runtime.taskIndex = index;
      const task = tasks[index];
      setCategoryState(task.category, "active");
      updateProgress(`${task.category} · ${task.label}`, index, tasks.length);
      const existing = existingFiles[task.path];
      if (existing) {
        recordReused(task, existing);
        updateCategoryCard(task.category);
        continue;
      }
      try {
        const canvas = await task.draw();
        if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
          throw new Error("绘制任务没有返回有效 Canvas");
        }
        await writePng(task.path, canvas);
        showPreview(canvas, task.path);
        recordSuccess(task, canvas);
      } catch (error) {
        recordFailure(task, error);
        log(`失败 ${task.path}: ${error.message}`, "error");
      }
      updateCategoryCard(task.category);
      if ((index + 1) % 25 === 0) await yieldToBrowser();
    }
  } catch (error) {
    log(`导出流程中断：${error.stack || error.message}`, "error");
    runtime.manifest.errors.push({ scope: "pipeline", message: error.message, stack: error.stack || "" });
  } finally {
    runtime.manifest.finishedAt = new Date().toISOString();
    await writeManifest(runtime.manifest).catch((error) => log(`清单写入失败：${error.message}`, "error"));
    const totals = runtime.manifest.totals;
    updateProgress(
      runtime.cancelled ? "已停止并写入清单" : "导出完成",
      totals.exported + totals.reused + totals.failed,
      totals.planned,
    );
    finalizeCategoryCards();
    log(`完成：新写入 ${totals.exported}，复用 ${totals.reused}，失败 ${totals.failed}，跳过 ${totals.skipped}。`);
    log(`清单：${OUTPUT_ROOT}/manifest.json`);
    elements.start.disabled = false;
    elements.cancel.disabled = true;
    elements.mode.disabled = false;
    elements.resume.disabled = false;
    runtime.running = false;
  }
}

async function prepareGameData() {
  await Promise.all([loadEditableGameData(), setupEnemyRegistry(), document.fonts?.ready]);
  state.player = createPlayer();
  state.player.dirX = 1;
  state.player.dirY = 0;
  state.weapons = createWeapons();
  state.cameraX = 0;
  state.cameraY = 0;
  state.time = 1;
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.itemObjects.length = 0;
  world.particles.length = 0;
  world.weaponFx.length = 0;
  const pixi = await import("../vendor/pixi/pixi.min.mjs");
  runtime.pixiBackend = new PixiBackend();
  runtime.pixiBackend.PIXI = pixi;
}

async function buildTasks(mode) {
  const tasks = [];
  addSceneTasks(tasks, mode);
  addPlayerTasks(tasks, mode);
  addEnemyTasks(tasks, mode);
  addNpcTasks(tasks, mode);
  addWeaponTasks(tasks, mode);
  addItemTasks(tasks, mode);
  addPickupTasks(tasks, mode);
  addProjectileTasks(tasks, mode);
  addParticleTasks(tasks, mode);
  addEffectGlyphTasks(tasks, mode);
  addWeaponFxTasks(tasks, mode);
  addHazardTasks(tasks, mode);
  addUiTasks(tasks, mode);
  return tasks;
}

function addSceneTasks(tasks, mode) {
  tasks.push(task("scenes", "menu", "scenes/menu/main_menu.png", drawMenuScene));
  const map = generateMap();
  tasks.push(task("scenes", "battle-map-full", "scenes/battle/map_full.png", () => drawBattleMap(map, true)));
  tasks.push(task("scenes", "battle-map-detail", "scenes/battle/map_center_detail.png", () => drawBattleMap(map, false)));

  enterLobby({ resetPosition: true });
  const rooms = mode === "smoke" ? LOBBY_ROOMS.slice(0, 1) : LOBBY_ROOMS;
  for (const room of rooms) {
    tasks.push(task("scenes", `lobby-${room.id}`, `scenes/lobby/${safeId(room.id)}.png`, () => drawLobbyRoom(room)));
  }
}

function addPlayerTasks(tasks, mode) {
  const clips = {
    idle: 8,
    move: 8,
    attack: 6,
    hurt: 4,
    low_health: 4,
  };
  for (const [clip, frameCount] of Object.entries(clips)) {
    const count = mode === "smoke" ? 1 : frameCount;
    for (let frame = 0; frame < count; frame++) {
      tasks.push(task(
        "player",
        `${clip}-${frame}`,
        `player/right/${clip}/${frameName(frame)}.png`,
        () => drawPlayerFrame(clip, frame, frameCount),
      ));
    }
  }
}

function addEnemyTasks(tasks, mode) {
  const ids = Object.keys(enemyConfig).sort();
  const selectedIds = mode === "smoke" ? ids.slice(0, 2) : ids;
  for (const id of selectedIds) {
    const probe = createDecorativeEnemy(id, 0, 0);
    const variants = enemyVisualVariantIds(probe);
    for (const variantKey of mode === "smoke" ? variants.slice(0, 1) : variants) {
      for (const [clip, frameCount] of Object.entries(ENEMY_VISUAL_CLIPS)) {
        const count = mode === "smoke" ? 1 : frameCount;
        for (let frame = 0; frame < count; frame++) {
          tasks.push(task(
            "enemies",
            `${id}-${variantKey}-${clip}-${frame}`,
            `enemies/${safeId(id)}/${safeId(variantKey)}/${clip}/${frameName(frame)}.png`,
            () => drawEnemyFrame(id, variantKey, clip, frame, frameCount),
          ));
        }
      }
    }
  }
}

function addNpcTasks(tasks, mode) {
  const npcs = mode === "smoke" ? LOBBY_NPCS.slice(0, 1) : LOBBY_NPCS;
  for (const npc of npcs) {
    for (const clip of ["idle", "move"]) {
      const frameCount = 8;
      const count = mode === "smoke" ? 1 : frameCount;
      for (let frame = 0; frame < count; frame++) {
        tasks.push(task(
          "npcs",
          `${npc.id}-${clip}-${frame}`,
          `npcs/${safeId(npc.id)}/${clip}/${frameName(frame)}.png`,
          () => drawNpcFrame(npc, clip, frame, frameCount),
        ));
      }
    }
  }
}

function addWeaponTasks(tasks, mode) {
  const ids = Object.keys(WEAPON_INFO);
  const selectedIds = mode === "smoke" ? ids.slice(0, 1) : ids;
  for (const id of selectedIds) {
    const qualities = mode === "smoke" ? QUALITY_ORDER.slice(0, 1) : QUALITY_ORDER;
    for (const quality of qualities) {
      const frameCount = 8;
      const count = mode === "smoke" ? 1 : frameCount;
      for (let frame = 0; frame < count; frame++) {
        tasks.push(task(
          "weapons",
          `${id}-${quality}-${frame}`,
          `weapons/${safeId(id)}/${quality}/${frameName(frame)}.png`,
          () => drawWeaponFrame(id, quality, frame, frameCount),
        ));
      }
    }
  }
}

function addItemTasks(tasks, mode) {
  const items = mode === "smoke" ? ITEM_DATA_DEFS.slice(0, 1) : ITEM_DATA_DEFS;
  for (const item of items) {
    const qualities = item.singleQuality || item.fixedQuality
      ? [item.fixedQuality || "common"]
      : QUALITY_ORDER;
    for (const quality of mode === "smoke" ? qualities.slice(0, 1) : qualities) {
      tasks.push(task(
        "items",
        `${item.id}-${quality}`,
        `items/${safeId(item.id)}/${quality}.png`,
        () => drawItemIcon(item, quality),
      ));
    }
  }
}

function addPickupTasks(tasks, mode) {
  const tiers = mode === "smoke" ? ["low"] : ["low", "mid", "high"];
  for (const kind of ["coin", "xp"]) {
    for (const tier of tiers) {
      const frameCount = 8;
      const count = mode === "smoke" ? 1 : frameCount;
      for (let frame = 0; frame < count; frame++) {
        const glyph = `${kind}-${tier}:${frame}`;
        tasks.push(task(
          "pickups",
          glyph,
          `pickups/${kind}/${tier}/${frameName(frame)}.png`,
          () => drawPixiGlyph(glyph, 128),
        ));
      }
    }
  }
}

function addProjectileTasks(tasks, mode) {
  const ids = projectileVisualIds();
  const selectedIds = mode === "smoke" ? ids.slice(0, 1) : ids;
  for (const id of selectedIds) {
    const profile = projectileVisualProfile(id);
    const count = mode === "smoke" ? 1 : profile.frames;
    for (let frame = 0; frame < count; frame++) {
      const glyph = `${profile.texture}:${frame}`;
      tasks.push(task(
        "projectiles",
        `${id}-${frame}`,
        `projectiles/${safeId(id)}/${frameName(frame)}.png`,
        () => drawPixiGlyph(glyph, 160),
      ));
    }
  }
}

function addParticleTasks(tasks, mode) {
  const kinds = mode === "smoke" ? PARTICLE_KINDS.slice(0, 1) : PARTICLE_KINDS;
  for (const kind of kinds) {
    const frameCount = 8;
    const count = mode === "smoke" ? 1 : frameCount;
    for (let frame = 0; frame < count; frame++) {
      tasks.push(task(
        "particles",
        `${kind}-${frame}`,
        `particles/${safeId(kind)}/${frameName(frame)}.png`,
        () => drawParticleFrame(kind, frame, frameCount),
      ));
    }
  }
}

function addEffectGlyphTasks(tasks, mode) {
  const glyphs = mode === "smoke" ? GLYPH_EFFECTS.slice(0, 1) : GLYPH_EFFECTS;
  for (const glyph of glyphs) {
    tasks.push(task(
      "effects",
      `glyph-${glyph}`,
      `effects/glyphs/${safeId(glyph)}.png`,
      () => drawPixiGlyph(glyph, 160),
    ));
  }
}

function addWeaponFxTasks(tasks, mode) {
  const kinds = mode === "smoke" ? WEAPON_FX_KINDS.slice(0, 1) : WEAPON_FX_KINDS;
  for (const kind of kinds) {
    const frameCount = 6;
    const count = mode === "smoke" ? 1 : frameCount;
    for (let frame = 0; frame < count; frame++) {
      tasks.push(task(
        "effects",
        `weapon-${kind}-${frame}`,
        `effects/weapon/${safeId(kind)}/${frameName(frame)}.png`,
        () => drawWeaponFxFrame(kind, frame, frameCount),
      ));
    }
  }
}

function addHazardTasks(tasks, mode) {
  const kinds = mode === "smoke" ? HAZARD_KINDS.slice(0, 1) : HAZARD_KINDS;
  for (const kind of kinds) {
    const variants = kind === "dark_entity_field"
      ? ["negative_star", "lane_guide", "wing_guide"]
      : [""];
    for (const variant of mode === "smoke" ? variants.slice(0, 1) : variants) {
      const frameCount = 6;
      const count = mode === "smoke" ? 1 : frameCount;
      for (let frame = 0; frame < count; frame++) {
        const id = variant ? `${kind}-${variant}` : kind;
        tasks.push(task(
          "effects",
          `hazard-${id}-${frame}`,
          `effects/hazards/${safeId(id)}/${frameName(frame)}.png`,
          () => drawHazardFrame(kind, variant, frame, frameCount),
        ));
      }
    }
  }
}

function addUiTasks(tasks, mode) {
  const ids = mode === "smoke" ? UI_IDS.slice(0, 1) : UI_IDS;
  for (const id of ids) {
    tasks.push(task(
      "ui",
      id,
      `ui/${safeId(id)}.png`,
      () => captureUiElement(id),
    ));
  }
}

function task(category, label, path, draw) {
  return { category, label, path, draw };
}

function drawMenuScene() {
  const canvas = createCanvas(1280, 720, false);
  const ctx = canvas.getContext("2d");
  viewport.width = canvas.width;
  viewport.height = canvas.height;
  viewport.dpr = 1;
  state.mode = "menu";
  state.lobby.active = false;
  render(ctx, { skipScreenOverlay: true });
  return canvas;
}

function drawBattleMap(map, full) {
  const canvas = createCanvas(full ? 2048 : 1280, full ? 2048 : 720, false);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#060912";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (full) {
    const worldSize = 4800;
    const scale = canvas.width / worldSize;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(worldSize / 2, worldSize / 2);
    drawMap(ctx, map, -worldSize / 2, -worldSize / 2, worldSize, worldSize, 2.2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    drawMap(ctx, map, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height, 2.2);
    ctx.restore();
  }
  return canvas;
}

function drawLobbyRoom(room) {
  const canvas = createCanvas(1280, 720, false);
  const ctx = canvas.getContext("2d");
  if (!state.lobby?.player) state.lobby = createLobbyState();
  state.mode = "lobby";
  state.lobby.active = true;
  state.lobby.time = 2.4;
  state.lobby.shipTime = 2.4;
  state.lobby.cameraX = room.x;
  state.lobby.cameraY = room.y;
  state.lobby.currentRoomId = room.id;
  state.lobby.player.x = room.x;
  state.lobby.player.y = room.y;
  for (const candidate of LOBBY_ROOMS) state.lobby.roomReveal[candidate.id] = 1;
  renderLobby(ctx, { width: canvas.width, height: canvas.height, dpr: 1 });
  return canvas;
}

function drawPlayerFrame(clip, frame, frameCount) {
  const canvas = createCanvas(128, 128);
  const ctx = centeredContext(canvas);
  const progress = frame / frameCount;
  const time = progress * Math.PI * 2 / 4.2;
  const moving = clip === "move" || clip === "attack";
  const hurt = clip === "hurt";
  const low = clip === "low_health";
  const attackPunch = clip === "attack" ? Math.sin(progress * Math.PI) : 0;
  ctx.translate(attackPunch * 5, moving ? Math.sin(progress * Math.PI * 2) * 2 : 0);
  drawPlayerAvatar(ctx, { dirX: 1, dirY: 0 }, {
    time,
    moving,
    hurt,
    low,
    mood: clip === "attack" ? "curious" : undefined,
    squash: 1 + (moving ? Math.sin(progress * Math.PI * 2) * 0.045 : 0),
    scale: 1.5,
  });
  return canvas;
}

function drawEnemyFrame(id, variantKey, clip, frame, frameCount) {
  const config = enemyConfig[id];
  const size = config?.boss ? 640 : 192;
  const canvas = createCanvas(size, size);
  const ctx = centeredContext(canvas);
  state.player ||= createPlayer();
  state.player.x = 420;
  state.player.y = 0;
  state.time = frame / frameCount * 2;
  const enemy = createDecorativeEnemy(id, 0, 0);
  applyEnemyVisualVariant(enemy, variantKey);
  if (!enemy) throw new Error(`敌人 ${id} 没有注册绘制类`);
  applyEnemyBakePose(enemy, clip, frame / frameCount);
  enemy.x = 0;
  enemy.y = 0;
  const radius = Number(config?.radius || enemy.r || 24);
  const scale = Math.min(config?.boss ? 1 : 1.75, (size * 0.35) / Math.max(18, radius));
  ctx.scale(scale, scale);
  enemy.draw(ctx);
  return canvas;
}

function drawNpcFrame(npc, clip, frame, frameCount) {
  const canvas = createCanvas(160, 192);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, 72);
  const progress = frame / frameCount;
  const moving = clip === "move";
  ctx.translate(0, moving ? Math.sin(progress * Math.PI * 2) * 3 : 0);
  drawLobbyNpcAvatar(ctx, npc, {
    vx: moving ? 80 : 0,
    vy: 0,
    dirX: 1,
    dirY: 0,
  }, {
    time: progress * Math.PI * 2,
    speedRatio: moving ? 0.8 : 0,
    face: 1,
    drawRing: true,
    scale: 1.35,
  });
  return canvas;
}

function drawWeaponFrame(id, quality, frame, frameCount) {
  const canvas = createCanvas(320, 240);
  const ctx = centeredContext(canvas);
  const weapon = {
    ...(WEAPON_BASE_STATS[id] || {}),
    ...(WEAPON_INFO[id] || {}),
    id,
    quality,
    qualityMult: QUALITY_INFO[quality]?.mult || 1,
  };
  const color = weaponPreviewColor(weapon);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 115);
  glow.addColorStop(0, colorWithAlpha(color, 0.18));
  glow.addColorStop(1, colorWithAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-160, -120, 320, 240);
  drawWeaponHologram(ctx, weapon, frame / frameCount * Math.PI * 2, {
    drawPlayer: true,
    rank: QUALITY_ORDER.indexOf(quality),
    color,
    scale: 1.08,
  });
  return canvas;
}

function drawItemIcon(item, quality) {
  const canvas = createCanvas(192, 192);
  const ctx = centeredContext(canvas);
  const color = QUALITY_INFO[quality]?.color || "#cbd5e1";
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 74);
  glow.addColorStop(0, colorWithAlpha(color, 0.28));
  glow.addColorStop(1, colorWithAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-96, -96, 192, 192);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(5,14,24,0.94)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.fillRect(-54, -54, 108, 108);
  ctx.strokeRect(-54, -54, 108, 108);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = colorWithAlpha(color, 0.58);
  ctx.lineWidth = 2;
  ctx.strokeRect(-68, -68, 136, 136);
  ctx.font = '58px "Zpix", "Segoe UI Symbol", "Apple Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f4fdff";
  ctx.fillText(item.icon || "◆", 0, 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillRect(-31, 69, 62, 4);
  return canvas;
}

function drawPixiGlyph(name, size) {
  const texture = runtime.pixiBackend.glyphTexture(name);
  const source = texture?.source?.resource;
  if (!(source instanceof HTMLCanvasElement) && !(source instanceof OffscreenCanvas)) {
    throw new Error(`Pixi 图元 ${name} 没有可读取的 Canvas 源`);
  }
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const inset = Math.round(size * 0.08);
  const frame = texture.frame;
  ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, inset, inset, size - inset * 2, size - inset * 2);
  return canvas;
}

function drawParticleFrame(kind, frame, frameCount) {
  const canvas = createCanvas(192, 192);
  const ctx = centeredContext(canvas);
  const progress = frame / frameCount;
  const maxLife = 1;
  const particle = {
    kind,
    x: 0,
    y: 0,
    px: -52,
    py: 22,
    vx: 0,
    vy: 0,
    life: Math.max(0.08, 1 - progress),
    maxLife,
    radius: 58,
    size: kind === "damageText" ? 24 : kind === "mist" ? 38 : 8,
    color: kind === "ember" ? "#ff7a2f" : kind === "healPlus" ? "#72ffb4" : "#42e8ff",
    alpha: 1,
    drift: 0,
    spin: 1,
    angle: progress * Math.PI * 2,
    length: 112,
    seed: 18.4,
    text: "128",
    critical: kind === "damageText",
    ambient: false,
    t: progress,
  };
  const previous = world.particles;
  world.particles = [particle];
  state.cameraX = 0;
  state.cameraY = 0;
  try {
    drawEffects(ctx);
  } finally {
    world.particles = previous;
  }
  return canvas;
}

function drawWeaponFxFrame(kind, frame, frameCount) {
  const canvas = createCanvas(384, 384);
  const ctx = centeredContext(canvas);
  const progress = frame / frameCount;
  const fx = makeWeaponFx(kind, progress);
  const previous = world.weaponFx;
  world.weaponFx = [fx];
  state.time = progress * 2;
  try {
    drawWeaponFxForExport(ctx);
  } finally {
    world.weaponFx = previous;
  }
  return canvas;
}

function makeWeaponFx(kind, progress) {
  const points = [
    { x: -95, y: -48 },
    { x: 0, y: 82 },
    { x: 96, y: -44 },
    { x: 28, y: -104 },
  ];
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { x1: point.x, y1: point.y, x2: next.x, y2: next.y, seed: 17 + index, index, power: 0.85 };
  });
  return {
    kind,
    x: 0,
    y: 0,
    x1: -120,
    y1: 45,
    x2: 120,
    y2: -45,
    targetX: 88,
    targetY: -52,
    px: -86,
    py: 58,
    angle: -0.35,
    width: 20,
    radius: 88,
    baseRadius: 86,
    color: "#42e8ff",
    secondaryColor: "#b48cff",
    rank: 4,
    major: true,
    armed: true,
    seed: 27.3,
    spin: progress * Math.PI * 2,
    points,
    impacts: points.slice(0, 3),
    segments,
    delay: 0,
    life: Math.max(0.06, 1 - progress),
    maxLife: 1,
    target: { x: 88, y: -52, r: 20, dead: false },
  };
}

function drawHazardFrame(kind, variant, frame, frameCount) {
  const canvas = createCanvas(448, 448);
  const ctx = centeredContext(canvas);
  const progress = frame / frameCount;
  const hazard = makeHazard(kind, variant, progress);
  const previous = world.hazards;
  world.hazards = [hazard];
  state.cameraX = 0;
  state.cameraY = 0;
  state.time = progress * 2;
  viewport.width = canvas.width;
  viewport.height = canvas.height;
  viewport.dpr = 1;
  try {
    drawHazardsForExport(ctx);
  } finally {
    world.hazards = previous;
  }
  return canvas;
}

function makeHazard(kind, variant, progress) {
  const points = [
    { x: -118, y: 60 },
    { x: -40, y: -86 },
    { x: 86, y: -78 },
    { x: 126, y: 54 },
  ];
  const lines = [
    { x1: -150, y1: -72, x2: 150, y2: 72 },
    { x1: -150, y1: 72, x2: 150, y2: -72 },
  ];
  return {
    kind,
    variant,
    x: 0,
    y: 0,
    x1: -145,
    y1: 0,
    x2: 145,
    y2: 0,
    startX: -145,
    startY: 0,
    endX: 145,
    endY: 0,
    targetX: 105,
    targetY: -54,
    r: 92,
    radius: 92,
    width: 34,
    length: 300,
    angle: -0.22,
    color: "#b48cff",
    warningColor: "#ffd166",
    points,
    path: points,
    nodes: points,
    lines,
    segments: lines,
    armTime: progress < 0.34 ? 1 - progress * 3 : 0,
    armDuration: 1,
    armed: progress >= 0.34,
    warning: progress < 0.34,
    phase: progress,
    seed: 42.75,
    spin: progress * Math.PI * 2,
    life: Math.max(0.08, 1 - progress),
    maxLife: 1,
  };
}

async function captureUiElement(id) {
  const response = await fetch("/__visual_export/ui-render", {
    method: "POST",
    headers: { "X-Ui-Element": id },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `UI 渲染失败 HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = createCanvas(image.naturalWidth || 1920, image.naturalHeight || 1080);
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function writePng(path, canvas) {
  const blob = await canvasToBlob(canvas);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/__visual_export/png", {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          "X-Export-Path": path,
        },
        body: blob,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || `PNG 写入失败 HTTP ${response.status}`);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 90));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("PNG 写入失败");
}

async function writeManifest(manifest) {
  const response = await fetch("/__visual_export/manifest", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(manifest),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `清单写入失败 HTTP ${response.status}`);
}

async function loadExistingCatalog() {
  const response = await fetch("/__visual_export/catalog", { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `已有文件清单读取失败 HTTP ${response.status}`);
  }
  log(`续传模式发现 ${Object.keys(result.files || {}).length} 个已有 PNG。`);
  return result.files || {};
}

function recordSuccess(task, canvas) {
  runtime.manifest.totals.exported++;
  const category = categoryStats(task.category);
  category.exported++;
  runtime.manifest.files.push({
    category: task.category,
    label: task.label,
    path: `${OUTPUT_ROOT}/${task.path}`,
    width: canvas.width,
    height: canvas.height,
  });
}

function recordReused(task, existing) {
  runtime.manifest.totals.reused++;
  const category = categoryStats(task.category);
  category.exported++;
  category.reused = (category.reused || 0) + 1;
  runtime.manifest.files.push({
    category: task.category,
    label: task.label,
    path: `${OUTPUT_ROOT}/${task.path}`,
    width: existing.width,
    height: existing.height,
    bytes: existing.bytes,
    reused: true,
  });
}

function recordFailure(task, error) {
  runtime.manifest.totals.failed++;
  const category = categoryStats(task.category);
  category.failed++;
  runtime.manifest.errors.push({
    category: task.category,
    label: task.label,
    path: `${OUTPUT_ROOT}/${task.path}`,
    message: error.message,
    stack: error.stack || "",
  });
}

function categoryStats(category) {
  runtime.manifest.categories[category] ||= { planned: 0, exported: 0, failed: 0 };
  return runtime.manifest.categories[category];
}

function initializeCategoryCards(tasks) {
  for (const task of tasks) categoryStats(task.category).planned++;
  for (const [category, stats] of Object.entries(runtime.manifest.categories)) {
    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `<strong>${escapeHtml(category)}</strong><span>0 / ${stats.planned}</span>`;
    elements.categories.append(card);
    runtime.categoryCards.set(category, card);
  }
}

function updateCategoryCard(category) {
  const stats = categoryStats(category);
  const card = runtime.categoryCards.get(category);
  if (!card) return;
  card.querySelector("span").textContent = `${stats.exported + stats.failed} / ${stats.planned} · 失败 ${stats.failed}`;
  if (stats.exported + stats.failed >= stats.planned) {
    card.classList.remove("active");
    card.classList.add(stats.failed ? "failed" : "done");
  }
}

function setCategoryState(category, stateName) {
  const card = runtime.categoryCards.get(category);
  if (!card || card.classList.contains("done") || card.classList.contains("failed")) return;
  card.classList.toggle("active", stateName === "active");
}

function finalizeCategoryCards() {
  for (const category of Object.keys(runtime.manifest.categories)) updateCategoryCard(category);
}

function updateProgress(title, completed, total) {
  elements.title.textContent = title;
  elements.count.textContent = `${completed} / ${total}`;
  elements.bar.style.width = `${total ? Math.min(100, completed / total * 100) : 0}%`;
}

function showPreview(source, path) {
  const target = elements.preview;
  const scale = Math.min(1, 512 / Math.max(source.width, source.height));
  target.width = Math.max(1, Math.round(source.width * scale));
  target.height = Math.max(1, Math.round(source.height * scale));
  const ctx = target.getContext("2d");
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  elements.previewPath.textContent = `${OUTPUT_ROOT}/${path}`;
}

function createCanvas(width, height, alpha = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha });
  ctx.imageSmoothingEnabled = false;
  return canvas;
}

function centeredContext(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  return ctx;
}

function frameName(frame) {
  return String(frame).padStart(3, "0");
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "_");
}

function colorWithAlpha(color, alpha) {
  const normalized = String(color || "#42e8ff").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return `rgba(66,232,255,${alpha})`;
  return `rgba(${number >> 16},${number >> 8 & 255},${number & 255},${alpha})`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas 无法编码为 PNG"));
    }, "image/png");
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG UI 快照加载失败"));
    image.src = url;
  });
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function log(message, level = "info") {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const prefix = level === "error" ? "[错误]" : level === "warn" ? "[提示]" : "[信息]";
  elements.log.textContent += `${time} ${prefix} ${message}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function handleFatalError(error) {
  log(error.stack || error.message, "error");
  elements.start.disabled = false;
  elements.cancel.disabled = true;
  elements.mode.disabled = false;
  elements.resume.disabled = false;
  runtime.running = false;
}
