import { multiplayerConfig } from "../config/multiplayer-config.js";

export const LAN_PROTOCOL = "survivor-p2p-v1";

export class LanRoomError extends Error {
  constructor(message, { code = "signal_unavailable", status = 0 } = {}) {
    super(message);
    this.name = "LanRoomError";
    this.code = code;
    this.status = status;
  }
}

export async function createLanRoom(offer, { fetchImpl = fetch } = {}) {
  return requestJson("/api/p2p/rooms", {
    method: "POST",
    body: JSON.stringify({ protocol: LAN_PROTOCOL, offer }),
  }, fetchImpl);
}

export async function fetchLanOffer(roomId, { fetchImpl = fetch } = {}) {
  return requestJson(`/api/p2p/rooms/${normalizeRoomId(roomId)}?role=guest`, {}, fetchImpl);
}

export async function publishLanAnswer(roomId, answer, { fetchImpl = fetch } = {}) {
  return requestJson(`/api/p2p/rooms/${normalizeRoomId(roomId)}`, {
    method: "POST",
    body: JSON.stringify({ protocol: LAN_PROTOCOL, answer }),
  }, fetchImpl);
}

export async function fetchLanAnswer(roomId, { fetchImpl = fetch } = {}) {
  return requestJson(`/api/p2p/rooms/${normalizeRoomId(roomId)}?role=host`, {}, fetchImpl);
}

export async function cancelLanRoom(roomId, { fetchImpl = fetch } = {}) {
  await requestJson(`/api/p2p/rooms/${normalizeRoomId(roomId)}`, { method: "DELETE" }, fetchImpl);
}

export function signalServerUrl() {
  return signalServerUrlFromSearch() || String(multiplayerConfig.signalServerUrl || "").trim().replace(/\/$/, "");
}

export function isRemoteSignalConfigured() {
  return Boolean(signalServerUrl());
}

export function signalTransportLabel() {
  return isRemoteSignalConfigured() ? "在线信令" : "局域网信令";
}

export function signalServerUrlFromSearch(search = typeof window !== "undefined" ? window.location.search : "") {
  const value = new URLSearchParams(search).get("signal") || "";
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function createInviteUrl(roomId, href = window.location.href) {
  const url = new URL(href);
  url.searchParams.set("join", normalizeRoomId(roomId));
  return url.toString();
}

export function roomIdFromSearch(search = window.location.search) {
  const value = new URLSearchParams(search).get("join") || "";
  return /^\d{6}$/.test(value) ? value : "";
}

export function normalizeRoomId(roomId) {
  const normalized = String(roomId || "").trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new LanRoomError("请输入 6 位房间号。", { code: "invalid_room" });
  }
  return normalized;
}

async function requestJson(path, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(resolveSignalUrl(path), {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new LanRoomError(
      isRemoteSignalConfigured()
        ? "无法连接在线配对服务，请稍后重试。"
        : "无法连接局域网配对服务。静态部署请先配置在线信令地址。",
      { code: "network" },
    );
  }
  const payload = await parseJson(response);
  if (!response.ok) throw apiError(payload, response.status);
  return payload || {};
}

function resolveSignalUrl(path) {
  return `${signalServerUrl()}${path}`;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(payload, status) {
  const code = payload?.error || "signal_unavailable";
  const messages = {
    signal_unavailable: "配对服务暂时不可用，请稍后重试。",
    lan_unavailable: "本机未以局域网模式启动。请使用 start.cmd -Lan 后重新创建房间。",
    room_not_found: "房间不存在或已过期，请让主机重新创建邀请链接。",
    room_taken: "该房间已有伙伴加入。",
    invalid_offer: "主机连接信息无效，请重新创建房间。",
    invalid_answer: "伙伴连接信息无效，请重新加入房间。",
    origin_not_allowed: "此游戏站点未获配对服务授权，请检查信令服务配置。",
  };
  return new LanRoomError(messages[code] || "配对服务返回了错误。", { code, status });
}
