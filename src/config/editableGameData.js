export const QUALITY_INFO = {
  common: { name: "普通", color: "#cbd5e1", mult: 1 },
  uncommon: { name: "优秀", color: "#77ff8a", mult: 1.18 },
  rare: { name: "精良", color: "#42e8ff", mult: 1.42 },
  epic: { name: "史诗", color: "#b48cff", mult: 1.74 },
  legendary: { name: "传说", color: "#ffd166", mult: 2.15 },
};

export const ITEM_RARITY_WEIGHTS = [
  ["common", 58],
  ["uncommon", 25],
  ["rare", 11],
  ["epic", 4.5],
  ["legendary", 1.5],
];

export const WEAPON_BASE_STATS = {
  arc: { level: 0, timer: 0, cooldown: 0.58, damage: 65, range: 720, chainRange: 205, chains: 3, falloff: 0.78, quality: "common", qualityMult: 1 },
  ice: { level: 0, timer: 0.8, cooldown: 0.84, count: 1, damage: 53, range: 980, speed: 500, turnSpeed: 5.8, freezeDuration: 0.45, quality: "common", qualityMult: 1 },
  missile: { level: 0, timer: 1.2, cooldown: 1.38, damage: 85, range: 1120, speed: 420, explodeRadius: 116, explodeDamage: 78, turnSpeed: 2.9, quality: "common", qualityMult: 1 },
  boomerang: { level: 0, timer: 1.4, cooldown: 1.48, count: 1, damage: 68, range: 840, speed: 610, returnAfter: 0.6, returnSpeed: 1.35, quality: "common", qualityMult: 1 },
  drone: { level: 0, angle: 0, count: 0, orbitRadius: 82, acquireRange: 650, attackRange: 500, fireCooldown: 0.34, bulletDamage: 33, bulletSpeed: 610, batteryMax: 150, shotCost: 20, rechargeRate: 46, drones: [], quality: "common", qualityMult: 1 },
  prism_railgun: { level: 0, timer: 1.05, cooldown: 1.65, count: 1, damage: 76, range: 960, width: 13, hitLimit: 6, refractionRange: 155, quality: "common", qualityMult: 1 },
  void_singularity: { level: 0, timer: 1.35, cooldown: 2.85, count: 1, damage: 28, range: 820, speed: 185, radius: 26, pullRadius: 170, damageRadius: 82, collapseRadius: 132, pullStrength: 310, pulseInterval: 0.58, life: 3.1, quality: "common", qualityMult: 1 },
  tesla_mine_chain: { level: 0, timer: 1.1, cooldown: 2.05, count: 1, damage: 34, range: 760, triggerRadius: 118, chainRange: 185, chainCount: 4, nodeLife: 5.2, armTime: 0.24, pulseCooldown: 0.62, fieldRadius: 108, quality: "common", qualityMult: 1 },
  starfall_scepter: { level: 0, timer: 1.6, cooldown: 2.65, count: 1, damage: 72, range: 1180, stars: 3, radius: 92, scarRadius: 86, scarDuration: 1.25, warningTime: 0.42, fallTime: 0.72, quality: "common", qualityMult: 1 },
  phase_needler: { level: 0, timer: 0.9, cooldown: 1.18, count: 1, damage: 38, range: 780, speed: 1040, needles: 2, pierce: 3, phaseDelay: 0.42, phaseRadius: 74, phaseDamage: 56, quality: "common", qualityMult: 1 },
  echo_tuning_fork: { level: 0, timer: 0.75, cooldown: 1.35, count: 1, damage: 54, range: 520, angle: Math.PI * 0.39, echoRadius: 118, echoDamage: 34, echoDuration: 0.55, resonanceDamage: 28, quality: "common", qualityMult: 1 },
  rift_loom: { level: 0, timer: 1.25, cooldown: 2.2, count: 1, damage: 34, range: 760, anchors: 3, radius: 142, lineWidth: 18, life: 0.8, collapseDamage: 72, scarDamage: 28, quality: "common", qualityMult: 1 },
};

export const WEAPON_INFO = {
  arc: { icon: "⚡", name: "棱镜电弧", desc: "自动锁定最近的敌人，闪电会在附近目标之间连续传导。", tags: ["自动锁定", "连锁传导", "瞬时命中"] },
  ice: { icon: "❄", name: "霜晶追踪", desc: "追踪冰刀会持续转向追猎，命中后短暂冻结未死亡目标。", tags: ["追踪", "冻结控制", "单体压制"] },
  missile: { icon: "◆", name: "核心飞弹", desc: "追踪飞弹命中后产生范围爆炸，适合清理密集怪群。", tags: ["追踪", "范围爆炸", "群体清理"] },
  boomerang: { icon: "✦", name: "霓虹回旋刃", desc: "远距离飞出后高速回收，往返切割同一路径上的敌人。", tags: ["远距离", "往返切割", "高穿透"] },
  drone: { icon: "▣", name: "星环无人机", desc: "无人机会离身攻击，电量不足时返回玩家身边充电。", tags: ["自动炮台", "电量循环", "持续输出"] },
  prism_railgun: { icon: "⟐", name: "棱镜轨道炮", desc: "蓄能后发射贯穿战场的棱镜光束，沿直线撕开敌群并产生折射打击。", tags: ["直线贯穿", "蓄能光束", "折射打击"] },
  void_singularity: { icon: "◉", name: "虚空奇点", desc: "发射缓慢移动的黑洞核心，吸附敌人并在寿命结束时坍缩爆发。", tags: ["引力吸附", "持续伤害", "坍缩爆发"] },
  tesla_mine_chain: { icon: "⌬", name: "特斯拉雷链", desc: "在地面布置电磁节点，敌人靠近后触发多目标连锁放电。", tags: ["电磁节点", "连锁放电", "陷阱控场"] },
  starfall_scepter: { icon: "✦", name: "星坠权杖", desc: "锁定远处敌群召唤星雨轰击，命中后留下闪烁星痕。", tags: ["远程锁定", "星雨轰击", "星痕残留"] },
  phase_needler: { icon: "⌁", name: "相位针雨", desc: "发射高速穿刺针束，命中后植入延迟爆裂的相位标记。", tags: ["高速穿刺", "延迟爆裂", "中距贯穿"] },
  echo_tuning_fork: { icon: "♮", name: "回声音叉", desc: "释放扇形声波压制近中距离敌人，命中后扩散回响波。", tags: ["扇形声波", "回响扩散", "持续压制"] },
  rift_loom: { icon: "⌘", name: "裂隙织机", desc: "投放空间锚点织出旋转裂隙线网，切割敌群并在收束时爆发。", tags: ["空间线网", "几何切割", "区域封锁"] },
};

export const ITEM_DATA_DEFS = [
  { id: "heart_container", icon: "♡", name: "心之容器", basePrice: 22, desc: "最大生命值 +5/10/20/35/50。" },
  { id: "healing_potion", icon: "✚", name: "治疗药水", basePrice: 12, desc: "立即恢复 20/30/50/80/120 点生命。" },
  { id: "shackles", icon: "⌁", name: "脚镣", basePrice: 20, singleQuality: true, fixedQuality: "uncommon", desc: "移动速度 -12，攻击范围 +80。" },
  { id: "dodge_cloak", icon: "◒", name: "闪避斗篷", basePrice: 24, singleQuality: true, fixedQuality: "rare", desc: "闪避率 +5%，最大生命值 -20。" },
  { id: "bait", icon: "※", name: "诱饵", basePrice: 16, singleQuality: true, fixedQuality: "epic", desc: "下一波敌人数量 +50%。" },
  { id: "magnet", icon: "◎", name: "磁铁", basePrice: 18, singleQuality: true, fixedQuality: "uncommon", desc: "金币和经验吸收范围 +32。" },
  { id: "speed_boots", icon: "»", name: "速度靴", basePrice: 20, singleQuality: true, fixedQuality: "rare", desc: "移动速度 +18。" },
  { id: "rapid_cord", icon: "⟲", name: "速射索", basePrice: 28, singleQuality: true, fixedQuality: "uncommon", desc: "攻击速度 +12%。" },
  { id: "fang", icon: "⋏", name: "尖牙", basePrice: 30, singleQuality: true, fixedQuality: "epic", desc: "攻击附加 7 DPS 流血，持续 2.8 秒。" },
  { id: "split_shot", icon: "≋", name: "分裂弹", basePrice: 34, singleQuality: true, fixedQuality: "rare", desc: "随机强化一个武器槽：按武器类型增加传递、数量、范围或宽度，该武器伤害 -20%。" },
  { id: "lucky_clover", icon: "♣", name: "幸运草", basePrice: 26, singleQuality: true, fixedQuality: "rare", desc: "幸运值 +10，商店更容易出现高品质商品。" },
  { id: "gloves", icon: "▣", name: "拳套", basePrice: 24, singleQuality: true, fixedQuality: "epic", desc: "暴击率 +7%。" },
  { id: "knife", icon: "†", name: "小刀", basePrice: 25, desc: "攻击伤害 +8%/10%/12%/14%/18%。" },
  { id: "healing_aura", icon: "✺", name: "治愈光环", basePrice: 32, desc: "每秒生命回复 +1/2/3/4/5。" },
  { id: "tardigrade", icon: "⬡", name: "水熊虫", basePrice: 50, singleQuality: true, fixedQuality: "epic", desc: "每波免疫 1 次攻击伤害，可叠加次数。" },
  { id: "heavy_armor", icon: "▰", name: "重甲", basePrice: 28, singleQuality: true, fixedQuality: "rare", desc: "防御 +8，移动速度 -10。" },
  { id: "turret", icon: "♜", name: "炮塔", basePrice: 38, singleQuality: true, fixedQuality: "epic", desc: "每波在玩家当前位置附近部署 1 座自动炮塔。" },
  { id: "thief_mark", icon: "¢", name: "窃贼印记", basePrice: 24, singleQuality: true, fixedQuality: "epic", unique: true, desc: "只能购买 1 个。敌人金币掉落 +20%，被攻击时损失当前金币 6%。" },
  { id: "star_cloak", icon: "✦", name: "星星斗篷", basePrice: 36, singleQuality: true, fixedQuality: "rare", unique: true, desc: "只能购买 1 个。被攻击时召唤 8 颗星雨反击敌人。" },
  { id: "landmine", icon: "◈", name: "地雷", basePrice: 32, singleQuality: true, fixedQuality: "rare", desc: "每波随机生成 3 个地雷，可叠加。" },
  { id: "airburst", icon: "✹", name: "空爆弹", basePrice: 40, unique: true, desc: "不可叠加。每隔 30/25/20/15/10 秒清空玩家附近敌方投射物。" },
];

const listeners = new Set();

export function onEditableDataChanged(listener) {
  listeners.add(listener);
}

export function applyEditableGameData({ weapons = {}, items = {} } = {}) {
  mergeMap(QUALITY_INFO, weapons.qualityInfo);
  mergeMap(WEAPON_INFO, weapons.info);
  mergeMap(WEAPON_BASE_STATS, weapons.baseStats);
  mergeRarityWeights(ITEM_RARITY_WEIGHTS, items.rarityWeights);
  if (Array.isArray(items.definitions)) mergeArrayById(ITEM_DATA_DEFS, items.definitions);
  for (const listener of listeners) listener();
}

export async function loadEditableGameData() {
  const [weapons, items] = await Promise.all([
    fetchJson("../config/weapon-config.json"),
    fetchJson("../config/item-config.json"),
  ]);
  applyEditableGameData({ weapons, items });
}

async function fetchJson(path) {
  try {
    const response = await fetch(new URL(path, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    return await response.json();
  } catch {
    return {};
  }
}

function mergeMap(target, patch = {}) {
  for (const [id, value] of Object.entries(patch || {})) {
    target[id] = { ...(target[id] || {}), ...value };
  }
}

function mergeArrayById(target, patch) {
  for (const value of patch) {
    if (!value?.id) continue;
    const index = target.findIndex((entry) => entry.id === value.id);
    if (index >= 0) target[index] = { ...target[index], ...value };
    else target.push({ ...value });
  }
}

function mergeRarityWeights(target, patch = {}) {
  for (const [quality, weight] of Object.entries(patch || {})) {
    const normalized = Number(weight);
    if (!Number.isFinite(normalized)) continue;
    const entry = target.find((item) => item[0] === quality);
    if (entry) entry[1] = Math.max(0, normalized);
    else target.push([quality, Math.max(0, normalized)]);
  }
}
