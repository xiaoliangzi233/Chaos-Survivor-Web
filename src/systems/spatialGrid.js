export class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.worldSize = worldSize;
    this.cellSize = cellSize;
    this.coordinateOffset = Math.ceil(worldSize / 2 / cellSize) + 1;
    this.columns = this.coordinateOffset * 2 + 1;
    this.rows = this.columns;
    this.buckets = Array.from({ length: this.columns * this.rows }, () => []);
    this.activeIndices = [];
    this.activeFlags = new Uint8Array(this.buckets.length);
    this.size = 0;
  }

  clear() {
    for (const index of this.activeIndices) {
      this.buckets[index].length = 0;
      this.activeFlags[index] = 0;
    }
    this.activeIndices.length = 0;
    this.size = 0;
  }

  insert(value, x = value.x, y = value.y) {
    const index = this.indexForWorld(x, y);
    if (!this.activeFlags[index]) {
      this.activeFlags[index] = 1;
      this.activeIndices.push(index);
      this.size++;
    }
    this.buckets[index].push(value);
  }

  forEachBucket(minX, minY, maxX, maxY, visitor) {
    const startX = this.columnForWorld(minX);
    const endX = this.columnForWorld(maxX);
    const startY = this.rowForWorld(minY);
    const endY = this.rowForWorld(maxY);
    for (let row = startY; row <= endY; row++) {
      const offset = row * this.columns;
      for (let column = startX; column <= endX; column++) {
        const bucket = this.buckets[offset + column];
        if (bucket.length) visitor(bucket);
      }
    }
  }

  forEachNearby(x, y, radius, visitor) {
    this.forEachBucket(x - radius, y - radius, x + radius, y + radius, (bucket) => {
      for (const value of bucket) visitor(value);
    });
  }

  indexForWorld(x, y) {
    return this.rowForWorld(y) * this.columns + this.columnForWorld(x);
  }

  columnForWorld(x) {
    return clampIndex(Math.floor(x / this.cellSize) + this.coordinateOffset, this.columns);
  }

  rowForWorld(y) {
    return clampIndex(Math.floor(y / this.cellSize) + this.coordinateOffset, this.rows);
  }
}

function clampIndex(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}
