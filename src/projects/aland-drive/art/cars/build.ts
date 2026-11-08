import { CARS, DEFAULT_CAR, type CarId } from "../../sim/cars";
import { sagOf, type CarTuning } from "../../sim/tuning";
import { buildBody, ROWS, type BodySpec, type BodyDetail } from "./body";
import { joined, pick, SoupBuilder, SURFACES, type Point, type Soup, type Surface } from "./mesh";
import { buildCaliper, buildWheel, type WheelSpec } from "./wheel";
import type { CarPaint } from "./paints";

/*
 * A car's parts at a detail: pure numbers, so triangle counts and shapes can be
 * tested without a renderer. `model.ts` turns them into something to draw.
 */

export type CarDetail = "hero" | "far";

/** How a body hangs on its wheels: where a wheel hangs with no weight on it, how far the springs settle, and the centre of mass, all from the body's origin. */
export interface Ride {
  droopM: number;
  sagM: number;
  massUpM: number;
}

export const rideOf = (tuning: CarTuning): Ride => ({ droopM: tuning.suspension.droopM, sagM: sagOf(tuning), massUpM: tuning.car.massUpM });

/** A world car hangs as the game's own car does. */
export const WORLD_RIDE = rideOf(CARS[DEFAULT_CAR]);

export interface CarSpec {
  /** A car a player can drive: its wheels and ride are its simulation's. */
  id?: CarId;
  name: string;
  /** A paint token, without the `--color-aland-drive-` prefix: a world car's paint, and a drivable car's default. */
  paint: string;
  /** A drivable car's paints, the player's choice, the first its default (`paints.ts`). */
  paints?: readonly CarPaint[];
  body: BodySpec;
  wheel: WheelSpec;
  /** Its paint is its livery, so a seeded world car keeps it and stays plain. */
  livery?: boolean;
  /** Half the width and length of the car's footprint on the road. */
  shadowHalf: readonly [wide: number, long: number];
  ride: Ride;
}

export interface CarParts {
  body: Soup;
  /** A hero's see-through glass, drawn apart. A world car's is in its body. */
  glass: Soup | null;
  wheel: Soup;
  /** A hero's brake calipers, the right side's then the left's: they steer with the wheels but don't roll. */
  calipers: readonly [right: Soup, left: Soup] | null;
}

const { sill, sillTop, mid, shoulder, belt, windowBase, windowTop, rail, roofOuter, roofInner, centre } = ROWS;

const HERO: BodyDetail = {
  maxStepM: 0.075,
  archSteps: 20,
  rows: [sill, 0.5, sillTop, 1.04, 1.5, ROWS.lower, 2.5, mid, 3.5, shoulder, 4.5, belt, windowBase, windowTop, 7.93, rail, 8.5, roofOuter, 9.5, roofInner, 10.5, centre],
  seams: true,
  fine: true,
  creaseDeg: 42,
  cabin: true,
};

const FAR: BodyDetail = {
  maxStepM: 1.2,
  archSteps: 5,
  rows: [sill, sillTop, belt, windowBase, windowTop, rail, roofInner, centre],
  seams: false,
  fine: false,
  creaseDeg: 40,
  cabin: false,
};

/** Where a wheel's centre sits in the car at rest. */
export const axleY = ({ ride }: Pick<CarSpec, "ride">) => -ride.droopM + ride.sagM;

/** The road under a car at rest, in the car's own frame: heights in a spec are measured from here. */
export const groundY = (spec: Pick<CarSpec, "ride" | "wheel">) => axleY(spec) - spec.wheel.radiusM;

/** The parts a world car can have or not, which `fleet.ts` turns on per instance. */
const isOption = (surface: Surface) => surface === "rack" || surface === "plateBand";

/** How far out of its end a lens face must turn to count as a lamp there, as the cosine of its angle from straight out. */
const OUT_OF_END = 0.3;

/** The middle of a car's right headlamp and right tail lamp, in its own frame: the left ones are their mirrors. */
export interface LampCentres {
  head: Point;
  tail: Point;
}

/**
 * Where a body's lamps are, from its own lenses: the middle of the lens faces at each end on the right, each weighed
 * by its area, so the tall lamps, round lamps and bars of every shape land where they're drawn. Only faces turned out
 * of their end count, so a third brake lamp along the roof doesn't lift the tail lamps.
 */
export function lampCentres(body: Soup): LampCentres {
  const centre = (surface: Surface, out: 1 | -1): Point => {
    const id = SURFACES.indexOf(surface);
    const sum = [0, 0, 0];
    let total = 0;
    for (let face = 0; face < body.triangles; face++) {
      if (body.surfaces[face * 3] !== id) continue;
      const [a, b, c] = [0, 1, 2].map((corner) => body.positions.subarray((face * 3 + corner) * 3, (face * 3 + corner) * 3 + 3));
      const middle = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3);
      if (middle[0] <= 0 || middle[2] * out <= 0) continue;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const area = Math.hypot(...normal);
      if (normal[2] * out < OUT_OF_END * area) continue;
      total += area;
      for (const axis of [0, 1, 2]) sum[axis] += middle[axis] * area;
    }
    if (total === 0) throw new Error(`a car has no ${surface} at its ${out < 0 ? "front" : "rear"}`);
    return [sum[0] / total, sum[1] / total, sum[2] / total];
  };
  return { head: centre("lensHead", -1), tail: centre("lensTail", 1) };
}

/** The caliper for each side: the left's is the right's mirrored, so both sit towards the back of their discs. */
function calipersOf(wheel: WheelSpec): readonly [Soup, Soup] {
  const right = buildCaliper(wheel);
  const left: Soup = { positions: new Float32Array(right.positions), normals: new Float32Array(right.normals), surfaces: right.surfaces, triangles: right.triangles };
  for (let vertex = 0; vertex < right.triangles * 3; vertex++) {
    left.positions[vertex * 3] *= -1;
    left.normals[vertex * 3] *= -1;
  }
  // Mirroring turns every face inside out, so each triangle's corners are put back in order.
  for (let face = 0; face < right.triangles; face++) {
    for (const array of [left.positions, left.normals]) {
      const [b, c] = [face * 9 + 3, face * 9 + 6];
      const corner = array.slice(b, b + 3);
      array.copyWithin(b, c, c + 3);
      array.set(corner, c);
    }
  }
  return [right, left];
}

/** How wide a pane's dark ceramic border is, and how far inside the glass it stands, so the two never share a plane. */
const FRIT_M = 0.045;
const FRIT_INSET_M = 0.008;
const FRIT_WELD_PER_M = 2000;
const FRIT_SHORTEST_M = 0.02;

/**
 * The dark border round each pane of a hero's glass, as real glass has: a strip along every edge where the glass meets
 * something else, just inside it, so it shows through the glass's tint as a frame and hides where the pane is bonded.
 */
function fritOf(glass: Soup): Soup {
  const builder = new SoupBuilder();
  const point = (vertex: number): Point => [glass.positions[vertex * 3], glass.positions[vertex * 3 + 1], glass.positions[vertex * 3 + 2]];
  const key = ([x, y, z]: Point) => `${Math.round(x * FRIT_WELD_PER_M)},${Math.round(y * FRIT_WELD_PER_M)},${Math.round(z * FRIT_WELD_PER_M)}`;
  const edges = new Map<string, { a: Point; b: Point; third: Point; count: number }>();
  for (let face = 0; face < glass.triangles; face++) {
    const corners = [0, 1, 2].map((corner) => point(face * 3 + corner));
    for (let edge = 0; edge < 3; edge++) {
      const [a, b, third] = [corners[edge], corners[(edge + 1) % 3], corners[(edge + 2) % 3]];
      const name = [key(a), key(b)].sort().join("|");
      const known = edges.get(name);
      if (known) known.count++;
      else edges.set(name, { a, b, third, count: 1 });
    }
  }
  for (const { a, b, third, count } of edges.values()) {
    const along: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    // A short edge is a sliver's, as at a door's seam, whose strip would stand across its neighbour's.
    if (count !== 1 || Math.hypot(...along) < FRIT_SHORTEST_M) continue;
    const toThird: Point = [third[0] - a[0], third[1] - a[1], third[2] - a[2]];
    const raw: Point = [along[1] * toThird[2] - along[2] * toThird[1], along[2] * toThird[0] - along[0] * toThird[2], along[0] * toThird[1] - along[1] * toThird[0]];
    const outLength = Math.hypot(...raw);
    if (outLength < 1e-9) continue;
    const out: Point = [raw[0] / outLength, raw[1] / outLength, raw[2] / outLength];
    // Across the pane, from the edge towards its middle.
    const inwardRaw: Point = [out[1] * along[2] - out[2] * along[1], out[2] * along[0] - out[0] * along[2], out[0] * along[1] - out[1] * along[0]];
    const sign = inwardRaw[0] * toThird[0] + inwardRaw[1] * toThird[1] + inwardRaw[2] * toThird[2] < 0 ? -1 : 1;
    const inLength = Math.hypot(...inwardRaw);
    const width = Math.min(FRIT_M, (Math.abs(inwardRaw[0] * toThird[0] + inwardRaw[1] * toThird[1] + inwardRaw[2] * toThird[2]) / inLength) * 0.9);
    const inward: Point = [(sign * inwardRaw[0] * width) / inLength, (sign * inwardRaw[1] * width) / inLength, (sign * inwardRaw[2] * width) / inLength];
    const sunk = (p: Point): Point => [p[0] - out[0] * FRIT_INSET_M, p[1] - out[1] * FRIT_INSET_M, p[2] - out[2] * FRIT_INSET_M];
    const [p, q] = [sunk(a), sunk(b)];
    const corners: [Point, Point, Point, Point] = [p, q, [q[0] + inward[0], q[1] + inward[1], q[2] + inward[2]], [p[0] + inward[0], p[1] + inward[1], p[2] + inward[2]]];
    // Turned to face out of the car, as the glass does.
    const [c0, c1, c2] = corners;
    const n = [(c1[1] - c0[1]) * (c2[2] - c0[2]) - (c1[2] - c0[2]) * (c2[1] - c0[1]), (c1[2] - c0[2]) * (c2[0] - c0[0]) - (c1[0] - c0[0]) * (c2[2] - c0[2]), (c1[0] - c0[0]) * (c2[1] - c0[1]) - (c1[1] - c0[1]) * (c2[0] - c0[0])];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) builder.quad(...corners, "trim", builder.newGroup());
    else builder.quad(corners[3], corners[2], corners[1], corners[0], "trim", builder.newGroup());
  }
  return builder.finish(30);
}

export function buildCarParts(spec: CarSpec, detail: CarDetail, options = false): CarParts {
  const hero = detail === "hero";
  const shell = buildBody(spec.body, groundY(spec), hero ? HERO : FAR);
  const glass = pick(shell, (surface) => surface === "glass");
  return {
    body: hero ? joined(pick(shell, (surface) => (options || !isOption(surface)) && surface !== "glass"), fritOf(glass)) : pick(shell, (surface) => options || !isOption(surface)),
    glass: hero ? glass : null,
    wheel: buildWheel(spec.wheel, { sides: hero ? 30 : 9, spokes: hero, fine: hero }),
    calipers: hero ? calipersOf(spec.wheel) : null,
  };
}
