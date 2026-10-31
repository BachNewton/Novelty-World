import type { RoadsideModel } from "../roadside/index";
import { seeded, type V3 } from "../roadside/mesh";
import { finished, ringed, RuralMesh, type RuralPart } from "./mesh";

/* The working fields: bales, walls, a tractor and sheep. All in metres, standing on their origin. */

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
  return finished(near, bale(new RuralMesh(), 5, 0, "bale-wrap", "bale-wrap", null), 90, 620);
}

/** A round bale of plain hay, lying on its side, axis along x. */
export function buildHayBale(): RoadsideModel {
  return finished(bale(new RuralMesh(), BALE_SIDES, BALE_ROUND_M, "hay", "hay", "hay-end"), bale(new RuralMesh(), 5, 0, "hay", "hay", null), 90, 620);
}

/** A section of field-stone wall to knee height, running along +x. Lay one after another, and stretch or shear it to fit. */
export const STONE_WALL_M = 2.4;
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
  return finished(near, far, 130, 800);
}

export type SheepPose = "standing" | "grazing";
export type SheepCoat = "white" | "grey";

const FLEECE_STATIONS: [z: number, wide: number, tall: number, middle: number][] = [
  [-0.52, 0.14, 0.14, 0.6],
  [-0.4, 0.27, 0.27, 0.6],
  [-0.08, 0.31, 0.31, 0.6],
  [0.2, 0.3, 0.3, 0.62],
  [0.42, 0.2, 0.22, 0.66],
];
const FLEECE_SIDES = 7;

/** A sheep a metre long, its head to +z. Scale a lamb to 0.6. */
export function buildSheep(pose: SheepPose = "grazing", coat: SheepCoat = "white"): RoadsideModel {
  const part: RuralPart = coat === "white" ? "wool" : "wool-dark";
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
  for (const side of [-1, 1]) near.spike([side * 0.06, head[1] + 0.09, head[2] - 0.1], [side * 0.2, head[1] + 0.12, head[2] - 0.15], 0.03, "sheep-face");
  const far = new RuralMesh();
  far.tube([0, 0.6, -0.5], [0, 0.6, 0.42], 0.31, 4, { radiusTo: 0.24, cap: true }, part);
  far.face([[-0.16, 0, -0.3], [0.16, 0, -0.3], [0.16, 0.4, -0.3], [-0.16, 0.4, -0.3]], "sheep-face");
  far.face([[-0.16, 0, 0.28], [0.16, 0, 0.28], [0.16, 0.4, 0.28], [-0.16, 0.4, 0.28]], "sheep-face");
  far.face([[-0.08, head[1], head[2]], [0.08, head[1], head[2]], [0, neck[1], neck[2]]], "sheep-face");
  return finished(near, far, 60, 280);
}
