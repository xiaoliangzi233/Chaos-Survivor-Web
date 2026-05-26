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
  shards: 0,
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
    damageScale: 1,
    dirX: 1,
    dirY: 0,
    trailTimer: 0,
  };
}

export function createWeapons() {
  return {
    arc: { level: 0, timer: 0, cooldown: 0.72, damage: 20, range: 620, chainRange: 170, chains: 3, falloff: 0.78, quality: "common", qualityMult: 1 },
    ice: { level: 0, timer: 0.8, cooldown: 1.05, count: 1, damage: 16, speed: 430, turnSpeed: 5.2, freezeDuration: 0.45, quality: "common", qualityMult: 1 },
    missile: { level: 0, timer: 1.2, cooldown: 1.75, damage: 26, speed: 360, explodeRadius: 96, explodeDamage: 24, turnSpeed: 2.5, quality: "common", qualityMult: 1 },
    boomerang: { level: 0, timer: 1.4, cooldown: 1.9, count: 1, damage: 20, speed: 520, returnAfter: 0.52, returnSpeed: 1.25, quality: "common", qualityMult: 1 },
    drone: { level: 0, angle: 0, count: 0, orbitRadius: 78, acquireRange: 560, attackRange: 420, fireCooldown: 0.42, bulletDamage: 9, bulletSpeed: 520, batteryMax: 100, shotCost: 22, rechargeRate: 34, drones: [], quality: "common", qualityMult: 1 },
    pulse: { level: 0, timer: 2.4, cooldown: 3.4, damage: 24, radius: 102, quality: "common", qualityMult: 1 },
  };
}

export function createInventory() {
  return {
    selectedWeaponUid: null,
    weaponSlots: [],
    items: [
      { id: "shard_core", name: "晶核碎片", icon: "◆", qty: 0, desc: "击败敌人与拾取经验时获得的通用强化材料。" },
    ],
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
  state.shards = 0;
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
