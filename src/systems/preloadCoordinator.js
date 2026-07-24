import { preloadMusicAssets } from "../audio.js";
import { prepareMapCache, releaseMapCache } from "./map.js";
import { framePerformance } from "./performanceMonitor.js";

function report(onProgress, value, label) {
  onProgress?.(Math.max(0, Math.min(1, value)), label);
}

export class PreloadCoordinator {
  constructor(renderBackend) {
    this.renderBackend = renderBackend;
    this.coreReady = false;
    this.preparedMap = null;
  }

  async initCore(onProgress) {
    if (this.coreReady) {
      report(onProgress, 1, "核心资源已就绪");
      return;
    }
    report(onProgress, 0.1, "初始化渲染资源");
    await Promise.resolve();
    report(onProgress, 0.55, "准备公共纹理");
    preloadMusicAssets().catch((error) => console.warn("[preload] background music preload failed", error));
    this.coreReady = true;
    report(onProgress, 1, "核心资源已就绪");
  }

  async prepareRun(context, onProgress) {
    const map = context?.map;
    if (!map) throw new Error("prepareRun requires a generated map");
    framePerformance.begin("prepareRun");
    report(onProgress, 0.02, "生成地图缓存");
    await nextTask();
    prepareMapCache(map);
    this.preparedMap = map;
    report(onProgress, 0.48, "准备本局视觉资源");
    await this.renderBackend.prepareRun(context, (value, label) => {
      report(onProgress, 0.48 + value * 0.47, label);
    });
    report(onProgress, 0.97, "预热渲染管线");
    await nextFrame();
    framePerformance.end("prepareRun");
    report(onProgress, 1, "本局资源准备完成");
  }

  async prepareWave(_wave) {
    await Promise.resolve();
  }

  releaseRun() {
    this.renderBackend.releaseRun();
    releaseMapCache(this.preparedMap);
    this.preparedMap = null;
  }
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
