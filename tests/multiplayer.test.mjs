import test from "node:test";
import assert from "node:assert/strict";

import { resetRun, state, world } from "../src/state.js";
import { updateRemotePlayer } from "../src/systems/entities.js";
import { allLobbyInteractions, enterLobby, interactWithLobby, updateLobbyPeer } from "../src/systems/lobby.js";
import { applyPlayerDamage } from "../src/systems/items.js";
import { createHostSnapshot, applyHostSnapshot, updateGuestInterpolation } from "../src/net/snapshot.js";
import { setNetworkConnected, setNetworkRole } from "../src/net/netState.js";
import { withPlayerProfile } from "../src/systems/playerProfiles.js";
import { multiplayerEnemyMultipliers } from "../src/systems/multiplayerBalance.js";

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
  assert.notEqual(state.players.p2.inventory, state.inventory);
  assert.notEqual(state.players.p2.weapons, state.weapons);
});

test("P2 profile keeps currency, inventory, and weapon data separate from P1", () => {
  resetMultiplayerRun();
  state.gold = 17;
  state.inventory.items.push({ id: "p1-only", qty: 1 });
  withPlayerProfile("p2", () => {
    state.gold = 33;
    state.inventory.items.push({ id: "p2-only", qty: 1 });
    state.weapons.arc.level = 4;
  });
  assert.equal(state.gold, 17);
  assert.equal(state.inventory.items.some((item) => item.id === "p2-only"), false);
  assert.equal(state.players.p2.gold, 33);
  assert.equal(state.players.p2.inventory.items.some((item) => item.id === "p1-only"), false);
  assert.equal(state.players.p2.weapons.arc.level, 4);
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
  assert.ok(snapshot.economy.p2);

  setNetworkRole("guest");
  setNetworkConnected(true, "P1 主机");
  state.mode = "menu";
  assert.equal(applyHostSnapshot(snapshot), true);
  assert.equal(state.mode, "choosingWeapon");
  assert.equal(world.enemies.length, 1);
  assert.equal(typeof world.enemies[0].draw, "function");
  assert.equal(world.hazards.length, 1);
  assert.ok(state.players.p2.inventory);
});

test("wave-end upgrade readiness and P2 choices survive snapshot transport", () => {
  resetMultiplayerRun();
  state.mode = "leveling";
  state.upgradePhase = {
    active: true,
    p1: { required: true, remaining: 0, ready: true, choices: [], choiceItems: [] },
    p2: {
      required: true,
      remaining: 1,
      ready: false,
      choices: ["vital_core"],
      choiceItems: [{ id: "vital_core", icon: "H", name: "生命核心", stat: "生存", amount: "+10", desc: "提升生命" }],
    },
  };
  const snapshot = createHostSnapshot();
  assert.equal(snapshot.ui.upgradePhase.p1.ready, true);
  assert.equal(snapshot.ui.upgradePhase.p2.remaining, 1);
  assert.equal(snapshot.ui.upgradePhase.p2.choices[0].name, "生命核心");
  setNetworkRole("guest");
  assert.equal(applyHostSnapshot(snapshot), true);
  assert.equal(state.upgradePhase.p2.ready, false);
});

test("guest interpolation advances network targets without teleporting", () => {
  resetMultiplayerRun();
  setNetworkRole("guest");
  state.player.x = 0;
  state.player.y = 0;
  state.player.netTargetX = 100;
  state.player.netTargetY = 40;
  updateGuestInterpolation(1 / 60);
  assert.ok(state.player.x > 0 && state.player.x < 100);
  assert.ok(state.player.y > 0 && state.player.y < 40);
});

test("connected multiplayer enables bounded enemy pressure multipliers", () => {
  resetMultiplayerRun();
  const coop = multiplayerEnemyMultipliers();
  assert.equal(coop.hp, 1.42);
  assert.equal(coop.bossHp, 1.32);
  assert.ok(coop.spawnRate > 1 && coop.enemyLimit > 1);
  setNetworkConnected(false);
  assert.deepEqual(multiplayerEnemyMultipliers(), { hp: 1, bossHp: 1, damage: 1, speed: 1, attackSpeed: 1, spawnRate: 1, enemyLimit: 1 });
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
