/*
 * A square field of values over the valley, one per vertex of a regular grid
 * centred on the origin: the heights, and every other per-point quantity the
 * world is built from. World x runs across the grid's columns and world z
 * down its rows; y is up.
 */

export interface Grid {
  /** Vertices along each side. */
  readonly side: number;
  /** Metres between neighbouring vertices. */
  readonly spacing: number;
  /** The world coordinate of the first vertex on each axis. */
  readonly origin: number;
  readonly values: Float32Array;
}

export function makeGrid(side: number, spacing: number, fill = 0): Grid {
  return { side, spacing, origin: (-(side - 1) * spacing) / 2, values: new Float32Array(side * side).fill(fill) };
}

export function cloneGrid(grid: Grid): Grid {
  return { ...grid, values: new Float32Array(grid.values) };
}

export function index(grid: Grid, column: number, row: number): number {
  return row * grid.side + column;
}

export function worldX(grid: Grid, column: number): number {
  return grid.origin + column * grid.spacing;
}

/** The world x and z of the vertex at an index. */
export function vertexPosition(grid: Grid, i: number): { x: number; z: number } {
  return { x: worldX(grid, i % grid.side), z: worldX(grid, Math.floor(i / grid.side)) };
}

/** The nearest vertex to a world point, clamped to the grid. */
export function nearestVertex(grid: Grid, x: number, z: number): number {
  const column = Math.min(grid.side - 1, Math.max(0, Math.round((x - grid.origin) / grid.spacing)));
  const row = Math.min(grid.side - 1, Math.max(0, Math.round((z - grid.origin) / grid.spacing)));
  return index(grid, column, row);
}

/** Half the grid's width: the valley reaches from -extent to +extent on both axes. */
export function extent(grid: Grid): number {
  return -grid.origin;
}

/** The value at a world point, interpolated between the four vertices round it
 *  (clamped at the edges). */
export function sample(grid: Grid, x: number, z: number): number {
  const last = grid.side - 1;
  const fx = Math.min(last, Math.max(0, (x - grid.origin) / grid.spacing));
  const fz = Math.min(last, Math.max(0, (z - grid.origin) / grid.spacing));
  const c = Math.min(last - 1, Math.floor(fx));
  const r = Math.min(last - 1, Math.floor(fz));
  const tx = fx - c;
  const tz = fz - r;
  const v = grid.values;
  const i = r * grid.side + c;
  const top = v[i] + (v[i + 1] - v[i]) * tx;
  const bottom = v[i + grid.side] + (v[i + grid.side + 1] - v[i + grid.side]) * tx;
  return top + (bottom - top) * tz;
}

/** The steepness at a world point: rise over run, from the sampled gradient. */
export function slopeAt(grid: Grid, x: number, z: number): number {
  const h = grid.spacing;
  const dx = (sample(grid, x + h, z) - sample(grid, x - h, z)) / (2 * h);
  const dz = (sample(grid, x, z + h) - sample(grid, x, z - h)) / (2 * h);
  return Math.hypot(dx, dz);
}

/** Calls `visit` for every vertex within `radius` of a world point, with its index and distance. */
export function forEachNear(grid: Grid, x: number, z: number, radius: number, visit: (i: number, distance: number) => void): void {
  const c0 = Math.max(0, Math.floor((x - radius - grid.origin) / grid.spacing));
  const c1 = Math.min(grid.side - 1, Math.ceil((x + radius - grid.origin) / grid.spacing));
  const r0 = Math.max(0, Math.floor((z - radius - grid.origin) / grid.spacing));
  const r1 = Math.min(grid.side - 1, Math.ceil((z + radius - grid.origin) / grid.spacing));
  for (let r = r0; r <= r1; r++) {
    const dz = worldX(grid, r) - z;
    for (let c = c0; c <= c1; c++) {
      const distance = Math.hypot(worldX(grid, c) - x, dz);
      if (distance <= radius) visit(r * grid.side + c, distance);
    }
  }
}
