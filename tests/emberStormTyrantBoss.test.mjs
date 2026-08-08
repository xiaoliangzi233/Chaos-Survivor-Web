import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { waveScenarioFor, waveScenarioSpawnPool } from "../src/config/wave-scenario-config.js";
import {
  StormTyrant,
  STORM_TYRANT_PHASE_THRESHOLDS,
  STORM_TYRANT_SAFE_CORRIDORS,
  STORM_TYRANT_SCREEN_PRESSURE,
} from "../src/enemies/storm_tyrant.js";
import { createPlayer, state, world } from "../src/state.js";
import { setEnemyConfigForTests, spawnEnemyById } from "../src/systems/enemyRegistry.js";
import { stormLineHazardHit, updateEnemies } from "../src/systems/entities.js";
import { isCodexUnlocked } from "../src/systems/codex.js";
import { bossContext } from "../src/ai/bossStrategy.js";
import { collectThreats } from "../src/ai/riskModel.js";

const enemyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));

test("difficulty 1 wave 10 exclusively declares the reworked storm tyrant", () => {
  const scenario = waveScenarioFor("ember", 10);
  assert.equal(scenario?.boss, "storm_tyrant");
  assert.equal(scenario?.bossProfile, "storm_throne_base");
  assert.equal(scenario?.spawnRate, 0);
  assert.deepEqual(waveScenarioSpawnPool("ember", 10), []);
  assert.equal(waveScenarioFor("singularity", 10)?.boss, "storm_tyrant");
  assert.equal(waveScenarioFor("singularity", 10)?.bossProfile, "singularity_three_phase");
});

test("storm tyrant config and difficulty 1 effective stats match the encounter contract", () => {
  resetBossState();
  const config = enemyConfig.storm_tyrant;
  const boss = createBoss();

  assert.equal(config.name, "风暴暴君·雷冕");
  assert.equal(config.hp, 40000);
  assert.equal(config.damage, 32);
  assert.equal(config.defense, 2);
  assert.deepEqual(config.difficulties, ["ember", "singularity"]);
  assert.equal(config.difficultyWaves.ember.bossWave, 10);
  assert.equal(config.difficultyWaves.singularity.bossWave, 10);
  assert.equal(boss.maxHp, 34000);
  assert.equal(boss.damage, 27.2);
  assert.equal(boss.speed, 63);
  assert.ok(config.desc.includes("气象统御机"));
  assert.ok(config.tip.includes("安全通道"));
});

test("registry constructs the custom class and unlocks its codex entry", () => {
  resetBossState();
  setEnemyConfigForTests({ storm_tyrant: { id: "storm_tyrant", ...enemyConfig.storm_tyrant } });
  const boss = spawnEnemyById("storm_tyrant", 430, 0);

  assert.ok(boss instanceof StormTyrant);
  assert.equal(world.boss, boss);
  assert.equal(isCodexUnlocked("enemies", "storm_tyrant"), true);
});

test("phase gates prevent burst damage from skipping storm scenes and clear only owned effects", () => {
  resetBossState();
  const boss = createBoss();
  world.enemies.push(boss);
  world.boss = boss;
  world.enemyProjectiles.push({ stormTyrantOwner: boss, life: 2 });
  world.hazards.push({ stormTyrantOwner: boss, kind: "storm_laser_net", life: 2 });
  world.hazards.push({ kind: "unrelated", life: 2 });

  boss.takeDamage(boss.maxHp * 4, boss.x, boss.y);

  assert.equal(boss.phaseLevel, 2);
  assert.equal(boss.mode, "phase_transition");
  assert.equal(boss.hp, boss.maxHp * STORM_TYRANT_PHASE_THRESHOLDS[0]);
  assert.equal(boss.pendingForcedSkill, "thunder_cage");
  assert.equal(world.enemyProjectiles.length, 0);
  assert.equal(world.hazards.length, 1);
  assert.equal(world.hazards[0].kind, "unrelated");

  boss.mode = "storm_recover";
  boss.takeDamage(boss.maxHp * 4, boss.x, boss.y);
  assert.equal(boss.phaseLevel, 3);
  assert.equal(boss.hp, boss.maxHp * STORM_TYRANT_PHASE_THRESHOLDS[1]);
  assert.equal(boss.pendingForcedSkill, "tempest_throne");
});

test("thunder lance locks its full corridor before the player changes direction", () => {
  resetBossState();
  const boss = createBoss();
  boss.x = 0;
  boss.y = 0;
  state.player.x = 480;
  state.player.y = 70;
  boss.motion.lastX = state.player.x;
  boss.motion.lastY = state.player.y;

  boss.beginSkill("thunder_lance");
  const lockedAngle = boss.lockAngle;
  const warning = world.hazards.find((hazard) => hazard.style === "lance");
  assert.ok(warning);
  assert.equal(warning.armDuration, 0.72);
  assert.ok(warning.length >= 980);
  assert.ok(Number.isFinite(warning.x1));
  assert.ok(Number.isFinite(warning.y1));
  assert.ok(Number.isFinite(warning.x2));
  assert.ok(Number.isFinite(warning.y2));
  assert.equal(warning.directionX, Math.cos(warning.angle));
  assert.equal(warning.directionY, Math.sin(warning.angle));
  world.boss = boss;
  assert.equal(bossContext(state, world).dashLike, true);

  state.player.x = -620;
  state.player.y = 850;
  boss.modeTimer = 0;
  boss.update(0.016);

  assert.equal(boss.mode, "storm_lance_dash");
  assert.ok(Math.abs(Math.atan2(boss.dashVy, boss.dashVx) - lockedAngle) < 1e-9);
  assert.equal(warning.angle, lockedAngle);
});

test("thunder cage publishes three non-overlapping waves with a guaranteed corridor", () => {
  resetBossState();
  const boss = createBoss();
  boss.phaseLevel = 2;
  boss.beginSkill("thunder_cage");
  const lines = world.hazards.filter((hazard) => hazard.style === "cage");

  assert.equal(lines.length, STORM_TYRANT_SCREEN_PRESSURE.cageWaves * 2);
  for (let wave = 0; wave < STORM_TYRANT_SCREEN_PRESSURE.cageWaves; wave++) {
    const pair = lines.filter((hazard) => hazard.cageWave === wave);
    assert.equal(pair.length, 2);
    const centerDistance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
    const corridor = centerDistance - (pair[0].width + state.player.r) * 2;
    assert.ok(corridor >= STORM_TYRANT_SAFE_CORRIDORS.cage - 0.001);
    assert.ok(pair[0].armTime < (lines.find((hazard) => hazard.cageWave === wave + 1)?.armTime ?? Infinity));
  }
});

test("automatic movement AI recognizes storm scenes, distant lines, and delayed strikes", () => {
  resetBossState();
  const boss = createBoss();
  boss.phaseLevel = 3;
  boss.mode = "storm_tempest_throne";
  boss.currentSkill = "tempest_throne";
  world.boss = boss;
  world.enemies.push(boss);
  state.player.x = 1700;
  world.hazards.push({
    kind: "storm_laser_net",
    x: 0,
    y: 0,
    r: 28,
    width: 28,
    length: 5000,
    angle: 0,
    armTime: 0.9,
    armDuration: 0.9,
    life: 1.2,
    damage: 24,
  });
  world.hazards.push({
    kind: "storm_strike",
    warningType: "circle",
    x: state.player.x,
    y: state.player.y,
    r: 68,
    armTime: 0.72,
    armDuration: 0.72,
    life: 0.92,
    damage: 20,
  });

  const context = bossContext(state, world);
  assert.equal(context.laserLike, true);
  const threats = collectThreats(state, world, { queryRadius: 620 });
  const line = threats.find((threat) => threat.sourceKind === "storm_laser_net");
  const strike = threats.find((threat) => threat.sourceKind === "storm_strike");
  assert.ok(line, "full-map storm line should not be filtered by center distance");
  assert.equal(line.line, true);
  assert.equal(line.kind, "warning_line");
  assert.equal(strike?.kind, "warning_circle");
});

test("storm tyrant lines can damage only once per telegraphed activation", () => {
  resetBossState();
  const boss = createBoss();
  boss.mode = "storm_recover";
  boss.modeTimer = 60;
  world.boss = boss;
  world.enemies.push(boss);
  state.player.hp = state.player.maxHp;
  state.player.invuln = 0;
  world.hazards.push({
    kind: "storm_laser_net",
    x: 0,
    y: 0,
    r: 24,
    width: 24,
    length: 1200,
    angle: 0,
    armTime: 0,
    armDuration: 0.72,
    life: 0.4,
    maxLife: 1.12,
    damage: 10,
    stormTyrantOwner: boss,
  });
  const hpBefore = state.player.hp;

  updateEnemies(0.01);
  const hpAfterFirstHit = state.player.hp;
  assert.ok(hpAfterFirstHit < hpBefore);
  state.player.invuln = 0;
  updateEnemies(0.01);
  assert.equal(state.player.hp, hpAfterFirstHit);
});

test("cached storm-line geometry matches the original segment collision", () => {
  let seed = 0x7e57c0de;
  const random = () => {
    seed = Math.imul(seed ^ seed >>> 15, seed | 1);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, seed | 61);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
  for (let lineIndex = 0; lineIndex < 40; lineIndex++) {
    const angle = random() * Math.PI * 2;
    const length = 600 + random() * 1800;
    const width = 8 + random() * 30;
    const x = (random() - 0.5) * 1200;
    const y = (random() - 0.5) * 1200;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const hazard = {
      x,
      y,
      angle,
      length,
      width,
      directionX,
      directionY,
      x1: x - directionX * length * 0.5,
      y1: y - directionY * length * 0.5,
      x2: x + directionX * length * 0.5,
      y2: y + directionY * length * 0.5,
    };
    hazard.minX = Math.min(hazard.x1, hazard.x2) - width;
    hazard.maxX = Math.max(hazard.x1, hazard.x2) + width;
    hazard.minY = Math.min(hazard.y1, hazard.y2) - width;
    hazard.maxY = Math.max(hazard.y1, hazard.y2) + width;
    for (let pointIndex = 0; pointIndex < 80; pointIndex++) {
      const body = {
        x: (random() - 0.5) * 2600,
        y: (random() - 0.5) * 2600,
        r: random() * 28,
      };
      assert.equal(stormLineHazardHit(hazard, body), originalStormLineHit(hazard, body));
    }
  }
});

test("difficulty 4 keeps the same storm kit with enhanced density and unchanged critical warnings", () => {
  resetBossState();
  state.difficultyId = "singularity";
  state.difficulty = {
    id: "singularity",
    enemyLimit: 410,
    enemySpeed: 1.12,
    enemyAttackSpeed: 1.17,
    bossHp: 1.85,
    bossDamage: 1.5,
  };
  state.waveScenario = waveScenarioFor("singularity", 10);
  const boss = createBoss();
  assert.equal(boss.enhancedProfile, true);

  boss.phaseLevel = 2;
  boss.beginSkill("thunder_cage");
  const cage = world.hazards.filter((hazard) => hazard.style === "cage");
  assert.equal(cage[0].armDuration, 0.95);
  const firstPair = cage.filter((hazard) => hazard.cageWave === 0);
  const centerDistance = Math.hypot(firstPair[0].x - firstPair[1].x, firstPair[0].y - firstPair[1].y);
  const corridor = centerDistance - (firstPair[0].width + state.player.r) * 2;
  assert.ok(corridor >= STORM_TYRANT_SAFE_CORRIDORS.enhancedCage - 0.001);

  boss.clearOwnedEffects();
  boss.phaseLevel = 3;
  boss.beginSkill("tempest_throne");
  assert.equal(
    world.hazards.filter((hazard) => hazard.style === "throne").length,
    STORM_TYRANT_SCREEN_PRESSURE.throneBeams[1],
  );
  assert.equal(world.hazards[0].armDuration, 1.02);
});

test("tempest throne keeps pressure bounded and all owned effects expire", () => {
  resetBossState();
  const boss = createBoss();
  boss.phaseLevel = 3;
  world.boss = boss;
  world.enemies.push(boss);
  boss.beginSkill("tempest_throne");

  assert.equal(
    world.hazards.filter((hazard) => hazard.style === "throne").length,
    STORM_TYRANT_SCREEN_PRESSURE.throneBeams[0],
  );

  let maxHazards = world.hazards.length;
  let maxProjectiles = 0;
  let reachedRecovery = false;
  for (let frame = 0; frame < 900; frame++) {
    updateEnemies(1 / 60);
    maxHazards = Math.max(maxHazards, boss.ownedHazardCount());
    maxProjectiles = Math.max(maxProjectiles, boss.ownedProjectileCount());
    if (boss.mode === "storm_recover") {
      reachedRecovery = true;
      boss.modeTimer = 60;
    }
    if (reachedRecovery && boss.ownedHazardCount() === 0 && boss.ownedProjectileCount() === 0) break;
  }

  assert.equal(reachedRecovery, true);
  assert.equal(boss.ownedHazardCount(), 0);
  assert.equal(boss.ownedProjectileCount(), 0);
  assert.ok(maxHazards <= STORM_TYRANT_SCREEN_PRESSURE.peakHazards);
  assert.ok(maxProjectiles <= STORM_TYRANT_SCREEN_PRESSURE.peakProjectiles);
});

function createBoss() {
  return new StormTyrant({ id: "storm_tyrant", ...enemyConfig.storm_tyrant }, 430, 0);
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
  state.difficultyId = "ember";
  state.difficulty = {
    id: "ember",
    enemyLimit: 240,
    enemySpeed: 0.9,
    enemyAttackSpeed: 0.9,
    bossHp: 0.85,
    bossDamage: 0.85,
  };
  state.wave = 10;
  state.waveScenario = waveScenarioFor("ember", 10);
  state.time = 0;
  state.spawnedBossWaves = new Set();
}

function originalStormLineHit(hazard, body) {
  const vx = Math.cos(hazard.angle);
  const vy = Math.sin(hazard.angle);
  const dx = body.x - hazard.x;
  const dy = body.y - hazard.y;
  const forward = dx * vx + dy * vy;
  if (Math.abs(forward) > hazard.length * 0.5) return false;
  return Math.abs(dx * -vy + dy * vx) < body.r + hazard.width;
}
