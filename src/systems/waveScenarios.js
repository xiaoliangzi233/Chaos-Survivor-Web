import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { pulse } from "../effects.js";
import { eventCodexIdsForScenario } from "../config/event-codex-config.js";
import { waveScenarioFor } from "../config/wave-scenario-config.js";
import { recordCodexEntry } from "./codex.js";
import { spawnEnemyById } from "./enemyRegistry.js";
import {
  clearApocalypseScenarioEvent,
  startApocalypseScenarioEvent,
  updateApocalypseScenarioEvent,
} from "./apocalypseScenarioEvents.js";
import {
  clearVoidCrownScenarioEvent,
  startVoidCrownScenarioEvent,
  updateVoidCrownScenarioEvent,
} from "./voidCrownScenarioEvents.js";

export function resetWaveScenarioState() {
  clearVoidCrownScenarioEvent();
  clearApocalypseScenarioEvent();
  state.waveScenario = null;
  state.spawnedWaveEvents = new Set();
}

export function applyWaveStartScenario() {
  clearVoidCrownScenarioEvent();
  clearApocalypseScenarioEvent();
  state.waveScenario = waveScenarioFor(state.difficultyId, state.wave);
  if (!state.waveScenario) return null;
  for (const eventId of eventCodexIdsForScenario(state.waveScenario)) recordCodexEntry("events", eventId);
  spawnScenarioElite(state.waveScenario);
  const events = scenarioEventEntries(state.waveScenario);
  for (const entry of events) spawnScenarioEvent(entry, state.waveScenario);
  for (const entry of events) {
    startApocalypseScenarioEvent(entry.event);
    startVoidCrownScenarioEvent(entry.event);
  }
  return state.waveScenario;
}

export function updateWaveScenario(dt) {
  updateApocalypseScenarioEvent(dt);
  updateVoidCrownScenarioEvent(dt);
}

export function activeWaveEffect(effect) {
  return state.waveScenario?.effect === effect || (state.waveScenario?.randomEvents || []).some((entry) => entry.effect === effect);
}

export function activeGearfiendMode() {
  return state.waveScenario?.gearfiendMode || (state.waveScenario?.randomEvents || []).find((entry) => entry.gearfiendMode)?.gearfiendMode || null;
}

function scenarioEventEntries(scenario) {
  if (scenario?.randomEvents?.length) return [...scenario.randomEvents];
  const entries = [];
  if (scenario?.event || scenario?.reward || scenario?.effect || scenario?.gearfiendMode) entries.push(scenario);
  return entries;
}

function spawnScenarioElite(scenario) {
  const elite = scenario.elite;
  if (!elite) return;
  const key = `${state.difficultyId}-${scenario.wave}-elite-${elite.id || "variants"}`;
  state.spawnedWaveEvents ||= new Set();
  if (state.spawnedWaveEvents.has(key)) return;
  const variants = elite.variants || [{ id: elite.id, variant: elite.variant }];
  for (let i = 0; i < elite.count; i++) {
    const choice = variants[i % variants.length];
    const enemy = spawnEnemyById(choice.id);
    if (!enemy) continue;
    markElite(enemy, choice.variant);
    pulse(enemy.x, enemy.y, enemy.r * 3.2, enemy.color, 0.4);
  }
  state.spawnedWaveEvents.add(key);
}

function spawnScenarioEvent(scenario, ownerScenario = scenario) {
  const event = scenario.event;
  if (!event) return;
  const key = `${state.difficultyId}-${ownerScenario?.wave || state.wave}-event-${scenario.randomEventId || event.type}`;
  state.spawnedWaveEvents ||= new Set();
  if (state.spawnedWaveEvents.has(key)) return;
  if (event.type === "hazard_ring") spawnHazardRing(event);
  if (event.type === "hazard_line") spawnHazardLine(event);
  if (event.type === "hazard_field") spawnHazardField(event);
  if (event.type === "gravity_well_grid") spawnScenarioNodeField(event, "gravity_well", "#8d6bff");
  if (event.type === "ember_mine_rain") spawnEmberMineRain(event);
  if (event.type === "prism_refraction") spawnScenarioNodeField(event, "prism_reflector", "#f3f7ff");
  if (event.type === "magnetic_drift") spawnScenarioNodeField(event, "magnetic_node", "#42e8ff");
  if (event.type === "nest_spore_bloom") spawnScenarioNodeField(event, "brood_pod", "#a3e635");
  if (event.type === "long_mech_worms") spawnLongMechWorms(event);
  if (event.type === "sweeping_laser_maze") spawnSweepingLaserMaze(event);
  if (event.type === "mirror_laser_gate") spawnMirrorLaserGate(event);
  if (event.type === "phase_tear_grid") spawnScenarioNodeField(event, "phase_tear", "#d946ef");
  if (event.type === "inferno_resonance") spawnScenarioNodeField(event, "inferno_beacon", "#ff7a1a");
  state.spawnedWaveEvents.add(key);
}

function spawnHazardRing(event) {
  const p = state.player;
  const count = event.count || 6;
  const radius = event.radius || 260;
  const offset = Math.random() * TAU;
  for (let i = 0; i < count; i++) {
    const a = offset + i / count * TAU;
    addScenarioHazard(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, event, a);
  }
}

function spawnHazardLine(event) {
  const p = state.player;
  const count = event.count || 4;
  const step = event.step || 120;
  const angle = Math.atan2(p.dirY || 0, p.dirX || 1) + Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * step;
    addScenarioHazard(p.x + Math.cos(angle) * offset, p.y + Math.sin(angle) * offset, event, angle);
  }
}

function spawnHazardField(event) {
  const count = event.count || 18;
  const columns = Math.ceil(Math.sqrt(count * 1.25));
  const rows = Math.ceil(count / columns);
  const half = WORLD_SIZE / 2 - 140;
  const stepX = (half * 2) / Math.max(1, columns - 1);
  const stepY = (half * 2) / Math.max(1, rows - 1);
  const offsetX = (Math.random() - 0.5) * stepX * 0.35;
  const offsetY = (Math.random() - 0.5) * stepY * 0.35;
  const minPlayerDistance = event.minPlayerDistance || 240;
  let spawned = 0;
  for (let row = 0; row < rows && spawned < count; row++) {
    for (let col = 0; col < columns && spawned < count; col++) {
      const jitterX = (Math.random() - 0.5) * stepX * 0.42;
      const jitterY = (Math.random() - 0.5) * stepY * 0.42;
      const x = -half + col * stepX + offsetX + jitterX;
      const y = -half + row * stepY + offsetY + jitterY;
      if (Math.hypot(x - state.player.x, y - state.player.y) < minPlayerDistance) continue;
      addScenarioHazard(x, y, event, Math.random() * TAU);
      spawned++;
    }
  }
}

function spawnScenarioNodeField(event, kind, color) {
  const count = event.count || 6;
  const half = WORLD_SIZE / 2 - 180;
  const minPlayerDistance = event.minPlayerDistance || 240;
  let spawned = 0;
  let attempts = 0;
  while (spawned < count && attempts < count * 24) {
    attempts++;
    const x = (Math.random() * 2 - 1) * half;
    const y = (Math.random() * 2 - 1) * half;
    if (Math.hypot(x - state.player.x, y - state.player.y) < minPlayerDistance) continue;
    addScenarioHazard(x, y, {
      ...event,
      kind,
      color,
      damage: 0,
      life: event.life || 12,
      radius: event.radius || 96,
    }, Math.random() * TAU);
    spawned++;
  }
}

function spawnEmberMineRain(event) {
  const clusters = event.clusters || 5;
  const minesPerCluster = event.minesPerCluster || 3;
  const half = WORLD_SIZE / 2 - 150;
  const minPlayerDistance = event.minPlayerDistance || 220;
  for (let c = 0; c < clusters; c++) {
    let cx = 0;
    let cy = 0;
    for (let attempts = 0; attempts < 18; attempts++) {
      cx = (Math.random() * 2 - 1) * half;
      cy = (Math.random() * 2 - 1) * half;
      if (Math.hypot(cx - state.player.x, cy - state.player.y) >= minPlayerDistance) break;
    }
    const offset = Math.random() * TAU;
    for (let i = 0; i < minesPerCluster; i++) {
      const a = offset + i / minesPerCluster * TAU;
      const spread = 58 + Math.random() * 34;
      addScenarioHazard(cx + Math.cos(a) * spread, cy + Math.sin(a) * spread, {
        kind: "ember_mine",
        color: "#ff7a1a",
        radius: 13,
        damage: event.damage || 22,
        life: event.life || 10,
        triggerRadius: 42,
        explodeRadius: event.radius || 78,
        armTime: 0.9 + Math.random() * 0.45,
        triggered: false,
      }, a);
    }
  }
}

function spawnLongMechWorms(event) {
  const count = event.count || 3;
  for (let i = 0; i < count; i++) spawnEnemyById("mech_worm");
}

function spawnSweepingLaserMaze(event) {
  const horizontal = Math.random() < 0.5;
  const fromNegative = Math.random() < 0.5;
  const span = WORLD_SIZE * 1.34;
  const startEdge = (fromNegative ? -1 : 1) * (WORLD_SIZE / 2 + 120);
  const target = horizontal ? state.player.y : state.player.x;
  const direction = Math.sign(target - startEdge) || (fromNegative ? 1 : -1);
  world.hazards.push({
    kind: "storm_laser_net",
    x: horizontal ? 0 : startEdge,
    y: horizontal ? startEdge : 0,
    vx: horizontal ? 0 : direction * (event.speed || 150),
    vy: horizontal ? direction * (event.speed || 150) : 0,
    angle: horizontal ? 0 : Math.PI / 2,
    length: span,
    width: event.width || 34,
    color: event.color || "#ff4d6d",
    damage: event.damage || 24,
    life: event.life || 999,
    maxLife: event.life || 999,
    armTime: event.armTime || 1.1,
    armDuration: event.armTime || 1.1,
    fullWave: Boolean(event.fullWave),
    surgeTime: 0.32,
  });
}

function spawnMirrorLaserGate(event) {
  const count = event.count || 4;
  for (let i = 0; i < count; i++) {
    const vertical = i % 2 === 0;
    const side = i < 2 ? -1 : 1;
    const offset = side * (180 + i * 46);
    world.hazards.push({
      kind: "storm_laser_net",
      x: vertical ? state.player.x + offset : 0,
      y: vertical ? 0 : state.player.y + offset,
      vx: vertical ? Math.sin(i) * (event.speed || 22) : 0,
      vy: vertical ? 0 : Math.cos(i) * (event.speed || 22),
      angle: vertical ? Math.PI / 2 : 0,
      length: WORLD_SIZE * 1.15,
      width: event.width || 24,
      color: event.color || "#f3f7ff",
      damage: event.damage || 18,
      life: event.life || 999,
      maxLife: event.life || 999,
      armTime: 0.9 + i * 0.16,
      armDuration: 0.9 + i * 0.16,
      fullWave: Boolean(event.fullWave),
      surgeTime: 0.2,
    });
  }
}

function addScenarioHazard(x, y, event, angle) {
  const half = WORLD_SIZE / 2 - 80;
  world.hazards.push({
    kind: event.kind || "gear_trap",
    x: Math.max(-half, Math.min(half, x)),
    y: Math.max(-half, Math.min(half, y)),
    r: event.radius || (event.kind === "magma_crack" ? 34 : 38),
    color: event.color || "#f59e0b",
    damage: event.damage || 12,
    life: event.life || 3.2,
    maxLife: event.life || 3.2,
    poisonDps: event.poisonDps || 0,
    poisonDuration: event.poisonDuration || 0,
    armTime: event.armTime || 0,
    armDuration: event.armTime || 0,
    triggerRadius: event.triggerRadius || 0,
    explodeRadius: event.explodeRadius || 0,
    triggered: Boolean(event.triggered),
    fullWave: Boolean(event.fullWave),
    angle,
    spin: Math.random() * TAU,
  });
  pulse(x, y, 46, event.color || "#f59e0b", 0.22);
}

function markElite(enemy, variant) {
  enemy.elite = true;
  enemy.eliteVariant = variant;
  enemy.name = variant === "giant" ? `巨型${enemy.name || ""}` : `精英${enemy.name || ""}`;
  const scale = variant === "giant" ? 1.75 : 1.35;
  enemy.r *= scale;
  enemy.hp *= 50;
  enemy.maxHp = enemy.hp;
  enemy.damage *= variant === "giant" ? 1.55 : 1.35;
  enemy.speed *= variant === "giant" ? 0.72 : 1.08;
  enemy.xp *= variant === "giant" ? 3 : 2;
  enemy.knockbackResistance = Math.max(enemy.knockbackResistance || 0, variant === "giant" ? 0.72 : 0.58);
  enemy.eliteSkillCooldown = variant === "giant" ? 2.6 : 2.2;
  enemy.eliteSkillInterval = variant === "giant" ? 5.2 : 4.4;
  enemy.eliteSkillProjectileCount = variant === "giant" ? 16 : 10;
  if (enemy.type === "mech_worm") {
    enemy.eliteFireballSkill = true;
    enemy.eliteSkillInterval = 3.4;
    enemy.eliteSkillCooldown = 1.4;
    enemy.extendSegments?.(10);
  }
  if (enemy.type === "shield_caster") {
    enemy.eliteGlobalShield = true;
    enemy.eliteSkillCooldown = Infinity;
  }
  if (enemy.type === "gearfiend" && variant === "giant") {
    enemy.eliteDashTrapSkill = true;
    enemy.eliteSkillInterval = 4.2;
    enemy.eliteSkillCooldown = 1.8;
  }
  if (variant === "collapsing_blackhole") {
    enemy.name = "坍缩星核术师";
    enemy.eliteCollapseSkill = true;
    enemy.eliteSkillInterval = 3.8;
    enemy.eliteSkillCooldown = 1.2;
    enemy.speed *= 1.08;
  }
  if (variant === "magnetic_captain") {
    enemy.name = "磁暴掠夺队长";
    enemy.eliteMagnetDashSkill = true;
    enemy.eliteSkillInterval = 3.6;
    enemy.eliteSkillCooldown = 1.1;
    enemy.speed *= 1.18;
  }
  if (variant === "brood_core") {
    enemy.name = "巢核播撒母体";
    enemy.eliteBroodPodSkill = true;
    enemy.eliteSkillInterval = 4.2;
    enemy.eliteSkillCooldown = 1.4;
    enemy.speed *= 0.86;
  }
  if (variant === "embermine_overlord") {
    enemy.name = "精英余烬地雷兽";
    enemy.eliteEmberMineRingSkill = true;
    enemy.eliteSkillInterval = 3.4;
    enemy.eliteSkillCooldown = 1.2;
    enemy.speed *= 1.1;
  }
  if (variant === "inferno_conductor") {
    enemy.name = "精英烈焰司祭";
    enemy.eliteInfernoConductorSkill = true;
    enemy.eliteSkillInterval = 3.6;
    enemy.eliteSkillCooldown = 1.1;
  }
}
