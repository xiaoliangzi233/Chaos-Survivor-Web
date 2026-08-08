import assert from "node:assert/strict";
import test from "node:test";

import { APOCALYPSE_WAVE_SCENARIOS } from "../src/config/apocalypse-wave-scenarios.js";
import {
  apocalypseScenarioRiskAtPoint,
  clearApocalypseScenarioEvent,
  startApocalypseScenarioEvent,
  updateApocalypseScenarioEvent,
} from "../src/systems/apocalypseScenarioEvents.js";
import { createPlayer, state, world } from "../src/state.js";

test("quadrant verdict exposes opposite safe and unsafe decisions to automatic movement", () => {
  resetWorld();
  const runtime = startEvent("quadrant_verdict");
  updateApocalypseScenarioEvent(runtime.config.intro + 0.1);
  assert.equal(apocalypseScenarioRiskAtPoint({ x: 300, y: 300, r: 14 }, runtime), 0);
  assert.ok(apocalypseScenarioRiskAtPoint({ x: -300, y: 300, r: 14 }, runtime) > 0);
  clearApocalypseScenarioEvent();
});

test("causal echo route keeps a bounded movement history", () => {
  resetWorld();
  const runtime = startEvent("causal_echo_route");
  for (let i = 0; i < 100; i++) {
    state.player.x = i * 4;
    state.player.y = Math.sin(i * 0.2) * 80;
    updateApocalypseScenarioEvent(0.1);
  }
  assert.ok(runtime.path.length > 0);
  assert.ok(runtime.path.length <= runtime.config.objectCap);
  clearApocalypseScenarioEvent();
});

test("ceasefire credit freezes only its cap and restores projectile state on cleanup", () => {
  resetWorld();
  const runtime = startEvent("ceasefire_credit");
  world.enemyProjectiles.push(...Array.from({ length: 90 }, (_, index) => ({
    x: index * 3,
    y: 0,
    vx: 120 + index,
    vy: 20,
    life: 8,
    nonColliding: false,
  })));
  updateApocalypseScenarioEvent(runtime.config.intro + 0.1);
  const frozen = world.enemyProjectiles.filter((projectile) => projectile.apocalypseStasis);
  assert.equal(frozen.length, runtime.config.projectileCap);
  assert.ok(frozen.every((projectile) => projectile.vx === 0 && projectile.vy === 0 && projectile.nonColliding));
  const originalVx = frozen[0].apocalypseStasis.vx;
  clearApocalypseScenarioEvent();
  assert.equal(frozen[0].vx, originalVx);
  assert.equal(frozen[0].nonColliding, false);
  assert.equal(frozen[0].apocalypseStasis, undefined);
});

function startEvent(type) {
  const event = APOCALYPSE_WAVE_SCENARIOS.find((scenario) => scenario.event?.type === type)?.event;
  assert.ok(event, `missing event fixture ${type}`);
  return startApocalypseScenarioEvent(event);
}

function resetWorld() {
  clearApocalypseScenarioEvent();
  state.player = createPlayer();
  state.debug = { enabled: false, invincible: false };
  state.waveScenarioRuntime = null;
  world.enemies.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.particles.length = 0;
  world.weaponFx.length = 0;
}
