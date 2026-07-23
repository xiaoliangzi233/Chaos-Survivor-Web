import { TOTAL_WAVES } from "../constants.js";
import { currentDifficulty } from "../difficulty.js";
import { state } from "../state.js";
import { getCodexEntries } from "./codex.js";

export const RUN_MODE_STANDARD = "standard";
export const RUN_MODE_RANDOM = "random";
export const RANDOM_GOAL_TWENTY_WAVES = "twenty_waves";
export const RANDOM_GOAL_ENDLESS = "endless";
export const RANDOM_WAVE_SECONDS = 60;

const RANDOM_NORMAL_CAP = 360;
const RANDOM_BOSS_CAP = 220;
const DEFAULT_RANDOM_SEED = 0x51f15e;

const EVENT_BLUEPRINTS = {
  blind: { effect: "blind", tags: ["visibility"], weight: 0.85 },
  ice_skate: { effect: "ice_skate", tags: ["movement"], weight: 0.75 },
  invisible_brain_eaters: { effect: "invisible_brain_eaters", tags: ["visibility", "stealth"], weight: 0.7 },
  mini_overdrive: { effect: "mini_overdrive", tags: ["enemy_speed"], weight: 0.72 },
  overclock_pulse: { effect: "overclock_pulse", tags: ["enemy_speed"], weight: 0.72 },
  fast_gears: { gearfiendMode: "fast_only", tags: ["enemy_speed"], weight: 0.55 },
  gear_trap: {
    event: { type: "hazard_field", count: 14, kind: "gear_trap", color: "#f59e0b", radius: 38, life: 999, fullWave: true, minPlayerDistance: 240 },
    tags: ["hazard_field"],
    weight: 0.78,
  },
  toxic_residue: {
    event: { type: "hazard_field", count: 13, kind: "toxic_residue", color: "#72ffb4", radius: 44, life: 999, fullWave: true, minPlayerDistance: 260, poisonDps: 7, poisonDuration: 2.4 },
    tags: ["hazard_field"],
    weight: 0.72,
  },
  gravity_well_grid: {
    event: { type: "gravity_well_grid", count: 5, radius: 112, life: 999, fullWave: true, minPlayerDistance: 280 },
    tags: ["node_field"],
    weight: 0.68,
  },
  ember_mine_rain: {
    event: { type: "ember_mine_rain", clusters: 4, minesPerCluster: 3, damage: 22, radius: 78, life: 14, minPlayerDistance: 240 },
    tags: ["hazard_field"],
    weight: 0.68,
  },
  prism_refraction: {
    event: { type: "prism_refraction", count: 5, radius: 94, life: 999, fullWave: true, minPlayerDistance: 260 },
    tags: ["node_field", "projectile"],
    weight: 0.62,
  },
  magnetic_drift: {
    event: { type: "magnetic_drift", count: 5, radius: 105, life: 999, fullWave: true, minPlayerDistance: 260 },
    tags: ["node_field", "resource"],
    weight: 0.62,
  },
  nest_spore_bloom: {
    event: { type: "nest_spore_bloom", count: 4, radius: 88, life: 999, fullWave: true, minPlayerDistance: 280 },
    tags: ["node_field", "summon"],
    weight: 0.56,
  },
  long_mech_worms: {
    event: { type: "long_mech_worms", count: 2 },
    tags: ["elite_like"],
    weight: 0.48,
  },
  laser_disaster: {
    event: { type: "sweeping_laser_maze", speed: 140, width: 32, damage: 22, life: 999, fullWave: true, armTime: 1.2 },
    tags: ["laser_field", "hazard_field"],
    weight: 0.5,
  },
  mirror_laser_gate: {
    event: { type: "mirror_laser_gate", count: 3, width: 22, damage: 17, life: 999, fullWave: true },
    tags: ["laser_field", "hazard_field"],
    weight: 0.46,
  },
  phase_tear_grid: {
    event: { type: "phase_tear_grid", count: 5, radius: 94, life: 999, fullWave: true, minPlayerDistance: 260 },
    tags: ["node_field", "movement"],
    weight: 0.58,
  },
  inferno_resonance: {
    event: { type: "inferno_resonance", count: 4, radius: 92, life: 999, fullWave: true, minPlayerDistance: 280 },
    tags: ["node_field", "projectile"],
    weight: 0.55,
  },
  reward_target: { reward: true, tags: ["reward"], weight: 0.45 },
};

let enemyCatalogProvider = () => ({});

export function setRandomModeEnemyCatalogProvider(provider) {
  enemyCatalogProvider = typeof provider === "function" ? provider : () => ({});
}

export function createRandomRunState(seed = null) {
  return {
    seed: Number.isFinite(Number(seed)) ? Number(seed) : randomSeed(),
    scenarios: {},
    eventHistory: [],
    enemyCaps: {
      normal: RANDOM_NORMAL_CAP,
      boss: RANDOM_BOSS_CAP,
    },
  };
}

export function configureRandomModeRun({ runMode = RUN_MODE_STANDARD, randomGoal = RANDOM_GOAL_TWENTY_WAVES, seed = null } = {}) {
  state.runMode = runMode === RUN_MODE_RANDOM ? RUN_MODE_RANDOM : RUN_MODE_STANDARD;
  state.randomGoal = randomGoal === RANDOM_GOAL_ENDLESS ? RANDOM_GOAL_ENDLESS : RANDOM_GOAL_TWENTY_WAVES;
  state.randomRun = createRandomRunState(seed);
  return state.randomRun;
}

export function isRandomMode() {
  return state.runMode === RUN_MODE_RANDOM;
}

export function isRandomEndlessMode() {
  return isRandomMode() && state.randomGoal === RANDOM_GOAL_ENDLESS;
}

export function randomWaveDurationFor() {
  return RANDOM_WAVE_SECONDS;
}

export function randomWaveScenarioFor(wave = state.wave) {
  if (!isRandomMode()) return null;
  state.randomRun ||= createRandomRunState();
  const key = String(Math.max(1, Math.floor(Number(wave) || 1)));
  state.randomRun.scenarios ||= {};
  if (!state.randomRun.scenarios[key]) {
    state.randomRun.scenarios[key] = generateRandomScenario(Number(key));
  }
  return state.randomRun.scenarios[key];
}

export function randomWaveSpawnPool(wave = state.wave) {
  return [...(randomWaveScenarioFor(wave)?.pool || ["zombie"])];
}

export function randomWaveSpawnRate(wave = state.wave) {
  return randomWaveScenarioFor(wave)?.spawnRate ?? 1;
}

export function randomEnemyLimitForWave(wave = state.wave) {
  const difficultyLimit = currentDifficulty()?.enemyLimit || RANDOM_NORMAL_CAP;
  const scenario = randomWaveScenarioFor(wave);
  const cap = scenario?.boss ? RANDOM_BOSS_CAP : RANDOM_NORMAL_CAP;
  return Math.max(1, Math.min(difficultyLimit, cap));
}

export function randomGrowthMultiplierForWave(wave = state.wave, { boss = false } = {}) {
  if (!isRandomMode()) return { hp: 1, damage: 1, speed: 1 };
  const effectiveWave = randomEffectiveWave(wave);
  const scale = boss ? 0.65 : 1;
  return {
    hp: 1 + effectiveWave * 0.045 * scale,
    damage: 1 + effectiveWave * 0.025 * scale,
    speed: Math.min(1.22, 1 + effectiveWave * 0.006 * scale),
  };
}

export function randomBossWaveFor(wave = state.wave) {
  return Boolean(randomWaveScenarioFor(wave)?.boss);
}

export function randomBossIdForWave(wave = state.wave) {
  return randomWaveScenarioFor(wave)?.boss || null;
}

export function randomModeCompletionReached(wave = state.wave) {
  return isRandomMode() && state.randomGoal === RANDOM_GOAL_TWENTY_WAVES && wave >= TOTAL_WAVES;
}

export function randomEventProbabilitiesForWave(wave) {
  return {
    first: Math.min(0.75, 0.10 + wave * 0.03),
    second: wave < 8 ? 0 : Math.min(0.45, (wave - 7) * 0.035),
    third: wave < 15 ? 0 : Math.min(0.18, (wave - 14) * 0.03),
  };
}

export function randomEffectiveWave(wave) {
  const normalized = Math.max(1, Number(wave) || 1);
  if (!isRandomEndlessMode() || normalized <= 30) return normalized;
  return 30 + Math.sqrt(normalized - 30) * 4;
}

function generateRandomScenario(wave) {
  const rng = mulberry32(hashSeed(`${state.randomRun?.seed || DEFAULT_RANDOM_SEED}:${wave}`));
  const catalog = enemyCatalogProvider() || {};
  const normalIds = unlockedEnemyIds(catalog, { boss: false });
  const bossIds = unlockedEnemyIds(catalog, { boss: true });
  const forcedBoss = isForcedBossWave(wave);
  const bossRoll = wave >= 5 && rng() < Math.min(0.55, 0.06 + wave * 0.025);
  const bossId = bossIds.length && (forcedBoss || bossRoll) ? weightedPick(bossIds.map((id) => ({ id, weight: threatWeight(catalog[id], wave, true) })), rng) : null;
  const poolSize = 3 + Math.floor(rng() * Math.min(4, Math.max(1, normalIds.length)));
  const pool = weightedSample(
    normalIds.map((id) => ({ id, weight: threatWeight(catalog[id], wave, false) })),
    Math.min(poolSize, normalIds.length),
    rng,
  );
  const events = chooseRandomEvents({ wave, rng, boss: Boolean(bossId), pool, catalog });
  const scenario = {
    wave,
    randomMode: true,
    pool: bossId ? [] : pool,
    spawnRate: bossId ? 0 : randomSpawnRateForWave(wave),
    randomEvents: events.map((entry) => entry.scenario),
  };
  if (bossId) scenario.boss = bossId;
  else if (forcedBoss) scenario.elite = randomEliteForPool(pool, rng);
  mergePrimaryRandomEvent(scenario);
  return scenario;
}

function unlockedEnemyIds(catalog, { boss }) {
  const unlocked = getCodexEntries("enemies");
  const ids = unlocked
    .filter((id) => catalog[id] && Boolean(catalog[id].boss) === boss)
    .filter((id) => boss || id !== "thief")
    .filter(Boolean);
  if (!boss && !ids.length && catalog.zombie) return ["zombie"];
  if (!boss && !ids.length) return ["zombie"];
  return ids;
}

function randomSpawnRateForWave(wave) {
  const effective = randomEffectiveWave(wave);
  return Math.min(2.45, 0.82 + effective * 0.045);
}

function chooseRandomEvents({ wave, rng, boss, pool, catalog }) {
  const unlocked = getCodexEntries("events");
  const candidates = unlocked
    .map((id) => ({ id, blueprint: EVENT_BLUEPRINTS[id] }))
    .filter((entry) => entry.blueprint)
    .filter((entry) => entry.id !== "reward_target" || pool.includes("thief") || catalog.thief);
  if (!candidates.length) return [];
  const probabilities = randomEventProbabilitiesForWave(wave);
  const targetCount = (rng() < probabilities.first ? 1 : 0)
    + (rng() < probabilities.second ? 1 : 0)
    + (rng() < probabilities.third ? 1 : 0);
  const maxCount = boss ? Math.min(1, targetCount) : targetCount;
  const selected = [];
  for (let i = 0; i < maxCount; i++) {
    const pool = candidates
      .filter((candidate) => !selected.some((entry) => entry.id === candidate.id))
      .filter((candidate) => !conflictsWithSelected(candidate.blueprint, selected.map((entry) => entry.blueprint), boss));
    if (!pool.length) break;
    const id = weightedPick(pool.map((entry) => ({
      id: entry.id,
      weight: (entry.blueprint.weight || 1) * (1 + wave * 0.018),
    })), rng);
    const blueprint = EVENT_BLUEPRINTS[id];
    selected.push({ id, blueprint, scenario: buildEventScenario(id, blueprint, wave) });
  }
  state.randomRun.eventHistory ||= [];
  state.randomRun.eventHistory.push({ wave, events: selected.map((entry) => entry.id) });
  return selected;
}

function buildEventScenario(id, blueprint, wave) {
  const scenario = { randomEventId: id };
  if (blueprint.event) scenario.event = scaleRandomEvent(blueprint.event, wave);
  if (blueprint.effect) scenario.effect = blueprint.effect;
  if (blueprint.gearfiendMode) scenario.gearfiendMode = blueprint.gearfiendMode;
  if (blueprint.reward) scenario.reward = true;
  return scenario;
}

function scaleRandomEvent(event, wave) {
  const scaled = structuredClone(event);
  if (Number.isFinite(scaled.count)) scaled.count = Math.min(18, scaled.count + Math.floor(wave / 14));
  if (Number.isFinite(scaled.clusters)) scaled.clusters = Math.min(6, scaled.clusters + Math.floor(wave / 16));
  return scaled;
}

function conflictsWithSelected(blueprint, selected, boss) {
  const tags = new Set(blueprint.tags || []);
  if (boss && (tags.has("hazard_field") || tags.has("laser_field") || tags.has("summon") || tags.has("elite_like"))) return true;
  for (const entry of selected) {
    const other = new Set(entry.tags || []);
    if (tags.has("hazard_field") && other.has("hazard_field")) return true;
    if (tags.has("laser_field") && other.has("laser_field")) return true;
    if (tags.has("visibility") && other.has("visibility")) return true;
    if (tags.has("enemy_speed") && other.has("enemy_speed")) return true;
    if (tags.has("node_field") && other.has("node_field")) return true;
  }
  return false;
}

function mergePrimaryRandomEvent(scenario) {
  const first = scenario.randomEvents?.[0];
  if (!first) return;
  if (first.event) scenario.event = first.event;
  if (first.effect) scenario.effect = first.effect;
  if (first.reward) scenario.reward = true;
  if (first.gearfiendMode) scenario.gearfiendMode = first.gearfiendMode;
}

function randomEliteForPool(pool, rng) {
  const id = pool.length ? pool[Math.floor(rng() * pool.length)] : "zombie";
  return { id, variant: rng() < 0.45 ? "giant" : "random_champion", count: 1 };
}

function isForcedBossWave(wave) {
  if (state.randomGoal === RANDOM_GOAL_ENDLESS) return wave >= 10 && wave % 10 === 0;
  return wave === 10 || wave === TOTAL_WAVES;
}

function threatWeight(entry, wave, boss) {
  if (!entry) return 1;
  const hp = Math.max(1, Number(entry.hp) || 1);
  const damage = Math.max(1, Number(entry.damage) || 1);
  const speed = Math.max(1, Number(entry.speed) || 1);
  const threat = Math.sqrt(hp) * 0.12 + damage * 0.55 + speed * 0.012 + (entry.radius || 12) * 0.025;
  const highThreatBias = Math.min(2.5, 0.65 + wave * 0.045);
  return Math.max(0.05, (Number(entry.spawnWeight ?? entry.weight) || 1) * (boss ? threat : 1 + threat * highThreatBias * 0.035));
}

function weightedSample(entries, count, rng) {
  const remaining = entries.filter((entry) => entry.weight > 0);
  const selected = [];
  while (selected.length < count && remaining.length) {
    const id = weightedPick(remaining, rng);
    selected.push(id);
    remaining.splice(remaining.findIndex((entry) => entry.id === id), 1);
  }
  return selected.length ? selected : ["zombie"];
}

function weightedPick(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
  if (total <= 0) return entries[0]?.id || "zombie";
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight || 0);
    if (roll <= 0) return entry.id;
  }
  return entries[entries.length - 1]?.id || "zombie";
}

function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
