import type { PlacementFloor } from "./placement";
import { BASE_RADIUS, type RoomPoint } from "./room";

/*
 * Walking round figures that stand still. A walk across a room keeps to its
 * lanes and crossing (`waypoints`); where that would take the walker's base
 * through a standing figure's, the stretch is planned again on the room's
 * free floor (the floor plan the placement solver uses) with the standing
 * bases blocked out: the shortest way on the grid, then pulled straight
 * wherever a straight line is clear. Where no way round avoids a base (a
 * crowded room), the walker squeezes past the fewest it can. Pure and
 * deterministic.
 */

/** A figure standing still: where its base is, and how far it reaches. */
export interface StandingBase {
  x: number;
  z: number;
  radius: number;
}

/** How much a step across a cell a walker's base would share with a standing one costs, against a clear step. */
const SQUEEZE = 40;
/** How near a walker's base may come to a standing one before it counts as passing through it. */
const TOUCH = 0.01;

const DIAGONAL = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL],
];

/** How far a point is from the segment from `a` to `b`, on the floor. */
function segmentDistance(x: number, z: number, a: RoomPoint, b: RoomPoint): number {
  const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / length));
  return Math.hypot(x - (a[0] + t * dx), z - (a[2] + t * dz));
}

/** Whether a walker's base going from `a` to `b` passes through a standing base. */
export function passesThrough(a: RoomPoint, b: RoomPoint, bases: readonly StandingBase[], walker = BASE_RADIUS): boolean {
  return bases.some((base) => segmentDistance(base.x, base.z, a, b) < base.radius + walker - TOUCH);
}

/** A minimal binary heap of cells by cost, ties broken by cell, so the search is deterministic. */
function heap() {
  const items: [number, number][] = [];
  const less = (i: number, j: number) => items[i][0] < items[j][0] || (items[i][0] === items[j][0] && items[i][1] < items[j][1]);
  const swap = (i: number, j: number) => ([items[i], items[j]] = [items[j], items[i]]);
  return {
    get size() {
      return items.length;
    },
    push(cost: number, cell: number) {
      items.push([cost, cell]);
      for (let i = items.length - 1; i > 0 && less(i, (i - 1) >> 1); i = (i - 1) >> 1) swap(i, (i - 1) >> 1);
    },
    pop(): number {
      const top = items[0][1];
      const last = items.pop() as [number, number];
      if (items.length > 0) {
        items[0] = last;
        for (let i = 0; ; ) {
          const [l, r] = [2 * i + 1, 2 * i + 2];
          let least = i;
          if (l < items.length && less(l, least)) least = l;
          if (r < items.length && less(r, least)) least = r;
          if (least === i) break;
          swap(i, least);
          i = least;
        }
      }
      return top;
    },
  };
}

/** The way across the floor's grid from `a` to `b` that shares least floor with the standing bases and is
 *  shortest among those, pulled straight; null where the walker's base can't get from one to the other at all. */
function plan(floor: PlacementFloor, a: RoomPoint, b: RoomPoint, bases: readonly StandingBase[], walker: number): RoomPoint[] | null {
  const { size } = floor;
  const open = (cell: number) => floor.clearance[cell] >= walker - 1e-9;
  const near = (cell: number) => {
    const [x, z] = floor.centre(cell);
    return bases.some((base) => Math.hypot(x - base.x, z - base.z) < base.radius + walker - TOUCH);
  };
  const [start, goal] = [floor.cellAt(a[0], a[2]), floor.cellAt(b[0], b[2])];
  const [gi, gj] = [goal % size, Math.floor(goal / size)];
  const cost = new Float64Array(size * size).fill(Infinity);
  const from = new Int32Array(size * size).fill(-1);
  const queue = heap();
  const guess = (cell: number) => {
    const [di, dj] = [Math.abs((cell % size) - gi), Math.abs(Math.floor(cell / size) - gj)];
    return Math.max(di, dj) + (DIAGONAL - 1) * Math.min(di, dj);
  };
  cost[start] = 0;
  queue.push(guess(start), start);
  while (queue.size > 0) {
    const cell = queue.pop();
    if (cell === goal) break;
    const [i, j] = [cell % size, Math.floor(cell / size)];
    for (const [di, dj, step] of NEIGHBOURS) {
      const [ni, nj] = [i + di, j + dj];
      if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
      const next = nj * size + ni;
      if (!open(next) && next !== goal) continue;
      const reached = cost[cell] + step * (near(next) ? SQUEEZE : 1);
      if (reached >= cost[next]) continue;
      cost[next] = reached;
      from[next] = cell;
      queue.push(reached + guess(next), next);
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const cells: number[] = [];
  for (let cell = goal; cell !== start; cell = from[cell]) cells.push(cell);
  cells.reverse();
  // Pulled straight: from each corner, on to the farthest cell a straight line reaches over clear floor.
  const clear = (p: RoomPoint, q: RoomPoint) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[2] - p[2]) / 0.025));
    for (let k = 0; k <= steps; k++) {
      const cell = floor.cellAt(p[0] + ((q[0] - p[0]) * k) / steps, p[2] + ((q[2] - p[2]) * k) / steps);
      if (!open(cell) && cell !== goal && cell !== start) return false;
    }
    return !passesThrough(p, q, bases, walker);
  };
  const points: RoomPoint[] = cells.slice(0, -1).map((cell) => {
    const [x, z] = floor.centre(cell);
    return [x, 0, z];
  });
  const way: RoomPoint[] = [];
  let at: RoomPoint = a;
  for (let k = 0; k < points.length; ) {
    let farthest = k;
    if (clear(at, b)) break;
    for (let m = points.length - 1; m > k; m--) {
      if (clear(at, points[m])) {
        farthest = m;
        break;
      }
    }
    at = points[farthest];
    way.push(at);
    k = farthest + 1;
  }
  return way;
}

/**
 * A walk's points across one room, in its own frame, kept clear of the
 * standing bases: each stretch between fixed legs (`fixed`, the crossing of
 * a barrier room, which the walk always follows) that would pass through a
 * base is planned round them; the rest stay as they are. Where no way avoids
 * a base, the walk squeezes past the fewest; where the walker can't get
 * through at all, the stretch stays as it was.
 */
export function aroundBases(
  floor: PlacementFloor,
  path: readonly RoomPoint[],
  bases: readonly StandingBase[],
  fixed: (a: RoomPoint, b: RoomPoint) => boolean = () => false,
  walker = BASE_RADIUS,
): RoomPoint[] {
  if (bases.length === 0 || path.length < 2) return [...path];
  const result: RoomPoint[] = [path[0]];
  let stretch: RoomPoint[] = [path[0]];
  const close = () => {
    const blocked = stretch.slice(1).some((point, i) => passesThrough(stretch[i], point, bases, walker));
    const end = stretch[stretch.length - 1];
    const planned = blocked ? plan(floor, stretch[0], end, bases, walker) : null;
    result.push(...(planned ?? stretch.slice(1, -1)), end);
  };
  for (let i = 1; i < path.length; i++) {
    if (fixed(path[i - 1], path[i])) {
      if (stretch.length > 1) close();
      result.push(path[i]);
      stretch = [path[i]];
      continue;
    }
    stretch.push(path[i]);
  }
  if (stretch.length > 1) close();
  return result;
}
