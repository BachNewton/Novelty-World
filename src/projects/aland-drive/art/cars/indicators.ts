import { SoupBuilder, SURFACES, type Point, type Soup } from "./mesh";

/*
 * A world car's four indicator lamps, front and rear at each corner, placed
 * from where its own lamps are: in front, beside the outer end of the
 * headlamps at their height, or under it where a nose has no room there;
 * behind, under the outer end of the tail
 * lamps. Each sits on the body as it's shaped there, a little proud of it, so
 * its sides catch the eye from above and from the side as well as head on.
 * The stand-in carries each as a flat lens on its end, in the same place.
 */

/** How far a lamp stands proud of the body at its least. */
const PROUD_M = 0.04;
/** How far its back sinks into the body, so no gap shows round it. */
const SUNK_M = 0.01;
const BESIDE = { wide: 0.15, tallest: 0.09, gapM: 0.02 };
const UNDER = { wide: 0.17, tall: 0.07, gapM: 0.012, inM: 0.09 };
/** A lamp on the stand-in stands this far off its end. */
const DISTANT_LIFT_M = 0.012;

/** Which lamp a face of a world car is, in its `carOption`: the car's own left (-x, its nose being -z) or right. */
export const INDICATOR_OPTION = { left: 3, right: 4 } as const;

export interface LampSpot {
  /** The right lamp's inner and outer edges: the left lamp is its mirror. */
  x: readonly [inner: number, outer: number];
  y: readonly [low: number, high: number];
  /** How far from the middle the body's surface is behind the lamp, nearest and furthest. */
  z: readonly [near: number, far: number];
  end: "front" | "rear";
}

function lensBox(body: Soup, surface: "lensHead" | "lensTail", end: LampSpot["end"]) {
  const id = SURFACES.indexOf(surface);
  const box = { x: 0, low: Infinity, high: -Infinity };
  for (let vertex = 0; vertex < body.surfaces.length; vertex++) {
    const [x, y, z] = body.positions.subarray(vertex * 3, vertex * 3 + 3);
    if (body.surfaces[vertex] !== id || (end === "front") !== z < 0) continue;
    box.x = Math.max(box.x, x);
    box.low = Math.min(box.low, y);
    box.high = Math.max(box.high, y);
  }
  if (box.x === 0) throw new Error(`a world car has no ${surface} at its ${end} to set its indicators by`);
  return box;
}

/** How far a lamp may move in from where it's wanted to sit on the body, where a nose narrows or rounds. */
const FIT_STEP_M = 0.01;
const FIT_MOST_M = 0.12;
/** The most a lamp may wrap back round a corner: deeper, and it moves in. */
const WRAP_MOST_M = 0.2;

/** The body's distance from the middle behind each part of a lamp, or null where some part has none close enough. */
function surfaceBehind(shell: SoupBuilder, x: readonly [number, number], y: readonly [number, number], end: LampSpot["end"]): [number, number] | null {
  const out = end === "front" ? -1 : 1;
  const hits: number[] = [];
  for (const across of [x[0], (x[0] + x[1]) / 2, x[1]]) {
    for (const up of [y[0], (y[0] + y[1]) / 2, y[1]]) {
      const hit = shell.raycast([across, up, out * 10], [0, 0, -out]);
      if (!hit) return null;
      hits.push(hit[2] * out);
    }
  }
  const [near, far] = [Math.min(...hits), Math.max(...hits)];
  return far - near > WRAP_MOST_M ? null : [near, far];
}

function fitted(shell: SoupBuilder, end: LampSpot["end"], x: readonly [number, number], y: readonly [number, number]): LampSpot | null {
  for (let shift = 0; shift <= FIT_MOST_M; shift += FIT_STEP_M) {
    const moved = [x[0] - shift, x[1] - shift] as const;
    const z = surfaceBehind(shell, moved, y, end);
    if (z) return { end, x: moved, y, z };
  }
  return null;
}

/** A lamp under the outer end of a lens, the way a rear one always goes and a front one does where the nose has no room beside its headlamps. */
function under(shell: SoupBuilder, end: LampSpot["end"], lens: { x: number; low: number }) {
  const low = lens.low - UNDER.gapM - UNDER.tall;
  const spot = fitted(shell, end, [lens.x - UNDER.inM - UNDER.wide, lens.x - UNDER.inM], [low, low + UNDER.tall]);
  if (!spot) throw new Error(`a world car's ${end} indicator finds no body to sit on`);
  return spot;
}

/** Where a car's indicators go, from its world body. */
export function lampSpots(body: Soup): LampSpot[] {
  const shell = builderOf(body);
  const head = lensBox(body, "lensHead", "front");
  const tail = lensBox(body, "lensTail", "rear");
  const frontInner = head.x + BESIDE.gapM;
  const frontMiddle = (head.low + head.high) / 2;
  const frontHalf = Math.min(head.high - head.low, BESIDE.tallest) / 2;
  const beside = fitted(shell, "front", [frontInner, frontInner + BESIDE.wide], [frontMiddle - frontHalf, frontMiddle + frontHalf]);
  return [beside ?? under(shell, "front", head), under(shell, "rear", tail)];
}

function builderOf(soup: Soup) {
  const builder = new SoupBuilder();
  const corner = (vertex: number): Point => [soup.positions[vertex * 3], soup.positions[vertex * 3 + 1], soup.positions[vertex * 3 + 2]];
  for (let face = 0; face < soup.triangles; face++) builder.triangle(corner(face * 3), corner(face * 3 + 1), corner(face * 3 + 2), SURFACES[soup.surfaces[face * 3]]);
  return builder;
}

/** A quad turned to face `outward`. */
function facing(builder: SoupBuilder, corners: [Point, Point, Point, Point], outward: Point) {
  const [a, b, c] = corners;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const ordered = normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] > 0 ? corners : ([...corners].reverse() as typeof corners);
  builder.quad(...ordered, "lensIndicator");
}

/** A box from `low` to `high`, its face towards the car's middle left out. */
function lamp(builder: SoupBuilder, low: Point, high: Point, out: 1 | -1) {
  const [x0, y0, z0] = low;
  const [x1, y1, z1] = high;
  const outer = out < 0 ? z0 : z1;
  facing(builder, [[x0, y0, outer], [x1, y0, outer], [x1, y1, outer], [x0, y1, outer]], [0, 0, out]);
  facing(builder, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  facing(builder, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  facing(builder, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
  facing(builder, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]);
}

const sides = [1, -1] as const;

/** The four lamps of a world car, boxes on its body. */
export function worldLamps(spots: readonly LampSpot[]): Soup {
  const builder = new SoupBuilder();
  for (const spot of spots) {
    const out = spot.end === "front" ? -1 : 1;
    const zs = [(spot.z[0] - SUNK_M) * out, (spot.z[1] + PROUD_M) * out].sort((a, b) => a - b);
    for (const side of sides) {
      const xs = [side * spot.x[0], side * spot.x[1]].sort((a, b) => a - b);
      lamp(builder, [xs[0], spot.y[0], zs[0]], [xs[1], spot.y[1], zs[1]], out);
    }
  }
  return builder.finish(30);
}

/** The four lamps of a stand-in, flat lenses on its ends, kept inside its outline. */
export function distantLamps(stand: Soup, spots: readonly LampSpot[]): Soup {
  const builder = new SoupBuilder();
  for (const spot of spots) {
    const out = spot.end === "front" ? -1 : 1;
    let endZ = 0;
    for (let at = 2; at < stand.positions.length; at += 3) endZ = Math.max(endZ, stand.positions[at] * out);
    let endHalf = 0;
    for (let at = 0; at < stand.positions.length; at += 3) if (Math.abs(stand.positions[at + 2] * out - endZ) < 1e-4) endHalf = Math.max(endHalf, stand.positions[at]);
    const shift = Math.min(0, endHalf - 0.02 - spot.x[1]);
    const z = (endZ + DISTANT_LIFT_M) * out;
    for (const side of sides) {
      const [a, b] = [side * (spot.x[0] + shift), side * (spot.x[1] + shift)];
      facing(builder, [[a, spot.y[0], z], [b, spot.y[0], z], [b, spot.y[1], z], [a, spot.y[1], z]], [0, 0, out]);
    }
  }
  return builder.finish(1);
}

/** Each vertex's `carOption`: which lamp it is, by the side it's on. */
export const lampOptions = (lamps: Soup) => Float32Array.from({ length: lamps.positions.length / 3 }, (_, vertex) => (lamps.positions[vertex * 3] < 0 ? INDICATOR_OPTION.left : INDICATOR_OPTION.right));
