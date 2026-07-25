import { input, state } from "../state.js";
import { clamp, distSq } from "../utils.js";
import { peekLobbyFirstClearReaction } from "./playerProgress.js";

export const LOBBY_WIDTH = 5600;
export const LOBBY_HEIGHT = 3600;
export const LOBBY_Y_SCALE = 0.72;
export const LOBBY_WEAPONS_PER_PAGE = 4;

const PLAYER_MARGIN = 58;
const INTERACTION_RADIUS = 118;
const LAUNCH_DURATION = 1.2;
const SPAWN = { x: 120, y: 80 };
const DOOR_SENSOR_RADIUS = 145;

export const LOBBY_ROOMS = [
  { id: "core", label: "中央枢纽", x: 0, y: 0, w: 1200, h: 900, color: "#42e8ff", roof: false },
  { id: "bridge", label: "舰桥与导航", x: 0, y: -1360, w: 1300, h: 680, color: "#42e8ff", roof: true, doorSide: "bottom" },
  { id: "data", label: "数据与异常档案", x: -1900, y: -800, w: 1200, h: 980, color: "#b48cff", roof: true, doorSide: "right" },
  { id: "science", label: "医疗与生命科学", x: 1900, y: -800, w: 1200, h: 980, color: "#77ff8a", roof: true, doorSide: "left" },
  { id: "combat", label: "军械与机库", x: -1900, y: 850, w: 1250, h: 1120, color: "#ff7a8a", roof: true, doorSide: "right" },
  { id: "engineering", label: "动力与工程", x: 1900, y: 850, w: 1250, h: 1120, color: "#ffb347", roof: true, doorSide: "left" },
  { id: "habitat", label: "船员生活区", x: 0, y: 1450, w: 1350, h: 620, color: "#77ff8a", roof: true, doorSide: "top" },
];

export const LOBBY_DOORS = [
  { id: "bridge-door", roomId: "bridge", x: 0, y: -1020, orientation: "horizontal", color: "#42e8ff" },
  { id: "data-door", roomId: "data", x: -1300, y: -650, orientation: "vertical", color: "#b48cff" },
  { id: "science-door", roomId: "science", x: 1300, y: -650, orientation: "vertical", color: "#77ff8a" },
  { id: "combat-door", roomId: "combat", x: -1275, y: 720, orientation: "vertical", color: "#ff7a8a" },
  { id: "engineering-door", roomId: "engineering", x: 1275, y: 720, orientation: "vertical", color: "#ffb347" },
  { id: "habitat-door", roomId: "habitat", x: 0, y: 1140, orientation: "horizontal", color: "#77ff8a" },
];

export const LOBBY_CORRIDORS = [
  { id: "north-spine", axis: "vertical", x: 0, y: -735, w: 250, h: 570, color: "#42e8ff", fromRoomId: "core", toRoomId: "bridge" },
  { id: "south-spine", axis: "vertical", x: 0, y: 795, w: 250, h: 690, color: "#77ff8a", fromRoomId: "core", toRoomId: "habitat" },
  { id: "data-link", axis: "horizontal", x: -712.5, y: -650, w: 1175, h: 220, color: "#b48cff", fromRoomId: "core", toRoomId: "data" },
  { id: "science-link", axis: "horizontal", x: 712.5, y: -650, w: 1175, h: 220, color: "#77ff8a", fromRoomId: "core", toRoomId: "science" },
  { id: "combat-link", axis: "horizontal", x: -700, y: 720, w: 1150, h: 220, color: "#ff7a8a", fromRoomId: "core", toRoomId: "combat" },
  { id: "engineering-link", axis: "horizontal", x: 700, y: 720, w: 1150, h: 220, color: "#ffb347", fromRoomId: "core", toRoomId: "engineering" },
];

export const LOBBY_PORTALS = [
  { id: "story-gate", kind: "story", roomId: "bridge", x: 0, y: -1515, color: "#42e8ff", label: "剧情模式", sublabel: "稳定时间线" },
  { id: "random-gate", kind: "random", roomId: "data", x: -2180, y: -1020, color: "#b48cff", label: "随机模式", sublabel: "异常时间线" },
  { id: "trial-gate", kind: "trial", roomId: "combat", x: -2260, y: 1170, color: "#ffb347", label: "试炼场", sublabel: "隔离升降梯" },
  { id: "home-gate", kind: "home", roomId: "habitat", x: 300, y: 1510, color: "#77ff8a", label: "家园", sublabel: "通道封锁" },
];

export const LOBBY_DEVICES = [
  { id: "mission-table", kind: "missionTable", action: "ship-status", roomId: "core", x: 0, y: -90, color: "#42e8ff", label: "星舰任务全息桌", collider: { w: 250, h: 118 } },
  { id: "difficulty-sync", kind: "difficulty", action: "difficulty", roomId: "bridge", x: -480, y: -1180, color: "#ffd166", label: "难度同步器", collider: { w: 160, h: 100 } },
  { id: "adventure-recorder", kind: "recorder", action: "recorder", roomId: "data", x: -2130, y: -520, color: "#ffd166", label: "冒险记录仪", collider: { w: 170, h: 104 } },
  { id: "codex-terminal", kind: "codex", action: "codex", roomId: "data", x: -1640, y: -500, color: "#42e8ff", label: "记录者终端", collider: { w: 175, h: 100 } },
  { id: "random-protocol", kind: "randomProtocol", action: "random-goal", roomId: "data", x: -1600, y: -1040, color: "#b48cff", label: "异常协议仪", collider: { w: 165, h: 102 } },
  { id: "gene-modifier", kind: "gene", action: "gene", roomId: "science", x: 1770, y: -880, color: "#77ff8a", label: "基因改造器", collider: { w: 190, h: 122 } },
  { id: "rift-stabilizer", kind: "rift", action: "rift", roomId: "engineering", x: 1770, y: 830, color: "#b48cff", label: "裂隙稳定器", collider: { w: 190, h: 116 } },
  { id: "weapon-lever", kind: "lever", action: "weapon-page", roomId: "combat", x: -1900, y: 1030, color: "#ffd166", label: "武器组切换拉杆", collider: { w: 82, h: 62 } },
];

export const LOBBY_WEAPON_STATIONS = [
  { id: "weapon-station-0", kind: "weaponStation", roomId: "combat", slot: 0, x: -2260, y: 690, color: "#42e8ff", collider: { w: 178, h: 98 } },
  { id: "weapon-station-1", kind: "weaponStation", roomId: "combat", slot: 1, x: -2010, y: 690, color: "#42e8ff", collider: { w: 178, h: 98 } },
  { id: "weapon-station-2", kind: "weaponStation", roomId: "combat", slot: 2, x: -1760, y: 690, color: "#42e8ff", collider: { w: 178, h: 98 } },
  { id: "weapon-station-3", kind: "weaponStation", roomId: "combat", slot: 3, x: -1510, y: 690, color: "#42e8ff", collider: { w: 178, h: 98 } },
];

export const LOBBY_NPCS = [
  { id: "guide", role: "向导", name: "伊芙", personality: "guide", roomId: "core", x: 260, y: 160, color: "#42e8ff", coat: "#173b50", homeNode: "core-guide", workNodes: ["core-guide", "core-social", "bridge-nav"] },
  { id: "tactician", role: "战术调度员", name: "黎星", personality: "tactician", roomId: "core", x: -500, y: 300, color: "#ffd166", coat: "#493b20", homeNode: "core-tactics", workNodes: ["core-tactics", "bridge-nav", "core-social"] },
  { id: "statistician", role: "统计员", name: "米洛", personality: "statistician", roomId: "data", x: -2280, y: -470, color: "#ffd166", coat: "#4a3520", homeNode: "data-recorder", workNodes: ["data-recorder", "data-lounge", "core-social"] },
  { id: "archivist", role: "档案管理员", name: "诺薇", personality: "archivist", roomId: "data", x: -1480, y: -430, color: "#42e8ff", coat: "#17394c", homeNode: "data-codex", workNodes: ["data-codex", "data-lounge", "bridge-nav"] },
  { id: "geneticist", role: "生物工程师", name: "赛恩", personality: "geneticist", roomId: "science", x: 1990, y: -820, color: "#77ff8a", coat: "#1e4638", homeNode: "science-gene", workNodes: ["science-gene", "science-med", "science-life", "core-social"] },
  { id: "engineer", role: "维护工程师", name: "洛克", personality: "engineer", roomId: "engineering", x: 2030, y: 870, color: "#b48cff", coat: "#392954", homeNode: "engineering-rift", workNodes: ["engineering-rift", "engineering-reactor", "engineering-power", "core-social"] },
  { id: "quartermaster", role: "军械员", name: "蕾薇", personality: "quartermaster", roomId: "combat", x: -1490, y: 980, color: "#ff7a8a", coat: "#52273a", homeNode: "combat-armory", workNodes: ["combat-armory", "combat-hangar", "core-social"] },
  { id: "story-attendant", role: "剧情引航员", name: "阿岚", personality: "navigator", roomId: "bridge", x: -230, y: -1300, color: "#42e8ff", coat: "#173b50", homeNode: "bridge-story", workNodes: ["bridge-story", "bridge-nav", "core-social"] },
  { id: "random-attendant", role: "异常分析员", name: "缄", personality: "analyst", roomId: "data", x: -1840, y: -1080, color: "#b48cff", coat: "#392954", homeNode: "data-random", workNodes: ["data-random", "data-lounge", "bridge-nav"] },
  { id: "trial-attendant", role: "试炼教官", name: "凯因", personality: "instructor", roomId: "combat", x: -2080, y: 1220, color: "#ffb347", coat: "#54351c", homeNode: "combat-trial", workNodes: ["combat-trial", "combat-hangar", "core-social"] },
  { id: "home-attendant", role: "家园管理员", name: "赫塔", personality: "steward", roomId: "habitat", x: 70, y: 1510, color: "#77ff8a", coat: "#1e4638", homeNode: "habitat-home", workNodes: ["habitat-home", "habitat-mess", "core-social"] },
];

export const LOBBY_SCENERY = [
  { id: "bridge-star-map", kind: "starMap", roomId: "bridge", x: 350, y: -1290, color: "#42e8ff", colliders: [{ shape: "circle", oy: 18, r: 92 }] },
  { id: "science-medbay", kind: "medbay", roomId: "science", x: 2200, y: -1060, color: "#9ff4ff", colliders: [{ shape: "rect", oy: 18, w: 250, h: 92 }] },
  { id: "science-life-support", kind: "lifeSupport", roomId: "science", x: 2180, y: -520, color: "#77ff8a", colliders: [{ shape: "rect", oy: 20, w: 255, h: 98 }] },
  { id: "combat-hangar", kind: "hangar", roomId: "combat", x: -1540, y: 1190, color: "#ff7a8a", colliders: [{ shape: "rect", oy: 22, w: 250, h: 92 }] },
  { id: "engineering-reactor", kind: "reactor", roomId: "engineering", x: 2210, y: 520, color: "#ffb347", colliders: [{ shape: "circle", oy: 24, r: 112 }] },
  { id: "engineering-power", kind: "power", roomId: "engineering", x: 2180, y: 1150, color: "#42e8ff", colliders: [{ shape: "rect", oy: 22, w: 215, h: 90 }] },
  { id: "habitat-mess", kind: "habitat", roomId: "habitat", x: -350, y: 1490, color: "#77ff8a", colliders: [{ shape: "rect", oy: 24, w: 225, h: 86 }] },
];

export const LOBBY_PROPS = [
  { id: "core-bench-west", kind: "bench", roomId: "core", x: -470, y: -210, color: "#42e8ff", colliders: [{ shape: "rect", oy: 16, w: 150, h: 54 }] },
  { id: "core-bench-east", kind: "bench", roomId: "core", x: 470, y: -210, color: "#42e8ff", colliders: [{ shape: "rect", oy: 16, w: 150, h: 54 }] },
  { id: "core-cargo-west", kind: "cargo", roomId: "core", x: -515, y: 80, color: "#ffd166", colliders: [{ shape: "rect", oy: 12, w: 92, h: 70 }] },
  { id: "core-cargo-east", kind: "cargo", roomId: "core", x: 515, y: 80, color: "#42e8ff", colliders: [{ shape: "rect", oy: 12, w: 92, h: 70 }] },
  { id: "core-planter-west", kind: "planter", roomId: "core", x: -520, y: -350, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "core-planter-east", kind: "planter", roomId: "core", x: 520, y: -350, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "bridge-console-west", kind: "console", roomId: "bridge", x: -475, y: -1435, color: "#42e8ff", colliders: [{ shape: "rect", oy: 20, w: 185, h: 68 }] },
  { id: "bridge-console-east", kind: "console", roomId: "bridge", x: 520, y: -1435, color: "#42e8ff", colliders: [{ shape: "rect", oy: 20, w: 150, h: 68 }] },
  { id: "bridge-planter", kind: "planter", roomId: "bridge", x: 560, y: -1160, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "bridge-gyro-console", kind: "console", roomId: "bridge", x: -320, y: -1590, color: "#9ff4ff", colliders: [{ shape: "rect", oy: 20, w: 128, h: 58 }] },
  { id: "data-server-a", kind: "server", roomId: "data", x: -2380, y: -740, color: "#b48cff", colliders: [{ shape: "rect", oy: 18, w: 108, h: 82 }] },
  { id: "data-server-b", kind: "server", roomId: "data", x: -2380, y: -900, color: "#42e8ff", colliders: [{ shape: "rect", oy: 18, w: 108, h: 82 }] },
  { id: "data-cartridges", kind: "cabinet", roomId: "data", x: -1465, y: -820, color: "#b48cff", colliders: [{ shape: "rect", oy: 18, w: 128, h: 72 }] },
  { id: "data-planter", kind: "planter", roomId: "data", x: -2415, y: -1160, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "data-cache-crate", kind: "cargo", roomId: "data", x: -1390, y: -1160, color: "#b48cff", colliders: [{ shape: "rect", oy: 12, w: 92, h: 70 }] },
  { id: "science-sample-cart", kind: "cart", roomId: "science", x: 1535, y: -1120, color: "#77ff8a", colliders: [{ shape: "rect", oy: 14, w: 112, h: 58 }] },
  { id: "science-sample-rack", kind: "cabinet", roomId: "science", x: 2350, y: -760, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 120, h: 78 }] },
  { id: "combat-ammo-rack", kind: "cabinet", roomId: "combat", x: -2390, y: 820, color: "#ff7a8a", colliders: [{ shape: "rect", oy: 18, w: 120, h: 78 }] },
  { id: "combat-tool-cart", kind: "cart", roomId: "combat", x: -1390, y: 1320, color: "#ffb347", colliders: [{ shape: "rect", oy: 14, w: 116, h: 58 }] },
  { id: "combat-spare-parts", kind: "cargo", roomId: "combat", x: -2420, y: 1320, color: "#ff7a8a", colliders: [{ shape: "rect", oy: 12, w: 92, h: 70 }] },
  { id: "engineering-cooler-a", kind: "cooler", roomId: "engineering", x: 1515, y: 500, color: "#ffb347", colliders: [{ shape: "circle", oy: 18, r: 54 }] },
  { id: "engineering-cooler-b", kind: "cooler", roomId: "engineering", x: 1515, y: 1040, color: "#42e8ff", colliders: [{ shape: "circle", oy: 18, r: 54 }] },
  { id: "engineering-cable-reel", kind: "reel", roomId: "engineering", x: 2360, y: 870, color: "#ffb347", colliders: [{ shape: "circle", oy: 14, r: 46 }] },
  { id: "habitat-vendor", kind: "vendor", roomId: "habitat", x: 525, y: 1405, color: "#77ff8a", colliders: [{ shape: "rect", oy: 20, w: 118, h: 82 }] },
  { id: "habitat-planter", kind: "planter", roomId: "habitat", x: -565, y: 1590, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "habitat-planter-east", kind: "planter", roomId: "habitat", x: 575, y: 1660, color: "#77ff8a", colliders: [{ shape: "rect", oy: 18, w: 130, h: 62 }] },
  { id: "corridor-worklight-west", kind: "worklight", roomId: "core", x: -720, y: 520, color: "#ff7a8a", colliders: [{ shape: "circle", oy: 14, r: 34 }] },
  { id: "corridor-worklight-east", kind: "worklight", roomId: "core", x: 720, y: 520, color: "#ffb347", colliders: [{ shape: "circle", oy: 14, r: 34 }] },
];

export const LOBBY_LIGHTS = [
  { id: "core-main", roomId: "core", x: 0, y: 40, radius: 360, color: "#d9f8ff", strength: 0.58, priority: 70, kind: "ceiling" },
  { id: "core-west", roomId: "core", x: -430, y: 40, radius: 245, color: "#8eefff", strength: 0.42, priority: 52, kind: "ceiling" },
  { id: "core-east", roomId: "core", x: 430, y: 40, radius: 245, color: "#8eefff", strength: 0.42, priority: 52, kind: "ceiling" },
  { id: "north-corridor-a", roomId: "core", x: 0, y: -420, radius: 220, color: "#b9f5ff", strength: 0.42, priority: 50, kind: "strip" },
  { id: "north-corridor-b", roomId: "bridge", x: 0, y: -1120, radius: 220, color: "#b9f5ff", strength: 0.44, priority: 55, kind: "door" },
  { id: "bridge-west", roomId: "bridge", x: -360, y: -1370, radius: 255, color: "#bdefff", strength: 0.48, priority: 55, kind: "ceiling" },
  { id: "bridge-east", roomId: "bridge", x: 360, y: -1370, radius: 255, color: "#78dfff", strength: 0.48, priority: 55, kind: "ceiling" },
  { id: "data-door", roomId: "data", x: -1440, y: -650, radius: 210, color: "#c9a8ff", strength: 0.43, priority: 54, kind: "door" },
  { id: "data-north", roomId: "data", x: -1900, y: -1020, radius: 250, color: "#b48cff", strength: 0.47, priority: 53, kind: "ceiling" },
  { id: "data-center", roomId: "data", x: -1900, y: -690, radius: 270, color: "#d2c4ff", strength: 0.44, priority: 51, kind: "ceiling" },
  { id: "data-south", roomId: "data", x: -1900, y: -430, radius: 230, color: "#89eaff", strength: 0.4, priority: 49, kind: "strip" },
  { id: "science-door", roomId: "science", x: 1440, y: -650, radius: 210, color: "#bfffd0", strength: 0.43, priority: 54, kind: "door" },
  { id: "science-north", roomId: "science", x: 1900, y: -1050, radius: 250, color: "#e5ffff", strength: 0.52, priority: 54, kind: "medical" },
  { id: "science-center", roomId: "science", x: 1900, y: -760, radius: 265, color: "#caffd4", strength: 0.46, priority: 52, kind: "ceiling" },
  { id: "science-south", roomId: "science", x: 1900, y: -480, radius: 230, color: "#77ff8a", strength: 0.4, priority: 49, kind: "strip" },
  { id: "combat-door", roomId: "combat", x: -1410, y: 720, radius: 210, color: "#ffd7dc", strength: 0.43, priority: 54, kind: "door" },
  { id: "combat-north", roomId: "combat", x: -1900, y: 550, radius: 260, color: "#fff0dc", strength: 0.48, priority: 53, kind: "industrial" },
  { id: "combat-center", roomId: "combat", x: -1900, y: 900, radius: 270, color: "#ffd5c2", strength: 0.44, priority: 51, kind: "industrial" },
  { id: "combat-south", roomId: "combat", x: -1900, y: 1210, radius: 245, color: "#ff9eaa", strength: 0.42, priority: 50, kind: "warning" },
  { id: "engineering-door", roomId: "engineering", x: 1410, y: 720, radius: 210, color: "#ffe5ba", strength: 0.43, priority: 54, kind: "door" },
  { id: "engineering-north", roomId: "engineering", x: 1900, y: 540, radius: 260, color: "#ffd79a", strength: 0.48, priority: 53, kind: "industrial" },
  { id: "engineering-center", roomId: "engineering", x: 1900, y: 850, radius: 270, color: "#ffe6bd", strength: 0.44, priority: 51, kind: "industrial" },
  { id: "engineering-south", roomId: "engineering", x: 1900, y: 1190, radius: 245, color: "#9deeff", strength: 0.42, priority: 50, kind: "strip" },
  { id: "south-corridor", roomId: "core", x: 0, y: 760, radius: 225, color: "#c6ffd0", strength: 0.42, priority: 50, kind: "strip" },
  { id: "habitat-door", roomId: "habitat", x: 0, y: 1240, radius: 205, color: "#d7ffd5", strength: 0.42, priority: 54, kind: "door" },
  { id: "habitat-west", roomId: "habitat", x: -360, y: 1480, radius: 250, color: "#ffe6bb", strength: 0.46, priority: 52, kind: "warm" },
  { id: "habitat-east", roomId: "habitat", x: 360, y: 1480, radius: 250, color: "#d8ffd8", strength: 0.44, priority: 52, kind: "warm" },
];

export const LOBBY_MOBILE_LIGHTS = [
  { id: "inspection-north", roomId: "core", color: "#8eefff", radius: 165, speed: 0.12, phase: 0.05, route: [[-72, -390], [54, -470], [76, -650], [18, -830], [-68, -710], [-82, -520]] },
  { id: "inspection-data", roomId: "data", color: "#b48cff", radius: 150, speed: 0.1, phase: 0.32, route: [[-2210, -620], [-1990, -585], [-1740, -630], [-1640, -760], [-1810, -850], [-2070, -820], [-2225, -735]] },
  { id: "inspection-science", roomId: "science", color: "#9dffb1", radius: 150, speed: 0.105, phase: 0.61, route: [[1450, -650], [1650, -450], [1910, -370], [2380, -390], [2460, -620], [2450, -930], [2330, -1190], [1900, -1220], [1450, -1200], [1380, -970]] },
  { id: "inspection-combat", roomId: "combat", color: "#ffb0b9", radius: 155, speed: 0.095, phase: 0.18, route: [[-2390, 410], [-2130, 365], [-1840, 385], [-1540, 420], [-1380, 520], [-1570, 570], [-1880, 530], [-2200, 555]] },
  { id: "inspection-engineering", roomId: "engineering", color: "#ffd18a", radius: 155, speed: 0.09, phase: 0.77, route: [[1690, 350], [1940, 320], [2220, 350], [2430, 500], [2460, 760], [2460, 1020], [2440, 1260], [2260, 1340], [1870, 1335], [1640, 1160], [1590, 900], [1660, 650]] },
  { id: "inspection-habitat", roomId: "habitat", color: "#d7ffc7", radius: 145, speed: 0.115, phase: 0.46, route: [[-570, 1250], [-350, 1200], [-100, 1230], [140, 1210], [380, 1230], [440, 1290], [300, 1350], [80, 1370], [-150, 1340], [-380, 1380], [-560, 1340]] },
];

export const LOBBY_PET = {
  id: "pet-k9",
  name: "K-9 · 火花",
  roomId: "core",
  x: 390,
  y: 315,
  color: "#7defff",
  homeNode: "core-social",
  roamNodes: ["core-social", "bridge-nav", "data-lounge", "science-med", "combat-hangar", "engineering-power", "habitat-mess"],
};

const NAV_NODES = [
  { id: "core-center", x: 0, y: 120 },
  { id: "core-guide", x: 300, y: 210 },
  { id: "core-tactics", x: -480, y: 300 },
  { id: "core-social", x: 0, y: 330 },
  { id: "core-north", x: 0, y: -520 },
  { id: "bridge-entry", x: 0, y: -1120 },
  { id: "bridge-story", x: -230, y: -1290 },
  { id: "bridge-nav", x: 520, y: -1260 },
  { id: "core-data", x: -780, y: -650 },
  { id: "data-entry", x: -1440, y: -650 },
  { id: "data-recorder", x: -2260, y: -410 },
  { id: "data-codex", x: -1480, y: -390 },
  { id: "data-random", x: -1840, y: -1110 },
  { id: "data-lounge", x: -1850, y: -660 },
  { id: "core-science", x: 780, y: -650 },
  { id: "science-entry", x: 1440, y: -650 },
  { id: "science-gene", x: 2010, y: -820 },
  { id: "science-med", x: 2020, y: -1120 },
  { id: "science-life", x: 1990, y: -430 },
  { id: "core-combat", x: -780, y: 720 },
  { id: "combat-entry", x: -1410, y: 720 },
  { id: "combat-armory", x: -1500, y: 980 },
  { id: "combat-trial", x: -2070, y: 1220 },
  { id: "combat-hangar", x: -1710, y: 1190 },
  { id: "core-engineering", x: 780, y: 720 },
  { id: "engineering-entry", x: 1410, y: 720 },
  { id: "engineering-rift", x: 2020, y: 870 },
  { id: "engineering-reactor", x: 2030, y: 430 },
  { id: "engineering-power", x: 2000, y: 1220 },
  { id: "core-south", x: 0, y: 720 },
  { id: "habitat-entry", x: 0, y: 1240 },
  { id: "habitat-home", x: 80, y: 1510 },
  { id: "habitat-mess", x: -180, y: 1580 },
];
export const LOBBY_NAV_NODES = NAV_NODES;

const NAV_EDGES = [
  ["core-center", "core-guide"], ["core-center", "core-tactics"], ["core-center", "core-social"],
  ["core-center", "core-north"], ["core-north", "bridge-entry"], ["bridge-entry", "bridge-story"], ["bridge-entry", "bridge-nav"],
  ["core-center", "core-data"], ["core-data", "data-entry"], ["data-entry", "data-recorder"], ["data-entry", "data-codex"],
  ["data-entry", "data-lounge"], ["data-lounge", "data-random"], ["data-lounge", "data-recorder"], ["data-lounge", "data-codex"],
  ["core-center", "core-science"], ["core-science", "science-entry"], ["science-entry", "science-gene"],
  ["science-entry", "science-med"], ["science-entry", "science-life"], ["science-gene", "science-life"],
  ["core-center", "core-combat"], ["core-combat", "combat-entry"], ["combat-entry", "combat-armory"],
  ["combat-entry", "combat-trial"], ["combat-armory", "combat-hangar"], ["combat-hangar", "combat-trial"],
  ["core-center", "core-engineering"], ["core-engineering", "engineering-entry"], ["engineering-entry", "engineering-rift"],
  ["engineering-entry", "engineering-reactor"], ["engineering-entry", "engineering-power"], ["engineering-rift", "engineering-power"],
  ["core-center", "core-south"], ["core-south", "habitat-entry"], ["habitat-entry", "habitat-home"], ["habitat-entry", "habitat-mess"],
];

const NAV_BY_ID = new Map(NAV_NODES.map((node) => [node.id, node]));
const NAV_LINKS = new Map(NAV_NODES.map((node) => [node.id, []]));
for (const [a, b] of NAV_EDGES) {
  NAV_LINKS.get(a)?.push(b);
  NAV_LINKS.get(b)?.push(a);
}

const SOCIAL_LINES = {
  guide: ["你今天看起来状态不错。", "下一班跃迁还有一点时间。"],
  tactician: ["航线稳定，别让概率骗了你。", "我把出击参数又核对了一遍。"],
  statistician: ["这不是迷信，是样本量不足。", "你的误差已经大到能单独建档。"],
  archivist: ["旧记录不会消失，只会等待被读懂。", "请别把咖啡放在数据核心旁。"],
  geneticist: ["只是一次无害的取样。大概。", "生命维持的菌群比船员守时。"],
  engineer: ["只要还在响，就说明它还活着。", "那不是漏电，是氛围灯。"],
  quartermaster: ["好武器也得配一个敢扣扳机的人。", "别摸枪口，刚校准完。"],
  navigator: ["稳定航线也会记住每一位乘客。", "星图今天很安静。"],
  analyst: ["第七码头不存在——暂时。", "概率在眨眼，你看见了吗？"],
  instructor: ["站直。休息也要有休息的样子。", "训练不会骗人，成绩会。"],
  steward: ["生活区很快会重新热闹起来。", "门锁着，是为了让里面保持完整。"],
};

const NPC_DIALOGUES = {
  guide: {
    role: "TRANSIT GUIDE // ACTIVE", title: "星舰向导", intro: "欢迎回到霓虹中转舰。这里不是一座固定基地，而是一艘沿废墟时间线航行的中转方舟。",
    topics: [
      ["星舰设施", "中央枢纽连接六个功能翼。舰桥负责航线，数据翼保存记录，科学翼维持生命，战斗翼管理军械，工程翼驱动跃迁，后部则是生活区。"],
      ["基础操作", "使用 WASD 或方向键移动。自动门会识别你，面向高亮的设备、入口或人员后按 E 交互。"],
      ["战斗与成长", "先在舰桥难度同步器、异常协议仪和军械库完成配置，再进入对应传送舱。战斗中的成长、商店和合成规则保持不变。"],
      ["世界背景", "灾变后，中转舰成为少数仍能穿越失稳时间线的载具。每次出击都在替舰队找回一段航路和记忆。"],
    ],
  },
  tactician: { role: "TACTICAL CONTROL", title: "战术调度", intro: "我负责让你选的难度、武器和航线在同一份出击参数里。别担心，我比传送门更不喜欢意外。", topics: [["当前配置", "舰桥难度同步器只会列出已解锁协议。随机航线还会读取数据翼的异常目标，剧情航线则忽略它。"], ["出击建议", "先在军械库确认带强化光环的武器台，再前往舰桥检查难度同步器。入口充能期间离开范围或按 Esc 都可以取消。"]] },
  statistician: { role: "ADVENTURE LEDGER", title: "统计值守", intro: "记录阵列尚未重新接入主网，所以你现在看到的数字，严格来说只是很昂贵的装饰。", topics: [["工作", "我负责校验冒险次数、生存时间和收益分布。功能恢复前，我不会擅自读写你的局外数据。"], ["其他船员", "洛克总说故障率是情绪问题。我已经为这句话建立了单独的错误分类。"]] },
  archivist: { role: "ARCHIVE KEEPER", title: "记录者", intro: "档案不会替你作出判断。它只负责证明，那些敌人、武器和事件确实曾经存在。", topics: [["记录者", "旁边的终端连接现有图鉴。关闭图鉴后，你会回到当前舱室。"], ["星舰历史", "这艘舰最初并不承担战斗任务，它只是负责把研究人员送到仍然存在的时间线上。"]] },
  geneticist: { role: "BIOSCIENCE LAB", title: "生命科学", intro: "培养舱已经完成净化。强化序列还缺最后一组校准样本——放心，我没有说一定要用你的。", topics: [["基因改造器", "本阶段只保留设备和校准反馈，不会给予局外强化，也不会修改玩家进度。"], ["生命维持", "右侧循环槽培育着整艘舰的净化菌群。它们比大多数船员更可靠，也更安静。"]] },
  engineer: { role: "ENGINEERING CREW", title: "跃迁维护", intro: "反应堆在唱歌，冷却泵在抱怨，说明一切正常。真正危险的时候，它们反而会一起安静。", topics: [["裂隙稳定器", "它是未来远征用的相位锚，本阶段只待机，不提供战斗加成。"], ["动力核心", "舰体靠三组脉冲反应环维持航行。你看到的橙色流光，是能量；闻到的焦味，不关你的事。"]] },
  quartermaster: { role: "ARMORY CONTROL", title: "军械管理", intro: "四个台位，一组四把。拉杆换组，靠近台位按 E 或直接点击，就能把那把武器写进开场配置。", topics: [["当前武器", "被选中的武器台会显示强化光环与“当前装备”。进入传送门后，实际装备读取同一个选择。"], ["军械库", "所有全息投影共用实际武器的视觉定义，新武器接入后也会自动出现在对应组。"]] },
  navigator: { role: "STABLE TIMELINE", title: "剧情引航", intro: "稳定时间线已经锁定。入口会读取舰桥同步的难度和军械库的开场武器，不再要求二次确认。", topics: [["剧情航线", "充能完成后会沿用现有剧情播放和标准二十波流程。"], ["舰桥", "前方星图显示的不是距离，而是时间线之间还剩多少共同历史。"]] },
  analyst: { role: "ANOMALY ANALYSIS", title: "异常航线", intro: "随机不是没有规律。它只是把规律藏在你还没见过的下一波里。", topics: [["异常协议", "协议仪可以切换二十波通关与无限模式。随机入口会读取当前协议。"], ["概率", "每次航线都会重组敌人、Boss 与事件。记录可能被保留，但路线不会重复承诺。"]] },
  instructor: { role: "TRIAL AUTHORITY", title: "试炼教官", intro: "试炼场只认授权和结果。快速开局会污染成绩，这不是惩罚，是为了让正式记录保持可信。", topics: [["试炼场", "入口仍会打开原有密码认证和调试面板，并把大厅当前武器作为默认选项。"], ["训练", "调试能力不会改变正式模式的解锁与成绩规则。"]] },
  steward: { role: "HABITAT ACCESS", title: "生活区管理", intro: "生活翼仍在运行，但家园坐标没有完成稳定。门锁着不是拒绝，是为了保证你回来时里面还在。", topics: [["家园通道", "本阶段只播放封锁反馈，不会创建家园页面或持久化功能。"], ["船员生活", "食堂、休息舱和环境循环都已恢复。等家园锚点稳定，这里会比现在热闹得多。"]] },
};

const FIRST_CLEAR_REACTIONS = {
  guide: (name) => `你第一次穿过了「${name}」时间线！整艘舰都收到了航路回波。先喘口气吧，这份胜利值得慢慢记住。`,
  tactician: (name) => `「${name}」首次通关确认。参数没有侥幸，路线也没有替你手下留情——这是一次干净、有效的胜利。`,
  statistician: (name) => `我刚把「${name}」的首次通关标成了高置信样本。恭喜，你终于给了我一组不需要写误差说明的数据。`,
  archivist: (name) => `「${name}」已经从推测变成了历史。你的首次通关记录会留在时间戳里，比我们的记忆更久。`,
  geneticist: (name) => `你从「${name}」回来后的生命指标很有意思。恭喜——以及，如果你不介意，我真的只需要一小管样本。`,
  engineer: (name) => `「${name}」那次返航把反应堆震掉了两颗螺丝。值了。首次通关快乐，螺丝我会找你报销。`,
  quartermaster: (name) => `我看完了「${name}」的武器遥测。第一次就能把那条线打穿，说明枪和人至少有一个非常靠谱。`,
  navigator: (name) => `稳定航图已记录你首次越过「${name}」的坐标。自此以后，那条航线不再只是未知，而是你走过的路。`,
  analyst: (name) => `「${name}」的概率坍缩了——第一次，唯一一次，属于你的那一次。现在它知道该害怕谁了。`,
  instructor: (name) => `「${name}」首次通关。合格。不要期待我说第二遍……做得很好。`,
  steward: (name) => `欢迎从「${name}」平安返航。首次胜利应该有热饮和真正的床，可惜家园舱还锁着；这份祝贺先替它送给你。`,
};

let lobbyWeapons = [];
let lobbyDifficulties = [];

export function configureLobbyWeapons(weapons = []) {
  lobbyWeapons = [...weapons];
  const lobby = state.lobby;
  if (!lobby.selectedWeaponId || !lobbyWeapons.some((weapon) => weapon.id === lobby.selectedWeaponId)) {
    lobby.selectedWeaponId = lobbyWeapons[0]?.id || "";
  }
  lobby.weaponPage = clampLobbyWeaponPage(lobby.weaponPage);
  lobby.initialized = true;
  return lobby.selectedWeaponId;
}

export function configureLobbyDifficulties(difficulties = []) {
  lobbyDifficulties = difficulties.filter((entry) => entry?.id);
  const unlocked = lobbyDifficulties.filter((entry) => entry.unlocked !== false);
  if (!unlocked.some((entry) => entry.id === state.lobby.selectedDifficultyId)) {
    state.lobby.selectedDifficultyId = unlocked.findLast?.((entry) => entry.currentHighest)?.id
      || unlocked.at(-1)?.id
      || lobbyDifficulties[0]?.id
      || "";
  }
  return selectedLobbyDifficulty();
}

export function enterLobby({ resetPosition = true } = {}) {
  initializeLobbyRuntime();
  if (resetPosition || !state.lobby.initialized) {
    Object.assign(state.lobby.player, {
      x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, dirX: 0, dirY: -1, tilt: 0, stride: 0, moving: false,
    });
    state.lobby.cameraX = 80;
    state.lobby.cameraY = 105;
  }
  state.lobby.initialized = true;
  state.lobby.active = true;
  state.lobby.modalOpen = false;
  state.lobby.talkingNpcId = null;
  state.lobby.pendingLaunch = null;
  state.lobby.nearbyInteractionId = null;
  state.lobby.toast = null;
  clearLobbyInput();
  cancelLobbyPlayerMove();
  state.mode = "lobby";
  updatePlayerRoom(0.25);
}

export function leaveLobby() {
  state.lobby.active = false;
  state.lobby.modalOpen = false;
  state.lobby.talkingNpcId = null;
  state.lobby.pendingLaunch = null;
  state.lobby.nearbyInteractionId = null;
  clearLobbyInput();
  cancelLobbyPlayerMove();
}

export function updateLobby(dt) {
  const lobby = state.lobby;
  lobby.time += dt;
  lobby.shipTime += dt;
  lobby.mobileLightPhase += dt;
  lobby.leverPulse = Math.max(0, lobby.leverPulse - dt);
  lobby.selectionPulse = Math.max(0, lobby.selectionPulse - dt);
  lobby.interactionLockTime = Math.max(0, lobby.interactionLockTime - dt);
  if (lobby.toast) {
    lobby.toast.life -= dt;
    if (lobby.toast.life <= 0) lobby.toast = null;
  }

  updateLobbyDoors(dt);
  updateLobbyNpcs(dt);
  updateLobbyPet(dt);
  separateLobbyAgents();
  if (!lobby.modalOpen) updateLobbyPlayer(dt);
  else {
    lobby.player.moving = false;
    lobby.player.vx = approach(lobby.player.vx, 0, 900 * dt);
    lobby.player.vy = approach(lobby.player.vy, 0, 900 * dt);
  }
  updatePlayerRoom(dt);

  const nearest = lobby.modalOpen ? null : findNearestLobbyInteraction(lobby.player);
  if (!nearest) {
    lobby.nearbyInteractionId = null;
  } else if (lobby.nearbyInteractionId === nearest.id || lobby.interactionLockTime <= 0) {
    if (lobby.nearbyInteractionId !== nearest.id) lobby.interactionLockTime = 0.18;
    lobby.nearbyInteractionId = nearest.id;
  }

  lobby.cameraX += (lobby.player.x - lobby.cameraX) * Math.min(1, dt * 4.8);
  lobby.cameraY += (lobby.player.y - lobby.cameraY) * Math.min(1, dt * 4.8);

  return updatePendingLaunch(dt);
}

export function interactWithLobby(targetId = null) {
  if (state.mode !== "lobby" || state.lobby.modalOpen || state.lobby.pendingLaunch) return null;
  const available = allLobbyInteractions(state.lobby.player);
  const explicit = targetId ? available.find((entry) => entry.id === targetId) : null;
  const interaction = explicit && distSq(explicit.x, explicit.y, state.lobby.player.x, state.lobby.player.y) <= INTERACTION_RADIUS * INTERACTION_RADIUS
    ? explicit
    : targetId ? null : findNearestLobbyInteraction(state.lobby.player);
  if (!interaction) return null;

  if (interaction.action === "weapon-page") {
    state.lobby.weaponPage = clampLobbyWeaponPage(state.lobby.weaponPage + 1);
    state.lobby.leverPulse = 0.48;
    return { ...interaction, page: state.lobby.weaponPage };
  }
  if (interaction.action === "weapon-select") {
    const weapon = weaponForStation(interaction.slot);
    if (!weapon) return null;
    state.lobby.selectedWeaponId = weapon.id;
    state.lobby.selectionPulse = 0.55;
    setLobbyToast(`开场武器已设为：${weapon.name}`, weaponColor(weapon.id));
    return { ...interaction, weapon };
  }
  if (interaction.action === "difficulty") {
    const difficulty = cycleLobbyDifficulty();
    return { ...interaction, difficulty };
  }
  if (interaction.action === "random-goal") {
    state.lobby.randomGoal = state.lobby.randomGoal === "endless" ? "twenty_waves" : "endless";
    const goalLabel = lobbyRandomGoalLabel();
    setLobbyToast(`异常协议：${goalLabel}`, "#b48cff");
    return { ...interaction, randomGoal: state.lobby.randomGoal };
  }
  if (interaction.action === "story" || interaction.action === "random") {
    return beginLobbyLaunch(interaction.action, interaction);
  }
  if (interaction.action === "npc-talk") {
    beginLobbyNpcConversation(interaction.npcId);
  }
  if (interaction.action === "pet") {
    interactWithLobbyPet();
  }
  return interaction;
}

export function findLobbyInteractionAtWorld(x, y, player = state.lobby.player) {
  if (!player || state.mode !== "lobby" || state.lobby.modalOpen) return null;
  const candidates = allLobbyInteractions(player)
    .filter((entry) => distSq(entry.x, entry.y, player.x, player.y) <= INTERACTION_RADIUS * INTERACTION_RADIUS)
    .map((entry) => {
      const dx = Math.abs(entry.x - x);
      const dy = Math.abs((entry.y - y) * LOBBY_Y_SCALE);
      const isCharacter = entry.action === "npc-talk" || entry.action === "pet";
      const hitW = isCharacter ? 46 : entry.action === "weapon-select" ? 82 : 72;
      const hitH = isCharacter ? 70 : 58;
      const hit = dx <= hitW && dy <= hitH;
      const priority = isCharacter ? 1 : 2;
      return { entry, hit, priority, score: Math.hypot(dx, dy) };
    })
    .filter((candidate) => candidate.hit)
    .sort((a, b) => a.score - b.score || b.priority - a.priority);
  return candidates[0]?.entry || null;
}

export function setLobbyHoveredInteraction(id = null) {
  state.lobby.hoveredInteractionId = id || null;
}

export function lobbyMobileLightPosition(definition, time = state.lobby.mobileLightPhase) {
  const route = definition?.route || [];
  if (!route.length) return { x: 0, y: 0 };
  if (route.length === 1) return { x: route[0][0], y: route[0][1] };
  const progress = (((Number(time) || 0) * (definition.speed || 0.1) + (definition.phase || 0)) % 1 + 1) % 1;
  const scaled = progress * route.length;
  const index = Math.floor(scaled) % route.length;
  const blend = scaled - Math.floor(scaled);
  const previous = route[(index - 1 + route.length) % route.length];
  const current = route[index];
  const next = route[(index + 1) % route.length];
  const startX = (previous[0] + current[0]) * 0.5;
  const startY = (previous[1] + current[1]) * 0.5;
  const endX = (current[0] + next[0]) * 0.5;
  const endY = (current[1] + next[1]) * 0.5;
  const inverse = 1 - blend;
  return {
    x: inverse * inverse * startX + 2 * inverse * blend * current[0] + blend * blend * endX,
    y: inverse * inverse * startY + 2 * inverse * blend * current[1] + blend * blend * endY,
  };
}

export function findNearestLobbyInteraction(player, radius = INTERACTION_RADIUS) {
  if (!player) return null;
  let nearest = null;
  let bestScore = Infinity;
  const directionLength = Math.hypot(player.dirX || 0, player.dirY || 0);
  for (const interaction of allLobbyInteractions(player)) {
    const dx = interaction.x - player.x;
    const dy = interaction.y - player.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radius * radius) continue;
    const distance = Math.sqrt(distanceSq);
    let facingBonus = 0;
    if (directionLength > 0.2 && distance > 0.001) {
      const dot = (dx / distance * player.dirX + dy / distance * player.dirY) / directionLength;
      facingBonus = clamp(dot, -1, 1) * 22;
    }
    const sticky = interaction.id === state.lobby.nearbyInteractionId ? 10 : 0;
    const deviceStability = interaction.action === "npc-talk" ? 0 : 3;
    const score = distance - facingBonus - sticky - deviceStability;
    if (score >= bestScore) continue;
    bestScore = score;
    nearest = interaction;
  }
  return nearest;
}

export function allLobbyInteractions(player = state.lobby.player) {
  const interactions = [];
  for (const portal of LOBBY_PORTALS) {
    interactions.push({
      id: portal.id,
      action: portal.kind,
      roomId: portal.roomId,
      x: portal.x,
      y: portal.y + 132,
      title: portal.label,
      hint: portal.kind === "story"
        ? `充能进入稳定时间线 · ${selectedLobbyDifficulty()?.name || "未同步"}`
        : portal.kind === "random"
          ? `充能进入异常时间线 · ${lobbyRandomGoalLabel()}`
          : portal.kind === "trial"
            ? "打开受保护的战斗调试终端"
            : "空间坐标尚未开放",
    });
  }
  for (const device of LOBBY_DEVICES) {
    const hint = {
      difficulty: `切换已解锁难度 · 当前 ${selectedLobbyDifficulty()?.name || "未同步"}`,
      randomProtocol: `切换随机目标 · 当前 ${lobbyRandomGoalLabel()}`,
      missionTable: "查看霓虹中转舰运行状态",
      recorder: "查看正式冒险总览、难度档案与单局历史",
      codex: "查阅敌人、武器、道具与事件记录",
      gene: "局外强化模块尚未开放",
      rift: "远征相位锚等待下一阶段校准",
      lever: `切换全息武器组 · ${state.lobby.weaponPage + 1}/${lobbyWeaponPageCount()}`,
    }[device.kind] || "使用设施";
    interactions.push({
      id: device.id,
      action: device.action,
      roomId: device.roomId,
      x: device.x,
      y: device.y + 54,
      title: device.label,
      hint,
    });
  }
  for (const station of LOBBY_WEAPON_STATIONS) {
    const weapon = weaponForStation(station.slot);
    interactions.push({
      id: station.id,
      action: "weapon-select",
      roomId: station.roomId,
      slot: station.slot,
      x: station.x,
      y: station.y + 50,
      title: weapon?.name || "离线武器台",
      hint: weapon ? `选择 ${weapon.name} 作为开场武器` : "当前展位离线",
      disabled: !weapon,
    });
  }
  for (const npc of LOBBY_NPCS) {
    const runtime = state.lobby.npcs[npc.id];
    if (!runtime) continue;
    interactions.push({
      id: npc.id,
      npcId: npc.id,
      action: "npc-talk",
      roomId: lobbyRoomAt(runtime.x, runtime.y)?.id || null,
      x: runtime.x,
      y: runtime.y,
      title: `${npc.role} · ${npc.name}`,
      hint: npcHint(npc, runtime),
    });
  }
  const pet = state.lobby.pet;
  if (pet) {
    interactions.push({
      id: LOBBY_PET.id,
      action: "pet",
      roomId: lobbyRoomAt(pet.x, pet.y)?.id || null,
      x: pet.x,
      y: pet.y,
      title: LOBBY_PET.name,
      hint: pet.mode === "petSocial" ? "正在和船员玩耍" : "摸摸这只机器小狗",
    });
  }
  return interactions.filter((entry) => !entry.disabled && interactionVisibleToPlayer(entry, player));
}

export function selectedLobbyWeapon() {
  return lobbyWeapons.find((weapon) => weapon.id === state.lobby.selectedWeaponId) || lobbyWeapons[0] || null;
}

export function selectedLobbyDifficulty() {
  const unlocked = lobbyDifficulties.filter((entry) => entry.unlocked !== false);
  return unlocked.find((entry) => entry.id === state.lobby.selectedDifficultyId)
    || unlocked.at(-1)
    || lobbyDifficulties[0]
    || null;
}

export function weaponForStation(slot) {
  const index = state.lobby.weaponPage * LOBBY_WEAPONS_PER_PAGE + slot;
  return lobbyWeapons[index] || null;
}

export function lobbyWeaponPageCount() {
  return Math.max(1, Math.ceil(lobbyWeapons.length / LOBBY_WEAPONS_PER_PAGE));
}

export function clampLobbyWeaponPage(page) {
  const count = lobbyWeaponPageCount();
  return ((Math.floor(Number(page) || 0) % count) + count) % count;
}

export function lobbyRandomGoalLabel() {
  return state.lobby.randomGoal === "endless" ? "无限模式" : "20 波通关";
}

export function buildLobbyRunConfig(runMode) {
  const difficulty = selectedLobbyDifficulty();
  const weapon = selectedLobbyWeapon();
  if (!difficulty || !weapon) return null;
  return {
    difficulty,
    weapon,
    runMode: runMode === "random" ? "random" : "standard",
    randomGoal: state.lobby.randomGoal === "endless" ? "endless" : "twenty_waves",
  };
}

export function cancelLobbyLaunch(reason = "出击充能已取消", silent = false) {
  if (!state.lobby.pendingLaunch) return false;
  state.lobby.pendingLaunch = null;
  if (!silent) setLobbyToast(reason, "#ff7a8a", 1.8);
  return true;
}

export function setLobbyModalOpen(open) {
  state.lobby.modalOpen = Boolean(open);
  if (open) {
    cancelLobbyLaunch("", true);
    state.lobby.nearbyInteractionId = null;
    clearLobbyInput();
    cancelLobbyPlayerMove();
  }
}

export function setLobbyToast(text, color = "#42e8ff", life = 2.8) {
  state.lobby.toast = { text, color, life, maxLife: life };
}

export function clearLobbyInput() {
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;
  input.vx = 0;
  input.vy = 0;
}

export function setLobbyPlayerMoveTarget(x, y) {
  const player = state.lobby.player;
  if (!player || state.mode !== "lobby" || state.lobby.modalOpen) return false;
  const destination = resolveLobbyPosition(Number(x) || 0, Number(y) || 0, player.r);
  const direct = lobbySegmentWalkable(player.x, player.y, destination.x, destination.y, player.r);
  const path = [];
  if (!direct) {
    const start = nearestNavNode(player.x, player.y);
    const target = nearestNavNode(destination.x, destination.y);
    for (const id of findLobbyPath(start.id, target.id)) {
      const node = NAV_BY_ID.get(id);
      if (node) path.push({ x: node.x, y: node.y });
    }
  }
  const last = path[path.length - 1];
  if (!last || Math.hypot(last.x - destination.x, last.y - destination.y) > 6) path.push(destination);
  player.movePath = path;
  player.movePathIndex = 0;
  player.moveTargetX = destination.x;
  player.moveTargetY = destination.y;
  player.moveTargetActive = path.length > 0;
  return player.moveTargetActive;
}

export function cancelLobbyPlayerMove() {
  const player = state.lobby.player;
  if (!player) return;
  player.moveTargetActive = false;
  player.moveTargetX = player.x;
  player.moveTargetY = player.y;
  player.movePath ||= [];
  player.movePath.length = 0;
  player.movePathIndex = 0;
}

export function lobbySegmentWalkable(x1, y1, x2, y2, radius = 15) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const samples = Math.max(1, Math.ceil(distance / Math.max(10, radius * 0.8)));
  for (let index = 1; index <= samples; index++) {
    const t = index / samples;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const resolved = resolveLobbyPosition(x, y, radius);
    if (Math.hypot(resolved.x - x, resolved.y - y) > 0.75) return false;
  }
  return true;
}

export function resolveLobbyPosition(x, y, radius = 15) {
  const halfW = LOBBY_WIDTH / 2 - PLAYER_MARGIN;
  const halfH = LOBBY_HEIGHT / 2 - PLAYER_MARGIN;
  const point = { x: clamp(x, -halfW, halfW), y: clamp(y, -halfH, halfH) };
  const colliders = lobbyColliders();
  for (let pass = 0; pass < 3; pass++) {
    for (const collider of colliders) {
      if (collider.shape === "circle") pushCircleOutOfCircle(point, radius, collider);
      else pushCircleOutOfRect(point, radius, collider);
    }
  }
  point.x = clamp(point.x, -halfW, halfW);
  point.y = clamp(point.y, -halfH, halfH);
  return point;
}

export function lobbyColliders() {
  return [
    ...outerWallColliders(),
    ...roomWallColliders(),
    ...doorColliders(),
    ...LOBBY_DEVICES.flatMap((device) => entityColliders(device, device.collider ? [{ shape: "rect", oy: 20, ...device.collider }] : [])),
    ...LOBBY_WEAPON_STATIONS.flatMap((station) => entityColliders(station, station.collider ? [{ shape: "rect", oy: 28, ...station.collider }] : [])),
    ...LOBBY_PORTALS.flatMap((portal) => entityColliders(portal, [{ shape: "rect", oy: 26, w: 230, h: 90 }])),
    ...LOBBY_SCENERY.flatMap((scenery) => entityColliders(scenery, scenery.colliders)),
    ...LOBBY_PROPS.flatMap((prop) => entityColliders(prop, prop.colliders)),
  ];
}

function entityColliders(entity, definitions = []) {
  return definitions.map((definition) => ({
    shape: definition.shape === "circle" ? "circle" : "rect",
    x: entity.x + (definition.ox || 0),
    y: entity.y + (definition.oy || 0),
    ...(definition.shape === "circle"
      ? { r: Math.max(1, Number(definition.r) || 1) }
      : { w: Math.max(1, Number(definition.w) || 1), h: Math.max(1, Number(definition.h) || 1) }),
    sourceId: entity.id,
  }));
}

export function lobbyRoomAt(x, y) {
  return LOBBY_ROOMS.find((room) => (
    x >= room.x - room.w / 2 && x <= room.x + room.w / 2
    && y >= room.y - room.h / 2 && y <= room.y + room.h / 2
  )) || null;
}

export function lobbyRoomInteriorDepth(room, x, y) {
  if (!room?.roof) return room?.id === "core" ? Infinity : -Infinity;
  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = room.y - room.h / 2;
  const bottom = room.y + room.h / 2;
  if (x < left || x > right || y < top || y > bottom) return -Infinity;
  if (room.doorSide === "left") return x - left;
  if (room.doorSide === "right") return right - x;
  if (room.doorSide === "top") return y - top;
  if (room.doorSide === "bottom") return bottom - y;
  return Math.min(x - left, right - x, y - top, bottom - y);
}

export function lobbyInteriorRoomAt(x, y, minimumDepth = 24) {
  return LOBBY_ROOMS.find((room) => room.roof && lobbyRoomInteriorDepth(room, x, y) >= minimumDepth) || null;
}

export function isLobbyRoomVisible(roomId) {
  if (!roomId || roomId === "core") return true;
  return roomId === state.lobby.currentRoomId || (state.lobby.roomReveal[roomId] || 0) > 0.12;
}

export function lobbyRoomReveal(roomId) {
  if (!roomId || roomId === "core") return 1;
  return clamp(state.lobby.roomReveal[roomId] || 0, 0, 1);
}

export function lobbyNpcRuntime(id) {
  return state.lobby.npcs[id] || null;
}

export function lobbyNpcDialogue(id) {
  const npc = LOBBY_NPCS.find((entry) => entry.id === id);
  const base = NPC_DIALOGUES[npc?.personality] || NPC_DIALOGUES.guide;
  if (!npc || !base) return null;
  const nearby = nearestNpcTo(id, 180);
  const weapon = selectedLobbyWeapon();
  const difficulty = selectedLobbyDifficulty();
  const firstClearDifficultyId = peekLobbyFirstClearReaction(id);
  const firstClearDifficulty = lobbyDifficulties.find((entry) => entry.id === firstClearDifficultyId);
  const firstClearText = firstClearDifficultyId
    ? FIRST_CLEAR_REACTIONS[npc.personality]?.(firstClearDifficulty?.name || firstClearDifficultyId)
    : null;
  const context = nearby
    ? `${nearby.name}也在附近。${socialLineFor(npc)}`
    : `当前同步：${difficulty?.name || "未选择"} / ${weapon?.name || "未选择武器"} / ${lobbyRandomGoalLabel()}。`;
  return {
    role: base.role,
    title: base.title,
    speaker: `${npc.role} · ${npc.name}`,
    color: npc.color,
    portrait: npc.id,
    npcId: npc.id,
    text: firstClearText || base.intro,
    pages: firstClearText ? splitLobbyDialogue(firstClearText) : [base.intro, context],
    topics: base.topics.map(([label, text], index) => ({
      id: `${id}-${index}`,
      label,
      text,
      pages: splitLobbyDialogue(text),
    })),
    firstClearDifficultyId: firstClearText ? firstClearDifficultyId : null,
  };
}

function splitLobbyDialogue(text) {
  const sentences = String(text || "").match(/[^。！？!?]+[。！？!?]?/g)?.map((entry) => entry.trim()).filter(Boolean) || [];
  if (sentences.length <= 1) return sentences.length ? sentences : [String(text || "")];
  const pages = [];
  let page = "";
  for (const sentence of sentences) {
    if (page && page.length + sentence.length > 48) {
      pages.push(page);
      page = sentence;
    } else {
      page += sentence;
    }
  }
  if (page) pages.push(page);
  return pages;
}

export function beginLobbyNpcConversation(id) {
  const runtime = state.lobby.npcs[id];
  if (!runtime) return false;
  if (runtime.mode === "petSocial") breakNpcPetSocial(runtime);
  else breakNpcSocial(runtime);
  runtime.mode = "playerTalk";
  runtime.vx = 0;
  runtime.vy = 0;
  runtime.dirX = Math.sign(state.lobby.player.x - runtime.x) || runtime.dirX || 1;
  runtime.dirY = Math.sign(state.lobby.player.y - runtime.y) || 0;
  state.lobby.talkingNpcId = id;
  return true;
}

export function endLobbyNpcConversation() {
  const id = state.lobby.talkingNpcId;
  if (!id) return false;
  const runtime = state.lobby.npcs[id];
  if (runtime) {
    runtime.mode = "work";
    runtime.wait = 1.2;
    runtime.decisionTimer = 1.2;
  }
  state.lobby.talkingNpcId = null;
  return true;
}

export function findLobbyPath(startId, targetId) {
  if (!NAV_BY_ID.has(startId) || !NAV_BY_ID.has(targetId)) return [];
  if (startId === targetId) return [startId];
  const open = [{ id: startId, score: 0 }];
  const costs = new Map([[startId, 0]]);
  const previous = new Map();
  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift().id;
    if (current === targetId) break;
    for (const next of NAV_LINKS.get(current) || []) {
      const cost = costs.get(current) + nodeDistance(current, next);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost);
      previous.set(next, current);
      open.push({ id: next, score: cost + nodeDistance(next, targetId) });
    }
  }
  if (!previous.has(targetId)) return [];
  const path = [targetId];
  while (path[0] !== startId) path.unshift(previous.get(path[0]));
  return path;
}

function initializeLobbyRuntime() {
  const lobby = state.lobby;
  lobby.roomReveal ||= {};
  lobby.doors ||= {};
  lobby.npcs ||= {};
  for (const room of LOBBY_ROOMS) lobby.roomReveal[room.id] ??= room.roof ? 0 : 1;
  for (const door of LOBBY_DOORS) {
    lobby.doors[door.id] ||= { state: "closed", progress: 0, requestTime: 0 };
  }
  for (const npc of LOBBY_NPCS) {
    lobby.npcs[npc.id] ||= {
      x: npc.x, y: npc.y, vx: 0, vy: 0, dirX: 1, dirY: 0, moving: false,
      mode: "work", targetNodeId: npc.homeNode, path: [], pathIndex: 0,
      wait: 1 + Math.random() * 2, decisionTimer: 1 + Math.random() * 3,
      socialCooldown: Math.random() * 12, partnerId: null, bubble: "", bubbleLife: 0,
      stuckTime: 0, lastX: npc.x, lastY: npc.y, stride: Math.random() * Math.PI * 2,
    };
    const runtime = lobby.npcs[npc.id];
    runtime.facingAngle ??= Math.atan2(runtime.dirY || 0, runtime.dirX || 1);
    runtime.lastSafeNodeId ??= npc.homeNode;
    runtime.recoveryStage ??= 0;
    runtime.sidestepSign ??= hashString(npc.id) % 2 ? 1 : -1;
  }
  lobby.pet ||= {
    x: LOBBY_PET.x, y: LOBBY_PET.y, vx: 0, vy: 0, dirX: 1, dirY: 0,
    facingAngle: 0, moving: false, mode: "roam", targetNodeId: LOBBY_PET.homeNode,
    path: [], pathIndex: 0, wait: 1.5, decisionTimer: 1.5, socialCooldown: 5,
    partnerId: null, bubble: "", bubbleLife: 0, stride: 0, tailPhase: 0,
    stuckTime: 0, lastX: LOBBY_PET.x, lastY: LOBBY_PET.y, lastSafeNodeId: LOBBY_PET.homeNode,
  };
  lobby.pet.behaviorTimer ??= 0;
  lobby.pet.interestId ??= null;
  lobby.pet.interestType ??= null;
  lobby.pet.interestX ??= lobby.pet.x;
  lobby.pet.interestY ??= lobby.pet.y;
  lobby.pet.lightId ??= null;
}

function updateLobbyPlayer(dt) {
  const player = state.lobby.player;
  let ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let ay = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  let length = Math.hypot(ax, ay);
  if (length > 0.001) {
    cancelLobbyPlayerMove();
  } else if (player.moveTargetActive) {
    const path = player.movePath || [];
    let waypoint = path[player.movePathIndex];
    while (waypoint) {
      const dx = waypoint.x - player.x;
      const dy = waypoint.y - player.y;
      const distance = Math.hypot(dx, dy);
      const final = player.movePathIndex >= path.length - 1;
      if (distance <= (final ? 6 : 18)) {
        player.movePathIndex++;
        waypoint = path[player.movePathIndex];
        if (!waypoint) {
          cancelLobbyPlayerMove();
          break;
        }
        continue;
      }
      ax = dx / Math.max(0.001, distance);
      ay = dy / Math.max(0.001, distance);
      length = 1;
      break;
    }
  }
  if (length > 0.001) {
    ax /= length;
    ay /= length;
    player.dirX = ax;
    player.dirY = ay;
  } else {
    ax = 0;
    ay = 0;
  }
  const targetVx = ax * player.speed;
  const targetVy = ay * player.speed;
  const acceleration = length > 0.001 ? 1060 : 1280;
  player.vx = approach(player.vx, targetVx, acceleration * dt);
  player.vy = approach(player.vy, targetVy, acceleration * dt);
  player.moving = Math.hypot(player.vx, player.vy) > 12;
  player.stride += Math.hypot(player.vx, player.vy) * dt * 0.045;
  player.tilt += ((player.vx / player.speed) * 0.16 - player.tilt) * Math.min(1, dt * 9);
  const nextX = resolveLobbyPosition(player.x + player.vx * dt, player.y, player.r);
  if (Math.abs(nextX.x - (player.x + player.vx * dt)) > 0.5) player.vx *= 0.15;
  player.x = nextX.x;
  const nextY = resolveLobbyPosition(player.x, player.y + player.vy * dt, player.r);
  if (Math.abs(nextY.y - (player.y + player.vy * dt)) > 0.5) player.vy *= 0.15;
  player.y = nextY.y;
}

function updatePlayerRoom(dt) {
  const lobby = state.lobby;
  const current = LOBBY_ROOMS.find((room) => room.id === lobby.currentRoomId && room.roof);
  const stillInside = current && lobbyRoomInteriorDepth(current, lobby.player.x, lobby.player.y) >= 0;
  const entered = stillInside ? current : lobbyInteriorRoomAt(
    lobby.player.x,
    lobby.player.y,
    Math.max(22, lobby.player.r + 8),
  );
  lobby.currentRoomId = entered?.id || null;
  for (const definition of LOBBY_ROOMS) {
    const target = !definition.roof || definition.id === lobby.currentRoomId ? 1 : 0;
    const current = lobby.roomReveal[definition.id] || 0;
    lobby.roomReveal[definition.id] = approach(current, target, dt * 4);
  }
}

function updateLobbyDoors(dt) {
  for (const door of LOBBY_DOORS) {
    const runtime = state.lobby.doors[door.id];
    if (!runtime) continue;
    const occupied = entitiesNearDoor(door, DOOR_SENSOR_RADIUS);
    if (occupied) runtime.requestTime = 1.15;
    else runtime.requestTime = Math.max(0, runtime.requestTime - dt);
    if (runtime.requestTime > 0) {
      runtime.progress = Math.min(1, runtime.progress + dt * 2.8);
      runtime.state = runtime.progress >= 1 ? "open" : "opening";
    } else if (!entitiesNearDoor(door, 86)) {
      runtime.progress = Math.max(0, runtime.progress - dt * 2.1);
      runtime.state = runtime.progress <= 0 ? "closed" : "closing";
    }
  }
}

function updateLobbyNpcs(dt) {
  const reservations = new Map();
  for (const npc of [...LOBBY_NPCS].sort((a, b) => a.id.localeCompare(b.id))) {
    const runtime = state.lobby.npcs[npc.id];
    const nextNode = runtime?.path?.[runtime.pathIndex];
    if (nextNode && !reservations.has(nextNode)) reservations.set(nextNode, npc.id);
  }
  state.lobby.navigationReservations = Object.fromEntries(reservations);
  for (const npc of LOBBY_NPCS) {
    const runtime = state.lobby.npcs[npc.id];
    if (!runtime) continue;
    runtime.socialCooldown = Math.max(0, runtime.socialCooldown - dt);
    runtime.bubbleLife = Math.max(0, runtime.bubbleLife - dt);
    if (runtime.bubbleLife <= 0) runtime.bubble = "";
    runtime.stride += Math.hypot(runtime.vx, runtime.vy) * dt * 0.055;
    const desiredAngle = Math.atan2(runtime.vy || runtime.dirY || 0, runtime.vx || runtime.dirX || 1);
    runtime.facingAngle = lerpAngle(runtime.facingAngle || 0, desiredAngle, Math.min(1, dt * (runtime.moving ? 7 : 3)));
    runtime.dirX = Math.cos(runtime.facingAngle);
    runtime.dirY = Math.sin(runtime.facingAngle);
    if (state.lobby.talkingNpcId === npc.id || runtime.mode === "playerTalk") {
      runtime.vx = approach(runtime.vx, 0, 500 * dt);
      runtime.vy = approach(runtime.vy, 0, 500 * dt);
      runtime.moving = false;
      continue;
    }
    if (runtime.mode === "petSocial") {
      runtime.wait -= dt;
      runtime.vx = approach(runtime.vx, 0, 560 * dt);
      runtime.vy = approach(runtime.vy, 0, 560 * dt);
      runtime.moving = false;
      const pet = state.lobby.pet;
      if (pet) {
        const angle = Math.atan2(pet.y - runtime.y, pet.x - runtime.x);
        runtime.facingAngle = lerpAngle(runtime.facingAngle, angle, Math.min(1, dt * 8));
      }
      if (runtime.wait <= 0 || !pet || pet.partnerId !== npc.id) breakNpcPetSocial(runtime);
      continue;
    }
    if (runtime.mode === "social") {
      runtime.wait -= dt;
      runtime.vx = approach(runtime.vx, 0, 500 * dt);
      runtime.vy = approach(runtime.vy, 0, 500 * dt);
      runtime.moving = false;
      const partner = state.lobby.npcs[runtime.partnerId];
      if (partner) {
        runtime.dirX = Math.sign(partner.x - runtime.x) || runtime.dirX;
        runtime.dirY = Math.sign(partner.y - runtime.y);
      }
      if (runtime.wait <= 0) breakNpcSocial(runtime);
      continue;
    }

    if (!runtime.path.length || runtime.pathIndex >= runtime.path.length) {
      runtime.wait -= dt;
      runtime.decisionTimer -= dt;
      runtime.vx = approach(runtime.vx, 0, 520 * dt);
      runtime.vy = approach(runtime.vy, 0, 520 * dt);
      runtime.moving = false;
      if (runtime.wait <= 0 && tryStartNpcSocial(npc, runtime)) continue;
      if (runtime.decisionTimer <= 0) chooseNpcDestination(npc, runtime);
      continue;
    }

    const target = NAV_BY_ID.get(runtime.path[runtime.pathIndex]);
    if (!target) {
      runtime.path = [];
      continue;
    }
    const dx = target.x - runtime.x;
    const dy = target.y - runtime.y;
    const distance = Math.hypot(dx, dy);
    const reservationOwner = reservations.get(runtime.path[runtime.pathIndex]);
    if (reservationOwner && reservationOwner !== npc.id && distance < 92) {
      runtime.vx = approach(runtime.vx, 0, 620 * dt);
      runtime.vy = approach(runtime.vy, 0, 620 * dt);
      runtime.moving = false;
      runtime.mode = "waitDoor";
      continue;
    }
    if (distance < 24) {
      runtime.lastSafeNodeId = runtime.path[runtime.pathIndex];
      runtime.recoveryStage = 0;
      runtime.pathIndex++;
      if (runtime.pathIndex >= runtime.path.length) {
        runtime.path = [];
        runtime.mode = "work";
        runtime.wait = 3 + Math.random() * 5;
        runtime.decisionTimer = runtime.wait;
      }
      continue;
    }

    const blockingDoor = doorBlockingSegment(runtime.x, runtime.y, target.x, target.y);
    if (blockingDoor && (state.lobby.doors[blockingDoor.id]?.progress || 0) < 0.78) {
      state.lobby.doors[blockingDoor.id].requestTime = 1.15;
      runtime.mode = "waitDoor";
      runtime.vx = approach(runtime.vx, 0, 650 * dt);
      runtime.vy = approach(runtime.vy, 0, 650 * dt);
      runtime.moving = false;
      continue;
    }
    runtime.mode = "travel";
    const speed = 92 + (hashString(npc.id) % 18);
    let desiredX = dx / distance * speed;
    let desiredY = dy / distance * speed;
    const avoidance = npcAvoidance(npc.id, runtime.x, runtime.y);
    desiredX += avoidance.x;
    desiredY += avoidance.y;
    if (runtime.recoveryStage === 1) {
      desiredX += -dy / distance * 80 * runtime.sidestepSign;
      desiredY += dx / distance * 80 * runtime.sidestepSign;
    }
    runtime.vx = approach(runtime.vx, desiredX, 360 * dt);
    runtime.vy = approach(runtime.vy, desiredY, 360 * dt);
    runtime.moving = Math.hypot(runtime.vx, runtime.vy) > 8;
    const nextX = resolveLobbyPosition(runtime.x + runtime.vx * dt, runtime.y, 13);
    runtime.x = nextX.x;
    const nextY = resolveLobbyPosition(runtime.x, runtime.y + runtime.vy * dt, 13);
    runtime.y = nextY.y;
    const moved = Math.hypot(runtime.x - runtime.lastX, runtime.y - runtime.lastY);
    runtime.stuckTime = moved < 0.5 ? runtime.stuckTime + dt : 0;
    runtime.lastX = runtime.x;
    runtime.lastY = runtime.y;
    if (runtime.stuckTime > 0.8) {
      runtime.recoveryStage = (runtime.recoveryStage + 1) % 3;
      const nearest = runtime.recoveryStage === 2 && NAV_BY_ID.has(runtime.lastSafeNodeId)
        ? NAV_BY_ID.get(runtime.lastSafeNodeId)
        : nearestNavNode(runtime.x, runtime.y);
      if (runtime.recoveryStage === 2 && nearest) {
        const safe = resolveLobbyPosition(nearest.x, nearest.y, 13);
        if (distSq(runtime.x, runtime.y, state.lobby.player.x, state.lobby.player.y) > 800 * 800) {
          runtime.x = safe.x;
          runtime.y = safe.y;
        }
      }
      runtime.path = findLobbyPath(nearest.id, runtime.targetNodeId);
      runtime.pathIndex = runtime.path[0] === nearest.id ? 1 : 0;
      runtime.sidestepSign *= -1;
      runtime.stuckTime = 0;
    }
  }
}

function chooseNpcDestination(npc, runtime) {
  const roamNodes = [
    "core-social", "bridge-nav", "data-lounge", "science-med",
    "combat-hangar", "engineering-power", "habitat-mess",
  ];
  const pool = Math.random() < 0.68 ? npc.workNodes : [...npc.workNodes, ...roamNodes];
  const destination = pool[Math.floor(Math.random() * pool.length)] || npc.homeNode;
  const start = nearestNavNode(runtime.x, runtime.y);
  runtime.targetNodeId = destination;
  runtime.path = findLobbyPath(start.id, destination);
  runtime.pathIndex = runtime.path[0] === start.id ? 1 : 0;
  runtime.mode = "travel";
  runtime.wait = 0;
  runtime.decisionTimer = 7 + Math.random() * 8;
}

function tryStartNpcSocial(npc, runtime) {
  if (runtime.socialCooldown > 0) return false;
  const pet = state.lobby.pet;
  if (pet && pet.socialCooldown <= 0 && pet.mode !== "petSocial"
    && distSq(runtime.x, runtime.y, pet.x, pet.y) < 115 * 115
    && hashString(`${npc.id}-${Math.floor(state.lobby.shipTime / 5)}`) % 4 === 0) {
    const duration = 2.8 + Math.random() * 1.8;
    runtime.mode = "petSocial";
    runtime.partnerId = LOBBY_PET.id;
    runtime.wait = duration;
    runtime.socialCooldown = 24 + Math.random() * 18;
    runtime.bubble = npc.personality === "engineer" ? "小家伙，灯别照我眼睛。" : "来，火花。好孩子。";
    runtime.bubbleLife = duration;
    pet.mode = "petSocial";
    pet.partnerId = npc.id;
    pet.wait = duration;
    pet.socialCooldown = 30 + Math.random() * 18;
    pet.bubble = "汪呜——滴！";
    pet.bubbleLife = duration;
    return true;
  }
  const peer = LOBBY_NPCS.find((candidate) => {
    if (candidate.id === npc.id) return false;
    const other = state.lobby.npcs[candidate.id];
    return other && other.socialCooldown <= 0 && other.mode === "work"
      && distSq(runtime.x, runtime.y, other.x, other.y) < 95 * 95;
  });
  if (!peer) return false;
  const other = state.lobby.npcs[peer.id];
  const duration = 3.5 + Math.random() * 2;
  runtime.mode = "social";
  other.mode = "social";
  runtime.partnerId = peer.id;
  other.partnerId = npc.id;
  runtime.wait = duration;
  other.wait = duration;
  runtime.socialCooldown = 28 + Math.random() * 22;
  other.socialCooldown = 28 + Math.random() * 22;
  runtime.bubble = socialLineFor(npc);
  other.bubble = socialLineFor(peer);
  runtime.bubbleLife = duration;
  other.bubbleLife = duration;
  return true;
}

function breakNpcPetSocial(runtime) {
  const pet = state.lobby.pet;
  if (pet?.partnerId) {
    pet.partnerId = null;
    pet.mode = "roam";
    pet.wait = 1;
  }
  runtime.partnerId = null;
  runtime.mode = "work";
  runtime.wait = 1 + Math.random() * 2;
  runtime.bubble = "";
  runtime.bubbleLife = 0;
}

function breakNpcSocial(runtime) {
  const partner = state.lobby.npcs[runtime.partnerId];
  if (partner && partner.partnerId) {
    partner.partnerId = null;
    partner.mode = "work";
    partner.wait = 1 + Math.random() * 2;
    partner.bubble = "";
    partner.bubbleLife = 0;
  }
  runtime.partnerId = null;
  runtime.mode = "work";
  runtime.wait = 1 + Math.random() * 2;
  runtime.bubble = "";
  runtime.bubbleLife = 0;
}

function updateLobbyPet(dt) {
  const pet = state.lobby.pet;
  if (!pet) return;
  pet.socialCooldown = Math.max(0, pet.socialCooldown - dt);
  pet.bubbleLife = Math.max(0, pet.bubbleLife - dt);
  if (pet.bubbleLife <= 0) pet.bubble = "";
  const activeTail = pet.mode === "greet" || pet.mode === "petSocial";
  pet.tailPhase += dt * (activeTail ? 20 : pet.moving ? 12 : pet.mode === "sleep" ? 1.2 : 5);
  pet.stride += Math.hypot(pet.vx, pet.vy) * dt * 0.085;

  if (pet.mode === "petSocial") {
    pet.wait -= dt;
    pet.vx = approach(pet.vx, 0, 620 * dt);
    pet.vy = approach(pet.vy, 0, 620 * dt);
    pet.moving = false;
    const partner = state.lobby.npcs[pet.partnerId];
    if (partner) pet.facingAngle = lerpAngle(pet.facingAngle, Math.atan2(partner.y - pet.y, partner.x - pet.x), Math.min(1, dt * 9));
    if (pet.wait <= 0 || !partner) {
      if (partner?.mode === "petSocial") breakNpcPetSocial(partner);
      else {
        pet.partnerId = null;
        pet.mode = "roam";
      }
    }
    pet.dirX = Math.cos(pet.facingAngle);
    pet.dirY = Math.sin(pet.facingAngle);
    return;
  }

  if (["sniff", "sit", "sleep", "greet"].includes(pet.mode)) {
    pet.wait -= dt;
    pet.vx = approach(pet.vx, 0, 620 * dt);
    pet.vy = approach(pet.vy, 0, 620 * dt);
    pet.moving = false;
    facePetInterest(pet, dt);
    if (pet.wait <= 0) {
      pet.mode = "roam";
      pet.interestId = null;
      pet.interestType = null;
      choosePetDestination(pet);
    }
    pet.dirX = Math.cos(pet.facingAngle);
    pet.dirY = Math.sin(pet.facingAngle);
    return;
  }

  if (pet.mode === "chaseLight") {
    pet.wait -= dt;
    const light = LOBBY_MOBILE_LIGHTS.find((entry) => entry.id === pet.lightId);
    const lightPosition = light ? lobbyMobileLightPosition(light) : null;
    const petRoom = lobbyRoomAt(pet.x, pet.y)?.id || "core";
    if (!light || light.roomId !== petRoom || pet.wait <= 0 || !lightPosition) {
      pet.lightId = null;
      pet.mode = "roam";
      choosePetDestination(pet);
      return;
    }
    const reached = movePetToward(pet, lightPosition.x, lightPosition.y, dt, 154);
    if (reached) {
      pet.bubble = "追踪光点……锁定！";
      pet.bubbleLife = Math.max(pet.bubbleLife, 0.45);
    }
    return;
  }

  if (!pet.path.length || pet.pathIndex >= pet.path.length) {
    pet.wait -= dt;
    pet.vx = approach(pet.vx, 0, 650 * dt);
    pet.vy = approach(pet.vy, 0, 650 * dt);
    pet.moving = false;
    if (pet.wait <= 0) choosePetBehavior(pet);
    return;
  }

  const target = NAV_BY_ID.get(pet.path[pet.pathIndex]);
  if (!target) {
    pet.path = [];
    return;
  }
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 22) {
    pet.lastSafeNodeId = pet.path[pet.pathIndex];
    pet.pathIndex++;
    if (pet.pathIndex >= pet.path.length) {
      pet.path = [];
      pet.wait = 0.6 + Math.random() * 1.2;
    }
    return;
  }
  const blockingDoor = doorBlockingSegment(pet.x, pet.y, target.x, target.y);
  if (blockingDoor && (state.lobby.doors[blockingDoor.id]?.progress || 0) < 0.78) {
    state.lobby.doors[blockingDoor.id].requestTime = 1.15;
    pet.vx = approach(pet.vx, 0, 700 * dt);
    pet.vy = approach(pet.vy, 0, 700 * dt);
    pet.moving = false;
    return;
  }
  const speed = 118;
  const avoidance = mobileAgentAvoidance(LOBBY_PET.id, pet.x, pet.y);
  const targetVx = dx / distance * speed + avoidance.x;
  const targetVy = dy / distance * speed + avoidance.y;
  pet.vx = approach(pet.vx, targetVx, 480 * dt);
  pet.vy = approach(pet.vy, targetVy, 480 * dt);
  pet.moving = Math.hypot(pet.vx, pet.vy) > 9;
  pet.facingAngle = lerpAngle(pet.facingAngle, Math.atan2(pet.vy, pet.vx), Math.min(1, dt * 8));
  pet.dirX = Math.cos(pet.facingAngle);
  pet.dirY = Math.sin(pet.facingAngle);
  const nextX = resolveLobbyPosition(pet.x + pet.vx * dt, pet.y, 12);
  pet.x = nextX.x;
  const nextY = resolveLobbyPosition(pet.x, pet.y + pet.vy * dt, 12);
  pet.y = nextY.y;
  const moved = Math.hypot(pet.x - pet.lastX, pet.y - pet.lastY);
  pet.stuckTime = moved < 0.4 ? pet.stuckTime + dt : 0;
  pet.lastX = pet.x;
  pet.lastY = pet.y;
  if (pet.stuckTime > 0.9) {
    const nearest = nearestNavNode(pet.x, pet.y);
    pet.path = findLobbyPath(nearest.id, pet.targetNodeId);
    pet.pathIndex = pet.path[0] === nearest.id ? 1 : 0;
    pet.stuckTime = 0;
  }
}

function choosePetBehavior(pet) {
  const roll = Math.random();
  const nearbyCharacter = nearestPetInterest(pet, "character", 260);
  const nearbyObject = nearestPetInterest(pet, "object", 235);
  const currentRoomId = lobbyRoomAt(pet.x, pet.y)?.id || "core";
  const nearbyLight = LOBBY_MOBILE_LIGHTS
    .filter((light) => light.roomId === currentRoomId)
    .map((light) => ({ light, position: lobbyMobileLightPosition(light) }))
    .filter(({ position }) => distSq(position.x, position.y, pet.x, pet.y) <= 600 * 600)
    .sort((a, b) => distSq(a.position.x, a.position.y, pet.x, pet.y) - distSq(b.position.x, b.position.y, pet.x, pet.y))[0];
  pet.path = [];
  pet.pathIndex = 0;
  if (roll < 0.2) {
    pet.mode = "sit";
    pet.wait = 3 + Math.random() * 3;
    pet.interestType = nearbyCharacter ? "character" : "air";
    pet.interestId = nearbyCharacter?.id || null;
    pet.interestX = nearbyCharacter?.x ?? pet.x + Math.cos(pet.facingAngle) * 80;
    pet.interestY = nearbyCharacter?.y ?? pet.y + Math.sin(pet.facingAngle) * 80;
    return;
  }
  const nearDoor = LOBBY_DOORS.some((door) => distSq(door.x, door.y, pet.x, pet.y) < 150 * 150);
  if (roll < 0.34 && !nearDoor) {
    pet.mode = "sleep";
    pet.wait = 6 + Math.random() * 6;
    pet.interestType = null;
    return;
  }
  if (roll < 0.58) {
    const target = nearbyCharacter || nearbyObject;
    pet.mode = "sniff";
    pet.wait = 2.2 + Math.random() * 2.8;
    pet.interestType = target?.type || "air";
    pet.interestId = target?.id || null;
    pet.interestX = target?.x ?? pet.x + (Math.random() - 0.5) * 150;
    pet.interestY = target?.y ?? pet.y + (Math.random() - 0.5) * 110;
    pet.bubble = target ? "嗅探目标中……" : "空气样本：正常。";
    pet.bubbleLife = 1.4;
    return;
  }
  if (roll < 0.72 && nearbyCharacter) {
    pet.mode = "greet";
    pet.wait = 2.4 + Math.random() * 1.8;
    pet.interestType = "character";
    pet.interestId = nearbyCharacter.id;
    pet.interestX = nearbyCharacter.x;
    pet.interestY = nearbyCharacter.y;
    pet.bubble = "汪！识别到朋友。";
    pet.bubbleLife = 1.6;
    return;
  }
  if (roll < 0.88 && nearbyLight) {
    pet.mode = "chaseLight";
    pet.lightId = nearbyLight.light.id;
    pet.wait = 4.5 + Math.random() * 4;
    pet.bubble = "移动光点！";
    pet.bubbleLife = 1.2;
    return;
  }
  choosePetDestination(pet);
}

function nearestPetInterest(pet, kind, radius) {
  const candidates = [];
  if (kind === "character") {
    candidates.push({ id: "player", type: "character", x: state.lobby.player.x, y: state.lobby.player.y });
    for (const definition of LOBBY_NPCS) {
      const runtime = state.lobby.npcs[definition.id];
      if (runtime) candidates.push({ id: definition.id, type: "character", x: runtime.x, y: runtime.y });
    }
  } else {
    for (const entity of [...LOBBY_DEVICES, ...LOBBY_PROPS, ...LOBBY_SCENERY]) {
      candidates.push({ id: entity.id, type: "object", x: entity.x, y: entity.y });
    }
  }
  return candidates
    .filter((entry) => distSq(entry.x, entry.y, pet.x, pet.y) <= radius * radius)
    .sort((a, b) => distSq(a.x, a.y, pet.x, pet.y) - distSq(b.x, b.y, pet.x, pet.y))[0] || null;
}

function facePetInterest(pet, dt) {
  if (pet.interestType === "character" && pet.interestId) {
    const target = pet.interestId === "player" ? state.lobby.player : state.lobby.npcs[pet.interestId];
    if (target) {
      pet.interestX = target.x;
      pet.interestY = target.y;
    }
  }
  const dx = (pet.interestX ?? pet.x + 1) - pet.x;
  const dy = (pet.interestY ?? pet.y) - pet.y;
  if (Math.hypot(dx, dy) > 1) {
    pet.facingAngle = lerpAngle(pet.facingAngle, Math.atan2(dy, dx), Math.min(1, dt * 8));
  }
}

function movePetToward(pet, targetX, targetY, dt, speed) {
  const dx = targetX - pet.x;
  const dy = targetY - pet.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 34) {
    pet.vx = approach(pet.vx, 0, 720 * dt);
    pet.vy = approach(pet.vy, 0, 720 * dt);
    pet.moving = false;
    return true;
  }
  const avoidance = mobileAgentAvoidance(LOBBY_PET.id, pet.x, pet.y);
  pet.vx = approach(pet.vx, dx / distance * speed + avoidance.x, 580 * dt);
  pet.vy = approach(pet.vy, dy / distance * speed + avoidance.y, 580 * dt);
  pet.moving = Math.hypot(pet.vx, pet.vy) > 9;
  pet.facingAngle = lerpAngle(pet.facingAngle, Math.atan2(pet.vy, pet.vx), Math.min(1, dt * 10));
  pet.dirX = Math.cos(pet.facingAngle);
  pet.dirY = Math.sin(pet.facingAngle);
  const desiredX = pet.x + pet.vx * dt;
  const resolvedX = resolveLobbyPosition(desiredX, pet.y, 12);
  pet.x = resolvedX.x;
  const desiredY = pet.y + pet.vy * dt;
  const resolvedY = resolveLobbyPosition(pet.x, desiredY, 12);
  pet.y = resolvedY.y;
  if (Math.abs(resolvedX.x - desiredX) > 1 || Math.abs(resolvedY.y - desiredY) > 1) pet.wait = Math.min(pet.wait, 0.7);
  return false;
}

function choosePetDestination(pet) {
  const candidates = LOBBY_PET.roamNodes.filter((id) => id !== "habitat-home");
  const destination = candidates[Math.floor(Math.random() * candidates.length)] || LOBBY_PET.homeNode;
  const start = nearestNavNode(pet.x, pet.y);
  pet.targetNodeId = destination;
  pet.path = findLobbyPath(start.id, destination);
  pet.pathIndex = pet.path[0] === start.id ? 1 : 0;
  pet.mode = "roam";
  pet.wait = 0;
}

function interactWithLobbyPet() {
  const pet = state.lobby.pet;
  if (!pet) return false;
  if (pet.partnerId) {
    const partner = state.lobby.npcs[pet.partnerId];
    if (partner?.mode === "petSocial") breakNpcPetSocial(partner);
  }
  pet.mode = "petSocial";
  pet.partnerId = null;
  pet.wait = 1.7;
  pet.vx = 0;
  pet.vy = 0;
  pet.facingAngle = Math.atan2(state.lobby.player.y - pet.y, state.lobby.player.x - pet.x);
  pet.bubble = ["汪！识别成功。", "滴滴——尾巴协议启动！", "K-9 请求摸摸头。"][Math.floor(state.lobby.shipTime) % 3];
  pet.bubbleLife = 2.2;
  pet.socialCooldown = Math.max(pet.socialCooldown, 6);
  setLobbyToast("火花开心地摇起了天线尾巴", LOBBY_PET.color, 1.8);
  return true;
}

function separateLobbyAgents() {
  const agents = LOBBY_NPCS.map((definition) => ({
    id: definition.id,
    runtime: state.lobby.npcs[definition.id],
    radius: 22,
    fixed: state.lobby.talkingNpcId === definition.id,
  })).filter((entry) => entry.runtime);
  if (state.lobby.pet) agents.push({ id: LOBBY_PET.id, runtime: state.lobby.pet, radius: 18, fixed: false });
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const first = agents[i];
        const second = agents[j];
        let dx = second.runtime.x - first.runtime.x;
        let dy = second.runtime.y - first.runtime.y;
        let distance = Math.hypot(dx, dy);
        const minimum = first.radius + second.radius + 5;
        if (distance >= minimum) continue;
        if (distance < 0.001) {
          const angle = (hashString(`${first.id}:${second.id}`) % 628) / 100;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const overlap = minimum - distance;
        const firstShare = first.fixed ? 0 : second.fixed ? 1 : 0.5;
        const secondShare = second.fixed ? 0 : first.fixed ? 1 : 0.5;
        if (firstShare > 0) {
          const moved = resolveLobbyPosition(first.runtime.x - dx / distance * overlap * firstShare, first.runtime.y - dy / distance * overlap * firstShare, first.radius * 0.55);
          first.runtime.x = moved.x;
          first.runtime.y = moved.y;
        }
        if (secondShare > 0) {
          const moved = resolveLobbyPosition(second.runtime.x + dx / distance * overlap * secondShare, second.runtime.y + dy / distance * overlap * secondShare, second.radius * 0.55);
          second.runtime.x = moved.x;
          second.runtime.y = moved.y;
        }
      }
    }
  }
}

function beginLobbyLaunch(runMode, interaction) {
  const config = buildLobbyRunConfig(runMode);
  if (!config) {
    setLobbyToast("出击参数尚未同步", "#ff7a8a");
    return null;
  }
  state.lobby.pendingLaunch = {
    portalId: interaction.id,
    runMode,
    elapsed: 0,
    duration: LAUNCH_DURATION,
    x: interaction.x,
    y: interaction.y,
    config,
  };
  setLobbyToast(`${runMode === "random" ? "异常" : "稳定"}航线开始充能`, runMode === "random" ? "#b48cff" : "#42e8ff", 1.3);
  return { ...interaction, action: "launch-charge", config };
}

function updatePendingLaunch(dt) {
  const launch = state.lobby.pendingLaunch;
  if (!launch) return null;
  if (distSq(state.lobby.player.x, state.lobby.player.y, launch.x, launch.y) > 142 * 142) {
    cancelLobbyLaunch("已离开传送范围，充能取消");
    return null;
  }
  launch.elapsed = Math.min(launch.duration, launch.elapsed + dt);
  if (launch.elapsed < launch.duration) return null;
  state.lobby.pendingLaunch = null;
  state.lobby.lastLaunchConfig = {
    difficultyId: launch.config.difficulty.id,
    weaponId: launch.config.weapon.id,
    runMode: launch.config.runMode,
    randomGoal: launch.config.randomGoal,
  };
  return { type: "launch", config: launch.config };
}

function cycleLobbyDifficulty() {
  const unlocked = lobbyDifficulties.filter((entry) => entry.unlocked !== false);
  if (!unlocked.length) return null;
  const current = unlocked.findIndex((entry) => entry.id === state.lobby.selectedDifficultyId);
  const next = unlocked[(current + 1 + unlocked.length) % unlocked.length];
  state.lobby.selectedDifficultyId = next.id;
  return next;
}

function interactionVisibleToPlayer(entry, player) {
  if (!entry.roomId || entry.roomId === "core") return true;
  const interiorRoom = lobbyInteriorRoomAt(player?.x, player?.y, Math.max(22, (player?.r || 15) + 8));
  return state.lobby.currentRoomId === entry.roomId
    || interiorRoom?.id === entry.roomId
    || isLobbyRoomVisible(entry.roomId);
}

function outerWallColliders() {
  return [
    { x: 0, y: -1780, w: LOBBY_WIDTH, h: 40 },
    { x: 0, y: 1780, w: LOBBY_WIDTH, h: 40 },
    { x: -2780, y: 0, w: 40, h: LOBBY_HEIGHT },
    { x: 2780, y: 0, w: 40, h: LOBBY_HEIGHT },
  ];
}

function roomWallColliders() {
  const colliders = [];
  const thickness = 34;
  const gap = 180;
  for (const room of LOBBY_ROOMS.filter((entry) => entry.roof)) {
    const left = room.x - room.w / 2;
    const right = room.x + room.w / 2;
    const top = room.y - room.h / 2;
    const bottom = room.y + room.h / 2;
    const door = LOBBY_DOORS.find((entry) => entry.roomId === room.id);
    if (room.doorSide === "left" || room.doorSide === "right") {
      colliders.push({ x: room.x, y: top, w: room.w, h: thickness }, { x: room.x, y: bottom, w: room.w, h: thickness });
      const wallX = room.doorSide === "left" ? left : right;
      const doorY = door?.y ?? room.y;
      const upperH = Math.max(0, doorY - gap / 2 - top);
      const lowerH = Math.max(0, bottom - (doorY + gap / 2));
      colliders.push(
        { x: wallX, y: top + upperH / 2, w: thickness, h: upperH },
        { x: wallX, y: bottom - lowerH / 2, w: thickness, h: lowerH },
        { x: room.doorSide === "left" ? right : left, y: room.y, w: thickness, h: room.h },
      );
    } else {
      colliders.push({ x: left, y: room.y, w: thickness, h: room.h }, { x: right, y: room.y, w: thickness, h: room.h });
      const wallY = room.doorSide === "top" ? top : bottom;
      const doorX = door?.x ?? room.x;
      const leftW = Math.max(0, doorX - gap / 2 - left);
      const rightW = Math.max(0, right - (doorX + gap / 2));
      colliders.push(
        { x: left + leftW / 2, y: wallY, w: leftW, h: thickness },
        { x: right - rightW / 2, y: wallY, w: rightW, h: thickness },
        { x: room.x, y: room.doorSide === "top" ? bottom : top, w: room.w, h: thickness },
      );
    }
  }
  return colliders;
}

function doorColliders() {
  return LOBBY_DOORS.flatMap((door) => {
    const runtime = state.lobby.doors[door.id];
    if ((runtime?.progress || 0) >= 0.78) return [];
    return [{
      x: door.x,
      y: door.y,
      w: door.orientation === "vertical" ? 34 : 180,
      h: door.orientation === "vertical" ? 180 : 34,
    }];
  });
}

function pushCircleOutOfRect(point, radius, rect) {
  const left = rect.x - rect.w / 2;
  const right = rect.x + rect.w / 2;
  const top = rect.y - rect.h / 2;
  const bottom = rect.y + rect.h / 2;
  const closestX = clamp(point.x, left, right);
  const closestY = clamp(point.y, top, bottom);
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= radius * radius) return;
  if (distanceSq > 0.0001) {
    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    point.x += dx / distance * push;
    point.y += dy / distance * push;
    return;
  }
  const options = [
    { axis: "x", delta: left - radius - point.x },
    { axis: "x", delta: right + radius - point.x },
    { axis: "y", delta: top - radius - point.y },
    { axis: "y", delta: bottom + radius - point.y },
  ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  point[options[0].axis] += options[0].delta;
}

function pushCircleOutOfCircle(point, radius, circle) {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  const minimum = radius + circle.r;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= minimum * minimum) return;
  if (distanceSq > 0.0001) {
    const distance = Math.sqrt(distanceSq);
    const push = minimum - distance;
    point.x += dx / distance * push;
    point.y += dy / distance * push;
    return;
  }
  point.x += minimum;
}

function entitiesNearDoor(door, radius) {
  if (distSq(state.lobby.player.x, state.lobby.player.y, door.x, door.y) <= radius * radius) return true;
  if (Object.values(state.lobby.npcs).some((npc) => distSq(npc.x, npc.y, door.x, door.y) <= radius * radius)) return true;
  const pet = state.lobby.pet;
  return Boolean(pet && distSq(pet.x, pet.y, door.x, door.y) <= radius * radius);
}

function doorBlockingSegment(x1, y1, x2, y2) {
  return LOBBY_DOORS.find((door) => {
    const range = 95;
    return distanceToSegment(door.x, door.y, x1, y1, x2, y2) < range
      && distSq(x1, y1, door.x, door.y) < 190 * 190;
  }) || null;
}

function npcAvoidance(id, x, y) {
  let ax = 0;
  let ay = 0;
  for (const [otherId, other] of Object.entries(state.lobby.npcs)) {
    if (otherId === id) continue;
    const dx = x - other.x;
    const dy = y - other.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > 58 * 58) continue;
    const distance = Math.max(0.01, Math.sqrt(distanceSq));
    if (distanceSq <= 0.01) {
      const angle = (hashString(`${id}:${otherId}`) % 628) / 100;
      ax += Math.cos(angle) * 96;
      ay += Math.sin(angle) * 96;
      continue;
    }
    const force = (58 - distance) * 1.8;
    ax += dx / distance * force;
    ay += dy / distance * force;
  }
  const pet = state.lobby.pet;
  if (pet) {
    const dx = x - pet.x;
    const dy = y - pet.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.01 && distance < 48) {
      ax += dx / distance * (48 - distance) * 1.8;
      ay += dy / distance * (48 - distance) * 1.8;
    }
  }
  const playerDx = x - state.lobby.player.x;
  const playerDy = y - state.lobby.player.y;
  const playerDistance = Math.hypot(playerDx, playerDy);
  if (playerDistance > 0.01 && playerDistance < 52) {
    ax += playerDx / playerDistance * (52 - playerDistance) * 2.2;
    ay += playerDy / playerDistance * (52 - playerDistance) * 2.2;
  }
  return { x: ax, y: ay };
}

function mobileAgentAvoidance(id, x, y) {
  let ax = 0;
  let ay = 0;
  for (const [otherId, other] of Object.entries(state.lobby.npcs)) {
    const dx = x - other.x;
    const dy = y - other.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.01 && distance < 54) {
      ax += dx / distance * (54 - distance) * 2;
      ay += dy / distance * (54 - distance) * 2;
    } else if (distance <= 0.01) {
      const angle = (hashString(`${id}:${otherId}`) % 628) / 100;
      ax += Math.cos(angle) * 90;
      ay += Math.sin(angle) * 90;
    }
  }
  return { x: ax, y: ay };
}

function nearestNavNode(x, y) {
  let nearest = NAV_NODES[0];
  let best = Infinity;
  for (const node of NAV_NODES) {
    const distance = distSq(x, y, node.x, node.y);
    if (distance < best) {
      best = distance;
      nearest = node;
    }
  }
  return nearest;
}

function nearestNpcTo(id, radius) {
  const runtime = state.lobby.npcs[id];
  if (!runtime) return null;
  return LOBBY_NPCS.find((npc) => {
    const other = state.lobby.npcs[npc.id];
    return npc.id !== id && other && distSq(runtime.x, runtime.y, other.x, other.y) <= radius * radius;
  }) || null;
}

function npcHint(npc, runtime) {
  if (runtime.mode === "social") return `正在与 ${LOBBY_NPCS.find((entry) => entry.id === runtime.partnerId)?.name || "船员"} 交流`;
  if (runtime.mode === "travel" || runtime.mode === "waitDoor") return "叫住并交谈";
  return `与${npc.name}交谈`;
}

function socialLineFor(npc) {
  const lines = SOCIAL_LINES[npc.personality] || ["航行一切正常。"];
  return lines[Math.floor((state.lobby.shipTime * 0.17 + hashString(npc.id)) % lines.length)];
}

function nodeDistance(a, b) {
  const first = NAV_BY_ID.get(a);
  const second = NAV_BY_ID.get(b);
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : Infinity;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.001) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

function lerpAngle(current, target, amount) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function weaponColor(id) {
  return {
    arc: "#42e8ff", ice: "#9ff4ff", missile: "#ffb347", boomerang: "#ff65d8",
    drone: "#77ff8a", prism_railgun: "#7df9ff", void_singularity: "#8b5cf6",
    tesla_mine_chain: "#42e8ff", starfall_scepter: "#ffd166", phase_needler: "#b48cff",
    echo_tuning_fork: "#7dfcff", rift_loom: "#9d7cff",
  }[id] || "#42e8ff";
}
