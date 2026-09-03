export const WEAPON_ATLAS_URL = new URL("../../assets/ui/weapon-atlas-v1.png", import.meta.url).href;
export const WEAPON_ATLAS_CELL = 128;
const WEAPON_ATLAS_COLS = 4;
const WEAPON_ATLAS_ROWS = 3;

export const WEAPON_ATLAS_COORDS = Object.freeze({
  arc: [0, 0],
  ice: [1, 0],
  missile: [2, 0],
  boomerang: [3, 0],
  drone: [0, 1],
  prism_railgun: [1, 1],
  void_singularity: [2, 1],
  tesla_mine_chain: [3, 1],
  starfall_scepter: [0, 2],
  phase_needler: [1, 2],
  echo_tuning_fork: [2, 2],
  rift_loom: [3, 2],
});

let atlasImage = null;

export function weaponAtlasEntry(weaponOrId) {
  const id = typeof weaponOrId === "string" ? weaponOrId : weaponOrId?.weaponId || weaponOrId?.id || "";
  const coord = WEAPON_ATLAS_COORDS[id];
  return coord ? { id, x: coord[0], y: coord[1], size: WEAPON_ATLAS_CELL, atlas: WEAPON_ATLAS_URL } : null;
}

export function weaponIconHtml(weaponOrId, fallback = "?", className = "") {
  const entry = weaponAtlasEntry(weaponOrId);
  const label = typeof weaponOrId === "object" ? weaponOrId?.name || weaponOrId?.id || "武器" : String(weaponOrId || "武器");
  if (!entry) return `<i class="${className}">${escapeHtml(fallback || "?")}</i>`;
  const classes = ["weapon-sprite-icon", className].filter(Boolean).join(" ");
  return `<i class="${classes}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" style="--weapon-atlas-pos-x:${entry.x * 100 / (WEAPON_ATLAS_COLS - 1)}%;--weapon-atlas-pos-y:${entry.y * 100 / (WEAPON_ATLAS_ROWS - 1)}%;"></i>`;
}

export function drawWeaponAtlasIcon(ctx, weaponOrId, x, y, size = 96) {
  const entry = weaponAtlasEntry(weaponOrId);
  const image = ensureAtlasImage();
  if (!entry || !image?.complete || !image.naturalWidth) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    entry.x * WEAPON_ATLAS_CELL,
    entry.y * WEAPON_ATLAS_CELL,
    WEAPON_ATLAS_CELL,
    WEAPON_ATLAS_CELL,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  ctx.restore();
  return true;
}

function ensureAtlasImage() {
  if (atlasImage) return atlasImage;
  atlasImage = new Image();
  atlasImage.src = WEAPON_ATLAS_URL;
  return atlasImage;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
