import { state, world } from "../state.js";
import { netRuntime, setNetworkConnected, syncStateMultiplayer } from "./netState.js";

const SNAPSHOT_LIMITS = {
  enemies: 260,
  projectiles: 260,
  enemyProjectiles: 260,
  hazards: 180,
  gems: 220,
  coins: 160,
  particles: 220,
  weaponFx: 160,
  itemObjects: 160,
};
const networkIds = new WeakMap();
let nextNetworkId = 1;

export function createHostSnapshot() {
  return {
    mode: state.mode === "inventory" ? "paused" : state.mode,
    time: round(state.time),
    wave: state.wave,
    waveDuration: round(state.waveDuration),
    waveTimeLeft: round(state.waveTimeLeft),
    pendingNextWave: Boolean(state.pendingNextWave),
    pendingVictory: Boolean(state.pendingVictory),
    waveReady: clonePlain(state.waveReady || { p1: false, p2: false }),
    runMode: state.runMode,
    randomGoal: state.randomGoal,
    kills: state.kills,
    bossKills: state.bossKills,
    gold: state.gold,
    victory: Boolean(state.victory),
    shake: round(state.shake),
    flash: round(state.flash),
    cameraX: round(state.cameraX),
    cameraY: round(state.cameraY),
    difficultyId: state.difficultyId,
    initialWeaponId: state.initialWeaponId,
    bossWaveActive: Boolean(state.bossWaveActive),
    lobby: serializeLobby(),
    economy: serializeEconomy(),
    ui: {
      levelChoices: serializeLevelChoices(state.ai?.levelPanel?.items),
      levelOwner: state.ai?.levelPanel?.owner || "",
      upgradePhase: serializeUpgradePhase(state.upgradePhase),
    },
    players: {
      p1: serializePlayer(state.players?.p1 || state.player),
      p2: serializePlayer(state.players?.p2),
    },
    world: {
      enemies: serializeList(world.enemies, SNAPSHOT_LIMITS.enemies, serializeEnemy),
      projectiles: serializeList(world.projectiles, SNAPSHOT_LIMITS.projectiles, serializeProjectile),
      enemyProjectiles: serializeList(world.enemyProjectiles, SNAPSHOT_LIMITS.enemyProjectiles, serializeProjectile),
      hazards: serializeList(world.hazards, SNAPSHOT_LIMITS.hazards, serializeHazard),
      gems: serializeList(world.gems, SNAPSHOT_LIMITS.gems, serializePickup),
      coins: serializeList(world.coins, SNAPSHOT_LIMITS.coins, serializePickup),
      particles: serializeList(world.particles, SNAPSHOT_LIMITS.particles, serializeFx),
      weaponFx: serializeList(world.weaponFx, SNAPSHOT_LIMITS.weaponFx, serializeFx),
      itemObjects: serializeList(world.itemObjects, SNAPSHOT_LIMITS.itemObjects, serializeFx),
      bossIndex: world.boss ? world.enemies.indexOf(world.boss) : -1,
      blackhole: serializeFx(world.blackhole),
    },
  };
}

export function applyHostSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  state.mode = snapshot.mode || state.mode;
  state.time = number(snapshot.time, state.time);
  state.wave = number(snapshot.wave, state.wave);
  state.waveDuration = number(snapshot.waveDuration, state.waveDuration);
  state.waveTimeLeft = number(snapshot.waveTimeLeft, state.waveTimeLeft);
  state.pendingNextWave = Boolean(snapshot.pendingNextWave);
  state.pendingVictory = Boolean(snapshot.pendingVictory);
  state.waveReady = clonePlain(snapshot.waveReady || { p1: false, p2: false });
  state.runMode = snapshot.runMode || state.runMode;
  state.randomGoal = snapshot.randomGoal || state.randomGoal;
  state.kills = number(snapshot.kills, state.kills);
  state.bossKills = number(snapshot.bossKills, state.bossKills);
  state.gold = number(snapshot.gold, state.gold);
  state.victory = Boolean(snapshot.victory);
  state.shake = number(snapshot.shake, state.shake);
  state.flash = number(snapshot.flash, state.flash);
  applySnapshotCamera(snapshot.cameraX, snapshot.cameraY);
  state.difficultyId = snapshot.difficultyId || state.difficultyId;
  state.initialWeaponId = snapshot.initialWeaponId || state.initialWeaponId;
  state.bossWaveActive = Boolean(snapshot.bossWaveActive);
  state.upgradePhase = clonePlain(snapshot.ui?.upgradePhase || null);
  applyLobbySnapshot(snapshot.lobby);
  if (snapshot.economy?.shop) state.shop = clonePlain(snapshot.economy.shop);
  if (snapshot.economy?.inventory) state.inventory = clonePlain(snapshot.economy.inventory);
  state.players ||= {};
  if (snapshot.players?.p1) {
    applySnapshotPosition(state.player, snapshot.players.p1);
    state.players.p1 = state.player;
  }
  if (snapshot.players?.p2) {
    state.players.p2 ||= {};
    applySnapshotPosition(state.players.p2, snapshot.players.p2);
  }
  if (snapshot.economy?.p2 && state.players?.p2) applyPeerEconomy(state.players.p2, snapshot.economy.p2);
  const incoming = snapshot.world || {};
  reconcileList(world.enemies, incoming.enemies, reviveEnemy);
  reconcileList(world.projectiles, incoming.projectiles, revivePlainObject);
  reconcileList(world.enemyProjectiles, incoming.enemyProjectiles, revivePlainObject);
  reconcileList(world.hazards, incoming.hazards, revivePlainObject);
  reconcileList(world.gems, incoming.gems, revivePlainObject);
  reconcileList(world.coins, incoming.coins, revivePlainObject);
  replaceList(world.particles, incoming.particles, revivePlainObject);
  replaceList(world.weaponFx, incoming.weaponFx, revivePlainObject);
  replaceList(world.itemObjects, incoming.itemObjects, revivePlainObject);
  world.boss = incoming.bossIndex >= 0 ? world.enemies[incoming.bossIndex] || null : null;
  world.blackhole = incoming.blackhole || null;
  world.grid?.clear?.();
  world.hitTestEnemies.length = 0;
  netRuntime.lastSnapshotAt = performanceNow();
  setNetworkConnected(true, netRuntime.peerName || "P1 主机");
  syncStateMultiplayer();
  return true;
}

export function updateGuestInterpolation(dt) {
  if (netRuntime.role !== "guest") return;
  const blend = 1 - Math.exp(-Math.max(0, Number(dt) || 0) * 18);
  interpolateObject(state.player, blend);
  interpolateObject(state.players?.p2, blend);
  if (Number.isFinite(state.netCameraTargetX) && Number.isFinite(state.netCameraTargetY)) {
    state.cameraX += (state.netCameraTargetX - state.cameraX) * blend;
    state.cameraY += (state.netCameraTargetY - state.cameraY) * blend;
  }
  for (const list of [world.enemies, world.projectiles, world.enemyProjectiles, world.hazards, world.gems, world.coins]) {
    for (const entry of list) interpolateObject(entry, blend);
  }
}

function serializeEconomy() {
  const detailed = ["lobby", "shop", "leveling", "paused", "ended"].includes(state.mode);
  return {
    shop: detailed ? clonePlain(state.shop) : null,
    inventory: detailed ? clonePlain(state.inventory) : null,
    p2: serializePeerEconomy(state.players?.p2, { detailed }),
  };
}

function serializePeerEconomy(peer, { detailed = true } = {}) {
  if (!peer) return null;
  const economy = {
    gold: number(peer.gold, 0),
    initialWeaponId: peer.initialWeaponId || "",
  };
  if (detailed) {
    economy.inventory = clonePlain(peer.inventory);
    economy.weapons = clonePlain(peer.weapons);
    economy.shop = clonePlain(peer.shop);
  }
  return economy;
}

function applyPeerEconomy(peer, economy) {
  peer.gold = number(economy.gold, peer.gold);
  peer.initialWeaponId = economy.initialWeaponId || peer.initialWeaponId || null;
  if (economy.inventory) peer.inventory = clonePlain(economy.inventory);
  if (economy.weapons) peer.weapons = clonePlain(economy.weapons);
  if (economy.shop) peer.shop = clonePlain(economy.shop);
}

function serializeLobby() {
  const lobby = state.lobby;
  if (!lobby?.active) return { active: false };
  return {
    active: true,
    time: round(lobby.time),
    shipTime: round(lobby.shipTime),
    p1: serializeLobbyPlayer(lobby.player),
    p2: serializeLobbyPlayer(lobby.peer),
    selectedWeaponId: lobby.selectedWeaponId || "",
    selectedPeerWeaponId: lobby.selectedPeerWeaponId || "",
    selectedDifficultyId: lobby.selectedDifficultyId || "",
    randomGoal: lobby.randomGoal || "twenty_waves",
    weaponPage: Number(lobby.weaponPage) || 0,
    pendingLaunch: clonePlain(lobby.pendingLaunch),
  };
}

function applyLobbySnapshot(lobbySnapshot) {
  if (!lobbySnapshot || typeof lobbySnapshot !== "object") return;
  state.lobby ||= {};
  state.lobby.active = Boolean(lobbySnapshot.active);
  if (!lobbySnapshot.active) return;
  state.lobby.time = number(lobbySnapshot.time, state.lobby.time);
  state.lobby.shipTime = number(lobbySnapshot.shipTime, state.lobby.shipTime);
  state.lobby.selectedWeaponId = lobbySnapshot.selectedWeaponId || state.lobby.selectedWeaponId;
  state.lobby.selectedPeerWeaponId = lobbySnapshot.selectedPeerWeaponId || state.lobby.selectedPeerWeaponId;
  state.lobby.selectedDifficultyId = lobbySnapshot.selectedDifficultyId || state.lobby.selectedDifficultyId;
  state.lobby.randomGoal = lobbySnapshot.randomGoal || state.lobby.randomGoal;
  state.lobby.weaponPage = number(lobbySnapshot.weaponPage, state.lobby.weaponPage);
  state.lobby.pendingLaunch = clonePlain(lobbySnapshot.pendingLaunch);
  state.lobby.peer ||= {};
  if (netRuntime.role === "guest") {
    if (lobbySnapshot.p2) Object.assign(state.lobby.player, lobbySnapshot.p2);
    if (lobbySnapshot.p1) Object.assign(state.lobby.peer, lobbySnapshot.p1);
  } else {
    if (lobbySnapshot.p1) Object.assign(state.lobby.player, lobbySnapshot.p1);
    if (lobbySnapshot.p2) Object.assign(state.lobby.peer, lobbySnapshot.p2);
  }
}

function serializeLobbyPlayer(player) {
  return pickNumberFields(player, ["x", "y", "r", "speed", "vx", "vy", "dirX", "dirY", "tilt", "stride"], {
    id: player?.id || "",
    name: player?.name || "",
    color: player?.color || "",
    moving: Boolean(player?.moving),
  });
}

function serializeLevelChoices(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item?.id || "",
    icon: item?.icon || "*",
    name: item?.name || "强化",
    stat: item?.stat || "强化",
    amount: item?.amount || "",
    desc: item?.desc || "由主机选择",
  }));
}

function serializeUpgradePhase(phase) {
  if (!phase?.active) return null;
  return {
    active: true,
    p1: serializeUpgradeTrack(phase.p1),
    p2: serializeUpgradeTrack(phase.p2),
  };
}

function serializeUpgradeTrack(track) {
  return {
    required: Boolean(track?.required),
    remaining: Math.max(0, Math.floor(Number(track?.remaining) || 0)),
    ready: Boolean(track?.ready),
    choices: serializeLevelChoices(track?.choiceItems || []),
  };
}

export function createStartRunPayload({ config, map }) {
  return {
    config: {
      difficultyId: config?.difficulty?.id || config?.difficultyId || "",
      weaponId: config?.weapon?.id || config?.weaponId || "",
      peerWeaponId: config?.peerWeaponId || "",
      runMode: config?.runMode || "standard",
      randomGoal: config?.randomGoal || "twenty_waves",
    },
    map: sanitizeMap(map),
  };
}

function serializePlayer(player) {
  if (!player) return null;
  return pickNumberFields(player, [
    "x", "y", "r", "hp", "maxHp", "speed", "level", "xp", "xpNeed", "magnet", "dodge", "defense",
    "luck", "critChance", "regen", "invuln", "burnTimer", "burnDps", "frostTimer", "frostSlow",
    "frostMarks", "frostMarkTimer", "frozenTimer", "statusFlash", "damageScale", "dirX", "dirY",
    "trailTimer", "slideVx", "slideVy",
  ], {
    id: player.id || "",
    name: player.name || "",
    color: player.color || "",
    statusFlashColor: player.statusFlashColor || "",
    statusEffects: clonePlain(player.statusEffects || {}),
  });
}

function serializeEnemy(enemy) {
  const base = pickNumberFields(enemy, [
    "x", "y", "r", "hp", "maxHp", "speed", "damage", "xp", "flash", "hitTimer", "anim", "phase",
    "cooldown", "angle", "spin", "knockbackX", "knockbackY",
  ], {
    netId: networkIdFor(enemy),
    type: enemy.type || enemy.id || "enemy",
    id: enemy.id || enemy.type || "enemy",
    name: enemy.name || enemy.type || "敌人",
    color: enemy.color || "#ff4d6d",
    elite: Boolean(enemy.elite),
    boss: Boolean(enemy.boss),
    dead: Boolean(enemy.dead),
    shielded: Boolean(enemy.shielded),
    globalShielded: Boolean(enemy.globalShielded),
  });
  return base;
}

function serializeProjectile(projectile) {
  return pickNumberFields(projectile, [
    "x", "y", "px", "py", "vx", "vy", "r", "damage", "life", "maxLife", "angle", "spin", "speed",
    "targetX", "targetY", "targetRadius", "qualityRank",
  ], {
    netId: networkIdFor(projectile),
    shape: projectile.shape || projectile.visualId || "defaultEnemyBullet",
    visualId: projectile.visualId || projectile.shape || "",
    ownerId: projectile.ownerId || "p1",
    color: projectile.color || "#42e8ff",
    bossProjectile: Boolean(projectile.bossProjectile),
    hidden: Boolean(projectile.hidden),
  });
}

function serializeHazard(hazard) {
  return pickNumberFields(hazard, [
    "x", "y", "r", "damage", "life", "maxLife", "armTime", "armDuration", "angle", "length", "width",
    "triggerRadius", "pulse", "spin",
  ], {
    netId: networkIdFor(hazard),
    kind: hazard.kind || "hazard",
    color: hazard.color || "#ff4d6d",
    warningColor: hazard.warningColor || "",
    variant: hazard.variant || "",
    lines: clonePlain(hazard.lines || []),
  });
}

function serializePickup(entry) {
  return pickNumberFields(entry, ["x", "y", "value", "phase", "life", "maxLife", "r"], {
    netId: networkIdFor(entry),
    kind: entry.kind || "",
    color: entry.color || "",
  });
}

function serializeFx(entry) {
  if (!entry) return null;
  const clone = clonePlain(entry);
  stripRuntimeObjects(clone);
  return clone;
}

function reviveEnemy(entry) {
  const enemy = revivePlainObject(entry);
  enemy.draw = (ctx) => drawSnapshotEnemy(ctx, enemy);
  enemy.takeDamage = null;
  return enemy;
}

function drawSnapshotEnemy(ctx, enemy) {
  const r = enemy.r || 18;
  const color = enemy.color || "#ff4d6d";
  ctx.save();
  ctx.translate(enemy.x || 0, enemy.y || 0);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.72, r * 0.95, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `${color}33`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#100b18";
  ctx.strokeStyle = color;
  ctx.lineWidth = enemy.boss ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.88, -r * 0.1);
  ctx.lineTo(r * 0.48, r * 0.86);
  ctx.lineTo(-r * 0.56, r * 0.78);
  ctx.lineTo(-r * 0.94, -r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-r * 0.36, -r * 0.25, r * 0.28, r * 0.2);
  ctx.fillRect(r * 0.08, -r * 0.25, r * 0.28, r * 0.2);
  ctx.restore();
}

function serializeList(list, limit, serializer) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map(serializer).filter(Boolean);
}

function replaceList(target, source, reviver) {
  target.length = 0;
  if (!Array.isArray(source)) return;
  for (const entry of source) target.push(reviver(entry));
}

function reconcileList(target, source, reviver) {
  if (!Array.isArray(source)) {
    target.length = 0;
    return;
  }
  const existing = new Map(target.filter((entry) => entry?.netId).map((entry) => [entry.netId, entry]));
  const next = source.map((entry) => {
    const revived = reviver(entry);
    const previous = existing.get(entry?.netId);
    if (!previous || !Number.isFinite(Number(entry?.x)) || !Number.isFinite(Number(entry?.y))) return revived;
    const distance = Math.hypot(Number(entry.x) - Number(previous.x || 0), Number(entry.y) - Number(previous.y || 0));
    if (distance > 360) return revived;
    revived.netTargetX = Number(entry.x);
    revived.netTargetY = Number(entry.y);
    revived.x = Number(previous.x) || 0;
    revived.y = Number(previous.y) || 0;
    return revived;
  });
  target.splice(0, target.length, ...next);
}

function applySnapshotPosition(target, source) {
  if (!target || !source) return;
  const oldX = Number(target.x) || 0;
  const oldY = Number(target.y) || 0;
  Object.assign(target, source);
  if (netRuntime.role !== "guest" || !Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return;
  const distance = Math.hypot(Number(source.x) - oldX, Number(source.y) - oldY);
  if (distance > 360) return;
  target.netTargetX = Number(source.x);
  target.netTargetY = Number(source.y);
  target.x = oldX;
  target.y = oldY;
}

function applySnapshotCamera(x, y) {
  const nextX = number(x, state.cameraX);
  const nextY = number(y, state.cameraY);
  if (netRuntime.role !== "guest") {
    state.cameraX = nextX;
    state.cameraY = nextY;
    return;
  }
  state.netCameraTargetX = nextX;
  state.netCameraTargetY = nextY;
  if (Math.hypot(nextX - state.cameraX, nextY - state.cameraY) > 520) {
    state.cameraX = nextX;
    state.cameraY = nextY;
  }
}

function interpolateObject(entry, blend) {
  if (!entry || !Number.isFinite(entry.netTargetX) || !Number.isFinite(entry.netTargetY)) return;
  entry.x += (entry.netTargetX - entry.x) * blend;
  entry.y += (entry.netTargetY - entry.y) * blend;
}

function networkIdFor(entry) {
  if (!entry || typeof entry !== "object") return 0;
  let id = networkIds.get(entry);
  if (!id) {
    id = nextNetworkId++;
    networkIds.set(entry, id);
  }
  return id;
}

function revivePlainObject(entry) {
  return clonePlain(entry || {});
}

function pickNumberFields(source, fields, extra = {}) {
  const out = { ...extra };
  for (const field of fields) {
    if (Number.isFinite(Number(source?.[field]))) out[field] = round(source[field]);
  }
  return out;
}

function sanitizeMap(map) {
  if (!map) return null;
  const clone = clonePlain(map);
  stripRuntimeObjects(clone);
  return clone;
}

function stripRuntimeObjects(value) {
  if (!value || typeof value !== "object") return;
  delete value.staticCache;
  delete value.staticCanvas;
  delete value.cacheCanvas;
  delete value.ctx;
  delete value.owner;
  delete value.bossOwner;
  delete value.minionOwner;
  delete value.linkedHazard;
  delete value.abyssScientistOwner;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") stripRuntimeObjects(child);
  }
}

function clonePlain(value) {
  if (value == null || typeof value !== "object") return value;
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (key, entry) => {
      if (typeof entry === "function") return undefined;
      if (["owner", "bossOwner", "minionOwner", "linkedHazard", "abyssScientistOwner"].includes(key)) return undefined;
      if (entry && typeof entry === "object") {
        if (seen.has(entry)) return undefined;
        seen.add(entry);
      }
      if (entry instanceof Set) return [...entry];
      if (entry instanceof Map) return Object.fromEntries(entry);
      return entry;
    }));
  } catch {
    return null;
  }
}

function number(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function performanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
