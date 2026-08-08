const DETAIL_ATLAS_URL = new URL("../../assets/visual/environment-detail-atlas.svg", import.meta.url).href;

const DECAL_CELLS = Object.freeze({
  hub: 0,
  nav: 1,
  archive: 2,
  bio: 3,
  armory: 4,
  power: 5,
  habitat: 6,
  system: 7,
});

let atlas = null;
let atlasPromise = null;

export function preloadEnvironmentAssets() {
  if (atlasPromise) return atlasPromise;
  if (typeof Image === "undefined") return Promise.resolve(false);
  atlasPromise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      atlas = image;
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = DETAIL_ATLAS_URL;
  });
  return atlasPromise;
}

export function drawEnvironmentAtlasDecal(ctx, kind, x, y, size = 24, alpha = 0.55) {
  if (!atlas?.complete) return false;
  const cell = DECAL_CELLS[kind] ?? DECAL_CELLS.system;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(atlas, cell * 64, 0, 64, 64, x - size / 2, y - size / 2, size, size);
  ctx.restore();
  return true;
}

export function environmentAssetsReady() {
  return Boolean(atlas?.complete);
}
