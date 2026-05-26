import assert from "node:assert/strict";
import { generateMap } from "../src/map.js";

const maps = Array.from({ length: 8 }, () => generateMap());

const tileMaterials = new Set(maps.flatMap((map) => map.tiles.map((tile) => tile.material)));
const requiredMaterials = ["sealedPanel", "accessPlate", "utilityGrate", "labComposite"];
for (const material of requiredMaterials) {
  assert(
    tileMaterials.has(material),
    `expected generated lab floor tiles to include ${material}`
  );
}

const propKinds = new Set(maps.flatMap((map) => map.props.map((prop) => prop.kind)));
const abandonedLabProps = [
  "fallenMonitor",
  "surgicalTray",
  "hazardBarrel",
  "looseCanister",
  "brokenRobotArm",
  "leakingPipeVent",
];
for (const kind of abandonedLabProps) {
  assert(propKinds.has(kind), `expected abandoned laboratory prop ${kind}`);
}

const dynamicProps = maps.flatMap((map) => map.props.filter((prop) => prop.dynamicDecor));
assert(dynamicProps.length >= maps.length * 3, "expected several moving abandoned-lab decorations per map");

const dynamicKinds = new Set(dynamicProps.map((prop) => prop.kind));
for (const kind of ["swingingCable", "steamLeak", "flickerBeacon"]) {
  assert(dynamicKinds.has(kind), `expected dynamic decoration ${kind}`);
}

console.log("map generation visual data checks passed");
