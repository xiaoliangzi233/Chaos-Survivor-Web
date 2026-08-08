import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { waveScenarioFor, waveScenarioSpawnPool } from "../src/config/wave-scenario-config.js";
import {
  RiftbladeSaint,
  RIFTBLADE_PHASE_THRESHOLDS,
  RIFTBLADE_SCREEN_PRESSURE,
} from "../src/enemies/riftblade_saint.js";
import { createPlayer, state, world } from "../src/state.js";
import { setEnemyConfigForTests, spawnEnemyById } from "../src/systems/enemyRegistry.js";
import { updateEnemies } from "../src/systems/entities.js";
import { isCodexUnlocked } from "../src/systems/codex.js";
import { bossContext } from "../src/ai/bossStrategy.js";
import { collectThreats } from "../src/ai/riskModel.js";
import { WORLD_SIZE } from "../src/constants.js";

const enemyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));

test("apocalypse wave 10 exclusively declares the riftblade saint", () => {
  const scenario = waveScenarioFor("apocalypse", 10);
  assert.equal(scenario?.boss, "riftblade_saint");
  assert.equal(scenario?.spawnRate, 0);
  assert.deepEqual(waveScenarioSpawnPool("apocalypse", 10), []);
  assert.equal(waveScenarioFor("apocalypse", 9)?.event?.type, "doom_ledger");
  assert.ok(waveScenarioSpawnPool("apocalypse", 9).length > 0);
  assert.equal(waveScenarioFor("singularity", 10)?.boss, "storm_tyrant");
});

test("riftblade saint config supplies the boss and codex metadata", () => {
  const config = enemyConfig.riftblade_saint;
  assert.equal(config.name, "霓渊剑圣·断界");
  assert.equal(config.hp, 60000);
  assert.equal(config.damage, 34);
  assert.equal(config.defense, 6);
  assert.equal(config.difficultyWaves.apocalypse.bossWave, 10);
  assert.deepEqual(config.difficulties, ["apocalypse"]);
  assert.ok(config.desc.length > 20);
  assert.ok(config.tip.includes("剑痕"));
});

test("registry spawns the custom class and unlocks its codex entry", () => {
  resetBossState();
  setEnemyConfigForTests({ riftblade_saint: { id: "riftblade_saint", ...enemyConfig.riftblade_saint } });
  const boss = spawnEnemyById("riftblade_saint", 420, 0);
  assert.ok(boss instanceof RiftbladeSaint);
  assert.equal(world.boss, boss);
  assert.equal(isCodexUnlocked("enemies", "riftblade_saint"), true);
});

test("phase gates prevent burst damage from skipping the sword array transition", () => {
  resetBossState();
  const boss = createBoss();
  world.enemies.push(boss);
  world.boss = boss;
  world.enemyProjectiles.push({ riftbladeOwner: boss, life: 2 });
  world.hazards.push({ riftbladeOwner: boss, life: 2 });
  world.hazards.push({ kind: "unrelated", life: 2 });

  boss.takeDamage(boss.maxHp * 3, boss.x, boss.y);

  assert.equal(boss.phaseLevel, 2);
  assert.equal(boss.mode, "phase_transition");
  assert.equal(boss.hp, boss.maxHp * RIFTBLADE_PHASE_THRESHOLDS[0]);
  assert.equal(boss.pendingForcedSkill, "eight_gate");
  assert.equal(world.enemyProjectiles.length, 0);
  assert.equal(world.hazards.length, 1);
  assert.equal(world.hazards[0].kind, "unrelated");
});

test("flash draw locks its direction for the full warning window", () => {
  resetBossState();
  const boss = createBoss();
  boss.x = 0;
  boss.y = 0;
  state.player.x = 460;
  state.player.y = 60;
  boss.motion.lastX = state.player.x;
  boss.motion.lastY = state.player.y;

  boss.beginSkill("flash_draw");
  const lockedAngle = boss.lockAngle;
  const warning = world.hazards.find((hazard) => hazard.kind === "riftblade_slash");
  assert.ok(warning);
  assert.equal(warning.armDuration, 0.7);

  state.player.x = -500;
  state.player.y = 700;
  boss.modeTimer = 0;
  boss.update(0.016);

  assert.equal(boss.mode, "riftblade_dash");
  assert.ok(Math.abs(Math.atan2(boss.dashVy, boss.dashVx) - lockedAngle) < 1e-9);
  assert.equal(warning.angle, lockedAngle);
});

test("riftblade slash damage waits 0.05 seconds after the active beam appears", () => {
  resetBossState();
  const boss = createBoss();
  boss.x = 0;
  boss.y = 0;
  state.player.x = 420;
  state.player.y = 0;
  state.player.invuln = 0;
  boss.motion.lastX = state.player.x;
  boss.motion.lastY = state.player.y;
  boss.beginSkill("flash_draw");
  const warning = world.hazards.find((hazard) => hazard.kind === "riftblade_slash");
  const hpBefore = state.player.hp;

  warning.armTime = 0.01;
  updateEnemies(0.02);
  assert.equal(state.player.hp, hpBefore);
  assert.equal(warning.damageDelay, 0.05);

  updateEnemies(0.04);
  assert.equal(state.player.hp, hpBefore);
  updateEnemies(0.011);
  assert.ok(state.player.hp < hpBefore);
});

test("automatic movement AI recognizes sword windups and full-map slash lines", () => {
  resetBossState();
  const boss = createBoss();
  boss.mode = "windup";
  boss.currentSkill = "flash_draw";
  world.boss = boss;
  world.enemies.push(boss);
  state.player.x = 1700;
  world.hazards.push({
    kind: "riftblade_slash",
    x: 0,
    y: 0,
    r: 28,
    width: 28,
    length: 4400,
    angle: 0,
    armTime: 0.7,
    life: 0.92,
    damage: 28,
  });

  assert.equal(bossContext(state, world).dashLike, true);
  const line = collectThreats(state, world, { queryRadius: 620 }).find((threat) => threat.source.kind === "riftblade_slash");
  assert.ok(line, "full-map slash should be considered even when its center is outside the query radius");
  assert.equal(line.line, true);
  assert.equal(line.kind, "warning_line");
});

test("riftblade skills build phase-scaled cross-screen pressure with bounded projectile density", () => {
  resetBossState();
  const boss = createBoss();

  boss.launchMoonReturn();
  assert.equal(world.enemyProjectiles.filter((projectile) => projectile.riftbladeOwner === boss).length, RIFTBLADE_SCREEN_PRESSURE.moonProjectiles[0]);

  boss.clearOwnedEffects();
  boss.beginSkill("flash_draw");
  const dashLine = world.hazards.find((hazard) => hazard.style === "draw");
  assert.ok(dashLine.length >= RIFTBLADE_SCREEN_PRESSURE.dashWarningLength);

  boss.clearOwnedEffects();
  boss.phaseLevel = 2;
  boss.launchEightGate();
  const gateLines = world.hazards.filter((hazard) => hazard.style === "gate");
  assert.equal(gateLines.length, 12);
  assert.ok(gateLines.every((hazard) => hazard.length === WORLD_SIZE * 1.3));

  boss.clearOwnedEffects();
  boss.phaseLevel = 3;
  boss.launchBladeRain();
  const bladeRain = world.hazards.filter((hazard) => hazard.kind === "riftblade_bladefall");
  assert.equal(bladeRain.length, RIFTBLADE_SCREEN_PRESSURE.bladeRainWaves);
  assert.equal(bladeRain.reduce((count, hazard) => count + hazard.lines.length, 0), RIFTBLADE_SCREEN_PRESSURE.bladeRainLines);
  const [bladeA, bladeB] = bladeRain[0].lines;
  const bladeGap = Math.hypot(bladeA.x1 - bladeB.x1, bladeA.y1 - bladeB.y1)
    - (bladeRain[0].width + state.player.r) * 2;
  assert.ok(bladeGap >= RIFTBLADE_SCREEN_PRESSURE.bladeRainCorridor - 0.001);
  const bladeThreat = collectThreats(state, world, { queryRadius: 620 })
    .find((threat) => threat.sourceKind === "riftblade_bladefall");
  assert.equal(bladeThreat?.kind, "warning_line");
  assert.equal(bladeThreat?.lines?.length, 2);

  boss.clearOwnedEffects();
  boss.launchJudgment();
  assert.equal(world.hazards.filter((hazard) => hazard.style?.startsWith("judgment")).length, RIFTBLADE_SCREEN_PRESSURE.judgmentLines);
  assert.ok(world.enemyProjectiles.length >= 20);
  assert.ok(world.enemyProjectiles.length <= RIFTBLADE_SCREEN_PRESSURE.peakProjectiles);
});

function createBoss() {
  return new RiftbladeSaint({ id: "riftblade_saint", ...enemyConfig.riftblade_saint }, 380, 0);
}

function resetBossState() {
  world.enemies.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.particles.length = 0;
  world.boss = null;
  state.player = createPlayer();
  state.player.x = 0;
  state.player.y = 0;
  state.player.invuln = 999;
  state.player.damageScale = 1;
  state.difficultyId = "apocalypse";
  state.wave = 10;
  state.time = 0;
  state.spawnedBossWaves = new Set();
}
