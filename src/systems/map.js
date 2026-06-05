import { WORLD_SIZE, TAU } from "../constants.js";
import { state } from "../state.js";
import { hexToRgba, mulberry32 } from "../utils.js";

const STATIC_CACHE_SCALE = 0.5;
const PROP_LAYER_FLOOR = "floor";
const PROP_LAYER_PROP = "prop";

const KEY_PROP_KINDS = new Set([
  "reactorCore",
  "cargoLift",
  "commandConsole",
  "containmentChamber",
  "cryoArray",
  "serverWall",
  "largeGenerator",
  "leakingPipeVent",
  "flickerBeacon",
]);

const RECTANGULAR_PROP_KINDS = new Set([
  "labBench",
  "serverCabinet",
  "containmentChamber",
  "cryoArray",
  "observationWindow",
  "largeGenerator",
  "commandConsole",
  "serverWall",
  "cargoLift",
  "deconGate",
  "terminal",
  "brokenRack",
  "crateStack",
  "fallenMonitor",
  "surgicalTray",
  "hazardBarrel",
  "looseCanister",
  "brokenRobotArm",
  "leakingPipeVent",
  "flickerBeacon",
  "securityCameraShell",
  "wallPanelPatch",
  "sampleTray",
  "coolantValve",
  "burntKeyboard",
  "tornSealCrate",
  "energyNodeBase",
]);

const LAB_PALETTE = {
  base: "#071018",
  dark: "#03070d",
  floor: ["#101922", "#121d26", "#15222b", "#0e171f"],
  roomFloor: ["#15212a", "#172630", "#1a2a34", "#111c24"],
  corridor: ["#0f1821", "#111d26", "#14232d"],
  line: "#7dd3fc",
  accent: ["#7dd3fc", "#72ffb4", "#ffd166", "#ff7a1a"],
  warning: "#ffd166",
  rust: "#9a4f2f",
};

export function generateMap() {
  const rng = mulberry32(Math.floor(Math.random() * 2147483647));
  const half = WORLD_SIZE / 2;
  const tileSize = 96;
  const rooms = createLabRooms(rng, half);
  const corridors = createCorridors(rooms);
  const tiles = [];
  const props = [];
  const energyLines = [];
  const floorDecals = [];
  const cableRuns = [];
  const fogBanks = [];

  for (const room of rooms) addRoomTiles(rng, room, tiles, floorDecals, props, energyLines, cableRuns, fogBanks);
  for (const corridor of corridors) addCorridorTiles(rng, corridor, tiles, floorDecals, props, energyLines, cableRuns);
  addPerimeterServiceLines(rng, half, props, cableRuns, energyLines, fogBanks);
  addRandomWear(rng, tiles, floorDecals);
  const doors = createDoorways(rooms, corridors);
  addDoorwayDecals(rng, doors, floorDecals);

  const map = { tileSize, palette: LAB_PALETTE, rooms, corridors, doors, tiles, props, energyLines, floorDecals, cableRuns, fogBanks };
  finalizeMapLayers(map);
  return map;
}

export function drawMap(ctx, map, camX, camY, viewW, viewH, time) {
  if (!map) return;
  ensureStaticMapCache(map);
  drawStaticMapCache(ctx, map, camX, camY, viewW, viewH);
  drawDynamicAtmosphere(ctx, map, camX, camY, viewW, viewH, time);
  drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time);
  drawDynamicProps(ctx, map, camX, camY, viewW, viewH, time);
  drawFog(ctx, map, camX, camY, viewW, viewH, time);
}

function createLabRooms(rng, half) {
  const rooms = [
    { id: "core", x: -560, y: -420, w: 1120, h: 840, zone: "reactor" },
    { id: "west-lab", x: -2050, y: -920, w: 960, h: 720, zone: "bio" },
    { id: "east-lab", x: 1110, y: -940, w: 980, h: 740, zone: "cryo" },
    { id: "storage", x: -2050, y: 560, w: 1020, h: 740, zone: "storage" },
    { id: "control", x: 1050, y: 580, w: 1020, h: 700, zone: "control" },
    { id: "north-hall", x: -680, y: -1910, w: 1360, h: 520, zone: "service" },
    { id: "south-hall", x: -720, y: 1410, w: 1440, h: 540, zone: "service" },
  ];
  for (let i = 0; i < 6; i++) {
    const w = 520 + Math.floor(rng() * 4) * 96;
    const h = 420 + Math.floor(rng() * 3) * 96;
    const side = i % 4;
    const x = side < 2 ? (side === 0 ? -half + 230 + rng() * 420 : half - 230 - w - rng() * 420) : -w / 2 + (rng() - 0.5) * 860;
    const y = side >= 2 ? (side === 2 ? -half + 260 + rng() * 360 : half - 260 - h - rng() * 360) : -h / 2 + (rng() - 0.5) * 920;
    rooms.push({ id: `annex-${i}`, x, y, w, h, zone: i % 2 ? "service" : "storage" });
  }
  return rooms;
}

function createCorridors(rooms) {
  const core = rooms[0];
  const cx = core.x + core.w / 2;
  const cy = core.y + core.h / 2;
  const corridors = [
    { x: -WORLD_SIZE / 2, y: -160, w: WORLD_SIZE, h: 320, axis: "h" },
    { x: -170, y: -WORLD_SIZE / 2, w: 340, h: WORLD_SIZE, axis: "v" },
  ];
  for (const room of rooms.slice(1)) {
    const rx = room.x + room.w / 2;
    const ry = room.y + room.h / 2;
    corridors.push({ x: Math.min(cx, rx), y: ry - 90, w: Math.abs(cx - rx), h: 180, axis: "h" });
    corridors.push({ x: cx - 90, y: Math.min(cy, ry), w: 180, h: Math.abs(cy - ry), axis: "v" });
  }
  return corridors.filter((c) => c.w > 0 && c.h > 0);
}

function createDoorways(rooms, corridors) {
  const doors = [];
  for (const room of rooms) {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    for (const corridor of corridors) {
      const vertical = corridor.axis === "v";
      if (vertical) {
        const x = corridor.x + corridor.w / 2;
        if (x < room.x || x > room.x + room.w) continue;
        if (Math.abs(corridor.y - (room.y + room.h)) < 6 || Math.abs(corridor.y + corridor.h - room.y) < 6 || (cy >= corridor.y && cy <= corridor.y + corridor.h)) {
          doors.push({ x, y: cy < corridor.y ? room.y + room.h : room.y, horizontal: true, w: 146, zone: room.zone });
        }
      } else {
        const y = corridor.y + corridor.h / 2;
        if (y < room.y || y > room.y + room.h) continue;
        if (Math.abs(corridor.x - (room.x + room.w)) < 6 || Math.abs(corridor.x + corridor.w - room.x) < 6 || (cx >= corridor.x && cx <= corridor.x + corridor.w)) {
          doors.push({ x: cx < corridor.x ? room.x + room.w : room.x, y, horizontal: false, w: 146, zone: room.zone });
        }
      }
    }
  }
  const seen = new Set();
  return doors.filter((d) => {
    const key = `${Math.round(d.x / 24)},${Math.round(d.y / 24)},${d.horizontal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 42);
}

function addDoorwayDecals(rng, doors, decals) {
  for (const door of doors) {
    if (rng() > 0.62) continue;
    decals.push(createDecal(rng, door.x, door.y, "airlockSeal", door.zone === "bio" ? "#72ffb4" : door.zone === "cryo" ? "#7dd3fc" : door.zone === "control" ? "#ffd166" : "#9aa7b4", door.horizontal ? 0 : Math.PI / 2, door.w + 38, 62));
  }
}

function addRoomTiles(rng, room, tiles, decals, props, energyLines, cables, fogBanks) {
  let y = room.y;
  while (y < room.y + room.h) {
    const h = pickTileSpan(rng, room.zone);
    let x = room.x;
    while (x < room.x + room.w) {
      const w = pickTileSpan(rng, room.zone);
      const tw = Math.min(w, room.x + room.w - x);
      const th = Math.min(h, room.y + room.h - y);
      tiles.push(createLabTile(rng, x, y, tw, th, room.zone, false));
      maybeAddRoomDecal(rng, x, y, tw, th, room.zone, decals);
      x += tw;
    }
    y += h;
  }

  addFixedRoomProps(rng, room, props, decals, energyLines, cables, fogBanks);
}

function addCorridorTiles(rng, corridor, tiles, decals, props, energyLines, cables) {
  const step = 128;
  for (let y = corridor.y; y < corridor.y + corridor.h; y += step) {
    for (let x = corridor.x; x < corridor.x + corridor.w; x += step) {
      const tw = Math.min(step, corridor.x + corridor.w - x);
      const th = Math.min(step, corridor.y + corridor.h - y);
      tiles.push(createLabTile(rng, x, y, tw, th, "corridor", true));
      if (rng() < 0.22) decals.push(createDecal(rng, x + tw / 2, y + th / 2, "arrow", LAB_PALETTE.line, corridor.axis === "h" ? 0 : Math.PI / 2));
      if (rng() < 0.12) decals.push(createDecal(rng, x + tw * 0.5, y + th * 0.5, "grate", LAB_PALETTE.line, corridor.axis === "h" ? 0 : Math.PI / 2));
    }
  }
  for (let t = 0; t < 1; t += 0.18) {
    const x = corridor.x + corridor.w * t;
    const y = corridor.y + corridor.h * t;
    if (rng() < 0.48) cables.push(createCable(rng, x + corridor.w * 0.08, y + corridor.h * 0.08, corridor.axis === "h", LAB_PALETTE.line, 180 + rng() * 260));
  }
  if (rng() < 0.65) {
    const y = corridor.y + corridor.h * (corridor.axis === "h" ? 0.18 : 0.5);
    const x = corridor.x + corridor.w * (corridor.axis === "v" ? 0.18 : 0.5);
    energyLines.push(createEnergyLine(rng, x, y, corridor.axis === "h", corridor.axis === "h" ? corridor.w * 0.72 : corridor.h * 0.72, LAB_PALETTE.line));
  }
  if (rng() < 0.45) props.push(createProp(rng, corridor.x + corridor.w * rng(), corridor.y + corridor.h * rng(), "wallLight", 18, LAB_PALETTE.line));
}

function pickTileSpan(rng, zone) {
  const sizes = zone === "corridor" ? [96, 128] : [64, 96, 128, 160, 192];
  return sizes[Math.floor(rng() * sizes.length)];
}

function createLabTile(rng, x, y, w, h, zone, corridor) {
  const floor = corridor ? LAB_PALETTE.corridor : zone === "reactor" ? LAB_PALETTE.roomFloor : LAB_PALETTE.floor;
  const accent = zone === "bio" ? "#72ffb4" : zone === "cryo" ? "#7dd3fc" : zone === "control" ? "#ffd166" : LAB_PALETTE.accent[Math.floor(rng() * LAB_PALETTE.accent.length)];
  const material = pickTileMaterial(rng, zone, corridor);
  return {
    x, y, w, h, zone,
    material,
    color: floor[Math.floor(rng() * floor.length)],
    accent,
    panel: rng() < (corridor ? 0.86 : 0.76),
    grate: material === "utilityGrate" || rng() < (zone === "service" ? 0.22 : 0.06),
    crack: rng() < 0.2,
    stain: rng() < 0.32,
    scuff: rng(),
    seam: rng() < 0.72,
    glow: rng() < (corridor ? 0.08 : 0.045) ? accent : null,
    warning: rng() < (zone === "reactor" ? 0.2 : 0.08),
    rot: Math.floor(rng() * 4),
    phase: rng() * TAU,
    wear: rng(),
    detailKind: Math.floor(rng() * 6),
  };
}

function pickTileMaterial(rng, zone, corridor) {
  if (corridor) return rng() < 0.55 ? "accessPlate" : "utilityGrate";
  if (zone === "service") return rng() < 0.5 ? "utilityGrate" : "accessPlate";
  if (zone === "reactor") return rng() < 0.5 ? "sealedPanel" : "labComposite";
  if (zone === "storage") return rng() < 0.42 ? "accessPlate" : "sealedPanel";
  if (zone === "bio" || zone === "cryo") return rng() < 0.58 ? "labComposite" : "sealedPanel";
  return rng() < 0.48 ? "sealedPanel" : "accessPlate";
}

function maybeAddRoomDecal(rng, x, y, w, h, zone, decals) {
  if (rng() < 0.08) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "scorch", LAB_PALETTE.rust, rng() * TAU, w, h));
  if (rng() < 0.045) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "spill", zone === "bio" ? "#72ffb4" : "#7dd3fc", rng() * TAU, w, h));
  if (rng() < 0.035) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "hatch", LAB_PALETTE.line, rng() * TAU, w, h));
  if (zone === "service" && rng() < 0.08) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "grate", LAB_PALETTE.line, rng() * TAU, w, h));
  if ((zone === "bio" || zone === "cryo") && rng() < 0.035) decals.push(createDecal(rng, x + w * 0.48, y + h * 0.54, "footprintTrail", zone === "bio" ? "#72ffb4" : "#d9fbff", rng() * TAU, Math.min(120, w * 0.9), Math.min(54, h * 0.52)));
  if ((zone === "bio" || zone === "cryo" || zone === "control") && rng() < 0.032) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "sampleLabel", zone === "control" ? "#ffd166" : LAB_PALETTE.line, rng() * TAU, Math.min(92, w * 0.72), Math.min(38, h * 0.42)));
  if ((zone === "bio" || zone === "cryo" || zone === "reactor") && rng() < 0.03) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.52, "chemicalResidue", zone === "reactor" ? "#ff7a1a" : zone === "bio" ? "#72ffb4" : "#7dd3fc", rng() * TAU, Math.min(110, w * 0.82), Math.min(44, h * 0.46)));
  if ((zone === "service" || zone === "control") && rng() < 0.035) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "pipeShadowBand", "#000000", rng() < 0.5 ? 0 : Math.PI / 2, Math.min(150, w), 26));
}

function addFixedRoomProps(rng, room, props, decals, energyLines, cables, fogBanks) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const accent = room.zone === "bio" ? "#72ffb4" : room.zone === "cryo" ? "#7dd3fc" : room.zone === "control" ? "#ffd166" : LAB_PALETTE.line;
  props.push(createProp(rng, room.x + 42, room.y + 42, "wallLight", 18, accent, 0));
  props.push(createProp(rng, room.x + room.w - 42, room.y + room.h - 42, "wallLight", 18, accent, Math.PI));
  if (rng() < 0.58) props.push(createProp(rng, room.x + room.w - 74, room.y + 78, "securityCameraShell", 18 + rng() * 5, "#9aa7b4", Math.PI * 0.2));
  if (rng() < 0.62) props.push(createProp(rng, room.x + 82, room.y + room.h - 68, "wallPanelPatch", 22 + rng() * 7, accent, 0));

  if (room.zone === "reactor") {
    props.push(createProp(rng, cx, cy, "reactorCore", 70, "#7dd3fc"));
    props.push(createProp(rng, cx, room.y + 118, "largeGenerator", 58 + rng() * 12, "#7dd3fc", 0));
    props.push(createProp(rng, cx, room.y + room.h - 118, "largeGenerator", 58 + rng() * 12, "#72ffb4", Math.PI));
    props.push(createProp(rng, room.x + 120, cy, "overheadLightRig", 44, "#7dd3fc", Math.PI / 2));
    props.push(createProp(rng, room.x + room.w - 120, cy, "overheadLightRig", 44, "#7dd3fc", Math.PI / 2));
    decals.push(createDecal(rng, cx, cy, "reactorRing", "#7dd3fc", 0, 260, 260));
    for (let i = 0; i < 4; i++) energyLines.push(createEnergyLine(rng, cx, cy, i % 2 === 0, 360 + i * 80, i % 2 ? "#72ffb4" : "#7dd3fc"));
    for (let i = 0; i < 4; i++) props.push(createProp(rng, cx + Math.cos(i * TAU / 4) * 260, cy + Math.sin(i * TAU / 4) * 190, "serverCabinet", 30 + rng() * 8, "#7dd3fc", i % 2 ? Math.PI / 2 : 0));
  } else if (room.zone === "bio" || room.zone === "cryo") {
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) props.push(createProp(rng, room.x + 150 + rng() * (room.w - 300), room.y + 120 + rng() * (room.h - 240), room.zone === "bio" ? "specimenTank" : "cryoPod", 34 + rng() * 18, accent));
    for (let i = 0; i < 3; i++) props.push(createProp(rng, room.x + 120 + rng() * (room.w - 240), room.y + 110 + rng() * (room.h - 220), "labBench", 32 + rng() * 12, accent, rng() < 0.5 ? 0 : Math.PI / 2));
    for (let i = 0; i < 2; i++) props.push(createProp(rng, room.x + 110 + rng() * (room.w - 220), room.y + 110 + rng() * (room.h - 220), room.zone === "bio" ? "bioCanister" : "coolantTank", 24 + rng() * 10, accent));
    props.push(createProp(rng, room.x + room.w * 0.5, room.y + 92, room.zone === "bio" ? "containmentChamber" : "cryoArray", 54 + rng() * 12, accent, 0));
    props.push(createProp(rng, room.x + 90, room.y + room.h * 0.55, "observationWindow", 56 + rng() * 10, accent, Math.PI / 2));
    props.push(createProp(rng, room.x + room.w - 90, room.y + room.h * 0.45, "deconGate", 46 + rng() * 8, accent, Math.PI / 2));
    if (rng() < 0.75) props.push(createProp(rng, room.x + 100 + rng() * (room.w - 200), room.y + 100 + rng() * (room.h - 200), "brokenGlass", 26 + rng() * 18, "#d9fbff", rng() * TAU));
    if (rng() < 0.8) fogBanks.push(createFog(room.x + room.w * rng(), room.y + room.h * rng(), 180 + rng() * 180, 70 + rng() * 70, accent, 0.035));
  } else if (room.zone === "control") {
    for (let i = 0; i < 5; i++) props.push(createProp(rng, room.x + 130 + i * 160, room.y + 120 + rng() * 360, "terminal", 28 + rng() * 10, i % 2 ? "#72ffb4" : "#ffd166"));
    for (let i = 0; i < 4; i++) props.push(createProp(rng, room.x + 120 + rng() * (room.w - 240), room.y + 90 + rng() * (room.h - 180), "serverCabinet", 34 + rng() * 10, i % 2 ? "#7dd3fc" : "#72ffb4", rng() < 0.5 ? 0 : Math.PI / 2));
    for (let i = 0; i < 3; i++) props.push(createProp(rng, room.x + 80 + rng() * (room.w - 160), room.y + 70 + rng() * (room.h - 140), "warningSign", 20 + rng() * 8, "#ffd166", rng() < 0.5 ? 0 : Math.PI / 2));
    for (let i = 0; i < 3; i++) props.push(createProp(rng, room.x + 90 + rng() * (room.w - 180), room.y + 80 + rng() * (room.h - 160), "hangingCable", 30 + rng() * 18, "#64748b", rng() * TAU));
    props.push(createProp(rng, cx, room.y + 96, "commandConsole", 58 + rng() * 10, "#ffd166", 0));
    props.push(createProp(rng, cx, room.y + room.h - 96, "observationWindow", 64 + rng() * 10, "#7dd3fc", 0));
    props.push(createProp(rng, room.x + 88, cy, "serverWall", 58 + rng() * 12, "#72ffb4", Math.PI / 2));
  } else if (room.zone === "storage") {
    for (let i = 0; i < 6; i++) props.push(createProp(rng, room.x + 80 + rng() * (room.w - 160), room.y + 80 + rng() * (room.h - 160), rng() < 0.55 ? "brokenRack" : "crateStack", 28 + rng() * 20, accent));
    for (let i = 0; i < 3; i++) props.push(createProp(rng, room.x + 90 + rng() * (room.w - 180), room.y + 90 + rng() * (room.h - 180), rng() < 0.5 ? "warningSign" : "hangingCable", 24 + rng() * 12, rng() < 0.5 ? "#ffd166" : "#64748b", rng() * TAU));
    props.push(createProp(rng, cx, cy, "cargoLift", 76 + rng() * 16, "#ffd166", rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createProp(rng, room.x + room.w - 105, room.y + 120, "largeGenerator", 48 + rng() * 10, "#ff7a1a", Math.PI / 2));
  } else {
    props.push(createProp(rng, cx + (rng() - 0.5) * room.w * 0.5, cy + (rng() - 0.5) * room.h * 0.5, "ventPipe", 36 + rng() * 24, accent, rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createProp(rng, cx + (rng() - 0.5) * room.w * 0.5, cy + (rng() - 0.5) * room.h * 0.5, "ceilingFanShadow", 54 + rng() * 22, "#9aa7b4", rng() * TAU));
    props.push(createProp(rng, room.x + 80 + rng() * (room.w - 160), room.y + 80 + rng() * (room.h - 160), "hangingCable", 32 + rng() * 16, "#64748b", rng() * TAU));
    props.push(createProp(rng, cx, room.y + 78, "overheadLightRig", 44 + rng() * 10, accent, 0));
    props.push(createProp(rng, room.x + room.w - 78, cy, "deconGate", 42 + rng() * 8, accent, Math.PI / 2));
  }

  addAbandonedLabDetails(rng, room, props, decals, fogBanks, accent);

  if (rng() < 0.7) cables.push(createCable(rng, room.x + 60, cy, true, accent, room.w - 120));
  if (rng() < 0.55) cables.push(createCable(rng, cx, room.y + 60, false, accent, room.h - 120));
}

function addAbandonedLabDetails(rng, room, props, decals, fogBanks, accent) {
  const left = room.x + room.w * 0.22;
  const right = room.x + room.w * 0.78;
  const top = room.y + room.h * 0.24;
  const mid = room.y + room.h * 0.52;
  const bottom = room.y + room.h * 0.76;

  if (room.zone === "bio" || room.zone === "cryo") {
    props.push(createProp(rng, left, bottom, "looseCanister", 22 + rng() * 8, accent, rng() * TAU));
    props.push(createProp(rng, right, top, "surgicalTray", 28 + rng() * 8, "#9aa7b4", rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createProp(rng, left, top, room.zone === "bio" ? "sampleTray" : "coolantValve", 24 + rng() * 8, accent, rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createDynamicProp(rng, right, bottom, "steamLeak", 30 + rng() * 10, accent, rng() * TAU));
    props.push(createDynamicProp(rng, left + 90, top + 42, "dripValve", 20 + rng() * 7, accent, rng() * TAU));
    decals.push(createDecal(rng, left + 44, bottom + 10, "spill", accent, rng() * TAU, 80, 38));
    decals.push(createDecal(rng, right - 34, mid, "glassShards", "#d9fbff", rng() * TAU, 96, 34));
    decals.push(createDecal(rng, left + 80, mid + 32, "footprintTrail", room.zone === "bio" ? "#72ffb4" : "#d9fbff", rng() * TAU, 132, 46));
  } else if (room.zone === "control") {
    props.push(createProp(rng, left, bottom, "fallenMonitor", 30 + rng() * 8, "#7dd3fc", -0.25 + rng() * 0.5));
    props.push(createProp(rng, right, mid, "brokenRobotArm", 34 + rng() * 8, "#9aa7b4", rng() * TAU));
    props.push(createProp(rng, left + 86, top, "burntKeyboard", 24 + rng() * 7, "#ffd166", rng() * 0.5));
    props.push(createDynamicProp(rng, room.x + room.w * 0.52, bottom, "flickerBeacon", 20 + rng() * 6, "#ffd166", 0));
    props.push(createDynamicProp(rng, right - 70, top + 20, "faultyScreenStrip", 22 + rng() * 6, "#7dd3fc", 0));
    decals.push(createDecal(rng, room.x + room.w * 0.54, room.y + room.h * 0.64, "windowFrameShadow", "#000000", -0.18 + rng() * 0.36, 170, 48));
    decals.push(createDecal(rng, left + 40, bottom + 30, "sampleLabel", "#ffd166", rng() * TAU, 86, 32));
  } else if (room.zone === "storage") {
    props.push(createProp(rng, left, top, "hazardBarrel", 28 + rng() * 8, "#ff7a1a", rng() * TAU));
    props.push(createProp(rng, right, bottom, "looseCanister", 24 + rng() * 8, "#72ffb4", rng() * TAU));
    props.push(createProp(rng, right - 70, top + 36, "tornSealCrate", 30 + rng() * 8, "#ffd166", rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createDynamicProp(rng, room.x + room.w * 0.48, top, "swingingCable", 34 + rng() * 12, "#64748b", rng() * TAU));
    decals.push(createDecal(rng, left + 80, bottom - 20, "sampleLabel", "#ffd166", rng() * TAU, 92, 34));
  } else if (room.zone === "service") {
    props.push(createProp(rng, left, mid, "leakingPipeVent", 36 + rng() * 10, "#9aa7b4", rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createProp(rng, left + 78, top, "coolantValve", 24 + rng() * 8, accent, rng() < 0.5 ? 0 : Math.PI / 2));
    props.push(createDynamicProp(rng, right, top, "swingingCable", 30 + rng() * 12, "#64748b", rng() * TAU));
    props.push(createDynamicProp(rng, right, bottom, "steamLeak", 28 + rng() * 10, accent, rng() * TAU));
    props.push(createDynamicProp(rng, left + 82, mid + 60, "dripValve", 18 + rng() * 7, "#7dd3fc", rng() * TAU));
    decals.push(createDecal(rng, right - 60, mid, "pipeShadowBand", "#000000", rng() < 0.5 ? 0 : Math.PI / 2, 150, 30));
  } else if (room.zone === "reactor") {
    props.push(createProp(rng, left, bottom, "hazardBarrel", 26 + rng() * 8, "#ff7a1a", rng() * TAU));
    props.push(createProp(rng, left + 86, top, "energyNodeBase", 28 + rng() * 8, "#7dd3fc", rng() * TAU));
    props.push(createDynamicProp(rng, right, top, "flickerBeacon", 22 + rng() * 6, "#ffd166", 0));
    props.push(createDynamicProp(rng, right - 64, bottom - 28, "dripValve", 18 + rng() * 6, "#ff7a1a", rng() * TAU));
    decals.push(createDecal(rng, right - 86, mid + 20, "chemicalResidue", "#ff7a1a", rng() * TAU, 120, 44));
  } else {
    props.push(createProp(rng, left, top, "fallenMonitor", 28 + rng() * 8, accent, rng() * TAU));
    props.push(createProp(rng, right, top, "wallPanelPatch", 24 + rng() * 8, accent, 0));
    props.push(createDynamicProp(rng, right, bottom, "steamLeak", 28 + rng() * 10, accent, rng() * TAU));
    decals.push(createDecal(rng, left + 70, mid, "pipeShadowBand", "#000000", rng() < 0.5 ? 0 : Math.PI / 2, 150, 28));
  }

  if (rng() < 0.55) {
    fogBanks.push(createFog(room.x + room.w * (0.25 + rng() * 0.5), room.y + room.h * (0.25 + rng() * 0.5), 120 + rng() * 110, 42 + rng() * 38, accent, 0.018));
  }
}

function addPerimeterServiceLines(rng, half, props, cables, energyLines, fogBanks) {
  for (let i = 0; i < 16; i++) {
    const horizontal = i % 2 === 0;
    const side = i % 4;
    const x = side === 1 ? half - 120 : side === 3 ? -half + 120 : -half + 300 + rng() * (WORLD_SIZE - 600);
    const y = side === 0 ? -half + 120 : side === 2 ? half - 120 : -half + 300 + rng() * (WORLD_SIZE - 600);
    props.push(createProp(rng, x, y, i % 3 === 0 ? "ventPipe" : "wallLight", 24 + rng() * 18, i % 3 ? "#7dd3fc" : "#9aa7b4", horizontal ? 0 : Math.PI / 2));
    if (rng() < 0.72) cables.push(createCable(rng, x, y, horizontal, "#64748b", 180 + rng() * 280));
  }
  for (let i = 0; i < 8; i++) {
    const horizontal = i % 2 === 0;
    const x = -half + 520 + rng() * (WORLD_SIZE - 1040);
    const y = -half + 520 + rng() * (WORLD_SIZE - 1040);
    props.push(createProp(rng, x, y, horizontal ? "overheadLightRig" : "serverWall", 40 + rng() * 12, horizontal ? "#7dd3fc" : "#72ffb4", horizontal ? 0 : Math.PI / 2));
  }
  for (let i = 0; i < 10; i++) {
    const horizontal = rng() < 0.5;
    energyLines.push(createEnergyLine(rng, -half + 420 + rng() * (WORLD_SIZE - 840), -half + 420 + rng() * (WORLD_SIZE - 840), horizontal, 260 + rng() * 480, rng() < 0.6 ? "#7dd3fc" : "#72ffb4"));
  }
  for (let i = 0; i < 14; i++) {
    fogBanks.push(createFog(-half + rng() * WORLD_SIZE, -half + rng() * WORLD_SIZE, 160 + rng() * 260, 60 + rng() * 110, rng() < 0.5 ? "#7dd3fc" : "#9aa7b4", 0.018 + rng() * 0.024));
  }
}

function addRandomWear(rng, tiles, decals) {
  for (let i = 0; i < Math.min(180, tiles.length * 0.12); i++) {
    const tile = tiles[Math.floor(rng() * tiles.length)];
    decals.push(createDecal(rng, tile.x + rng() * tile.w, tile.y + rng() * tile.h, rng() < 0.55 ? "scratch" : "scorch", rng() < 0.5 ? "#64748b" : LAB_PALETTE.rust, rng() * TAU, 32 + rng() * 70, 10 + rng() * 34));
  }
}

function createProp(rng, x, y, kind, size, color, rot = rng() * TAU) {
  return { x, y, kind, size, color, alt: LAB_PALETTE.accent[Math.floor(rng() * LAB_PALETTE.accent.length)], phase: rng() * TAU, rot };
}

function createDynamicProp(rng, x, y, kind, size, color, rot = rng() * TAU) {
  return { ...createProp(rng, x, y, kind, size, color, rot), dynamicDecor: true };
}

function createDecal(rng, x, y, kind, color, rot = 0, w = 70, h = 40) {
  return { x, y, kind, w: Math.max(18, w * (0.7 + rng() * 0.5)), h: Math.max(12, h * (0.75 + rng() * 0.5)), color, phase: rng() * TAU, rot };
}

function createCable(rng, x, y, horizontal, color, length) {
  return { x, y, horizontal, color, length, bend: rng() < 0.42, phase: rng() * TAU, broken: rng() < 0.18 };
}

function createEnergyLine(rng, x, y, horizontal, length, color) {
  return {
    x1: x - (horizontal ? length / 2 : 0),
    y1: y - (horizontal ? 0 : length / 2),
    x2: x + (horizontal ? length / 2 : 0),
    y2: y + (horizontal ? 0 : length / 2),
    color,
    phase: rng() * TAU,
  };
}

function createFog(x, y, rx, ry, color, alpha) {
  return { x, y, rx, ry, color, alpha, phase: Math.random() * TAU };
}

function finalizeMapLayers(map) {
  const floorFootprints = [];
  map.floorDecals = filterFloorItems(map.floorDecals || [], floorFootprints, getFloorDecalPriority, getFloorFootprint);
  map.cableRuns = filterFloorItems(map.cableRuns || [], floorFootprints, () => 2, getCableFootprint);
  map.props = filterPropItems(map.props || []);
}

function filterFloorItems(items, acceptedFootprints, priorityFn, footprintFn) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => priorityFn(b.item) - priorityFn(a.item) || a.index - b.index)
    .reduce((accepted, entry) => {
      entry.item.layer = PROP_LAYER_FLOOR;
      const footprint = footprintFn(entry.item);
      if (!footprint || acceptedFootprints.some((other) => footprintsOverlap(footprint, other, 8))) return accepted;
      acceptedFootprints.push(footprint);
      accepted.push(entry.item);
      return accepted;
    }, []);
}

function filterPropItems(props) {
  const acceptedFootprints = [];
  return [...props]
    .map((prop, index) => ({ prop: enrichPropLayer(prop), index }))
    .sort((a, b) => getPropPriority(b.prop) - getPropPriority(a.prop) || a.index - b.index)
    .reduce((accepted, entry) => {
      const footprint = getPropFootprint(entry.prop);
      if (!footprint || acceptedFootprints.some((other) => footprintsOverlap(footprint, other, 12))) return accepted;
      acceptedFootprints.push(footprint);
      accepted.push(entry.prop);
      return accepted;
    }, [])
    .sort(comparePropsForDraw);
}

function enrichPropLayer(prop) {
  prop.layer = PROP_LAYER_PROP;
  prop.height = getPropHeight(prop);
  prop.sortOffset = getPropSortOffset(prop);
  return prop;
}

function getFloorDecalPriority(item) {
  if (item.kind === "reactorRing") return 6;
  if (item.kind === "airlockSeal") return 6;
  if (item.kind === "hatch" || item.kind === "grate") return 5;
  if (item.kind === "arrow") return 4;
  if (item.kind === "footprintTrail" || item.kind === "windowFrameShadow" || item.kind === "pipeShadowBand") return 4;
  if (item.kind === "spill") return 3;
  if (item.kind === "glassShards" || item.kind === "chemicalResidue" || item.kind === "sampleLabel") return 3;
  if (item.kind === "scorch") return 2;
  return 1;
}

function getPropPriority(prop) {
  if (KEY_PROP_KINDS.has(prop.kind)) return 5;
  if (prop.kind === "wallLight" || prop.kind === "overheadLightRig") return 4;
  if (prop.dynamicDecor) return 4;
  if (prop.kind === "fallenMonitor" || prop.kind === "surgicalTray" || prop.kind === "hazardBarrel" || prop.kind === "looseCanister" || prop.kind === "brokenRobotArm" || prop.kind === "securityCameraShell" || prop.kind === "wallPanelPatch" || prop.kind === "sampleTray" || prop.kind === "coolantValve" || prop.kind === "burntKeyboard" || prop.kind === "tornSealCrate" || prop.kind === "energyNodeBase") return 3;
  if (isStaticProp(prop)) return 3;
  return 1;
}

function getFloorFootprint(item) {
  return {
    x: item.x - item.w * 0.5,
    y: item.y - item.h * 0.5,
    w: item.w,
    h: item.h,
  };
}

function getCableFootprint(cable) {
  const half = cable.length * 0.5;
  const bendPad = cable.bend ? 42 : 0;
  return cable.horizontal
    ? { x: cable.x - half - 8, y: cable.y - 9, w: cable.length + 16, h: 18 + bendPad }
    : { x: cable.x - 9, y: cable.y - half - 8, w: 18 + bendPad, h: cable.length + 16 };
}

function getPropFootprint(prop) {
  const rawDims = getPropFootprintSize(prop);
  const minSpan = prop.size * 2;
  const dims = {
    w: Math.max(rawDims.w, minSpan),
    h: Math.max(rawDims.h, minSpan),
  };
  const c = Math.abs(Math.cos(prop.rot || 0));
  const s = Math.abs(Math.sin(prop.rot || 0));
  const w = dims.w * c + dims.h * s;
  const h = dims.w * s + dims.h * c;
  return { x: prop.x - w * 0.5, y: prop.y - h * 0.5, w, h };
}

function getPropFootprintSize(prop) {
  const s = prop.size;
  if (prop.kind === "reactorCore") return { w: s * 2.1, h: s * 2.1 };
  if (prop.kind === "labBench") return { w: s * 2.9, h: s * 1.22 };
  if (prop.kind === "containmentChamber" || prop.kind === "cryoArray") return { w: s * 3.08, h: s * 1.62 };
  if (prop.kind === "observationWindow") return { w: s * 3.25, h: s * 1.08 };
  if (prop.kind === "largeGenerator") return { w: s * 2.55, h: s * 1.42 };
  if (prop.kind === "commandConsole") return { w: s * 3.25, h: s * 1.18 };
  if (prop.kind === "serverWall") return { w: s * 1.62, h: s * 3.25 };
  if (prop.kind === "cargoLift") return { w: s * 2.55, h: s * 1.9 };
  if (prop.kind === "deconGate") return { w: s * 1.36, h: s * 2.88 };
  if (prop.kind === "overheadLightRig") return { w: s * 3.35, h: s * 0.72 };
  if (prop.kind === "wallLight") return { w: s * 2.6, h: s * 0.86 };
  if (prop.kind === "terminal") return { w: s * 1.95, h: s * 1.26 };
  if (prop.kind === "serverCabinet") return { w: s * 1.36, h: s * 2.56 };
  if (prop.kind === "specimenTank" || prop.kind === "cryoPod") return { w: s * 1.16, h: s * 1.9 };
  if (prop.kind === "bioCanister" || prop.kind === "coolantTank") return { w: s * 1.14, h: s * 1.86 };
  if (prop.kind === "hangingCable") return { w: s * 0.78, h: s * 1.9 };
  if (prop.kind === "ventPipe") return { w: s * 2.9, h: s * 0.72 };
  if (prop.kind === "ceilingFanShadow") return { w: s * 1.78, h: s * 1.78 };
  if (prop.kind === "brokenGlass") return { w: s * 2.3, h: s * 0.9 };
  if (prop.kind === "warningSign") return { w: s * 2.2, h: s * 1.1 };
  if (prop.kind === "fallenMonitor") return { w: s * 2.2, h: s * 1.05 };
  if (prop.kind === "surgicalTray") return { w: s * 2.0, h: s * 1.1 };
  if (prop.kind === "hazardBarrel" || prop.kind === "looseCanister") return { w: s * 1.25, h: s * 1.25 };
  if (prop.kind === "brokenRobotArm") return { w: s * 2.15, h: s * 1.25 };
  if (prop.kind === "leakingPipeVent") return { w: s * 2.45, h: s * 0.95 };
  if (prop.kind === "steamLeak") return { w: s * 1.45, h: s * 1.05 };
  if (prop.kind === "swingingCable") return { w: s * 0.95, h: s * 2.25 };
  if (prop.kind === "flickerBeacon") return { w: s * 1.15, h: s * 1.15 };
  if (prop.kind === "securityCameraShell") return { w: s * 1.65, h: s * 1.05 };
  if (prop.kind === "wallPanelPatch") return { w: s * 1.8, h: s * 1.28 };
  if (prop.kind === "sampleTray") return { w: s * 2.1, h: s * 1.1 };
  if (prop.kind === "coolantValve") return { w: s * 2.2, h: s * 0.95 };
  if (prop.kind === "burntKeyboard") return { w: s * 2.05, h: s * 0.9 };
  if (prop.kind === "tornSealCrate") return { w: s * 1.85, h: s * 1.35 };
  if (prop.kind === "energyNodeBase") return { w: s * 1.55, h: s * 1.45 };
  if (prop.kind === "dripValve") return { w: s * 1.35, h: s * 2.05 };
  if (prop.kind === "faultyScreenStrip") return { w: s * 2.0, h: s * 0.9 };
  return { w: s * 1.8, h: s * 1.2 };
}

function getPropHeight(prop) {
  if (prop.kind === "wallLight" || prop.kind === "overheadLightRig" || prop.kind === "hangingCable") return prop.size * 1.2;
  if (prop.kind === "reactorCore" || prop.kind === "serverWall") return prop.size * 1.1;
  if (prop.kind === "brokenGlass" || prop.kind === "ceilingFanShadow" || prop.kind === "cargoLift" || prop.kind === "sampleTray" || prop.kind === "burntKeyboard" || prop.kind === "energyNodeBase") return prop.size * 0.18;
  if (prop.kind === "steamLeak" || prop.kind === "dripValve" || prop.kind === "faultyScreenStrip") return prop.size * 0.1;
  if (prop.kind === "swingingCable") return prop.size * 1.25;
  if (prop.kind === "flickerBeacon") return prop.size * 0.55;
  if (prop.kind === "terminal" || prop.kind === "warningSign" || prop.kind === "securityCameraShell" || prop.kind === "wallPanelPatch" || prop.kind === "coolantValve") return prop.size * 0.46;
  return prop.size * 0.72;
}

function getPropSortOffset(prop) {
  if (prop.kind === "wallLight" || prop.kind === "overheadLightRig" || prop.kind === "hangingCable" || prop.kind === "swingingCable" || prop.kind === "securityCameraShell") return -prop.size * 0.8;
  if (prop.kind === "serverWall" || prop.kind === "observationWindow" || prop.kind === "deconGate") return -prop.size * 0.35;
  return prop.size * 0.35;
}

function footprintsOverlap(a, b, padding = 0) {
  return a.x < b.x + b.w + padding &&
    a.x + a.w + padding > b.x &&
    a.y < b.y + b.h + padding &&
    a.y + a.h + padding > b.y;
}

function comparePropsForDraw(a, b) {
  const layerA = a.layer === PROP_LAYER_FLOOR ? 0 : 1;
  const layerB = b.layer === PROP_LAYER_FLOOR ? 0 : 1;
  return layerA - layerB || (a.y + (a.sortOffset || 0)) - (b.y + (b.sortOffset || 0)) || a.x - b.x;
}

function ensureStaticMapCache(map) {
  if (map.staticCache) return;
  const size = Math.ceil(WORLD_SIZE * STATIC_CACHE_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const cctx = canvas.getContext("2d", { alpha: false });
  cctx.imageSmoothingEnabled = false;
  cctx.save();
  cctx.scale(STATIC_CACHE_SCALE, STATIC_CACHE_SCALE);
  cctx.translate(WORLD_SIZE / 2, WORLD_SIZE / 2);
  drawBase(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0, true);
  drawTiles(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0);
  drawFloorDecals(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0);
  drawCableRuns(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0, true);
  drawRoomShadows(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  drawRoomBorders(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  drawDoorways(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  drawStaticProps(cctx, map, -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  cctx.restore();
  map.staticCache = { canvas, scale: STATIC_CACHE_SCALE };
}

function drawStaticMapCache(ctx, map, camX, camY, viewW, viewH) {
  const cache = map.staticCache;
  if (!cache) return;
  const sx = (camX + WORLD_SIZE / 2) * cache.scale;
  const sy = (camY + WORLD_SIZE / 2) * cache.scale;
  const sw = viewW * cache.scale;
  const sh = viewH * cache.scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cache.canvas, sx, sy, sw, sh, camX, camY, viewW, viewH);
  ctx.restore();
}

function drawDynamicAtmosphere(ctx, map, camX, camY, viewW, viewH, time) {
  const mood = waveMood();
  if (mood.alpha <= 0) return;
  ctx.fillStyle = hexToRgba(mood.color, mood.alpha + Math.sin(time * mood.speed) * mood.pulse);
  ctx.fillRect(camX, camY, viewW, viewH);
  if (mood.scan > 0) {
    ctx.strokeStyle = hexToRgba(mood.color, mood.scan);
    ctx.lineWidth = 2;
    const y = camY + ((time * 72) % Math.max(1, viewH));
    ctx.beginPath();
    ctx.moveTo(camX, y);
    ctx.lineTo(camX + viewW, y);
    ctx.stroke();
  }
}

function waveMood() {
  const wave = state.wave || 1;
  if (state.bossWaveActive || wave >= 16) return { color: "#ff4d6d", alpha: 0.045, pulse: 0.018, speed: 2.4, scan: 0.12 };
  if (wave >= 11) return { color: "#ffd166", alpha: 0.028, pulse: 0.012, speed: 1.8, scan: 0.06 };
  if (wave >= 6) return { color: "#7dd3fc", alpha: 0.02, pulse: 0.008, speed: 1.2, scan: 0.035 };
  return { color: "#7dd3fc", alpha: 0.012, pulse: 0.004, speed: 0.8, scan: 0 };
}

function drawBase(ctx, map, camX, camY, viewW, viewH, time, cached = false) {
  const g = ctx.createLinearGradient(camX, camY, camX + viewW, camY + viewH);
  g.addColorStop(0, map.palette.dark);
  g.addColorStop(0.5, map.palette.base);
  g.addColorStop(1, "#050910");
  ctx.fillStyle = g;
  ctx.fillRect(camX, camY, viewW, viewH);
  ctx.fillStyle = `rgba(125,211,252,${cached ? 0.018 : 0.018 + Math.sin(time * 0.45) * 0.006})`;
  ctx.fillRect(camX, camY, viewW, viewH);
}

function drawTiles(ctx, map, camX, camY, viewW, viewH, time) {
  for (const tile of map.tiles) {
    if (!rectVisible(tile.x, tile.y, tile.w, tile.h, camX, camY, viewW, viewH, 80)) continue;
    ctx.fillStyle = tile.color;
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    drawTileDepth(ctx, tile);
    if (tile.seam) drawTileSeam(ctx, tile);
    if (tile.panel) drawLabPanel(ctx, tile, time);
    if (tile.grate) drawTileGrate(ctx, tile);
    if (tile.warning) drawWarningStripe(ctx, tile);
    if (tile.stain) drawTileStain(ctx, tile);
    if (tile.crack) drawCrack(ctx, tile);
    drawWear(ctx, tile);
    if (tile.glow) drawTileGlow(ctx, tile, time);
  }
}

function drawTileDepth(ctx, tile) {
  const depth = Math.min(10, Math.max(4, Math.min(tile.w, tile.h) * 0.075));
  const top = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + depth * 2);
  top.addColorStop(0, "rgba(255,255,255,0.085)");
  top.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = top;
  ctx.fillRect(tile.x, tile.y, tile.w, depth * 2);

  const left = ctx.createLinearGradient(tile.x, tile.y, tile.x + depth * 2, tile.y);
  left.addColorStop(0, "rgba(255,255,255,0.04)");
  left.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = left;
  ctx.fillRect(tile.x, tile.y, depth * 2, tile.h);

  const bottom = ctx.createLinearGradient(tile.x, tile.y + tile.h - depth * 2, tile.x, tile.y + tile.h);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = bottom;
  ctx.fillRect(tile.x, tile.y + tile.h - depth * 2, tile.w, depth * 2);

  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(tile.x + tile.w - depth, tile.y + depth * 0.5, depth, tile.h - depth * 0.5);

  if (tile.material === "labComposite") {
    ctx.strokeStyle = hexToRgba(tile.accent, 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tile.x + tile.w * 0.18, tile.y + tile.h * 0.32);
    ctx.lineTo(tile.x + tile.w * 0.82, tile.y + tile.h * 0.32);
    ctx.moveTo(tile.x + tile.w * 0.18, tile.y + tile.h * 0.68);
    ctx.lineTo(tile.x + tile.w * 0.82, tile.y + tile.h * 0.68);
    ctx.stroke();
  } else if (tile.material === "accessPlate") {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(tile.x + tile.w * 0.18, tile.y + tile.h * 0.18, tile.w * 0.64, tile.h * 0.64);
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.strokeRect(tile.x + tile.w * 0.2, tile.y + tile.h * 0.2, tile.w * 0.6, tile.h * 0.6);
  } else if (tile.material === "sealedPanel") {
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(tile.x + tile.w * 0.12, tile.y + tile.h * 0.16, tile.w * 0.76, 2);
    ctx.fillRect(tile.x + tile.w * 0.12, tile.y + tile.h * 0.82, tile.w * 0.76, 2);
  }
}

function drawTileSeam(ctx, tile) {
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  ctx.strokeRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2);
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.moveTo(tile.x, tile.y + tile.h);
  ctx.lineTo(tile.x + tile.w, tile.y + tile.h);
  ctx.lineTo(tile.x + tile.w, tile.y);
  ctx.stroke();
}

function drawLabPanel(ctx, tile, time) {
  const inset = Math.min(18, Math.max(8, Math.min(tile.w, tile.h) * 0.12));
  if (tile.material === "utilityGrate") return;
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(tile.x + inset + 2, tile.y + inset + 3, tile.w - inset * 2, tile.h - inset * 2);
  ctx.fillStyle = tile.w > 130 || tile.h > 130 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.065)";
  ctx.fillRect(tile.x + inset, tile.y + inset, tile.w - inset * 2, tile.h - inset * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.beginPath();
  ctx.moveTo(tile.x + inset, tile.y + tile.h - inset);
  ctx.lineTo(tile.x + inset, tile.y + inset);
  ctx.lineTo(tile.x + tile.w - inset, tile.y + inset);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.moveTo(tile.x + tile.w - inset, tile.y + inset);
  ctx.lineTo(tile.x + tile.w - inset, tile.y + tile.h - inset);
  ctx.lineTo(tile.x + inset, tile.y + tile.h - inset);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  ctx.strokeRect(tile.x + inset, tile.y + inset, tile.w - inset * 2, tile.h - inset * 2);
  if (tile.detailKind < 2) {
    const pulse = 0.08 + Math.max(0, Math.sin(time * 1.6 + tile.phase)) * 0.08;
    ctx.strokeStyle = hexToRgba(tile.accent, pulse);
    ctx.beginPath();
    ctx.moveTo(tile.x + inset + 8, tile.y + tile.h - inset - 8);
    ctx.lineTo(tile.x + tile.w * 0.48, tile.y + tile.h - inset - 8);
    ctx.lineTo(tile.x + tile.w - inset - 8, tile.y + tile.h * 0.42);
    ctx.stroke();
  }
}

function drawTileGrate(ctx, tile) {
  const x = tile.x + tile.w * 0.18;
  const y = tile.y + tile.h * 0.2;
  const w = tile.w * 0.64;
  const h = tile.h * 0.58;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(x + 2, y + 2, w - 4, 4);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 2, y + h - 5, w - 4, 3);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let yy = y + 8; yy < y + h - 4; yy += 10) {
    ctx.beginPath();
    ctx.moveTo(x + 6, yy);
    ctx.lineTo(x + w - 6, yy + (tile.rot % 2 ? 4 : -4));
    ctx.stroke();
  }
}

function drawWarningStripe(ctx, tile) {
  const vertical = tile.w < tile.h;
  ctx.save();
  ctx.translate(tile.x + tile.w / 2, tile.y + tile.h / 2);
  ctx.rotate(vertical ? Math.PI / 2 : 0);
  const w = vertical ? tile.h : tile.w;
  const h = 16;
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  for (let x = -w / 2; x < w / 2; x += 22) {
    ctx.fillStyle = "rgba(255,209,102,0.18)";
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x + 9, -h / 2);
    ctx.lineTo(x - 1, h / 2);
    ctx.lineTo(x - 10, h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTileStain(ctx, tile) {
  const w = Math.min(tile.w * 0.55, 58 + tile.wear * 44);
  const h = Math.min(tile.h * 0.46, 26 + (1 - tile.wear) * 38);
  const x = tile.x + tile.w * (0.18 + tile.scuff * 0.44);
  const y = tile.y + tile.h * (0.18 + Math.abs(Math.sin(tile.phase)) * 0.44);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hexToRgba(tile.zone === "bio" ? "#72ffb4" : tile.zone === "cryo" ? "#7dd3fc" : LAB_PALETTE.rust, 0.035);
  ctx.fillRect(x + 5, y + 4, w * 0.58, h * 0.42);
}

function drawCrack(ctx, tile) {
  const sx = tile.x + tile.w * 0.18;
  const sy = tile.y + tile.h * (0.25 + tile.scuff * 0.35);
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tile.x + tile.w * 0.38, tile.y + tile.h * 0.42);
  ctx.lineTo(tile.x + tile.w * 0.54, tile.y + tile.h * (0.32 + tile.wear * 0.3));
  ctx.lineTo(tile.x + tile.w * 0.82, tile.y + tile.h * 0.72);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawWear(ctx, tile) {
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  const count = tile.wear > 0.65 ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const px = tile.x + 8 + ((tile.scuff * 149 + i * 31 + tile.detailKind * 17) % Math.max(12, tile.w - 16));
    const py = tile.y + 8 + ((tile.wear * 157 + i * 29 + tile.rot * 13) % Math.max(12, tile.h - 16));
    ctx.fillRect(px, py, 2 + (i % 2), 2);
  }
  if (tile.detailKind === 4) {
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.moveTo(tile.x + tile.w * 0.2, tile.y + tile.h * 0.78);
    ctx.lineTo(tile.x + tile.w * 0.75, tile.y + tile.h * 0.78);
    ctx.stroke();
  }
}

function drawTileGlow(ctx, tile, time) {
  const alpha = 0.14 + Math.max(0, Math.sin(time * 2.4 + tile.phase)) * 0.12;
  ctx.strokeStyle = hexToRgba(tile.glow, alpha);
  ctx.lineWidth = 2;
  ctx.strokeRect(tile.x + 5, tile.y + 5, tile.w - 10, tile.h - 10);
  ctx.fillStyle = hexToRgba(tile.glow, alpha * 0.08);
  ctx.fillRect(tile.x + 6, tile.y + 6, tile.w - 12, tile.h - 12);
}

function drawFloorDecals(ctx, map, camX, camY, viewW, viewH, time) {
  for (const d of map.floorDecals || []) {
    if (!rectVisible(d.x - d.w, d.y - d.h, d.w * 2, d.h * 2, camX, camY, viewW, viewH, 90)) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    if (d.kind === "grate") drawVentDecal(ctx, d);
    else if (d.kind === "arrow") drawArrowDecal(ctx, d);
    else if (d.kind === "hatch") drawHatchDecal(ctx, d);
    else if (d.kind === "reactorRing") drawReactorRingDecal(ctx, d, time);
    else if (d.kind === "spill") drawSpillDecal(ctx, d, time);
    else if (d.kind === "scratch") drawScratchDecal(ctx, d);
    else if (d.kind === "footprintTrail") drawFootprintTrailDecal(ctx, d);
    else if (d.kind === "sampleLabel") drawSampleLabelDecal(ctx, d);
    else if (d.kind === "glassShards") drawGlassShardsDecal(ctx, d);
    else if (d.kind === "chemicalResidue") drawChemicalResidueDecal(ctx, d, time);
    else if (d.kind === "airlockSeal") drawAirlockSealDecal(ctx, d);
    else if (d.kind === "windowFrameShadow") drawWindowFrameShadowDecal(ctx, d);
    else if (d.kind === "pipeShadowBand") drawPipeShadowBandDecal(ctx, d);
    else drawScorchDecal(ctx, d);
    ctx.restore();
  }
}

function drawVentDecal(ctx, d) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
  for (let x = -d.w * 0.4; x < d.w * 0.42; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, -d.h * 0.42);
    ctx.lineTo(x - 8, d.h * 0.42);
    ctx.stroke();
  }
}

function drawArrowDecal(ctx, d) {
  ctx.fillStyle = hexToRgba(d.color, 0.14);
  for (let i = 0; i < 3; i++) {
    const off = i * 22 - 22;
    ctx.beginPath();
    ctx.moveTo(off - 9, -11);
    ctx.lineTo(off + 7, 0);
    ctx.lineTo(off - 9, 11);
    ctx.lineTo(off - 3, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHatchDecal(ctx, d) {
  const s = Math.min(d.w, d.h);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  ctx.strokeStyle = hexToRgba(d.color, 0.14);
  ctx.strokeRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
}

function drawReactorRingDecal(ctx, d, time) {
  const pulse = 0.18 + Math.max(0, Math.sin(time * 2 + d.phase)) * 0.14;
  ctx.strokeStyle = hexToRgba(d.color, pulse);
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, d.w * (0.24 + i * 0.1), time * 0.4 + i, time * 0.4 + i + Math.PI * 1.35);
    ctx.stroke();
  }
}

function drawSpillDecal(ctx, d, time) {
  ctx.fillStyle = hexToRgba(d.color, 0.045 + Math.sin(time * 1.5 + d.phase) * 0.012);
  ctx.beginPath();
  ctx.ellipse(0, 0, d.w * 0.5, d.h * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hexToRgba("#ffffff", 0.025);
  ctx.beginPath();
  ctx.ellipse(-d.w * 0.12, -d.h * 0.12, d.w * 0.14, d.h * 0.09, 0, 0, TAU);
  ctx.fill();
}

function drawScratchDecal(ctx, d) {
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-d.w * 0.5 + i * d.w * 0.18, -d.h * 0.35 + i * 2);
    ctx.lineTo(d.w * 0.45 - i * d.w * 0.1, d.h * 0.2 + i * 2);
    ctx.stroke();
  }
}

function drawScorchDecal(ctx, d) {
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(d.w, d.h));
  grad.addColorStop(0, "rgba(0,0,0,0.18)");
  grad.addColorStop(0.55, hexToRgba(d.color, 0.035));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, d.w * 0.5, d.h * 0.5, 0, 0, TAU);
  ctx.fill();
}

function drawFootprintTrailDecal(ctx, d) {
  ctx.fillStyle = hexToRgba(d.color, 0.12);
  for (let i = 0; i < 7; i++) {
    const x = -d.w * 0.42 + i * d.w * 0.14;
    const y = (i % 2 ? 0.18 : -0.12) * d.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((i % 2 ? 0.28 : -0.22) + d.phase * 0.03);
    ctx.fillRect(-d.w * 0.028, -d.h * 0.12, d.w * 0.056, d.h * 0.18);
    ctx.fillRect(d.w * 0.015, d.h * 0.02, d.w * 0.035, d.h * 0.08);
    ctx.restore();
  }
  ctx.strokeStyle = hexToRgba(d.color, 0.045);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-d.w * 0.5, d.h * 0.2);
  ctx.bezierCurveTo(-d.w * 0.15, -d.h * 0.18, d.w * 0.18, d.h * 0.24, d.w * 0.48, -d.h * 0.1);
  ctx.stroke();
}

function drawSampleLabelDecal(ctx, d) {
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(-d.w * 0.5, -d.h * 0.36, d.w, d.h * 0.72);
  ctx.strokeStyle = hexToRgba(d.color, 0.18);
  ctx.lineWidth = 2;
  ctx.strokeRect(-d.w * 0.5, -d.h * 0.36, d.w, d.h * 0.72);
  ctx.fillStyle = hexToRgba(d.color, 0.18);
  for (let i = 0; i < 4; i++) {
    const w = d.w * (0.16 + (i % 2) * 0.12);
    ctx.fillRect(-d.w * 0.38 + i * d.w * 0.2, -d.h * 0.12, w, 3);
    ctx.fillRect(-d.w * 0.38 + i * d.w * 0.2, d.h * 0.08, w * 0.62, 3);
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(d.w * 0.26, -d.h * 0.24, d.w * 0.14, d.h * 0.48);
}

function drawGlassShardsDecal(ctx, d) {
  ctx.strokeStyle = "rgba(217,251,255,0.18)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(217,251,255,0.075)";
  for (let i = 0; i < 9; i++) {
    const x = -d.w * 0.45 + i * d.w * 0.11;
    const y = Math.sin(d.phase + i * 1.7) * d.h * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y - d.h * 0.08);
    ctx.lineTo(x + d.w * 0.04, y + d.h * 0.02);
    ctx.lineTo(x - d.w * 0.025, y + d.h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawChemicalResidueDecal(ctx, d, time) {
  const alpha = 0.05 + Math.max(0, Math.sin(time * 1.2 + d.phase)) * 0.018;
  ctx.fillStyle = hexToRgba(d.color, alpha);
  ctx.beginPath();
  ctx.ellipse(-d.w * 0.12, 0, d.w * 0.36, d.h * 0.42, 0.14, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(d.w * 0.2, d.h * 0.05, d.w * 0.2, d.h * 0.25, -0.28, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(d.color, 0.12);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-d.w * 0.34 + i * d.w * 0.18, -d.h * 0.14);
    ctx.lineTo(-d.w * 0.2 + i * d.w * 0.16, d.h * 0.2);
    ctx.stroke();
  }
}

function drawAirlockSealDecal(ctx, d) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(-d.w * 0.5, -d.h * 0.5, d.w, d.h);
  ctx.strokeStyle = hexToRgba(d.color, 0.18);
  ctx.lineWidth = 3;
  ctx.strokeRect(-d.w * 0.45, -d.h * 0.34, d.w * 0.9, d.h * 0.68);
  ctx.strokeStyle = "rgba(255,209,102,0.16)";
  ctx.lineWidth = 2;
  for (let x = -d.w * 0.42; x < d.w * 0.42; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, -d.h * 0.32);
    ctx.lineTo(x + 10, -d.h * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 6, d.h * 0.32);
    ctx.lineTo(x + 16, d.h * 0.2);
    ctx.stroke();
  }
}

function drawWindowFrameShadowDecal(ctx, d) {
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-d.w * 0.48 + i * d.w * 0.18, -d.h * 0.42);
    ctx.lineTo(-d.w * 0.28 + i * d.w * 0.18, d.h * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(217,251,255,0.035)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-d.w * 0.42, -d.h * 0.3);
  ctx.lineTo(d.w * 0.44, d.h * 0.22);
  ctx.stroke();
}

function drawPipeShadowBandDecal(ctx, d) {
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(-d.w * 0.5, -d.h * 0.22, d.w, d.h * 0.44);
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  for (let x = -d.w * 0.42; x < d.w * 0.45; x += 32) {
    ctx.fillRect(x, -d.h * 0.28, 4, d.h * 0.56);
  }
}

function drawCableRuns(ctx, map, camX, camY, viewW, viewH, time, cached = false) {
  for (const c of map.cableRuns || []) {
    if (!rectVisible(c.x - c.length, c.y - c.length, c.length * 2, c.length * 2, camX, camY, viewW, viewH, 120)) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.horizontal ? 0 : Math.PI / 2);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-c.length / 2, 0);
    if (c.bend) {
      ctx.lineTo(-c.length * 0.12, 0);
      ctx.lineTo(-c.length * 0.12, 34);
      ctx.lineTo(c.length / 2, 34);
    } else ctx.lineTo(c.length / 2, 0);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(c.color, c.broken ? 0.1 : cached ? 0.22 : 0.2 + Math.max(0, Math.sin(time * 3 + c.phase)) * 0.2);
    ctx.lineWidth = c.broken ? 2 : 3;
    ctx.stroke();
    if (!cached && c.broken && Math.sin(time * 18 + c.phase) > 0.78) {
      ctx.fillStyle = hexToRgba("#ffffff", 0.45);
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.lineCap = "butt";
    ctx.restore();
  }
}

function drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time) {
  ctx.lineCap = "round";
  for (const line of map.energyLines || []) {
    const minX = Math.min(line.x1, line.x2);
    const minY = Math.min(line.y1, line.y2);
    const w = Math.abs(line.x2 - line.x1) || 20;
    const h = Math.abs(line.y2 - line.y1) || 20;
    if (!rectVisible(minX, minY, w, h, camX, camY, viewW, viewH, 120)) continue;
    const k = 0.24 + Math.max(0, Math.sin(time * 2.6 + line.phase)) * 0.38;
    ctx.strokeStyle = hexToRgba(line.color, 0.08);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(line.color, k);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawRoomBorders(ctx, map, camX, camY, viewW, viewH) {
  for (const room of map.rooms || []) {
    if (!rectVisible(room.x, room.y, room.w, room.h, camX, camY, viewW, viewH, 80)) continue;
    const top = ctx.createLinearGradient(room.x, room.y, room.x, room.y + 48);
    top.addColorStop(0, "rgba(255,255,255,0.07)");
    top.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = top;
    ctx.fillRect(room.x, room.y, room.w, 48);
    const bottom = ctx.createLinearGradient(room.x, room.y + room.h - 56, room.x, room.y + room.h);
    bottom.addColorStop(0, "rgba(0,0,0,0)");
    bottom.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = bottom;
    ctx.fillRect(room.x, room.y + room.h - 56, room.w, 56);
    ctx.strokeStyle = "rgba(255,255,255,0.075)";
    ctx.lineWidth = 4;
    ctx.strokeRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x + 8, room.y + 8, room.w - 16, room.h - 16);
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    ctx.strokeRect(room.x - 6, room.y - 6, room.w + 12, room.h + 12);
  }
}

function drawRoomShadows(ctx, map, camX, camY, viewW, viewH) {
  for (const room of map.rooms || []) {
    if (!rectVisible(room.x - 48, room.y - 48, room.w + 96, room.h + 96, camX, camY, viewW, viewH, 80)) continue;
    const wall = 34;
    const alpha = room.zone === "reactor" ? 0.2 : 0.24;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(room.x - wall, room.y - wall, room.w + wall * 2, wall);
    ctx.fillRect(room.x - wall, room.y + room.h, room.w + wall * 2, wall);
    ctx.fillRect(room.x - wall, room.y, wall, room.h);
    ctx.fillRect(room.x + room.w, room.y, wall, room.h);
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(room.x - wall, room.y - wall, room.w + wall * 2, 4);
    ctx.fillRect(room.x - wall, room.y - wall, 4, room.h + wall);
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 10;
    ctx.strokeRect(room.x - 5, room.y - 5, room.w + 10, room.h + 10);
  }
}

function drawDoorways(ctx, map, camX, camY, viewW, viewH) {
  for (const door of map.doors || []) {
    const w = door.horizontal ? door.w : 42;
    const h = door.horizontal ? 42 : door.w;
    if (!rectVisible(door.x - w / 2, door.y - h / 2, w, h, camX, camY, viewW, viewH, 60)) continue;
    ctx.save();
    ctx.translate(door.x, door.y);
    if (!door.horizontal) ctx.rotate(Math.PI / 2);
    const color = door.zone === "bio" ? "#72ffb4" : door.zone === "cryo" ? "#7dd3fc" : door.zone === "control" ? "#ffd166" : "#9aa7b4";
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(-door.w / 2 + 8, -18, door.w, 48);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(-door.w / 2, -26, door.w, 6);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(-door.w / 2, 18, door.w, 8);
    ctx.fillStyle = "rgba(12,20,28,0.92)";
    ctx.fillRect(-door.w / 2 + 12, -16, door.w - 24, 32);
    ctx.strokeStyle = hexToRgba(color, 0.28);
    ctx.lineWidth = 3;
    ctx.strokeRect(-door.w / 2 + 10, -18, door.w - 20, 36);
    ctx.fillStyle = hexToRgba(color, 0.22);
    ctx.fillRect(-door.w * 0.34, -3, door.w * 0.68, 6);
    ctx.restore();
  }
}

function drawStaticProps(ctx, map, camX, camY, viewW, viewH) {
  const props = (map.props || []).filter((prop) => isStaticProp(prop)).sort(comparePropsForDraw);
  for (const prop of props) drawPropIfVisible(ctx, prop, camX, camY, viewW, viewH, 0);
}

function drawDynamicProps(ctx, map, camX, camY, viewW, viewH, time) {
  drawProps(ctx, map, camX, camY, viewW, viewH, time, true);
}

function isStaticProp(prop) {
  return prop.kind === "brokenGlass" ||
    prop.kind === "warningSign" ||
    prop.kind === "ceilingFanShadow" ||
    prop.kind === "cargoLift" ||
    prop.kind === "observationWindow" ||
    prop.kind === "brokenRack" ||
    prop.kind === "crateStack" ||
    prop.kind === "fallenMonitor" ||
    prop.kind === "surgicalTray" ||
    prop.kind === "hazardBarrel" ||
    prop.kind === "looseCanister" ||
    prop.kind === "brokenRobotArm" ||
    prop.kind === "leakingPipeVent" ||
    prop.kind === "securityCameraShell" ||
    prop.kind === "wallPanelPatch" ||
    prop.kind === "sampleTray" ||
    prop.kind === "coolantValve" ||
    prop.kind === "burntKeyboard" ||
    prop.kind === "tornSealCrate" ||
    prop.kind === "energyNodeBase";
}

function drawProps(ctx, map, camX, camY, viewW, viewH, time, dynamicOnly = false) {
  const props = (map.props || [])
    .filter((prop) => !dynamicOnly || !isStaticProp(prop))
    .sort(comparePropsForDraw);
  for (const prop of props) {
    if (dynamicOnly && isStaticProp(prop)) continue;
    drawPropIfVisible(ctx, prop, camX, camY, viewW, viewH, time);
  }
}

function drawPropIfVisible(ctx, prop, camX, camY, viewW, viewH, time) {
  const pad = Math.max(110, prop.size * 3.2);
  if (!rectVisible(prop.x - pad, prop.y - pad, pad * 2, pad * 2, camX, camY, viewW, viewH, 90)) return;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.rot);
  drawPropGroundShadow(ctx, prop);
  drawPropBaseExtrusion(ctx, prop);
  drawPropBody(ctx, prop, time);
  drawPropRimLight(ctx, prop);
  ctx.restore();
}

function drawPropBody(ctx, prop, time) {
  if (prop.kind === "wallLight") drawWallLight(ctx, prop, time);
  else if (prop.kind === "reactorCore") drawReactorCore(ctx, prop, time);
  else if (prop.kind === "specimenTank" || prop.kind === "cryoPod") drawTank(ctx, prop, time);
  else if (prop.kind === "labBench") drawLabBench(ctx, prop, time);
  else if (prop.kind === "serverCabinet") drawServerCabinet(ctx, prop, time);
  else if (prop.kind === "hangingCable") drawHangingCable(ctx, prop, time);
  else if (prop.kind === "brokenGlass") drawBrokenGlass(ctx, prop);
  else if (prop.kind === "warningSign") drawWarningSign(ctx, prop, time);
  else if (prop.kind === "bioCanister" || prop.kind === "coolantTank") drawCanister(ctx, prop, time);
  else if (prop.kind === "ceilingFanShadow") drawCeilingFanShadow(ctx, prop, time);
  else if (prop.kind === "containmentChamber" || prop.kind === "cryoArray") drawContainmentChamber(ctx, prop, time);
  else if (prop.kind === "observationWindow") drawObservationWindow(ctx, prop, time);
  else if (prop.kind === "largeGenerator") drawLargeGenerator(ctx, prop, time);
  else if (prop.kind === "commandConsole") drawCommandConsole(ctx, prop, time);
  else if (prop.kind === "serverWall") drawServerWall(ctx, prop, time);
  else if (prop.kind === "cargoLift") drawCargoLift(ctx, prop, time);
  else if (prop.kind === "deconGate") drawDeconGate(ctx, prop, time);
  else if (prop.kind === "overheadLightRig") drawOverheadLightRig(ctx, prop, time);
  else if (prop.kind === "terminal") drawTerminal(ctx, prop, time);
  else if (prop.kind === "brokenRack" || prop.kind === "crateStack") drawStorageProp(ctx, prop);
  else if (prop.kind === "ventPipe") drawVentPipe(ctx, prop, time);
  else if (prop.kind === "fallenMonitor") drawFallenMonitor(ctx, prop, time);
  else if (prop.kind === "surgicalTray") drawSurgicalTray(ctx, prop);
  else if (prop.kind === "hazardBarrel" || prop.kind === "looseCanister") drawLooseContainer(ctx, prop, time);
  else if (prop.kind === "brokenRobotArm") drawBrokenRobotArm(ctx, prop, time);
  else if (prop.kind === "leakingPipeVent") drawLeakingPipeVent(ctx, prop, time);
  else if (prop.kind === "steamLeak") drawSteamLeak(ctx, prop, time);
  else if (prop.kind === "swingingCable") drawSwingingCable(ctx, prop, time);
  else if (prop.kind === "flickerBeacon") drawFlickerBeacon(ctx, prop, time);
  else if (prop.kind === "securityCameraShell") drawSecurityCameraShell(ctx, prop);
  else if (prop.kind === "wallPanelPatch") drawWallPanelPatch(ctx, prop);
  else if (prop.kind === "sampleTray") drawSampleTray(ctx, prop, time);
  else if (prop.kind === "coolantValve") drawCoolantValve(ctx, prop, time);
  else if (prop.kind === "burntKeyboard") drawBurntKeyboard(ctx, prop, time);
  else if (prop.kind === "tornSealCrate") drawTornSealCrate(ctx, prop);
  else if (prop.kind === "energyNodeBase") drawEnergyNodeBase(ctx, prop, time);
  else if (prop.kind === "dripValve") drawDripValve(ctx, prop, time);
  else if (prop.kind === "faultyScreenStrip") drawFaultyScreenStrip(ctx, prop, time);
  else drawStorageProp(ctx, prop);
}

function drawPropGroundShadow(ctx, prop) {
  if (prop.kind === "ceilingFanShadow") return;
  const s = prop.size;
  const h = prop.height ?? getPropHeight(prop);
  const alpha = Math.min(0.34, 0.1 + h / Math.max(1, s) * 0.08);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(s * 0.16, s * 0.34 + h * 0.06, s * 1.0, s * 0.34, 0, 0, TAU);
  ctx.fill();
}

function drawPropBaseExtrusion(ctx, prop) {
  if (!RECTANGULAR_PROP_KINDS.has(prop.kind)) return;
  const dims = getPropFootprintSize(prop);
  const depth = Math.min(14, Math.max(5, (prop.height ?? prop.size * 0.5) * 0.18));
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(-dims.w * 0.42, dims.h * 0.26, dims.w * 0.84, depth);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(-dims.w * 0.42, -dims.h * 0.32, dims.w * 0.84, 3);
}

function drawPropRimLight(ctx, prop) {
  if (!RECTANGULAR_PROP_KINDS.has(prop.kind)) return;
  const dims = getPropFootprintSize(prop);
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-dims.w * 0.38, -dims.h * 0.3);
  ctx.lineTo(dims.w * 0.38, -dims.h * 0.3);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.moveTo(-dims.w * 0.38, dims.h * 0.32);
  ctx.lineTo(dims.w * 0.38, dims.h * 0.32);
  ctx.stroke();
}

function drawWallLight(ctx, prop, time) {
  const s = prop.size;
  const flicker = 0.48 + Math.max(0, Math.sin(time * 4.8 + prop.phase)) * 0.35;
  glow(ctx, 0, 0, s * 2.4, prop.color, 0.12 * flicker);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(-s * 1.2, -s * 0.32, s * 2.4, s * 0.64);
  ctx.fillStyle = hexToRgba(prop.color, 0.52 * flicker);
  ctx.fillRect(-s, -s * 0.12, s * 2, s * 0.24);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-s * 0.82, -1, s * 0.22, 2);
}

function drawReactorCore(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.65 + Math.sin(time * 2.2 + prop.phase) * 0.24;
  glow(ctx, 0, 0, s * 2.1, prop.color, 0.15 * pulse);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.95, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(prop.color, 0.52);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.save();
  ctx.rotate(time * 0.8);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    ctx.strokeStyle = i % 2 ? hexToRgba("#ffffff", 0.28) : hexToRgba(prop.color, 0.52);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35);
    ctx.lineTo(Math.cos(a) * s * 0.92, Math.sin(a) * s * 0.92);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = hexToRgba("#ffffff", 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.18, 0, TAU);
  ctx.fill();
}

function drawTank(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.2 + Math.max(0, Math.sin(time * 2 + prop.phase)) * 0.18;
  glow(ctx, 0, 0, s * 1.5, prop.color, pulse * 0.4);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-s * 0.46, -s * 0.85, s * 0.92, s * 1.7);
  ctx.fillStyle = hexToRgba(prop.color, prop.kind === "cryoPod" ? 0.2 : 0.16);
  ctx.fillRect(-s * 0.32, -s * 0.66, s * 0.64, s * 1.22);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.46, -s * 0.85, s * 0.92, s * 1.7);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-s * 0.23, -s * 0.58, s * 0.13, s * 0.92);
}

function drawLabBench(ctx, prop, time) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(-s * 1.3, -s * 0.42, s * 2.6, s * 0.84);
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 1.3, -s * 0.42, s * 2.6, s * 0.84);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(-s * 1.08, -s * 0.2, s * 0.52, s * 0.18);
  ctx.fillStyle = hexToRgba(prop.color, 0.16 + Math.max(0, Math.sin(time * 2.6 + prop.phase)) * 0.08);
  ctx.fillRect(s * 0.48, -s * 0.28, s * 0.42, s * 0.32);
  ctx.strokeStyle = hexToRgba(prop.color, 0.28);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const x = -s * 0.28 + i * s * 0.18;
    ctx.beginPath();
    ctx.moveTo(x, -s * 0.28);
    ctx.lineTo(x, s * 0.16);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? "#72ffb4" : "#7dd3fc";
    ctx.fillRect(x - 2, s * 0.1, 4, s * 0.12);
  }
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-s * 1.1, s * 0.5, s * 0.16, s * 0.42);
  ctx.fillRect(s * 0.95, s * 0.5, s * 0.16, s * 0.42);
}

function drawServerCabinet(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.32 + Math.max(0, Math.sin(time * 3.6 + prop.phase)) * 0.28;
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(-s * 0.58, -s * 1.2, s * 1.16, s * 2.4);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.58, -s * 1.2, s * 1.16, s * 2.4);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let y = -s * 0.86; y < s * 0.85; y += s * 0.32) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, y);
    ctx.lineTo(s * 0.42, y);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = hexToRgba(i % 3 === 0 ? "#72ffb4" : prop.color, pulse * (i % 2 ? 0.55 : 0.9));
    ctx.fillRect(s * 0.25, -s * 0.86 + i * s * 0.28, 4, 4);
  }
}

function drawHangingCable(ctx, prop, time) {
  const s = prop.size;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * s * 0.18;
    const sway = Math.sin(time * 0.9 + prop.phase + i) * s * 0.08;
    ctx.strokeStyle = i === 1 ? hexToRgba(prop.color, 0.8) : "rgba(0,0,0,0.65)";
    ctx.lineWidth = i === 1 ? 2.4 : 4;
    ctx.beginPath();
    ctx.moveTo(x, -s * 0.82);
    ctx.bezierCurveTo(x + sway, -s * 0.3, x - sway * 0.6, s * 0.12, x + sway * 0.4, s * 0.82);
    ctx.stroke();
  }
  if (Math.sin(time * 12 + prop.phase) > 0.82) {
    ctx.fillStyle = hexToRgba("#ff7a1a", 0.55);
    ctx.fillRect(s * 0.16, s * 0.62, 5, 5);
  }
  ctx.lineCap = "butt";
}

function drawBrokenGlass(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(217,251,255,0.045)";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.1, s * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(217,251,255,0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = prop.phase + i * 1.73;
    const r = s * (0.18 + (i % 3) * 0.16);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.12);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.45);
    ctx.stroke();
  }
}

function drawWarningSign(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.18 + Math.max(0, Math.sin(time * 2.2 + prop.phase)) * 0.08;
  ctx.fillStyle = "rgba(0,0,0,0.44)";
  ctx.fillRect(-s * 1.05, -s * 0.5, s * 2.1, s);
  ctx.strokeStyle = hexToRgba(prop.color, 0.35 + pulse);
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 1.05, -s * 0.5, s * 2.1, s);
  ctx.fillStyle = hexToRgba(prop.color, 0.24);
  ctx.beginPath();
  ctx.moveTo(-s * 0.82, s * 0.34);
  ctx.lineTo(-s * 0.56, -s * 0.34);
  ctx.lineTo(-s * 0.3, s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hexToRgba("#ffffff", 0.18);
  for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.1, -s * 0.28 + i * s * 0.22, s * (0.76 - i * 0.12), 3);
}

function drawCanister(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.34 + Math.max(0, Math.sin(time * 2.4 + prop.phase)) * 0.24;
  glow(ctx, 0, 0, s * 1.5, prop.color, pulse * 0.08);
  ctx.fillStyle = "rgba(0,0,0,0.56)";
  ctx.fillRect(-s * 0.45, -s * 0.82, s * 0.9, s * 1.64);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.45, -s * 0.82, s * 0.9, s * 1.64);
  ctx.fillStyle = hexToRgba(prop.color, prop.kind === "bioCanister" ? 0.3 : 0.22);
  ctx.fillRect(-s * 0.29, -s * 0.52, s * 0.58, s * 0.86);
  ctx.fillStyle = hexToRgba("#ffffff", 0.18);
  ctx.fillRect(-s * 0.18, -s * 0.46, s * 0.08, s * 0.72);
  ctx.fillStyle = hexToRgba(prop.color, pulse * 0.55);
  ctx.fillRect(-s * 0.34, s * 0.58, s * 0.68, 4);
}

function drawCeilingFanShadow(ctx, prop, time) {
  const s = prop.size;
  ctx.save();
  ctx.rotate(time * 0.32 + prop.phase);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.18, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.beginPath();
    ctx.ellipse(s * 0.5, 0, s * 0.55, s * 0.11, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.78, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawContainmentChamber(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.22 + Math.max(0, Math.sin(time * 2.1 + prop.phase)) * 0.16;
  glow(ctx, 0, 0, s * 2.0, prop.color, pulse * 0.28);
  ctx.fillStyle = "rgba(0,0,0,0.54)";
  ctx.fillRect(-s * 1.45, -s * 0.72, s * 2.9, s * 1.44);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  ctx.strokeRect(-s * 1.45, -s * 0.72, s * 2.9, s * 1.44);
  for (let i = -1; i <= 1; i++) {
    const x = i * s * 0.78;
    ctx.fillStyle = hexToRgba(prop.color, prop.kind === "cryoArray" ? 0.18 : 0.14);
    ctx.fillRect(x - s * 0.28, -s * 0.56, s * 0.56, s * 1.12);
    ctx.strokeStyle = hexToRgba("#ffffff", 0.2);
    ctx.strokeRect(x - s * 0.28, -s * 0.56, s * 0.56, s * 1.12);
    ctx.fillStyle = hexToRgba("#ffffff", 0.12);
    ctx.fillRect(x - s * 0.18, -s * 0.46, s * 0.08, s * 0.84);
  }
  ctx.fillStyle = hexToRgba(prop.color, pulse);
  ctx.fillRect(-s * 1.28, s * 0.62, s * 2.56, 4);
}

function drawObservationWindow(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.08 + Math.max(0, Math.sin(time * 1.6 + prop.phase)) * 0.06;
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(-s * 1.55, -s * 0.46, s * 3.1, s * 0.92);
  ctx.fillStyle = hexToRgba(prop.color, 0.09 + pulse);
  ctx.fillRect(-s * 1.34, -s * 0.3, s * 2.68, s * 0.6);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  ctx.strokeRect(-s * 1.55, -s * 0.46, s * 3.1, s * 0.92);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.46, -s * 0.42);
    ctx.lineTo(i * s * 0.46, s * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba("#ffffff", 0.1);
  ctx.beginPath();
  ctx.moveTo(-s * 1.12, s * 0.22);
  ctx.lineTo(-s * 0.7, -s * 0.18);
  ctx.lineTo(-s * 0.22, s * 0.08);
  ctx.stroke();
}

function drawLargeGenerator(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.3 + Math.max(0, Math.sin(time * 2.8 + prop.phase)) * 0.28;
  glow(ctx, 0, 0, s * 1.85, prop.color, pulse * 0.22);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(-s * 1.2, -s * 0.62, s * 2.4, s * 1.24);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-s * 1.2, -s * 0.62, s * 2.4, s * 1.24);
  ctx.fillStyle = hexToRgba(prop.color, 0.18 + pulse * 0.12);
  ctx.fillRect(-s * 0.9, -s * 0.32, s * 0.58, s * 0.64);
  ctx.fillRect(s * 0.32, -s * 0.32, s * 0.58, s * 0.64);
  ctx.strokeStyle = hexToRgba(prop.color, 0.42);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.34, time * 0.9 + prop.phase, time * 0.9 + prop.phase + Math.PI * 1.45);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let x = -s; x <= s; x += s * 0.4) ctx.fillRect(x, s * 0.68, s * 0.14, s * 0.2);
}

function drawCommandConsole(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.2 + Math.max(0, Math.sin(time * 4.2 + prop.phase)) * 0.26;
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(-s * 1.55, -s * 0.5, s * 3.1, s);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 1.55, -s * 0.5, s * 3.1, s);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hexToRgba(i % 2 ? "#72ffb4" : prop.color, pulse * (0.7 + i * 0.08));
    ctx.fillRect(-s * 1.25 + i * s * 0.65, -s * 0.25, s * 0.42, s * 0.28);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(-s * 1.2 + i * s * 0.65, s * 0.12, s * 0.22, 3);
  }
}

function drawServerWall(ctx, prop, time) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.64)";
  ctx.fillRect(-s * 0.72, -s * 1.55, s * 1.44, s * 3.1);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.72, -s * 1.55, s * 1.44, s * 3.1);
  for (let row = 0; row < 7; row++) {
    const y = -s * 1.2 + row * s * 0.36;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.52, y);
    ctx.lineTo(s * 0.52, y);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(row % 2 ? "#72ffb4" : prop.color, 0.18 + Math.max(0, Math.sin(time * 4 + prop.phase + row)) * 0.22);
    ctx.fillRect(s * 0.34, y - 3, 5, 5);
  }
}

function drawCargoLift(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.1 + Math.max(0, Math.sin(time * 2 + prop.phase)) * 0.07;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(-s * 1.2, -s * 0.85, s * 2.4, s * 1.7);
  ctx.strokeStyle = hexToRgba(prop.color, 0.26 + pulse);
  ctx.lineWidth = 3;
  ctx.strokeRect(-s * 1.2, -s * 0.85, s * 2.4, s * 1.7);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-s * 1.0, -s * 0.65);
  ctx.lineTo(s * 1.0, s * 0.65);
  ctx.moveTo(s * 1.0, -s * 0.65);
  ctx.lineTo(-s * 1.0, s * 0.65);
  ctx.stroke();
  drawWarningBands(ctx, s * 1.05, s * 0.65, prop.color);
}

function drawDeconGate(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.16 + Math.max(0, Math.sin(time * 3.4 + prop.phase)) * 0.18;
  glow(ctx, 0, 0, s * 1.35, prop.color, pulse * 0.18);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-s * 0.6, -s * 1.35, s * 1.2, s * 2.7);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.6, -s * 1.35, s * 1.2, s * 2.7);
  ctx.strokeStyle = hexToRgba(prop.color, 0.38 + pulse);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.36, -s * 1.05);
  ctx.lineTo(-s * 0.36, s * 1.05);
  ctx.moveTo(s * 0.36, -s * 1.05);
  ctx.lineTo(s * 0.36, s * 1.05);
  ctx.stroke();
  ctx.fillStyle = hexToRgba("#ffffff", 0.18);
  ctx.fillRect(-s * 0.2, -s * 0.08, s * 0.4, s * 0.16);
}

function drawOverheadLightRig(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.4 + Math.max(0, Math.sin(time * 4.6 + prop.phase)) * 0.28;
  glow(ctx, 0, 0, s * 2.25, prop.color, pulse * 0.1);
  ctx.fillStyle = "rgba(0,0,0,0.46)";
  ctx.fillRect(-s * 1.6, -s * 0.22, s * 3.2, s * 0.44);
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = hexToRgba(prop.color, pulse * 0.36);
    ctx.fillRect(i * s * 0.78 - s * 0.26, -s * 0.08, s * 0.52, s * 0.16);
    ctx.fillStyle = hexToRgba("#ffffff", pulse * 0.18);
    ctx.fillRect(i * s * 0.78 - s * 0.19, -1, s * 0.16, 2);
  }
}

function drawWarningBands(ctx, w, h, color) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w, -h, w * 2, h * 2);
  ctx.clip();
  for (let x = -w * 1.1; x < w * 1.2; x += 18) {
    ctx.fillStyle = hexToRgba(color, 0.16);
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 8, h);
    ctx.lineTo(x + 26, -h);
    ctx.lineTo(x + 18, -h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTerminal(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.25 + Math.max(0, Math.sin(time * 5 + prop.phase)) * 0.28;
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(-s * 0.9, -s * 0.55, s * 1.8, s * 1.1);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(-s * 0.9, -s * 0.55, s * 1.8, s * 1.1);
  ctx.fillStyle = hexToRgba(prop.color, pulse);
  ctx.fillRect(-s * 0.62, -s * 0.32, s * 1.18, s * 0.38);
  ctx.fillStyle = hexToRgba("#ffffff", 0.18);
  ctx.fillRect(-s * 0.56, -s * 0.22, s * 0.22, 2);
  ctx.fillRect(-s * 0.18, -s * 0.22, s * 0.34, 2);
}

function drawStorageProp(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(-s * 0.85, -s * 0.45, s * 1.7, s * 0.9);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.strokeRect(-s * 0.85, -s * 0.45, s * 1.7, s * 0.9);
  ctx.fillStyle = hexToRgba(prop.color, prop.kind === "brokenRack" ? 0.08 : 0.14);
  ctx.fillRect(-s * 0.62, -s * 0.28, s * 0.48, s * 0.55);
  ctx.fillRect(s * 0.1, -s * 0.28, s * 0.45, s * 0.55);
}

function drawVentPipe(ctx, prop, time) {
  const s = prop.size;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.58)";
  ctx.lineWidth = s * 0.34;
  ctx.beginPath();
  ctx.moveTo(-s * 1.35, 0);
  ctx.lineTo(s * 1.35, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let i = -1; i <= 1; i++) ctx.fillRect(i * s * 0.55 - 4, -s * 0.23, 8, s * 0.46);
  if (Math.sin(time * 1.3 + prop.phase) > 0.2) {
    ctx.fillStyle = hexToRgba(prop.color, 0.06);
    ctx.beginPath();
    ctx.ellipse(s * 1.2, 0, s * 0.7, s * 0.24, 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = "butt";
}

function drawFallenMonitor(ctx, prop, time) {
  const s = prop.size;
  const flicker = Math.max(0, Math.sin(time * 7.5 + prop.phase));
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(-s * 1.05, -s * 0.48, s * 2.1, s * 0.96);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 1.05, -s * 0.48, s * 2.1, s * 0.96);
  ctx.fillStyle = hexToRgba(prop.color, 0.07 + flicker * 0.16);
  ctx.fillRect(-s * 0.82, -s * 0.3, s * 1.42, s * 0.5);
  ctx.strokeStyle = hexToRgba("#ffffff", 0.1);
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s * 0.32);
  ctx.lineTo(-s * 0.18, s * 0.05);
  ctx.lineTo(s * 0.16, s * 0.25);
  ctx.stroke();
  ctx.fillStyle = "rgba(100,116,139,0.75)";
  ctx.fillRect(s * 0.58, s * 0.42, s * 0.55, 4);
}

function drawSurgicalTray(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(-s * 1.0, -s * 0.36, s * 2.0, s * 0.72);
  ctx.strokeStyle = "rgba(217,251,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 1.0, -s * 0.36, s * 2.0, s * 0.72);
  ctx.fillStyle = "rgba(217,251,255,0.11)";
  ctx.fillRect(-s * 0.78, -s * 0.16, s * 0.44, 3);
  ctx.fillRect(-s * 0.08, -s * 0.14, s * 0.64, 3);
  ctx.fillStyle = "rgba(154,79,47,0.24)";
  ctx.beginPath();
  ctx.ellipse(s * 0.58, s * 0.12, s * 0.22, s * 0.08, 0, 0, TAU);
  ctx.fill();
}

function drawLooseContainer(ctx, prop, time) {
  const s = prop.size;
  const pulse = prop.kind === "looseCanister" ? 0.08 + Math.max(0, Math.sin(time * 2 + prop.phase)) * 0.08 : 0;
  if (prop.kind === "looseCanister") glow(ctx, 0, 0, s * 1.0, prop.color, pulse);
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(-s * 0.45, -s * 0.78, s * 0.9, s * 1.56);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.45, -s * 0.78, s * 0.9, s * 1.56);
  ctx.fillStyle = hexToRgba(prop.color, prop.kind === "hazardBarrel" ? 0.24 : 0.18 + pulse);
  ctx.fillRect(-s * 0.32, -s * 0.42, s * 0.64, s * 0.34);
  ctx.fillRect(-s * 0.32, s * 0.12, s * 0.64, s * 0.34);
  if (prop.kind === "hazardBarrel") drawWarningBands(ctx, s * 0.38, s * 0.58, prop.color);
}

function drawBrokenRobotArm(ctx, prop, time) {
  const s = prop.size;
  const spark = Math.sin(time * 11 + prop.phase) > 0.82;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.lineWidth = s * 0.28;
  ctx.beginPath();
  ctx.moveTo(-s * 0.92, s * 0.28);
  ctx.lineTo(-s * 0.28, -s * 0.1);
  ctx.lineTo(s * 0.42, s * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(154,166,182,0.8)";
  ctx.lineWidth = s * 0.16;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.beginPath();
  ctx.arc(-s * 0.28, -s * 0.1, s * 0.26, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.stroke();
  if (spark) {
    ctx.strokeStyle = hexToRgba("#ff7a1a", 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.48, s * 0.16);
    ctx.lineTo(s * 0.72, -s * 0.1);
    ctx.moveTo(s * 0.42, s * 0.24);
    ctx.lineTo(s * 0.68, s * 0.4);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawLeakingPipeVent(ctx, prop, time) {
  const s = prop.size;
  drawVentPipe(ctx, prop, time);
  const leak = 0.16 + Math.max(0, Math.sin(time * 1.8 + prop.phase)) * 0.08;
  ctx.fillStyle = hexToRgba(prop.color, leak);
  ctx.beginPath();
  ctx.ellipse(s * 1.08, s * 0.18, s * 0.2, s * 0.48, 0.2, 0, TAU);
  ctx.fill();
}

function drawSteamLeak(ctx, prop, time) {
  const s = prop.size;
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 4; i++) {
    const k = (time * 0.45 + prop.phase + i * 0.27) % 1;
    const y = -s * (0.18 + k * 1.05);
    const x = Math.sin(time * 1.2 + i + prop.phase) * s * 0.18;
    ctx.fillStyle = hexToRgba(prop.color, (1 - k) * 0.055);
    ctx.beginPath();
    ctx.ellipse(x, y, s * (0.28 + k * 0.34), s * (0.12 + k * 0.18), 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(-s * 0.42, -s * 0.08, s * 0.84, s * 0.16);
}

function drawSwingingCable(ctx, prop, time) {
  const s = prop.size;
  const sway = Math.sin(time * 0.85 + prop.phase) * s * 0.18;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.68)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.08);
  ctx.bezierCurveTo(sway, -s * 0.45, -sway * 0.4, s * 0.16, sway * 0.25, s * 0.96);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(prop.color, 0.75);
  ctx.lineWidth = 2.4;
  ctx.stroke();
  if (Math.sin(time * 13 + prop.phase) > 0.86) {
    ctx.fillStyle = hexToRgba("#ff7a1a", 0.7);
    ctx.fillRect(sway * 0.25 - 2, s * 0.85, 4, 4);
  }
  ctx.lineCap = "butt";
}

function drawFlickerBeacon(ctx, prop, time) {
  const s = prop.size;
  const flicker = Math.max(0.15, Math.sin(time * 8 + prop.phase));
  glow(ctx, 0, 0, s * 1.9, prop.color, 0.08 * flicker);
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  ctx.fillStyle = hexToRgba(prop.color, 0.26 + flicker * 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.22, 0, TAU);
  ctx.fill();
}

function drawSecurityCameraShell(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.54)";
  ctx.fillRect(-s * 0.72, -s * 0.34, s * 1.26, s * 0.68);
  ctx.fillStyle = "rgba(154,166,182,0.72)";
  ctx.fillRect(-s * 0.58, -s * 0.24, s * 0.9, s * 0.48);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.58, -s * 0.24, s * 0.9, s * 0.48);
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.fillRect(s * 0.18, -s * 0.14, s * 0.38, s * 0.28);
  ctx.strokeStyle = "rgba(100,116,139,0.55)";
  ctx.beginPath();
  ctx.moveTo(-s * 0.8, -s * 0.38);
  ctx.lineTo(-s * 0.38, -s * 0.12);
  ctx.moveTo(-s * 0.84, s * 0.38);
  ctx.lineTo(-s * 0.38, s * 0.12);
  ctx.stroke();
}

function drawWallPanelPatch(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(-s * 0.8, -s * 0.54, s * 1.6, s * 1.08);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.8, -s * 0.54, s * 1.6, s * 1.08);
  ctx.strokeStyle = hexToRgba(prop.color, 0.18);
  for (let i = 0; i < 3; i++) {
    const x = -s * 0.48 + i * s * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, -s * 0.34);
    ctx.lineTo(x + s * 0.22, s * 0.32);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-s * 0.65, -s * 0.42, 4, 4);
  ctx.fillRect(s * 0.52, s * 0.32, 4, 4);
}

function drawSampleTray(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.12 + Math.max(0, Math.sin(time * 2.2 + prop.phase)) * 0.08;
  ctx.fillStyle = "rgba(0,0,0,0.46)";
  ctx.fillRect(-s * 0.95, -s * 0.42, s * 1.9, s * 0.84);
  ctx.strokeStyle = "rgba(217,251,255,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.95, -s * 0.42, s * 1.9, s * 0.84);
  for (let i = 0; i < 4; i++) {
    const x = -s * 0.56 + i * s * 0.34;
    ctx.fillStyle = hexToRgba(i % 2 ? "#d9fbff" : prop.color, 0.12 + pulse);
    ctx.fillRect(x - s * 0.08, -s * 0.22, s * 0.16, s * 0.44);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x - s * 0.04, -s * 0.18, s * 0.03, s * 0.28);
  }
}

function drawCoolantValve(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.12 + Math.max(0, Math.sin(time * 1.8 + prop.phase)) * 0.06;
  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.lineWidth = s * 0.28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 1.0, 0);
  ctx.lineTo(s * 1.0, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(154,166,182,0.75)";
  ctx.lineWidth = s * 0.15;
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = hexToRgba(prop.color, 0.24 + pulse);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.34, 0, TAU);
  ctx.moveTo(-s * 0.34, 0);
  ctx.lineTo(s * 0.34, 0);
  ctx.moveTo(0, -s * 0.34);
  ctx.lineTo(0, s * 0.34);
  ctx.stroke();
}

function drawBurntKeyboard(ctx, prop, time) {
  const s = prop.size;
  const flicker = Math.max(0, Math.sin(time * 5.5 + prop.phase));
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(-s * 0.94, -s * 0.36, s * 1.88, s * 0.72);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.strokeRect(-s * 0.94, -s * 0.36, s * 1.88, s * 0.72);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      ctx.fillStyle = col === 3 && row === 1 ? hexToRgba(prop.color, 0.12 + flicker * 0.16) : "rgba(255,255,255,0.08)";
      ctx.fillRect(-s * 0.68 + col * s * 0.28, -s * 0.18 + row * s * 0.22, s * 0.16, s * 0.09);
    }
  }
  ctx.strokeStyle = "rgba(154,79,47,0.28)";
  ctx.beginPath();
  ctx.moveTo(s * 0.44, -s * 0.28);
  ctx.lineTo(s * 0.72, s * 0.18);
  ctx.stroke();
}

function drawTornSealCrate(ctx, prop) {
  const s = prop.size;
  drawStorageProp(ctx, prop);
  ctx.strokeStyle = hexToRgba(prop.color, 0.26);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.2);
  ctx.lineTo(-s * 0.28, s * 0.08);
  ctx.lineTo(s * 0.12, -s * 0.16);
  ctx.lineTo(s * 0.7, s * 0.18);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,209,102,0.1)";
  ctx.fillRect(-s * 0.54, s * 0.25, s * 0.9, 4);
}

function drawEnergyNodeBase(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.1 + Math.max(0, Math.sin(time * 2.4 + prop.phase)) * 0.08;
  glow(ctx, 0, 0, s * 1.1, prop.color, pulse * 0.55);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.66);
  ctx.lineTo(s * 0.62, -s * 0.18);
  ctx.lineTo(s * 0.42, s * 0.52);
  ctx.lineTo(-s * 0.42, s * 0.52);
  ctx.lineTo(-s * 0.62, -s * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexToRgba(prop.color, 0.24 + pulse);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hexToRgba(prop.color, 0.16 + pulse);
  ctx.fillRect(-s * 0.2, -s * 0.1, s * 0.4, s * 0.2);
}

function drawDripValve(ctx, prop, time) {
  const s = prop.size;
  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.48);
  ctx.lineTo(s * 0.42, -s * 0.48);
  ctx.stroke();
  ctx.strokeStyle = "rgba(154,166,182,0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hexToRgba(prop.color, 0.18);
  ctx.fillRect(-s * 0.12, -s * 0.48, s * 0.24, s * 0.28);
  for (let i = 0; i < 3; i++) {
    const k = (time * 0.75 + prop.phase + i * 0.33) % 1;
    ctx.fillStyle = hexToRgba(prop.color, (1 - k) * 0.24);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.12 + k * s * 1.1, s * (0.06 + k * 0.04), s * (0.1 + k * 0.05), 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = hexToRgba(prop.color, 0.055);
  ctx.beginPath();
  ctx.ellipse(0, s * 0.86, s * 0.44, s * 0.14, 0, 0, TAU);
  ctx.fill();
}

function drawFaultyScreenStrip(ctx, prop, time) {
  const s = prop.size;
  const scan = (time * 1.2 + prop.phase) % 1;
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(-s * 0.95, -s * 0.38, s * 1.9, s * 0.76);
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.strokeRect(-s * 0.95, -s * 0.38, s * 1.9, s * 0.76);
  ctx.fillStyle = hexToRgba(prop.color, 0.1);
  ctx.fillRect(-s * 0.78, -s * 0.24, s * 1.56, s * 0.48);
  ctx.fillStyle = hexToRgba(prop.color, 0.28);
  ctx.fillRect(-s * 0.72, -s * 0.22 + scan * s * 0.36, s * 1.44, 3);
  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fillRect(-s * 0.6, -s * 0.14, s * 0.38, 2);
  ctx.fillRect(s * 0.08, s * 0.1, s * 0.42, 2);
}

function drawFog(ctx, map, camX, camY, viewW, viewH, time) {
  for (const fog of map.fogBanks || []) {
    if (!rectVisible(fog.x - fog.rx, fog.y - fog.ry, fog.rx * 2, fog.ry * 2, camX, camY, viewW, viewH, 120)) continue;
    drawFogBank(ctx, fog, time);
  }
}

function drawFogBank(ctx, fog, time) {
  ctx.save();
  ctx.translate(fog.x + Math.sin(time * 0.16 + fog.phase) * 20, fog.y + Math.cos(time * 0.12 + fog.phase) * 14);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const a = fog.phase + i * 1.91;
    const ox = Math.cos(a) * fog.rx * 0.13 + Math.sin(time * 0.12 + a) * 16;
    const oy = Math.sin(a) * fog.ry * 0.24;
    const rx = fog.rx * (0.42 + i * 0.08);
    const ry = fog.ry * (0.36 + (2 - i) * 0.05);
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, Math.max(rx, ry));
    grad.addColorStop(0, hexToRgba(fog.color, fog.alpha * (0.44 - i * 0.06)));
    grad.addColorStop(0.6, hexToRgba(fog.color, fog.alpha * 0.12));
    grad.addColorStop(1, hexToRgba(fog.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, Math.sin(a) * 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function rectVisible(x, y, w, h, camX, camY, viewW, viewH, pad = 0) {
  return x <= camX + viewW + pad && x + w >= camX - pad && y <= camY + viewH + pad && y + h >= camY - pad;
}

function glow(ctx, x, y, r, color, alpha) {
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
