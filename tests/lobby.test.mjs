import test from "node:test";
import assert from "node:assert/strict";

import { input, state } from "../src/state.js";
import {
  LOBBY_CORRIDORS,
  LOBBY_DEVICES,
  LOBBY_DOORS,
  LOBBY_LIGHTS,
  LOBBY_MOBILE_LIGHTS,
  LOBBY_NAV_NODES,
  LOBBY_PET,
  LOBBY_PROPS,
  LOBBY_SCENERY,
  LOBBY_WEAPON_STATIONS,
  LOBBY_WEAPONS_PER_PAGE,
  allLobbyInteractions,
  buildLobbyRunConfig,
  cancelLobbyLaunch,
  cancelLobbyPlayerMove,
  clampLobbyWeaponPage,
  configureLobbyDifficulties,
  configureLobbyWeapons,
  enterLobby,
  findLobbyPath,
  findLobbyInteractionAtWorld,
  findNearestLobbyInteraction,
  interactWithLobby,
  lobbyColliders,
  lobbyMobileLightPosition,
  lobbyNpcDialogue,
  lobbyInteriorRoomAt,
  lobbyRoomAt,
  resolveLobbyPosition,
  selectedLobbyWeapon,
  setLobbyPlayerMoveTarget,
  setLobbyModalOpen,
  updateLobby,
  weaponForStation,
} from "../src/systems/lobby.js";
import { lobbyPetSniffArc } from "../src/systems/lobbyRenderer.js";
import {
  consumeLobbyFirstClearReaction,
  getLobbyFirstClearReactions,
  loadPlayerProgress,
  queueLobbyFirstClearReactions,
} from "../src/systems/playerProgress.js";

const weapons = Array.from({ length: 12 }, (_, index) => ({
  id: `weapon_${index}`,
  name: `武器 ${index + 1}`,
  icon: "◇",
}));

const difficulties = [
  { id: "neon", name: "霓虹荒野", unlocked: true },
  { id: "overclock", name: "超频风暴", unlocked: true, currentHighest: true },
  { id: "locked", name: "未解锁", unlocked: false },
];

function resetLobby() {
  configureLobbyWeapons(weapons);
  state.lobby.selectedWeaponId = "weapon_0";
  state.lobby.selectedDifficultyId = "";
  configureLobbyDifficulties(difficulties);
  enterLobby();
  state.lobby.pendingLaunch = null;
  state.lobby.randomGoal = "twenty_waves";
  state.lobby.modalOpen = false;
  state.lobby.nearbyInteractionId = null;
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;
}

test("lobby weapon pages expose four weapons and wrap through three groups", () => {
  resetLobby();
  state.lobby.weaponPage = 0;
  assert.equal(LOBBY_WEAPONS_PER_PAGE, 4);
  assert.equal(weaponForStation(0).id, "weapon_0");
  assert.equal(weaponForStation(3).id, "weapon_3");
  assert.equal(clampLobbyWeaponPage(3), 0);
  assert.equal(clampLobbyWeaponPage(-1), 2);
});

test("lever interaction cycles groups and station interaction selects its hologram", () => {
  resetLobby();
  state.lobby.weaponPage = 0;
  state.lobby.player.x = -1900;
  state.lobby.player.y = 1084;
  const lever = interactWithLobby();
  assert.equal(lever.action, "weapon-page");
  assert.equal(state.lobby.weaponPage, 1);
  assert.equal(weaponForStation(2).id, "weapon_6");

  state.lobby.player.x = -1760;
  state.lobby.player.y = 744;
  state.lobby.player.dirX = 0;
  state.lobby.player.dirY = -1;
  const station = interactWithLobby();
  assert.equal(station.action, "weapon-select");
  assert.equal(selectedLobbyWeapon().id, "weapon_6");
});

test("facing-aware interaction chooses visible room targets and hides sealed rooms", () => {
  resetLobby();
  const coreInteractions = allLobbyInteractions({ x: 0, y: 0, dirX: 0, dirY: -1 });
  assert.equal(coreInteractions.some((entry) => entry.roomId === "data"), false);

  state.lobby.player.x = 0;
  state.lobby.player.y = -1383;
  state.lobby.player.dirX = 0;
  state.lobby.player.dirY = -1;
  const story = findNearestLobbyInteraction(state.lobby.player, 80);
  assert.equal(story.id, "story-gate");
  assert.equal(lobbyRoomAt(state.lobby.player.x, state.lobby.player.y).id, "bridge");
});

test("lobby collision keeps the player outside devices and ship hull", () => {
  resetLobby();
  const insideMissionTable = resolveLobbyPosition(0, -70, 15);
  assert.ok(Math.abs(insideMissionTable.x) > 125 || Math.abs(insideMissionTable.y + 70) > 59);

  const outsideBounds = resolveLobbyPosition(9000, 9000, 15);
  assert.ok(outsideBounds.x <= 2742);
  assert.ok(outsideBounds.y <= 1742);
});

test("automatic doors open for nearby entities and expose their doorway", () => {
  resetLobby();
  const door = LOBBY_DOORS.find((entry) => entry.id === "data-door");
  state.lobby.player.x = door.x + 80;
  state.lobby.player.y = door.y;
  updateLobby(0.4);
  assert.ok(state.lobby.doors[door.id].progress >= 0.78);
  const doorway = resolveLobbyPosition(door.x, door.y, 15);
  assert.ok(Math.abs(doorway.x - door.x) < 20);
  assert.ok(Math.abs(doorway.y - door.y) < 20);
});

test("room roofs reveal only after the player crosses the airlock threshold", () => {
  resetLobby();
  state.lobby.modalOpen = true;
  state.lobby.currentRoomId = null;
  state.lobby.roomReveal.data = 0;
  state.lobby.player.x = -1290;
  state.lobby.player.y = -650;
  updateLobby(0.05);
  assert.equal(state.lobby.currentRoomId, null);
  assert.equal(lobbyInteriorRoomAt(-1300, -650, 23), null);
  state.lobby.player.x = -1330;
  updateLobby(0.05);
  assert.equal(state.lobby.currentRoomId, "data");
  assert.equal(lobbyInteriorRoomAt(-1330, -650, 23)?.id, "data");
  state.lobby.player.x = -1285;
  updateLobby(0.05);
  assert.equal(state.lobby.currentRoomId, null);
});

test("navigation graph connects every functional wing through door nodes", () => {
  resetLobby();
  const destinations = ["bridge-story", "data-random", "science-gene", "combat-trial", "engineering-reactor", "habitat-home"];
  for (const destination of destinations) {
    const path = findLobbyPath("core-center", destination);
    assert.equal(path[0], "core-center");
    assert.equal(path.at(-1), destination);
    assert.ok(path.length >= 3);
  }
});

test("NPCs follow ship routes, socialize, and expose personality dialogue", () => {
  resetLobby();
  const guide = state.lobby.npcs.guide;
  const tactician = state.lobby.npcs.tactician;
  guide.x = 0;
  guide.y = 330;
  tactician.x = 50;
  tactician.y = 330;
  guide.mode = "work";
  tactician.mode = "work";
  guide.wait = 0;
  tactician.wait = 0;
  guide.socialCooldown = 0;
  tactician.socialCooldown = 0;
  updateLobby(0.05);
  assert.equal(guide.mode, "social");
  assert.equal(tactician.mode, "social");
  assert.ok(guide.bubble.length > 0);

  guide.mode = "travel";
  guide.partnerId = null;
  guide.path = findLobbyPath("core-social", "bridge-nav");
  guide.pathIndex = 1;
  guide.targetNodeId = "bridge-nav";
  guide.x = 0;
  guide.y = 330;
  const startY = guide.y;
  for (let i = 0; i < 12; i++) updateLobby(0.1);
  assert.ok(guide.y < startY);

  const dialogue = lobbyNpcDialogue("guide");
  assert.equal(dialogue.portrait, "guide");
  assert.ok(dialogue.topics.length >= 4);
  assert.match(dialogue.text, /霓虹中转舰/);
});

test("difficulty and random protocol cycle only valid lobby configuration", () => {
  resetLobby();
  assert.equal(state.lobby.selectedDifficultyId, "overclock");
  const difficultyDevice = LOBBY_DEVICES.find((entry) => entry.id === "difficulty-sync");
  assert.equal(difficultyDevice.roomId, "bridge");
  const difficultyStand = resolveLobbyPosition(difficultyDevice.x, difficultyDevice.y + 100, 15);
  state.lobby.player.x = difficultyStand.x;
  state.lobby.player.y = difficultyStand.y;
  const difficulty = interactWithLobby();
  assert.equal(difficulty.action, "difficulty");
  assert.equal(difficulty.difficulty.id, "neon");
  assert.equal(state.lobby.toast, null);

  state.lobby.player.x = -1600;
  state.lobby.player.y = -986;
  state.lobby.player.dirX = 0;
  state.lobby.player.dirY = -1;
  const protocol = interactWithLobby();
  assert.equal(protocol.action, "random-goal");
  assert.equal(state.lobby.randomGoal, "endless");
  const config = buildLobbyRunConfig("random");
  assert.equal(config.difficulty.id, "neon");
  assert.equal(config.randomGoal, "endless");
});

test("story portal charges, can be cancelled, and emits direct launch parameters", () => {
  resetLobby();
  state.lobby.player.x = 0;
  state.lobby.player.y = -1383;
  state.lobby.player.dirX = 0;
  state.lobby.player.dirY = -1;
  const charge = interactWithLobby();
  assert.equal(charge.action, "launch-charge");
  assert.equal(state.lobby.pendingLaunch.runMode, "story");
  updateLobby(0.5);
  assert.equal(cancelLobbyLaunch(), true);
  assert.equal(state.lobby.pendingLaunch, null);

  const secondCharge = interactWithLobby();
  assert.equal(secondCharge.action, "launch-charge");
  const event = updateLobby(1.2);
  assert.equal(event.type, "launch");
  assert.equal(event.config.runMode, "standard");
  assert.equal(event.config.weapon.id, "weapon_0");
  assert.equal(event.config.difficulty.id, "overclock");
});

test("keyboard movement accelerates smoothly while modal overlays lock movement", () => {
  resetLobby();
  assert.equal(state.lobby.player.speed, 245);
  const startX = state.lobby.player.x;
  input.right = true;
  updateLobby(0.1);
  input.right = false;
  assert.ok(state.lobby.player.x > startX);
  assert.ok(state.lobby.player.vx > 0 && state.lobby.player.vx < state.lobby.player.speed);

  const lockedX = state.lobby.player.x;
  setLobbyModalOpen(true);
  input.right = true;
  updateLobby(0.2);
  input.right = false;
  assert.equal(state.lobby.player.x, lockedX);
  setLobbyModalOpen(false);
});

test("ground clicks steer the lobby player and keyboard input cancels the route", () => {
  resetLobby();
  state.lobby.player.x = 120;
  state.lobby.player.y = 150;
  assert.equal(setLobbyPlayerMoveTarget(340, 330), true);
  for (let frame = 0; frame < 40; frame++) updateLobby(0.05);
  assert.ok(Math.hypot(state.lobby.player.x - 340, state.lobby.player.y - 330) < 12);
  assert.equal(state.lobby.player.moveTargetActive, false);

  assert.equal(setLobbyPlayerMoveTarget(1900, -800), true);
  assert.ok(state.lobby.player.movePath.length >= 3);
  input.right = true;
  updateLobby(0.05);
  input.right = false;
  assert.equal(state.lobby.player.moveTargetActive, false);
  assert.equal(state.lobby.player.movePath.length, 0);

  setLobbyPlayerMoveTarget(-1900, 850);
  setLobbyModalOpen(true);
  assert.equal(state.lobby.player.moveTargetActive, false);
  setLobbyModalOpen(false);
  cancelLobbyPlayerMove();
});

test("K-09 sniff arcs open toward the same side as its head", () => {
  const right = lobbyPetSniffArc(1);
  const left = lobbyPetSniffArc(-1);
  assert.ok(right.centerX > 0);
  assert.ok(Math.cos((right.startAngle + right.endAngle) * 0.5) > 0);
  assert.ok(left.centerX < 0);
  assert.ok(Math.cos((left.startAngle + left.endAngle) * 0.5) < 0);
});

test("scenery and grounded props contribute compound collision footprints", () => {
  resetLobby();
  const colliders = lobbyColliders();
  for (const scenery of LOBBY_SCENERY) {
    assert.ok(colliders.some((entry) => entry.sourceId === scenery.id), `${scenery.id} should block movement`);
  }
  for (const prop of LOBBY_PROPS.filter((entry) => entry.colliders?.length)) {
    assert.ok(colliders.some((entry) => entry.sourceId === prop.id), `${prop.id} should block movement`);
  }
  const reactor = LOBBY_SCENERY.find((entry) => entry.id === "engineering-reactor");
  const resolved = resolveLobbyPosition(reactor.x, reactor.y + 24, 15);
  assert.ok(Math.hypot(resolved.x - reactor.x, resolved.y - (reactor.y + 24)) >= 120);
  const workNodeIds = [
    "bridge-nav", "science-med", "science-life", "combat-hangar",
    "engineering-reactor", "engineering-power", "habitat-mess",
  ];
  for (const node of LOBBY_NAV_NODES.filter((entry) => workNodeIds.includes(entry.id))) {
    const safe = resolveLobbyPosition(node.x, node.y, 13);
    assert.ok(Math.hypot(safe.x - node.x, safe.y - node.y) < 1, `${node.id} must remain outside scenery footprints`);
  }
});

test("corridors align with airlock doors, connect to the central spine, and stay clear of props", () => {
  const doorByRoom = new Map(LOBBY_DOORS.map((entry) => [entry.roomId, entry]));
  const horizontalLinks = LOBBY_CORRIDORS.filter((entry) => entry.axis === "horizontal");
  for (const corridor of horizontalLinks) {
    const door = doorByRoom.get(corridor.toRoomId);
    assert.ok(door, `${corridor.id} must terminate at an airlock`);
    assert.equal(corridor.y, door.y, `${corridor.id} must align vertically with ${door.id}`);
    const left = corridor.x - corridor.w / 2;
    const right = corridor.x + corridor.w / 2;
    assert.ok(Math.abs(door.x - left) < 0.01 || Math.abs(door.x - right) < 0.01, `${corridor.id} must meet its room wall`);
    assert.ok(
      Math.abs(Math.abs(left) - 125) < 0.01 || Math.abs(Math.abs(right) - 125) < 0.01,
      `${corridor.id} must open into the central spine`,
    );
  }

  for (const prop of LOBBY_PROPS) {
    for (const footprint of prop.colliders || []) {
      const footprintX = prop.x + (footprint.ox || 0);
      const footprintY = prop.y + (footprint.oy || 0);
      const halfW = footprint.shape === "circle" ? footprint.r : footprint.w / 2;
      const halfH = footprint.shape === "circle" ? footprint.r : footprint.h / 2;
      for (const corridor of LOBBY_CORRIDORS) {
        const overlaps = Math.abs(footprintX - corridor.x) < halfW + corridor.w / 2
          && Math.abs(footprintY - corridor.y) < halfH + corridor.h / 2;
        assert.equal(overlaps, false, `${prop.id} must not obstruct ${corridor.id}`);
      }
    }
  }
  for (const station of LOBBY_WEAPON_STATIONS) {
    for (const prop of LOBBY_PROPS.filter((entry) => entry.roomId === station.roomId)) {
      assert.ok(
        Math.hypot(station.x - prop.x, station.y - prop.y) > 140,
        `${prop.id} must not cover ${station.id}`,
      );
    }
  }
});

test("explicit pointer targets keep the same proximity rules as keyboard interaction", () => {
  resetLobby();
  const guide = state.lobby.npcs.guide;
  state.lobby.player.x = guide.x - 70;
  state.lobby.player.y = guide.y;
  const hit = findLobbyInteractionAtWorld(guide.x, guide.y);
  assert.equal(hit.id, "guide");
  const interaction = interactWithLobby(hit.id);
  assert.equal(interaction.action, "npc-talk");
  state.lobby.talkingNpcId = null;
  state.lobby.modalOpen = false;
  state.lobby.player.x = 0;
  state.lobby.player.y = 0;
  assert.equal(interactWithLobby("story-gate"), null);
});

test("NPC hard separation resolves exact overlap without deadlock", () => {
  resetLobby();
  const guide = state.lobby.npcs.guide;
  const tactician = state.lobby.npcs.tactician;
  guide.x = tactician.x = 340;
  guide.y = tactician.y = 320;
  guide.mode = "playerTalk";
  tactician.mode = "work";
  state.lobby.talkingNpcId = "guide";
  updateLobby(0.05);
  assert.ok(Math.hypot(guide.x - tactician.x, guide.y - tactician.y) > 30);
  state.lobby.talkingNpcId = null;
});

test("machine dog is interactable and mobile lights follow bounded routes", () => {
  resetLobby();
  const pet = state.lobby.pet;
  state.lobby.player.x = pet.x - 60;
  state.lobby.player.y = pet.y;
  const interaction = interactWithLobby(LOBBY_PET.id);
  assert.equal(interaction.action, "pet");
  assert.ok(pet.bubble.length > 0);
  assert.equal(LOBBY_LIGHTS.length >= 20, true);
  const groundedColliders = lobbyColliders().filter((entry) => entry.sourceId);
  for (const light of LOBBY_MOBILE_LIGHTS) {
    const xs = light.route.map(([x]) => x);
    const ys = light.route.map(([, y]) => y);
    for (let sample = 0; sample < 180; sample++) {
      const routeProgress = sample / 180;
      const position = lobbyMobileLightPosition(light, (routeProgress - light.phase) / light.speed);
      assert.ok(position.x >= Math.min(...xs) && position.x <= Math.max(...xs));
      assert.ok(position.y >= Math.min(...ys) && position.y <= Math.max(...ys));
      for (const collider of groundedColliders) {
        const intersects = collider.shape === "circle"
          ? Math.hypot(position.x - collider.x, position.y - collider.y) < collider.r + 18
          : Math.abs(position.x - collider.x) < collider.w / 2 + 18
            && Math.abs(position.y - collider.y) < collider.h / 2 + 18;
        assert.equal(intersects, false, `${light.id} must avoid ${collider.sourceId}`);
      }
    }
  }
});

test("machine dog supports stationary poses and same-room light chasing", () => {
  resetLobby();
  const pet = state.lobby.pet;
  pet.path = [];
  pet.mode = "sleep";
  pet.wait = 1;
  pet.vx = 70;
  pet.vy = -20;
  updateLobby(0.1);
  assert.equal(pet.mode, "sleep");
  assert.equal(pet.moving, false);
  pet.mode = "chaseLight";
  pet.lightId = "inspection-north";
  pet.wait = 2;
  pet.x = 0;
  pet.y = -420;
  const before = { x: pet.x, y: pet.y };
  updateLobby(0.1);
  assert.equal(pet.mode, "chaseLight");
  assert.ok(Math.hypot(pet.x - before.x, pet.y - before.y) > 0);
});

test("first-clear reactions persist per NPC and are consumed independently", async () => {
  await loadPlayerProgress({ difficultyIds: ["neon", "overclock", "locked"] });
  queueLobbyFirstClearReactions("neon", ["guide", "engineer"]);
  assert.equal(getLobbyFirstClearReactions().guide[0], "neon");
  assert.equal(getLobbyFirstClearReactions().engineer[0], "neon");
  const dialogue = lobbyNpcDialogue("guide");
  assert.equal(dialogue.firstClearDifficultyId, "neon");
  assert.match(dialogue.text, /第一次|首次/);
  assert.equal(dialogue.npcId, "guide");
  assert.ok(dialogue.pages.length >= 1);
  assert.equal(consumeLobbyFirstClearReaction("guide", "neon"), true);
  assert.equal(getLobbyFirstClearReactions().guide, undefined);
  assert.equal(getLobbyFirstClearReactions().engineer[0], "neon");
});
