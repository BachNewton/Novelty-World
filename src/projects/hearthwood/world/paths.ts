import { type Grid, index, worldX } from "./grid";

/*
 * Routes across the grid: the cheapest way from one vertex to a goal, over
 * the eight neighbours of each vertex, and the polylines the routes become.
 */

export interface Point2 {
  x: number;
  z: number;
}

/** The cost of stepping between two neighbouring vertices, Infinity where it can't. */
export type StepCost = (from: number, to: number, length: number) => number;

class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.items.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * The cheapest route from `start` to the first vertex `isGoal` accepts, as
 * vertex indices from start to goal, or null when none can be reached.
 * `estimate` is a lower bound on the cost left from a vertex (zero is always safe).
 */
export function cheapestRoute(grid: Grid, start: number, isGoal: (i: number) => boolean, step: StepCost, estimate: (i: number) => number = () => 0): number[] | null {
  const count = grid.side * grid.side;
  const cost = new Float64Array(count).fill(Infinity);
  const from = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  const open = new MinHeap();
  cost[start] = 0;
  open.push(start, estimate(start));
  while (open.size > 0) {
    const current = open.pop();
    if (done[current]) continue;
    done[current] = 1;
    if (isGoal(current)) {
      const route = [current];
      while (from[route[route.length - 1]] !== -1) route.push(from[route[route.length - 1]]);
      return route.reverse();
    }
    const column = current % grid.side;
    const row = Math.floor(current / grid.side);
    for (const [dc, dr] of NEIGHBOURS) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.side || r >= grid.side) continue;
      const next = index(grid, c, r);
      if (done[next]) continue;
      const length = (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1) * grid.spacing;
      const total = cost[current] + step(current, next, length);
      if (total < cost[next]) {
        cost[next] = total;
        from[next] = current;
        open.push(next, total + estimate(next));
      }
    }
  }
  return null;
}

export function routePoints(grid: Grid, route: readonly number[]): Point2[] {
  return route.map((i) => ({ x: worldX(grid, i % grid.side), z: worldX(grid, Math.floor(i / grid.side)) }));
}

/** Rounds a polyline's corners off (Chaikin's corner cutting), keeping its ends. */
export function smoothLine(points: readonly Point2[], passes: number): Point2[] {
  let line = [...points];
  for (let pass = 0; pass < passes; pass++) {
    if (line.length < 3) return line;
    const next: Point2[] = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  return line;
}

/** The same line with its points about `step` metres apart. */
export function resampleLine(points: readonly Point2[], step: number): Point2[] {
  if (points.length < 2) return [...points];
  const out: Point2[] = [points[0]];
  let carried = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    let at = step - carried;
    while (at <= length) {
      const t = at / length;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      at += step;
    }
    carried = length - (at - step);
  }
  const end = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(end.x - tail.x, end.z - tail.z) > step * 0.25) out.push(end);
  return out;
}

export function lineLength(points: readonly Point2[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  return total;
}

/** The distance from a point to the nearest point of a polyline. */
export function distanceToLine(points: readonly Point2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}
