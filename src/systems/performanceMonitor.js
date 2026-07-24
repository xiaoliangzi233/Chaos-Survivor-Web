const DEFAULT_SAMPLE_COUNT = 360;

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export class PerformanceMonitor {
  constructor(sampleCount = DEFAULT_SAMPLE_COUNT) {
    this.sampleCount = Math.max(30, sampleCount);
    this.samples = new Map();
    this.openStages = new Map();
    this.counters = {};
  }

  begin(name, now = performance.now()) {
    this.openStages.set(name, now);
  }

  end(name, now = performance.now()) {
    const start = this.openStages.get(name);
    if (start == null) return 0;
    this.openStages.delete(name);
    const elapsed = Math.max(0, now - start);
    this.record(name, elapsed);
    return elapsed;
  }

  record(name, milliseconds) {
    let values = this.samples.get(name);
    if (!values) {
      values = [];
      this.samples.set(name, values);
    }
    values.push(milliseconds);
    if (values.length > this.sampleCount) values.splice(0, values.length - this.sampleCount);
  }

  setCounter(name, value) {
    this.counters[name] = value;
  }

  reset() {
    this.samples.clear();
    this.openStages.clear();
    this.counters = {};
  }

  getStats() {
    const timings = {};
    for (const [name, values] of this.samples) {
      const sorted = [...values].sort((a, b) => a - b);
      timings[name] = {
        count: sorted.length,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted[sorted.length - 1] || 0,
      };
    }
    return { timings, counters: { ...this.counters } };
  }
}

export const framePerformance = new PerformanceMonitor();
