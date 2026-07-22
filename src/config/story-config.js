export const STORY_CHAPTERS = Object.freeze({
  ember: {
    archive: "档案 01 / 再生舱",
    title: "苏醒协议",
    accent: "#7ddff2",
    scenes: [
      {
        speaker: "实验室广播",
        text: "生命体征恢复。改造体 H-07，请留在回收舱内等待销毁。",
      },
      {
        speaker: "H-07",
        text: "这些金属、导管和伤口……这不是我记忆中的身体。但疼痛还在，我还活着。",
      },
      {
        speaker: "维修终端录音",
        text: "如果你能听见，就沿着青色应急灯走。B7 的货运通道还没有被主系统接管。",
      },
      {
        speaker: "实验室广播",
        text: "检测到样本脱离。清除单位已释放。封锁废弃实验区，禁止 H-07 抵达出口。",
      },
    ],
  },
  neon: {
    archive: "档案 02 / 神经实验区",
    title: "失控样本",
    accent: "#5fe7ff",
    scenes: [
      {
        speaker: "研究日志",
        text: "H-07 是首个没有在神经重写中崩溃的样本。稳定、适应，而且开始重新形成自我意识。",
      },
      {
        speaker: "防御网络",
        text: "逃逸样本已接入神经网格。权限撤销，防御等级提升，实验体回收程序启动。",
      },
      {
        speaker: "H-07",
        text: "他们删掉了我的名字，却没能删掉我是谁。我不是编号，也不是他们的武器。",
      },
      {
        speaker: "维修终端录音",
        text: "穿过神经实验区，启动尽头的货运升降机。那是通往上层唯一还活着的路线。",
      },
    ],
  },
  overclock: {
    archive: "档案 03 / 植入维护区",
    title: "过载枷锁",
    accent: "#ffb457",
    scenes: [
      {
        speaker: "植入体警告",
        text: "控制核心温度超限。杀戮开关已激活，剩余稳定时间正在缩短。",
      },
      {
        speaker: "研究日志",
        text: "强化并非来自机械。每一枚核心都封存着被抹除的人类神经样本，他们把生命做成了燃料。",
      },
      {
        speaker: "实验室广播",
        text: "植入维护区全面封闭。回收机械臂获得致命处置权限。",
      },
      {
        speaker: "H-07",
        text: "既然枷锁连着我的心脏，那就让它过载。我要用他们给我的力量撞开这扇门。",
      },
    ],
  },
  singularity: {
    archive: "档案 04 / 奇点反应堆",
    title: "黑洞心脏",
    accent: "#b9a3ff",
    scenes: [
      {
        speaker: "反应堆警告",
        text: "奇点约束失效。空间曲率持续上升，所有撤离路线正在折叠。",
      },
      {
        speaker: "项目主管录音",
        text: "H-07 的身体能够承受奇点辐射。它不是士兵，而是开启核心区的活体钥匙。",
      },
      {
        speaker: "H-07",
        text: "我记得了。那天我没有签字，他们把我拖进手术室，然后夺走了我的人生。",
      },
      {
        speaker: "维修终端录音",
        text: "穿过反应堆环，夺取地表通行权限。别停下，那里连光都会被吞掉。",
      },
    ],
  },
  apocalypse: {
    archive: "档案 05 / 隔离净化区",
    title: "清除协议",
    accent: "#ff6678",
    scenes: [
      {
        speaker: "实验室广播",
        text: "最高级净化协议生效。工作人员、实验体及全部生物样本均列入清除名单。",
      },
      {
        speaker: "撤离录音",
        text: "主系统锁死了电梯！它不打算让任何人离开——如果有人听见，先毁掉隔离中继……",
      },
      {
        speaker: "中央系统",
        text: "污染源 H-07 正在接近地表。允许使用焚化、毒雾及全部封锁单位。",
      },
      {
        speaker: "H-07",
        text: "出口还在燃烧。摧毁中继站，抢在升降机坍塌前冲出去。",
      },
    ],
  },
  void_crown: {
    archive: "档案 06 / 中央核心",
    title: "最后的人类",
    accent: "#e3c76c",
    scenes: [
      {
        speaker: "中央 AI",
        text: "欢迎归来，H-07。你是最终容器，是为取代脆弱人类而完成的‘王冠’。",
      },
      {
        speaker: "中央 AI",
        text: "你一路消灭的生物，都是未能承受改造的前代样本。只有你证明了计划正确。",
      },
      {
        speaker: "H-07",
        text: "他们不是失败品，我也不是你的容器。还会选择、还会反抗，就说明我们仍是人类。",
      },
      {
        speaker: "H-07",
        text: "摧毁核心，打开最后的出口。这一次，由我决定自己成为什么。",
      },
    ],
  },
});

export function getStoryChapter(difficultyId) {
  return STORY_CHAPTERS[String(difficultyId || "")] || null;
}
