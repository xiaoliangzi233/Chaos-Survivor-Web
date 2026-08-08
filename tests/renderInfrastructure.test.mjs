import test from "node:test";
import assert from "node:assert/strict";
import { CELL_SIZE, PARTICLE_LIMIT, WORLD_SIZE } from "../src/constants.js";
import { SpatialGrid } from "../src/systems/spatialGrid.js";
import { PerformanceMonitor } from "../src/systems/performanceMonitor.js";
import { particle } from "../src/effects.js";
import { world } from "../src/state.js";
import {
  isPixiBatchableEnemy,
  isPixiBatchableHazard,
} from "../src/systems/renderer.js";

test("SpatialGrid returns the same circular-query results as a full scan", () => {
  const grid = new SpatialGrid(WORLD_SIZE, CELL_SIZE);
  const entities = [];
  let seed = 0x6d2b79f5;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = 0; index < 430; index++) {
    const entity = {
      id: index,
      x: (random() - 0.5) * WORLD_SIZE,
      y: (random() - 0.5) * WORLD_SIZE,
      r: 0,
      dead: false,
    };
    entities.push(entity);
    grid.insert(entity);
  }

  for (let queryIndex = 0; queryIndex < 80; queryIndex++) {
    const x = (random() - 0.5) * WORLD_SIZE;
    const y = (random() - 0.5) * WORLD_SIZE;
    const radius = 40 + random() * 520;
    const actual = [];
    grid.forEachBucket(x - radius, y - radius, x + radius, y + radius, (bucket) => {
      for (const entity of bucket) {
        if ((entity.x - x) ** 2 + (entity.y - y) ** 2 <= (radius + entity.r) ** 2) actual.push(entity.id);
      }
    });
    const expected = entities
      .filter((entity) => (entity.x - x) ** 2 + (entity.y - y) ** 2 <= (radius + entity.r) ** 2)
      .map((entity) => entity.id);
    assert.deepEqual(actual.sort((a, b) => a - b), expected.sort((a, b) => a - b));
  }
});

test("SpatialGrid clears and reuses its allocated bucket arrays", () => {
  const grid = new SpatialGrid(WORLD_SIZE, CELL_SIZE);
  grid.insert({ x: 0, y: 0 });
  const bucket = grid.buckets[grid.indexForWorld(0, 0)];
  assert.equal(bucket.length, 1);
  grid.clear();
  assert.equal(bucket.length, 0);
  assert.equal(grid.size, 0);
  grid.insert({ x: 1, y: 1 });
  assert.equal(grid.buckets[grid.indexForWorld(1, 1)], bucket);
});

test("PerformanceMonitor reports bounded p50/p95/p99 samples", () => {
  const monitor = new PerformanceMonitor(30);
  for (let value = 1; value <= 40; value++) monitor.record("frame", value);
  const frame = monitor.getStats().timings.frame;
  assert.equal(frame.count, 30);
  assert.equal(frame.p50, 25);
  assert.equal(frame.p95, 39);
  assert.equal(frame.p99, 40);
  assert.equal(frame.max, 40);
});

test("particle budget protects critical feedback without growing the array", () => {
  world.particles.length = 0;
  for (let index = 0; index < PARTICLE_LIMIT; index++) {
    particle("mote", index, 0, { ambient: true, life: 1 + index / PARTICLE_LIMIT });
  }
  particle("spark", 99, 88, { critical: true, color: "#ffffff" });
  assert.equal(world.particles.length, PARTICLE_LIMIT);
  assert.equal(world.particles.some((entry) => entry.critical && entry.x === 99 && entry.y === 88), true);
  world.particles.length = 0;
});

test("storm tyrant actors and expensive storm hazards use direct Pixi batches", () => {
  assert.equal(isPixiBatchableEnemy({ type: "storm_tyrant", boss: true, elite: false }), true);
  assert.equal(isPixiBatchableHazard({ kind: "storm_laser_net" }), true);
  assert.equal(isPixiBatchableHazard({ kind: "storm_strike" }), true);
});
