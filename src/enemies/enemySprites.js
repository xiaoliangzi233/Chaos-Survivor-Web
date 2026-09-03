import { TAU } from "../constants.js";

export const ZOMBIE_WALK_ATLAS_URL = new URL("../../assets/enemies/zombie-walk-atlas-v1.png", import.meta.url).href;
export const ZOMBIE_WALK_CELL = 128;
export const ZOMBIE_WALK_FRAMES = 12;

let zombieWalkImage = null;
let zombieWalkPromise = null;

export function preloadEnemySpriteAtlases() {
  return Promise.all([loadZombieWalkAtlas()]).then(() => undefined);
}

export function drawZombieMoveSprite(ctx, enemy) {
  const image = ensureZombieWalkImage();
  if (!image?.complete || !image.naturalWidth) return false;
  const progress = ((enemy.anim || 0) % TAU + TAU) % TAU / TAU;
  const frame = Math.floor(progress * ZOMBIE_WALK_FRAMES) % ZOMBIE_WALK_FRAMES;
  const sx = frame % 4 * ZOMBIE_WALK_CELL;
  const sy = Math.floor(frame / 4) * ZOMBIE_WALK_CELL;
  const size = Math.max(56, enemy.r * 5.25);

  ctx.save();
  ctx.scale(enemy.flip || 1, 1);
  if (enemy.flash > 0 || enemy.hitTimer > 0) {
    ctx.scale(1.04, 0.98);
    ctx.globalAlpha *= 0.78;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    sx,
    sy,
    ZOMBIE_WALK_CELL,
    ZOMBIE_WALK_CELL,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
  return true;
}

function loadZombieWalkAtlas() {
  const image = ensureZombieWalkImage();
  if (!image || image.complete && image.naturalWidth) return Promise.resolve(image);
  if (zombieWalkPromise) return zombieWalkPromise;
  zombieWalkPromise = new Promise((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
  });
  return zombieWalkPromise;
}

function ensureZombieWalkImage() {
  if (typeof Image === "undefined") return null;
  if (zombieWalkImage) return zombieWalkImage;
  zombieWalkImage = new Image();
  zombieWalkImage.src = ZOMBIE_WALK_ATLAS_URL;
  return zombieWalkImage;
}
