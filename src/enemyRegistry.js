import { WORLD_SIZE, TAU, ENEMY_LIMIT } from "./constants.js";
import { state, world } from "./state.js";
import { clamp } from "./utils.js";
import { setSpawnConfigured } from "./enemies/BaseEnemy.js";
import { currentDifficulty } from "./difficulty.js";
import { Zombie } from "./enemies/zombie.js";
import { Lancer } from "./enemies/lancer.js";
import { Wisp } from "./enemies/wisp.js";
import { SlimeLarge } from "./enemies/slime_large.js";
import { SlimeMedium } from "./enemies/slime_medium.js";
import { SlimeSmall } from "./enemies/slime_small.js";
import { BlackholeMage } from "./enemies/blackhole_mage.js";
import { MechWorm } from "./enemies/mech_worm.js";
import { Doctor } from "./enemies/doctor.js";
import { Embermine } from "./enemies/embermine.js";
import { SiegePylon } from "./enemies/siege_pylon.js";
import { Razorbat } from "./enemies/razorbat.js";
import { BroodSeeder } from "./enemies/brood_seeder.js";
import { LineRaider } from "./enemies/line_raider.js";
import { ShieldCaster } from "./enemies/shield_caster.js";
import { Wizard } from "./enemies/wizard.js";
import { Exploder } from "./enemies/exploder.js";
import { Tank } from "./enemies/tank.js";
import { Pyromancer } from "./enemies/pyromancer.js";
import { LaserEye } from "./enemies/laser_eye.js";
import { Gunner } from "./enemies/gunner.js";
import { Artillery } from "./enemies/artillery.js";
import { EliteSummoner } from "./enemies/elite_summoner.js";
import { EliteBerserker } from "./enemies/elite_berserker.js";
import { EliteAssassin } from "./enemies/elite_assassin.js";
import { EliteSentinel } from "./enemies/elite_sentinel.js";
import { EliteMissileSniper } from "./enemies/elite_missile_sniper.js";
import { StormTyrant } from "./enemies/storm_tyrant.js";
import { VoidColossus } from "./enemies/void_colossus.js";
import { StormRailDevourer } from "./enemies/storm_rail_devourer.js";
import { DarkCrystalRift } from "./enemies/dark_crystal_rift.js";

const classes = {
  zombie: Zombie,
  lancer: Lancer,
  wisp: Wisp,
  slime_large: SlimeLarge,
  slime_medium: SlimeMedium,
  slime_small: SlimeSmall,
  blackhole_mage: BlackholeMage,
  mech_worm: MechWorm,
  doctor: Doctor,
  embermine: Embermine,
  siege_pylon: SiegePylon,
  razorbat: Razorbat,
  brood_seeder: BroodSeeder,
  line_raider: LineRaider,
  shield_caster: ShieldCaster,
  wizard: Wizard,
  exploder: Exploder,
  tank: Tank,
  pyromancer: Pyromancer,
  laser_eye: LaserEye,
  gunner: Gunner,
  artillery: Artillery,
  elite_summoner: EliteSummoner,
  elite_berserker: EliteBerserker,
  elite_assassin: EliteAssassin,
  elite_sentinel: EliteSentinel,
  elite_missile_sniper: EliteMissileSniper,
  storm_tyrant: StormTyrant,
  void_colossus: VoidColossus,
  storm_rail_devourer: StormRailDevourer,
  dark_crystal_rift: DarkCrystalRift,
};

export let enemyConfig = {};

export async function setupEnemyRegistry() {
  if (!Object.keys(enemyConfig).length) {
    const response = await fetch(new URL("./enemy-config.json", import.meta.url));
    const config = await response.json();
    enemyConfig = Object.fromEntries(Object.entries(config).map(([id, data]) => [id, { id, ...data }]));
  }
  setSpawnConfigured((id, x, y) => spawnEnemyById(id, x, y));
}

export function spawnEnemyById(id, x = null, y = null) {
  const difficulty = currentDifficulty();
  if (world.enemies.length >= (difficulty.enemyLimit || ENEMY_LIMIT)) return null;
  const cfg = enemyConfig[id];
  const Klass = classes[id] || Zombie;
  if (!cfg) return null;
  const pos = x == null || y == null ? randomSpawnPosition(cfg.radius) : { x, y };
  const e = new Klass(cfg, pos.x, pos.y);
  world.enemies.push(e);
  if (e.boss) world.boss = e;
  return e;
}

export function spawnWaveBoss() {
  const boss = Object.values(enemyConfig).find((entry) => entry.bossWave === state.wave);
  state.spawnedBossWaves ||= new Set();
  if (boss && !world.boss && !state.spawnedBossWaves.has(state.wave)) {
    const spawned = spawnEnemyById(boss.id);
    if (spawned) state.spawnedBossWaves.add(state.wave);
  }
}

export function isBossWave(wave) {
  return Object.values(enemyConfig).some((entry) => entry.bossWave === wave);
}

export function availableEnemyIdsForWave(wave) {
  return Object.values(enemyConfig)
    .filter((entry) => !entry.boss && entry.waves && wave >= entry.waves[0] && wave <= entry.waves[1])
    .map((entry) => entry.id);
}

export function randomEnemyForWave(wave) {
  const ids = availableEnemyIdsForWave(wave);
  return ids[Math.floor(Math.random() * ids.length)] || "zombie";
}

function randomSpawnPosition(radius) {
  const p = state.player;
  const angle = Math.random() * TAU;
  const dist = 720 + Math.random() * 220;
  const half = WORLD_SIZE / 2;
  return {
    x: clamp(p.x + Math.cos(angle) * dist, -half + radius, half - radius),
    y: clamp(p.y + Math.sin(angle) * dist, -half + radius, half - radius),
  };
}
