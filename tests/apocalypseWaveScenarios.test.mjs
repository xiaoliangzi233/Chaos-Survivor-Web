import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { APOCALYPSE_WAVE_SCENARIOS } from "../src/config/apocalypse-wave-scenarios.js";

const enemyConfig = JSON.parse(await readFile(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));
const difficultyOrder = ["ember", "neon", "overclock", "singularity", "apocalypse", "void_crown"];

test("apocalypse owns one explicit scenario for every wave", () => {
  assert.equal(APOCALYPSE_WAVE_SCENARIOS.length, 20);
  assert.deepEqual(APOCALYPSE_WAVE_SCENARIOS.map((entry) => entry.wave), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(APOCALYPSE_WAVE_SCENARIOS.filter((entry) => entry.boss).map((entry) => entry.wave), [10, 20]);
  for (const scenario of APOCALYPSE_WAVE_SCENARIOS) {
    if (scenario.boss) {
      assert.deepEqual(scenario.pool, [], `boss wave ${scenario.wave} must own an empty pool`);
      assert.equal(scenario.spawnRate, 0, `boss wave ${scenario.wave} must disable ordinary spawning`);
    } else {
      assert.ok(scenario.pool.length > 0, `wave ${scenario.wave} needs an authored pool`);
      assert.ok(scenario.spawnRate > 0 && scenario.spawnRate <= 1.1, `wave ${scenario.wave} spawn rate is outside its budget`);
    }
  }
});

test("every apocalypse pool, elite, and boss is eligible on its authored wave", () => {
  for (const scenario of APOCALYPSE_WAVE_SCENARIOS) {
    for (const id of scenario.pool) assertEnemyEligible(id, scenario.wave, false);
    if (scenario.boss) assertEnemyEligible(scenario.boss, scenario.wave, true);
    for (const elite of eliteChoices(scenario.elite)) assertEnemyEligible(elite.id, scenario.wave, false);
  }
});

test("apocalypse uses seven mechanically distinct scene-event fingerprints", () => {
  const events = APOCALYPSE_WAVE_SCENARIOS.flatMap((scenario) => scenario.event ? [scenario.event] : []);
  assert.equal(events.length, 7);
  assert.equal(new Set(events.map((event) => event.type)).size, events.length);
  assert.equal(new Set(events.map((event) => [
    event.fingerprint.playerVerb,
    event.fingerprint.topology,
    event.fingerprint.timeModel,
    event.fingerprint.systemTarget,
  ].join("|"))).size, events.length);
  for (const event of events) {
    assert.ok(event.objectCap > 0 && event.objectCap <= 96, `${event.type} lacks a bounded object budget`);
    assert.ok(event.fingerprint.playerVerb, `${event.type} lacks a player verb`);
    assert.ok(event.fingerprint.topology, `${event.type} lacks a topology`);
    assert.ok(event.fingerprint.timeModel, `${event.type} lacks a time model`);
    assert.ok(event.fingerprint.systemTarget, `${event.type} lacks a system target`);
  }
});

function eliteChoices(elite) {
  if (!elite) return [];
  return elite.variants || [{ id: elite.id, variant: elite.variant }];
}

function assertEnemyEligible(id, wave, boss) {
  const entry = enemyConfig[id];
  assert.ok(entry, `unknown enemy ${id} on wave ${wave}`);
  assert.equal(Boolean(entry.boss), boss, `${id} boss classification mismatch on wave ${wave}`);
  assert.ok(isDifficultyAllowed(entry, "apocalypse"), `${id} is unavailable on apocalypse`);
  assert.ok(isWaveAllowed(entry, wave, "apocalypse"), `${id} is unavailable on apocalypse wave ${wave}`);
}

function isDifficultyAllowed(entry, difficultyId) {
  if (entry.difficulties && !entry.difficulties.includes(difficultyId)) return false;
  if (entry.excludeDifficulties?.includes(difficultyId)) return false;
  const current = difficultyOrder.indexOf(difficultyId);
  if (entry.minDifficulty && current < difficultyOrder.indexOf(entry.minDifficulty)) return false;
  if (entry.maxDifficulty && current > difficultyOrder.indexOf(entry.maxDifficulty)) return false;
  return true;
}

function isWaveAllowed(entry, wave, difficultyId) {
  const rules = Object.prototype.hasOwnProperty.call(entry.difficultyWaves || {}, difficultyId)
    ? entry.difficultyWaves[difficultyId]
    : entry;
  const candidates = entry.boss
    ? [rules.bossWave, rules.bossWaves, rules.bossWaveRanges, rules.waves, rules.waveRanges, rules.spawnWaves]
    : [rules.waves, rules.waveRanges, rules.spawnWaves];
  const hasRule = candidates.some((candidate) => candidate != null);
  if (hasRule && !candidates.some((candidate) => matchesWaveRule(candidate, wave))) return false;
  if (entry.boss && !hasRule) return false;
  return !matchesWaveRule(rules.excludeWaves, wave);
}

function matchesWaveRule(rule, wave) {
  if (rule == null) return false;
  if (typeof rule === "number") return rule === wave;
  if (!Array.isArray(rule)) return false;
  if (rule.length === 2 && rule.every((value) => typeof value === "number")) return wave >= rule[0] && wave <= rule[1];
  return rule.some((value) => matchesWaveRule(value, wave));
}
