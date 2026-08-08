import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  ENEMY_VISUAL_CLIPS,
  ENEMY_VISUAL_IDS,
  applyEnemyVisualVariant,
  applyEnemyBakePose,
  enemyVisualProfile,
  enemyVisualVariantIds,
  enemyVisualVariantKey,
  hasProjectileVisualProfile,
  projectileVisualProfile,
} from "../src/systems/visualProfiles.js";
import {
  basicProjectileVisualId,
  spawnEnemyBullet,
} from "../src/enemies/BaseEnemy.js";
import { createPlayer, state, world } from "../src/state.js";
import { Wisp } from "../src/enemies/wisp.js";
import { MechWorm } from "../src/enemies/mech_worm.js";
import { SlimeMedium } from "../src/enemies/slime_medium.js";
import { Zombie } from "../src/enemies/zombie.js";
import {
  createDecorativeEnemy,
  decorativeEnemyIds,
  setEnemyConfigForTests,
} from "../src/systems/enemyRegistry.js";

const enemyConfig = JSON.parse(fs.readFileSync(new URL("../src/config/enemy-config.json", import.meta.url), "utf8"));

test("every configured non-boss enemy owns a high-fidelity Pixi visual profile", () => {
  const configured = Object.entries(enemyConfig).filter(([, value]) => !value.boss).map(([id]) => id).sort();
  assert.equal(configured.length, 35);
  assert.deepEqual([...ENEMY_VISUAL_IDS].sort(), configured);
  for (const id of configured) {
    const profile = enemyVisualProfile(id);
    assert.ok(profile, `${id} visual profile`);
    assert.ok(["atlas", "compound", "segmented"].includes(profile.strategy));
  }
  assert.deepEqual(ENEMY_VISUAL_CLIPS, { idle: 8, move: 12, windup: 8, attack: 6, recover: 6, hurt: 4 });
});

test("all non-boss registry ids construct their matching runtime type", () => {
  resetEnemyState();
  setEnemyConfigForTests(Object.fromEntries(
    Object.entries(enemyConfig).map(([id, value]) => [id, { id, ...value }]),
  ));
  const configured = Object.entries(enemyConfig).filter(([, value]) => !value.boss).map(([id]) => id).sort();
  assert.deepEqual(decorativeEnemyIds().sort(), configured);
  for (const id of configured) {
    const enemy = createDecorativeEnemy(id, 0, 0);
    assert.ok(enemy, `${id} decorative enemy`);
    assert.equal(enemy.type, id, `${id} runtime type`);
  }
});

test("ordinary and Boss hostile projectile families never fall back to a plain dot", () => {
  for (const shape of [
    "orb", "bolt",
    "razorBoomerang", "arcaneOrb", "starShard", "snowflake", "fireball", "voidFireball",
    "laserShard", "phaseShard", "fastGear", "zombieClot", "slimeOrb", "pylonBolt", "gunnerShot",
    "frostComet", "stormBlade", "stormOrb", "stormCrownShard", "riftbladeCrescent",
    "convictBall", "convictShrapnel", "convictSeeker", "scientistAbyssCore",
    "scientistAbyssShard", "darkEntityLance", "darkEntityScythe", "darkEntityHunter",
    "bioSpore", "arcaneNeedle", "mechSlug", "frostNeedle", "bossSigil",
  ]) {
    assert.equal(hasProjectileVisualProfile(shape), true, shape);
  }
});

test("basic hostile shots select a source-themed baked projectile family", () => {
  const cases = [
    [{ type: "zombie" }, "bioSpore"],
    [{ type: "slime_small" }, "bioSpore"],
    [{ type: "wisp" }, "frostNeedle"],
    [{ type: "wizard", behavior: "wizard" }, "arcaneNeedle"],
    [{ type: "tank" }, "mechSlug"],
    [{ type: "storm_tyrant", boss: true }, "bossSigil"],
  ];
  for (const [enemy, expected] of cases) {
    assert.equal(basicProjectileVisualId(enemy), expected);
    const profile = projectileVisualProfile(expected);
    assert.ok(profile?.frames >= 4, `${expected} animated frame count`);
    assert.notEqual(profile?.texture, "enemyPellet");
  }

  resetEnemyState();
  spawnEnemyBullet(10, 20, 0.3, "#42e8ff", 180, 7, {
    sourceType: "tank",
    visualId: "mechSlug",
  });
  assert.equal(world.enemyProjectiles[0].sourceType, "tank");
  assert.equal(world.enemyProjectiles[0].visualId, "mechSlug");
  assert.equal(world.enemyProjectiles[0].shape, "mechSlug");

  spawnEnemyBullet(0, 0, 0, "#ffffff", 120, 1);
  assert.equal(world.enemyProjectiles[1].visualId, "defaultEnemyBullet");
  assert.equal(hasProjectileVisualProfile(world.enemyProjectiles[1].visualId), true);
});

test("every literal hostile projectile producer resolves to a registered visual", () => {
  const enemyDirectory = new URL("../src/enemies/", import.meta.url);
  const files = fs.readdirSync(enemyDirectory).filter((file) => file.endsWith(".js"));
  const sources = [
    ...files.map((file) => fs.readFileSync(new URL(file, enemyDirectory), "utf8")),
    fs.readFileSync(new URL("../src/systems/entities.js", import.meta.url), "utf8"),
  ];
  const shapes = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/shape\s*:\s*["']([^"']+)["']/g)) shapes.add(match[1]);
  }
  for (const shape of shapes) assert.equal(hasProjectileVisualProfile(shape), true, shape);
});

test("wisp telegraphs inside the existing cooldown without delaying its shot", () => {
  resetEnemyState();
  const wisp = new Wisp({ id: "wisp", ...enemyConfig.wisp }, 320, 0);
  wisp.shootCooldown = 0.2;
  world.enemies.push(wisp);

  wisp.update(0.1);
  assert.equal(world.enemyProjectiles.length, 0);
  assert.ok(wisp.attackWindup > 0);
  assert.equal(wisp.getVisualState().clip, "windup");

  wisp.update(0.11);
  assert.equal(world.enemyProjectiles.length, 1);
  assert.equal(wisp.getVisualState().clip, "attack");
});

test("mechanical worm uses a fixed path buffer and bends toward the player", () => {
  resetEnemyState();
  const worm = new MechWorm({ id: "mech_worm", ...enemyConfig.mech_worm }, 0, 0);
  const pathX = worm.pathX;
  state.player.x = 260;
  state.player.y = 260;
  for (let frame = 0; frame < 90; frame++) worm.update(1 / 60);

  assert.equal(worm.pathX, pathX);
  assert.equal("path" in worm, false);
  assert.ok(Math.abs(worm.headAngle - Math.PI / 4) < 0.35);
  const verticalSpread = Math.max(...worm.segments.map((segment) => segment.y)) - Math.min(...worm.segments.map((segment) => segment.y));
  assert.ok(verticalSpread > worm.r * 0.45);
  for (let index = 1; index < worm.segments.length; index++) {
    const previous = worm.segments[index - 1];
    const current = worm.segments[index];
    assert.ok(Math.hypot(previous.x - current.x, previous.y - current.y) < worm.segmentGap * 1.8);
  }
});

test("slime visual state follows takeoff and landing phases", () => {
  resetEnemyState();
  const slime = new SlimeMedium({ id: "slime_medium", ...enemyConfig.slime_medium }, 0, 0);
  slime.hopState = "air";
  slime.hopElapsed = slime.hopDuration * 0.5;
  assert.equal(slime.getVisualState().clip, "move");
  assert.ok(slime.jumpLift() > 0.9);
  slime.land();
  assert.equal(slime.getVisualState().clip, "recover");
});

test("zombie clothes and slime colors remain stable across every baked clip", () => {
  resetEnemyState();
  const zombie = new Zombie({ id: "zombie", ...enemyConfig.zombie }, 0, 0);
  applyEnemyVisualVariant(zombie, "mechanic");
  assert.equal(enemyVisualVariantKey(zombie), "mechanic");
  assert.ok(enemyVisualVariantIds(zombie).includes("scientist"));
  for (const [clip, count] of Object.entries(ENEMY_VISUAL_CLIPS)) {
    for (let frame = 0; frame < count; frame++) {
      applyEnemyBakePose(zombie, clip, frame / count);
      assert.equal(zombie.clothingVariant, "mechanic");
    }
  }

  const slime = new SlimeMedium({ id: "slime_medium", ...enemyConfig.slime_medium }, 0, 0);
  applyEnemyVisualVariant(slime, "berry");
  const colors = slime.slimeColors;
  assert.equal(enemyVisualVariantKey(slime), "berry");
  assert.ok(enemyVisualVariantIds(slime).includes("rainbow"));
  for (const [clip, count] of Object.entries(ENEMY_VISUAL_CLIPS)) {
    for (let frame = 0; frame < count; frame++) {
      applyEnemyBakePose(slime, clip, frame / count);
      assert.equal(slime.slimeVariant, "berry");
      assert.equal(slime.slimeColors, colors);
    }
  }
});

function resetEnemyState() {
  world.enemies.length = 0;
  world.enemyProjectiles.length = 0;
  world.hazards.length = 0;
  world.particles.length = 0;
  state.player = createPlayer();
  state.player.x = 0;
  state.player.y = 0;
  state.player.invuln = 999;
  state.player.damageScale = 1;
  state.difficultyId = "neon";
  state.difficulty = {
    id: "neon",
    enemyLimit: 180,
    enemySpeed: 1,
    enemyAttackSpeed: 1,
    bossHp: 1,
    bossDamage: 1,
  };
  state.wave = 5;
  state.time = 0;
  state.waveScenario = null;
}
