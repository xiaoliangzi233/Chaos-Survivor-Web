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
  resizeCanvas,
  viewport,
} from "../src/systems/renderer.js";
import { syncCanvasTextureSize } from "../src/systems/renderers/pixiBackend.js";

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

test("resizeCanvas restores viewport dimensions from the explicit container", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { devicePixelRatio: 1.5, innerWidth: 1280, innerHeight: 720 };
  globalThis.document = { documentElement: { clientWidth: 1280, clientHeight: 720 } };
  try {
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      parentElement: { clientWidth: 640, clientHeight: 420 },
    };
    const ctx = {
      transform: null,
      imageSmoothingEnabled: true,
      setTransform(...args) {
        this.transform = args;
      },
    };
    const container = { clientWidth: 960, clientHeight: 540 };

    resizeCanvas(canvas, ctx, container);
    assert.equal(viewport.width, 960);
    assert.equal(viewport.height, 540);
    assert.equal(canvas.width, 1440);
    assert.equal(canvas.height, 810);
    assert.equal(canvas.style.width, "960px");
    assert.equal(canvas.style.height, "540px");

    container.clientWidth = 1280;
    container.clientHeight = 720;
    resizeCanvas(canvas, ctx, container);
    assert.equal(viewport.width, 1280);
    assert.equal(viewport.height, 720);
    assert.equal(canvas.width, 1920);
    assert.equal(canvas.height, 1080);
    assert.deepEqual(ctx.transform, [1.5, 0, 0, 1.5, 0, 0]);
    assert.equal(ctx.imageSmoothingEnabled, false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("syncCanvasTextureSize refreshes Pixi canvas texture dimensions after resize", () => {
  const calls = [];
  const texture = {
    source: {
      resize(width, height, dpr) {
        calls.push({ width, height, dpr });
      },
    },
    updated: false,
    update() {
      this.updated = true;
    },
  };

  syncCanvasTextureSize(texture, 1280, 720, 1.5);
  assert.deepEqual(calls, [{ width: 1280, height: 720, dpr: 1.5 }]);
  assert.equal(texture.updated, true);
});
