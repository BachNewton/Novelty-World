import { seeded, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { levelRing, Painted, streetModel, type StreetPart } from "./paint";

/*
 * Town furniture. Each stands on its origin; what's long runs along +x, and what has
 * a front, a bench's seat, a rack's open end, faces +z. Small and many, so it's gone
 * by 200 m, where it's a few pixels against a building.
 */

const SINK_M = 0.3;
const SWAP_M = 42;
const REACH_M = 200;

const BENCH_WIDE_M = 1.8;

/** A park bench: dark iron ends under wooden slats. Far off, a seat and a back. */
export function buildBench(): RoadsideModel {
  const half = BENCH_WIDE_M / 2;
  const near = new Painted();
  for (const x of [-half + 0.14, half - 0.14]) {
    near
      .beam([x, -SINK_M, 0.25], [x, 0.44, 0.22], 0.05, 0.05, "iron")
      .beam([x, -SINK_M, -0.2], [x, 0.84, -0.33], 0.05, 0.04, "iron")
      .beam([x, 0.42, 0.27], [x, 0.4, -0.24], 0.05, 0.04, "iron")
      .beam([x, 0.62, 0.22], [x, 0.63, -0.26], 0.05, 0.035, "iron", 1, 1.1);
  }
  for (let slat = 0; slat < 4; slat++) {
    const z = 0.24 - slat * 0.145;
    near.beam([-half, 0.455, z], [half, 0.455, z], 0.116, 0.03, "bench-wood", 0.8, 1.12);
  }
  for (let slat = 0; slat < 3; slat++) {
    const [y, z] = [0.56 + slat * 0.115, -0.235 - slat * 0.033];
    near.beam([-half, y, z], [half, y, z], 0.085, 0.03, "bench-wood", 0.92, 1.05);
  }
  const far = new Painted()
    .box([-half, -SINK_M, -0.25], [half, 0.47, 0.28], "bench-wood", { open: true, shade: 0.5, shadeTop: 1.1 })
    .face([[-half, 0.47, -0.25], [half, 0.47, -0.25], [half, 0.84, -0.34], [-half, 0.84, -0.34]], "bench-wood");
  return streetModel(near, far, SWAP_M, REACH_M);
}

/** A round steel litter bin on its post, with a hooded top. */
export function buildBin(): RoadsideModel {
  const [low, high, radius] = [0.34, 0.92, 0.2];
  const near = new Painted()
    .tube([0, -SINK_M, 0.24], [0, 0.98, 0.24], 0.035, 4, { cap: true }, "iron")
    .tube([0, low, 0], [0, high, 0], radius, 7, { radiusTo: radius * 1.05, shadeFrom: 0.8, shadeTo: 1.05 }, "park-green")
    .tube([0, high, 0], [0, high + 0.05, 0], radius * 1.09, 7, {}, "steel")
    .tube([0, high + 0.05, 0], [0, high + 0.17, 0], radius * 1.09, 7, { radiusTo: radius * 0.45, cap: true, shadeTo: 1.15 }, "park-green")
    .face(levelRing([0, low, 0], radius, 7), "iron", 0.6)
    .face([[-0.1, high - 0.02, radius + 0.022], [0.1, high - 0.02, radius + 0.022], [0.1, high - 0.13, radius + 0.022], [-0.1, high - 0.13, radius + 0.022]], "iron");
  const far = new Painted()
    .tube([0, low, 0], [0, high + 0.05, 0], radius, 3, {}, "park-green")
    .tube([0, high + 0.05, 0], [0, high + 0.17, 0], radius * 1.05, 3, { radiusTo: 0.05, cap: true, shadeTo: 1.15 }, "park-green")
    .tube([0, -SINK_M, 0.24], [0, low, 0.24], 0.04, 3, {}, "iron");
  return streetModel(near, far, SWAP_M, REACH_M);
}

const HOOP_BAY_M = 0.8;
const HOOPS = 4;
/** A bike rack, from its origin along +x. */
export const BIKE_RACK_M = HOOP_BAY_M * (HOOPS - 1);

/** A row of steel hoops, the kind a frame is locked to, on one foot rail. */
export function buildBikeRack(): RoadsideModel {
  const near = new Painted().beam([-0.1, 0.03, 0], [BIKE_RACK_M + 0.1, 0.03, 0], 0.06, 0.05, "steel", 0.8, 1);
  const [half, top, bend] = [0.4, 0.82, 0.12];
  const path: V3[] = [[0, -SINK_M, -half], [0, top - bend, -half], [0, top, -half + bend], [0, top, half - bend], [0, top - bend, half], [0, -SINK_M, half]];
  for (let hoop = 0; hoop < HOOPS; hoop++) {
    const x = hoop * HOOP_BAY_M;
    for (let piece = 0; piece + 1 < path.length; piece++) {
      const [from, to] = [path[piece], path[piece + 1]];
      near.tube([x + from[0], from[1], from[2]], [x + to[0], to[1], to[2]], 0.026, 3, {}, "steel");
    }
  }
  const far = new Painted();
  for (let hoop = 0; hoop < HOOPS; hoop++) {
    const x = hoop * HOOP_BAY_M;
    far.face([[x, -SINK_M, -half], [x, top, -half], [x, top, half], [x, -SINK_M, half], [x, -SINK_M, half - 0.05], [x, top - 0.05, half - 0.05], [x, top - 0.05, -half + 0.05], [x, -SINK_M, -half + 0.05]], "steel", 0.9);
  }
  return streetModel(near, far, SWAP_M, REACH_M);
}

const TABLE_TALL_M = 0.74;
const TABLE_RADIUS_M = 0.38;
const CAFE_SWAP_M = 36;
const CAFE_REACH_M = 170;

function table(into: Painted, sides: number): Painted {
  return into
    .face(levelRing([0, TABLE_TALL_M, 0], TABLE_RADIUS_M, sides), "cafe-top", 1.08)
    .tube([0, TABLE_TALL_M - 0.03, 0], [0, TABLE_TALL_M, 0], TABLE_RADIUS_M, sides, { shadeFrom: 0.7 }, "cafe-frame")
    .tube([0, 0.02, 0], [0, TABLE_TALL_M - 0.03, 0], 0.03, 4, {}, "cafe-frame")
    .tube([0, 0, 0], [0, 0.03, 0], 0.22, sides, { radiusTo: 0.05, cap: true }, "cafe-frame");
}

/** A bistro chair at `at`, facing the way `turn` says, its back away from the table. */
function chair(into: Painted, [cx, , cz]: V3, turn: number): Painted {
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const at = (x: number, y: number, z: number): V3 => [cx + x * cos + z * sin, y, cz + z * cos - x * sin];
  const [half, seat, back] = [0.2, 0.46, 0.84];
  into.face([at(-half, seat, -half), at(half, seat, -half), at(half * 0.9, seat, half), at(-half * 0.9, seat, half)], "cafe-frame", 1.3);
  for (const [x, z] of [[-1, 1], [1, 1]]) into.beam(at(x * half * 0.85, 0, z * half * 0.9), at(x * half * 0.85, seat, z * half * 0.85), 0.025, 0.025, "cafe-frame");
  for (const x of [-1, 1]) into.beam(at(x * half, 0, -half), at(x * half * 0.92, back, -half - 0.06), 0.025, 0.025, "cafe-frame");
  return into.face([at(-half * 0.92, back, -half - 0.06), at(half * 0.92, back, -half - 0.06), at(half * 0.97, back - 0.2, -half - 0.04), at(-half * 0.97, back - 0.2, -half - 0.04)], "cafe-frame", 1.15);
}

/** One table, on its own. */
export function buildCafeTable(): RoadsideModel {
  const far = new Painted().face(levelRing([0, TABLE_TALL_M, 0], TABLE_RADIUS_M, 5), "cafe-top").tube([0, 0, 0], [0, TABLE_TALL_M, 0], 0.05, 3, {}, "cafe-frame");
  return streetModel(table(new Painted(), 10), far, CAFE_SWAP_M, CAFE_REACH_M);
}

/** One chair facing +z, on its own, for a terrace set out by hand. */
export function buildCafeChair(): RoadsideModel {
  const far = new Painted()
    .face([[-0.2, 0.46, -0.2], [0.2, 0.46, -0.2], [0.2, 0.46, 0.2], [-0.2, 0.46, 0.2]], "cafe-frame", 1.2)
    .face([[-0.2, 0, -0.22], [0.2, 0, -0.22], [0.18, 0.84, -0.26], [-0.18, 0.84, -0.26]], "cafe-frame");
  return streetModel(chair(new Painted(), [0, 0, 0], 0), far, CAFE_SWAP_M, CAFE_REACH_M);
}

/** A table with two chairs, as one model: what a terrace is mostly made of, in one instance. */
export function buildCafeSet(): RoadsideModel {
  const near = table(new Painted(), 8);
  chair(near, [0, 0, 0.62], Math.PI);
  chair(near, [0, 0, -0.62], 0);
  const far = new Painted()
    .face(levelRing([0, TABLE_TALL_M, 0], TABLE_RADIUS_M, 5), "cafe-top")
    .tube([0, 0, 0], [0, TABLE_TALL_M, 0], 0.05, 3, {}, "cafe-frame");
  for (const side of [-1, 1]) {
    const z = side * 0.82;
    far.face([[-0.2, 0, z], [0.2, 0, z], [0.18, 0.84, z], [-0.18, 0.84, z]], "cafe-frame").face([[-0.2, 0.46, z], [0.2, 0.46, z], [0.2, 0.46, z - side * 0.4], [-0.2, 0.46, z - side * 0.4]], "cafe-frame", 1.2);
  }
  return streetModel(near, far, CAFE_SWAP_M, CAFE_REACH_M);
}

const PARASOL_SIDES = 8;

/** A square-ish market parasol with a valance, in cream and the red of the town. */
export function buildParasol(): RoadsideModel {
  const [tall, rim, radius] = [2.75, 2.15, 1.5];
  const edge = levelRing([0, rim, 0], radius, PARASOL_SIDES);
  const top: V3 = [0, tall, 0];
  const near = new Painted().tube([0, -SINK_M, 0], [0, tall + 0.1, 0], 0.024, 4, { cap: true }, "steel");
  edge.forEach((corner, index) => {
    const next = edge[(index + 1) % PARASOL_SIDES];
    near
      .face([corner, next, top], index % 2 === 0 ? "canvas" : "canvas-trim", 1.08)
      .face([corner, next, [next[0], rim - 0.14, next[2]], [corner[0], rim - 0.14, corner[2]]], index % 2 === 0 ? "canvas-trim" : "canvas", 0.92)
      .spike([0, rim - 0.5, 0], corner, 0.012, "steel", 0.8);
  });
  const far = new Painted().tube([0, -SINK_M, 0], [0, rim, 0], 0.05, 3, {}, "steel");
  edge.forEach((corner, index) => {
    if (index % 2 === 0) far.face([corner, edge[(index + 2) % PARASOL_SIDES], top], "canvas", 1.05);
  });
  far.face([edge[0], edge[2], edge[4], edge[6]], "canvas", 1.05);
  return streetModel(near, far, CAFE_SWAP_M, CAFE_REACH_M);
}

const PLANTER_BLOOMS = 9;

/** A little rounded mound of leaves and flowers, for the top of a planter. */
function planting(into: Painted, random: () => number, [x, y, z]: V3, wide: number, tall: number, flower: StreetPart): Painted {
  const rim = levelRing([x, y, z], wide, 6, random());
  const crown = levelRing([x, y + tall * 0.7, z], wide * 0.68, 6, random() + 0.5);
  const peak: V3 = [x, y + tall, z];
  rim.forEach((corner, index) => {
    const next = (index + 1) % 6;
    into.face([corner, rim[next], crown[next], crown[index]], index % 2 === 0 ? "leaf" : "leaf-under", 0.95);
    into.face([crown[index], crown[next], peak], index % 2 === 0 ? "leaf-lit" : "leaf", 1.08);
  });
  // Blooms sit out on the mound's surface, each a little star of two crossed petals.
  for (let bloom = 0; bloom < PLANTER_BLOOMS; bloom++) {
    const angle = bloom * 2.4 + random();
    const up = 0.15 + (bloom / PLANTER_BLOOMS) * 0.8;
    const out = wide * (1.04 - up * 0.72);
    const [bx, by, bz] = [x + Math.cos(angle) * out, y + tall * up + 0.02, z + Math.sin(angle) * out];
    into
      .face([[bx - 0.06, by, bz], [bx, by + 0.035, bz + 0.02], [bx + 0.06, by, bz], [bx, by - 0.035, bz - 0.02]], flower, 1.1)
      .face([[bx, by, bz - 0.06], [bx + 0.02, by + 0.035, bz], [bx, by, bz + 0.06], [bx - 0.02, by - 0.035, bz]], flower, 1);
  }
  return into;
}

/** A boarded square planter, flowers in it. */
export function buildPlanter(seed = 2): RoadsideModel {
  const random = seeded(seed);
  const [half, low, high] = [0.42, 0.06, 0.62];
  const near = new Painted()
    .box([-half, low, -half], [half, high, half], "planter-wood", { shade: 0.95, open: true })
    .box([-half - 0.03, high - 0.03, -half - 0.03], [half + 0.03, high + 0.01, half + 0.03], "planter-wood", { shadeTop: 1.1 })
    .box([-half + 0.03, -SINK_M, -half + 0.03], [half - 0.03, low, half - 0.03], "iron", { open: true, shade: 0.7 });
  for (const y of [0.25, 0.44]) for (const side of [-1, 1]) near.face([[-half, y, side * (half + 0.003)], [half, y, side * (half + 0.003)], [half, y + 0.012, side * (half + 0.003)], [-half, y + 0.012, side * (half + 0.003)]], "iron");
  planting(near, random, [0, high, 0], half * 0.92, 0.42, "petal-fireweed");
  const far = new Painted()
    .box([-half, -SINK_M, -half], [half, high, half], "planter-wood", { open: true, shade: 0.9 })
    .tube([0, high, 0], [0, high + 0.4, 0], half * 0.9, 4, { radiusTo: 0.08, cap: true, shadeFrom: 0.9, shadeTo: 1.1 }, "leaf");
  return streetModel(near, far, SWAP_M, REACH_M);
}

/** A round concrete bowl, the heavier planter of a square or a traffic calming. */
export function buildPlanterRound(seed = 6): RoadsideModel {
  const random = seeded(seed);
  const [radius, tall] = [0.55, 0.5];
  const near = new Painted()
    .tube([0, -SINK_M, 0], [0, tall, 0], radius * 0.8, 8, { radiusTo: radius, shadeFrom: 0.8 }, "concrete")
    .tube([0, tall, 0], [0, tall + 0.04, 0], radius, 8, { radiusTo: radius * 0.94, shadeFrom: 1.08 }, "concrete")
    .face(levelRing([0, tall + 0.03, 0], radius * 0.94, 8), "soil");
  planting(near, random, [0, tall + 0.02, 0], radius * 0.8, 0.46, "petal-yellow");
  const far = new Painted()
    .tube([0, -SINK_M, 0], [0, tall, 0], radius * 0.8, 4, { radiusTo: radius }, "concrete")
    .tube([0, tall, 0], [0, tall + 0.42, 0], radius * 0.85, 4, { radiusTo: 0.08, cap: true, shadeTo: 1.1 }, "leaf");
  return streetModel(near, far, SWAP_M, REACH_M);
}
