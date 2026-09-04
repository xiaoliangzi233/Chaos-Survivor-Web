export const UPGRADE_ATLAS_URL = new URL("../../assets/ui/upgrade-atlas-v1.png", import.meta.url).href;
export const UPGRADE_ATLAS_CELL = 32;
const UPGRADE_ATLAS_COLS = 4;
const UPGRADE_ATLAS_ROWS = 3;

export const UPGRADE_ATLAS_COORDS = Object.freeze({
  vital_core: [0, 0],
  regen_cell: [1, 0],
  phase_stride: [2, 0],
  magnet_field: [3, 0],
  damage_matrix: [0, 1],
  overclock: [1, 1],
  scope_lens: [2, 1],
  crit_kernel: [3, 1],
  armor_plate: [0, 2],
  evasion_ghost: [1, 2],
  lucky_cache: [2, 2],
});

export function upgradeIconHtml(upgradeOrId, fallback = "?", className = "") {
  const entry = upgradeAtlasEntry(upgradeOrId);
  const label = typeof upgradeOrId === "object" ? upgradeOrId?.name || upgradeOrId?.id || "升级" : String(upgradeOrId || "升级");
  if (!entry) return `<i class="${className}">${escapeHtml(fallback || "?")}</i>`;
  const classes = ["upgrade-sprite-icon", className].filter(Boolean).join(" ");
  return `<i class="${classes}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" style="--upgrade-atlas-pos-x:${entry.x * 100 / (UPGRADE_ATLAS_COLS - 1)}%;--upgrade-atlas-pos-y:${entry.y * 100 / (UPGRADE_ATLAS_ROWS - 1)}%;"></i>`;
}

function upgradeAtlasEntry(upgradeOrId) {
  const id = typeof upgradeOrId === "string" ? upgradeOrId : upgradeOrId?.upgradeId || upgradeOrId?.id || "";
  const coord = UPGRADE_ATLAS_COORDS[id];
  return coord ? { id, x: coord[0], y: coord[1], size: UPGRADE_ATLAS_CELL, atlas: UPGRADE_ATLAS_URL } : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
