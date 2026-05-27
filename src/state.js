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
  difficultyId: "ember",
  difficulty: null,
  difficultyProgress: null,
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
    damageScale: 1,
    dirX: 1,
    dirY: 0,
    trailTimer: 0,
  };
}

export function createWeapons() {
  return {
    arc: { level: 0, timer: 0, cooldown: 0.58, damage: 65, range: 720, chainRange: 205, chains: 3, falloff: 0.78, quality: "common", qualityMult: 1 },
    ice: { level: 0, timer: 0.8, cooldown: 0.84, count: 1, damage: 53, range: 980, speed: 500, turnSpeed: 5.8, freezeDuration: 0.45, quality: "common", qualityMult: 1 },
    missile: { level: 0, timer: 1.2, cooldown: 1.38, damage: 85, range: 1120, speed: 420, explodeRadius: 116, explodeDamage: 78, turnSpeed: 2.9, quality: "common", qualityMult: 1 },
    boomerang: { level: 0, timer: 1.4, cooldown: 1.48, count: 1, damage: 68, range: 840, speed: 610, returnAfter: 0.6, returnSpeed: 1.35, quality: "common", qualityMult: 1 },
    drone: { level: 0, angle: 0, count: 0, orbitRadius: 82, acquireRange: 650, attackRange: 500, fireCooldown: 0.34, bulletDamage: 33, bulletSpeed: 610, batteryMax: 150, shotCost: 20, rechargeRate: 46, drones: [], quality: "common", qualityMult: 1 },
    pulse: { level: 0, timer: 2.4, cooldown: 2.7, damage: 80, radius: 132, quality: "common", qualityMult: 1 },
    prism_railgun: { level: 0, timer: 1.05, cooldown: 1.65, count: 1, damage: 76, range: 960, width: 13, hitLimit: 6, refractionRange: 155, quality: "common", qualityMult: 1 },
    void_singularity: { level: 0, timer: 1.35, cooldown: 2.85, count: 1, damage: 28, range: 820, speed: 185, radius: 26, pullRadius: 170, damageRadius: 82, collapseRadius: 132, pullStrength: 310, pulseInterval: 0.58, life: 3.1, quality: "common", qualityMult: 1 },
    tesla_mine_chain: { level: 0, timer: 1.1, cooldown: 2.05, count: 1, damage: 34, range: 760, triggerRadius: 118, chainRange: 185, chainCount: 4, nodeLife: 5.2, armTime: 0.24, pulseCooldown: 0.62, fieldRadius: 108, quality: "common", qualityMult: 1 },
    starfall_scepter: { level: 0, timer: 1.6, cooldown: 2.65, count: 1, damage: 72, range: 1180, stars: 3, radius: 92, scarRadius: 86, scarDuration: 1.25, warningTime: 0.42, fallTime: 0.72, quality: "common", qualityMult: 1 },
    phase_needler: { level: 0, timer: 0.9, cooldown: 1.18, count: 1, damage: 38, range: 780, speed: 1040, needles: 2, pierce: 3, phaseDelay: 0.42, phaseRadius: 74, phaseDamage: 56, quality: "common", qualityMult: 1 },
    echo_tuning_fork: { level: 0, timer: 0.75, cooldown: 1.35, count: 1, damage: 54, range: 520, angle: Math.PI * 0.39, echoRadius: 118, echoDamage: 34, echoDuration: 0.55, resonanceDamage: 28, quality: "common", qualityMult: 1 },
    rift_loom: { level: 0, timer: 1.25, cooldown: 2.2, count: 1, damage: 34, range: 760, anchors: 3, radius: 142, lineWidth: 18, life: 0.8, collapseDamage: 72, scarDamage: 28, quality: "common", qualityMult: 1 },
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
  world.itemObjects.length = 0;
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
  state.difficultyId = state.difficultyId || "ember";
}
