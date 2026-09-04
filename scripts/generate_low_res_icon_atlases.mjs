import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CELL = 32;

const C = {
  ink: [226, 246, 255, 255],
  dark: [8, 12, 24, 255],
  metal: [37, 52, 78, 255],
  metal2: [75, 91, 122, 255],
  cyan: [66, 232, 255, 255],
  blue: [39, 112, 255, 255],
  magenta: [255, 76, 230, 255],
  violet: [180, 140, 255, 255],
  green: [119, 255, 138, 255],
  gold: [255, 209, 102, 255],
  red: [255, 77, 109, 255],
  orange: [255, 139, 64, 255],
  shadow: [0, 0, 0, 150],
};

function makeAtlas(cols, rows) {
  return { w: cols * CELL, h: rows * CELL, data: new Uint8Array(cols * CELL * rows * CELL * 4) };
}

function put(atlas, x, y, color) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= atlas.w || y >= atlas.h) return;
  const i = (y * atlas.w + x) * 4;
  const a = color[3] / 255;
  const inv = 1 - a;
  atlas.data[i] = Math.round(color[0] * a + atlas.data[i] * inv);
  atlas.data[i + 1] = Math.round(color[1] * a + atlas.data[i + 1] * inv);
  atlas.data[i + 2] = Math.round(color[2] * a + atlas.data[i + 2] * inv);
  atlas.data[i + 3] = Math.min(255, Math.round(color[3] + atlas.data[i + 3] * inv));
}

function rect(atlas, ox, oy, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(atlas, ox + xx, oy + yy, color);
}

function line(atlas, ox, oy, x0, y0, x1, y1, color, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    rect(atlas, ox, oy, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
  }
}

function diamond(atlas, ox, oy, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    const span = r - Math.abs(y);
    rect(atlas, ox, oy, cx - span, cy + y, span * 2 + 1, 1, color);
  }
}

function circle(atlas, ox, oy, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(atlas, ox + cx + x, oy + cy + y, color);
}

function glow(atlas, ox, oy, cx, cy, r, color) {
  const soft = [color[0], color[1], color[2], 62];
  circle(atlas, ox, oy, cx, cy, r, soft);
}

function cell(atlas, col, row, draw) {
  draw(col * CELL, row * CELL);
}

function gun(atlas, ox, oy, color, accent = C.gold) {
  rect(atlas, ox, oy, 6, 16, 15, 6, C.metal);
  rect(atlas, ox, oy, 9, 12, 11, 4, C.metal2);
  rect(atlas, ox, oy, 20, 14, 6, 4, color);
  rect(atlas, ox, oy, 5, 21, 5, 5, C.dark);
  rect(atlas, ox, oy, 8, 18, 4, 3, accent);
  line(atlas, ox, oy, 23, 15, 28, 12, color, 2);
}

function blade(atlas, ox, oy, color) {
  line(atlas, ox, oy, 7, 22, 23, 8, C.metal2, 5);
  line(atlas, ox, oy, 10, 21, 25, 7, color, 2);
  rect(atlas, ox, oy, 7, 20, 5, 5, C.gold);
  glow(atlas, ox, oy, 23, 9, 5, color);
}

const weaponDraws = [
  (a, x, y) => { gun(a, x, y, C.cyan); line(a, x, y, 23, 12, 18, 6, C.cyan, 2); line(a, x, y, 24, 14, 28, 8, C.magenta, 1); },
  (a, x, y) => { gun(a, x, y, C.cyan); diamond(a, x, y, 24, 12, 6, C.cyan); rect(a, x, y, 22, 10, 4, 4, C.ink); },
  (a, x, y) => { rect(a, x, y, 6, 14, 16, 8, C.metal); rect(a, x, y, 20, 10, 7, 4, C.red); rect(a, x, y, 20, 18, 7, 4, C.red); rect(a, x, y, 9, 22, 6, 3, C.gold); },
  (a, x, y) => { line(a, x, y, 8, 22, 24, 8, C.green, 4); line(a, x, y, 24, 8, 25, 20, C.cyan, 4); rect(a, x, y, 14, 14, 5, 5, C.metal); },
  (a, x, y) => { circle(a, x, y, 16, 16, 7, C.metal); circle(a, x, y, 16, 16, 3, C.cyan); rect(a, x, y, 6, 9, 7, 3, C.cyan); rect(a, x, y, 19, 9, 7, 3, C.cyan); rect(a, x, y, 8, 22, 4, 5, C.metal2); rect(a, x, y, 20, 22, 4, 5, C.metal2); },
  (a, x, y) => { gun(a, x, y, C.magenta); line(a, x, y, 16, 13, 27, 9, C.violet, 3); diamond(a, x, y, 24, 10, 4, C.magenta); },
  (a, x, y) => { gun(a, x, y, C.violet); circle(a, x, y, 23, 15, 7, C.violet); circle(a, x, y, 23, 15, 4, C.dark); rect(a, x, y, 20, 14, 6, 2, C.magenta); },
  (a, x, y) => { for (const p of [[10,11],[22,10],[23,22],[9,23]]) circle(a, x, y, p[0], p[1], 4, C.metal); line(a, x, y, 10, 11, 22, 10, C.cyan, 2); line(a, x, y, 22, 10, 23, 22, C.cyan, 2); line(a, x, y, 23, 22, 9, 23, C.cyan, 2); },
  (a, x, y) => { line(a, x, y, 10, 25, 19, 7, C.gold, 4); diamond(a, x, y, 18, 10, 7, C.violet); rect(a, x, y, 8, 25, 6, 3, C.magenta); },
  (a, x, y) => { gun(a, x, y, C.green); line(a, x, y, 20, 13, 28, 8, C.green, 2); line(a, x, y, 20, 18, 28, 23, C.green, 2); },
  (a, x, y) => { line(a, x, y, 13, 23, 22, 8, C.cyan, 4); circle(a, x, y, 13, 23, 3, C.gold); line(a, x, y, 20, 11, 27, 18, C.cyan, 2); line(a, x, y, 20, 11, 13, 8, C.cyan, 2); },
  (a, x, y) => { diamond(a, x, y, 16, 16, 9, C.violet); diamond(a, x, y, 16, 16, 5, C.magenta); line(a, x, y, 6, 16, 26, 16, C.gold, 2); line(a, x, y, 16, 6, 16, 26, C.cyan, 2); },
];

const upgradeDraws = [
  (a, x, y) => { diamond(a, x, y, 16, 16, 11, C.metal); rect(a, x, y, 12, 12, 8, 8, C.red); rect(a, x, y, 14, 14, 4, 4, C.gold); },
  (a, x, y) => { rect(a, x, y, 12, 6, 8, 20, C.green); rect(a, x, y, 10, 8, 12, 16, C.metal2); rect(a, x, y, 14, 12, 4, 8, C.green); rect(a, x, y, 12, 15, 8, 2, C.ink); },
  (a, x, y) => { rect(a, x, y, 9, 17, 13, 7, C.metal); rect(a, x, y, 15, 8, 7, 10, C.metal2); line(a, x, y, 10, 24, 26, 22, C.cyan, 2); },
  (a, x, y) => { circle(a, x, y, 16, 16, 10, C.cyan); circle(a, x, y, 16, 16, 7, [0, 0, 0, 0]); circle(a, x, y, 16, 16, 4, C.metal); rect(a, x, y, 15, 6, 2, 20, C.magenta); },
  (a, x, y) => { diamond(a, x, y, 16, 15, 11, C.violet); line(a, x, y, 9, 22, 22, 8, C.magenta, 2); rect(a, x, y, 13, 13, 6, 6, C.dark); },
  (a, x, y) => { rect(a, x, y, 9, 10, 14, 12, C.metal); rect(a, x, y, 21, 12, 4, 8, C.red); rect(a, x, y, 11, 12, 4, 3, C.gold); line(a, x, y, 25, 14, 29, 10, C.orange, 2); },
  (a, x, y) => { rect(a, x, y, 8, 13, 15, 9, C.metal); circle(a, x, y, 22, 17, 6, C.cyan); circle(a, x, y, 22, 17, 3, C.dark); },
  (a, x, y) => { circle(a, x, y, 16, 16, 10, C.metal); line(a, x, y, 16, 7, 16, 25, C.gold, 2); line(a, x, y, 7, 16, 25, 16, C.gold, 2); diamond(a, x, y, 16, 16, 4, C.red); },
  (a, x, y) => { rect(a, x, y, 9, 8, 14, 19, C.metal2); rect(a, x, y, 12, 11, 8, 12, C.dark); rect(a, x, y, 14, 8, 4, 3, C.cyan); },
  (a, x, y) => { diamond(a, x, y, 16, 15, 9, C.violet); rect(a, x, y, 12, 11, 8, 10, C.dark); line(a, x, y, 8, 23, 24, 23, C.cyan, 2); },
  (a, x, y) => { rect(a, x, y, 8, 13, 16, 11, C.gold); rect(a, x, y, 9, 10, 14, 5, C.metal); diamond(a, x, y, 16, 15, 4, C.green); rect(a, x, y, 12, 6, 3, 3, C.green); rect(a, x, y, 22, 8, 3, 3, C.green); },
];

const itemDraws = [
  upgradeDraws[0], upgradeDraws[1],
  (a, x, y) => { line(a, x, y, 9, 8, 23, 24, C.metal2, 4); line(a, x, y, 23, 8, 9, 24, C.metal2, 4); rect(a, x, y, 14, 14, 4, 4, C.red); },
  upgradeDraws[9],
  (a, x, y) => { circle(a, x, y, 16, 16, 9, C.red); rect(a, x, y, 12, 9, 8, 10, C.dark); rect(a, x, y, 14, 19, 4, 5, C.gold); },
  upgradeDraws[3], upgradeDraws[2],
  (a, x, y) => { line(a, x, y, 8, 17, 24, 17, C.cyan, 3); rect(a, x, y, 10, 10, 4, 14, C.metal); rect(a, x, y, 18, 10, 4, 14, C.metal); },
  (a, x, y) => { line(a, x, y, 10, 8, 21, 23, C.red, 4); rect(a, x, y, 12, 11, 4, 4, C.ink); },
  (a, x, y) => { gun(a, x, y, C.cyan); line(a, x, y, 21, 14, 28, 9, C.cyan, 1); line(a, x, y, 21, 18, 28, 23, C.cyan, 1); },
  (a, x, y) => { rect(a, x, y, 14, 8, 4, 16, C.green); rect(a, x, y, 9, 13, 14, 4, C.green); rect(a, x, y, 7, 7, 5, 5, C.gold); },
  (a, x, y) => { rect(a, x, y, 9, 13, 14, 10, C.metal2); rect(a, x, y, 12, 9, 8, 6, C.metal); rect(a, x, y, 15, 16, 3, 5, C.cyan); },
  (a, x, y) => { blade(a, x, y, C.ink); line(a, x, y, 12, 18, 24, 8, C.ink, 3); line(a, x, y, 13, 17, 24, 8, C.ink, 1); },
  (a, x, y) => { circle(a, x, y, 16, 16, 9, C.green); circle(a, x, y, 16, 16, 5, [0, 0, 0, 0]); line(a, x, y, 6, 16, 26, 16, C.green, 1); },
  (a, x, y) => { circle(a, x, y, 16, 16, 9, C.metal2); rect(a, x, y, 13, 9, 6, 14, C.cyan); rect(a, x, y, 10, 13, 12, 6, C.dark); },
  upgradeDraws[8],
  (a, x, y) => { rect(a, x, y, 10, 11, 12, 12, C.metal); rect(a, x, y, 14, 6, 4, 6, C.cyan); rect(a, x, y, 7, 16, 5, 4, C.metal2); rect(a, x, y, 20, 16, 5, 4, C.metal2); },
  (a, x, y) => { diamond(a, x, y, 16, 16, 10, C.magenta); rect(a, x, y, 13, 13, 6, 6, C.dark); line(a, x, y, 5, 8, 12, 13, C.gold, 2); },
  (a, x, y) => { diamond(a, x, y, 16, 16, 10, C.violet); line(a, x, y, 8, 24, 24, 8, C.cyan, 2); rect(a, x, y, 14, 14, 4, 4, C.magenta); },
  (a, x, y) => { circle(a, x, y, 16, 18, 7, C.metal); rect(a, x, y, 14, 8, 4, 8, C.red); rect(a, x, y, 11, 25, 10, 2, C.gold); },
  (a, x, y) => { rect(a, x, y, 8, 17, 16, 6, C.metal); line(a, x, y, 9, 15, 23, 9, C.cyan, 2); line(a, x, y, 9, 19, 23, 25, C.magenta, 2); },
];

function decorateAtlas(atlas, draws) {
  draws.forEach((draw, index) => {
    const ox = index % Math.floor(atlas.w / CELL) * CELL;
    const oy = Math.floor(index / Math.floor(atlas.w / CELL)) * CELL;
    glow(atlas, ox, oy, 16, 16, 12, index % 3 === 0 ? C.cyan : index % 3 === 1 ? C.magenta : C.green);
    draw(atlas, ox, oy);
    rect(atlas, ox, oy, 5, 25, 22, 2, C.shadow);
  });
}

function png(atlas) {
  const raw = Buffer.alloc((atlas.w * 4 + 1) * atlas.h);
  for (let y = 0; y < atlas.h; y++) {
    const row = y * (atlas.w * 4 + 1);
    raw[row] = 0;
    Buffer.from(atlas.data.buffer, y * atlas.w * 4, atlas.w * 4).copy(raw, row + 1);
  }
  const chunks = [
    chunk("IHDR", Buffer.concat([u32(atlas.w), u32(atlas.h), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.concat([name, data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const weaponAtlas = makeAtlas(4, 3);
decorateAtlas(weaponAtlas, weaponDraws);
writeFileSync(resolve(ROOT, "assets/ui/weapon-atlas-v1.png"), png(weaponAtlas));

const upgradeAtlas = makeAtlas(4, 3);
decorateAtlas(upgradeAtlas, upgradeDraws);
writeFileSync(resolve(ROOT, "assets/ui/upgrade-atlas-v1.png"), png(upgradeAtlas));

const itemAtlas = makeAtlas(7, 3);
decorateAtlas(itemAtlas, itemDraws);
writeFileSync(resolve(ROOT, "assets/visual/item-atlas-v1.png"), png(itemAtlas));

console.log("generated low-res icon atlases", {
  cell: CELL,
  weapon: `${weaponAtlas.w}x${weaponAtlas.h}`,
  upgrade: `${upgradeAtlas.w}x${upgradeAtlas.h}`,
  item: `${itemAtlas.w}x${itemAtlas.h}`,
});
