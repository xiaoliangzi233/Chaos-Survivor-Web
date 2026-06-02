import { WORLD_SIZE, TAU, ENEMY_LIMIT } from "../constants.js";
import { state, world } from "../state.js";
import { clamp } from "../utils.js";
import { setSpawnConfigured } from "../enemies/BaseEnemy.js";
import { currentDifficulty, difficultyOrder } from "../difficulty.js";
import { recordCodexEntry } from "./codex.js";
import { emberWaveScenario, emberWaveSpawnPool } from "../config/ember-wave-scenarios.js";
import { Zombie } from "../enemies/zombie.js";
import { Lancer } from "../enemies/lancer.js";
import { Wisp } from "../enemies/wisp.js";
import { SlimeLarge } from "../enemies/slime_large.js";
import { SlimeMedium } from "../enemies/slime_medium.js";
import { SlimeSmall } from "../enemies/slime_small.js";
import { SlimeDiamond } from "../enemies/slime_diamond.js";
import { SlimeGold } from "../enemies/slime_gold.js";
import { SlimeGlow } from "../enemies/slime_glow.js";
import { SlimeWeeping } from "../enemies/slime_weeping.js";
import { SlimeDevil } from "../enemies/slime_devil.js";
import { SlimeAngel } from "../enemies/slime_angel.js";
import { Thief } from "../enemies/thief.js";
import { BlackholeMage } from "../enemies/blackhole_mage.js";
import { MechWorm } from "../enemies/mech_worm.js";
import { Doctor } from "../enemies/doctor.js";
import { Embermine } from "../enemies/embermine.js";
import { SiegePylon } from "../enemies/siege_pylon.js";
import { Razorbat } from "../enemies/razorbat.js";
import { BroodSeeder } from "../enemies/brood_seeder.js";
import { LineRaider } from "../enemies/line_raider.js";
import { ShieldCaster } from "../enemies/shield_caster.js";
import { Wizard } from "../enemies/wizard.js";
import { Pentastar } from "../enemies/pentastar.js";
import { Gearfiend } from "../enemies/gearfiend.js";
import { PrismMedic } from "../enemies/prism_medic.js";
import { PhaseMirage } from "../enemies/phase_mirage.js";
import { MagnetRaider } from "../enemies/magnet_raider.js";
import { MagmaBeetle } from "../enemies/magma_beetle.js";
import { Exploder } from "../enemies/exploder.js";
import { Tank } from "../enemies/tank.js";
import { Pyromancer } from "../enemies/pyromancer.js";
import { LaserEye } from "../enemies/laser_eye.js";
import { Gunner } from "../enemies/gunner.js";
import { Artillery } from "../enemies/artillery.js";
import { StormTyrant } from "../enemies/storm_tyrant.js";
import { StormRailDevourer } from "../enemies/storm_rail_devourer.js";
import { TwinAbyssalEyes } from "../enemies/twin_abyssal_eyes.js";
import { PolarCrystalWraith } from "../enemies/polar_crystal_wraith.js";

const classes = {
  zombie: Zombie,
  lancer: Lancer,
  wisp: Wisp,
  slime_large: SlimeLarge,
  slime_medium: SlimeMedium,
  slime_small: SlimeSmall,
  slime_diamond: SlimeDiamond,
  slime_gold: SlimeGold,
  slime_glow: SlimeGlow,
  slime_weeping: SlimeWeeping,
  slime_devil: SlimeDevil,
  slime_angel: SlimeAngel,
  thief: Thief,
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
  pentastar: Pentastar,
  gearfiend: Gearfiend,
  prism_medic: PrismMedic,
  phase_mirage: PhaseMirage,
  magnet_raider: MagnetRaider,
  magma_beetle: MagmaBeetle,
  exploder: Exploder,
  tank: Tank,
  pyromancer: Pyromancer,
  laser_eye: LaserEye,
  gunner: Gunner,
  artillery: Artillery,
  storm_tyrant: StormTyrant,
  storm_rail_devourer: StormRailDevourer,
  twin_abyssal_eyes: TwinAbyssalEyes,
  polar_crystal_wraith: PolarCrystalWraith,
};
const WAVE_SPAWN_LIMITS = {
  thief: 3,
};

export let enemyConfig = {};

export function setEnemyConfigForTests(config) {
  enemyConfig = config;
}

export async function setupEnemyRegistry() {
  if (!Object.keys(enemyConfig).length) {
    const response = await fetch(new URL("../config/enemy-config.json", import.meta.url), { cache: "no-store" });
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
  if (!canSpawnLimitedEnemy(id)) return null;
  const pos = x == null || y == null ? randomSpawnPosition(cfg.radius) : { x, y };
  const e = new Klass(cfg, pos.x, pos.y);
  world.enemies.push(e);
  recordLimitedEnemySpawn(id);
  if (e.boss) world.boss = e;
  recordCodexEntry("enemies", id);
  return e;
}

export function spawnWaveBoss() {
  const boss = Object.values(enemyConfig).find((entry) => entry.boss && isEnemyAvailableFor(entry, state.wave));
  state.spawnedBossWaves ||= new Set();
  if (boss && !world.boss && !state.spawnedBossWaves.has(state.wave)) {
    const spawned = spawnEnemyById(boss.id);
    if (spawned) state.spawnedBossWaves.add(state.wave);
  }
}

export function isBossWave(wave) {
  return Object.values(enemyConfig).some((entry) => entry.boss && isEnemyAvailableFor(entry, wave));
}

export function availableEnemyIdsForWave(wave) {
  return Object.values(enemyConfig)
    .filter((entry) => !entry.boss && isEnemyAvailableFor(entry, wave))
    .map((entry) => entry.id);
}

export function randomEnemyForWave(wave) {
  const difficultyId = state.difficultyId || currentDifficulty()?.id;
  const entries = Object.values(enemyConfig).filter((entry) => !entry.boss && isEnemyAvailableFor(entry, wave, difficultyId) && canSpawnLimitedEnemy(entry.id));
  const weighted = entries
    .map((entry) => ({ id: entry.id, weight: spawnWeightFor(entry, wave, difficultyId) }))
    .filter((entry) => entry.weight > 0);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return weighted[weighted.length - 1]?.id || "zombie";
}

export function decorativeEnemyIds() {
  return Object.values(enemyConfig)
    .filter((entry) => !entry.boss && classes[entry.id])
    .map((entry) => entry.id);
}

export function createDecorativeEnemy(id, x, y) {
  const cfg = enemyConfig[id];
  const Klass = classes[id];
  if (!cfg || !Klass) return null;
  const enemy = new Klass(cfg, x, y);
  enemy.dead = false;
  enemy.flash = 0;
  enemy.shielded = false;
  return enemy;
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

function isEnemyAvailableFor(entry, wave, difficultyId = state.difficultyId || currentDifficulty()?.id) {
  if (difficultyId === "ember" && !isAllowedByEmberScenario(entry, wave)) return false;
  return isWaveAllowed(entry, wave, difficultyId) && isDifficultyAllowed(entry, difficultyId);
}

function canSpawnLimitedEnemy(id) {
  const limit = WAVE_SPAWN_LIMITS[id];
  if (!limit) return true;
  syncLimitedEnemyWave(id);
  return state[`${id}SpawnCount`] < limit;
}

function recordLimitedEnemySpawn(id) {
  const limit = WAVE_SPAWN_LIMITS[id];
  if (!limit) return;
  syncLimitedEnemyWave(id);
  state[`${id}SpawnCount`] = (state[`${id}SpawnCount`] || 0) + 1;
}

function syncLimitedEnemyWave(id) {
  const waveKey = `${id}SpawnWave`;
  const countKey = `${id}SpawnCount`;
  if (state[waveKey] === state.wave) return;
  state[waveKey] = state.wave;
  state[countKey] = 0;
}

function isAllowedByEmberScenario(entry, wave) {
  const scenario = emberWaveScenario(wave);
  if (!scenario) return false;
  if (entry.boss) return scenario.boss === entry.id;
  return emberWaveSpawnPool(wave).includes(entry.id);
}

function isWaveAllowed(entry, wave, difficultyId) {
  const difficultyRules = entry.difficultyWaves || entry.difficultyWaveRules || entry.waveRulesByDifficulty;
  if (difficultyId && Object.prototype.hasOwnProperty.call(difficultyRules || {}, difficultyId)) {
    return isWaveRuleSetAllowed(entry, difficultyRules[difficultyId] || {}, wave, false);
  }
  return isWaveRuleSetAllowed(entry, entry, wave, true);
}

function isWaveRuleSetAllowed(entry, rules, wave, allowDefaultNormal) {
  const waveRules = entry.boss
    ? [rules.bossWave, rules.bossWaves, rules.bossWaveRanges, rules.waves, rules.waveRanges, rules.spawnWaves]
    : [rules.waves, rules.waveRanges, rules.spawnWaves];
  const hasRule = waveRules.some((rule) => rule != null);
  const allowed = hasRule ? waveRules.some((rule) => matchesWaveRule(rule, wave)) : allowDefaultNormal && !entry.boss;
  if (!allowed) return false;
  return !matchesWaveRule(rules.excludeWaves, wave);
}

function matchesWaveRule(rule, wave) {
  if (rule == null) return false;
  if (typeof rule === "number") return wave === rule;
  if (!Array.isArray(rule)) return false;
  if (rule.length === 2 && rule.every((value) => typeof value === "number")) {
    return wave >= rule[0] && wave <= rule[1];
  }
  return rule.some((item) => matchesWaveRule(item, wave));
}

function isDifficultyAllowed(entry, difficultyId) {
  const include = entry.difficulties || entry.difficultyIds || entry.difficulty;
  if (include && !toList(include).includes(difficultyId)) return false;
  const exclude = entry.excludeDifficulties || entry.disabledDifficulties;
  if (exclude && toList(exclude).includes(difficultyId)) return false;
  const currentIndex = difficultyOrder.indexOf(difficultyId);
  const minIndex = difficultyOrder.indexOf(entry.minDifficulty);
  const maxIndex = difficultyOrder.indexOf(entry.maxDifficulty);
  if (entry.minDifficulty && currentIndex >= 0 && minIndex >= 0 && currentIndex < minIndex) return false;
  if (entry.maxDifficulty && currentIndex >= 0 && maxIndex >= 0 && currentIndex > maxIndex) return false;
  return true;
}

function spawnWeightFor(entry, wave, difficultyId) {
  const byDifficultyWave = entry.difficultyWaveWeights || entry.waveWeightsByDifficulty;
  const exact = byDifficultyWave?.[difficultyId]?.[wave];
  if (Number.isFinite(Number(exact))) return Math.max(0, Number(exact));
  const byDifficulty = entry.difficultyWeights || entry.spawnWeightsByDifficulty;
  const difficultyWeight = byDifficulty?.[difficultyId];
  if (Number.isFinite(Number(difficultyWeight))) return Math.max(0, Number(difficultyWeight));
  const baseWeight = entry.spawnWeight ?? entry.weight;
  return Number.isFinite(Number(baseWeight)) ? Math.max(0, Number(baseWeight)) : 1;
}

function toList(value) {
  return Array.isArray(value) ? value : [value];
}
