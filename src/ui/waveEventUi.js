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
};

const EVENT_INFO = {
  hazard_ring: { label: "环形封锁", description: "危险区域形成环形封锁，寻找安全间隙。", tone: "danger" },
  hazard_line: { label: "线性封锁", description: "实验场出现贯穿型危险区域。", tone: "danger" },
  gravity_well_grid: EFFECT_INFO.gravity_well_grid,
  ember_mine_rain: { label: "余烬雷雨", description: "余烬地雷正在成簇坠落，避开预警区域。", tone: "danger" },
  prism_refraction: EFFECT_INFO.prism_refraction,
  magnetic_drift: EFFECT_INFO.magnetic_drift,
  nest_spore_bloom: EFFECT_INFO.nest_spore_bloom,
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
