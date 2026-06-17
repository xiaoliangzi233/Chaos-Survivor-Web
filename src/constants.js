export const TAU = Math.PI * 2;
export const WORLD_SIZE = 4800;
export const CAMERA_ZOOM = 1.28;
export const TOTAL_WAVES = 20;
export const FIRST_WAVE_SECONDS = 30;
export const MAX_WAVE_SECONDS = 60;
export const ENEMY_LIMIT = 420;
export const PROJECTILE_LIMIT = 360;
export const GEM_LIMIT = 360;
export const PARTICLE_LIMIT = 520;
export const CELL_SIZE = 128;
export const SAVE_KEY = "pixel-survivor-best";

export function waveDurationFor(wave) {
  return Math.min(MAX_WAVE_SECONDS, FIRST_WAVE_SECONDS + (wave - 1) * 2);
}

export const GAME_MODE_SWARM = "swarm";
export const GAME_MODE_CHALLENGE = "challenge";

