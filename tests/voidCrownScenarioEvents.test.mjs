import assert from "node:assert/strict";
import test from "node:test";

import { createPlayer, state, world } from "../src/state.js";
import {
  clearVoidCrownScenarioEvent,
  startVoidCrownScenarioEvent,
  updateVoidCrownScenarioEvent,
  voidCrownScenarioRiskAtPoint,
  voidCrownSpawnPosition,
} from "../src/systems/voidCrownScenarioEvents.js";

test("fold transit connects remote gates with bounded reusable state", () => {
  resetScenarioState();
  const runtime = startVoidCrownScenarioEvent({
    type: "fold_transit",
    intro: 0,
    cycle: 12,
    warning: 0,
    active: 10,
    gateRadius: 104,
    cooldown: 1,
  });
  updateVoidCrownScenarioEvent(0.01);
  const [from, to] = runtime.foldPair;
  state.player.x = from.x;
  state.player.y = from.y;
  updateVoidCrownScenarioEvent(0.01);
  assert.ok(Math.hypot(state.player.x - to.x, state.player.y - to.y) < 2);
  assert.ok(state.player.voidTransitCooldown > 0);
  assert.equal(world.hazards.length, 0);
});

test("void relay advances in order and exposes urgent navigation risk", () => {
  resetScenarioState();
  const runtime = startVoidCrownScenarioEvent({
    type: "void_relay",
    intro: 0,
    stepTime: 9,
    radius: 112,
    damage: 10,
    enemyDamage: 20,
  });
  updateVoidCrownScenarioEvent(0.01);
  state.player.x = -850;
  state.player.y = -520;
  updateVoidCrownScenarioEvent(0.01);
  assert.equal(runtime.stepIndex, 1);
  runtime.stepTimer = 0.25;
  assert.ok(voidCrownScenarioRiskAtPoint({ x: -900, y: 700, r: 14 }, runtime) > 24);
});

test("crown ingress seals one gate and redirects spawn origins away from it", () => {
  resetScenarioState();
  const runtime = startVoidCrownScenarioEvent({
    type: "crown_ingress",
    intro: 0,
    chooseTime: 4,
    holdTime: 9,
    gateRadius: 156,
    selectionRadius: 340,
  });
  state.player.x = 0;
  state.player.y = -400;
  updateVoidCrownScenarioEvent(0.01);
  assert.equal(runtime.sealedGate, 0);
  const positions = Array.from({ length: 12 }, () => voidCrownSpawnPosition(20));
  assert.ok(positions.every(Boolean));
  assert.ok(positions.every((position) => position.y > -2050), "sealed north gate must not emit enemies");
});

test("exile balance marks only the overloaded half as dangerous", () => {
  resetScenarioState();
  const runtime = startVoidCrownScenarioEvent({
    type: "exile_balance",
    intro: 0,
    cycle: 10,
    warning: 0,
    active: 8,
    tolerance: 2,
    damage: 10,
    enemyDamage: 20,
  });
  world.enemies.push(
    { x: 300, y: 0, r: 20, dead: false, boss: false, takeDamage() {} },
    { x: 420, y: 80, r: 20, dead: false, boss: false, takeDamage() {} },
    { x: 520, y: -80, r: 20, dead: false, boss: false, takeDamage() {} },
  );
  updateVoidCrownScenarioEvent(0.01);
  assert.equal(runtime.heavySide, 1);
  assert.ok(voidCrownScenarioRiskAtPoint({ x: 300, y: 0, r: 14 }, runtime) > 70);
  assert.equal(voidCrownScenarioRiskAtPoint({ x: -300, y: 0, r: 14 }, runtime), 0);
});

test("cleanup removes transit tags without touching ordinary world objects", () => {
  resetScenarioState();
  startVoidCrownScenarioEvent({
    type: "fold_transit",
    intro: 0,
    cycle: 12,
    warning: 0,
    active: 10,
    gateRadius: 104,
    cooldown: 1,
  });
  const enemy = { voidTransitCooldown: 1 };
  state.player.voidTransitCooldown = 1;
  world.enemies.push(enemy);
  world.hazards.push({ kind: "unrelated" });
  clearVoidCrownScenarioEvent();
  assert.equal(state.waveScenarioRuntime, null);
  assert.equal(state.player.voidTransitCooldown, undefined);
  assert.equal(enemy.voidTransitCooldown, undefined);
  assert.equal(world.hazards.length, 1);
});

function resetScenarioState() {
  world.enemies.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.gems.length = 0;
  world.coins.length = 0;
  state.player = createPlayer();
  state.player.x = 0;
  state.player.y = 0;
  state.player.invuln = 999;
  state.waveScenarioRuntime = null;
  state.difficultyId = "void_crown";
  state.difficulty = {
    id: "void_crown",
    enemyLimit: 430,
    enemyHp: 1.8,
    enemyDamage: 1.5,
    enemySpeed: 1.25,
    enemyAttackSpeed: 1.35,
  };
}
