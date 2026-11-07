/*
 * A roe deer as rigid parts on pivots, standing at rest: the body, a neck and head
 * that turn on the shoulders and the poll, and four legs that each bend at one
 * joint (the knee in front, the hock behind). Every vertex carries the joints it
 * turns about and how it's driven, so the gaits are the shader's (`material.ts`),
 * and its paint as shares of the coat, the pale of the belly, rump and chin, and
 * the black of the nose and hooves, the rest being antler. Shares blend across a
 * face, so the belly fades into the flank as fur does.
 *
 * A deer faces +z with +y up and stands on its origin, so its left is +x. The
 * near version is under 450 triangles and the far under 200, in the same pose
 * and the same paint, so nothing changes shape at the swap.
 */

export type V3 = readonly [number, number, number];

const add = (a: V3, b: V3, scale = 1): V3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const lerp = (a: V3, b: V3, share: number): V3 => add(a, sub(b, a), share);
const ORIGIN: V3 = [0, 0, 0];

export const DEER_KINDS = ["doe", "buck", "kid"] as const;
export type DeerKind = (typeof DEER_KINDS)[number];
export type Detail = "near" | "far";

/** What drives a vertex, by index: its leg, the neck and head, or nothing but the body. */
export const DRIVES = ["body", "leg-front-left", "leg-front-right", "leg-hind-left", "leg-hind-right", "neck"] as const;
export type Drive = (typeof DRIVES)[number];

/** Shares of the coat, the pale and the black: whatever they leave is antler. */
export interface Paint {
  coat: number;
  pale: number;
  black: number;
  /** Baked light, 1 for none. */
  shade?: number;
}

const COAT: Paint = { coat: 1, pale: 0, black: 0 };
const PALE: Paint = { coat: 0, pale: 1, black: 0 };
const BLACK: Paint = { coat: 0, pale: 0, black: 1 };
const ANTLER: Paint = { coat: 0, pale: 0, black: 0 };
const mixed = (a: Paint, b: Paint, share: number, shade = 1): Paint => ({ coat: a.coat + (b.coat - a.coat) * share, pale: a.pale + (b.pale - a.pale) * share, black: a.black + (b.black - a.black) * share, shade });
const shaded = (paint: Paint, shade: number): Paint => ({ ...paint, shade });

interface Rig {
  drive: Drive;
  /** The joint nearer the body: a shoulder, a hip, the neck's root. */
  inner: V3;
  /** The joint further out: a knee, a hock, the poll. */
  outer: V3;
  /** Past the outer joint, so it turns about both. */
  lower: boolean;
}

const STILL: Rig = { drive: "body", inner: ORIGIN, outer: ORIGIN, lower: false };

/** A deer's triangles as plain arrays, everything its shader needs on each vertex. */
export interface DeerMesh {
  positions: Float32Array;
  /** Inner joint and drive: x, y, z, then the drive's index times two, plus one past the outer joint. */
  joints: Float32Array;
  outers: Float32Array;
  /** Coat, pale, black and shade over two, as bytes. */
  paints: Uint8Array;
  indices: Uint32Array;
}

class Soup {
  positions: number[] = [];
  joints: number[] = [];
  outers: number[] = [];
  paints: number[] = [];
  indices: number[] = [];
  rig: Rig = STILL;

  get vertexCount() {
    return this.positions.length / 3;
  }

  vertex(at: V3, paint: Paint): number {
    this.positions.push(...at);
    this.joints.push(...this.rig.inner, DRIVES.indexOf(this.rig.drive) * 2 + (this.rig.lower ? 1 : 0));
    this.outers.push(...this.rig.outer);
    const byte = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 255);
    this.paints.push(byte(paint.coat), byte(paint.pale), byte(paint.black), byte((paint.shade ?? 1) / 2));
    return this.vertexCount - 1;
  }

  rigged(rig: Rig, draw: () => void) {
    const before = this.rig;
    this.rig = rig;
    draw();
    this.rig = before;
  }

  /** Rings joined into a skin, each ring's paint read round it from its top. The ends close on points, if given. */
  loft(rings: readonly Ring[], sides: number, ends: { start?: V3; end?: V3; startPaint?: Paint; endPaint?: Paint } = {}) {
    const firsts = rings.map((ring) => {
      const first = this.vertexCount;
      for (let side = 0; side < sides; side++) {
        const angle = (side / sides) * 2 * Math.PI;
        this.vertex(add(add(ring.at, ring.up, Math.cos(angle)), ring.side, Math.sin(angle)), ring.paint(angle));
      }
      return first;
    });
    for (let band = 0; band + 1 < firsts.length; band++) {
      for (let side = 0; side < sides; side++) {
        const after = (side + 1) % sides;
        const [a, b] = [firsts[band], firsts[band + 1]];
        this.indices.push(a + side, a + after, b + side, b + side, a + after, b + after);
      }
    }
    const close = (first: number, point: V3, paint: Paint) => {
      const apex = this.vertex(point, paint);
      for (let side = 0; side < sides; side++) this.indices.push(first + side, first + ((side + 1) % sides), apex);
    };
    if (ends.start) close(firsts[0], ends.start, ends.startPaint ?? rings[0].paint(0));
    if (ends.end) close(firsts[firsts.length - 1], ends.end, ends.endPaint ?? rings[rings.length - 1].paint(0));
  }

  build(): DeerMesh {
    return {
      positions: Float32Array.from(this.positions),
      joints: Float32Array.from(this.joints),
      outers: Float32Array.from(this.outers),
      paints: Uint8Array.from(this.paints),
      indices: Uint32Array.from(this.indices),
    };
  }
}

/** A ring of a loft: a centre, its half-axes up and to the side, and its paint at each angle from the top. */
interface Ring {
  at: V3;
  up: V3;
  side: V3;
  paint: (angle: number) => Paint;
}

/** A ring across a line running `along`, with `up` as near the world's up as it can be. */
function ringAcross(at: V3, along: V3, tall: number, wide: number, paint: Ring["paint"], twist: V3 = [0, 1, 0]): Ring {
  const way = unit(along);
  const side = unit(cross(twist, way));
  const up = cross(way, side);
  return { at, up: add(ORIGIN, up, tall), side: add(ORIGIN, side, wide), paint };
}

const evenly = (paint: Paint) => () => paint;

/**
 * How a kind differs from the doe its measurements are written for: its size, how long its legs and big its head are
 * for that size, how deep and broad its body and how thick its neck.
 */
interface Build {
  scale: number;
  leg: number;
  head: number;
  girth: number;
  neck: number;
  antlers: boolean;
}

/**
 * Roe deer as Åland has them: about 0.7 m at the shoulder and 1.1 m from nose to tail, the buck no bigger than the
 * doe but thicker in the neck, and a kid of the summer a little over two thirds of her, long in the leg and big in the
 * head and ears.
 */
const BUILDS: Record<DeerKind, Build> = {
  doe: { scale: 1, leg: 1, head: 1, girth: 1, neck: 1, antlers: false },
  buck: { scale: 1.03, leg: 1, head: 1.04, girth: 1.05, neck: 1.25, antlers: true },
  kid: { scale: 0.7, leg: 1.12, head: 1.22, girth: 0.92, neck: 0.95, antlers: false },
};

/** How high a doe's body sits over its legs: where the legs' own lengths start. */
const LEG_TOP_Y = 0.46;

/** A doe's measurements, moved into a kind's: the body by its size, its legs lengthened under it, its head grown about the poll. */
function shaper(build: Build) {
  const lift = LEG_TOP_Y * build.scale * (build.leg - 1);
  const body = ([x, y, z]: V3): V3 => [x * build.scale * build.girth, y * build.scale + lift, z * build.scale];
  const leg = ([x, y, z]: V3): V3 => [x * build.scale * build.girth, y * build.scale * build.leg, z * build.scale];
  const poll = body(POLL);
  const head = (point: V3): V3 => add(poll, sub(point, POLL), build.scale * build.head);
  return { body, leg, head, size: build.scale, wide: build.scale * build.girth };
}

const POLL: V3 = [0, 0.9, 0.39];
const NECK_ROOT: V3 = [0, 0.63, 0.24];

/** The body's stations nose to tail, each a centre's height and the half height and half width there. */
const BODY: readonly { z: number; y: number; tall: number; wide: number }[] = [
  { z: -0.43, y: 0.63, tall: 0.085, wide: 0.075 },
  { z: -0.36, y: 0.615, tall: 0.13, wide: 0.115 },
  { z: -0.22, y: 0.6, tall: 0.145, wide: 0.13 },
  { z: -0.05, y: 0.58, tall: 0.14, wide: 0.135 },
  { z: 0.12, y: 0.575, tall: 0.15, wide: 0.125 },
  { z: 0.25, y: 0.59, tall: 0.14, wide: 0.1 },
  { z: 0.34, y: 0.62, tall: 0.1, wide: 0.07 },
];

/** Paler down the belly, as a roe's underside is in either coat. */
function bellied(underneath: number, shade = 1) {
  return (angle: number) => {
    const down = (1 - Math.cos(angle)) / 2;
    return mixed(COAT, PALE, Math.max(0, (down - 0.72) / 0.28) * underneath, shade * (1 - down * 0.18));
  };
}

function body(soup: Soup, shape: ReturnType<typeof shaper>, detail: Detail) {
  const stations = detail === "near" ? BODY : [BODY[0], BODY[2], BODY[4], BODY[6]];
  const rings = stations.map(({ z, y, tall, wide }, index) => {
    const at = shape.body([0, y, z]);
    // The rump patch, white in winter and cream in summer, round where the tail would be.
    const rump = index === 0 ? (angle: number) => mixed(PALE, COAT, Math.max(0, Math.cos(angle) - 0.2) * 0.8) : bellied(index < 2 ? 0.4 : 0.9);
    return { at, up: [0, tall * shape.wide, 0] as V3, side: [wide * shape.wide, 0, 0] as V3, paint: rump };
  });
  soup.loft(rings, detail === "near" ? 8 : 6, { start: shape.body([0, 0.645, -0.47]), startPaint: PALE, end: shape.body([0, 0.63, 0.37]) });
}

function neckAndHead(soup: Soup, shape: ReturnType<typeof shaper>, build: Build, detail: Detail) {
  const near = detail === "near";
  const root = shape.body(NECK_ROOT);
  const poll = shape.body(POLL);
  const neckRig: Rig = { drive: "neck", inner: root, outer: poll, lower: false };
  const headRig: Rig = { ...neckRig, lower: true };
  const thick = build.neck * shape.size;
  soup.rigged(neckRig, () => {
    const stations: [V3, number, number][] = near
      ? [
          [[0, 0.63, 0.22], 0.11, 0.075],
          [[0, 0.73, 0.29], 0.08, 0.058],
          [[0, 0.82, 0.35], 0.062, 0.048],
          [[0, 0.885, 0.39], 0.055, 0.044],
        ]
      : [
          [[0, 0.63, 0.22], 0.11, 0.075],
          [[0, 0.885, 0.39], 0.055, 0.044],
        ];
    const points = stations.map(([at]) => shape.body(at));
    const rings = stations.map(([, tall, wide], index) => {
      const along = sub(points[Math.min(index + 1, points.length - 1)], points[Math.max(index - 1, 0)]);
      // The throat is paler, a roe's pale gorget showing most in winter.
      const paint = (angle: number) => mixed(COAT, PALE, Math.max(0, -Math.cos(angle) - 0.6) * (index === 2 || !near ? 0.7 : 0.25), 1 - Math.max(0, -Math.cos(angle)) * 0.1);
      return ringAcross(points[index], along, tall * thick, wide * thick, paint, [0, 0, -1]);
    });
    soup.loft(rings, near ? 6 : 4, { start: shape.body([0, 0.6, 0.18]) });
  });

  soup.rigged(headRig, () => {
    const at = (point: V3) => shape.head(point);
    const axis = sub(at([0, 0.83, 0.59]), at([0, 0.915, 0.39]));
    const face = (z: number, y: number, tall: number, wide: number, paint: Ring["paint"]) => ringAcross(at([0, y, z]), axis, tall * shape.size * build.head, wide * shape.size * build.head, paint);
    const crown = (angle: number) => shaded(COAT, 1 - Math.max(0, -Math.cos(angle)) * 0.12);
    // Dark eyes in the widest ring; a black band over the muzzle above a white chin; a black nose.
    const eyes = (angle: number) => (Math.abs(Math.sin(angle)) > 0.9 && Math.cos(angle) > -0.1 ? mixed(COAT, BLACK, 0.75) : crown(angle));
    const band = (angle: number) => (Math.cos(angle) > 0.2 ? mixed(COAT, BLACK, 0.55, 0.9) : Math.cos(angle) < -0.4 ? PALE : shaded(COAT, 0.9));
    const nose = (angle: number) => (Math.cos(angle) > -0.4 ? BLACK : PALE);
    const start = at([0, 0.92, 0.355]);
    const end = at([0, 0.838, 0.592]);
    if (near) {
      soup.loft([face(0.385, 0.925, 0.052, 0.048, crown), face(0.435, 0.915, 0.058, 0.06, eyes), face(0.495, 0.884, 0.05, 0.046, crown), face(0.54, 0.86, 0.042, 0.038, band), face(0.568, 0.845, 0.036, 0.034, nose)], 6, { start, end, endPaint: BLACK });
    } else {
      soup.loft([face(0.41, 0.92, 0.056, 0.054, crown), face(0.52, 0.872, 0.046, 0.042, crown), face(0.568, 0.845, 0.036, 0.034, nose)], 4, { start, end, endPaint: BLACK });
    }
    for (const side of [-1, 1]) {
      const base = at([side * 0.034, 0.95, 0.405]);
      const tip = at([side * 0.098, 1.06, 0.385]);
      const way = sub(tip, base);
      // Big rounded ears held up and out, their flat faces forward, darker at the rim.
      const ear = (share: number, tall: number, wide: number) => ringAcross(lerp(base, tip, share), way, tall * shape.size * build.head, wide * shape.size * build.head, (angle) => (Math.cos(angle) > 0.3 ? mixed(COAT, PALE, 0.45) : shaded(COAT, 0.85)), [0, 0, 1]);
      if (near) soup.loft([ear(0, 0.011, 0.017), ear(0.45, 0.012, 0.04), ear(0.8, 0.01, 0.034)], 4, { end: add(tip, way, 0.04), endPaint: mixed(COAT, BLACK, 0.5) });
      else soup.loft([ear(0, 0.01, 0.016), ear(0.55, 0.01, 0.038)], 3, { end: add(tip, way, 0.04), endPaint: COAT });
    }
    if (build.antlers) antlers(soup, at, detail);
  });
}

/**
 * A roe buck's short upright antlers, about a hand and a half tall: a beam from the pedicle with one tine forward
 * part way up and its top forked back, rough at the base.
 */
function antlers(soup: Soup, at: (point: V3) => V3, detail: Detail) {
  for (const side of [-1, 1]) {
    const point = (x: number, y: number, z: number): V3 => at([side * x, y, z]);
    const base = point(0.03, 0.955, 0.42);
    const fork = point(0.045, 1.095, 0.415);
    const top = point(0.05, 1.175, 0.43);
    const tine = (from: V3, to: V3, radius: number, sides: number) => soup.loft([ringAcross(from, sub(to, from), radius, radius, evenly(ANTLER), [0, 0, 1])], sides, { end: to });
    if (detail === "near") {
      soup.loft(
        [
          ringAcross(base, sub(fork, base), 0.02, 0.02, evenly(shaded(ANTLER, 0.8)), [0, 0, 1]),
          ringAcross(lerp(base, fork, 0.2), sub(fork, base), 0.024, 0.024, evenly(shaded(ANTLER, 0.72)), [0, 0, 1]),
          ringAcross(fork, sub(top, base), 0.015, 0.015, evenly(ANTLER), [0, 0, 1]),
        ],
        4,
        { start: lerp(base, fork, -0.15), end: top },
      );
      tine(lerp(base, fork, 0.62), point(0.05, 1.08, 0.49), 0.011, 3);
      tine(fork, point(0.05, 1.15, 0.36), 0.012, 3);
    } else {
      soup.loft([ringAcross(lerp(base, fork, -0.1), sub(top, base), 0.022, 0.022, evenly(ANTLER), [0, 0, 1])], 3, { end: top });
      tine(lerp(fork, top, 0.1), point(0.05, 1.15, 0.36), 0.012, 3);
    }
  }
}

/** A leg's joints as a doe has them, from where it starts inside the body to the hoof's toe. */
interface LegLine {
  pivot: V3;
  top: V3;
  joint: V3;
  fetlock: V3;
  hoof: V3;
  toe: V3;
  /** Radii at the top, the joint and the fetlock. */
  radii: [number, number, number];
}

const FRONT: LegLine = { pivot: [0.075, 0.58, 0.25], top: [0.075, 0.5, 0.25], joint: [0.072, 0.265, 0.27], fetlock: [0.07, 0.07, 0.275], hoof: [0.07, 0.03, 0.3], toe: [0.07, 0, 0.33], radii: [0.036, 0.021, 0.015] };
const HIND: LegLine = { pivot: [0.068, 0.62, -0.3], top: [0.072, 0.56, -0.28], joint: [0.065, 0.3, -0.41], fetlock: [0.065, 0.07, -0.375], hoof: [0.065, 0.03, -0.35], toe: [0.065, 0, -0.32], radii: [0.055, 0.022, 0.015] };

function leg(soup: Soup, shape: ReturnType<typeof shaper>, line: LegLine, side: 1 | -1, drive: Drive, detail: Detail) {
  const mirror = ([x, y, z]: V3): V3 => [x * side, y, z];
  const above = (point: V3) => shape.body(mirror(point));
  const below = (point: V3) => shape.leg(mirror(point));
  const [pivot, top, joint, fetlock, hoof, toe] = [above(line.pivot), above(line.top), below(line.joint), below(line.fetlock), below(line.hoof), below(line.toe)];
  const [rTop, rJoint, rFetlock] = line.radii.map((radius) => radius * shape.size);
  const upper: Rig = { drive, inner: pivot, outer: joint, lower: false };
  const lower: Rig = { ...upper, lower: true };
  const near = detail === "near";
  const sides = near ? 4 : 3;
  // The legs darken towards the hooves, as a roe's do.
  const leggy = (shade: number) => evenly(shaded(COAT, shade));
  soup.rigged(upper, () => {
    soup.loft([ringAcross(top, sub(joint, top), rTop, rTop * 0.8, leggy(0.92)), ringAcross(joint, sub(joint, top), rJoint * 1.1, rJoint, leggy(0.85))], sides, { start: add(top, [0, 1, 0], rTop) });
  });
  soup.rigged(lower, () => {
    const rings = near
      ? [
          ringAcross(joint, sub(fetlock, joint), rJoint, rJoint * 0.9, leggy(0.82)),
          ringAcross(fetlock, sub(fetlock, joint), rFetlock, rFetlock, leggy(0.75)),
          ringAcross(hoof, sub(hoof, fetlock), rFetlock * 1.05, rFetlock * 0.9, evenly(BLACK)),
        ]
      : [ringAcross(joint, sub(fetlock, joint), rJoint, rJoint * 0.9, leggy(0.82)), ringAcross(hoof, sub(hoof, fetlock), rFetlock, rFetlock, leggy(0.7))];
    soup.loft(rings, sides, { end: toe, endPaint: BLACK });
  });
}

/** One roe deer at rest, standing square. */
export function buildDeer(kind: DeerKind, detail: Detail): DeerMesh {
  const build = BUILDS[kind];
  const shape = shaper(build);
  const soup = new Soup();
  body(soup, shape, detail);
  neckAndHead(soup, shape, build, detail);
  leg(soup, shape, FRONT, 1, "leg-front-left", detail);
  leg(soup, shape, FRONT, -1, "leg-front-right", detail);
  leg(soup, shape, HIND, 1, "leg-hind-left", detail);
  leg(soup, shape, HIND, -1, "leg-hind-right", detail);
  return soup.build();
}

/** How tall a kind stands at the withers, and how big a patch of shade it casts, for the herd's shadows. */
export function deerSize(kind: DeerKind) {
  const { scale, leg } = BUILDS[kind];
  return { withersM: (LEG_TOP_Y * leg + 0.27) * scale, lengthM: 0.95 * scale, wideM: 0.3 * scale };
}

/** Where a kind's body pitches about: its middle. */
export function bodyCentre(kind: DeerKind): V3 {
  return shaper(BUILDS[kind]).body([0, 0.59, -0.02]);
}
