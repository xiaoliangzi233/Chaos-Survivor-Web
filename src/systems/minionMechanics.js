import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, particle, pulse } from "../effects.js";
import { clamp, distSq } from "../utils.js";
import { applyPlayerStatus } from "./statusEffects.js";

const DIFFICULTY_RANK = Object.freeze({
  ember: 0,
  neon: 1,
  overclock: 2,
  singularity: 3,
  apocalypse: 4,
  void_crown: 5,
});

export const NON_BOSS_ENEMY_IDS = Object.freeze([
  "zombie", "lancer", "wisp", "slime_large", "slime_medium", "slime_small",
  "blackhole_mage", "mech_worm", "doctor", "embermine", "exploder", "tank",
  "pyromancer", "laser_eye", "razorbat", "wizard", "pentastar", "gearfiend",
  "prism_medic", "phase_mirage", "magnet_raider", "magma_beetle", "siege_pylon",
  "brood_seeder", "line_raider", "shield_caster", "gunner", "artillery",
  "slime_diamond", "slime_gold", "slime_glow", "slime_weeping", "slime_devil",
  "slime_angel", "thief",
]);

export const MINION_MECHANIC_TIPS = Object.freeze({
  zombie: "会预警扇形抓击并施加创伤；高阶尸群会从两侧包抄。",
  lancer: "冲锋命中会造成创伤，高阶冲锋路径会残留黏着切割带。",
  wisp: "雪花附带冰缓，高阶雪花消散处会形成短时冰区。",
  slime_large: "落地震环会推离玩家，高阶落点残留黏液。",
  slime_medium: "跳跃会预判玩家移动，高阶落点残留黏液。",
  slime_small: "近身接触会叠加黏着，连续接触会更难脱身。",
  blackhole_mage: "引导可被攻击缩短；高阶黑洞会弯折场上的既有敌弹。",
  mech_worm: "突进路径会留下造成干扰的导电轨迹。",
  doctor: "治疗是可被攻击打断的引导技能，优先击破可终止续航。",
  embermine: "高阶相邻地雷会形成带预警的绊线。",
  exploder: "会先锁定落点，再跳入该处并沿用原爆炸范围。",
  tank: "架盾时形成有方向的掩体，正面挡弹但可绕后。",
  pyromancer: "火球消失处会形成预警火墙，穿越会受到创伤。",
  laser_eye: "扫描命中施加干扰，高阶扫描后留下短时扫描线。",
  razorbat: "飞刃与本体之间存在切割连线，绕开连线再追击。",
  wizard: "法弹施加干扰，高阶消散处会留下诅咒区。",
  pentastar: "原有五枚弹体会围成短时五芒封锁区，不会额外增弹。",
  gearfiend: "快齿轮可反弹一次，慢齿轮陷阱会牵引并施加干扰。",
  prism_medic: "引导期间维持单个折射场，攻击可打断并停止敌弹折射。",
  phase_mirage: "相位突袭后会在残像间生成延迟斩线。",
  magnet_raider: "部署交替推拉的磁极节点，会牵引拾取物与低速敌弹。",
  magma_beetle: "熔岩路径附带黏着，高阶撞击还会产生预警冲击区。",
  siege_pylon: "高阶两座塔会建立可见防护连接线，切断站位可解除封锁。",
  brood_seeder: "召唤改为可摧毁育巢舱，未及时击破才会孵化。",
  line_raider: "直线冲锋后会留下限量黏着尾迹。",
  shield_caster: "主动护罩带方向性投射物阻挡，可攻击施法者打断。",
  gunner: "弹数不变；不同枪械外形对应收束、交叉或旋转弹道。",
  artillery: "炮击后留下无额外伤害的创伤减速弹坑。",
  slime_diamond: "落地生成短时十字晶墙，会拦截玩家投射物。",
  slime_gold: "会暂存附近掉落物并逃跑，受击或死亡会全部返还。",
  slime_glow: "落地释放带预警的干扰脉冲。",
  slime_weeping: "落地留下限量减速泪池。",
  slime_devil: "落地生成延迟灼烧符文，踏入会受到创伤。",
  slime_angel: "会引导治疗并净化史莱姆控制效果，攻击可打断。",
  thief: "不造成伤害；会暂存少量金币与经验，受击立即掉出。",
});

const NON_BOSS_ENEMY_SET = new Set(NON_BOSS_ENEMY_IDS);
const GLOBAL_MINION_HAZARD_CAP = 48;

export function minionMechanicTier(
  difficultyId = state.difficultyId || state.difficulty?.id || "ember",
  wave = state.wave || 1,
) {
  const rank = DIFFICULTY_RANK[difficultyId] ?? 0;
  if (rank >= 2) return 2;
  if (rank === 1) return wave >= 11 ? 2 : 1;
  if (wave >= 12) return 2;
  if (wave >= 3) return 1;
  return 0;
}

export function beginMinionMechanicFrame(enemy) {
  if (!enemy || enemy.boss || !NON_BOSS_ENEMY_SET.has(enemy.type)) return null;
  enemy.mechanicTier = minionMechanicTier();
  return {
    x: enemy.x,
    y: enemy.y,
    state: enemy.state,
    attackState: enemy.attackState,
    phaseState: enemy.phaseState,
    hopState: enemy.hopState,
    channel: enemy.channel,
    projectileStart: world.enemyProjectiles.length,
    hazardStart: world.hazards.length,
  };
}

export function endMinionMechanicFrame(enemy, dt, frame) {
  if (!frame || enemy.dead || enemy.mechanicTier <= 0) return;
  const newProjectiles = world.enemyProjectiles.slice(frame.projectileStart);
  const newHazards = world.hazards.slice(frame.hazardStart);
  decorateEnemyProjectiles(enemy, newProjectiles);
  decorateEnemyHazards(enemy, newHazards);
  updateEnemySignatureMechanic(enemy, dt, frame);
}

export function notifyMinionDamaged(enemy, amount = 0) {
  if (!enemy || enemy.boss || enemy.dead) return;
  enemy.mechanicInterrupted = Math.max(enemy.mechanicInterrupted || 0, Math.min(0.36, 0.08 + amount / Math.max(1, enemy.maxHp) * 0.8));
  if (enemy.type === "blackhole_mage" && enemy.state === "channel") {
    enemy.channelTime = Math.max(0, (enemy.channelTime || 0) - enemy.mechanicInterrupted);
  }
  if (enemy.type === "doctor" || enemy.type === "prism_medic" || enemy.type === "slime_angel") {
    enemy.channel = Math.max(0, (enemy.channel || 0) - enemy.mechanicInterrupted);
  }
  if (enemy.type === "shield_caster" && ((enemy.shieldWindup || 0) > 0 || (enemy.shieldActive || 0) > 0)) {
    enemy.shieldWindup = 0;
    enemy.shieldActive = 0;
    enemy.cooldown = Math.max(enemy.cooldown || 0, 1.8);
  }
  if ((enemy.type === "slime_gold" || enemy.type === "thief") && enemy.stolenLoot?.length) {
    releaseStoredLoot(
      enemy,
      enemy.type === "thief" ? Infinity : Math.max(1, Math.ceil(enemy.stolenLoot.length * 0.4)),
    );
  }
}

export function notifyMinionKilled(enemy) {
  if (!enemy || enemy.boss) return;
  releaseStoredLoot(enemy, Infinity);
  for (const hazard of world.hazards) {
    if (hazard.minionOwner === enemy && !hazard.persistOnOwnerDeath) hazard.life = 0;
  }
}

export function addMinionHazard(owner, hazard, { cap = 2, link = false } = {}) {
  if (!hazard) return null;
  const skillKey = hazard.skillKey || hazard.kind || "minion_zone";
  const lineCategory = hazard.x1 != null || hazard.warningType === "line";
  const owned = world.hazards.filter((entry) =>
    entry.minionSkill
    && entry.minionOwner === owner
    && entry.life > 0
    && (lineCategory
      ? entry.x1 != null || entry.warningType === "line"
      : entry.x1 == null && entry.warningType !== "line")
  );
  const ownerCap = link ? 1 : cap;
  while (owned.length >= ownerCap) {
    const oldest = owned.shift();
    if (oldest) oldest.life = 0;
  }
  const active = world.hazards.filter((entry) => entry.minionSkill && entry.life > 0);
  while (active.length >= GLOBAL_MINION_HAZARD_CAP) {
    const oldest = active.shift();
    if (oldest) oldest.life = 0;
  }
  const armTime = hazard.armTime == null ? 0.55 : Math.max(0, hazard.armTime);
  const entry = {
    kind: hazard.kind || "minion_zone",
    minionSkill: true,
    minionOwner: owner || null,
    ownerType: owner?.type || hazard.ownerType || "",
    skillKey,
    x: hazard.x ?? owner?.x ?? 0,
    y: hazard.y ?? owner?.y ?? 0,
    r: hazard.r || 54,
    width: hazard.width || 18,
    color: hazard.color || owner?.color || "#b48cff",
    life: hazard.life || 2.2,
    maxLife: hazard.maxLife || hazard.life || 2.2,
    armTime,
    armDuration: hazard.armDuration ?? armTime,
    warningType: hazard.warningType || (hazard.x1 != null ? "line" : "circle"),
    statusDuration: hazard.statusDuration,
    statusId: hazard.statusId || "",
    statusStacks: hazard.statusStacks || 1,
    applyCooldown: hazard.applyCooldown || 0.42,
    nextApplyAt: 0,
    damage: 0,
    createdAt: state.time || 0,
    ...hazard,
  };
  world.hazards.push(entry);
  return entry;
}

export function updateMinionHazard(hazard, dt) {
  if (!hazard?.minionSkill) return;
  if (hazard.kind !== "brood_pod") hazard.armTime = Math.max(0, (hazard.armTime || 0) - dt);
  hazard.spin = (hazard.spin || 0) + dt * (hazard.spinSpeed || 1.8);
  hazard.nextApplyAt = Math.max(0, (hazard.nextApplyAt || 0) - dt);
  const owner = hazard.minionOwner;
  if (owner?.dead && !hazard.persistOnOwnerDeath) hazard.life = 0;
  if (hazard.linkProjectile) {
    const projectile = hazard.linkProjectile;
    if ((projectile.life || 0) <= 0 || projectile.__removeFromWorld) hazard.life = 0;
    else {
      hazard.x1 = owner?.x ?? hazard.x1;
      hazard.y1 = owner?.y ?? hazard.y1;
      hazard.x2 = projectile.x;
      hazard.y2 = projectile.y;
      hazard.x = (hazard.x1 + hazard.x2) * 0.5;
      hazard.y = (hazard.y1 + hazard.y2) * 0.5;
    }
  }
  if (hazard.linkOwner) {
    const other = hazard.linkOwner;
    if (owner?.dead || other.dead) hazard.life = 0;
    else {
      hazard.x1 = owner.x;
      hazard.y1 = owner.y;
      hazard.x2 = other.x;
      hazard.y2 = other.y;
      hazard.x = (owner.x + other.x) * 0.5;
      hazard.y = (owner.y + other.y) * 0.5;
    }
  }
  if (hazard.linkMineA && hazard.linkMineB) {
    const a = hazard.linkMineA;
    const b = hazard.linkMineB;
    if ((a.life || 0) <= 0 || (b.life || 0) <= 0) hazard.life = 0;
    else {
      hazard.x1 = a.x;
      hazard.y1 = a.y;
      hazard.x2 = b.x;
      hazard.y2 = b.y;
      hazard.x = (a.x + b.x) * 0.5;
      hazard.y = (a.y + b.y) * 0.5;
    }
  }
  if ((hazard.pull || hazard.push) && hazard.armTime <= 0) {
    pushOrPullPlayer(hazard, dt);
  }
  if (hazard.kind === "magnetic_node" && hazard.armTime <= 0) {
    updateMagneticMinionNode(hazard, dt);
  }
}

export function applyMinionHazardStatus(hazard, player = state.player) {
  if (!hazard?.minionSkill || hazard.armTime > 0 || hazard.nextApplyAt > 0 || !hazard.statusId) return false;
  if (!minionHazardContains(hazard, player)) return false;
  hazard.nextApplyAt = hazard.applyCooldown || 0.42;
  applyPlayerStatus(player, hazard.statusId, {
    duration: hazard.statusDuration,
    stacks: hazard.statusStacks || 1,
    source: hazard.minionOwner || hazard,
  });
  if (hazard.secondaryStatusId) {
    applyPlayerStatus(player, hazard.secondaryStatusId, {
      duration: hazard.secondaryStatusDuration,
      stacks: hazard.secondaryStatusStacks || 1,
      source: hazard.minionOwner || hazard,
    });
  }
  return true;
}

export function minionHazardContains(hazard, body) {
  if (!hazard || !body) return false;
  if (hazard.x1 != null && hazard.x2 != null) {
    return pointSegmentDistance(body.x, body.y, hazard.x1, hazard.y1, hazard.x2, hazard.y2)
      < (body.r || 0) + (hazard.width || 18);
  }
  if (hazard.coneAngle != null) {
    const dx = body.x - hazard.x;
    const dy = body.y - hazard.y;
    const distance = Math.hypot(dx, dy);
    if (distance > (hazard.r || 0) + (body.r || 0)) return false;
    return Math.abs(angleDifference(Math.atan2(dy, dx), hazard.coneAngle)) <= (hazard.coneArc || 0.8) * 0.5;
  }
  return distSq(hazard.x, hazard.y, body.x, body.y) < ((hazard.r || 0) + (body.r || 0)) ** 2;
}

export function isPlayerProjectileBlocked(projectile) {
  if (!projectile) return false;
  for (const hazard of world.hazards) {
    if (!hazard.minionSkill || !hazard.projectileBlocker || hazard.armTime > 0 || hazard.life <= 0) continue;
    if (!minionHazardContains(hazard, projectile)) continue;
    if (hazard.blockNormalX != null) {
      const approach = (projectile.vx || 0) * hazard.blockNormalX + (projectile.vy || 0) * hazard.blockNormalY;
      if (approach >= 0) continue;
    }
    if (hazard.hp != null) {
      hazard.hp -= Math.max(1, projectile.damage || 1);
      if (hazard.hp <= 0) {
        hazard.life = 0;
        burst(projectile.x, projectile.y, 8, hazard.color, 130);
      }
    }
    pulse(projectile.x, projectile.y, 18, hazard.color, 0.1);
    return true;
  }
  return false;
}

export function expireMinionProjectile(projectile) {
  if (!projectile?.expireHazardKind || projectile.expireHazardDone) return;
  projectile.expireHazardDone = true;
  const statusId = projectile.expireHazardStatus || projectile.statusId || "";
  const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
  const length = projectile.expireHazardLine ? 220 : 0;
  addMinionHazard(projectile.owner || null, {
    kind: projectile.expireHazardKind,
    skillKey: `${projectile.sourceType || "projectile"}-expire`,
    x: projectile.x,
    y: projectile.y,
    r: projectile.expireHazardRadius || 54,
    life: projectile.expireHazardLife || 2.2,
    color: projectile.color,
    statusId,
    statusDuration: projectile.statusDuration,
    armTime: 0.55,
    warningType: projectile.expireHazardLine ? "line" : "circle",
    angle,
    length,
    x1: projectile.expireHazardLine ? projectile.x - Math.cos(angle) * length * 0.5 : undefined,
    y1: projectile.expireHazardLine ? projectile.y - Math.sin(angle) * length * 0.5 : undefined,
    x2: projectile.expireHazardLine ? projectile.x + Math.cos(angle) * length * 0.5 : undefined,
    y2: projectile.expireHazardLine ? projectile.y + Math.sin(angle) * length * 0.5 : undefined,
  });
}

export function createBroodPod(owner, count = 2) {
  return addMinionHazard(owner, {
    kind: "brood_pod",
    skillKey: "brood-pod",
    x: owner.x,
    y: owner.y,
    r: 34,
    life: 3.4,
    maxLife: 3.4,
    armTime: 2.4,
    armDuration: 2.4,
    hp: Math.max(1, owner.maxHp * 0.18),
    projectileBlocker: true,
    statusId: owner.mechanicTier >= 2 ? "adhesive" : "",
    statusDuration: 1.5,
    hatchCount: count,
    color: owner.color,
    persistOnOwnerDeath: true,
  }, { cap: 2 });
}

function decorateEnemyProjectiles(enemy, projectiles) {
  if (!projectiles.length) return;
  for (const projectile of projectiles) {
    projectile.owner ||= enemy;
    projectile.sourceType ||= enemy.type;
    projectile.mechanicTier = enemy.mechanicTier;
    if (enemy.type === "wisp") {
      projectile.statusId = "chill";
      projectile.statusDuration = 2.5;
      if (enemy.mechanicTier >= 2) {
        projectile.expireHazardKind = "minion_chill_field";
        projectile.expireHazardStatus = "chill";
        projectile.expireHazardRadius = 58;
      }
    } else if (enemy.type === "pyromancer") {
      projectile.expireHazardKind = "minion_flame_wall";
      projectile.expireHazardStatus = "wound";
      projectile.expireHazardLine = true;
      projectile.expireHazardLife = enemy.mechanicTier >= 2 ? 2.4 : 1.6;
    } else if (enemy.type === "wizard") {
      projectile.statusId = "interference";
      projectile.statusDuration = 3;
      if (enemy.mechanicTier >= 2) {
        projectile.expireHazardKind = "minion_curse_field";
        projectile.expireHazardStatus = "interference";
      }
    } else if (enemy.type === "gearfiend") {
      projectile.statusId = "interference";
      if (!projectile.landTrapOnExpire) projectile.bounceRemaining = Math.max(projectile.bounceRemaining || 0, 1);
      else {
        projectile.trapStatusId = "interference";
        projectile.trapPull = enemy.mechanicTier >= 2 ? 65 : 0;
      }
    } else if (enemy.type === "gunner") {
      projectile.patternMotion = enemy.pattern;
      projectile.patternOriginX = enemy.x;
      projectile.patternOriginY = enemy.y;
      projectile.patternPhase = Math.atan2(projectile.y - enemy.y, projectile.x - enemy.x);
      projectile.statusId = enemy.mechanicTier >= 2 ? "interference" : "";
    } else if (enemy.type === "laser_eye") {
      projectile.statusId = "interference";
      projectile.statusDuration = 3;
    } else if (enemy.type === "phase_mirage") {
      projectile.statusId = enemy.mechanicTier >= 2 ? "interference" : "";
    }
  }
  if (enemy.type === "razorbat") {
    const blade = projectiles.find((projectile) => projectile.shape === "razorBoomerang");
    if (blade) {
      addMinionHazard(enemy, {
        kind: "minion_razor_tether",
        skillKey: "razor-tether",
        linkProjectile: blade,
        x1: enemy.x,
        y1: enemy.y,
        x2: blade.x,
        y2: blade.y,
        width: 10,
        life: blade.life,
        color: enemy.color,
        statusId: "adhesive",
        statusDuration: 1.6,
        armTime: 0.55,
        warningType: "line",
      }, { link: true });
    }
  }
  if (enemy.type === "pentastar" && projectiles.length >= 5) {
    addMinionHazard(enemy, {
      kind: "minion_pentagram",
      skillKey: "pentagram",
      x: enemy.x,
      y: enemy.y,
      r: enemy.mechanicTier >= 2 ? 96 : 76,
      life: enemy.mechanicTier >= 2 ? 2.1 : 1.5,
      color: enemy.color,
      statusId: "interference",
      statusDuration: 2.2,
      armTime: 0.65,
      polygonSides: 5,
    }, { cap: 1 });
  }
}

function decorateEnemyHazards(enemy, hazards) {
  for (const hazard of hazards) {
    if (hazard.minionSkill || hazard.bossHazard) continue;
    if (enemy.type === "artillery" && hazard.kind === "artillery_blast") {
      hazard.minionOwner = enemy;
      hazard.leaveMinionCrater = true;
    } else if (enemy.type === "magma_beetle" && hazard.kind === "magma_crack") {
      hazard.minionOwner = enemy;
      hazard.statusId = "adhesive";
      hazard.statusDuration = 1.4;
    } else if (enemy.type === "embermine" && hazard.kind === "ember_mine") {
      hazard.minionOwner = enemy;
    }
  }
}

function updateEnemySignatureMechanic(enemy, dt, frame) {
  const tier = enemy.mechanicTier;
  enemy.mechanicSkillCooldown = Math.max(0, (enemy.mechanicSkillCooldown || 0) - dt);
  switch (enemy.type) {
    case "zombie": updateZombieMechanic(enemy, dt, tier); break;
    case "lancer": updateLancerMechanic(enemy, dt, frame, tier); break;
    case "mech_worm": updateMechWormMechanic(enemy, dt, tier); break;
    case "slime_large":
    case "slime_medium":
    case "slime_small":
    case "slime_diamond":
    case "slime_gold":
    case "slime_glow":
    case "slime_weeping":
    case "slime_devil":
    case "slime_angel": updateSlimeMechanic(enemy, dt, frame, tier); break;
    case "blackhole_mage": updateBlackholeMechanic(enemy, dt, tier); break;
    case "embermine": updateMineLinks(enemy, tier); break;
    case "exploder": updateExploderLeap(enemy, dt, tier); break;
    case "tank": updateTankCover(enemy, tier); break;
    case "laser_eye": updateLaserScan(enemy, tier); break;
    case "prism_medic": updatePrismField(enemy, tier); break;
    case "phase_mirage": updatePhaseLine(enemy, frame, tier); break;
    case "magnet_raider": updateMagnetNode(enemy, tier); break;
    case "magma_beetle": updateMagmaImpact(enemy, frame, tier); break;
    case "siege_pylon": updatePylonLink(enemy, tier); break;
    case "line_raider": updateLineWake(enemy, dt, tier); break;
    case "shield_caster": updateShieldBarrier(enemy, tier); break;
    case "thief": updateLootThief(enemy, dt, true); break;
  }
}

function updateZombieMechanic(enemy, dt, tier) {
  const player = state.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  if (tier >= 2) {
    enemy.mechanicSide ||= Math.random() < 0.5 ? -1 : 1;
    const crowd = world.enemies.filter((entry) => entry.type === "zombie" && !entry.dead && distSq(entry.x, entry.y, enemy.x, enemy.y) < 150 ** 2).length;
    if (crowd >= 2) {
      enemy.x += -dy / distance * enemy.mechanicSide * enemy.speed * 0.22 * dt;
      enemy.y += dx / distance * enemy.mechanicSide * enemy.speed * 0.22 * dt;
    }
  }
  if ((enemy.grabWindup || 0) > 0) {
    enemy.grabWindup -= dt;
    if (enemy.grabWindup <= 0) {
      if (distance < 122 && Math.abs(angleDifference(Math.atan2(dy, dx), enemy.grabAngle || 0)) < 0.72) {
        applyPlayerStatus(player, "wound", { duration: 4, source: enemy });
        burst(player.x, player.y, 5, "#ff6b7a", 90);
      }
      enemy.mechanicSkillCooldown = 3.2;
    }
  } else if (enemy.mechanicSkillCooldown <= 0 && distance > 52 && distance < 128) {
    enemy.grabWindup = 0.62;
    enemy.grabAngle = Math.atan2(dy, dx);
    addMinionHazard(enemy, {
      kind: "minion_grab_warning",
      skillKey: "grab-warning",
      x: enemy.x + Math.cos(enemy.grabAngle) * 62,
      y: enemy.y + Math.sin(enemy.grabAngle) * 62,
      r: 48,
      life: 0.7,
      color: "#ff6b7a",
      armTime: 0.62,
    }, { cap: 1 });
  }
}

function updateLancerMechanic(enemy, dt, frame, tier) {
  if (enemy.attackState === "dashing") {
    const player = state.player;
    if (distSq(enemy.x, enemy.y, player.x, player.y) < (enemy.r + player.r + 18) ** 2) {
      applyPlayerStatus(player, "wound", { duration: 4, source: enemy });
    }
    if (tier >= 2) {
      enemy.mechanicTrailTimer = Math.max(0, (enemy.mechanicTrailTimer || 0) - dt);
      if (enemy.mechanicTrailTimer <= 0) {
        enemy.mechanicTrailTimer = 0.18;
        addMinionHazard(enemy, {
          kind: "minion_lancer_wake",
          skillKey: "lancer-wake",
          x1: frame.x,
          y1: frame.y,
          x2: enemy.x,
          y2: enemy.y,
          x: (frame.x + enemy.x) * 0.5,
          y: (frame.y + enemy.y) * 0.5,
          width: 14,
          life: 1.45,
          color: "#ffcf8a",
          statusId: "adhesive",
          statusDuration: 1.6,
          armTime: 0.55,
          warningType: "line",
        });
      }
    }
  }
}

function updateMechWormMechanic(enemy, dt, tier) {
  if (enemy.state !== "strike") return;
  enemy.mechanicTrailTimer = Math.max(0, (enemy.mechanicTrailTimer || 0) - dt);
  if (enemy.mechanicTrailTimer > 0) return;
  enemy.mechanicTrailTimer = tier >= 2 ? 0.16 : 0.28;
  addMinionHazard(enemy, {
    kind: "minion_conductive_track",
    skillKey: "worm-track",
    x: enemy.x,
    y: enemy.y,
    r: 34,
    life: 1.8,
    color: enemy.color,
    statusId: "interference",
    statusDuration: 2,
    armTime: 0.55,
  }, { cap: 2 });
}

function updateSlimeMechanic(enemy, dt, frame, tier) {
  if (enemy.type === "slime_gold" || enemy.type === "thief") updateLootThief(enemy, dt, false);
  if (enemy.type === "slime_angel") updateAngelChannel(enemy, dt, tier);
  const tookOff = frame.hopState !== "air" && enemy.hopState === "air";
  if (tookOff && ["slime_large", "slime_diamond", "slime_glow", "slime_weeping", "slime_devil"].includes(enemy.type)) {
    const duration = Math.max(0.55, enemy.hopDuration || 0.7);
    const radius = enemy.type === "slime_large" ? 105 : enemy.type === "slime_diamond" ? 92 : 64;
    addMinionHazard(enemy, {
      kind: "minion_slime_landing_warning",
      skillKey: "slime-landing-warning",
      x: enemy.x + (enemy.hopVx || 0) * duration,
      y: enemy.y + (enemy.hopVy || 0) * duration,
      r: radius,
      life: duration + 0.16,
      color: enemy.color,
      armTime: duration,
      armDuration: duration,
      warningType: "circle",
    }, { cap: 1 });
  }
  const landed = frame.hopState === "air" && enemy.hopState === "ground";
  if (!landed) return;
  if (enemy.type === "slime_large") {
    pushPlayerFrom(enemy.x, enemy.y, 105, 48);
    pulse(enemy.x, enemy.y, 105, enemy.color, 0.32);
    if (tier >= 2) addAdhesivePool(enemy, 74, 2.4);
  } else if (enemy.type === "slime_medium") {
    if (tier >= 2) addAdhesivePool(enemy, 52, 1.8);
  } else if (enemy.type === "slime_small") {
    if (distSq(enemy.x, enemy.y, state.player.x, state.player.y) < 74 ** 2) {
      applyPlayerStatus(state.player, "adhesive", { duration: 3, source: enemy });
    }
  } else if (enemy.type === "slime_diamond") {
    for (const angle of [0, Math.PI / 2]) {
      addMinionHazard(enemy, {
        kind: "minion_crystal_wall",
        skillKey: `diamond-wall-${angle}`,
        x1: enemy.x - Math.cos(angle) * 90,
        y1: enemy.y - Math.sin(angle) * 90,
        x2: enemy.x + Math.cos(angle) * 90,
        y2: enemy.y + Math.sin(angle) * 90,
        width: 12,
        life: 2,
        color: enemy.color,
        projectileBlocker: true,
        armTime: 0.65,
        warningType: "line",
      }, { cap: 2 });
    }
  } else if (enemy.type === "slime_glow") {
    addMinionHazard(enemy, {
      kind: "minion_glow_pulse",
      skillKey: "glow-pulse",
      r: 94,
      life: 1.5,
      color: enemy.color,
      statusId: "interference",
      statusDuration: 3,
      armTime: 0.6,
    }, { cap: 1 });
  } else if (enemy.type === "slime_weeping") {
    addAdhesivePool(enemy, 62, 2.8);
  } else if (enemy.type === "slime_devil") {
    addMinionHazard(enemy, {
      kind: "minion_scorch_rune",
      skillKey: "devil-rune",
      r: 58,
      life: 2.3,
      color: enemy.color,
      statusId: "wound",
      statusDuration: 3.2,
      armTime: 0.7,
    }, { cap: 2 });
  }
}

function addAdhesivePool(enemy, radius, life) {
  addMinionHazard(enemy, {
    kind: "minion_adhesive_pool",
    skillKey: "slime-pool",
    r: radius,
    life,
    color: enemy.color,
    statusId: "adhesive",
    statusDuration: 1.6,
    armTime: 0.55,
  });
}

function updateAngelChannel(enemy, dt, tier) {
  enemy.angelChannelCooldown = Math.max(0, (enemy.angelChannelCooldown || 0) - dt);
  if ((enemy.angelChannel || 0) > 0) {
    enemy.angelChannel -= dt + (enemy.mechanicInterrupted || 0);
    enemy.mechanicInterrupted = 0;
    for (const ally of world.enemies) {
      if (ally === enemy || ally.dead || ally.boss || !ally.type?.startsWith("slime_")) continue;
      if (distSq(enemy.x, enemy.y, ally.x, ally.y) > 250 ** 2) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.025 * dt);
      ally.freezeTimer = Math.max(0, (ally.freezeTimer || 0) - dt * (tier >= 2 ? 4 : 2));
      if (Math.random() < dt * 5) particle("healPlus", ally.x, ally.y, { color: enemy.color, life: 0.3, size: 7 });
    }
    if (enemy.angelChannel <= 0) enemy.angelChannelCooldown = 4.2;
  } else if (enemy.angelChannelCooldown <= 0) {
    const wounded = world.enemies.some((ally) =>
      ally !== enemy && !ally.dead && !ally.boss && ally.type?.startsWith("slime_")
      && ally.hp < ally.maxHp && distSq(enemy.x, enemy.y, ally.x, ally.y) < 250 ** 2
    );
    if (wounded) {
      enemy.angelChannel = 1.4;
      pulse(enemy.x, enemy.y, 250, enemy.color, 0.28);
    }
  }
}

function updateBlackholeMechanic(enemy, dt, tier) {
  if (enemy.state !== "channel" || !world.blackhole || tier < 2) return;
  for (const projectile of world.enemyProjectiles) {
    if (projectile.owner === enemy || projectile.bossProjectile) continue;
    const dx = world.blackhole.x - projectile.x;
    const dy = world.blackhole.y - projectile.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance > 360) continue;
    const bend = (1 - distance / 360) * 42 * dt;
    projectile.vx += dx / distance * bend;
    projectile.vy += dy / distance * bend;
  }
}

function updateMineLinks(enemy, tier) {
  if (tier < 2) return;
  const ownMines = world.hazards.filter((hazard) =>
    hazard.kind === "ember_mine" && hazard.minionOwner === enemy && hazard.life > 0
  );
  if (ownMines.length < 2) return;
  const a = ownMines[ownMines.length - 1];
  const b = ownMines[ownMines.length - 2];
  if (world.hazards.some((hazard) => hazard.skillKey === "mine-tripwire" && hazard.linkMineA === a && hazard.linkMineB === b)) return;
  addMinionHazard(enemy, {
    kind: "minion_mine_tripwire",
    skillKey: "mine-tripwire",
    linkMineA: a,
    linkMineB: b,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    width: 9,
    life: Math.min(a.life, b.life),
    color: enemy.color,
    statusId: "wound",
    statusDuration: 2.4,
    armTime: 0.65,
    warningType: "line",
  }, { link: true });
}

function updateExploderLeap(enemy, dt, tier) {
  if (enemy.armed || enemy.mechanicSkillCooldown > 0) return;
  const player = state.player;
  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (distance < 210 && distance > 104) {
    enemy.mechanicSkillCooldown = tier >= 2 ? 3.6 : 4.6;
    const lead = tier >= 2 ? 70 : 42;
    enemy.leapTargetX = clamp(player.x + player.dirX * lead, -WORLD_SIZE / 2 + enemy.r, WORLD_SIZE / 2 - enemy.r);
    enemy.leapTargetY = clamp(player.y + player.dirY * lead, -WORLD_SIZE / 2 + enemy.r, WORLD_SIZE / 2 - enemy.r);
    enemy.leapWindup = 0.58;
    pulse(enemy.leapTargetX, enemy.leapTargetY, 92, enemy.color, 0.42);
  }
}

function updateTankCover(enemy, tier) {
  if (enemy.stance <= 0) return;
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + Math.PI / 2;
  addOrRefreshBarrier(enemy, "tank-cover", angle, tier >= 2 ? 96 : 72, "#ffd166");
}

function updateLaserScan(enemy, tier) {
  if (enemy.state !== "fire") return;
  const player = state.player;
  if (pointRayDistance(player.x, player.y, enemy.x, enemy.y, enemy.angle || 0, 920) < player.r + enemy.r * 0.5 + 10) {
    applyPlayerStatus(player, "interference", { duration: 3, source: enemy });
  }
  if (tier >= 2 && !world.hazards.some((hazard) => hazard.skillKey === "laser-scan" && hazard.minionOwner === enemy)) {
    addMinionHazard(enemy, {
      kind: "minion_scan_line",
      skillKey: "laser-scan",
      x1: enemy.x,
      y1: enemy.y,
      x2: enemy.x + Math.cos(enemy.angle) * 920,
      y2: enemy.y + Math.sin(enemy.angle) * 920,
      width: 12,
      life: 1.2,
      color: enemy.color,
      statusId: "interference",
      statusDuration: 2.2,
      armTime: 0.55,
      warningType: "line",
    }, { link: true });
  }
}

function updatePrismField(enemy, tier) {
  if (enemy.channel <= 0) return;
  let field = world.hazards.find((hazard) => hazard.skillKey === "prism-field" && hazard.minionOwner === enemy);
  if (!field) {
    field = addMinionHazard(enemy, {
      kind: "prism_reflector",
      skillKey: "prism-field",
      r: tier >= 2 ? 76 : 58,
      life: 0.5,
      maxLife: 0.5,
      color: enemy.color,
      armTime: 0,
    }, { cap: 1 });
  }
  if (field) {
    field.x = enemy.x;
    field.y = enemy.y;
    field.life = Math.max(field.life, 0.35);
  }
}

function updatePhaseLine(enemy, frame, tier) {
  if (frame.phaseState !== "windup" || enemy.phaseState !== "strike") return;
  const previous = enemy.afterImages?.[Math.max(0, enemy.afterImages.length - 2)] || frame;
  addMinionHazard(enemy, {
    kind: "minion_phase_line",
    skillKey: "phase-line",
    x1: previous.x,
    y1: previous.y,
    x2: enemy.x,
    y2: enemy.y,
    width: 16,
    life: 1.6,
    color: enemy.color,
    statusId: tier >= 2 ? "interference" : "adhesive",
    statusDuration: 2,
    armTime: 0.62,
    warningType: "line",
  }, { link: true });
}

function updateMagnetNode(enemy, tier) {
  if (enemy.mechanicSkillCooldown > 0) return;
  enemy.mechanicSkillCooldown = tier >= 2 ? 4.2 : 5.4;
  enemy.magneticPolarity = (enemy.magneticPolarity || 1) * -1;
  addMinionHazard(enemy, {
    kind: "magnetic_node",
    skillKey: "magnetic-node",
    r: tier >= 2 ? 180 : 145,
    life: 3.2,
    color: enemy.magneticPolarity > 0 ? "#42e8ff" : "#ff4d6d",
    pull: enemy.magneticPolarity > 0 ? 85 : 0,
    push: enemy.magneticPolarity < 0 ? 70 : 0,
    statusId: "interference",
    statusDuration: 2.2,
    armTime: 0.65,
    polarity: enemy.magneticPolarity,
  }, { cap: 1 });
}

function updateMagmaImpact(enemy, frame, tier) {
  const half = WORLD_SIZE / 2;
  const struckWall = frame.state === "charge"
    && (Math.abs(enemy.x) >= half - enemy.r - 1 || Math.abs(enemy.y) >= half - enemy.r - 1);
  if (frame.state !== "charge" || (!struckWall && enemy.state === "charge") || tier < 2) return;
  addMinionHazard(enemy, {
    kind: "minion_magma_impact",
    skillKey: "magma-impact",
    r: 88,
    life: 1.8,
    color: enemy.color,
    statusId: "adhesive",
    statusDuration: 1.8,
    armTime: 0.6,
    coneAngle: enemy.chargeAngle || 0,
    coneArc: 1.35,
  }, { cap: 1 });
  pushPlayerFrom(enemy.x, enemy.y, 112, 56);
}

function updatePylonLink(enemy, tier) {
  if (tier < 2) return;
  const other = world.enemies.find((entry) =>
    entry !== enemy && entry.type === "siege_pylon" && !entry.dead
    && distSq(entry.x, entry.y, enemy.x, enemy.y) < 620 ** 2
  );
  if (!other) return;
  const alreadyLinked = world.hazards.some((hazard) =>
    hazard.skillKey === "pylon-link"
    && ((hazard.minionOwner === enemy && hazard.linkOwner === other)
      || (hazard.minionOwner === other && hazard.linkOwner === enemy))
  );
  if (alreadyLinked) return;
  addMinionHazard(enemy, {
    kind: "minion_pylon_link",
    skillKey: "pylon-link",
    linkOwner: other,
    x1: enemy.x,
    y1: enemy.y,
    x2: other.x,
    y2: other.y,
    width: 14,
    life: 999,
    color: enemy.color,
    statusId: "interference",
    statusDuration: 2,
    projectileBlocker: true,
    armTime: 0.7,
    warningType: "line",
  }, { link: true });
}

function updateLineWake(enemy, dt, tier) {
  if (enemy.state !== "dash") return;
  enemy.mechanicTrailTimer = Math.max(0, (enemy.mechanicTrailTimer || 0) - dt);
  if (enemy.mechanicTrailTimer > 0) return;
  enemy.mechanicTrailTimer = tier >= 2 ? 0.14 : 0.24;
  addMinionHazard(enemy, {
    kind: "minion_line_wake",
    skillKey: "line-wake",
    x: enemy.x,
    y: enemy.y,
    r: 38,
    life: 1.45,
    color: enemy.color,
    statusId: "adhesive",
    statusDuration: 1.5,
    armTime: 0.55,
  }, { cap: 2 });
}

function updateShieldBarrier(enemy, tier) {
  const shieldedNearby = world.enemies.some((entry) =>
    entry !== enemy && entry.shielded && distSq(entry.x, entry.y, enemy.x, enemy.y) < 230 ** 2
  );
  if (!shieldedNearby) return;
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + Math.PI / 2;
  addOrRefreshBarrier(enemy, "shield-barrier", angle, tier >= 2 ? 110 : 82, enemy.color);
}

function addOrRefreshBarrier(enemy, key, angle, halfLength, color) {
  let barrier = world.hazards.find((hazard) => hazard.skillKey === key && hazard.minionOwner === enemy);
  const sideX = Math.cos(angle);
  const sideY = Math.sin(angle);
  const frontAngle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  const normalX = Math.cos(frontAngle);
  const normalY = Math.sin(frontAngle);
  if (!barrier) {
    barrier = addMinionHazard(enemy, {
      kind: "minion_barrier",
      skillKey: key,
      x1: enemy.x - sideX * halfLength,
      y1: enemy.y - sideY * halfLength,
      x2: enemy.x + sideX * halfLength,
      y2: enemy.y + sideY * halfLength,
      width: 13,
      life: 0.45,
      color,
      projectileBlocker: true,
      blockNormalX: normalX,
      blockNormalY: normalY,
      armTime: 0.55,
      warningType: "line",
    }, { link: true });
  }
  if (barrier) {
    barrier.x1 = enemy.x - sideX * halfLength;
    barrier.y1 = enemy.y - sideY * halfLength;
    barrier.x2 = enemy.x + sideX * halfLength;
    barrier.y2 = enemy.y + sideY * halfLength;
    barrier.x = enemy.x;
    barrier.y = enemy.y;
    barrier.blockNormalX = normalX;
    barrier.blockNormalY = normalY;
    barrier.life = Math.max(barrier.life, 0.3);
  }
}

function updateLootThief(enemy, dt, aggressive) {
  enemy.stolenLoot ||= [];
  enemy.lootStealCooldown = Math.max(0, (enemy.lootStealCooldown || 0) - dt);
  if (enemy.lootStealCooldown > 0 || enemy.stolenLoot.length >= (aggressive ? 6 : 4)) return;
  let best = null;
  let bestCollection = null;
  let bestDistance = Infinity;
  for (const collection of [world.coins, world.gems]) {
    for (const item of collection) {
      const distance = distSq(enemy.x, enemy.y, item.x, item.y);
      if (distance < bestDistance && distance < (aggressive ? 150 : 120) ** 2) {
        best = item;
        bestCollection = collection;
        bestDistance = distance;
      }
    }
  }
  if (!best || !bestCollection) return;
  const distance = Math.max(1, Math.sqrt(bestDistance));
  best.x += (enemy.x - best.x) / distance * 210 * dt;
  best.y += (enemy.y - best.y) / distance * 210 * dt;
  if (distance > enemy.r + 10) return;
  const index = bestCollection.indexOf(best);
  if (index >= 0) bestCollection.splice(index, 1);
  enemy.stolenLoot.push({ item: best, kind: bestCollection === world.coins ? "coin" : "gem" });
  enemy.lootStealCooldown = 0.32;
  enemy.startFlee?.();
  pulse(enemy.x, enemy.y, 24, "#ffd166", 0.14);
}

function releaseStoredLoot(enemy, count) {
  if (!enemy?.stolenLoot?.length) return;
  let released = 0;
  while (enemy.stolenLoot.length && released < count) {
    const stored = enemy.stolenLoot.pop();
    const angle = Math.random() * TAU;
    stored.item.x = enemy.x + Math.cos(angle) * (18 + Math.random() * 14);
    stored.item.y = enemy.y + Math.sin(angle) * (18 + Math.random() * 14);
    (stored.kind === "coin" ? world.coins : world.gems).push(stored.item);
    released++;
  }
}

function updateMagneticMinionNode(hazard, dt) {
  for (const collection of [world.coins, world.gems]) {
    for (const item of collection) pullBody(item, hazard, dt, 145);
  }
  for (const projectile of world.enemyProjectiles) {
    if (projectile.bossProjectile || Math.hypot(projectile.vx || 0, projectile.vy || 0) > 250) continue;
    pullBody(projectile, hazard, dt, 42);
  }
}

function pushOrPullPlayer(hazard, dt) {
  const player = state.player;
  const dx = hazard.x - player.x;
  const dy = hazard.y - player.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  if (distance > hazard.r) return;
  const strength = (1 - distance / hazard.r) * (hazard.pull || hazard.push || 0);
  const direction = hazard.push ? -1 : 1;
  player.x = clamp(player.x + dx / distance * strength * direction * dt, -WORLD_SIZE / 2 + player.r, WORLD_SIZE / 2 - player.r);
  player.y = clamp(player.y + dy / distance * strength * direction * dt, -WORLD_SIZE / 2 + player.r, WORLD_SIZE / 2 - player.r);
}

function pullBody(body, hazard, dt, strength) {
  const dx = hazard.x - body.x;
  const dy = hazard.y - body.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  if (distance > hazard.r) return;
  const force = (1 - distance / hazard.r) * strength;
  body.x += dx / distance * force * dt;
  body.y += dy / distance * force * dt;
}

function pushPlayerFrom(x, y, radius, strength) {
  const player = state.player;
  const dx = player.x - x;
  const dy = player.y - y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  if (distance > radius + player.r) return;
  const amount = (1 - Math.min(1, distance / radius)) * strength;
  player.x = clamp(player.x + dx / distance * amount, -WORLD_SIZE / 2 + player.r, WORLD_SIZE / 2 - player.r);
  player.y = clamp(player.y + dy / distance * amount, -WORLD_SIZE / 2 + player.r, WORLD_SIZE / 2 - player.r);
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function pointRayDistance(px, py, x, y, angle, length) {
  return pointSegmentDistance(px, py, x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
}

function angleDifference(a, b) {
  let difference = a - b;
  while (difference > Math.PI) difference -= TAU;
  while (difference < -Math.PI) difference += TAU;
  return difference;
}
