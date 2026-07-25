import { world } from "../state.js";

const registries = new WeakMap();

export function addBossProjectile(owner, projectile, limit = Infinity) {
  const registry = registryFor(owner);
  if (registry.projectiles.size >= limit) return null;
  projectile.__bossEffectOwner = owner;
  projectile.__bossEffectKind = "projectile";
  registry.projectiles.add(projectile);
  world.enemyProjectiles.push(projectile);
  return projectile;
}

export function addBossHazard(owner, hazard, limit = Infinity) {
  const registry = registryFor(owner);
  if (registry.hazards.size >= limit) return null;
  hazard.__bossEffectOwner = owner;
  hazard.__bossEffectKind = "hazard";
  registry.hazards.add(hazard);
  world.hazards.push(hazard);
  return hazard;
}

export function bossProjectileCount(owner, predicate = null) {
  const registry = registries.get(owner);
  if (!registry) return 0;
  if (!predicate) return registry.projectiles.size;
  let count = 0;
  for (const projectile of registry.projectiles) if (predicate(projectile)) count++;
  return count;
}

export function bossHazardCount(owner, predicate = null) {
  const registry = registries.get(owner);
  if (!registry) return 0;
  if (!predicate) return registry.hazards.size;
  let count = 0;
  for (const hazard of registry.hazards) if (predicate(hazard)) count++;
  return count;
}

export function forEachBossProjectile(owner, callback) {
  const registry = registries.get(owner);
  if (!registry) return;
  for (const projectile of registry.projectiles) callback(projectile);
}

export function findBossHazard(owner, predicate) {
  const registry = registries.get(owner);
  if (!registry) return null;
  let match = null;
  for (const hazard of registry.hazards) if (predicate(hazard)) match = hazard;
  return match;
}

export function releaseBossEffect(effect) {
  const owner = effect?.__bossEffectOwner;
  if (!owner) return;
  const registry = registries.get(owner);
  if (!registry) return;
  if (effect.__bossEffectKind === "projectile") registry.projectiles.delete(effect);
  else if (effect.__bossEffectKind === "hazard") registry.hazards.delete(effect);
  effect.__bossEffectOwner = null;
}

export function clearBossEffects(owner) {
  const registry = registries.get(owner) || { projectiles: new Set(), hazards: new Set() };
  compactOwned(world.enemyProjectiles, registry.projectiles, owner);
  compactOwned(world.hazards, registry.hazards, owner);
  registry.projectiles.clear();
  registry.hazards.clear();
  registries.delete(owner);
}

function registryFor(owner) {
  let registry = registries.get(owner);
  if (!registry) {
    registry = { projectiles: new Set(), hazards: new Set() };
    registries.set(owner, registry);
  }
  return registry;
}

function compactOwned(array, owned, owner) {
  let write = 0;
  for (let read = 0; read < array.length; read++) {
    const entry = array[read];
    if (
      owned.has(entry)
      || entry.bossOwner === owner
      || entry.convictOwner === owner
      || entry.stormTyrantOwner === owner
    ) {
      entry.__bossEffectOwner = null;
      continue;
    }
    array[write++] = entry;
  }
  array.length = write;
}
