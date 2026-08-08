const PROTOCOL = "survivor-p2p-v1";
const ROOM_TTL_MS = 15 * 60 * 1000;
const ANSWER_RETENTION_MS = 90 * 1000;
const ROOM_ID_ATTEMPTS = 20;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin, env);
    if (!isAllowedOrigin(origin, env)) return cors(json({ error: "origin_not_allowed" }, 403), origin, env);

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/p2p/")) return cors(json({ error: "not_found" }, 404), origin, env);

    try {
      if (url.pathname === "/api/p2p/rooms" && request.method === "POST") {
        return cors(await createRoom(request, env), origin, env);
      }

      const match = url.pathname.match(/^\/api\/p2p\/rooms\/(\d{6})$/);
      if (!match) return cors(json({ error: "not_found" }, 404), origin, env);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
      const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.text();
      const response = await stub.fetch(`https://signal-room${url.pathname}${url.search}`, {
        method: request.method,
        headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
        body,
      });
      return cors(response, origin, env);
    } catch (error) {
      console.error("P2P signaling request failed", error instanceof Error ? error.message : error);
      return cors(json({ error: "signal_unavailable" }, 503), origin, env);
    }
  },
};

export class SignalRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = await this.readRoom();

    if (url.pathname === "/claim" && request.method === "POST") {
      if (room) return json({ error: "room_taken" }, 409);
      const payload = await request.json().catch(() => null);
      if (!isValidSignal(payload?.offer) || payload?.protocol !== PROTOCOL) return json({ error: "invalid_offer" }, 400);
      const now = Date.now();
      const next = { offer: payload.offer, answer: "", expiresAt: now + ROOM_TTL_MS };
      await this.state.storage.put("room", next);
      await this.state.storage.setAlarm(next.expiresAt);
      return json({ state: "created", expiresIn: Math.round(ROOM_TTL_MS / 1000) }, 201);
    }

    if (!room) return json({ error: "room_not_found" }, 404);
    if (request.method === "GET" && url.searchParams.get("role") === "guest") {
      return json({ state: "offer_ready", offer: room.offer, expiresIn: secondsLeft(room) });
    }
    if (request.method === "GET" && url.searchParams.get("role") === "host") {
      return room.answer
        ? json({ state: "answer_ready", answer: room.answer, expiresIn: secondsLeft(room) })
        : json({ state: "waiting", expiresIn: secondsLeft(room) });
    }
    if (request.method === "POST") {
      if (room.answer) return json({ error: "room_taken" }, 409);
      const payload = await request.json().catch(() => null);
      if (!isValidSignal(payload?.answer) || payload?.protocol !== PROTOCOL) return json({ error: "invalid_answer" }, 400);
      room.answer = payload.answer;
      room.expiresAt = Date.now() + ANSWER_RETENTION_MS;
      await this.state.storage.put("room", room);
      await this.state.storage.setAlarm(room.expiresAt);
      return json({ state: "answer_ready", expiresIn: Math.round(ANSWER_RETENTION_MS / 1000) }, 201);
    }
    if (request.method === "DELETE") {
      await this.state.storage.delete("room");
      return new Response(null, { status: 204 });
    }
    return json({ error: "not_found" }, 404);
  }

  async alarm() {
    await this.state.storage.delete("room");
  }

  async readRoom() {
    const room = await this.state.storage.get("room");
    if (!room || room.expiresAt > Date.now()) return room || null;
    await this.state.storage.delete("room");
    return null;
  }
}

async function createRoom(request, env) {
  const payload = await request.json().catch(() => null);
  if (!isValidSignal(payload?.offer) || payload?.protocol !== PROTOCOL) return json({ error: "invalid_offer" }, 400);
  for (let attempt = 0; attempt < ROOM_ID_ATTEMPTS; attempt += 1) {
    const roomId = createRoomId();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    const response = await stub.fetch("https://signal-room/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 409) continue;
    if (!response.ok) return response;
    const room = await response.json();
    return json({ roomId, expiresIn: room.expiresIn }, 201);
  }
  return json({ error: "signal_unavailable" }, 503);
}

function isAllowedOrigin(origin, env) {
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(origin);
}

function cors(response, origin, env) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Origin", isAllowedOrigin(origin, env) && origin ? origin : "null");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function createRoomId() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
}

function isValidSignal(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 50000;
}

function secondsLeft(room) {
  return Math.max(0, Math.ceil((room.expiresAt - Date.now()) / 1000));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
