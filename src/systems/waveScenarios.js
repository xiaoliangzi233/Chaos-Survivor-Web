import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { pulse } from "../effects.js";
import { waveScenarioFor } from "../config/wave-scenario-config.js";
import { spawnEnemyById } from "./enemyRegistry.js";

export function resetWaveScenarioState() {
  state.waveScenario = null;
  state.spawnedWaveEvents = new Set();
}

export function applyWaveStartScenario() {
  state.waveScenario = waveScenarioFor(state.difficultyId, state.wave);
  if (!state.waveScenario) return;
  spawnScenarioElite(state.waveScenario);
  spawnScenarioEvent(state.waveScenario);
}

export function activeWaveEffect(effect) {
  return state.waveScenario?.effect === effect;
}

export function activeGearfiendMode() {
  return state.waveScenario?.gearfiendMode || null;
}

function spawnScenarioElite(scenario) {
  const elite = scenario.elite;
  if (!elite) return;
  const key = `${state.difficultyId}-${scenario.wave}-elite-${elite.id}`;
  state.spawnedWaveEvents ||= new Set();
  if (state.spawnedWaveEvents.has(key)) return;
  for (let i = 0; i < elite.count; i++) {
    const enemy = spawnEnemyById(elite.id);
    if (!enemy) continue;
    markElite(enemy, elite.variant);
    pulse(enemy.x, enemy.y, enemy.r * 3.2, enemy.color, 0.4);
  }
  state.spawnedWaveEvents.add(key);
}

function spawnScenarioEvent(scenario) {
  const event = scenario.event;
  if (!event) return;
  const key = `${state.difficultyId}-${scenario.wave}-event-${event.type}`;
  state.spawnedWaveEvents ||= new Set();
  if (state.spawnedWaveEvents.has(key)) return;
  if (event.type === "hazard_ring") spawnHazardRing(event);
  if (event.type === "hazard_line") spawnHazardLine(event);
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
  enemy.hp *= 20;
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
}
