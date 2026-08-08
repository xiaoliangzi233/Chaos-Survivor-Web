import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { generateMap } from "../src/systems/map.js";
import {
  ARENA_VISUAL_PROFILES,
  ENVIRONMENT_THEME,
  ROOM_VISUAL_PROFILES,
  VisualQuality,
  arenaVisualProfile,
  resolveVisualQuality,
  roomVisualProfile,
  visualSeedFrom,
} from "../src/visual/environmentTheme.js";

test("environment theme keeps semantic colors and all lobby room profiles", () => {
  assert.equal(ENVIRONMENT_THEME.palette.navigation, "#42e8ff");
  assert.equal(ENVIRONMENT_THEME.palette.safe, "#77ff8a");
  assert.equal(ENVIRONMENT_THEME.palette.reward, "#ffd166");
  assert.equal(ENVIRONMENT_THEME.palette.danger, "#ff4d6d");
  assert.equal(ENVIRONMENT_THEME.palette.anomaly, "#b48cff");
  assert.deepEqual(Object.keys(ROOM_VISUAL_PROFILES).sort(), ["bridge", "combat", "core", "data", "engineering", "habitat", "science"]);
  assert.ok(Object.keys(ARENA_VISUAL_PROFILES).length >= 7);
  assert.equal(roomVisualProfile("missing").decal, "system");
  assert.equal(arenaVisualProfile("missing").decal, "system");
});

test("visual seeds and quality selection are deterministic", () => {
  assert.equal(visualSeedFrom("reactor-core"), visualSeedFrom("reactor-core"));
  assert.notEqual(visualSeedFrom("reactor-core"), visualSeedFrom("server-wall"));
  assert.equal(resolveVisualQuality({ width: 1920, height: 1080, dpr: 1 }), VisualQuality.ULTRA);
  assert.equal(resolveVisualQuality({ width: 1280, height: 720, dpr: 1 }), VisualQuality.HIGH);
  assert.equal(resolveVisualQuality({ width: 390, height: 844, dpr: 3 }), VisualQuality.REDUCED);
  assert.equal(resolveVisualQuality({ width: 1920, height: 1080, reducedMotion: true }), VisualQuality.REDUCED);
});

test("generated maps receive backward-compatible visual profile defaults", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.3125;
  let map;
  try {
    map = generateMap();
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(map.rooms.every((room) => room.visualProfile && Number.isInteger(room.detailSeed)));
  assert.ok(map.props.every((prop) => (
    prop.visualProfile
    && Number.isInteger(prop.detailSeed)
    && Number.isFinite(prop.wear)
    && ["active", "ambient"].includes(prop.lightProfile)
  )));
});

test("player-facing UI loads the split visual system and keeps capture profiles", async () => {
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const file of ["visual-tokens.css", "visual-components.css", "visual-screens.css", "visual-responsive.css"]) {
    assert.match(index, new RegExp(file.replace(".", "\\.")));
  }
  for (const id of ["hud", "shopOverlay", "inventoryOverlay", "codexOverlay", "pauseOverlay", "endOverlay"]) {
    const matches = index.match(new RegExp(`id=["']${id}["']`, "g")) ?? [];
    assert.equal(matches.length, 1, `${id} must remain a unique event hook`);
  }
  for (const id of ["shopOverlay", "inventoryOverlay", "codexOverlay", "pauseOverlay", "endOverlay"]) {
    assert.match(index, new RegExp(`id=["']${id}["'][^>]*aria-hidden=["']true["']`));
  }
  const exporter = await readFile(new URL("../tools/visual-exporter.js", import.meta.url), "utf8");
  for (const profile of ["desktop-xl", "desktop-compact", "mobile"]) {
    assert.match(exporter, new RegExp(profile));
  }
  for (const dimension of ["1920, height: 1080", "1366, height: 768", "390, height: 844"]) {
    assert.match(exporter, new RegExp(dimension));
  }
  const responsive = await readFile(new URL("../styles/visual-responsive.css", import.meta.url), "utf8");
  assert.match(responsive, /@media \(max-width: 820px\)/);
  assert.match(responsive, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(index, /loadoutOverlay/);
  assert.doesNotMatch(responsive, /loadout/);
  for (const file of [
    "../styles.css",
    "../styles/visual-components.css",
    "../styles/visual-screens.css",
    "../src/ui/ui.js",
    "../tools/visual-ui-capture.html",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /loadout(?:Overlay|-panel|-head|-body|-section|-weapon|-difficulty|-mode)/i, `${file} must not restore the retired loadout panel`);
  }
});
