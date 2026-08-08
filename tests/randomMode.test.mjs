import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { state } from "../src/state.js";
import {
  RANDOM_GOAL_ENDLESS,
  RUN_MODE_RANDOM,
  configureRandomModeRun,
  randomEffectiveWave,
  randomEnemyLimitForWave,
  randomEventProbabilitiesForWave,
  randomGrowthMultiplierForWave,
  randomModeCompletionReached,
  randomWaveScenarioFor,
  setRandomModeEnemyCatalogProvider,
} from "../src/systems/randomMode.js";
import {
  configurePlayerProgress,
  getBestRandomEndlessWave,
  loadPlayerProgress,
  recordBestRandomEndlessWave,
  recordPlayerCodexEntry,
} from "../src/systems/playerProgress.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const DIFFICULTIES = ["ember", "neon", "overclock", "singularity", "apocalypse", "void_crown"];
const CATALOG = {
  zombie: { id: "zombie", hp: 10, damage: 3, speed: 100, radius: 14, spawnWeight: 1 },
  wisp: { id: "wisp", hp: 12, damage: 4, speed: 130, radius: 12, spawnWeight: 1 },
  tank: { id: "tank", hp: 80, damage: 8, speed: 60, radius: 24, spawnWeight: 0.5 },
  thief: { id: "thief", hp: 20, damage: 1, speed: 150, radius: 12, spawnWeight: 0.2 },
  slime_king: { id: "slime_king", boss: true, hp: 900, damage: 18, speed: 70, radius: 52 },
};

beforeEach(async () => {
  globalThis.localStorage = new MemoryStorage();
  configurePlayerProgress();
  await loadPlayerProgress({ difficultyIds: DIFFICULTIES });
  setRandomModeEnemyCatalogProvider(() => CATALOG);
  state.difficulty = { id: "ember", enemyLimit: 420 };
  state.difficultyId = "ember";
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, seed: 12345 });
});

test("empty codex falls back to zombies and no random events", () => {
  const scenario = randomWaveScenarioFor(1);
  assert.deepEqual(scenario.pool, ["zombie"]);
  assert.deepEqual(scenario.randomEvents, []);
});

test("random pools only use unlocked enemies and events", () => {
  recordPlayerCodexEntry("enemies", "zombie");
  recordPlayerCodexEntry("enemies", "wisp");
  recordPlayerCodexEntry("events", "blind");
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, seed: 77 });

  for (let wave = 1; wave <= 35; wave++) {
    const scenario = randomWaveScenarioFor(wave);
    for (const id of scenario.pool) assert.ok(["zombie", "wisp"].includes(id), `locked enemy selected: ${id}`);
    for (const event of scenario.randomEvents) assert.equal(event.randomEventId, "blind");
  }
});

test("twenty wave and endless goals resolve completion differently", () => {
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, randomGoal: "twenty_waves", seed: 1 });
  assert.equal(randomModeCompletionReached(20), true);

  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, randomGoal: RANDOM_GOAL_ENDLESS, seed: 1 });
  assert.equal(randomModeCompletionReached(20), false);
});

test("endless mode forces boss waves every ten waves after wave ten", () => {
  recordPlayerCodexEntry("enemies", "zombie");
  recordPlayerCodexEntry("enemies", "slime_king");
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, randomGoal: RANDOM_GOAL_ENDLESS, seed: 5 });

  assert.equal(randomWaveScenarioFor(10).boss, "slime_king");
  assert.equal(randomWaveScenarioFor(20).boss, "slime_king");
  assert.equal(randomWaveScenarioFor(30).boss, "slime_king");
});

test("random event probabilities increase and remain capped", () => {
  const wave1 = randomEventProbabilitiesForWave(1);
  const wave8 = randomEventProbabilitiesForWave(8);
  const wave15 = randomEventProbabilitiesForWave(15);
  const wave30 = randomEventProbabilitiesForWave(30);

  assert.ok(wave8.first > wave1.first);
  assert.ok(wave15.second > wave8.second);
  assert.ok(wave30.third > wave15.third);
  assert.ok(wave30.first <= 0.75);
  assert.ok(wave30.second <= 0.45);
  assert.ok(wave30.third <= 0.18);
});

test("random events filter conflicting stacks", () => {
  for (const id of ["zombie", "wisp", "tank"]) recordPlayerCodexEntry("enemies", id);
  for (const id of ["blind", "invisible_brain_eaters", "gear_trap", "toxic_residue", "laser_disaster", "mirror_laser_gate"]) {
    recordPlayerCodexEntry("events", id);
  }
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, randomGoal: RANDOM_GOAL_ENDLESS, seed: 42 });

  for (let wave = 1; wave <= 80; wave++) {
    const ids = randomWaveScenarioFor(wave).randomEvents.map((entry) => entry.randomEventId);
    assert.ok(!(ids.includes("blind") && ids.includes("invisible_brain_eaters")), `visibility conflict on wave ${wave}`);
    assert.ok(ids.filter((id) => ["gear_trap", "toxic_residue", "laser_disaster", "mirror_laser_gate"].includes(id)).length <= 1, `hazard conflict on wave ${wave}`);
  }
});

test("random mode caps enemies independently and slows endless scaling after wave thirty", () => {
  assert.equal(randomEnemyLimitForWave(1), 120);
  state.difficulty.enemyLimit = 80;
  assert.equal(randomEnemyLimitForWave(1), 80);

  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, randomGoal: RANDOM_GOAL_ENDLESS, seed: 11 });
  assert.equal(randomEffectiveWave(30), 30);
  assert.ok(randomEffectiveWave(80) < 80);
  assert.ok(randomGrowthMultiplierForWave(20).hp > randomGrowthMultiplierForWave(1).hp);
  assert.ok(randomGrowthMultiplierForWave(20, { boss: true }).hp < randomGrowthMultiplierForWave(20).hp);
});

test("random endless best wave is persisted in player progress", async () => {
  recordBestRandomEndlessWave(37);
  configurePlayerProgress();
  await loadPlayerProgress({ difficultyIds: DIFFICULTIES });
  assert.equal(getBestRandomEndlessWave(), 37);
});
