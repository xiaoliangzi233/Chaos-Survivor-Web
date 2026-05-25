import { FIRST_WAVE_SECONDS, waveDurationFor } from "./constants.js";

export const state = {
  mode: "menu",
  time: 0,
  wave: 1,
  waveDuration: FIRST_WAVE_SECONDS,
  waveTimeLeft: FIRST_WAVE_SECONDS,
  pendingNextWave: false,
  pendingVictory: false,
  kills: 0,
  shards: 0,
  spawnBudget: 0,
  victory: false,
  shake: 0,
  flash: 0,
  cameraX: 0,
  cameraY: 0,
  map: null,
  player: null,
  weapons: null,
};

export const world = {
  enemies: [],
  projectiles: [],
  gems: [],
  particles: [],
  grid: new Map(),
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
    xpNeed: 14,
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
    bolt: { level: 0, timer: 0, cooldown: 0.62, damage: 18, speed: 560 },
    dagger: { level: 0, timer: 1.3, cooldown: 1.55, count: 1, damage: 18 },
    ice: { level: 0, timer: 0.8, cooldown: 1.05, count: 1, damage: 16, speed: 430, turnSpeed: 4.5 },
    missile: { level: 0, timer: 1.2, cooldown: 1.75, damage: 26, speed: 360, explodeRadius: 86, explodeDamage: 22, turnSpeed: 2.4 },
    boomerang: { level: 0, timer: 1.4, cooldown: 1.9, count: 1, damage: 20, speed: 480, returnAfter: 0.32, returnSpeed: 1.2 },
    orb: { level: 0, angle: 0, count: 2, radius: 76, damage: 20, hitCd: 0.22 },
    pulse: { level: 0, timer: 2.4, cooldown: 3.4, damage: 24, radius: 102 },
  };
}

export function resetRun(map) {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.gems.length = 0;
  world.particles.length = 0;
  world.grid.clear();

  state.mode = "choosingWeapon";
  state.time = 0;
  state.wave = 1;
  state.waveDuration = waveDurationFor(1);
  state.waveTimeLeft = state.waveDuration;
  state.pendingNextWave = false;
  state.pendingVictory = false;
  state.kills = 0;
  state.shards = 0;
  state.spawnBudget = 0;
  state.victory = false;
  state.shake = 0;
  state.flash = 0;
  state.cameraX = 0;
  state.cameraY = 0;
  state.map = map;
  state.player = createPlayer();
  state.weapons = createWeapons();
}
