const dom = {};
let hideBannerTimer = 0;
let noticeSerial = 0;

const EFFECT_INFO = {
  scrap_wind: { label: "废料风暴", description: "高速废料掠过实验场，注意持续移动。", tone: "cyan" },
  blind: { label: "视野干扰", description: "照明系统失效，敌群将从暗区逼近。", tone: "violet" },
  ice_skate: { label: "冰面滑行", description: "地面摩擦力下降，移动会产生额外惯性。", tone: "cyan" },
  invisible_brain_eaters: { label: "隐匿侵袭", description: "部分敌人进入低可见状态，留意近身轮廓。", tone: "violet" },
  mini_overdrive: { label: "微型过载", description: "普通敌人的移动与弹幕节奏暂时加快。", tone: "danger" },
  gravity_well_grid: { label: "重力井", description: "实验场出现牵引节点，远离重力核心。", tone: "violet" },
  prism_refraction: { label: "棱镜折射", description: "棱镜节点会折射敌方弹幕，注意改变后的轨迹。", tone: "cyan" },
  magnetic_drift: { label: "磁力漂移", description: "磁力节点正在牵引资源与低速弹幕。", tone: "cyan" },
  nest_spore_bloom: { label: "孢子增殖", description: "巢核孢子正在孵化新的实验体。", tone: "toxic" },
  overclock_pulse: { label: "过载脉冲", description: "周期性脉冲会让敌群短暂加速。", tone: "danger" },
  laser_disaster: { label: "激光灾难", description: "高能激光束正在缓慢扫场，安全缝隙会越来越珍贵。", tone: "danger" },
  phase_tear_grid: { label: "裂相撕裂", description: "相位裂隙会扭曲移动路线，别在裂口边缘恋战。", tone: "violet" },
  mirror_laser_gate: { label: "镜面光闸", description: "镜像激光门正在交错校准，观察预警线后穿过空档。", tone: "cyan" },
  inferno_resonance: { label: "炎脉共鸣", description: "烈焰信标正在蓄能并发射灼烧火球，观察火光脉冲后变向。", tone: "danger" },
  quadrant_verdict: { label: "四域裁决", description: "观察对角安全象限，裁决会同时灼烧危险域内的敌我单位。", tone: "danger" },
  ember_convoy: { label: "余烬迁徙", description: "跟随移动火种，并把追兵引入火种的净化范围。", tone: "toxic" },
  doom_ledger: { label: "灾厄债册", description: "替罪者正在聚拢敌群，抢先击杀可让清算反噬追兵。", tone: "gold" },
  causal_echo_route: { label: "因果回廊", description: "你刚刚走过的路线将延迟成为安全区，提前写出生路。", tone: "toxic" },
  ceasefire_credit: { label: "停火借秒", description: "敌方弹幕会周期性冻结；停火结束前离开密集弹道。", tone: "cyan" },
  sanctuary_quota: { label: "生者配额", description: "观察避难所内敌人数，超出配额时安全区域会反转。", tone: "danger" },
  mercy_faultline: { label: "恩赦断层", description: "引导敌方弹幕穿过断层，积攒净化能量反击敌群。", tone: "toxic" },
  crown_levy: { label: "王冠征税", description: "移动宝库正在牵引战利品，追上并截获被征收的经验与金币。", tone: "gold" },
  fold_transit: { label: "折叠通路", description: "成对王庭门即将接通，穿门可跨越战场，也会折送追入的敌人。", tone: "violet" },
  void_relay: { label: "虚空接力", description: "按顺序触碰三座接力印记，超时会遭到王冠裁罚。", tone: "violet" },
  crown_ingress: { label: "王冠门禁", description: "向一座边界门移动将其封印，下一阶段敌群会从其余入口出现。", tone: "cyan" },
  sovereign_exchange: { label: "王权换位", description: "处决被锁定的远端敌人以取消换位，否则双方坐标将在倒计时结束时交换。", tone: "danger" },
  exile_balance: { label: "流放天平", description: "敌人更多的一侧会超载，跨过分界线重整追兵并避开流放侧。", tone: "violet" },
};

const EVENT_INFO = {
  hazard_ring: { label: "环形封锁", description: "危险区域形成环形封锁，寻找安全间隙。", tone: "danger" },
  hazard_line: { label: "线性封锁", description: "实验场出现贯穿型危险区域。", tone: "danger" },
  gravity_well_grid: EFFECT_INFO.gravity_well_grid,
  ember_mine_rain: { label: "余烬雷雨", description: "余烬地雷正在成簇坠落，避开预警区域。", tone: "danger" },
  prism_refraction: EFFECT_INFO.prism_refraction,
  magnetic_drift: EFFECT_INFO.magnetic_drift,
  nest_spore_bloom: EFFECT_INFO.nest_spore_bloom,
  long_mech_worms: { label: "蠕虫巨化", description: "少量超长机械蠕虫已释放，体节更长且生命极高。", tone: "danger" },
  sweeping_laser_maze: EFFECT_INFO.laser_disaster,
  mirror_laser_gate: EFFECT_INFO.mirror_laser_gate,
  phase_tear_grid: EFFECT_INFO.phase_tear_grid,
  inferno_resonance: EFFECT_INFO.inferno_resonance,
  quadrant_verdict: EFFECT_INFO.quadrant_verdict,
  ember_convoy: EFFECT_INFO.ember_convoy,
  doom_ledger: EFFECT_INFO.doom_ledger,
  causal_echo_route: EFFECT_INFO.causal_echo_route,
  ceasefire_credit: EFFECT_INFO.ceasefire_credit,
  sanctuary_quota: EFFECT_INFO.sanctuary_quota,
  mercy_faultline: EFFECT_INFO.mercy_faultline,
  crown_levy: EFFECT_INFO.crown_levy,
  fold_transit: EFFECT_INFO.fold_transit,
  void_relay: EFFECT_INFO.void_relay,
  crown_ingress: EFFECT_INFO.crown_ingress,
  sovereign_exchange: EFFECT_INFO.sovereign_exchange,
  exile_balance: EFFECT_INFO.exile_balance,
};

const HAZARD_INFO = {
  toxic_residue: { label: "剧毒残留", description: "剧毒残留物覆盖实验场，接触后会持续受伤。", tone: "toxic" },
  gear_trap: { label: "齿轮陷阱", description: "大量齿轮陷阱已被投放，注意脚下的警戒区。", tone: "gold" },
};

export function initWaveEventUi() {
  dom.notice = document.getElementById("waveEventNotice");
  dom.eyebrow = document.getElementById("waveEventEyebrow");
  dom.title = document.getElementById("waveEventTitle");
  dom.description = document.getElementById("waveEventDescription");
  dom.badge = document.getElementById("waveEventBadge");
}

export function describeWaveEvent({ scenario = null, boss = false } = {}) {
  const entries = [];
  const add = (entry) => {
    if (!entry || entries.some((item) => item.label === entry.label)) return;
    entries.push(entry);
  };

  if (boss || scenario?.boss) add({ label: "首领警报", description: "高威胁生命体正在进入战场。", tone: "danger" });
  if (scenario?.reward) add({ label: "奖励目标", description: "限定奖励目标出现，优先追击可获得额外金币。", tone: "gold" });
  if (scenario?.elite) add({ label: "精英来袭", description: "强化实验体已被投放，注意其特殊技能。", tone: "danger" });
  if (scenario?.event?.type === "hazard_field") add(HAZARD_INFO[scenario.event.kind] || { label: "危险区域", description: "实验场环境已发生异常变化。", tone: "danger" });
  else add(EVENT_INFO[scenario?.event?.type]);
  add(EFFECT_INFO[scenario?.effect]);
  if (scenario?.gearfiendMode === "fast_only") add({ label: "高速齿轮", description: "本波齿轮怪将保持高速形态。", tone: "danger" });

  if (!entries.length) return null;
  return {
    labels: entries.map((entry) => entry.label),
    title: entries.map((entry) => entry.label).join(" · "),
    description: entries[0].description,
    tone: entries[0].tone || "cyan",
  };
}

export function showWaveEventNotice({ wave, scenario = null, boss = false } = {}) {
  clearWaveEventNotice();
  const notice = describeWaveEvent({ scenario, boss });
  if (!notice || !dom.notice || !dom.badge) return false;

  const serial = ++noticeSerial;
  dom.notice.dataset.tone = notice.tone;
  dom.eyebrow.textContent = `WAVE ${String(wave || 1).padStart(2, "0")} // EVENT`;
  dom.title.textContent = notice.title;
  dom.description.textContent = notice.description;
  dom.notice.setAttribute("aria-hidden", "false");
  dom.notice.classList.remove("active");
  void dom.notice.offsetWidth;
  dom.notice.classList.add("active");

  dom.badge.textContent = notice.labels.join(" · ");
  dom.badge.dataset.tone = notice.tone;
  dom.badge.setAttribute("aria-hidden", "false");
  dom.badge.classList.add("active");

  hideBannerTimer = window.setTimeout(() => {
    if (serial !== noticeSerial) return;
    dom.notice.classList.remove("active");
    dom.notice.setAttribute("aria-hidden", "true");
  }, 3200);
  return true;
}

export function clearWaveEventNotice() {
  noticeSerial++;
  if (hideBannerTimer) window.clearTimeout(hideBannerTimer);
  hideBannerTimer = 0;
  dom.notice?.classList.remove("active");
  dom.notice?.setAttribute("aria-hidden", "true");
  if (dom.badge) {
    dom.badge.classList.remove("active");
    dom.badge.setAttribute("aria-hidden", "true");
    dom.badge.textContent = "";
  }
}
