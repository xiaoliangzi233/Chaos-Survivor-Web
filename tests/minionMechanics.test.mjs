import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createPlayer, state, world } from "../src/state.js";
import { setEnemyConfigForTests, spawnEnemyById } from "../src/systems/enemyRegistry.js";
import { updateEnemies, updatePlayer } from "../src/systems/entities.js";
import { collectThreats, riskAtPoint } from "../src/ai/riskModel.js";
import {
  activePlayerStatusEffects,
  applyPlayerStatus,
  clearPlayerStatusEffects,
  playerStatusModifiers,
} from "../src/systems/statusEffects.js";
import {
  addMinionHazard,
  beginMinionMechanicFrame,
  endMinionMechanicFrame,
  isPlayerProjectileBlocked,
  MINION_MECHANIC_TIPS,
  minionMechanicTier,
  NON_BOSS_ENEMY_IDS,
  notifyMinionDamaged,
  notifyMinionKilled,
} from "../src/systems/minionMechanics.js";

const rawEnemyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));
const enemyConfig = Object.fromEntries(Object.entries(rawEnemyConfig).map(([id, entry]) => [id, { id, ...entry }]));
setEnemyConfigForTests(enemyConfig);

test("all 35 non-Boss enemies register, instantiate, and expose mechanic guidance", () => {
  assert.equal(NON_BOSS_ENEMY_IDS.length, 35);
  assert.equal(new Set(NON_BOSS_ENEMY_IDS).size, 35);
  resetCombat();
  for (const id of NON_BOSS_ENEMY_IDS) {
    world.enemies.length = 0;
    const enemy = spawnEnemyById(id, 200, 0, { ignoreLimit: true });
    assert.ok(enemy, `${id} instantiated`);
    assert.equal(Boolean(enemy.boss), false, `${id} remains non-Boss`);
    assert.equal(typeof MINION_MECHANIC_TIPS[id], "string", `${id} has codex mechanic tip`);
    const frame = beginMinionMechanicFrame(enemy);
    assert.ok(frame, `${id} participates in mechanic frame hooks`);
    assert.equal(enemy.mechanicTier, 2, `${id} receives full mechanics on overclock`);
  }
});

test("mechanic tiers follow progressive wave and difficulty gates", () => {
  const cases = [
    ["ember", 1, 0], ["ember", 2, 0], ["ember", 3, 1], ["ember", 11, 1], ["ember", 12, 2],
    ["neon", 1, 1], ["neon", 10, 1], ["neon", 11, 2],
    ["overclock", 1, 2], ["singularity", 1, 2], ["apocalypse", 1, 2], ["void_crown", 1, 2],
  ];
  for (const [difficulty, wave, tier] of cases) {
    assert.equal(minionMechanicTier(difficulty, wave), tier, `${difficulty} wave ${wave}`);
  }
});

test("soft statuses refresh safely, cap adhesive, and choose the strongest movement slow", () => {
  const player = createPlayer();
  applyPlayerStatus(player, "chill");
  assert.equal(playerStatusModifiers(player).moveSlow, 0.18);
  applyPlayerStatus(player, "chill", { duration: 1 });
  assert.equal(activePlayerStatusEffects(player).find((entry) => entry.id === "chill").stacks, 1);
  applyPlayerStatus(player, "adhesive");
  assert.equal(player.statusEffects.adhesive.stacks, 1);
  applyPlayerStatus(player, "adhesive");
  applyPlayerStatus(player, "adhesive");
  assert.equal(player.statusEffects.adhesive.stacks, 2);
  assert.equal(playerStatusModifiers(player).moveSlow, 0.28);
  applyPlayerStatus(player, "wound");
  applyPlayerStatus(player, "interference");
  assert.equal(playerStatusModifiers(player).healingScale, 0.5);
  assert.equal(playerStatusModifiers(player).weaponRangeScale, 0.75);
  assert.equal(playerStatusModifiers(player).magnetScale, 0.75);
  clearPlayerStatusEffects(player);
  assert.deepEqual(player.statusEffects, {});
});

test("status and legacy damage timers continue while the player is frozen", () => {
  resetCombat();
  const player = state.player;
  player.frozenTimer = 1;
  player.burnTimer = 1;
  player.burnDps = 10;
  applyPlayerStatus(player, "interference");
  const hp = player.hp;
  updatePlayer(0.25);
  assert.equal(player.frozenTimer, 0.75);
  assert.equal(player.burnTimer, 0.75);
  assert.equal(player.statusEffects.interference.timer, 2.75);
  assert.equal(player.hp, hp - 2.5);
});

test("minion hazards enforce owner and global active caps", () => {
  resetCombat();
  const owner = { type: "wizard", color: "#d58cff", x: 0, y: 0, dead: false };
  for (let index = 0; index < 6; index++) {
    addMinionHazard(owner, { kind: "test-zone", skillKey: "same-skill", x: index * 10, y: 0, life: 3 });
  }
  assert.equal(world.hazards.filter((hazard) => hazard.life > 0).length, 2);
  for (let index = 0; index < 60; index++) {
    addMinionHazard({ type: `owner-${index}`, x: 0, y: 0, dead: false }, {
      kind: "global-test",
      skillKey: `skill-${index}`,
      x: index,
      y: index,
      life: 3,
    });
  }
  assert.ok(world.hazards.filter((hazard) => hazard.minionSkill && hazard.life > 0).length <= 48);
});

test("owned fields clean up and thief returns every stored drop when hit", () => {
  resetCombat();
  const thief = spawnEnemyById("thief", 0, 0, { ignoreLimit: true });
  const coin = { x: 0, y: 0, value: 3 };
  world.coins.push(coin);
  const frame = beginMinionMechanicFrame(thief);
  endMinionMechanicFrame(thief, 0.1, frame);
  assert.equal(world.coins.length, 0);
  assert.equal(thief.stolenLoot.length, 1);
  notifyMinionDamaged(thief, 1);
  assert.equal(thief.stolenLoot.length, 0);
  assert.equal(world.coins.includes(coin), true);

  const field = addMinionHazard(thief, { kind: "owned-test", life: 2 });
  notifyMinionKilled(thief);
  assert.equal(field.life, 0);
});

test("automatic movement treats minion circles and connection lines as avoidable risk", () => {
  resetCombat();
  addMinionHazard({ type: "wizard", x: 0, y: 0, dead: false }, {
    kind: "risk-circle",
    x: 80,
    y: 0,
    r: 48,
    life: 2,
    armTime: 0,
    statusId: "interference",
  });
  addMinionHazard({ type: "razorbat", x: 0, y: 0, dead: false }, {
    kind: "risk-line",
    x1: -120,
    y1: 30,
    x2: 120,
    y2: 30,
    width: 12,
    life: 2,
    armTime: 0,
    statusId: "adhesive",
    warningType: "line",
  }, { link: true });
  const threats = collectThreats(state, world);
  assert.equal(threats.filter((threat) => threat.source?.minionSkill).length, 2);
  assert.ok(riskAtPoint({ x: 80, y: 0, r: 14 }, threats) > riskAtPoint({ x: 420, y: 420, r: 14 }, threats));
  assert.ok(riskAtPoint({ x: 0, y: 30, r: 14 }, threats) > 0);
});

test("directional cover blocks front-side shots but remains vulnerable from behind", () => {
  resetCombat();
  addMinionHazard({ type: "tank", x: 0, y: 0, dead: false }, {
    kind: "directional-cover",
    x1: 0,
    y1: -60,
    x2: 0,
    y2: 60,
    width: 12,
    life: 2,
    armTime: 0,
    projectileBlocker: true,
    blockNormalX: 1,
    blockNormalY: 0,
    warningType: "line",
  }, { link: true });
  assert.equal(isPlayerProjectileBlocked({ x: 0, y: 0, r: 4, vx: -100, vy: 0, damage: 5 }), true);
  assert.equal(isPlayerProjectileBlocked({ x: 0, y: 0, r: 4, vx: 100, vy: 0, damage: 5 }), false);
});

test("prism field redirects one existing ordinary bullet without cloning or touching Boss bullets", () => {
  resetCombat();
  state.player.x = 500;
  state.player.y = 500;
  const owner = { type: "prism_medic", x: 0, y: 0, color: "#72ffb4", dead: false };
  addMinionHazard(owner, {
    kind: "prism_reflector",
    x: 0,
    y: 0,
    r: 80,
    life: 2,
    armTime: 0,
  });
  const ordinary = { x: 0, y: 0, vx: 100, vy: 0, r: 4, damage: 5, life: 2, shape: "gunnerShot" };
  const boss = { x: 0, y: 0, vx: 100, vy: 0, r: 4, damage: 5, life: 2, shape: "bossSigil", bossProjectile: true };
  world.enemyProjectiles.push(ordinary, boss);
  updateEnemies(0.01);
  assert.equal(world.enemyProjectiles.length, 2);
  assert.equal(ordinary.prismReflected, true);
  assert.equal(Boolean(boss.prismReflected), false);
});

test("healing and prism support target ordinary enemies but never Bosses", () => {
  resetCombat();
  const doctor = spawnEnemyById("doctor", 0, 0, { ignoreLimit: true });
  const prism = spawnEnemyById("prism_medic", 0, 0, { ignoreLimit: true });
  const boss = { boss: true, dead: false, hp: 10, maxHp: 100, x: 20, y: 0, r: 30 };
  world.enemies.push(boss);
  assert.equal(doctor.findHealTargets().includes(boss), false);
  assert.equal(prism.findTargets().includes(boss), false);
});

test("representative enemy attacks keep their existing projectile counts", () => {
  resetCombat();
  const wisp = spawnEnemyById("wisp", 180, 0, { ignoreLimit: true });
  wisp.fireSnowflake(0, 300);
  assert.equal(world.enemyProjectiles.length, 1, "wisp");

  world.enemyProjectiles.length = 0;
  const laser = spawnEnemyById("laser_eye", 180, 0, { ignoreLimit: true });
  laser.fireLaserShardVolley(0);
  assert.equal(world.enemyProjectiles.length, 3, "laser eye");

  world.enemyProjectiles.length = 0;
  const pentastar = spawnEnemyById("pentastar", 180, 0, { ignoreLimit: true });
  pentastar.firePentagram();
  assert.equal(world.enemyProjectiles.length, 5, "pentastar");

  world.enemyProjectiles.length = 0;
  const mirage = spawnEnemyById("phase_mirage", 180, 0, { ignoreLimit: true });
  mirage.blinkStrike();
  assert.equal(world.enemyProjectiles.length, 8, "phase mirage");

  const expected = { triangle: 3, square: 4, hexagon: 6, circle: 9 };
  const gunner = spawnEnemyById("gunner", 180, 0, { ignoreLimit: true });
  for (const [pattern, count] of Object.entries(expected)) {
    world.enemyProjectiles.length = 0;
    gunner.pattern = pattern;
    gunner.fireShot(0);
    assert.equal(world.enemyProjectiles.length, count, `gunner ${pattern}`);
  }
});

function resetCombat() {
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.gems.length = 0;
  world.coins.length = 0;
  world.particles.length = 0;
  world.weaponFx.length = 0;
  world.grid.clear();
  world.hitTestEnemies.length = 0;
  state.player = createPlayer();
  state.wave = 1;
  state.difficultyId = "overclock";
  state.difficulty = {
    id: "overclock",
    enemyLimit: 200,
    enemyHp: 1,
    enemyDamage: 1,
    enemySpeed: 1,
    enemyAttackSpeed: 1,
    bossHp: 1,
    bossDamage: 1,
  };
  state.runMode = "standard";
  state.waveScenario = null;
  state.ai = { runtime: { enabled: false } };
  state.debug = { enabled: false };
  state.thiefSpawnWave = 0;
  state.thiefSpawnCount = 0;
}
