import { CAMERA_ZOOM } from "../constants.js";
import { state, world } from "../state.js";

export function drawAiDebug(ctx, view, camera) {
  const runtime = state.ai?.runtime;
  const config = state.ai?.config;
  if (!runtime?.enabled || !config?.debugDraw) return;
  const p = state.player;
  if (!p) return;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawTarget(ctx, runtime, view, camera);
  drawVelocity(ctx, runtime, p, view, camera);
  drawThreats(ctx, runtime, view, camera);
  drawBossRange(ctx, runtime, view, camera);
  ctx.restore();
}

export function drawAiHud(ctx, view) {
  const runtime = state.ai?.runtime;
  if (!runtime?.enabled || state.mode === "menu") return;
  const training = state.ai?.training || {};
  const config = state.ai?.config || {};
  if (config.hud?.showAiPanel === false) return;
  const p = state.player || {};
  const runs = training.totalRuns || 0;
  const victories = training.victories || 0;
  const winRate = runs ? Math.round(victories / runs * 100) : 0;
  const target = runtime.currentTarget?.kind || (state.mode === "playing" ? "thinking" : state.mode);
  const risk = Math.round(runtime.lastPlanRisk || 0);
  const threatCount = runtime.lastThreatCount || runtime.debugThreats?.length || 0;
  const hp = p.maxHp ? `${Math.ceil(Math.max(0, p.hp || 0))}/${Math.ceil(p.maxHp)}` : "--";
  const latestDeath = [...(training.recentRuns || [])].reverse().find((run) => !run.victory)?.deathReason || "";
  const recommendation = training.recommendations || {};
  const perf = runtime.perf?.movementPlanMs;
  const avgMs = perf ? (perf.total / Math.max(1, perf.count)).toFixed(1) : "0.0";
  const compact = view.width < 760;
  const lines = compact ? [
    ["AI", `${runtime.enabled ? "TRAIN" : "OFF"} ${config.profile || "balanced"}`],
    ["Run", `${runs} Win ${winRate}%`],
    ["Target", target],
    ["Risk", `${risk} T${threatCount}`],
  ] : [
    ["RUN", `${runs} Win ${winRate}%  W${state.wave || 0} HP ${hp}`],
    ["PLAN", `${target}  Risk ${risk} T${threatCount}`],
    ["TRAIN", `${latestDeath || "none"} -> ${recommendation.profile || config.profile || "balanced"}`],
    ["CONFIG", `${runtime.configSource?.aiRunConfigProfile || config.profile || "balanced"} enabled=${runtime.configSource?.aiTrainingConfigEnabled ? "Y" : "N"}`],
    ["PERF", `${avgMs}ms  Budget ${runtime.budgetLevel || 0}`],
  ];
  const width = compact ? Math.min(230, Math.max(190, view.width * 0.42)) : Math.min(320, Math.max(255, view.width * 0.34));
  const rowH = 17;
  const height = 16 + lines.length * rowH;
  const x = Math.max(8, view.width - width - 14);
  const y = 14;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawHudPanel(ctx, x, y, width, height, risk);
  ctx.font = "12px 'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Courier New', monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + 13 + i * rowH;
    const [label, value] = lines[i];
    ctx.fillStyle = i === 0 ? "#77ff8a" : "rgba(159,244,255,0.82)";
    ctx.fillText(label, x + 12, rowY);
    ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.88)";
    ctx.fillText(value, x + 78, rowY);
  }
  ctx.restore();
}

function toScreen(point, view, camera) {
  return {
    x: (point.x - camera.x) * CAMERA_ZOOM + view.width / 2,
    y: (point.y - camera.y) * CAMERA_ZOOM + view.height / 2,
  };
}

function drawHudPanel(ctx, x, y, w, h, risk) {
  const danger = risk > 85;
  ctx.fillStyle = "rgba(6,9,18,0.78)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = danger ? "rgba(255,77,109,0.12)" : "rgba(66,232,255,0.08)";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = danger ? "rgba(255,77,109,0.92)" : "rgba(66,232,255,0.82)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
}

function drawTarget(ctx, runtime, view, camera) {
  const target = runtime.currentTarget;
  if (!target) return;
  const p = toScreen(target, view, camera);
  ctx.strokeStyle = "#77ff8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#77ff8a";
  ctx.font = "12px monospace";
  ctx.fillText(target.kind || "target", p.x + 14, p.y - 8);
}

function drawVelocity(ctx, runtime, player, view, camera) {
  const start = toScreen(player, view, camera);
  const v = runtime.lastVelocity || { x: 0, y: 0 };
  ctx.strokeStyle = "#42e8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + v.x * 0.35, start.y + v.y * 0.35);
  ctx.stroke();
}

function drawThreats(ctx, runtime, view, camera) {
  const threats = (runtime.debugThreats || []).slice(0, 18);
  ctx.strokeStyle = "rgba(255,77,109,0.62)";
  ctx.lineWidth = 1;
  for (const threat of threats) {
    const p = toScreen(threat, view, camera);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(6, (threat.r || 8) * CAMERA_ZOOM), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBossRange(ctx, runtime, view, camera) {
  const target = runtime.currentTarget;
  if (!world.boss || !target?.range) return;
  const p = toScreen(world.boss, view, camera);
  ctx.strokeStyle = "rgba(255,209,102,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, target.range.ideal * CAMERA_ZOOM, 0, Math.PI * 2);
  ctx.stroke();
}
