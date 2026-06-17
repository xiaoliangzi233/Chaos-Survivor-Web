import { FIRST_WAVE_SECONDS, waveDurationFor } from "./constants.js";
import { WEAPON_BASE_STATS } from "./config/editableGameData.js";

export const state = {
  mode: "menu",
  gameMode: "swarm",
  challengeSpawnTime: 0,
  challengeRemaining: 0,
  controlMode: "auto",
  manualPrimaryIndex: null,
  time: 0,
  wave: 1,
  waveDuration: FIRST_WAVE_SECONDS,
  waveTimeLeft: FIRST_WAVE_SECONDS,
  pendingNextWave: false,
  pendingVictory: false,
  spawnedBossWaves: new Set(),
  thiefSpawnWave: 0,
  thiefSpawnCount: 0,
  bossWaveActive: false,
  kills: 0,
  gold: 0,
  spawnBudget: 0,
  victory: false,
  shake: 0,
  flash: 0,
  cameraX: 0,
  cameraY: 0,
  map: null,
  player: null,
  weapons: null,
  inventory: null,
  initialWeaponId: null,
  shop: null,
  easterEggs: null,
  waveScenario: null,
  spawnedWaveEvents: new Set(),
  difficultyId: "ember",
  difficulty: null,
  difficultyProgress: null,
  ai: null,
};

export const world = {
  enemies: [],
  projectiles: [],
  enemyProjectiles: [],
  hazards: [],
  itemObjects: [],
  gems: [],
  coins: [],
  particles: [],
  weaponFx: [],
  grid: new Map(),
  boss: null,
  blackhole: null,
  damageTexts: [],
};

export const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  vx: 0,
  vy: 0,
  pointerId: null,
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
};

export function addCameraShake(amount, cap = 18) {
  state.shake = Math.min(cap, Math.max(state.shake, amount));
}

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    r: 14,
    hp: 110,
    maxHp: 110,
    speed: 210,
    level: 1,
    xp: 0,
    xpNeed: 24,
    magnet: 92,
    dodge: 0,
    defense: 0,
    luck: 0,
    critChance: 0,
    regen: 0,
    attackRangeBonus: 0,
    attackSpeedBonus: 0,
    projectileBonus: 0,
    splitDamagePenalty: 0,
    airburstInterval: 0,
    airburstTimer: 0,
    bleedDps: 0,
    bleedDuration: 0,
    waveShields: 0,
    currentWaveShields: 0,
    nextWaveSpawnBonus: 0,
    activeWaveSpawnBonus: 0,
    turretCount: 0,
    landminePacks: 0,
    coinDropBonus: 0,
    goldLossOnHit: 0,
    starCloak: 0,
    purchasedUniqueItems: {},
    invuln: 0,
    burnTimer: 0,
    burnDps: 0,
    frostTimer: 0,
    frostSlow: 0,
    frostMarks: 0,
    frostMarkTimer: 0,
    frozenTimer: 0,
    damageScale: 1,
    dirX: 1,
    dirY: 0,
    trailTimer: 0,
    slideVx: 0,
    slideVy: 0,
  };
}

export function createWeapons() {
  return Object.fromEntries(Object.entries(WEAPON_BASE_STATS).map(([id, stats]) => [id, structuredClone(stats)]));
}

export function createInventory() {
  return {
    selectedWeaponUid: null,
    weaponSlots: [],
    items: [],
    nextUid: 1,
  };
}

export function createEasterEggState() {
  return {
    keyBuffer: "",
    triggered: {},
    toast: null,
    neonOverloadTimer: 0,
    magnetBoostTimer: 0,
    wave13Seen: false,
    bossSignatureCooldown: 0,
    centerStillTimer: 0,
    wave13PulseTimer: 0,
    baseMagnet: null,
  };
}

export function createAiState(previous = {}) {
  return {
    enabled: Boolean(previous.enabled),
    runtime: {
      ...(previous.runtime || {}),
      tickAccumulator: 0,
      actionCooldown: 0,
      restartTimer: 0,
      restartRequested: false,
      runRecorded: false,
      shopRefreshesUsed: 0,
      upgradeRefreshesUsed: 0,
      currentTarget: null,
      lastVelocity: { x: 0, y: 0 },
      lastPosition: null,
      stuckTimer: 0,
      stuckEvents: 0,
      recentDamage: 0,
      lastHp: null,
      bossMemory: null,
      tickCache: null,
      tickId: 0,
      situation: null,
      perf: {},
      enabled: Boolean(previous.runtime?.enabled ?? previous.enabled),
    },
    training: previous.training || null,
    config: previous.config || null,
    levelPanel: null,
  };
}

export function resetRun(map) {
  const previousAi = state.ai;
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
  world.damageTexts = [];

  state.gameMode = state.gameMode || "swarm";
  state.mode = "choosingWeapon";
  state.controlMode = state.controlMode || "auto";
  state.manualPrimaryIndex = state.controlMode === "manual" ? 0 : null;
  state.time = 0;
  state.wave = 1;
  state.waveDuration = waveDurationFor(1);
  state.waveTimeLeft = state.waveDuration;
  state.pendingNextWave = false;
  state.pendingVictory = false;
  state.spawnedBossWaves = new Set();
  state.thiefSpawnWave = 0;
  state.thiefSpawnCount = 0;
  state.bossWaveActive = false;
  state.kills = 0;
  state.gold = 0;
  state.spawnBudget = 0;
  state.victory = false;
  state.shake = 0;
  state.flash = 0;
  state.cameraX = 0;
  state.cameraY = 0;
  state.map = map;
  state.player = createPlayer();
  state.weapons = createWeapons();
  state.inventory = createInventory();
  state.initialWeaponId = null;
  state.shop = null;
  state.easterEggs = createEasterEggState();
  state.waveScenario = null;
  state.spawnedWaveEvents = new Set();
  state.challengeSpawnTime = 0;
  state.challengeRemaining = 0;
  state.difficultyId = state.difficultyId || "ember";
  state.ai = createAiState(previousAi || {});
}

