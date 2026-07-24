import { TAU } from "../constants.js";
import { state } from "../state.js";
import { clamp, hexToRgba } from "../utils.js";
import { drawWeaponHologram, weaponPreviewColor } from "../ui/weaponPreview.js";
import { renderScreenLighting } from "./lighting.js";
import { drawPlayerAvatar } from "./playerAvatar.js";
import {
  LOBBY_CORRIDORS,
  LOBBY_DEVICES,
  LOBBY_DOORS,
  LOBBY_HEIGHT,
  LOBBY_NPCS,
  LOBBY_PET,
  LOBBY_PORTALS,
  LOBBY_PROPS,
  LOBBY_ROOMS,
  LOBBY_SCENERY,
  LOBBY_LIGHTS,
  LOBBY_MOBILE_LIGHTS,
  LOBBY_WEAPON_STATIONS,
  LOBBY_WIDTH,
  LOBBY_Y_SCALE,
  isLobbyRoomVisible,
  lobbyNpcRuntime,
  lobbyMobileLightPosition,
  lobbyRandomGoalLabel,
  lobbyRoomReveal,
  selectedLobbyDifficulty,
  selectedLobbyWeapon,
  weaponForStation,
} from "./lobby.js";

const LOBBY_ZOOM = 1.04;
const STATIC_SCALE = 0.5;
const FONT = "'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Press Start 2P', 'Courier New', monospace";
let staticCache = null;

export function renderLobby(ctx, viewport) {
  ensureStaticCache();
  const lobby = state.lobby;
  const cameraX = lobby.cameraX;
  const cameraY = lobby.cameraY * LOBBY_Y_SCALE;

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  drawSpaceBackdrop(ctx, viewport, lobby.shipTime);
  ctx.save();
  ctx.translate(viewport.width / 2, viewport.height / 2);
  ctx.scale(LOBBY_ZOOM, LOBBY_ZOOM);
  ctx.translate(-cameraX, -cameraY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    staticCache,
    -LOBBY_WIDTH / 2,
    -LOBBY_HEIGHT * LOBBY_Y_SCALE / 2,
    LOBBY_WIDTH,
    LOBBY_HEIGHT * LOBBY_Y_SCALE,
  );
  drawFloorAnimations(ctx, lobby.time);

  const actors = [];
  for (const scenery of LOBBY_SCENERY) {
    if (actorVisible(scenery)) actors.push({ y: scenery.y, draw: () => drawScenery(ctx, scenery, lobby.time) });
  }
  for (const prop of LOBBY_PROPS) {
    if (actorVisible(prop)) actors.push({ y: prop.y, draw: () => drawLobbyProp(ctx, prop, lobby.time) });
  }
  for (const portal of LOBBY_PORTALS) {
    if (actorVisible(portal)) actors.push({ y: portal.y, draw: () => drawPortal(ctx, portal, lobby.time) });
  }
  for (const device of LOBBY_DEVICES) {
    if (actorVisible(device)) actors.push({ y: device.y, draw: () => drawDevice(ctx, device, lobby.time) });
  }
  for (const station of LOBBY_WEAPON_STATIONS) {
    if (actorVisible(station)) actors.push({ y: station.y, draw: () => drawWeaponStation(ctx, station, lobby.time) });
  }
  for (const npc of LOBBY_NPCS) {
    const runtime = lobbyNpcRuntime(npc.id);
    if (!runtime) continue;
    const roomId = roomForNpc(runtime.x, runtime.y);
    if (roomId && !isLobbyRoomVisible(roomId)) continue;
    if (!pointNearCamera(runtime.x, runtime.y)) continue;
    actors.push({ y: runtime.y, draw: () => drawNpc(ctx, npc, runtime, lobby.time) });
  }
  const pet = lobby.pet;
  if (pet) {
    const roomId = roomForNpc(pet.x, pet.y);
    if ((!roomId || isLobbyRoomVisible(roomId)) && pointNearCamera(pet.x, pet.y)) {
      actors.push({ y: pet.y, draw: () => drawLobbyPet(ctx, pet, lobby.time) });
    }
  }
  for (const light of LOBBY_MOBILE_LIGHTS) {
    if (!isLobbyRoomVisible(light.roomId)) continue;
    const position = lobbyMobileLightPosition(light, lobby.mobileLightPhase);
    if (pointNearCamera(position.x, position.y)) {
      actors.push({ y: position.y - 130, draw: () => drawMobileLight(ctx, light, position, lobby.time) });
    }
  }
  for (const door of LOBBY_DOORS) {
    if (pointNearCamera(door.x, door.y, 1300, 950)) actors.push({ y: door.y + 4, draw: () => drawDoor(ctx, door, lobby.time) });
  }
  actors.push({ y: lobby.player.y, draw: () => drawLobbyPlayer(ctx, lobby.player, lobby.time) });
  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) actor.draw();
  drawRoomRoofs(ctx, lobby.time);
  ctx.restore();

  renderScreenLighting(ctx, collectLobbyLights(viewport), viewport, {
    darkness: "rgba(1,4,11,0.39)",
    maxLights: 32,
  });
  drawScreenFx(ctx, viewport, lobby.time);
}

export function lobbyWorldToScreen(x, y, viewport) {
  return {
    x: (x - state.lobby.cameraX) * LOBBY_ZOOM + viewport.width / 2,
    y: (y * LOBBY_Y_SCALE - state.lobby.cameraY * LOBBY_Y_SCALE) * LOBBY_ZOOM + viewport.height / 2,
  };
}

export function lobbyScreenToWorld(x, y, viewport) {
  return {
    x: (x - viewport.width / 2) / LOBBY_ZOOM + state.lobby.cameraX,
    y: ((y - viewport.height / 2) / LOBBY_ZOOM + state.lobby.cameraY * LOBBY_Y_SCALE) / LOBBY_Y_SCALE,
  };
}

function ensureStaticCache() {
  if (staticCache) return;
  staticCache = document.createElement("canvas");
  staticCache.width = Math.ceil(LOBBY_WIDTH * STATIC_SCALE);
  staticCache.height = Math.ceil(LOBBY_HEIGHT * LOBBY_Y_SCALE * STATIC_SCALE);
  const cacheCtx = staticCache.getContext("2d", { alpha: false });
  cacheCtx.imageSmoothingEnabled = false;
  cacheCtx.scale(STATIC_SCALE, STATIC_SCALE);
  cacheCtx.translate(LOBBY_WIDTH / 2, LOBBY_HEIGHT * LOBBY_Y_SCALE / 2);
  drawStaticShip(cacheCtx);
}

function drawStaticShip(ctx) {
  const halfW = LOBBY_WIDTH / 2;
  const halfH = LOBBY_HEIGHT * LOBBY_Y_SCALE / 2;
  const hull = ctx.createLinearGradient(0, -halfH, 0, halfH);
  hull.addColorStop(0, "#06111b");
  hull.addColorStop(0.48, "#0a1620");
  hull.addColorStop(1, "#050b13");
  ctx.fillStyle = "#01030a";
  ctx.fillRect(-halfW, -halfH, LOBBY_WIDTH, halfH * 2);
  ctx.fillStyle = hull;
  shipHullPath(ctx, halfW - 35, halfH - 26);
  ctx.fill();
  ctx.strokeStyle = "#193345";
  ctx.lineWidth = 12;
  ctx.stroke();

  drawHullRibs(ctx, halfW, halfH);
  for (const room of LOBBY_ROOMS) drawRoomFloor(ctx, room);
  drawMainCorridors(ctx);
  drawStaticPipes(ctx);
  drawHullWindows(ctx);
  drawStaticLightFixtures(ctx);

  ctx.strokeStyle = "rgba(66,232,255,0.42)";
  ctx.lineWidth = 3;
  shipHullPath(ctx, halfW - 54, halfH - 46);
  ctx.stroke();
}

function shipHullPath(ctx, halfW, halfH) {
  ctx.beginPath();
  ctx.moveTo(-halfW + 360, -halfH);
  ctx.lineTo(halfW - 360, -halfH);
  ctx.lineTo(halfW, -halfH + 250);
  ctx.lineTo(halfW, halfH - 280);
  ctx.lineTo(halfW - 430, halfH);
  ctx.lineTo(-halfW + 430, halfH);
  ctx.lineTo(-halfW, halfH - 280);
  ctx.lineTo(-halfW, -halfH + 250);
  ctx.closePath();
}

function drawHullRibs(ctx, halfW, halfH) {
  ctx.strokeStyle = "rgba(100,148,174,0.08)";
  ctx.lineWidth = 2;
  for (let x = -halfW + 140; x < halfW; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, -halfH + 85);
    ctx.lineTo(x, halfH - 85);
    ctx.stroke();
  }
  for (let y = -halfH + 92; y < halfH; y += 72) {
    ctx.beginPath();
    ctx.moveTo(-halfW + 85, y);
    ctx.lineTo(halfW - 85, y);
    ctx.stroke();
  }
}

function drawMainCorridors(ctx) {
  for (const corridor of LOBBY_CORRIDORS) {
    const y = corridor.y * LOBBY_Y_SCALE;
    const h = corridor.h * LOBBY_Y_SCALE;
    const left = corridor.x - corridor.w / 2;
    const right = corridor.x + corridor.w / 2;
    const top = y - h / 2;
    const bottom = y + h / 2;
    ctx.fillStyle = "#0b1822";
    ctx.fillRect(left, top, corridor.w, h);
    ctx.strokeStyle = hexToRgba(corridor.color, 0.28);
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (corridor.axis === "horizontal") {
      ctx.moveTo(left, top);
      ctx.lineTo(right, top);
      ctx.moveTo(left, bottom);
      ctx.lineTo(right, bottom);
    } else {
      ctx.moveTo(left, top);
      ctx.lineTo(left, bottom);
      ctx.moveTo(right, top);
      ctx.lineTo(right, bottom);
    }
    ctx.stroke();
    ctx.setLineDash([20, 18]);
    ctx.strokeStyle = hexToRgba(corridor.color, 0.16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (corridor.axis === "horizontal") {
      ctx.moveTo(left + 24, y);
      ctx.lineTo(right - 24, y);
    } else {
      ctx.moveTo(corridor.x, top + 24);
      ctx.lineTo(corridor.x, bottom - 24);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  drawCorridorJunctions(ctx);
}

function drawCorridorJunctions(ctx) {
  const junctions = [
    { x: 0, y: -450, orientation: "horizontal", color: "#42e8ff" },
    { x: 0, y: 450, orientation: "horizontal", color: "#42e8ff", accent: "#77ff8a" },
    { x: -600, y: -650, orientation: "vertical", color: "#42e8ff", accent: "#b48cff" },
    { x: 600, y: -650, orientation: "vertical", color: "#42e8ff", accent: "#77ff8a" },
    { x: -600, y: 720, orientation: "vertical", color: "#42e8ff", accent: "#ff7a8a" },
    { x: 600, y: 720, orientation: "vertical", color: "#42e8ff", accent: "#ffb347" },
  ];
  for (const junction of junctions) {
    const y = junction.y * LOBBY_Y_SCALE;
    const horizontal = junction.orientation === "horizontal";
    ctx.save();
    ctx.translate(junction.x, y);
    if (!horizontal) ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = hexToRgba(junction.color, 0.64);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-118, 0);
    ctx.lineTo(-30, 0);
    ctx.moveTo(30, 0);
    ctx.lineTo(118, 0);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(junction.accent || junction.color, 0.76);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-112, 7);
    ctx.lineTo(-42, 7);
    ctx.moveTo(42, 7);
    ctx.lineTo(112, 7);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#203746";
      ctx.strokeStyle = hexToRgba(junction.accent || junction.color, 0.55);
      ctx.lineWidth = 2;
      ctx.fillRect(side * 111 - 9, -15, 18, 30);
      ctx.strokeRect(side * 111 - 9, -15, 18, 30);
    }
    ctx.restore();
  }
}

function drawRoomFloor(ctx, room) {
  const y = room.y * LOBBY_Y_SCALE;
  const h = room.h * LOBBY_Y_SCALE;
  const x = room.x - room.w / 2;
  const top = y - h / 2;
  ctx.fillStyle = room.id === "core" ? "#0c1b27" : "#09151f";
  ctx.fillRect(x, top, room.w, h);
  const glow = ctx.createRadialGradient(room.x, y, 20, room.x, y, Math.max(room.w, h) * 0.55);
  glow.addColorStop(0, hexToRgba(room.color, room.id === "core" ? 0.09 : 0.055));
  glow.addColorStop(1, hexToRgba(room.color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x, top, room.w, h);
  ctx.strokeStyle = hexToRgba(room.color, 0.34);
  ctx.lineWidth = 5;
  ctx.strokeRect(x, top, room.w, h);
  ctx.strokeStyle = "rgba(138,187,210,0.12)";
  ctx.lineWidth = 1;
  for (let gx = x + 48; gx < x + room.w; gx += 72) {
    ctx.beginPath();
    ctx.moveTo(gx, top + 20);
    ctx.lineTo(gx, top + h - 20);
    ctx.stroke();
  }
  for (let gy = top + 42; gy < top + h; gy += 52) {
    ctx.beginPath();
    ctx.moveTo(x + 20, gy);
    ctx.lineTo(x + room.w - 20, gy);
    ctx.stroke();
  }
  ctx.fillStyle = hexToRgba(room.color, 0.48);
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(`${room.label} // ${room.id.toUpperCase()}`, x + 30, top + 32);
  drawRoomBulkheads(ctx, room);
}

function drawRoomBulkheads(ctx, room) {
  if (!room.roof) return;
  const y = room.y * LOBBY_Y_SCALE;
  const h = room.h * LOBBY_Y_SCALE;
  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = y - h / 2;
  const bottom = y + h / 2;
  ctx.fillStyle = "#142631";
  ctx.strokeStyle = "rgba(160,205,220,0.28)";
  ctx.lineWidth = 2;
  ctx.fillRect(left - 12, top - 12, room.w + 24, 18);
  ctx.fillRect(left - 12, bottom - 6, room.w + 24, 18);
  ctx.fillRect(left - 12, top, 18, h);
  ctx.fillRect(right - 6, top, 18, h);
  for (let i = 0; i < 5; i++) {
    const px = left + 70 + i * (room.w - 140) / 4;
    ctx.fillStyle = i % 2 ? "#263d49" : hexToRgba(room.color, 0.35);
    ctx.fillRect(px - 24, top - 7, 48, 8);
    ctx.fillRect(px - 24, bottom - 1, 48, 8);
  }
}

function drawStaticPipes(ctx) {
  const pipes = [
    [-2550, -120, -1120, -120, "#42e8ff"],
    [1120, -120, 2550, -120, "#77ff8a"],
    [-2550, 1120, -1180, 1120, "#ff7a8a"],
    [1180, 1120, 2550, 1120, "#ffb347"],
  ];
  for (const [x1, y1, x2, y2, color] of pipes) {
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(x1, y1 * LOBBY_Y_SCALE);
    ctx.lineTo(x2, y2 * LOBBY_Y_SCALE);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(color, 0.3);
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let x = x1 + 80; x < x2; x += 180) {
      ctx.fillStyle = "#253b49";
      ctx.fillRect(x, y1 * LOBBY_Y_SCALE - 10, 15, 20);
    }
  }
}

function drawHullWindows(ctx) {
  const windows = [
    { x: -460, y: -1675, w: 360, color: "#42e8ff" },
    { x: 460, y: -1675, w: 360, color: "#42e8ff" },
    { x: -2520, y: -800, w: 120, color: "#b48cff", vertical: true },
    { x: 2520, y: -800, w: 120, color: "#77ff8a", vertical: true },
  ];
  for (const window of windows) {
    const y = window.y * LOBBY_Y_SCALE;
    ctx.fillStyle = "#01040c";
    ctx.strokeStyle = hexToRgba(window.color, 0.55);
    ctx.lineWidth = 8;
    if (window.vertical) {
      ctx.fillRect(window.x - 28, y - window.w, 56, window.w * 2);
      ctx.strokeRect(window.x - 28, y - window.w, 56, window.w * 2);
    } else {
      ctx.fillRect(window.x - window.w / 2, y - 28, window.w, 56);
      ctx.strokeRect(window.x - window.w / 2, y - 28, window.w, 56);
    }
  }
}

function drawStaticLightFixtures(ctx) {
  for (const light of LOBBY_LIGHTS) {
    const y = light.y * LOBBY_Y_SCALE;
    ctx.save();
    ctx.translate(light.x, y - 34);
    ctx.fillStyle = "#172a36";
    ctx.strokeStyle = hexToRgba(light.color, 0.55);
    ctx.lineWidth = 3;
    if (light.kind === "door") {
      ctx.fillRect(-58, -9, 116, 18);
      ctx.strokeRect(-58, -9, 116, 18);
      ctx.fillStyle = hexToRgba(light.color, 0.72);
      ctx.fillRect(-47, -4, 94, 8);
    } else {
      ctx.beginPath();
      ctx.moveTo(-44, -10);
      ctx.lineTo(36, -10);
      ctx.lineTo(48, 0);
      ctx.lineTo(36, 10);
      ctx.lineTo(-44, 10);
      ctx.lineTo(-51, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hexToRgba(light.color, 0.72);
      ctx.fillRect(-34, -4, 68, 8);
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.fillRect(-26, -3, 31, 2);
    }
    ctx.restore();
  }
}

function drawFloorAnimations(ctx, time) {
  ctx.save();
  ctx.translate(0, -40 * LOBBY_Y_SCALE);
  ctx.rotate(time * 0.07);
  ctx.setLineDash([24, 18]);
  ctx.lineDashOffset = -time * 28;
  ctx.strokeStyle = "rgba(66,232,255,0.27)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 330, 155, 0, 0, TAU);
  ctx.stroke();
  ctx.rotate(-time * 0.16);
  ctx.strokeStyle = "rgba(180,140,255,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 260, 120, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPortal(ctx, portal, time) {
  const active = portal.kind !== "home";
  const pulse = 0.75 + Math.sin(time * 2.8 + portal.x * 0.01) * 0.13;
  const charging = state.lobby.pendingLaunch?.portalId === portal.id;
  const y = portal.y * LOBBY_Y_SCALE;
  ctx.save();
  ctx.translate(portal.x, y);
  drawInteractionRing(ctx, portal.id, portal.color, 118, 40);
  drawObjectShadow(ctx, 0, 42, 126, 35);

  ctx.fillStyle = "#07111a";
  ctx.strokeStyle = "#2a4656";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-118, 42);
  ctx.lineTo(-86, -168);
  ctx.lineTo(-54, -210);
  ctx.lineTo(54, -210);
  ctx.lineTo(86, -168);
  ctx.lineTo(118, 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.fillStyle = "#142735";
    ctx.strokeStyle = hexToRgba(portal.color, 0.62);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(side * 70, 28);
    ctx.lineTo(side * 108, 21);
    ctx.lineTo(side * 91, -118);
    ctx.lineTo(side * 63, -139);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexToRgba(portal.color, 0.75);
    for (let i = 0; i < 4; i++) ctx.fillRect(side * (75 + i * 3), -100 + i * 30, side * 13, 5);
  }

  ctx.strokeStyle = hexToRgba(portal.color, active ? 0.92 : 0.34);
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-65, -22);
  ctx.lineTo(-65, -160);
  ctx.quadraticCurveTo(0, -228, 65, -160);
  ctx.lineTo(65, -22);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba("#e8fbff", active ? 0.36 : 0.12);
  ctx.lineWidth = 3;
  ctx.stroke();

  if (active) {
    const gradient = ctx.createRadialGradient(0, -105, 8, 0, -105, 105);
    gradient.addColorStop(0, hexToRgba("#ffffff", (charging ? 0.8 : 0.48) * pulse));
    gradient.addColorStop(0.3, hexToRgba(portal.color, (charging ? 0.58 : 0.34) * pulse));
    gradient.addColorStop(1, hexToRgba(portal.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, -105, 73, 115, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i++) {
      const yy = -182 + ((time * (28 + i * 2) + i * 33) % 152);
      ctx.strokeStyle = hexToRgba(portal.color, 0.18 + i * 0.035);
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(-56 + i * 4, yy);
      ctx.bezierCurveTo(-20, yy - 18, 22, yy + 17, 55 - i * 3, yy - 5);
      ctx.stroke();
    }
    ctx.restore();
    if (charging) drawLaunchCharge(ctx, portal);
  } else {
    ctx.fillStyle = "rgba(3,8,13,0.88)";
    ctx.fillRect(-61, -169, 122, 150);
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-56, -154);
    ctx.lineTo(56, -42);
    ctx.moveTo(56, -154);
    ctx.lineTo(-56, -42);
    ctx.stroke();
  }

  drawTechLabel(ctx, portal.label, portal.sublabel, portal.color, 0, 61, active);
  ctx.restore();
}

function drawLaunchCharge(ctx, portal) {
  const launch = state.lobby.pendingLaunch;
  const progress = Math.min(1, launch.elapsed / launch.duration);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, -105, 92, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
  ctx.stroke();
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`航线充能 ${Math.round(progress * 100)}%`, 0, -100);
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = portal.color;
  ctx.fillText("离开范围或按 ESC 取消", 0, -83);
  ctx.restore();
}

function drawDevice(ctx, device, time) {
  const y = device.y * LOBBY_Y_SCALE;
  ctx.save();
  ctx.translate(device.x, y);
  drawInteractionRing(ctx, device.id, device.color, device.kind === "missionTable" ? 132 : 96, 36);
  if (device.kind === "missionTable") drawMissionTable(ctx, device, time);
  else if (device.kind === "recorder" || device.kind === "codex") drawArchiveDevice(ctx, device, time);
  else if (device.kind === "gene") drawGeneModifier(ctx, device, time);
  else if (device.kind === "rift") drawRiftStabilizer(ctx, device, time);
  else if (device.kind === "lever") drawLever(ctx, device);
  else if (device.kind === "difficulty") drawDifficultySync(ctx, device, time);
  else if (device.kind === "randomProtocol") drawRandomProtocol(ctx, device, time);
  ctx.restore();
}

function drawMissionTable(ctx, device, time) {
  drawObjectShadow(ctx, 0, 31, 136, 35);
  drawMachineBase(ctx, 0, 12, 126, 43, device.color);
  ctx.fillStyle = "#102433";
  ctx.beginPath();
  ctx.ellipse(0, -3, 94, 34, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(device.color, 0.72);
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(0, -50);
    ctx.rotate(time * (i % 2 ? -0.28 : 0.22) + i);
    ctx.strokeStyle = hexToRgba(i % 2 ? "#b48cff" : device.color, 0.48);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 68 - i * 10, 24 - i * 2, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = hexToRgba(device.color, 0.13);
  ctx.beginPath();
  ctx.moveTo(-62, -4);
  ctx.lineTo(-38, -102);
  ctx.lineTo(38, -102);
  ctx.lineTo(62, -4);
  ctx.closePath();
  ctx.fill();
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#dffbff";
  ctx.fillText("TRANSIT ARK // ALL SYSTEMS NOMINAL", 0, -58);
}

function drawArchiveDevice(ctx, device, time) {
  drawObjectShadow(ctx, 0, 27, 96, 30);
  drawMachineBase(ctx, 0, 12, 84, 40, device.color);
  ctx.fillStyle = "#08121b";
  ctx.strokeStyle = "#29404d";
  ctx.lineWidth = 4;
  roundRect(ctx, -78, -116, 156, 132, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#102433";
  roundRect(ctx, -61, -99, 122, 80, 5);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(device.color, 0.72);
  ctx.lineWidth = 2;
  ctx.stroke();
  if (device.kind === "recorder") {
    for (let i = 0; i < 3; i++) {
      const x = -38 + i * 38;
      ctx.save();
      ctx.translate(x, -59);
      ctx.rotate(time * (i % 2 ? -1 : 1));
      ctx.strokeStyle = hexToRgba(device.color, 0.7);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, TAU);
      ctx.stroke();
      for (let a = 0; a < 4; a++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "#82939e";
        ctx.fillRect(-3, -14, 6, 10);
      }
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(0, -60);
    ctx.rotate(time * 0.3);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      ctx.fillStyle = hexToRgba(device.color, 0.48 + (i % 2) * 0.2);
      ctx.fillRect(18, -3, 34, 6);
    }
    ctx.restore();
  }
  ctx.fillStyle = hexToRgba(device.color, 0.7);
  for (let i = 0; i < 5; i++) ctx.fillRect(-51, -10 + i * 7, 102 - i * 11, 2);
}

function drawGeneModifier(ctx, device, time) {
  drawObjectShadow(ctx, 0, 33, 110, 34);
  drawMachineBase(ctx, 0, 14, 96, 45, device.color);
  ctx.fillStyle = "#08131a";
  ctx.strokeStyle = "#29483d";
  ctx.lineWidth = 5;
  roundRect(ctx, -88, -146, 176, 166, 18);
  ctx.fill();
  ctx.stroke();
  const glass = ctx.createLinearGradient(-58, -130, 58, 5);
  glass.addColorStop(0, "rgba(119,255,138,0.05)");
  glass.addColorStop(0.48, "rgba(220,255,230,0.25)");
  glass.addColorStop(1, "rgba(119,255,138,0.08)");
  ctx.fillStyle = glass;
  roundRect(ctx, -60, -128, 120, 126, 48);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(device.color, 0.78);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.translate(0, -65);
  ctx.rotate(time * 0.25);
  ctx.strokeStyle = hexToRgba(device.color, 0.68);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 31);
    ctx.lineTo(Math.cos(a + 0.5) * 39, Math.sin(a + 0.5) * 47);
    ctx.stroke();
  }
  ctx.restore();
  for (const side of [-1, 1]) {
    ctx.strokeStyle = "#426d59";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(side * 74, -110);
    ctx.bezierCurveTo(side * 118, -85, side * 112, -8, side * 81, 12);
    ctx.stroke();
  }
}

function drawRiftStabilizer(ctx, device, time) {
  drawObjectShadow(ctx, 0, 31, 112, 34);
  drawMachineBase(ctx, 0, 12, 102, 44, device.color);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, -88);
    ctx.rotate(time * (i % 2 ? -0.5 : 0.38) + i * 1.2);
    ctx.strokeStyle = hexToRgba(i === 1 ? "#42e8ff" : device.color, 0.8 - i * 0.13);
    ctx.lineWidth = 6 - i;
    ctx.beginPath();
    ctx.ellipse(0, 0, 72 - i * 16, 36 + i * 9, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  const glow = ctx.createRadialGradient(0, -88, 1, 0, -88, 67);
  glow.addColorStop(0, "rgba(255,255,255,0.7)");
  glow.addColorStop(0.22, hexToRgba(device.color, 0.42));
  glow.addColorStop(1, hexToRgba(device.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -88, 67, 0, TAU);
  ctx.fill();
}

function drawDifficultySync(ctx, device, time) {
  drawObjectShadow(ctx, 0, 26, 92, 28);
  drawMachineBase(ctx, 0, 8, 82, 40, device.color);
  ctx.save();
  ctx.translate(0, -73);
  for (let i = 0; i < 4; i++) {
    ctx.rotate((i % 2 ? -1 : 1) * time * 0.16 + i * 0.3);
    ctx.strokeStyle = hexToRgba(i === 3 ? "#ffffff" : device.color, 0.72 - i * 0.1);
    ctx.lineWidth = 5 - i * 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, 58 - i * 11, -0.75 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = "#0b1822";
  ctx.strokeStyle = hexToRgba(device.color, 0.75);
  ctx.lineWidth = 2;
  roundRect(ctx, -69, -24, 138, 40, 5);
  ctx.fill();
  ctx.stroke();
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff1b5";
  ctx.fillText(selectedLobbyDifficulty()?.name || "等待同步", 0, -1);
}

function drawRandomProtocol(ctx, device, time) {
  drawObjectShadow(ctx, 0, 27, 93, 28);
  drawMachineBase(ctx, 0, 10, 82, 40, device.color);
  ctx.save();
  ctx.translate(0, -76);
  ctx.rotate(time * 0.32);
  ctx.strokeStyle = hexToRgba(device.color, 0.8);
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(TAU / 3);
    ctx.strokeRect(-35, -35, 70, 70);
    ctx.scale(0.82, 0.82);
  }
  ctx.restore();
  for (let i = 0; i < 7; i++) {
    const a = time * (0.9 + i * 0.04) + i * 0.9;
    ctx.fillStyle = hexToRgba(i % 2 ? "#42e8ff" : device.color, 0.62);
    ctx.fillRect(Math.cos(a) * 68 - 3, -76 + Math.sin(a * 1.3) * 46 - 3, 6, 6);
  }
  drawTechLabel(ctx, "异常协议", lobbyRandomGoalLabel(), device.color, 0, 42, true);
}

function drawLever(ctx, device) {
  const pull = state.lobby.leverPulse > 0 ? Math.sin((1 - state.lobby.leverPulse / 0.48) * Math.PI) : 0;
  drawObjectShadow(ctx, 0, 19, 52, 17);
  drawMachineBase(ctx, 0, 4, 44, 26, device.color);
  ctx.save();
  ctx.translate(0, -3);
  ctx.rotate(-0.58 + pull * 1.08);
  ctx.strokeStyle = "#9caab6";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -66);
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "#fff3bd";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -72, 16, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMachineBase(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = "#07111a";
  ctx.strokeStyle = "#2d4655";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#132633";
  ctx.beginPath();
  ctx.ellipse(x, y - 5, rx * 0.78, ry * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.68);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hexToRgba(color, 0.8);
  for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * rx * 0.27 - 8, y + ry * 0.42, 16, 4);
}

function drawWeaponStation(ctx, station, time) {
  const weapon = weaponForStation(station.slot);
  const selected = weapon?.id === state.lobby.selectedWeaponId;
  const color = weapon ? weaponPreviewColor(weapon) : "#53616d";
  const y = station.y * LOBBY_Y_SCALE;
  ctx.save();
  ctx.translate(station.x, y);
  drawInteractionRing(ctx, station.id, color, 112, 39);
  drawObjectShadow(ctx, 0, 36, 104, 33);
  if (selected) {
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 142);
    glow.addColorStop(0, hexToRgba(color, 0.32));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 4, 142, 68, 0, 0, TAU);
    ctx.fill();
  }
  drawMachineBase(ctx, 0, 16, 90, 37, color);
  for (const side of [-1, 1]) {
    ctx.strokeStyle = selected ? color : "#3a515f";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(side * 61, 18);
    ctx.lineTo(side * 78, -42);
    ctx.lineTo(side * 48, -72);
    ctx.stroke();
    ctx.fillStyle = "#203642";
    ctx.beginPath();
    ctx.arc(side * 78, -42, 10, 0, TAU);
    ctx.fill();
  }
  if (weapon) {
    const projectionAlpha = state.lobby.leverPulse > 0
      ? Math.max(0.18, 1 - Math.sin((1 - state.lobby.leverPulse / 0.48) * Math.PI))
      : 1;
    ctx.save();
    ctx.translate(10, -70 + Math.sin(time * 2.5 + station.slot) * 4);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexToRgba(color, 0.34 * projectionAlpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-66, 86);
    ctx.lineTo(-38, -52);
    ctx.lineTo(38, -52);
    ctx.lineTo(66, 86);
    ctx.stroke();
    drawWeaponHologram(ctx, weapon, time, { scale: 0.5, alpha: 0.88 * projectionAlpha, color });
    ctx.restore();
    drawWeaponStationLabel(ctx, weapon.name, color, 0, 82, selected);
  }
  ctx.restore();
}

function drawScenery(ctx, scenery, time) {
  const y = scenery.y * LOBBY_Y_SCALE;
  ctx.save();
  ctx.translate(scenery.x, y);
  if (scenery.kind === "starMap") drawStarMap(ctx, scenery, time);
  else if (scenery.kind === "medbay") drawMedbay(ctx, scenery, time);
  else if (scenery.kind === "lifeSupport") drawLifeSupport(ctx, scenery, time);
  else if (scenery.kind === "hangar") drawHangar(ctx, scenery, time);
  else if (scenery.kind === "reactor") drawReactor(ctx, scenery, time);
  else if (scenery.kind === "power") drawPowerGrid(ctx, scenery, time);
  else if (scenery.kind === "habitat") drawHabitat(ctx, scenery, time);
  ctx.restore();
}

function drawLobbyProp(ctx, prop, time) {
  const y = prop.y * LOBBY_Y_SCALE;
  const pulse = 0.65 + Math.sin(time * 2.2 + hashString(prop.id)) * 0.12;
  ctx.save();
  ctx.translate(prop.x, y);
  drawObjectShadow(ctx, 0, 20, prop.kind === "bench" ? 76 : 54, 17);
  if (prop.kind === "bench") {
    ctx.fillStyle = "#111f2a";
    ctx.strokeStyle = "#395364";
    ctx.lineWidth = 3;
    roundRect(ctx, -72, -27, 144, 46, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexToRgba(prop.color, 0.34);
    ctx.fillRect(-61, -18, 122, 7);
    ctx.fillStyle = "#263d4b";
    ctx.fillRect(-58, 17, 12, 18);
    ctx.fillRect(46, 17, 12, 18);
  } else if (prop.kind === "cargo" || prop.kind === "cabinet" || prop.kind === "server" || prop.kind === "vendor") {
    const w = prop.kind === "server" ? 94 : prop.kind === "vendor" ? 108 : 102;
    const h = prop.kind === "server" ? 108 : prop.kind === "vendor" ? 96 : 76;
    ctx.fillStyle = "#0b1720";
    ctx.strokeStyle = "#405564";
    ctx.lineWidth = 4;
    roundRect(ctx, -w / 2, -h + 18, w, h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexToRgba(prop.color, 0.65 * pulse);
    for (let row = 0; row < 3; row++) ctx.fillRect(-w / 2 + 14, -h + 32 + row * 20, w - 28, 6);
    ctx.fillStyle = "#91a7b4";
    ctx.fillRect(w / 2 - 24, -h + 22, 8, 8);
  } else if (prop.kind === "console" || prop.kind === "cart") {
    ctx.fillStyle = "#10212c";
    ctx.strokeStyle = "#415d6e";
    ctx.lineWidth = 3;
    roundRect(ctx, -64, -42, 128, 58, 7);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.transform(1, -0.18, 0, 1, 0, 0);
    ctx.fillStyle = "#06121b";
    ctx.fillRect(-50, -35, 100, 28);
    ctx.strokeStyle = hexToRgba(prop.color, 0.75);
    ctx.strokeRect(-50, -35, 100, 28);
    ctx.fillStyle = hexToRgba(prop.color, 0.55 * pulse);
    ctx.fillRect(-40, -26, 55, 4);
    ctx.fillRect(-40, -17, 76, 3);
    ctx.restore();
    ctx.fillStyle = "#263c49";
    ctx.fillRect(-48, 14, 13, 16);
    ctx.fillRect(35, 14, 13, 16);
  } else if (prop.kind === "cooler" || prop.kind === "reel") {
    ctx.fillStyle = "#101d25";
    ctx.strokeStyle = "#526876";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -18, 48, 28, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(prop.color, 0.8);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, -18, 25, time * 0.25, time * 0.25 + Math.PI * 1.55);
    ctx.stroke();
    ctx.fillStyle = prop.color;
    ctx.fillRect(-6, -24, 12, 12);
  } else if (prop.kind === "planter") {
    ctx.fillStyle = "#15232b";
    ctx.strokeStyle = "#4a665d";
    ctx.lineWidth = 3;
    roundRect(ctx, -60, -12, 120, 38, 7);
    ctx.fill();
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      ctx.strokeStyle = "#4d8060";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(i * 21, -9);
      ctx.quadraticCurveTo(i * 24 + Math.sin(time + i) * 7, -49, i * 18, -72);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(prop.color, 0.7);
      ctx.beginPath();
      ctx.ellipse(i * 18, -67, 12, 6, i * 0.2, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#17252e";
    ctx.strokeStyle = "#536772";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, 19);
    ctx.lineTo(-15, -49);
    ctx.lineTo(15, -49);
    ctx.lineTo(26, 19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexToRgba(prop.color, 0.78 * pulse);
    ctx.fillRect(-11, -42, 22, 34);
  }
  ctx.restore();
}

function drawStarMap(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 26, 116, 30);
  drawMachineBase(ctx, 0, 9, 104, 42, scenery.color);
  ctx.save();
  ctx.translate(0, -78);
  ctx.rotate(time * 0.12);
  ctx.strokeStyle = hexToRgba(scenery.color, 0.65);
  for (let i = 0; i < 5; i++) {
    ctx.rotate(TAU / 5);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(78, 0);
    ctx.stroke();
    ctx.fillStyle = i === 2 ? "#ffd166" : scenery.color;
    ctx.beginPath();
    ctx.arc(74, 0, 5 + i, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = hexToRgba(scenery.color, 0.11);
  ctx.beginPath();
  ctx.ellipse(0, -78, 100, 52, 0, 0, TAU);
  ctx.fill();
}

function drawMedbay(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 25, 105, 31);
  ctx.fillStyle = "#0a1820";
  ctx.strokeStyle = "#315464";
  ctx.lineWidth = 4;
  roundRect(ctx, -95, -78, 190, 100, 12);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(scenery.color, 0.78);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-50, -28);
  ctx.lineTo(-22, -28);
  ctx.lineTo(-22, -55);
  ctx.lineTo(22, -55);
  ctx.lineTo(22, -28);
  ctx.lineTo(50, -28);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(scenery.color, 0.7);
  ctx.fillRect(-75, -68, 34 + Math.sin(time * 2) * 8, 5);
}

function drawLifeSupport(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 30, 120, 34);
  for (let i = -1; i <= 1; i++) {
    const x = i * 67;
    ctx.fillStyle = "#07151b";
    ctx.strokeStyle = "#315448";
    ctx.lineWidth = 4;
    roundRect(ctx, x - 28, -118, 56, 138, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(119,255,138,0.12)";
    roundRect(ctx, x - 20, -105, 40, 105, 18);
    ctx.fill();
    for (let b = 0; b < 5; b++) {
      const yy = -12 - ((time * 18 + b * 23 + i * 11) % 82);
      ctx.fillStyle = hexToRgba(scenery.color, 0.35 + b * 0.07);
      ctx.beginPath();
      ctx.arc(x + Math.sin(time + b) * 9, yy, 2 + b % 2, 0, TAU);
      ctx.fill();
    }
  }
}

function drawHangar(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 28, 135, 35);
  ctx.fillStyle = "#09141d";
  ctx.strokeStyle = "#394d5b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-122, 22);
  ctx.lineTo(-82, -62);
  ctx.lineTo(82, -62);
  ctx.lineTo(122, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#152836";
  ctx.beginPath();
  ctx.moveTo(-70, -25);
  ctx.lineTo(0, -53);
  ctx.lineTo(70, -25);
  ctx.lineTo(35, 2);
  ctx.lineTo(-35, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexToRgba(scenery.color, 0.75);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(scenery.color, 0.35 + Math.sin(time * 3) * 0.12);
  ctx.fillRect(-92, 8, 184, 6);
}

function drawReactor(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 34, 132, 38);
  drawMachineBase(ctx, 0, 17, 112, 48, scenery.color);
  ctx.fillStyle = "#152631";
  ctx.strokeStyle = hexToRgba(scenery.color, 0.68);
  ctx.lineWidth = 5;
  ctx.fillRect(-86, -77, 18, 73);
  ctx.fillRect(68, -77, 18, 73);
  ctx.strokeRect(-86, -77, 18, 73);
  ctx.strokeRect(68, -77, 18, 73);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, -86);
    ctx.rotate(time * (0.22 + i * 0.09) * (i % 2 ? -1 : 1));
    ctx.strokeStyle = hexToRgba(i === 1 ? "#42e8ff" : scenery.color, 0.8 - i * 0.12);
    ctx.lineWidth = 11 - i * 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 98 - i * 20, 44 + i * 10, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  const glow = ctx.createRadialGradient(0, -86, 2, 0, -86, 84);
  glow.addColorStop(0, "rgba(255,255,255,0.78)");
  glow.addColorStop(0.18, hexToRgba(scenery.color, 0.55));
  glow.addColorStop(1, hexToRgba(scenery.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -86, 84, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -86, 24, 0, TAU);
  ctx.stroke();
}

function drawPowerGrid(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 27, 112, 30);
  ctx.fillStyle = "#08131c";
  ctx.strokeStyle = "#2b4350";
  ctx.lineWidth = 4;
  roundRect(ctx, -104, -104, 208, 126, 10);
  ctx.fill();
  ctx.stroke();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const on = (Math.floor(time * 3) + row + col) % 4 !== 0;
      ctx.fillStyle = on ? hexToRgba(scenery.color, 0.8) : "#263640";
      ctx.fillRect(-81 + col * 40, -78 + row * 27, 22, 8);
    }
  }
  ctx.strokeStyle = hexToRgba(scenery.color, 0.52);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const x = -82 + i * 27;
    const y = -16 - Math.sin(time * 2.8 + i) * 18;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function drawHabitat(ctx, scenery, time) {
  drawObjectShadow(ctx, 0, 26, 120, 32);
  ctx.fillStyle = "#10211e";
  ctx.strokeStyle = "#355248";
  ctx.lineWidth = 4;
  roundRect(ctx, -112, -42, 224, 68, 14);
  ctx.fill();
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    const sway = Math.sin(time * 1.4 + i) * 4;
    ctx.strokeStyle = "#4e7c5f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(i * 38, -40);
    ctx.quadraticCurveTo(i * 38 + sway, -77, i * 38 + sway * 0.4, -103);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(scenery.color, 0.55);
    ctx.beginPath();
    ctx.ellipse(i * 38 + sway, -92, 13, 7, sway * 0.02, 0, TAU);
    ctx.fill();
  }
}

function drawNpc(ctx, npc, runtime, time) {
  const y = runtime.y * LOBBY_Y_SCALE;
  const speed = Math.hypot(runtime.vx, runtime.vy);
  const speedRatio = Math.min(1, speed / 108);
  const bob = Math.sin(time * (runtime.moving ? 5.8 : 2.1) + runtime.stride * 0.18 + hashString(npc.id)) * (1.2 + speedRatio * 2);
  const face = Math.cos(runtime.facingAngle || 0) < -0.08 ? -1 : 1;
  const blink = Math.sin(time * 1.7 + hashString(npc.id)) > 0.986;
  const tilt = clamp(runtime.vx / 108, -1, 1) * 0.1;
  ctx.save();
  ctx.translate(runtime.x, y);
  drawInteractionRing(ctx, npc.id, npc.color, 39, 17);
  drawObjectShadow(ctx, 0, 22 + speedRatio * 3, 30 - speedRatio * 3, 10);
  ctx.translate(0, -19 + bob);
  ctx.rotate(tilt);
  ctx.scale(face, 1);

  const ringPulse = 0.7 + Math.sin(time * 4 + hashString(npc.id)) * 0.12;
  ctx.strokeStyle = hexToRgba(npc.color, ringPulse);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 18, 26 + speedRatio * 3, 9, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(npc.color, 0.12);
  ctx.beginPath();
  ctx.ellipse(0, 17, 22, 7, 0, 0, TAU);
  ctx.fill();

  const skin = npc.personality === "analyst" ? "#c8b8dc" : npc.personality === "geneticist" ? "#d1ad8e" : "#e7b98e";
  ctx.fillStyle = skin;
  ctx.strokeStyle = "#3f2c25";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, -8, 21, 23, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(0, 45);
  drawNpcHair(ctx, npc.personality, npc.color);
  ctx.restore();
  if (npc.personality === "geneticist" || npc.personality === "engineer") {
    ctx.fillStyle = "#20313a";
    roundRect(ctx, -16, -10, 32, 12, 4);
    ctx.fill();
    ctx.fillStyle = npc.color;
    ctx.fillRect(-11, -7, 22, 3);
  } else if (blink) {
    ctx.fillStyle = "#49342d";
    ctx.fillRect(-11, -10, 7, 2);
    ctx.fillRect(4, -10, 7, 2);
  } else {
    ctx.fillStyle = "#f7eee6";
    ctx.fillRect(-11, -13, 7, 7);
    ctx.fillRect(4, -13, 7, 7);
    ctx.fillStyle = npc.color;
    ctx.fillRect(-8, -11, 3, 4);
    ctx.fillRect(7, -11, 3, 4);
  }
  ctx.strokeStyle = npc.personality === "instructor" ? "#5e2c2c" : "#70402f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (runtime.mode === "social" || runtime.mode === "playerTalk" || runtime.mode === "petSocial") {
    ctx.arc(0, 2, 7, 0.1 * Math.PI, 0.9 * Math.PI);
  } else {
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(0, 7, 5, 4);
  }
  ctx.stroke();
  ctx.save();
  ctx.translate(0, 43);
  drawNpcFrontEquipment(ctx, npc, time, runtime);
  ctx.restore();
  ctx.restore();

  drawNpcLabelAndBubble(ctx, npc, runtime, y);
}

function drawNpcBackEquipment(ctx, npc, time) {
  if (npc.personality === "guide") {
    ctx.fillStyle = hexToRgba(npc.color, 0.2);
    ctx.beginPath();
    ctx.moveTo(-30, -30);
    ctx.lineTo(-42, 18);
    ctx.lineTo(0, 35);
    ctx.lineTo(42, 18);
    ctx.lineTo(30, -30);
    ctx.closePath();
    ctx.fill();
  } else if (npc.personality === "geneticist") {
    for (const x of [-24, 24]) {
      ctx.fillStyle = "#10261f";
      ctx.strokeStyle = "#4a8262";
      ctx.lineWidth = 3;
      roundRect(ctx, x - 10, -26, 20, 49, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hexToRgba("#77ff8a", 0.35 + Math.sin(time * 2 + x) * 0.1);
      ctx.fillRect(x - 5, -16, 10, 29);
    }
  } else if (npc.personality === "engineer") {
    ctx.strokeStyle = "#687b86";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-18, -25);
    ctx.lineTo(-34, 14);
    ctx.lineTo(-20, 31);
    ctx.moveTo(18, -25);
    ctx.lineTo(34, 14);
    ctx.lineTo(20, 31);
    ctx.stroke();
  } else if (npc.personality === "archivist") {
    ctx.fillStyle = hexToRgba(npc.color, 0.18);
    for (let i = 0; i < 4; i++) ctx.fillRect(-33 + i * 17, -28 + i * 4, 15, 64 - i * 6);
  }
}

function drawNpcCoatPattern(ctx, personality) {
  if (personality === "quartermaster" || personality === "instructor") {
    ctx.fillRect(-18, -28, 36, 9);
    ctx.fillRect(-15, -12, 9, 29);
    ctx.fillRect(6, -12, 9, 29);
  } else if (personality === "analyst") {
    ctx.beginPath();
    ctx.moveTo(-18, -30);
    ctx.lineTo(14, -20);
    ctx.lineTo(-8, 20);
    ctx.lineTo(-17, 9);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(-16, -26, 6, 38);
    ctx.fillRect(10, -26, 6, 38);
    ctx.fillRect(-6, -13, 12, 25);
  }
}

function drawNpcHair(ctx, personality, color) {
  ctx.fillStyle = personality === "guide" ? "#d8f7ff"
    : personality === "analyst" ? "#492b66"
      : personality === "quartermaster" ? "#7e3046"
        : personality === "steward" ? "#d7c4a5" : "#17212b";
  ctx.beginPath();
  ctx.arc(-2, -59, 19, Math.PI, TAU);
  if (personality === "guide") {
    ctx.lineTo(18, -50);
    ctx.lineTo(8, -72);
  } else if (personality === "analyst") {
    ctx.lineTo(18, -45);
    ctx.lineTo(14, -75);
    ctx.lineTo(-6, -68);
  } else {
    ctx.lineTo(17, -50);
    ctx.lineTo(10, -69);
  }
  ctx.closePath();
  ctx.fill();
  if (personality === "navigator") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -58, 23, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
}

function drawNpcFrontEquipment(ctx, npc, time, runtime) {
  const color = npc.color;
  if (npc.personality === "guide") {
    ctx.save();
    ctx.translate(29, -34);
    ctx.rotate(time * 0.8);
    ctx.strokeStyle = color;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.fillStyle = hexToRgba(color, 0.45);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  } else if (npc.personality === "tactician") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -51, 25, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(14, -40, 10, 16);
  } else if (npc.personality === "statistician") {
    for (let i = 0; i < 3; i++) {
      const a = time * 0.7 + i * TAU / 3;
      ctx.fillStyle = hexToRgba(color, 0.75);
      ctx.beginPath();
      ctx.arc(28 + Math.cos(a) * 13, -18 + Math.sin(a) * 18, 5, 0, TAU);
      ctx.fill();
    }
  } else if (npc.personality === "archivist") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(8, -54, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(17, -54);
    ctx.lineTo(28, -48);
    ctx.stroke();
  } else if (npc.personality === "engineer") {
    ctx.save();
    ctx.translate(28, -24);
    ctx.rotate(Math.sin(time * 3) * 0.22);
    ctx.fillStyle = "#8b99a3";
    ctx.fillRect(-5, -4, 28, 8);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(24, 0, 8, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (npc.personality === "quartermaster") {
    ctx.fillStyle = "#667681";
    ctx.fillRect(16, -25, 13, 42);
    ctx.fillStyle = color;
    ctx.fillRect(19, -20, 7, 31);
  } else if (npc.personality === "navigator") {
    ctx.save();
    ctx.translate(29, -23);
    ctx.rotate(time * 0.18);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 18 - i * 5, 8 + i * 4, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  } else if (npc.personality === "analyst") {
    for (let i = 0; i < 4; i++) {
      const a = time * (0.7 + i * 0.08) + i * 1.5;
      ctx.save();
      ctx.translate(27 + Math.cos(a) * 14, -24 + Math.sin(a) * 21);
      ctx.rotate(a);
      ctx.fillStyle = hexToRgba(color, 0.72);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  } else if (npc.personality === "instructor") {
    ctx.strokeStyle = "#8e9ba4";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-18, -10);
    ctx.lineTo(22, 12);
    ctx.moveTo(18, -10);
    ctx.lineTo(-22, 12);
    ctx.stroke();
  } else if (npc.personality === "steward") {
    ctx.save();
    ctx.translate(29, -27);
    ctx.rotate(time * 0.45);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(10, -3, 15, 6);
    ctx.restore();
  }
  if (runtime.mode === "waitDoor") {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-5, -86, 10, 10);
  }
}

function drawNpcLabelAndBubble(ctx, npc, runtime, y) {
  ctx.save();
  ctx.translate(runtime.x, y);
  ctx.textAlign = "center";
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = hexToRgba(npc.color, 0.9);
  ctx.fillText(npc.role, 0, -93);
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillStyle = "#eefaff";
  ctx.fillText(npc.name, 0, -79);
  if (runtime.bubble && runtime.bubbleLife > 0) {
    ctx.font = `9px ${FONT}`;
    const width = Math.min(260, Math.max(96, ctx.measureText(runtime.bubble).width + 24));
    ctx.fillStyle = "rgba(3,10,17,0.93)";
    ctx.strokeStyle = hexToRgba(npc.color, 0.72);
    ctx.lineWidth = 2;
    roundRect(ctx, -width / 2, -137, width, 27, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e9f8ff";
    ctx.fillText(runtime.bubble, 0, -119);
  }
  ctx.restore();
}

function drawLobbyPlayer(ctx, player, time) {
  const speedRatio = Math.min(1, Math.hypot(player.vx, player.vy) / player.speed);
  const bob = Math.sin(time * (player.moving ? 7 : 3.2) + player.stride * 0.2) * (1.1 + speedRatio * 2);
  const y = player.y * LOBBY_Y_SCALE;
  ctx.save();
  ctx.translate(player.x, y);
  drawObjectShadow(ctx, 0, 23 + speedRatio * 4, 25 - speedRatio * 3, 8 - speedRatio);

  if (speedRatio > 0.08) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const trail = (i + 1) * 9;
      ctx.fillStyle = hexToRgba(i % 2 ? "#ffd6a8" : "#42e8ff", 0.13 - i * 0.025);
      ctx.beginPath();
      ctx.ellipse(-player.dirX * trail, -3 - player.dirY * trail * 0.4, 20 - i * 3, 13 - i * 2, player.tilt, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.translate(0, -2 + bob);
  ctx.rotate(player.tilt);
  const mood = player.moving ? "happy" : ["blink", "smile", "curious", "happy"][Math.floor(time * 1.15) % 4];
  drawPlayerAvatar(ctx, player, { time, moving: player.moving, mood });
  ctx.restore();
}

function drawLobbyPet(ctx, pet, time) {
  const y = pet.y * LOBBY_Y_SCALE;
  const moving = Math.hypot(pet.vx, pet.vy) > 8;
  const gait = Math.sin(pet.stride);
  const face = Math.cos(pet.facingAngle || 0) < 0 ? -1 : 1;
  const bob = Math.sin(time * (moving ? 7 : 3.2) + pet.stride * 0.2) * (moving ? 2.5 : 1.1);
  ctx.save();
  ctx.translate(pet.x, y);
  drawInteractionRing(ctx, LOBBY_PET.id, LOBBY_PET.color, 42, 18);
  drawObjectShadow(ctx, 0, 18, 35, 10);
  ctx.translate(0, -10 + bob);
  ctx.scale(face, 1);

  ctx.strokeStyle = "#7892a0";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-27, 1);
  ctx.quadraticCurveTo(-45, -10 - Math.sin(pet.tailPhase) * 7, -52, -28);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(LOBBY_PET.color, 0.8);
  ctx.beginPath();
  ctx.arc(-53, -29, 6, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#152936";
  ctx.strokeStyle = "#5b7687";
  ctx.lineWidth = 3;
  roundRect(ctx, -31, -21, 59, 34, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hexToRgba(LOBBY_PET.color, 0.55);
  ctx.fillRect(-18, -15, 35, 7);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(3, -2, 6, 0, TAU);
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.strokeStyle = "#6c8290";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(side * 20, 8);
    ctx.lineTo(side * 24 + gait * side * 3, 24);
    ctx.lineTo(side * 30 - gait * side * 3, 31);
    ctx.stroke();
    ctx.fillStyle = "#213b48";
    ctx.fillRect(side * 30 - (side > 0 ? 5 : 8), 27, 13, 6);
  }

  ctx.fillStyle = "#1e3543";
  ctx.strokeStyle = "#7593a2";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, -18);
  ctx.lineTo(38, -28);
  ctx.lineTo(49, -14);
  ctx.lineTo(43, 5);
  ctx.lineTo(22, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0b1821";
  ctx.fillRect(35, -14, 14, 13);
  ctx.fillStyle = LOBBY_PET.color;
  ctx.fillRect(40, -11, 8, 6);
  ctx.fillStyle = "#243e4c";
  ctx.beginPath();
  ctx.moveTo(23, -22);
  ctx.lineTo(27, -41);
  ctx.lineTo(36, -24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(LOBBY_PET.color, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(31, -26);
  ctx.lineTo(30, -48);
  ctx.stroke();
  ctx.fillStyle = "#ff7a8a";
  ctx.beginPath();
  ctx.arc(30, -50, 4, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (pet.bubble && pet.bubbleLife > 0) {
    ctx.save();
    ctx.translate(pet.x, y);
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = "center";
    const width = Math.max(100, ctx.measureText(pet.bubble).width + 22);
    ctx.fillStyle = "rgba(3,10,17,0.93)";
    ctx.strokeStyle = hexToRgba(LOBBY_PET.color, 0.78);
    roundRect(ctx, -width / 2, -92, width, 26, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#eafcff";
    ctx.fillText(pet.bubble, 0, -75);
    ctx.restore();
  }
}

function drawMobileLight(ctx, light, position, time) {
  const y = position.y * LOBBY_Y_SCALE - 78;
  ctx.save();
  ctx.translate(position.x, y);
  ctx.strokeStyle = "rgba(94,123,139,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.fillStyle = "#142631";
  ctx.strokeStyle = hexToRgba(light.color, 0.85);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-25, -12);
  ctx.lineTo(18, -12);
  ctx.lineTo(29, 0);
  ctx.lineTo(18, 12);
  ctx.lineTo(-25, 12);
  ctx.lineTo(-32, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hexToRgba(light.color, 0.75 + Math.sin(time * 4 + light.phase * 9) * 0.12);
  ctx.fillRect(-18, -5, 38, 10);
  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.fillRect(-12, -3, 18, 3);
  ctx.strokeStyle = hexToRgba(light.color, 0.28);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-21, 14);
  ctx.lineTo(-42, 62);
  ctx.moveTo(21, 14);
  ctx.lineTo(42, 62);
  ctx.stroke();
  ctx.restore();
}

function drawDoor(ctx, door, time) {
  const runtime = state.lobby.doors[door.id] || { progress: 0, state: "closed" };
  const y = door.y * LOBBY_Y_SCALE;
  const open = runtime.progress;
  ctx.save();
  ctx.translate(door.x, y);
  const vertical = door.orientation === "vertical";
  if (vertical) ctx.rotate(Math.PI / 2);
  drawObjectShadow(ctx, 0, 13, 112, 16);
  ctx.fillStyle = "#08131c";
  ctx.strokeStyle = "#395363";
  ctx.lineWidth = 4;
  ctx.fillRect(-112, -18, 224, 36);
  ctx.strokeRect(-112, -18, 224, 36);
  const panelWidth = 88 * (1 - open);
  for (const side of [-1, 1]) {
    const panelX = side * (112 - panelWidth / 2);
    ctx.fillStyle = "#172b37";
    ctx.strokeStyle = hexToRgba(door.color, 0.72);
    ctx.lineWidth = 3;
    ctx.fillRect(panelX - panelWidth / 2, -15, panelWidth, 30);
    ctx.strokeRect(panelX - panelWidth / 2, -15, panelWidth, 30);
  }
  const statusColor = runtime.state === "closed" ? "#ff7a8a" : door.color;
  ctx.fillStyle = hexToRgba(statusColor, 0.72 + Math.sin(time * 5) * 0.15);
  ctx.fillRect(-7, -24, 14, 7);
  ctx.restore();
}

function drawRoomRoofs(ctx, time) {
  for (const room of LOBBY_ROOMS) {
    if (!room.roof || !pointNearCamera(room.x, room.y, room.w, room.h)) continue;
    const reveal = lobbyRoomReveal(room.id);
    if (reveal >= 0.995) continue;
    const y = room.y * LOBBY_Y_SCALE;
    const h = room.h * LOBBY_Y_SCALE;
    const halfPanel = room.w / 2;
    const shift = reveal * (halfPanel + 36);
    const alpha = 1 - reveal * 0.72;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const side of [-1, 1]) {
      const centerX = room.x + side * (halfPanel / 2 + shift);
      const gradient = ctx.createLinearGradient(centerX - halfPanel / 2, y, centerX + halfPanel / 2, y);
      gradient.addColorStop(0, "#07131c");
      gradient.addColorStop(0.5, "#112733");
      gradient.addColorStop(1, "#07131c");
      ctx.fillStyle = gradient;
      ctx.strokeStyle = hexToRgba(room.color, 0.5);
      ctx.lineWidth = 5;
      ctx.fillRect(centerX - halfPanel / 2, y - h / 2, halfPanel, h);
      ctx.strokeRect(centerX - halfPanel / 2, y - h / 2, halfPanel, h);
      ctx.strokeStyle = "rgba(156,197,214,0.16)";
      ctx.lineWidth = 2;
      for (let px = centerX - halfPanel / 2 + 55; px < centerX + halfPanel / 2; px += 95) {
        ctx.beginPath();
        ctx.moveTo(px, y - h / 2 + 15);
        ctx.lineTo(px, y + h / 2 - 15);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = Math.min(1, alpha + 0.18);
    ctx.fillStyle = hexToRgba(room.color, 0.7);
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${room.label} // 气密舱`, room.x, y - 6);
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = "rgba(214,235,242,0.62)";
    ctx.fillText("进入房间以解除视觉隔离", room.x, y + 15);
    ctx.restore();
  }
}

function drawInteractionRing(ctx, id, color, rx, ry) {
  if (state.lobby.nearbyInteractionId !== id && state.lobby.hoveredInteractionId !== id) return;
  const pulse = 0.55 + Math.sin(state.lobby.time * 6) * 0.18;
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, pulse);
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 6]);
  ctx.lineDashOffset = -state.lobby.time * 24;
  ctx.beginPath();
  ctx.ellipse(0, 29, rx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawObjectShadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = "rgba(0,0,0,0.43)";
  ctx.beginPath();
  ctx.ellipse(x + 13, y + 8, rx, ry, -0.12, 0, TAU);
  ctx.fill();
}

function drawTechLabel(ctx, title, subtitle, color, x, y, active) {
  ctx.fillStyle = "#07111a";
  ctx.strokeStyle = hexToRgba(color, active ? 0.72 : 0.3);
  ctx.lineWidth = 2;
  roundRect(ctx, x - 95, y - 19, 190, 45, 7);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = active ? "#eefbff" : "#7f8c95";
  ctx.fillText(title, x, y - 1);
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = hexToRgba(color, active ? 0.85 : 0.4);
  ctx.fillText(subtitle, x, y + 16);
}

function drawWeaponStationLabel(ctx, title, color, x, y, selected) {
  ctx.fillStyle = "#07111a";
  ctx.strokeStyle = hexToRgba(color, selected ? 0.92 : 0.68);
  ctx.lineWidth = selected ? 3 : 2;
  roundRect(ctx, x - 108, y - 20, 216, 41, 8);
  ctx.fill();
  ctx.stroke();
  let fontSize = 16;
  ctx.font = `bold ${fontSize}px ${FONT}`;
  while (fontSize > 12 && ctx.measureText(title).width > 176) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px ${FONT}`;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3fcff";
  ctx.fillText(title, x, y + 6);
  if (selected) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 96, y);
    ctx.lineTo(x - 88, y - 8);
    ctx.lineTo(x - 80, y);
    ctx.lineTo(x - 88, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexToRgba(color, 0.72);
    ctx.fillRect(x + 82, y - 8, 12, 16);
  }
}

function collectLobbyLights(viewport) {
  const lights = [];
  const add = (x, y, radius, color, strength, core = 0.18, priority = 20) => {
    const screen = lobbyWorldToScreen(x, y, viewport);
    if (screen.x < -radius || screen.x > viewport.width + radius || screen.y < -radius || screen.y > viewport.height + radius) return;
    lights.push({
      x: screen.x,
      y: screen.y,
      radius: radius * LOBBY_ZOOM,
      color,
      strength,
      core,
      priority,
      centerDistance: Math.hypot(screen.x - viewport.width / 2, screen.y - viewport.height / 2),
    });
  };
  add(state.lobby.player.x, state.lobby.player.y - 26 / LOBBY_Y_SCALE, 205, "#ffd6a8", 0.72, 0.32, 100);
  for (const portal of LOBBY_PORTALS) {
    if (portal.kind !== "home" && isLobbyRoomVisible(portal.roomId)) {
      add(portal.x, portal.y - 105 / LOBBY_Y_SCALE, state.lobby.pendingLaunch?.portalId === portal.id ? 285 : 230, portal.color, state.lobby.pendingLaunch?.portalId === portal.id ? 0.82 : 0.58, 0.22, 88);
    }
  }
  for (const light of LOBBY_LIGHTS) {
    if (!isLobbyRoomVisible(light.roomId)) continue;
    add(light.x, light.y - 42 / LOBBY_Y_SCALE, light.radius, light.color, light.strength, 0.24, light.priority);
  }
  for (const light of LOBBY_MOBILE_LIGHTS) {
    if (!isLobbyRoomVisible(light.roomId)) continue;
    const position = lobbyMobileLightPosition(light, state.lobby.mobileLightPhase);
    add(position.x, position.y - 72 / LOBBY_Y_SCALE, light.radius, light.color, 0.46, 0.24, 60);
  }
  for (const device of LOBBY_DEVICES) {
    if (!isLobbyRoomVisible(device.roomId)) continue;
    const radius = device.kind === "missionTable" ? 195 : device.kind === "lever" ? 92 : 148;
    add(device.x, device.y - 40 / LOBBY_Y_SCALE, radius, device.color, device.kind === "lever" ? 0.28 : 0.42, 0.18, 74);
  }
  for (const station of LOBBY_WEAPON_STATIONS) {
    if (!isLobbyRoomVisible(station.roomId)) continue;
    const weapon = weaponForStation(station.slot);
    if (weapon) add(station.x, station.y - 62 / LOBBY_Y_SCALE, 125, weaponPreviewColor(weapon), weapon.id === selectedLobbyWeapon()?.id ? 0.55 : 0.3, 0.18, 68);
  }
  for (const npc of LOBBY_NPCS) {
    const runtime = lobbyNpcRuntime(npc.id);
    const roomId = runtime ? roomForNpc(runtime.x, runtime.y) : null;
    if (runtime && (!roomId || isLobbyRoomVisible(roomId))) add(runtime.x, runtime.y - 34 / LOBBY_Y_SCALE, 70, npc.color, 0.15, 0.16, 12);
  }
  const pet = state.lobby.pet;
  const petRoom = pet ? roomForNpc(pet.x, pet.y) : null;
  if (pet && (!petRoom || isLobbyRoomVisible(petRoom))) {
    add(pet.x + pet.dirX * 25, pet.y - 18 / LOBBY_Y_SCALE, 105, LOBBY_PET.color, 0.3, 0.2, 28);
  }
  for (const scenery of LOBBY_SCENERY) {
    if (!isLobbyRoomVisible(scenery.roomId)) continue;
    if (scenery.kind === "reactor") add(scenery.x, scenery.y - 85 / LOBBY_Y_SCALE, 250, scenery.color, 0.62, 0.2, 76);
    else if (scenery.kind === "lifeSupport") add(scenery.x, scenery.y - 55 / LOBBY_Y_SCALE, 155, scenery.color, 0.32, 0.18, 48);
  }
  for (const prop of LOBBY_PROPS) {
    if (prop.kind === "worklight" && isLobbyRoomVisible(prop.roomId)) {
      add(prop.x, prop.y - 55 / LOBBY_Y_SCALE, 165, prop.color, 0.44, 0.22, 58);
    }
  }
  return lights
    .sort((a, b) => b.priority - a.priority || a.centerDistance - b.centerDistance)
    .slice(0, 32);
}

function drawSpaceBackdrop(ctx, viewport, time) {
  ctx.fillStyle = "#01030a";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  const nebula = ctx.createRadialGradient(viewport.width * 0.72, viewport.height * 0.18, 20, viewport.width * 0.72, viewport.height * 0.18, viewport.width * 0.7);
  nebula.addColorStop(0, "rgba(88,55,160,0.18)");
  nebula.addColorStop(0.45, "rgba(20,82,120,0.08)");
  nebula.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  for (let i = 0; i < 90; i++) {
    const speed = 8 + (i % 7) * 5;
    const x = ((i * 197 + time * speed) % (viewport.width + 180)) - 90;
    const y = (i * 83 + Math.sin(i * 4.1) * 90) % viewport.height;
    const length = 2 + (i % 5) * 2;
    ctx.fillStyle = i % 11 === 0 ? "rgba(180,140,255,0.72)" : "rgba(180,232,255,0.52)";
    ctx.fillRect(x, y, length, i % 3 === 0 ? 2 : 1);
  }
}

function drawScreenFx(ctx, viewport, time) {
  ctx.save();
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.018)";
  for (let y = Math.floor((time * 18) % 8); y < viewport.height; y += 8) ctx.fillRect(0, y, viewport.width, 1);
  const topGlow = ctx.createLinearGradient(0, 0, 0, viewport.height * 0.34);
  topGlow.addColorStop(0, "rgba(66,232,255,0.065)");
  topGlow.addColorStop(1, "rgba(66,232,255,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, viewport.width, viewport.height * 0.38);
  ctx.restore();
}

function actorVisible(actor) {
  return isLobbyRoomVisible(actor.roomId) && pointNearCamera(actor.x, actor.y);
}

function pointNearCamera(x, y, width = 1300, height = 1000) {
  return Math.abs(x - state.lobby.cameraX) <= width && Math.abs(y - state.lobby.cameraY) <= height;
}

function roomForNpc(x, y) {
  const room = LOBBY_ROOMS.find((entry) => (
    x >= entry.x - entry.w / 2 && x <= entry.x + entry.w / 2
    && y >= entry.y - entry.h / 2 && y <= entry.y + entry.h / 2
  ));
  return room?.roof ? room.id : null;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
