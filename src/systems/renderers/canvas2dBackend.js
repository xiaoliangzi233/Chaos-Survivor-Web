import { render, resizeCanvas, viewport } from "../renderer.js";
import { framePerformance } from "../performanceMonitor.js";

export class Canvas2DBackend {
  constructor(fallbackReason = "") {
    this.name = "canvas";
    this.fallbackReason = fallbackReason;
    this.canvas = null;
    this.ctx = null;
  }

  async init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx) throw new Error("Canvas 2D context is unavailable");
    this.resize();
  }

  resize() {
    resizeCanvas(this.canvas, this.ctx);
  }

  async prepareRun() {}

  renderFrame() {
    framePerformance.begin("render");
    const frame = render(this.ctx);
    framePerformance.end("render");
    return frame;
  }

  releaseRun() {}

  destroy() {
    this.canvas = null;
    this.ctx = null;
  }

  getStats() {
    return {
      backend: this.name,
      fallbackReason: this.fallbackReason,
      viewport: { ...viewport },
      ...framePerformance.getStats(),
    };
  }
}
