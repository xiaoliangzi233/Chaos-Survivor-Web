import { state, world, createPlayer, createWeapons, createInventory, createEasterEggState } from "../state.js";
import { recomputeAllWeapons } from "../economy/inventory.js";
import { createShopState } from "../economy/shop.js";
import { selectDifficulty } from "../difficulty.js";

export const AUTOSAVE_KEY = "chaos-survivor-autosave";
const SAVE_VERSION = 1;

export function autoSave() {
  if (state.pendingVictory || state.mode === "ended" || state.mode === "menu") return;
  try {
    // Strip non-serializable cache from map before saving
    const mapForSave = state.map ? Object.assign({}, state.map) : null;
    if (mapForSave) delete mapForSave.staticCache;

    const data = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      player: serializePlayer(state.player),
      inventory: serializeInventory(state.inventory),
      weapons: serializeWeapons(state.weapons),
      shop: serializeShop(state.shop),
      time: state.time,
      wave: state.wave,
      waveDuration: state.waveDuration,
      waveTimeLeft: state.waveTimeLeft,
      kills: state.kills,
      gold: state.gold,
      difficultyId: state.difficultyId,
      initialWeaponId: state.initialWeaponId,
      map: mapForSave,
      easterEggs: serializeEasterEggs(state.easterEggs),
      waveScenario: state.waveScenario,
      spawnedWaveEvents: [...(state.spawnedWaveEvents || [])],
      spawnedBossWaves: [...(state.spawnedBossWaves || [])],
      thiefSpawnWave: state.thiefSpawnWave,
      thiefSpawnCount: state.thiefSpawnCount,
      gameMode: state.gameMode,
      controlMode: state.controlMode,
      manualPrimaryIndex: state.manualPrimaryIndex,
      spawnBudget: state.spawnBudget,
      challengeSpawnTime: state.challengeSpawnTime,
      bossWaveActive: state.bossWaveActive,
      pendingNextWave: state.pendingNextWave,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

export function hasAutoSave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data && data.version === SAVE_VERSION && data.player && data.player.hp > 0;
  } catch {
    return false;
  }
}

export function loadAutoSave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return false;

    world.enemies.length = 0;
    world.projectiles.length = 0;
    world.enemyProjectiles.length = 0;
    world.hazards.length = 0;
    world.itemObjects.length = 0;
    world.gems.length = 0;
    world.coins.length = 0;
    world.particles.length = 0;
    world.weaponFx.length = 0;
    world.grid.clear();
    world.boss = null;
    world.blackhole = null;

    state.player = deserializePlayer(data.player);
    state.weapons = deserializeWeapons(data.weapons);
    state.inventory = deserializeInventory(data.inventory);
    recomputeAllWeapons();

    state.shop = deserializeShop(data.shop);
    state.time = data.time;
    state.wave = data.wave;
    state.kills = data.kills;
    state.gold = data.gold;
    state.difficultyId = data.difficultyId;
    state.initialWeaponId = data.initialWeaponId;
    state.map = data.map;
    state.easterEggs = deserializeEasterEggs(data.easterEggs);
    state.waveScenario = data.waveScenario;
    state.spawnedWaveEvents = new Set(data.spawnedWaveEvents || []);
    state.spawnedBossWaves = new Set(data.spawnedBossWaves || []);
    state.thiefSpawnWave = data.thiefSpawnWave || 0;
    state.thiefSpawnCount = data.thiefSpawnCount || 0;
    state.gameMode = data.gameMode || "swarm";
    state.controlMode = data.controlMode || "auto";
    state.manualPrimaryIndex = data.manualPrimaryIndex ?? null;
    state.challengeSpawnTime = data.challengeSpawnTime ?? 0;
    state.bossWaveActive = data.bossWaveActive || false;
    state.pendingNextWave = data.pendingNextWave || false;
    selectDifficulty(data.difficultyId);

    state.pendingVictory = false;
    state.victory = false;
    state.shake = 0;
    state.flash = 0;
    state.cameraX = state.player.x;
    state.cameraY = state.player.y;
    state.spawnBudget = data.spawnBudget ?? 0;
    state.waveDuration = data.waveDuration ?? Math.min(60, 30 + (state.wave - 1) * 2);
    state.waveTimeLeft = data.waveTimeLeft ?? state.waveDuration;

    return true;
  } catch {
    return false;
  }
}

export function clearAutoSave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore
  }
}

const PLAYER_KEYS = [
  "x", "y", "r", "hp", "maxHp", "speed", "level", "xp", "xpNeed",
  "magnet", "dodge", "defense", "luck", "critChance", "regen",
  "attackRangeBonus", "attackSpeedBonus", "projectileBonus",
  "splitDamagePenalty", "airburstInterval", "airburstTimer",
  "bleedDps", "bleedDuration", "waveShields", "currentWaveShields",
  "nextWaveSpawnBonus", "activeWaveSpawnBonus", "turretCount",
  "landminePacks", "coinDropBonus", "goldLossOnHit", "starCloak",
  "invuln", "burnTimer", "burnDps", "frostTimer", "frostSlow",
  "frostMarks", "frostMarkTimer", "frozenTimer", "damageScale",
  "dirX", "dirY", "trailTimer", "slideVx", "slideVy",
];

function serializePlayer(p) {
  if (!p) return null;
  const out = {};
  for (const key of PLAYER_KEYS) {
    if (p[key] !== undefined) out[key] = p[key];
  }
  if (p.purchasedUniqueItems instanceof Set) {
    out.purchasedUniqueItems = [...p.purchasedUniqueItems];
  } else if (p.purchasedUniqueItems) {
    out.purchasedUniqueItems = Object.keys(p.purchasedUniqueItems);
  }
  return out;
}

function deserializePlayer(data) {
  if (!data) return createPlayer();
  const p = createPlayer();
  for (const key of PLAYER_KEYS) {
    if (data[key] !== undefined) p[key] = data[key];
  }
  if (Array.isArray(data.purchasedUniqueItems)) {
    p.purchasedUniqueItems = {};
    for (const id of data.purchasedUniqueItems) {
      p.purchasedUniqueItems[id] = true;
    }
  } else if (data.purchasedUniqueItems) {
    p.purchasedUniqueItems = data.purchasedUniqueItems;
  }
  return p;
}

function serializeInventory(inv) {
  if (!inv) return null;
  return {
    weaponSlots: inv.weaponSlots ? inv.weaponSlots.map(function(s) { return { uid: s.uid, id: s.id, quality: s.quality, level: s.level }; }) : [],
    items: inv.items ? inv.items.map(function(i) { return { id: i.id, qty: i.qty, icon: i.icon, name: i.name, desc: i.desc }; }) : [],
    nextUid: inv.nextUid,
    selectedWeaponUid: inv.selectedWeaponUid,
  };
}

function deserializeInventory(data) {
  if (!data) return createInventory();
  return {
    weaponSlots: data.weaponSlots || [],
    items: data.items || [],
    nextUid: data.nextUid || 1,
    selectedWeaponUid: data.selectedWeaponUid || null,
  };
}

function serializeWeapons(w) {
  if (!w) return {};
  var out = {};
  for (var id in w) {
    if (!Object.prototype.hasOwnProperty.call(w, id)) continue;
    var clone = Object.assign({}, w[id]);
    delete clone.lastShot;
    delete clone.timer;
    out[id] = clone;
  }
  return out;
}

function deserializeWeapons(data) {
  if (!data) return createWeapons();
  var weapons = createWeapons();
  for (var id in data) {
    if (!Object.prototype.hasOwnProperty.call(data, id)) continue;
    if (weapons[id]) Object.assign(weapons[id], data[id]);
  }
  return weapons;
}

function serializeShop(shop) {
  if (!shop) return null;
  return {
    offers: shop.offers || [],
    refreshCount: shop.refreshCount || 0,
    nextOfferUid: shop.nextOfferUid || 1,
  };
}

function deserializeShop(data) {
  if (!data) return createShopState();
  return {
    offers: data.offers || [],
    refreshCount: data.refreshCount || 0,
    nextOfferUid: data.nextOfferUid || 1,
  };
}

function serializeEasterEggs(ee) {
  if (!ee) return null;
  return {
    keyBuffer: ee.keyBuffer || "",
    triggered: ee.triggered || {},
    wave13Seen: ee.wave13Seen,
  };
}

function deserializeEasterEggs(data) {
  var ee = createEasterEggState();
  if (!data) return ee;
  ee.keyBuffer = data.keyBuffer || "";
  ee.triggered = data.triggered || {};
  ee.wave13Seen = data.wave13Seen;
  return ee;
}
