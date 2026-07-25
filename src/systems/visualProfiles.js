import { TAU } from "../constants.js";

export const ENEMY_VISUAL_IDS = Object.freeze([
  "zombie", "lancer", "wisp",
  "slime_large", "slime_medium", "slime_small",
  "blackhole_mage", "mech_worm", "doctor", "embermine", "exploder",
  "tank", "pyromancer", "laser_eye", "razorbat", "wizard",
  "pentastar", "gearfiend", "prism_medic", "phase_mirage",
  "magnet_raider", "magma_beetle", "siege_pylon", "brood_seeder",
  "line_raider", "shield_caster", "gunner", "artillery",
  "slime_diamond", "slime_gold", "slime_glow", "slime_weeping",
  "slime_devil", "slime_angel", "thief",
]);

export const ENEMY_VISUAL_CLIPS = Object.freeze({
  idle: 8,
  move: 12,
  windup: 8,
  attack: 6,
  recover: 6,
  hurt: 4,
});

const SEGMENTED_ENEMIES = new Set(["mech_worm"]);
const COMPOUND_ENEMIES = new Set(["blackhole_mage"]);

const PROJECTILE_PROFILES = Object.freeze({
  defaultEnemyBullet: { texture: "enemyPellet", frames: 4, rotation: "velocity", scale: 2.15 },
  razorBoomerang: { texture: "razorBoomerang", frames: 4, rotation: "spin", scale: 2.6 },
  arcaneOrb: { texture: "arcaneOrb", frames: 6, rotation: "spin", scale: 2.8 },
  starShard: { texture: "starShard", frames: 4, rotation: "spin", scale: 2.8 },
  snowflake: { texture: "snowflake", frames: 4, rotation: "spin", scale: 2.7 },
  fireball: { texture: "fireball", frames: 6, rotation: "velocity", scale: 3.0 },
  voidFireball: { texture: "voidFireball", frames: 6, rotation: "velocity", scale: 3.1 },
  laserShard: { texture: "laserShard", frames: 4, rotation: "velocity", scale: 2.8 },
  phaseShard: { texture: "phaseShard", frames: 4, rotation: "spin", scale: 2.7 },
  fastGear: { texture: "fastGear", frames: 4, rotation: "spin", scale: 2.9 },
  zombieClot: { texture: "zombieClot", frames: 5, rotation: "spin", scale: 2.65 },
  slimeOrb: { texture: "slimeOrb", frames: 5, rotation: "spin", scale: 2.75 },
  pylonBolt: { texture: "pylonBolt", frames: 4, rotation: "velocity", scale: 3.2 },
  gunnerShot: { texture: "gunnerShot", frames: 4, rotation: "velocity", scale: 2.75 },
  laser: { texture: "laserShard", frames: 4, rotation: "velocity", scale: 2.7 },
  frostComet: { texture: "frostComet", frames: 6, rotation: "velocity", scale: 3.8 },
  stormBlade: { texture: "stormBlade", frames: 4, rotation: "velocity", scale: 4.2 },
  stormOrb: { texture: "stormOrb", frames: 6, rotation: "spin", scale: 3.7 },
  stormCrownShard: { texture: "stormCrownShard", frames: 4, rotation: "velocity", scale: 4.6 },
  riftbladeCrescent: { texture: "riftbladeCrescent", frames: 5, rotation: "velocity", scale: 4.0 },
  convictBall: { texture: "convictBall", frames: 6, rotation: "spin", scale: 4.2 },
  convictShrapnel: { texture: "convictShrapnel", frames: 4, rotation: "velocity", scale: 3.6 },
  convictSeeker: { texture: "convictSeeker", frames: 5, rotation: "velocity", scale: 3.9 },
  scientistAbyssCore: { texture: "scientistAbyssCore", frames: 6, rotation: "spin", scale: 4.25 },
  scientistAbyssShard: { texture: "scientistAbyssShard", frames: 4, rotation: "velocity", scale: 3.7 },
  darkEntityLance: { texture: "darkEntityLance", frames: 5, rotation: "velocity", scale: 4.0 },
  darkEntityScythe: { texture: "darkEntityScythe", frames: 6, rotation: "spin", scale: 4.2 },
  darkEntityHunter: { texture: "darkEntityHunter", frames: 5, rotation: "velocity", scale: 4.0 },
});

export function enemyVisualProfile(id) {
  if (!ENEMY_VISUAL_IDS.includes(id)) return null;
  return {
    id,
    strategy: SEGMENTED_ENEMIES.has(id) ? "segmented" : COMPOUND_ENEMIES.has(id) ? "compound" : "atlas",
    clips: ENEMY_VISUAL_CLIPS,
  };
}

export function enemyVisualState(enemy) {
  if ((enemy?.flash || 0) > 0 || (enemy?.hitTimer || 0) > 0) {
    return normalizeVisualState({
      clip: "hurt",
      progress: 1 - Math.min(1, Math.max(enemy.flash || 0, enemy.hitTimer || 0)),
    }, enemy);
  }
  const supplied = enemy?.getVisualState?.();
  if (supplied?.clip) return normalizeVisualState(supplied, enemy);
  return normalizeVisualState({ clip: "move", progress: phaseProgress(enemy?.anim) }, enemy);
}

export function applyEnemyBakePose(enemy, clip, progress) {
  const p = Math.max(0, Math.min(0.999999, progress));
  enemy.anim = p * TAU;
  enemy.flash = clip === "hurt" ? 1 : 0;
  enemy.freezeTimer = 0;
  enemy.flip = 1;

  if (enemy.hopState != null) {
    enemy.hopState = clip === "move" || clip === "attack" ? "air" : "ground";
    enemy.hopDuration = enemy.hopDuration || 0.4;
    enemy.hopElapsed = p * enemy.hopDuration;
    enemy.landSquash = clip === "recover" ? 1 - p : 0;
    enemy.landAge = clip === "recover" ? p * 0.32 : 99;
  }

  const id = enemy.type;
  if (id === "blackhole_mage") {
    enemy.state = clip === "windup" ? "cast" : clip === "attack" ? "channel" : clip === "recover" ? "recover" : "keep";
    enemy.castTime = clip === "windup" ? 1 - p : 0;
    enemy.channelTime = clip === "attack" ? 1 - p : 0;
    enemy.recoverTime = clip === "recover" ? 1 - p : 0;
  } else if (id === "laser_eye") {
    enemy.state = clip === "windup" ? "aim" : clip === "attack" ? "fire" : "move";
  } else if (id === "line_raider") {
    enemy.state = clip === "windup" ? "warn" : clip === "attack" ? "dash" : "drift";
  } else if (id === "magma_beetle") {
    enemy.state = clip === "windup" ? "windup" : clip === "attack" ? "charge" : "crawl";
    enemy.windup = clip === "windup" ? 1 - p : 0;
  } else if (id === "lancer") {
    enemy.attackState = clip === "windup" ? "windup" : clip === "attack" ? "dashing" : clip === "recover" ? "recover" : "approach";
  } else if (id === "wisp") {
    enemy.attackWindup = clip === "windup" ? p : 0;
    enemy.attackRelease = clip === "attack" ? 1 - p : 0;
  }

  const windup = clip === "windup" ? 1 - p : 0;
  for (const key of ["windup", "throwWindup", "castTime", "charge", "aimTime", "spawnWindup", "plantTime", "fuse"]) {
    if (key in enemy && id !== "blackhole_mage" && id !== "magma_beetle") enemy[key] = windup;
  }
  if ("armed" in enemy) enemy.armed = clip === "windup" || clip === "attack";
  const active = clip === "attack" ? 1 - p : 0;
  for (const key of ["channel", "fireTime", "strikeTimer", "seedPulse", "burstLeft"]) {
    if (key in enemy) enemy[key] = active;
  }
  for (const key of ["attackRelease", "throwRelease", "castRelease", "fireRelease"]) {
    if (key in enemy) enemy[key] = clip === "attack" ? 1 - p : 0;
  }
}

export function projectileVisualProfile(projectileOrShape) {
  const shape = typeof projectileOrShape === "string"
    ? projectileOrShape
    : projectileOrShape?.visualId || projectileOrShape?.shape || "defaultEnemyBullet";
  return PROJECTILE_PROFILES[shape] || PROJECTILE_PROFILES.defaultEnemyBullet;
}

export function hasProjectileVisualProfile(shape) {
  return Boolean(PROJECTILE_PROFILES[shape || "defaultEnemyBullet"]);
}

export function projectileVisualIds() {
  return Object.keys(PROJECTILE_PROFILES);
}

function normalizeVisualState(value, enemy) {
  return {
    clip: ENEMY_VISUAL_CLIPS[value.clip] ? value.clip : "move",
    progress: Number.isFinite(value.progress) ? Math.max(0, Math.min(0.999999, value.progress)) : phaseProgress(enemy?.anim),
    facing: value.facing ?? enemy?.flip ?? 1,
    heading: value.heading ?? enemy?.headAngle ?? enemy?.angle ?? 0,
    phase: value.phase ?? enemy?.phase ?? 0,
    tint: value.tint ?? null,
  };
}

function phaseProgress(value) {
  const normalized = ((Number(value) || 0) % TAU + TAU) % TAU;
  return normalized / TAU;
}
