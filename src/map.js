import { WORLD_SIZE, TAU } from "./constants.js";
import { hexToRgba, mulberry32 } from "./utils.js";

const LAB_PALETTE = {
  base: "#071018",
  dark: "#03070d",
  floor: ["#111a22", "#151f29", "#18252f", "#0e171f"],
  roomFloor: ["#18232b", "#1b2933", "#202f38", "#142028"],
  corridor: ["#101922", "#13202a", "#162531"],
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

  return { tileSize, palette: LAB_PALETTE, rooms, corridors, tiles, props, energyLines, floorDecals, cableRuns, fogBanks };
}

export function drawMap(ctx, map, camX, camY, viewW, viewH, time) {
  if (!map) return;
  drawBase(ctx, map, camX, camY, viewW, viewH, time);
  drawTiles(ctx, map, camX, camY, viewW, viewH, time);
  drawFloorDecals(ctx, map, camX, camY, viewW, viewH, time);
  drawCableRuns(ctx, map, camX, camY, viewW, viewH, time);
  drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time);
  drawRoomBorders(ctx, map, camX, camY, viewW, viewH);
  drawProps(ctx, map, camX, camY, viewW, viewH, time);
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
  return {
    x, y, w, h, zone,
    color: floor[Math.floor(rng() * floor.length)],
    accent,
    panel: rng() < (corridor ? 0.78 : 0.62),
    grate: rng() < (zone === "service" ? 0.28 : 0.12),
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

function maybeAddRoomDecal(rng, x, y, w, h, zone, decals) {
  if (rng() < 0.08) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "scorch", LAB_PALETTE.rust, rng() * TAU, w, h));
  if (rng() < 0.045) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "spill", zone === "bio" ? "#72ffb4" : "#7dd3fc", rng() * TAU, w, h));
  if (rng() < 0.035) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "hatch", LAB_PALETTE.line, rng() * TAU, w, h));
  if (zone === "service" && rng() < 0.08) decals.push(createDecal(rng, x + w * 0.5, y + h * 0.5, "grate", LAB_PALETTE.line, rng() * TAU, w, h));
}

function addFixedRoomProps(rng, room, props, decals, energyLines, cables, fogBanks) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const accent = room.zone === "bio" ? "#72ffb4" : room.zone === "cryo" ? "#7dd3fc" : room.zone === "control" ? "#ffd166" : LAB_PALETTE.line;
  props.push(createProp(rng, room.x + 42, room.y + 42, "wallLight", 18, accent, 0));
  props.push(createProp(rng, room.x + room.w - 42, room.y + room.h - 42, "wallLight", 18, accent, Math.PI));

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

  if (rng() < 0.7) cables.push(createCable(rng, room.x + 60, cy, true, accent, room.w - 120));
  if (rng() < 0.55) cables.push(createCable(rng, cx, room.y + 60, false, accent, room.h - 120));
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

function drawBase(ctx, map, camX, camY, viewW, viewH, time) {
  const g = ctx.createLinearGradient(camX, camY, camX + viewW, camY + viewH);
  g.addColorStop(0, map.palette.dark);
  g.addColorStop(0.5, map.palette.base);
  g.addColorStop(1, "#050910");
  ctx.fillStyle = g;
  ctx.fillRect(camX, camY, viewW, viewH);
  ctx.fillStyle = `rgba(125,211,252,${0.018 + Math.sin(time * 0.45) * 0.006})`;
  ctx.fillRect(camX, camY, viewW, viewH);
}

function drawTiles(ctx, map, camX, camY, viewW, viewH, time) {
  for (const tile of map.tiles) {
    if (!rectVisible(tile.x, tile.y, tile.w, tile.h, camX, camY, viewW, viewH, 80)) continue;
    ctx.fillStyle = tile.color;
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
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
  ctx.fillStyle = tile.w > 130 || tile.h > 130 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.055)";
  ctx.fillRect(tile.x + inset, tile.y + inset, tile.w - inset * 2, tile.h - inset * 2);
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
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(x, y, w, h);
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

function drawCableRuns(ctx, map, camX, camY, viewW, viewH, time) {
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
    ctx.strokeStyle = hexToRgba(c.color, c.broken ? 0.1 : 0.2 + Math.max(0, Math.sin(time * 3 + c.phase)) * 0.2);
    ctx.lineWidth = c.broken ? 2 : 3;
    ctx.stroke();
    if (c.broken && Math.sin(time * 18 + c.phase) > 0.78) {
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
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  ctx.lineWidth = 4;
  for (const room of map.rooms || []) {
    if (!rectVisible(room.x, room.y, room.w, room.h, camX, camY, viewW, viewH, 80)) continue;
    ctx.strokeRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x + 8, room.y + 8, room.w - 16, room.h - 16);
    ctx.strokeStyle = "rgba(255,255,255,0.075)";
    ctx.lineWidth = 4;
  }
}

function drawProps(ctx, map, camX, camY, viewW, viewH, time) {
  for (const prop of map.props || []) {
    const pad = Math.max(110, prop.size * 3.2);
    if (!rectVisible(prop.x - pad, prop.y - pad, pad * 2, pad * 2, camX, camY, viewW, viewH, 90)) continue;
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rot);
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
    else drawStorageProp(ctx, prop);
    ctx.restore();
  }
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
