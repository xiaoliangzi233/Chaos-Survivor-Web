import test from "node:test";
import assert from "node:assert/strict";

import { resetRun, state, world } from "../src/state.js";
import { updateRemotePlayer } from "../src/systems/entities.js";
import { allLobbyInteractions, enterLobby, interactWithLobby, updateLobbyPeer } from "../src/systems/lobby.js";
import { applyPlayerDamage } from "../src/systems/items.js";
import { createHostSnapshot, applyHostSnapshot } from "../src/net/snapshot.js";
import { setNetworkConnected, setNetworkRole } from "../src/net/netState.js";

function resetMultiplayerRun() {
  resetRun(null);
  setNetworkRole("host");
  setNetworkConnected(true, "P2 客机");
}

test("resetRun initializes and clears P2 multiplayer state", () => {
  resetMultiplayerRun();
  assert.equal(state.players.p1, state.player);
  assert.equal(state.players.p2.id, "p2");
  assert.equal(state.players.p2.color, "#ff8bd8");
  state.players.p2.hp = 12;
  resetRun(null);
  assert.equal(state.players.p2.hp, 110);
});

test("host applies remote P2 input with the same movement bounds", () => {
  resetMultiplayerRun();
  const p2 = state.players.p2;
  p2.x = 0;
  p2.y = 0;
  updateRemotePlayer(0.2, { right: true, down: true, seq: 1 });
  assert.ok(p2.x > 0);
  assert.ok(p2.y > 0);
  assert.ok(p2.dirX > 0);
  assert.ok(p2.dirY > 0);
});

test("player damage can target P2 without damaging P1", () => {
  resetMultiplayerRun();
  const p1Hp = state.player.hp;
  const p2 = state.players.p2;
  const result = applyPlayerDamage(18, { x: p2.x, y: p2.y, r: 20 }, p2);
  assert.equal(result.damaged, true);
  assert.equal(state.player.hp, p1Hp);
  assert.equal(p2.hp, 92);
});

test("host snapshot is JSON-safe and applies to guest mirror state", () => {
  resetMultiplayerRun();
  const cyclic = { kind: "storm_strike", x: 10, y: 20, r: 30, damage: 5, life: 1, maxLife: 1, color: "#fff" };
  cyclic.owner = cyclic;
  world.hazards.push(cyclic);
  world.enemies.push({
    id: "dummy",
    type: "dummy",
    name: "Dummy",
    x: 42,
    y: -18,
    r: 16,
    hp: 20,
    maxHp: 20,
    color: "#42e8ff",
    draw() {},
  });
  const snapshot = createHostSnapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));

  setNetworkRole("guest");
  setNetworkConnected(true, "P1 主机");
  state.mode = "menu";
  assert.equal(applyHostSnapshot(snapshot), true);
  assert.equal(state.mode, "choosingWeapon");
  assert.equal(world.enemies.length, 1);
  assert.equal(typeof world.enemies[0].draw, "function");
  assert.equal(world.hazards.length, 1);
});

test("host simulates P2 in the lobby and guest maps lobby snapshots to its local avatar", () => {
  resetMultiplayerRun();
  enterLobby({ resetPosition: true });
  const hostP1 = { ...state.lobby.player };
  const hostP2 = state.lobby.peer;
  const startX = hostP2.x;
  updateLobbyPeer(0.2, { right: true, seq: 1 });
  assert.ok(hostP2.x > startX);
  const hostP2Snapshot = { ...hostP2 };

  const snapshot = createHostSnapshot();
  setNetworkRole("guest");
  setNetworkConnected(true, "P1 主机");
  state.lobby.player.x = -999;
  state.lobby.peer.x = -999;
  assert.equal(applyHostSnapshot(snapshot), true);
  assert.equal(state.lobby.active, true);
  assert.equal(state.lobby.player.id, "p2");
  assert.equal(state.lobby.player.x, hostP2Snapshot.x);
  assert.equal(state.lobby.peer.id, "p1");
  assert.equal(state.lobby.peer.x, hostP1.x);
});

test("P2 may change shared lobby devices but cannot launch a run", () => {
  resetMultiplayerRun();
  enterLobby({ resetPosition: true });
  const p2 = state.lobby.peer;
  state.lobby.currentRoomId = "combat";
  const lever = allLobbyInteractions(p2).find((entry) => entry.action === "weapon-page");
  assert.ok(lever);
  p2.x = lever.x;
  p2.y = lever.y;
  assert.equal(interactWithLobby(lever.id, { player: p2 }).action, "weapon-page");

  state.lobby.currentRoomId = "bridge";
  const launch = allLobbyInteractions(p2).find((entry) => entry.action === "story");
  assert.ok(launch);
  p2.x = launch.x;
  p2.y = launch.y;
  const result = interactWithLobby(launch.id, { player: p2, allowLaunch: false });
  assert.equal(result.denied, "host_only");
  assert.equal(state.lobby.pendingLaunch, null);
});
