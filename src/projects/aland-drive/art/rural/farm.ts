import type { RoadsideModel } from "../roadside/index";
import { seeded, type V3 } from "../roadside/mesh";
import { finished, ringed, RuralMesh, type RuralPart } from "./mesh";

/* The working fields: bales, walls, a tractor, sheep and cows. All in metres, standing on their origin. */

/*
 * Each ends where it's about a pixel and a half tall on the floor's screen, so shrinking into the ground over the last
 * of its reach can't be seen: a tractor stops a little short of that, inside the reach every tile's detail is sure of.
 */
const BALE_REACH_M = 1200;
const TRACTOR_REACH_M = 2100;
const SHEEP_REACH_M = 750;
const COW_REACH_M = 1150;

const BALE_RADIUS_M = 0.72;
const BALE_WIDE_M = 1.2;
const BALE_SIDES = 10;
const BALE_ROUND_M = 0.08;

function bale(mesh: RuralMesh, sides: number, roundM: number, body: RuralPart, end: RuralPart, endInner: RuralPart | null): RuralMesh {
  const half = BALE_WIDE_M / 2;
  const y = BALE_RADIUS_M - 0.03;
  const cap = (x: number, radius: number, part: RuralPart, shade: number) => {
    const corners = Array.from({ length: sides }, (_, side): V3 => {
      const angle = (side / sides) * 2 * Math.PI;
      return [x, y + Math.sin(angle) * radius, Math.cos(angle) * radius];
    });
    mesh.face(corners, part, shade);
  };
  mesh.tube([-half + roundM, y, 0], [half - roundM, y, 0], BALE_RADIUS_M, sides, { shadeFrom: 1, shadeTo: 1.02 }, body);
  for (const way of [-1, 1]) {
    if (roundM > 0) mesh.tube([way * (half - roundM), y, 0], [way * half, y, 0], BALE_RADIUS_M, sides, { radiusTo: BALE_RADIUS_M - roundM }, body);
    cap(way * half, BALE_RADIUS_M - roundM, end, 0.98);
    if (endInner !== null) cap(way * (half + 0.004), BALE_RADIUS_M * 0.5, endInner, 0.9);
  }
  return mesh;
}

/** A round silage bale in white film, lying on its side, axis along x. */
export function buildWrappedBale(): RoadsideModel {
  const near = bale(new RuralMesh(), BALE_SIDES, BALE_ROUND_M, "bale-wrap", "bale-wrap", "bale-seam");
  for (const x of [-0.2, 0.26]) near.tube([x, BALE_RADIUS_M - 0.03, 0], [x + 0.03, BALE_RADIUS_M - 0.03, 0], BALE_RADIUS_M + 0.004, BALE_SIDES, {}, "bale-seam");
  return finished(near, bale(new RuralMesh(), 5, 0, "bale-wrap", "bale-wrap", null), 90, BALE_REACH_M);
}

/** A round bale of plain hay, lying on its side, axis along x. */
export function buildHayBale(): RoadsideModel {
  return finished(bale(new RuralMesh(), BALE_SIDES, BALE_ROUND_M, "hay", "hay", "hay-end"), bale(new RuralMesh(), 5, 0, "hay", "hay", null), 90, BALE_REACH_M);
}

/** A section of field-stone wall to knee height, running along +x. Lay one after another, and stretch or shear it to fit. */
export const STONE_WALL_M = 2.4;
/** How far each section runs on past both its ends, so two sections at an angle close the gap on the bend's outside. */
export const STONE_WALL_OVERLAP_M = 0.12;
const WALL_STONES = 9;
const WALL_WIDE_M = 0.62;
const WALL_TALL_M = 0.72;

export function buildStoneWall(seed = 1): RoadsideModel {
  const random = seeded(seed * 4441 + 19);
  const near = new RuralMesh();
  const core = (mesh: RuralMesh, shade: number, part: RuralPart) => {
    const [half, top] = [WALL_WIDE_M / 2, WALL_TALL_M * 0.55];
    return mesh
      .face([[0, -0.4, half], [STONE_WALL_M, -0.4, half], [STONE_WALL_M, top, half * 0.5], [0, top, half * 0.5]], part, shade)
      .face([[STONE_WALL_M, -0.4, -half], [0, -0.4, -half], [0, top, -half * 0.5], [STONE_WALL_M, top, -half * 0.5]], part, shade)
      .face([[0, top, half * 0.5], [STONE_WALL_M, top, half * 0.5], [STONE_WALL_M, top, -half * 0.5], [0, top, -half * 0.5]], part, shade);
  };
  core(near, 1, "wall-core");
  for (let stone = 0; stone < WALL_STONES; stone++) {
    const course = stone % 5 < 2 ? 0 : stone % 5 < 4 ? 1 : 2;
    const middle = [0.16, 0.16, 0.46][course];
    const along = ((stone + 0.5 + random() * 0.4) / WALL_STONES) * STONE_WALL_M;
    const side = [1, -1, 0][course] * WALL_WIDE_M * 0.3;
    const size = 0.38 + random() * 0.12;
    const [wide, tall] = [size * (1 + random() * 0.35), size * (0.62 + random() * 0.2)];
    const turn = random() * 6.283;
    const ring = (up: number, share: number) => Array.from({ length: 5 }, (_, corner): V3 => {
      const angle = turn + (corner / 5) * 6.283;
      return [along + Math.cos(angle) * wide * share, middle + up * tall, side + Math.sin(angle) * size * 0.72 * share];
    });
    const { corners, triangles } = ringed([ring(-0.4, 1), ring(0.34, 0.86)], [along, middle + tall * 0.72, side]);
    near.solid(corners, triangles, random() < 0.5 ? "field-stone-pink" : "field-stone", ([, y]) => 0.84 + (y / WALL_TALL_M) * 0.26);
  }
  const far = core(new RuralMesh(), 0.92, "field-stone-pink");
  for (let bump = 0; bump < 2; bump++) {
    const from = (bump / 2) * STONE_WALL_M;
    far.face([[from, WALL_TALL_M * 0.72, 0], [from + STONE_WALL_M / 2, WALL_TALL_M * 0.72, 0], [from + STONE_WALL_M * 0.26, WALL_TALL_M * (0.9 + bump * 0.1), 0]], "field-stone-pink");
  }
  return finished(near, far, 110, 460);
}

const REAR_RADIUS_M = 0.78;
const FRONT_RADIUS_M = 0.46;

function wheel(mesh: RuralMesh, x: number, z: number, radius: number, wide: number, sides: number, hub: boolean): RuralMesh {
  const way = Math.sign(x);
  const [inner, outer] = [x - (way * wide) / 2, x + (way * wide) / 2];
  mesh.tube([inner, radius, z], [outer, radius, z], radius, sides, { shadeFrom: 0.9, shadeTo: 1 }, "tyre");
  const disc = (at: number, reach: number, part: RuralPart) => {
    mesh.face(Array.from({ length: sides }, (_, side): V3 => {
      const angle = (side / sides) * 2 * Math.PI;
      return [at, radius + Math.sin(angle) * reach, z + Math.cos(angle) * reach];
    }), part);
  };
  disc(outer, radius * 0.97, "tyre");
  if (hub) {
    disc(outer + way * 0.006, radius * 0.5, "tractor-hub");
    mesh.tube([outer, radius, z], [outer + way * 0.07, radius, z], radius * 0.2, 5, { cap: true }, "tractor-hub");
  }
  return mesh;
}

/** A small old field tractor, 3.3 m long, in the plain red the old Finnish ones wore, with a cab frame. Its bonnet points +z. */
export function buildTractor(): RoadsideModel {
  const near = new RuralMesh();
  const [rearZ, frontZ] = [-0.85, 1.05];
  for (const side of [-1, 1]) {
    wheel(near, side * 0.86, rearZ, REAR_RADIUS_M, 0.4, 10, true);
    wheel(near, side * 0.72, frontZ, FRONT_RADIUS_M, 0.2, 8, true);
  }
  near
    .beam([-0.72, FRONT_RADIUS_M, frontZ], [0.72, FRONT_RADIUS_M, frontZ], 0.14, 0.14, "tractor-dark")
    .beam([-0.72, REAR_RADIUS_M, rearZ], [0.72, REAR_RADIUS_M, rearZ], 0.18, 0.18, "tractor-dark")
    .box([-0.3, 0.42, -1.05], [0.3, 1, 0.1], "tractor-dark", { shadeTop: 0.95 });
  // The bonnet, narrowing to its grille, in one loft.
  const [back, front] = [-0.02, 1.62];
  const section = (z: number, half: number, low: number, high: number): V3[] => [[-half, low, z], [half, low, z], [half, high - 0.1, z], [half * 0.72, high, z], [-half * 0.72, high, z], [-half, high - 0.1, z]];
  const [a, b] = [section(back, 0.34, 0.62, 1.42), section(front, 0.27, 0.56, 1.3)];
  for (let side = 0; side < 6; side++) {
    const next = (side + 1) % 6;
    near.face([a[side], a[next], b[next], b[side]], side === 0 ? "tractor-dark" : "tractor-red", side === 3 ? 1.1 : 1);
  }
  near.face(b, "tractor-dark", 0.95);
  near.face([[-0.2, 0.68, front + 0.008], [0.2, 0.68, front + 0.008], [0.2, 1.2, front + 0.008], [-0.2, 1.2, front + 0.008]], "tractor-steel", 0.85);
  for (const side of [-1, 1]) {
    near.face([[side * 0.2, 1.04, front + 0.012], [side * 0.27, 1.04, front + 0.012], [side * 0.27, 1.14, front + 0.012], [side * 0.2, 1.14, front + 0.012]], "lamp");
    near.face([[side * 0.31, 0.72, 0.15], [side * 0.31, 0.72, 1.3], [side * 0.31, 1.22, 1.3], [side * 0.31, 1.22, 0.15]], "tractor-steel", 0.7);
    // The mudguard, a bent sheet over each rear wheel.
    const inner = side * 0.62;
    const outer = side * 1.12;
    const arc = [[-1.72, 0.92], [-1.5, 1.42], [-0.95, 1.68], [-0.38, 1.5], [-0.1, 1.08]] as const;
    for (let step = 0; step < arc.length - 1; step++) {
      const [[z0, y0], [z1, y1]] = [arc[step], arc[step + 1]];
      near.face([[inner, y0, z0], [outer, y0, z0], [outer, y1, z1], [inner, y1, z1]], "tractor-red", 1.04);
    }
    near.face([[side * 0.3, 0.58, -0.02], [inner, 0.58, -0.02], [inner, 0.58, -0.3], [side * 0.3, 0.58, -0.3]], "tractor-steel", 0.9);
  }
  near.tube([0.14, 1.4, 1.05], [0.14, 2.18, 1.02], 0.04, 5, { radiusTo: 0.035 }, "tractor-dark");

  // The cab: four posts, a dark floor, glass front and back, a white roof.
  const [cabLow, cabHigh, cabBack, cabFront, cabHalf] = [0.96, 2.42, -1.42, -0.02, 0.62];
  near.face([[-cabHalf, 1.02, cabBack], [cabHalf, 1.02, cabBack], [cabHalf, 1.02, cabFront], [-cabHalf, 1.02, cabFront]], "tractor-dark", 0.8);
  for (const [x, z] of [[-cabHalf, cabBack], [cabHalf, cabBack], [-cabHalf, cabFront], [cabHalf, cabFront]] as const) near.beam([x, cabLow, z], [x, cabHigh, z], 0.06, 0.06, "tractor-dark");
  near.face([[-cabHalf, 1.42, cabFront], [cabHalf, 1.42, cabFront], [cabHalf, cabHigh, cabFront], [-cabHalf, cabHigh, cabFront]], "tractor-glass");
  near.face([[-cabHalf, 1.5, cabBack], [cabHalf, 1.5, cabBack], [cabHalf, cabHigh, cabBack], [-cabHalf, cabHigh, cabBack]], "tractor-glass", 0.9);
  near.box([-cabHalf - 0.06, cabHigh, cabBack - 0.08], [cabHalf + 0.06, cabHigh + 0.1, cabFront + 0.1], "trim", { shade: 0.92 });
  // Seat, wheel and the rear link arms.
  near.box([-0.22, 1.32, -1.08], [0.22, 1.42, -0.68], "tractor-dark", { open: true });
  near.face([[-0.2, 1.42, -1.1], [0.2, 1.42, -1.1], [0.2, 1.88, -1.16], [-0.2, 1.88, -1.16]], "tractor-dark");
  near.beam([0, 1.44, -0.18], [0, 1.72, -0.34], 0.03, 0.03, "tractor-dark");
  near.tube([0, 1.7, -0.32], [0, 1.74, -0.36], 0.18, 6, {}, "tractor-dark");
  for (const side of [-0.28, 0.28]) near.beam([side, 0.5, -1.1], [side * 1.2, 0.42, -1.75], 0.06, 0.08, "tractor-steel", 0.85);

  const far = new RuralMesh();
  for (const side of [-1, 1]) {
    far.tube([side * 0.66, REAR_RADIUS_M, rearZ], [side * 1.06, REAR_RADIUS_M, rearZ], REAR_RADIUS_M, 4, { cap: true }, "tyre");
    far.face([[side * 0.8, 0, frontZ - FRONT_RADIUS_M], [side * 0.8, 0, frontZ + FRONT_RADIUS_M], [side * 0.8, FRONT_RADIUS_M * 2, frontZ + FRONT_RADIUS_M * 0.6], [side * 0.8, FRONT_RADIUS_M * 2, frontZ - FRONT_RADIUS_M * 0.6]], "tyre");
  }
  far.box([-0.33, 0.58, -0.05], [0.33, 1.4, 1.62], "tractor-red", { open: true });
  far.face([[-cabHalf, 1.42, cabFront], [cabHalf, 1.42, cabFront], [cabHalf, cabHigh, cabFront], [-cabHalf, cabHigh, cabFront]], "tractor-glass");
  far.face([[-cabHalf, 1, cabBack], [-cabHalf, 1, cabFront], [-cabHalf, cabHigh, cabFront], [-cabHalf, cabHigh, cabBack]], "tractor-glass", 0.9);
  far.face([[cabHalf, 1, cabBack], [cabHalf, 1, cabFront], [cabHalf, cabHigh, cabFront], [cabHalf, cabHigh, cabBack]], "tractor-glass", 0.9);
  far.face([[-cabHalf, cabHigh + 0.1, cabBack], [cabHalf, cabHigh + 0.1, cabBack], [cabHalf, cabHigh + 0.1, cabFront], [-cabHalf, cabHigh + 0.1, cabFront]], "trim");
  return finished(near, far, 130, TRACTOR_REACH_M);
}

export type SheepPose = "standing" | "grazing";

const FLEECE_STATIONS: [z: number, wide: number, tall: number, middle: number][] = [
  [-0.52, 0.14, 0.14, 0.6],
  [-0.4, 0.27, 0.27, 0.6],
  [-0.08, 0.31, 0.31, 0.6],
  [0.2, 0.3, 0.3, 0.62],
  [0.42, 0.2, 0.22, 0.66],
];
const FLEECE_SIDES = 7;

/**
 * An Åland sheep a metre long, its head to +z: the small archipelago landrace, whose coat the material rolls per place
 * from light grey to black, and whose horns it keeps on a few. Scale a lamb to 0.6.
 */
export function buildSheep(pose: SheepPose = "grazing"): RoadsideModel {
  const part: RuralPart = "wool";
  const near = new RuralMesh();
  const stations = FLEECE_STATIONS.map(([z, wide, tall, middle], station) => Array.from({ length: FLEECE_SIDES }, (_, side): V3 => {
    const angle = (side / FLEECE_SIDES) * 2 * Math.PI + station * 0.45;
    return [Math.cos(angle) * wide, middle + Math.sin(angle) * tall, z];
  }));
  const body = ringed(stations, [0, 0.68, 0.5]);
  near.solid(body.corners, body.triangles, part, ([, y]) => 0.86 + Math.max(0, y - 0.3) * 0.5);
  near.face(stations[0], part, 0.86);
  for (const [x, z] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, 0.28], [0.14, 0.28]] as const) near.tube([x, 0.42, z], [x, -0.04, z], 0.05, 4, { radiusTo: 0.032 }, "sheep-face");
  const [neck, head]: [V3, V3] = pose === "grazing" ? [[0, 0.56, 0.46], [0, 0.14, 0.76]] : [[0, 0.72, 0.42], [0, 0.92, 0.66]];
  near.tube(neck, [head[0], head[1] + 0.05, head[2] - 0.13], 0.12, 5, { radiusTo: 0.09 }, part);
  const muzzle: V3 = pose === "grazing" ? [0, 0.06, 0.86] : [0, 0.82, 0.86];
  near.tube([head[0], head[1] + 0.03, head[2] - 0.13], muzzle, 0.09, 5, { radiusTo: 0.05, cap: true }, "sheep-face");
  for (const side of [-1, 1]) {
    near.spike([side * 0.06, head[1] + 0.09, head[2] - 0.1], [side * 0.2, head[1] + 0.12, head[2] - 0.15], 0.03, "sheep-face");
    // A ewe's small horns, curling back and down past the ear.
    const curl: V3[] = [[side * 0.04, head[1] + 0.13, head[2] - 0.12], [side * 0.09, head[1] + 0.21, head[2] - 0.2], [side * 0.15, head[1] + 0.17, head[2] - 0.28], [side * 0.17, head[1] + 0.06, head[2] - 0.25], [side * 0.14, head[1] + 0.02, head[2] - 0.17]];
    for (let step = 0; step < curl.length - 1; step++) near.tube(curl[step], curl[step + 1], 0.032 - step * 0.005, 4, { radiusTo: 0.027 - step * 0.005 }, "horn");
  }
  const far = new RuralMesh();
  far.tube([0, 0.6, -0.5], [0, 0.6, 0.42], 0.31, 4, { radiusTo: 0.24, cap: true }, part);
  far.face([[-0.16, 0, -0.3], [0.16, 0, -0.3], [0.16, 0.4, -0.3], [-0.16, 0.4, -0.3]], "sheep-face");
  far.face([[-0.16, 0, 0.28], [0.16, 0, 0.28], [0.16, 0.4, 0.28], [-0.16, 0.4, 0.28]], "sheep-face");
  far.face([[-0.08, head[1], head[2]], [0.08, head[1], head[2]], [0, neck[1], neck[2]]], "sheep-face");
  return finished(near, far, 60, SHEEP_REACH_M);
}

export type CowPose = "grazing" | "standing" | "lying";

/** Where a cow's patches have faded to its coat's mean (`hide`, `material.ts`), the colour its far version wears. */
export const HIDE_GONE_M = 170;
/** Past `HIDE_GONE_M` wherever a place's roll starts its dissolve, so the two versions are the same colour when they trade. */
const COW_SWAP_M = 260;
const FAR_BODY_SHADE = 0.92;

/** A cow at scale 1, for collision: its body's half width, and how far it reaches behind its origin to the tail and before it to the nose. */
export const COW = { halfX: 0.36, back: 0.95, front: 1.52 };

/** The body from the pins to the brisket, in sections: where, the spine's and belly's heights, the widest half width, the half width across the back. */
const BODY_STATIONS: [z: number, top: number, bottom: number, wide: number, back: number][] = [
  [-0.86, 1.33, 0.9, 0.19, 0.13],
  [-0.62, 1.42, 0.78, 0.29, 0.26],
  [-0.22, 1.38, 0.63, 0.35, 0.2],
  [0.18, 1.37, 0.62, 0.34, 0.16],
  [0.52, 1.41, 0.72, 0.26, 0.09],
];

/** A station of the neck and head, from the shoulders to the nose: its middle, its half width and half depth, and how far its lower half hangs further (the dewlap, the jaw). */
type HeadStation = [middle: V3, wide: number, deep: number, hang: number];

interface CowShape {
  /** Added to the body's heights: a lying cow's belly is on the ground. */
  lift: number;
  /** The neck out of the shoulders, then the head from the poll to the muzzle. */
  head: HeadStation[];
  tail: V3[];
}

/** The head's own stations, from the poll down the face, along its length and as its share of the way to the nose. */
const FACE: [share: number, wide: number, deep: number, hang: number][] = [
  [0, 0.12, 0.13, 0.05],
  [0.22, 0.13, 0.14, 0.07],
  [0.55, 0.095, 0.115, 0.025],
  [0.84, 0.092, 0.095, 0],
  [1, 0.108, 0.085, 0],
];

/** Where the head starts among a cow's head stations, after the neck's three. */
const POLL = 3;

/** A neck of three stations from inside the shoulders, then a head from its poll to its nose. */
function neckAndHead(neck: [V3, V3, V3], poll: V3, nose: V3): HeadStation[] {
  const [shoulders, middle, throat] = neck;
  return [
    [shoulders, 0.25, 0.3, 0],
    [middle, 0.2, 0.22, 0.1],
    [throat, 0.15, 0.16, 0.06],
    ...FACE.map(([share, wide, deep, hang]): HeadStation => [[poll[0] + (nose[0] - poll[0]) * share, poll[1] + (nose[1] - poll[1]) * share, poll[2] + (nose[2] - poll[2]) * share], wide, deep, hang]),
  ];
}

const SHAPES: Record<CowPose, CowShape> = {
  standing: { lift: 0, head: neckAndHead([[0, 1.1, 0.28], [0, 1.14, 0.62], [0, 1.2, 0.84]], [0, 1.27, 0.97], [0, 0.86, 1.34]), tail: [[0, 1.33, -0.86], [0, 1.08, -0.95], [0, 0.6, -0.93]] },
  grazing: { lift: 0, head: neckAndHead([[0, 1.06, 0.28], [0, 0.92, 0.62], [0, 0.72, 0.84]], [0, 0.6, 0.97], [0, 0.06, 1.17]), tail: [[0, 1.33, -0.86], [0, 1.08, -0.95], [0, 0.6, -0.93]] },
  lying: { lift: -0.56, head: neckAndHead([[0, 0.54, 0.28], [0, 0.62, 0.6], [0, 0.74, 0.8]], [0, 0.86, 0.92], [0, 0.5, 1.26]), tail: [[0, 0.76, -0.86], [0.04, 0.34, -0.97], [0.16, 0.06, -0.92]] },
};

/** A loft through the stations, each a ring across the way the line runs there, open at the first and closed past the last by a point. */
function lofted(stations: readonly HeadStation[], sides: number, beyond: number): { corners: V3[]; triangles: [number, number, number][] } {
  const unit = ([x, y, z]: V3): V3 => {
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
  };
  const along = (index: number): V3 => {
    const [from, to] = [stations[Math.max(0, index - 1)][0], stations[Math.min(stations.length - 1, index + 1)][0]];
    return unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  };
  const rings = stations.map(([middle, wide, deep, hang], index) => {
    const [, dy, dz] = along(index);
    // Across is +x, as every station lies in the cow's middle plane; up is across the way the line runs.
    const up: V3 = [0, dz, -dy];
    return Array.from({ length: sides }, (_, side): V3 => {
      const angle = (side / sides) * 2 * Math.PI;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const reach = cos * (deep + (cos < 0 ? hang : 0));
      return [middle[0] + sin * wide, middle[1] + up[1] * reach, middle[2] + up[2] * reach];
    });
  });
  const [last, way] = [stations[stations.length - 1][0], along(stations.length - 1)];
  return ringed(rings, [last[0] + way[0] * beyond, last[1] + way[1] * beyond, last[2] + way[2] * beyond]);
}

type BodyStation = (typeof BODY_STATIONS)[number];

/** A section of the body at its station, round from the spine: a narrow back, the barrel widest below its middle, a flat belly. */
function section([z, top, bottom, wide, back]: BodyStation, lift: number, spread: number): V3[] {
  const [high, low, middle] = [top + lift, bottom + lift, bottom + lift + (top - bottom) * 0.45];
  const right: V3[] = [[back, high - 0.07, z], [wide, middle, z], [wide * 0.78 + spread, low + 0.07, z]];
  const left = right.map(([x, y]): V3 => [-x, y, z]).reverse();
  return [[0, high, z], ...right, [0, low, z], ...left];
}

/** A leg as joints from the body down, a tube between each two, each in its own part. */
function leg(mesh: RuralMesh, joints: readonly V3[], radii: readonly number[], parts: readonly RuralPart[]): void {
  for (let bone = 0; bone < joints.length - 1; bone++) {
    mesh.tube(joints[bone], joints[bone + 1], radii[bone], 4, { radiusTo: radii[bone + 1], shadeFrom: 0.9, shadeTo: 0.8 }, parts[bone]);
  }
}

/**
 * A dairy cow 2.4 m from nose to tail and 1.4 m at the withers, its head to +z: an Ayrshire or a Holstein as the
 * material rolls per place, polled as Finnish herds are. Grazing has its muzzle in the grass; lying, its legs folded
 * under and its head up, chewing the cud.
 */
export function buildCow(pose: CowPose = "grazing"): RoadsideModel {
  const { lift, head, tail } = SHAPES[pose];
  const lying = pose === "lying";
  const near = new RuralMesh();
  const shadeAt = ([, y]: V3) => 0.8 + Math.min(1, Math.max(0, (y - lift - 0.6) / 0.8)) * 0.3;
  const stations = BODY_STATIONS.map((station) => section(station, lift, lying ? 0.07 : 0));
  const body = ringed(stations, [0, 1.02 + lift, 0.7]);
  near.solid(body.corners, body.triangles, "hide", shadeAt);
  near.face(stations[0], "hide", 0.88);

  const white: RuralPart = "hide-white";
  if (lying) {
    for (const side of [-1, 1]) leg(near, [[side * 0.17, 0.3, 0.34], [side * 0.17, 0.09, 0.6], [side * 0.11, 0.07, 0.4]], [0.12, 0.09, 0.07], ["hide", white]);
    // The hind legs fold to one side: the near one's hock out behind, its hoof forward along the belly.
    leg(near, [[0.22, 0.44, -0.46], [0.36, 0.11, -0.76], [0.42, 0.08, -0.4], [0.43, 0.07, -0.28]], [0.17, 0.09, 0.07, 0.07], ["hide", white, "hoof"]);
    leg(near, [[-0.22, 0.4, -0.5], [-0.33, 0.08, -0.72]], [0.12, 0.07], ["hide"]);
  } else {
    for (const side of [-1, 1]) {
      leg(near, [[side * 0.17, 0.95, 0.42], [side * 0.17, 0.46, 0.44], [side * 0.17, 0.11, 0.45], [side * 0.17, 0, 0.48]], [0.12, 0.075, 0.06, 0.075], ["hide", white, "hoof"]);
      leg(near, [[side * 0.19, 1.0, -0.5], [side * 0.19, 0.5, -0.74], [side * 0.18, 0.11, -0.67], [side * 0.18, 0, -0.65]], [0.16, 0.08, 0.06, 0.075], ["hide", white, "hoof"]);
    }
    // The udder between the hind legs, with its four teats.
    const udder = ringed([0.8, 0.6].map((y, ring) => Array.from({ length: 6 }, (_, side): V3 => {
      const angle = (side / 6) * 2 * Math.PI;
      return [Math.cos(angle) * (0.14 - ring * 0.02), y, -0.4 + Math.sin(angle) * (0.17 - ring * 0.02)];
    })), [0, 0.53, -0.4]);
    near.solid(udder.corners, udder.triangles, "udder", ([, y]) => 0.75 + (y - 0.5) * 0.6);
    for (const [x, z] of [[-0.06, -0.47], [0.06, -0.47], [-0.06, -0.33], [0.06, -0.33]] as const) near.spike([x, 0.58, z], [x, 0.46, z], 0.022, "udder", 0.85);
  }

  // The face stops where the muzzle starts, and its point lies inside the muzzle.
  const neck = lofted(head.slice(0, -1), 8, 0.02);
  near.solid(neck.corners, neck.triangles, "hide", (corner) => Math.max(0.9, shadeAt(corner)));
  // The muzzle a hair proud of the face it closes, so the two never fight.
  const muzzle = lofted(head.slice(-2).map(([middle, wide, deep, hang]): HeadStation => [middle, wide + 0.008, deep + 0.008, hang]), 8, 0.035);
  near.solid(muzzle.corners, muzzle.triangles, "muzzle", () => 0.95);
  // The ears stand out sideways from the poll.
  const [poll] = head[POLL];
  for (const side of [-1, 1]) near.spike([side * 0.08, poll[1], poll[2]], [side * 0.29, poll[1] - 0.05, poll[2] - 0.05], 0.05, "hide", 0.9);
  for (let bone = 0; bone < tail.length - 1; bone++) near.tube(tail[bone], tail[bone + 1], 0.045 - bone * 0.018, 3, { radiusTo: 0.03 - bone * 0.01 }, "hide");
  const tip = tail[tail.length - 1];
  const switchTo: V3 = lying ? [tip[0] + 0.2, tip[1], tip[2] + 0.12] : [tip[0], tip[1] - 0.3, tip[2] + 0.03];
  near.spike(tip, switchTo, 0.055, white, 0.85);

  // Far off: the body as a diamond, each pair of legs as two crossed quads, the neck and a spike of a head.
  const far = new RuralMesh();
  const diamond = ([z, top, bottom, wide]: BodyStation): V3[] => [[0, top + lift, z], [wide, (top + bottom) / 2 + lift - 0.05, z], [0, bottom + lift, z], [-wide, (top + bottom) / 2 + lift - 0.05, z]];
  const rings = [diamond(BODY_STATIONS[1]), diamond(BODY_STATIONS[3])].map((ring, index) => ring.map(([x, y]): V3 => [x, y, index === 0 ? -0.86 : 0.52]));
  const hull = ringed(rings, [0, 1.02 + lift, 0.7]);
  // A little darker than the near body's shade: the diamond's faces look up and down, where the near's sides face out.
  far.solid(hull.corners, hull.triangles, "hide", (corner) => shadeAt(corner) * FAR_BODY_SHADE);
  far.face(rings[0], "hide", 0.88);
  if (lying) {
    far.face([[0.2, 0.3, -0.45], [0.42, 0.04, -0.86], [0.45, 0.04, -0.2]], "hide", 0.85);
  } else {
    for (const [z, foot, wide] of [[0.44, 0.47, 0.22], [-0.62, -0.66, 0.24]] as const) {
      far.face([[0, 0, foot - 0.07], [0, 0, foot + 0.07], [0, 0.8, z + 0.08], [0, 0.8, z - 0.08]], white, 0.85);
      far.face([[-wide, 0, foot], [wide, 0, foot], [wide, 0.8, z], [-wide, 0.8, z]], white, 0.85);
    }
  }
  far.tube(head[0][0], head[POLL][0], 0.25, 3, { radiusTo: 0.15, shadeFrom: 0.95, shadeTo: 1 }, "hide");
  far.spike(head[POLL][0], head[head.length - 1][0], 0.13, "hide");
  return finished(near, far, COW_SWAP_M, COW_REACH_M);
}
