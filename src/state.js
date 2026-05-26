import { FIRST_WAVE_SECONDS, waveDurationFor } from "./constants.js";

export const state = {
  mode: "menu",
  time: 0,
  wave: 1,
  waveDuration: FIRST_WAVE_SECONDS,
  waveTimeLeft: FIRST_WAVE_SECONDS,
  pendingNextWave: false,
  pendingVictory: false,
  spawnedBossWaves: new Set(),
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
};

export const world = {
  enemies: [],
  projectiles: [],
  enemyProjectiles: [],
  hazards: [],
  gems: [],
  coins: [],
  particles: [],
  weaponFx: [],
  grid: new Map(),
  boss: null,
  blackhole: null,
};

export const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  vx: 0,
  vy: 0,
  pointerId: null,
};

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
    invuln: 0,
    burnTimer: 0,
    burnDps: 0,
    damageScale: 1,
    dirX: 1,
    dirY: 0,
    trailTimer: 0,
  };
}

export function createWeapons() {
  return {
    arc: { level: 0, timer: 0, cooldown: 0.58, damage: 26, range: 720, chainRange: 205, chains: 3, falloff: 0.78, quality: "common", qualityMult: 1 },
    ice: { level: 0, timer: 0.8, cooldown: 0.84, count: 1, damage: 21, range: 980, speed: 500, turnSpeed: 5.8, freezeDuration: 0.45, quality: "common", qualityMult: 1 },
    missile: { level: 0, timer: 1.2, cooldown: 1.38, damage: 34, range: 1120, speed: 420, explodeRadius: 116, explodeDamage: 31, turnSpeed: 2.9, quality: "common", qualityMult: 1 },
    boomerang: { level: 0, timer: 1.4, cooldown: 1.48, count: 1, damage: 27, range: 840, speed: 610, returnAfter: 0.6, returnSpeed: 1.35, quality: "common", qualityMult: 1 },
    drone: { level: 0, angle: 0, count: 0, orbitRadius: 82, acquireRange: 650, attackRange: 500, fireCooldown: 0.34, bulletDamage: 13, bulletSpeed: 610, batteryMax: 150, shotCost: 20, rechargeRate: 46, drones: [], quality: "common", qualityMult: 1 },
    pulse: { level: 0, timer: 2.4, cooldown: 2.7, damage: 32, radius: 132, quality: "common", qualityMult: 1 },
  };
}

export function createInventory() {
  return {
    selectedWeaponUid: null,
    weaponSlots: [],
    items: [],
    nextUid: 1,
  };
}

export function resetRun(map) {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.gems.length = 0;
  world.coins.length = 0;
  world.particles.length = 0;
  world.weaponFx.length = 0;
  world.grid.clear();
  world.boss = null;
  world.blackhole = null;

  state.mode = "choosingWeapon";
  state.time = 0;
  state.wave = 1;
  state.waveDuration = waveDurationFor(1);
  state.waveTimeLeft = state.waveDuration;
  state.pendingNextWave = false;
  state.pendingVictory = false;
  state.spawnedBossWaves = new Set();
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
}
