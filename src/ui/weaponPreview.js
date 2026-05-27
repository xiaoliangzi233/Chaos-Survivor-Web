const TAU = Math.PI * 2;
const QUALITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const QUALITY_COLORS = {
  common: "#cbd5e1",
  uncommon: "#77ff8a",
  rare: "#42e8ff",
  epic: "#b48cff",
  legendary: "#ffd166",
};

function qualityRank(weapon) {
  return Math.max(0, QUALITY_ORDER.indexOf(weapon?.quality || "common"));
}

function qualityColor(weapon, fallback = "#42e8ff") {
  const quality = weapon?.quality || "common";
  return quality === "common" ? fallback : QUALITY_COLORS[quality] || fallback;
}

export function startWeaponPreview(canvas, getWeapon) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let stopped = false;

  function frame(now) {
    if (stopped) return;
    drawWeaponPreview(ctx, canvas, getWeapon(), now / 1000);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export function drawWeaponPreview(ctx, canvas, weapon, t) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(220, canvas.clientWidth || 360);
  const h = Math.max(150, canvas.clientHeight || 200);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(3,8,16,0.84)";
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h, t);
  const cx = w / 2;
  const cy = h / 2;
  if (!weapon) return;
  const rank = qualityRank(weapon);
  const baseColor = { arc: "#42e8ff", ice: "#9ff4ff", missile: "#ffb347", boomerang: "#ff65d8", drone: "#77ff8a", pulse: "#77ff8a", prism_railgun: "#7df9ff", void_singularity: "#8b5cf6" }[weapon.id] || "#42e8ff";
  const color = qualityColor(weapon, baseColor);
  const scale = Math.min(1, Math.max(0.46, Math.min((w * 0.5 - 24) / 190, (h * 0.5 - 22) / 96)));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  drawPlayerHead(ctx, 0, 0, t);
  if (weapon.id === "arc") drawArc(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "ice") drawIce(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "missile") drawMissile(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "boomerang") drawBoomerang(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "drone") drawDrones(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "pulse") drawPulse(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "prism_railgun") drawPrismRailgun(ctx, 0, 0, t, rank, color);
  else if (weapon.id === "void_singularity") drawVoidSingularity(ctx, 0, 0, t, rank, color);
  ctx.restore();
}

function drawGrid(ctx, w, h, t) {
  ctx.strokeStyle = "rgba(66,232,255,0.08)";
  ctx.lineWidth = 1;
  const offset = (t * 18) % 24;
  for (let x = -offset; x < w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = offset; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPlayerHead(ctx, x, y, t) {
  glow(ctx, x, y, 26, "#ffd6a8", 0.28);
  ctx.fillStyle = "#ffd6a8";
  ctx.beginPath();
  ctx.arc(x, y, 20 + Math.sin(t * 5) * 0.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7b4a2b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#2a1d18";
  ctx.beginPath();
  ctx.arc(x - 7, y - 5, 2.5, 0, TAU);
  ctx.arc(x + 7, y - 5, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7b2f2f";
  ctx.beginPath();
  ctx.arc(x, y + 3, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

function drawArc(ctx, cx, cy, t, rank, color) {
  const targets = [
    { x: cx + 88, y: cy - 44 },
    { x: cx + 132, y: cy + 20 },
    { x: cx + 56, y: cy + 58 },
    { x: cx - 70, y: cy + 46 },
  ];
  let from = { x: cx, y: cy };
  const count = Math.min(targets.length, 3 + (rank >= 1 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const to = targets[i];
    drawDummy(ctx, to.x, to.y, color);
    lightning(ctx, from.x, from.y, to.x, to.y, t, color);
    if (rank >= 2 && i > 0) lightning(ctx, to.x, to.y, to.x + 28, to.y - 24, t + i, color, 0.58);
    if (rank >= 3 && i === 0) ring(ctx, to.x, to.y, 28 + Math.sin(t * 8) * 3, color, 0.7);
    from = to;
  }
  if (rank >= 4) {
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + t;
      lightning(ctx, from.x, from.y, from.x + Math.cos(a) * 42, from.y + Math.sin(a) * 28, t + i, "#ffd166", 0.75);
    }
  }
}

function drawIce(ctx, cx, cy, t, rank, color) {
  const count = 3 + (rank >= 1 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const a = -0.4 + i * 0.4 + Math.sin(t * 1.7) * 0.08;
    const x = cx + Math.cos(a) * (64 + i * 22);
    const y = cy + Math.sin(a) * (64 + i * 22);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    glow(ctx, 0, 0, 15 + rank, color, 0.42);
    crystal(ctx, 15, color, rank);
    ctx.restore();
  }
  if (rank >= 2) ring(ctx, cx + 118, cy - 26, 34, color, 0.56);
  if (rank >= 4) frostPatch(ctx, cx + 116, cy + 38, 46, color, t);
}

function drawMissile(ctx, cx, cy, t, rank, color) {
  const a = -0.25 + Math.sin(t * 2) * 0.12;
  const x = cx + Math.cos(a) * 86;
  const y = cy + Math.sin(a) * 86;
  const tx = x - Math.cos(a) * 54;
  const ty = y - Math.sin(a) * 54;
  const grad = ctx.createLinearGradient(tx, ty, x, y);
  grad.addColorStop(0, "rgba(255,77,109,0)");
  grad.addColorStop(1, color);
  ctx.strokeStyle = grad;
  ctx.lineWidth = rank >= 1 ? 10 : 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  missile(ctx, 6 + rank * 0.35, color, rank);
  ctx.restore();
  drawExplosion(ctx, cx + 128, cy - 34, 30 + Math.sin(t * 7) * 5, color);
  if (rank >= 2) {
    drawExplosion(ctx, cx + 104, cy + 20, 14, color);
    drawExplosion(ctx, cx + 152, cy + 14, 14, color);
  }
  if (rank >= 4) {
    for (let i = 0; i < 3; i++) {
      const ma = -0.95 + i * 0.45;
      ctx.save();
      ctx.translate(cx + 35 + i * 20, cy - 58 + i * 11);
      ctx.rotate(ma);
      missile(ctx, 3.2, color, rank);
      ctx.restore();
    }
  }
}

function drawBoomerang(ctx, cx, cy, t, rank, color) {
  for (let i = 0; i < 2; i++) {
    const a = t * 1.9 + i * Math.PI;
    const x = cx + Math.cos(a) * (rank >= 1 ? 118 : 94);
    const y = cy + Math.sin(a) * (rank >= 1 ? 52 : 42);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 12);
    glow(ctx, 0, 0, 18 + rank * 2, color, 0.45);
    starBlade(ctx, 16, color, rank);
    ctx.restore();
  }
  if (rank >= 3) ring(ctx, cx + 118, cy, 34 + Math.sin(t * 6) * 4, color, 0.62);
  if (rank >= 4) ring(ctx, cx - 92, cy - 30, 28, "#ffd166", 0.55);
}

function drawDrones(ctx, cx, cy, t, rank, color) {
  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * TAU / 3;
    const attack = i === 0;
    const r = attack ? 104 : 58;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.65;
    drone(ctx, x, y, t + i, attack, color, rank);
    if (attack) {
      ctx.strokeStyle = colorWithAlpha(color, rank >= 3 ? 0.9 : 0.75);
      ctx.lineWidth = rank >= 3 ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(x + 14, y);
      ctx.lineTo(x + 54, y - 14);
      ctx.stroke();
    }
  }
  if (rank >= 4) lightning(ctx, cx - 72, cy - 24, cx + 96, cy - 44, t, "#ffd166", 0.7);
}

function drawPulse(ctx, cx, cy, t, rank, color) {
  const r = 54 + Math.sin(t * 4) * 4 + rank * 4;
  ring(ctx, cx, cy, r, color, 0.8);
  if (rank >= 2) ring(ctx, cx, cy, r + 32, color, 0.42);
  if (rank >= 4) {
    ring(ctx, cx, cy, r * 0.62, "#ffffff", 0.5);
    ring(ctx, cx, cy, r + 54, "#ffd166", 0.36);
  }
}

function drawPrismRailgun(ctx, cx, cy, t, rank, color) {
  const angle = -0.16 + Math.sin(t * 1.6) * 0.035;
  const muzzleX = cx + Math.cos(angle) * 34;
  const muzzleY = cy + Math.sin(angle) * 34;
  const endX = cx + Math.cos(angle) * 170;
  const endY = cy + Math.sin(angle) * 170;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  ring(ctx, muzzleX, muzzleY, 28 + Math.sin(t * 7) * 3, color, 0.72);
  for (let i = 0; i < 3; i++) {
    const r = 18 + i * 11 + Math.sin(t * 4 + i) * 2;
    ctx.strokeStyle = colorWithAlpha(i === 1 ? "#ff65d8" : color, 0.42);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(muzzleX, muzzleY, r, t * (i + 1), t * (i + 1) + Math.PI * 1.2);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = colorWithAlpha(color, 0.24);
  ctx.lineWidth = rank >= 3 ? 24 : 18;
  ctx.beginPath();
  ctx.moveTo(muzzleX, muzzleY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = rank >= 1 ? 6 : 4;
  ctx.beginPath();
  ctx.moveTo(muzzleX, muzzleY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.strokeStyle = colorWithAlpha(rank >= 4 ? "#ffd166" : "#ff65d8", 0.72);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const k = ((i + t * 4) % 5) / 5;
    const x = muzzleX + (endX - muzzleX) * k;
    const y = muzzleY + (endY - muzzleY) * k;
    ctx.beginPath();
    ctx.moveTo(x - nx * 18, y - ny * 18);
    ctx.lineTo(x + nx * 18, y + ny * 18);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  const targets = [
    { x: cx + 82, y: cy - 18 },
    { x: cx + 126, y: cy - 26 },
    { x: cx + 148, y: cy + 18 },
  ];
  for (const target of targets) {
    drawDummy(ctx, target.x, target.y, color);
    ring(ctx, target.x, target.y, 17 + Math.sin(t * 8 + target.x) * 3, color, 0.45);
  }
  if (rank >= 2) {
    lightning(ctx, targets[0].x, targets[0].y, targets[0].x + 38, targets[0].y - 34, t, "#ff65d8", 0.72);
    lightning(ctx, targets[0].x, targets[0].y, targets[0].x + 44, targets[0].y + 28, t + 1, color, 0.6);
  }
  if (rank >= 4) {
    ctx.strokeStyle = colorWithAlpha("#ffd166", 0.52);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(muzzleX + nx * 22, muzzleY + ny * 22);
    ctx.lineTo(endX + nx * 22, endY + ny * 22);
    ctx.stroke();
  }
}

function drawVoidSingularity(ctx, cx, cy, t, rank, color) {
  const bx = cx + 92 + Math.sin(t * 1.4) * 10;
  const by = cy - 8 + Math.cos(t * 1.1) * 8;
  drawPreviewBlackHole(ctx, bx, by, 32 + rank * 3, 94 + rank * 10, t, rank, color);
  const targets = [
    { x: cx + 150, y: cy - 44, phase: 0 },
    { x: cx + 132, y: cy + 38, phase: 1.7 },
    { x: cx + 42, y: cy + 54, phase: 3.1 },
  ];
  for (const target of targets) {
    const dx = bx - target.x;
    const dy = by - target.y;
    const pull = 0.18 + Math.sin(t * 2.2 + target.phase) * 0.04;
    const x = target.x + dx * pull;
    const y = target.y + dy * pull;
    ctx.strokeStyle = colorWithAlpha(color, 0.24);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + bx) / 2 + Math.sin(t * 5 + target.phase) * 10, (y + by) / 2, bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    drawDummy(ctx, x, y, color);
  }
  const collapseT = (t % 3.2) / 3.2;
  if (collapseT > 0.78) {
    const k = (collapseT - 0.78) / 0.22;
    ring(ctx, bx, by, 38 + k * 72, rank >= 4 ? "#ffd166" : color, 0.75 * (1 - k));
    ring(ctx, bx, by, 20 + k * 44, "#ffffff", 0.42 * (1 - k));
  }
}

function drawPreviewBlackHole(ctx, x, y, core, diskR, t, rank, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 0, 0, diskR * 0.45, color, 0.28 + rank * 0.04);
  ctx.save();
  ctx.rotate(t * 1.8);
  ctx.scale(1, 0.42);
  const disk = ctx.createRadialGradient(0, 0, core * 0.4, 0, 0, diskR);
  disk.addColorStop(0, "rgba(0,0,0,0)");
  disk.addColorStop(0.42, colorWithAlpha("#ffffff", 0.15));
  disk.addColorStop(0.58, colorWithAlpha(color, 0.48));
  disk.addColorStop(0.78, colorWithAlpha(rank >= 4 ? "#ffd166" : "#ff65d8", 0.3));
  disk.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(0, 0, diskR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = colorWithAlpha(rank >= 4 ? "#ffd166" : color, 0.72);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, diskR * 0.56, t * 2, t * 2 + Math.PI * 1.45);
  ctx.stroke();
  if (rank >= 4) {
    ctx.rotate(-t * 2.8);
    ctx.strokeStyle = colorWithAlpha("#ffd166", 0.46);
    ctx.beginPath();
    ctx.arc(0, 0, diskR * 0.84, 0, Math.PI * 1.6);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = colorWithAlpha(color, 0.32);
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, diskR * 0.82, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 10; i++) {
    const a = t * (i % 2 ? -1.2 : 1.5) + i * TAU / 10;
    const r = core * (1.65 + (i % 3) * 0.35);
    ctx.fillStyle = colorWithAlpha(i % 2 ? "#ffffff" : color, 0.32 + (i % 3) * 0.1);
    ctx.fillRect(Math.cos(a) * r - 2, Math.sin(a) * r - 2, 4, 4);
  }
  const event = ctx.createRadialGradient(0, 0, 1, 0, 0, core * 1.7);
  event.addColorStop(0, "rgba(0,0,0,1)");
  event.addColorStop(0.54, "rgba(0,0,0,0.98)");
  event.addColorStop(0.72, colorWithAlpha("#ffffff", 0.82));
  event.addColorStop(0.88, colorWithAlpha(color, 0.86));
  event.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = event;
  ctx.beginPath();
  ctx.arc(0, 0, core * 1.7, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#02020a";
  ctx.beginPath();
  ctx.arc(0, 0, core, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawDummy(ctx, x, y, color) {
  glow(ctx, x, y, 17, color, 0.25);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x - 10, y - 10, 20, 20);
  ctx.strokeStyle = color;
  ctx.strokeRect(x - 10, y - 10, 20, 20);
}

function lightning(ctx, x1, y1, x2, y2, t, color = "#42e8ff", alpha = 1) {
  const steps = 7;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  ctx.lineCap = "round";
  ctx.strokeStyle = colorWithAlpha("#ffffff", 0.92 * alpha);
  ctx.lineWidth = 5;
  stroke();
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = 2;
  stroke();
  ctx.lineCap = "butt";

  function stroke() {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const off = i === 0 || i === steps ? 0 : Math.sin(t * 20 + i * 2.8) * 9;
      const x = x1 + dx * k + nx * off;
      const y = y1 + dy * k + ny * off;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function crystal(ctx, r, color = "#9ff4ff", rank = 0) {
  ctx.fillStyle = "#dffcff";
  ctx.beginPath();
  ctx.moveTo(r * 2.35, 0);
  ctx.lineTo(r * 0.48, r * 0.78);
  ctx.lineTo(-r * 0.72, r * 0.34);
  ctx.lineTo(-r * 1.12, 0);
  ctx.lineTo(-r * 0.72, -r * 0.34);
  ctx.lineTo(r * 0.48, -r * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = colorWithAlpha(color, 0.28);
  ctx.beginPath();
  ctx.moveTo(r * 0.2, 0);
  ctx.lineTo(r * 1.75, -r * 0.33);
  ctx.lineTo(r * 1.1, 0);
  ctx.lineTo(r * 1.75, r * 0.33);
  ctx.closePath();
  ctx.fill();
  if (rank >= 2) {
    ctx.strokeStyle = colorWithAlpha(color, 0.8);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 1.25, -r * 0.65);
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 1.25, r * 0.65);
    ctx.stroke();
  }
}

function missile(ctx, r, color = "#ffb347", rank = 0) {
  ctx.fillStyle = "#fff1c4";
  ctx.beginPath();
  ctx.moveTo(r * 3.1, 0);
  ctx.lineTo(r * 0.7, r * 1.2);
  ctx.lineTo(-r * 2, r * 0.8);
  ctx.lineTo(-r * 2.4, 0);
  ctx.lineTo(-r * 2, -r * 0.8);
  ctx.lineTo(r * 0.7, -r * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = rank >= 4 ? "#ffd166" : "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(-r * 2.25, -r * 0.55);
  ctx.lineTo(-r * (rank >= 1 ? 3.7 : 3.1), 0);
  ctx.lineTo(-r * 2.25, r * 0.55);
  ctx.closePath();
  ctx.fill();
}

function starBlade(ctx, r, color = "#ff65d8", rank = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-r * 1.75, -r * 0.52);
  ctx.quadraticCurveTo(-r * 0.05, -r * 1.7, r * 1.85, -r * 0.28);
  ctx.quadraticCurveTo(r * 0.92, r * 0.26, r * 0.1, r * 0.48);
  ctx.quadraticCurveTo(-r * 0.75, r * 0.68, -r * 1.46, r * 1.05);
  ctx.lineTo(-r * 1.78, r * 0.48);
  ctx.quadraticCurveTo(-r * 0.8, r * 0.1, -r * 0.15, -r * 0.06);
  ctx.quadraticCurveTo(-r, -r * 0.18, -r * 1.75, -r * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.strokeStyle = colorWithAlpha("#42e8ff", 0.8);
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, -r * 0.32);
  ctx.quadraticCurveTo(0, -r * 1.05, r * 1.05, -r * 0.18);
  ctx.stroke();
  if (rank >= 1) {
    ctx.strokeStyle = colorWithAlpha(color, 0.72);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, TAU);
    ctx.stroke();
  }
}

function drone(ctx, x, y, t, attacking, color = "#77ff8a", rank = 0) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 8) * 2);
  glow(ctx, 0, 0, 20, attacking ? color : "#ffd166", attacking ? 0.5 : 0.34);
  ctx.fillStyle = "rgba(10,16,28,0.95)";
  ctx.strokeStyle = attacking ? color : "#42e8ff";
  ctx.lineWidth = 2;
  for (const sx of [-19, 19]) {
    ctx.save();
    ctx.translate(sx, 0);
    ctx.rotate(t * 18 * (sx < 0 ? -1 : 1));
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = colorWithAlpha(attacking ? color : "#42e8ff", 0.85);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.roundRect(-14, -9, 28, 18, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = attacking ? color : "#ffd166";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 5);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
  if (rank >= 3) {
    ctx.strokeStyle = rank >= 4 ? "#ffd166" : color;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExplosion(ctx, x, y, r, color = "#ffb347") {
  glow(ctx, x, y, r, color, 0.34);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
}

function ring(ctx, x, y, r, color, alpha) {
  glow(ctx, x, y, r * 0.35, color, alpha * 0.18);
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

function frostPatch(ctx, x, y, r, color, t) {
  ctx.fillStyle = colorWithAlpha(color, 0.1);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = colorWithAlpha("#dffcff", 0.55);
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 7; i++) {
    const a = i * TAU / 7 + t;
    ctx.fillStyle = colorWithAlpha("#ffffff", 0.64);
    ctx.fillRect(x + Math.cos(a) * r * 0.55 - 1, y + Math.sin(a) * r * 0.55 - 1, 2, 2);
  }
}

function glow(ctx, x, y, r, color, alpha) {
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, TAU);
  ctx.fill();
}

function colorWithAlpha(hex, alpha) {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
