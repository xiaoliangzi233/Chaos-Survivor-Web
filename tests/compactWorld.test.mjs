import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ENEMY_LIMIT, WORLD_SIZE } from "../src/constants.js";
import { generateMap } from "../src/systems/map.js";
import {
  randomSpawnPosition,
  setEnemyConfigForTests,
  spawnEnemyById,
} from "../src/systems/enemyRegistry.js";
import {
  configureRandomModeRun,
  randomEnemyLimitForWave,
  RUN_MODE_RANDOM,
} from "../src/systems/randomMode.js";
import { createPlayer, state, world } from "../src/state.js";

const difficultyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/difficulty-config.json", import.meta.url), "utf8"));
const enemyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));

test("combat world is 2400 square and keeps every laboratory zone inside its bounds", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.314159;
  const map = generateMap();
  Math.random = originalRandom;
  const half = WORLD_SIZE / 2;

  assert.equal(WORLD_SIZE, 2400);
  assert.equal(map.rooms.length, 13);
  assert.deepEqual(
    [...new Set(map.rooms.map((room) => room.zone))].sort(),
    ["bio", "control", "cryo", "reactor", "service", "storage"],
  );
  for (const room of map.rooms) {
    assert.ok(room.x >= -half && room.y >= -half, `${room.id} minimum`);
    assert.ok(room.x + room.w <= half && room.y + room.h <= half, `${room.id} maximum`);
  }
  for (let left = 0; left < map.rooms.length; left++) {
    for (let right = left + 1; right < map.rooms.length; right++) {
      assert.equal(rectanglesOverlap(map.rooms[left], map.rooms[right]), false, `${map.rooms[left].id}/${map.rooms[right].id}`);
    }
  }

  const propKinds = new Set(map.props.map((prop) => prop.kind));
  for (const kind of ["reactorCore", "containmentChamber", "cryoArray", "cargoLift", "commandConsole"]) {
    assert.equal(propKinds.has(kind), true, kind);
  }
  assert.ok(map.props.length >= 80);
  assert.ok(map.floorDecals.length >= 120);
  assert.ok(map.energyLines.length >= 20);

  for (const prop of map.props) {
    assert.ok(Math.abs(prop.x) + (prop.size || 0) <= half + 0.001, `${prop.kind} x`);
    assert.ok(Math.abs(prop.y) + (prop.size || 0) <= half + 0.001, `${prop.kind} y`);
  }
  for (const line of map.energyLines) {
    for (const value of [line.x1, line.y1, line.x2, line.y2]) assert.ok(Math.abs(value) <= half + 0.001);
  }
});

test("difficulty and random enemy caps equal one third of their former limits", () => {
  assert.equal(ENEMY_LIMIT, 140);
  assert.deepEqual(
    Object.fromEntries(Object.entries(difficultyConfig).map(([id, entry]) => [id, entry.enemyLimit])),
    { ember: 83, neon: 100, overclock: 116, singularity: 136, apocalypse: 140, void_crown: 143 },
  );

  resetWorld();
  state.difficulty = { id: "ember", enemyLimit: 143 };
  configureRandomModeRun({ runMode: RUN_MODE_RANDOM, seed: 41 });
  assert.equal(randomEnemyLimitForWave(1), 120);
  state.randomRun.scenarios["10"] = { wave: 10, pool: [], boss: "storm_tyrant" };
  assert.equal(randomEnemyLimitForWave(10), 73);
});

test("spawn candidates stay in bounds and prefer positions outside the player view", () => {
  resetWorld();
  state.player.x = 0;
  state.player.y = 0;
  const originalRandom = Math.random;
  let seed = 0x51f15e;
  Math.random = () => {
    seed = Math.imul(seed ^ seed >>> 15, seed | 1);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, seed | 61);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
  const position = randomSpawnPosition(32);
  Math.random = originalRandom;
  const half = WORLD_SIZE / 2;
  assert.ok(Math.abs(position.x) <= half - 32);
  assert.ok(Math.abs(position.y) <= half - 32);
  assert.ok(Math.hypot(position.x, position.y) >= 560);
});

test("a Boss can spawn while ordinary enemies occupy the configured cap", () => {
  resetWorld();
  setEnemyConfigForTests(Object.fromEntries(
    Object.entries(enemyConfig).map(([id, entry]) => [id, { id, ...entry }]),
  ));
  state.difficultyId = "ember";
  state.difficulty = {
    id: "ember",
    enemyLimit: 83,
    enemyHp: 1,
    enemyDamage: 1,
    enemySpeed: 1,
    enemyAttackSpeed: 1,
    bossHp: 1,
    bossDamage: 1,
  };
  for (let index = 0; index < 83; index++) world.enemies.push({ type: "dummy", dead: false });
  const boss = spawnEnemyById("storm_tyrant", 0, 0);
  assert.ok(boss);
  assert.equal(boss.type, "storm_tyrant");
  assert.equal(world.enemies.length, 84);
  assert.equal(world.boss, boss);
});

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resetWorld() {
  world.enemies.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.boss = null;
  state.player = createPlayer();
  state.wave = 1;
  state.difficultyId = "neon";
  state.difficulty = {
    id: "neon",
    enemyLimit: 100,
    enemyHp: 1,
    enemyDamage: 1,
    enemySpeed: 1,
    enemyAttackSpeed: 1,
    bossHp: 1,
    bossDamage: 1,
  };
  state.runMode = "standard";
  state.waveScenario = null;
}
