export const ITEM_ATLAS_URL = new URL("../../assets/visual/item-atlas-v1.png", import.meta.url).href;
export const ITEM_ATLAS_CELL = 32;

export const ITEM_ATLAS_COORDS = Object.freeze({
  heart_container: [0, 0],
  healing_potion: [1, 0],
  shackles: [2, 0],
  dodge_cloak: [3, 0],
  bait: [4, 0],
  magnet: [5, 0],
  speed_boots: [6, 0],
  rapid_cord: [0, 1],
  fang: [1, 1],
  split_shot: [2, 1],
  lucky_clover: [3, 1],
  gloves: [4, 1],
  knife: [5, 1],
  healing_aura: [6, 1],
  tardigrade: [0, 2],
  heavy_armor: [1, 2],
  turret: [2, 2],
  thief_mark: [3, 2],
  star_cloak: [4, 2],
  landmine: [5, 2],
  airburst: [6, 2],
});

let atlasImage = null;

export function itemAtlasEntry(itemOrId) {
  const id = itemIdFrom(itemOrId);
  const coord = ITEM_ATLAS_COORDS[id];
  return coord ? { id, x: coord[0], y: coord[1], size: ITEM_ATLAS_CELL, atlas: ITEM_ATLAS_URL } : null;
}

export function itemIconHtml(itemOrId, fallback = "?", className = "") {
  const entry = itemAtlasEntry(itemOrId);
  const label = typeof itemOrId === "object" ? itemOrId?.name || itemOrId?.id || "道具" : String(itemOrId || "道具");
  if (!entry) return `<i class="${className}">${escapeHtml(fallback || "?")}</i>`;
  const classes = ["item-sprite-icon", className].filter(Boolean).join(" ");
  return `<i class="${classes}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" style="--item-atlas-pos-x:${entry.x * 100 / 6}%;--item-atlas-pos-y:${entry.y * 100 / 2}%;"></i>`;
}

export function createItemIconElement(itemOrId, fallback = "?", className = "") {
  const entry = itemAtlasEntry(itemOrId);
  const node = document.createElement("i");
  const label = typeof itemOrId === "object" ? itemOrId?.name || itemOrId?.id || "道具" : String(itemOrId || "道具");
  node.className = [entry ? "item-sprite-icon" : "", className].filter(Boolean).join(" ");
  node.title = label;
  node.setAttribute("aria-label", label);
  if (entry) {
    node.style.setProperty("--item-atlas-pos-x", `${entry.x * 100 / 6}%`);
    node.style.setProperty("--item-atlas-pos-y", `${entry.y * 100 / 2}%`);
  } else {
    node.textContent = fallback || "?";
  }
  return node;
}

export function drawItemAtlasIcon(ctx, itemOrId, x, y, size = 96) {
  const entry = itemAtlasEntry(itemOrId);
  const image = ensureAtlasImage();
  if (!entry || !image?.complete || !image.naturalWidth) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    entry.x * ITEM_ATLAS_CELL,
    entry.y * ITEM_ATLAS_CELL,
    ITEM_ATLAS_CELL,
    ITEM_ATLAS_CELL,
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
  atlasImage.src = ITEM_ATLAS_URL;
  return atlasImage;
}

function itemIdFrom(value) {
  if (typeof value === "string") return normalizeItemId(value);
  return normalizeItemId(value?.itemId || value?.id || "");
}

function normalizeItemId(value) {
  return String(value || "").replace(/_(common|uncommon|rare|epic|legendary)$/, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
