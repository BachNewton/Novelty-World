import type { BufferGeometry } from "three/webgpu";
import { Model, type Part, type V3 } from "./mesh";

/*
 * The small objects along a road. Each stands on its origin with y up. Things in
 * a run (fences, wires) run along +x; things that face the road, a lamp's arm, a
 * sign, a mailbox's door, a shelter's open side, face +z. Everything goes this
 * far under its origin, so a slope can't show a gap under it.
 */
const SINK_M = 0.5;

/** An object's geometry and how far each version shows. Past `swapM` it's `far`, past `reachM` nothing. */
export interface RoadsideModel {
  near: BufferGeometry;
  far: BufferGeometry | null;
  swapM: number;
  reachM: number;
}

const model = (near: Model, far: Model | null, swapM: number, reachM: number): RoadsideModel => ({ near: near.build(), far: far?.build() ?? null, swapM, reachM });

/** A galvanised road lamp, its arm reaching out over the road. */
export function buildStreetLamp(): RoadsideModel {
  const height = 9;
  const near = new Model()
    .tube([0, -SINK_M, 0], [0, 0.8, 0], 0.11, 6, { radiusTo: 0.095 }, "galvanised")
    .tube([0, 0.8, 0], [0, height - 0.6, 0], 0.085, 6, { radiusTo: 0.05 }, "galvanised")
    .tube([0, height - 0.6, 0], [0, height - 0.05, 0.3], 0.05, 4, { radiusTo: 0.042 }, "galvanised")
    .tube([0, height - 0.05, 0.3], [0, height + 0.14, 1.45], 0.042, 4, { radiusTo: 0.035 }, "galvanised");
  const [y, z] = [height + 0.14, 1.45];
  near
    .face([[-0.13, y, z], [0.13, y, z], [0.1, y + 0.02, z + 0.62], [-0.1, y + 0.02, z + 0.62]], "galvanised", 1.05)
    .face([[0.13, y - 0.09, z], [-0.13, y - 0.09, z], [-0.1, y - 0.03, z + 0.62], [0.1, y - 0.03, z + 0.62]], "lens")
    .face([[-0.13, y - 0.09, z], [-0.13, y, z], [-0.1, y + 0.02, z + 0.62], [-0.1, y - 0.03, z + 0.62]], "galvanised", 0.9)
    .face([[0.13, y, z], [0.13, y - 0.09, z], [0.1, y - 0.03, z + 0.62], [0.1, y + 0.02, z + 0.62]], "galvanised", 0.9)
    .face([[-0.1, y + 0.02, z + 0.62], [0.1, y + 0.02, z + 0.62], [0.1, y - 0.03, z + 0.62], [-0.1, y - 0.03, z + 0.62]], "galvanised", 0.9);
  const far = new Model()
    .tube([0, -SINK_M, 0], [0, height, 0], 0.11, 3, { radiusTo: 0.08 }, "galvanised")
    .tube([0, height, 0], [0, height + 0.14, 2.05], 0.09, 3, {}, "galvanised");
  return model(near, far, 110, 650);
}

/** Where a wire meets a power pole: across the line, and above the ground. */
export const POLE_CONDUCTORS = [
  { across: -1.05, up: 9.74 },
  { across: 0, up: 10.26 },
  { across: 1.05, up: 9.74 },
] as const;

/** A tarred wooden pole with a crossarm across the line, three insulators and two braces. */
export function buildPowerPole(): RoadsideModel {
  const top = 10;
  const arm = 9.42;
  const near = new Model()
    .tube([0, -SINK_M, 0], [0, 2.2, 0], 0.145, 5, { radiusTo: 0.125, shadeFrom: 0.8, shadeTo: 0.9 }, "pole-wood")
    .tube([0, 2.2, 0], [0, top, 0], 0.125, 5, { radiusTo: 0.09, cap: true, shadeFrom: 0.9, shadeTo: 1.1 }, "pole-wood")
    .beam([0, arm, -1.25], [0, arm, 1.25], 0.1, 0.12, "pole-wood", 0.95, 1.1)
    .beam([0.02, arm - 0.72, 0], [0.02, arm - 0.04, 0.82], 0.05, 0.03, "steel-band")
    .beam([0.02, arm - 0.72, 0], [0.02, arm - 0.04, -0.82], 0.05, 0.03, "steel-band");
  for (const { across, up } of POLE_CONDUCTORS) {
    const base: V3 = [0, across === 0 ? top - 0.02 : arm + 0.06, across];
    near.tube(base, [0, up + 0.02, across], 0.055, 4, { radiusTo: 0.03, cap: true }, "porcelain");
  }
  const far = new Model()
    .tube([0, -SINK_M, 0], [0, top, 0], 0.2, 3, { radiusTo: 0.13 }, "pole-wood")
    .face([[0, arm - 0.1, -1.25], [0, arm - 0.1, 1.25], [0, arm + 0.1, 1.25], [0, arm + 0.1, -1.25]], "pole-wood");
  return model(near, far, 130, 1000);
}

/** How far wires hang below the straight line at mid-span, per metre of span. */
export const WIRE_SAG_SHARE = 0.018;
const WIRE_SEGMENTS = 6;

/**
 * One span of the three conductors, as a unit the wire material shapes: x runs 0 to
 * 1 along the span, y is the side of the ribbon, and z numbers the conductor.
 */
export function buildWireSpan(): RoadsideModel {
  const wires = new Model();
  POLE_CONDUCTORS.forEach((_, conductor) => {
    for (let step = 0; step < WIRE_SEGMENTS; step++) {
      const [from, to] = [step / WIRE_SEGMENTS, (step + 1) / WIRE_SEGMENTS];
      wires.face([[from, -1, conductor], [to, -1, conductor], [to, 1, conductor], [from, 1, conductor]], "steel-band");
    }
  });
  return model(wires, null, 1000, 1000);
}

const SIGN_POST_TOP_M = 3;
/** The usual height of a single plate's middle, and how far in front of the post's axis a plate sits. */
export const SIGN_PLATE_Y_M = 2.25;
export const SIGN_PLATE_Z_M = 0.05;

/** A plain galvanised sign post, for any plates. */
export function buildSignPost(): RoadsideModel {
  const near = new Model().tube([0, -SINK_M, 0], [0, SIGN_POST_TOP_M, 0], 0.03, 5, { cap: true }, "galvanised");
  return model(near, null, 220, 220);
}

export type SignShape = "round" | "triangle" | "diamond" | "square" | "wide";

const ROUND_SIDES = 10;
const SIGN_OUTLINES: Record<SignShape, readonly (readonly [x: number, y: number])[]> = {
  round: Array.from({ length: ROUND_SIDES }, (_, side) => {
    const angle = (side / ROUND_SIDES) * 2 * Math.PI;
    return [Math.sin(angle) * 0.5, Math.cos(angle) * 0.5] as const;
  }),
  triangle: [[0, 0.46], [-0.5, -0.41], [0.5, -0.41]],
  diamond: [[0, 0.5], [-0.5, 0], [0, -0.5], [0.5, 0]],
  square: [[-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5]],
  wide: [[-0.5, 0.25], [-0.5, -0.25], [0.5, -0.25], [0.5, 0.25]],
};

/**
 * A plate in its real shape, its origin at its middle, `sizeM` across. The front's
 * uv runs 0 to 1 over the plate's bounding square (v up), for a cell of the sign
 * sheet; the back is plain metal.
 */
export function buildSignPlate(shape: SignShape, sizeM: number): RoadsideModel {
  const outline = SIGN_OUTLINES[shape];
  const corners = outline.map(([x, y]): V3 => [x * sizeM, y * sizeM, 0]);
  const near = new Model()
    .face(corners, "sign-face", 1, outline.map(([x, y]) => [x + 0.5, y + 0.5] as const))
    .face([...corners].reverse().map(([x, y]): V3 => [x, y, -0.006]), "sign-back");
  return model(near, null, 220, 220);
}

const FENCE_LOW_M = 0.08;

/** A section of a farm's roundpole fence, the leaning rails of a gärdsgård off a pair of stakes. Stretch it to fit a run. */
export const FARM_FENCE_M = 2.4;
const FARM_RAILS = 7;
const FARM_TALL_M = 1.15;

function stakes(into: Model): Model {
  for (const side of [-0.09, 0.09]) into.tube([0, -SINK_M, side], [0, FARM_TALL_M + 0.22, side], 0.045, 3, { radiusTo: 0.035 }, "post-wood");
  return into;
}

export function buildFarmFence(): RoadsideModel {
  const near = stakes(new Model());
  const lean = 1.75;
  for (let rail = 0; rail < FARM_RAILS; rail++) {
    const start = (rail / FARM_RAILS) * FARM_FENCE_M - 0.6;
    const side = rail % 2 === 0 ? -0.03 : 0.03;
    near.tube([start, FENCE_LOW_M, side], [start + lean, FARM_TALL_M, side], 0.042, 3, { shadeFrom: rail % 2 === 0 ? 1 : 0.86 }, "fence-wood");
  }
  // Two bands with the field showing between, so far off it's still a fence and not a wall.
  const far = new Model();
  for (const [low, high] of [[0.2, 0.5], [0.72, 1.08]]) far.face([[0, low, 0], [FARM_FENCE_M, low, 0], [FARM_FENCE_M, high, 0], [0, high, 0]], "fence-wood", 0.8);
  return model(near, far, 90, 240);
}

/** The stakes alone, to finish a run. */
export function buildFarmFencePost(): RoadsideModel {
  return model(stakes(new Model()), null, 60, 60);
}

/** A section of a town's low white picket fence. Stretch it to fit a run. */
export const TOWN_FENCE_M = 2;
const PICKETS = 8;
const PICKET_WIDE_M = 0.09;
const PICKET_TALL_M = 0.92;

function townPost(into: Model): Model {
  return into.box([-0.05, -SINK_M, -0.05], [0.05, 1.04, 0.05], "fence-white", { open: true, shadeTop: 1.05 });
}

export function buildTownFence(): RoadsideModel {
  const near = townPost(new Model());
  for (const y of [0.3, 0.72]) near.beam([0.05, y, -0.03], [TOWN_FENCE_M - 0.05, y, -0.03], 0.03, 0.08, "fence-white", 0.92);
  for (let picket = 0; picket < PICKETS; picket++) {
    const x = ((picket + 0.5) / PICKETS) * TOWN_FENCE_M;
    const half = PICKET_WIDE_M / 2;
    const shoulder = PICKET_TALL_M - half;
    near.face([[x - half, 0.1, 0], [x + half, 0.1, 0], [x + half, shoulder, 0], [x, PICKET_TALL_M, 0], [x - half, shoulder, 0]], "fence-white");
  }
  const far = new Model().face([[0, 0.12, 0], [TOWN_FENCE_M, 0.12, 0], [TOWN_FENCE_M, 0.88, 0], [0, 0.88, 0]], "fence-white", 0.85);
  return model(near, far, 70, 200);
}

export function buildTownFencePost(): RoadsideModel {
  return model(townPost(new Model()), null, 50, 50);
}

/** A red rural mailbox with a round lid, on a wooden post, its door to the road. */
export function buildMailbox(): RoadsideModel {
  const [wide, deep, floor, wall] = [0.15, 0.24, 1.12, 0.25];
  const arch: [number, number][] = [[-wide, 0], [-wide, wall], [-wide * 0.7, wall + 0.05], [0, wall + 0.075], [wide * 0.7, wall + 0.05], [wide, wall], [wide, 0]];
  const near = new Model()
    .box([-0.04, -SINK_M, -0.04], [0.04, floor - 0.04, 0.04], "post-wood", { open: true, shade: 0.95 })
    .box([-0.12, floor - 0.04, -deep * 0.9], [0.12, floor, deep * 0.9], "post-wood", { shade: 0.85 });
  for (let side = 0; side < arch.length - 1; side++) {
    const [ax, ay] = arch[side];
    const [bx, by] = arch[side + 1];
    near.face([[ax, floor + ay, deep], [bx, floor + by, deep], [bx, floor + by, -deep], [ax, floor + ay, -deep]], "mailbox-red", ax === bx ? 0.9 : 1.12);
  }
  near
    .face([...arch].reverse().map(([x, y]): V3 => [x, floor + y, deep]), "mailbox-red", 0.92)
    .face(arch.map(([x, y]): V3 => [x, floor + y, -deep]), "mailbox-red", 0.92)
    .face([[-wide, floor, deep], [wide, floor, deep], [wide, floor, -deep], [-wide, floor, -deep]], "mailbox-red", 0.6)
    .face([[-0.08, floor + 0.13, deep + 0.004], [0.08, floor + 0.13, deep + 0.004], [0.08, floor + 0.2, deep + 0.004], [-0.08, floor + 0.2, deep + 0.004]], "fence-white");
  return model(near, null, 170, 170);
}

/** A rural bus shelter: red boards and white trim like the houses, open to the road, with a bench. */
export function buildBusShelter(): RoadsideModel {
  const [wide, deep, front, back] = [1.6, 0.8, 2.5, 2.2];
  const near = new Model();
  const wall = (corners: V3[], part: Part) => near.face(corners, part).face([...corners].reverse(), "shelter-inside", 0.85);
  const heightAt = (z: number) => back + ((z + deep) / (2 * deep)) * (front - back);
  const low = 0.08;
  const sideEnd = deep * 0.15;
  wall([[wide, low, -deep], [-wide, low, -deep], [-wide, back, -deep], [wide, back, -deep]], "shelter-red");
  for (const x of [-wide, wide]) {
    wall([[x, low, -deep], [x, low, sideEnd], [x, heightAt(sideEnd), sideEnd], [x, back, -deep]], "shelter-red");
    near.box([x - 0.06, -SINK_M, deep - 0.12], [x + 0.06, front, deep], "shelter-trim", { open: true });
    near.box([x - 0.06, -SINK_M, -deep - 0.06], [x + 0.06, back, -deep + 0.06], "shelter-trim", { open: true });
    near.box([x - 0.05, 0, sideEnd - 0.06], [x + 0.05, heightAt(sideEnd), sideEnd + 0.06], "shelter-trim", { open: true, shade: 0.95 });
  }
  const [eaves, roofDeep] = [0.22, 0.14];
  const [xOut, zOut] = [wide + eaves, deep + eaves];
  const [frontTop, backTop] = [heightAt(zOut) + 0.05, heightAt(-zOut) + 0.05];
  near
    .face([[-xOut, frontTop, zOut], [xOut, frontTop, zOut], [xOut, backTop, -zOut], [-xOut, backTop, -zOut]], "shelter-roof")
    .face([[xOut, frontTop - roofDeep, zOut], [-xOut, frontTop - roofDeep, zOut], [-xOut, backTop - roofDeep, -zOut], [xOut, backTop - roofDeep, -zOut]], "shelter-inside", 0.7)
    .face([[-xOut, frontTop - roofDeep, zOut], [xOut, frontTop - roofDeep, zOut], [xOut, frontTop, zOut], [-xOut, frontTop, zOut]], "shelter-trim")
    .box([-wide + 0.1, 0.42, -deep + 0.05], [wide - 0.1, 0.47, -deep + 0.5], "post-wood", { shadeTop: 1.1 });
  for (const x of [-1.1, 1.1]) near.box([x - 0.04, -SINK_M, -deep + 0.2], [x + 0.04, 0.42, -deep + 0.28], "post-wood", { open: true, shade: 0.8 });
  const far = new Model()
    .box([-wide, -SINK_M, -deep], [wide, back, sideEnd], "shelter-red", { open: true, shade: 0.8 })
    .face([[-xOut, frontTop, zOut], [xOut, frontTop, zOut], [xOut, backTop, -zOut], [-xOut, backTop, -zOut]], "shelter-roof");
  return model(near, far, 130, 700);
}
