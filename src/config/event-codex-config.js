export const EVENT_CODEX_ENTRIES = [
  { id: "blind", icon: "◐", name: "视野干扰", category: "环境异常", desc: "照明系统失效，战场可见范围大幅缩小，敌群会从暗区突然逼近。", color: "#8d6bff" },
  { id: "ice_skate", icon: "≈", name: "冰面滑行", category: "地形异常", desc: "低温冷凝层覆盖地面，移动会保留额外惯性，急停和转向都会变得困难。", color: "#9ff4ff" },
  { id: "reward_target", icon: "G", name: "奖励目标", category: "特殊目标", desc: "实验室小偷携带额外金币进入战场，需要在它逃离前完成追击。", color: "#ffd166" },
  { id: "fast_gears", icon: ">", name: "高速齿轮", category: "敌群异变", desc: "本波齿轮怪锁定高速形态，不再进入常规减速阶段。", color: "#ffb347" },
  { id: "scrap_wind", icon: "//", name: "废料风暴", category: "环境异常", desc: "高速废料掠过实验场，持续移动才能避开不断变化的危险区。", color: "#42e8ff" },
  { id: "toxic_residue", icon: "T", name: "剧毒残留", category: "污染区域", desc: "培养液残留覆盖实验场，进入污染区后会持续受到毒性伤害。", color: "#72ffb4" },
  { id: "invisible_brain_eaters", icon: "?", name: "隐匿侵袭", category: "敌群异变", desc: "部分敌人进入低可见状态，只会在接近时显露轮廓。", color: "#b48cff" },
  { id: "gear_trap", icon: "#", name: "齿轮陷阱", category: "机关封锁", desc: "大量机械陷阱被投放到战场，接触运转中的齿轮会受到伤害。", color: "#f59e0b" },
  { id: "mini_overdrive", icon: "+", name: "微型过载", category: "敌群异变", desc: "过载脉冲提升普通敌人的移动与攻击节奏，直到本波结束。", color: "#ff4d6d" },
  { id: "gravity_well_grid", icon: "O", name: "重力井", category: "空间异常", desc: "实验场生成多个引力节点，靠近核心的单位会被持续牵引。", color: "#8d6bff" },
  { id: "ember_mine_rain", icon: "*", name: "余烬雷雨", category: "爆炸封锁", desc: "余烬地雷成簇坠落并短暂预警，触发后会在附近产生高温爆炸。", color: "#ff7a1a" },
  { id: "prism_refraction", icon: "<>", name: "棱镜折射", category: "弹道异常", desc: "棱镜节点会折射经过的敌方弹幕，使原本稳定的弹道突然偏转。", color: "#f3f7ff" },
  { id: "nest_spore_bloom", icon: "S", name: "孢子增殖", category: "生物异常", desc: "巢核孢子在战场中持续孵化新的实验体，需要及时清理增殖节点。", color: "#a3e635" },
  { id: "magnetic_drift", icon: "M", name: "磁力漂移", category: "磁场异常", desc: "磁力节点会牵引资源和低速弹幕，改变它们原本的移动路线。", color: "#42e8ff" },
  { id: "overclock_pulse", icon: ">>", name: "过载脉冲", category: "敌群异变", desc: "周期性脉冲让敌群短暂加速，战场压力会随脉冲节奏起伏。", color: "#ff4d6d" },
  { id: "long_mech_worms", icon: "W", name: "蠕虫巨化", category: "实验体异变", desc: "少量机械蠕虫进入超长体节模式，生命和占场能力显著提高。", color: "#ff65d8" },
  { id: "laser_disaster", icon: "|", name: "激光灾难", category: "能量封锁", desc: "一道贯穿地图的高能激光从边界向玩家所在方向缓慢扫过。", color: "#ff4d6d" },
  { id: "phase_tear_grid", icon: "X", name: "裂相撕裂", category: "空间异常", desc: "相位裂隙扭曲附近的移动方向，进入范围后会被横向拖拽。", color: "#d946ef" },
  { id: "mirror_laser_gate", icon: "H", name: "镜面光闸", category: "能量封锁", desc: "镜像激光门在玩家附近交错校准，预警结束后形成移动封锁。", color: "#f3f7ff" },
  { id: "inferno_resonance", icon: "F", name: "炎脉共鸣", category: "高温异常", desc: "烈焰信标周期性蓄能，并向玩家方向发射带灼烧效果的三连火球。", color: "#ff7a1a" },
];

const EVENT_IDS = new Set(EVENT_CODEX_ENTRIES.map((entry) => entry.id));
const EVENT_TYPE_ALIASES = {
  hazard_field: null,
  sweeping_laser_maze: "laser_disaster",
};

export function eventCodexIdsForScenario(scenario) {
  if (!scenario) return [];
  const ids = [];
  const event = scenario.event;
  if (event) {
    const eventId = event.type === "hazard_field"
      ? event.kind
      : Object.prototype.hasOwnProperty.call(EVENT_TYPE_ALIASES, event.type)
        ? EVENT_TYPE_ALIASES[event.type]
        : event.type;
    if (eventId) ids.push(eventId);
  }
  if (scenario.effect) ids.push(scenario.effect);
  if (scenario.reward) ids.push("reward_target");
  if (scenario.gearfiendMode === "fast_only") ids.push("fast_gears");
  return [...new Set(ids)].filter((id) => EVENT_IDS.has(id));
}
