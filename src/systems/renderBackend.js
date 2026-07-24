import { Canvas2DBackend } from "./renderers/canvas2dBackend.js";

export const RENDERER_PREFERENCES = new Set(["auto", "pixi", "canvas"]);

/**
 * @typedef {object} RenderBackend
 * @property {(canvas: HTMLCanvasElement) => Promise<void>} init
 * @property {() => void} resize
 * @property {(context?: object, onProgress?: Function) => Promise<void>} prepareRun
 * @property {() => object|null} renderFrame
 * @property {() => void} releaseRun
 * @property {() => void} destroy
 * @property {() => object} getStats
 */

export function normalizeRendererPreference(value) {
  return RENDERER_PREFERENCES.has(value) ? value : "auto";
}

export async function createRenderBackend(canvas, preference = "auto") {
  const selected = normalizeRendererPreference(preference);
  if (selected !== "canvas") {
    try {
      const { PixiBackend } = await import("./renderers/pixiBackend.js");
      const backend = new PixiBackend();
      await backend.init(canvas);
      return backend;
    } catch (error) {
      console.warn("[renderer] PixiJS initialization failed; using Canvas 2D.", error);
      return createCanvasBackend(canvas, error instanceof Error ? error.message : String(error));
    }
  }
  return createCanvasBackend(canvas);
}

async function createCanvasBackend(canvas, fallbackReason = "") {
  const backend = new Canvas2DBackend(fallbackReason);
  await backend.init(canvas);
  return backend;
}
