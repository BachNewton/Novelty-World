import type { V3 } from "../roadside/mesh";
import { seeded } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { farShed, Marked, marinaModel, TAU, type GableShed, type MarinaPart } from "./paint";

/*
 * A traditional boatyard in the manner of Mariehamn's Sjökvarteret: a wooden hull
 * being built, the yard's timber and fires, its smithy and ropewalk, and the row of
 * weathered sheds on piles by the water.
 */

const SHED_SWAP_M = 150;
const SHED_REACH_M = 1100;

const HULL_LONG_M = 17;
const HULL_BEAM_M = 2.5;
const HULL_DEPTH_M = 2.6;
const KEEL_Y_M = 0.95;
const FRAMES = 13;
const SECTION_POINTS = 5;
/** The strakes' share of the depth laid so far, amidships and aft. */
const PLANKED_ROWS = 2;
const PLANKED_FROM = 0;
const PLANKED_TO = 0.68;

/** A wooden double-ender's section: where a point up the frame lies, at `along` from sternpost (0) to stem (1). */
function hullPoint(along: number, up: number, side: number): V3 {
  const x = (along - 0.5) * HULL_LONG_M;
  const fullness = Math.sin(Math.PI * Math.min(1, Math.max(0, along * 0.96 + 0.02))) ** 0.62;
  const rise = 0.4 * Math.abs(2 * along - 1) ** 3.5;
  const sheer = 0.35 * (2 * along - 1) ** 2 + (along > 0.5 ? 0.15 * (2 * along - 1) ** 2 : 0);
  const y = KEEL_Y_M + rise * HULL_DEPTH_M * (1 - up) + up * (HULL_DEPTH_M + sheer);
  const z = side * HULL_BEAM_M * fullness * up ** 0.5 * (1.04 - 0.1 * up);
  return [x, y, z];
}

/** The curved stem or sternpost, up from the keel. */
function post(into: Marked, along: number, rake: number, part: MarinaPart): Marked {
  const end = Math.sign(along - 0.5) * HULL_LONG_M * 0.5;
  const points: V3[] = [[end * 0.9, KEEL_Y_M, 0], [end * 1, KEEL_Y_M + 0.8, 0], [end * 1.03 + rake * 0.3, KEEL_Y_M + 1.9, 0], [end * 1.05 + rake, KEEL_Y_M + HULL_DEPTH_M + 0.9, 0]];
  for (let point = 0; point + 1 < points.length; point++) into.beam(points[point], points[point + 1], 0.18, 0.26, part);
  return into;
}

/** A wooden hull of 17 m on the stocks: keel on its blocks, stem and sternpost up, frames in place, the first strakes on from the stern, shored each side, and a staging plank. Bow along +x. */
export function buildHullOnStocks(): RoadsideModel {
  const near = new Marked();
  near.beam([-HULL_LONG_M * 0.46, KEEL_Y_M, 0], [HULL_LONG_M * 0.46, KEEL_Y_M, 0], 0.22, 0.3, "new-timber-dark");
  post(near, 1, 0.5, "new-timber-dark");
  post(near, 0, -0.35, "new-timber-dark");
  // Keel blocks.
  for (let block = 0; block < 5; block++) {
    const x = -HULL_LONG_M * 0.42 + (block / 4) * HULL_LONG_M * 0.84;
    near.box([x - 0.3, 0, -0.45], [x + 0.3, 0.3, 0.45], "plank-tarred", { open: true, shadeTop: 1.1 });
    near.box([x - 0.22, 0.3, -0.26], [x + 0.22, KEEL_Y_M - 0.14, 0.26], "oak", { open: true });
  }
  // Frames, each a chain from keel to sheer.
  for (let frame = 0; frame < FRAMES; frame++) {
    const along = 0.1 + (frame / (FRAMES - 1)) * 0.8;
    for (const side of [-1, 1]) {
      for (let point = 0; point + 1 < SECTION_POINTS; point++) {
        const [up, upNext] = [point / (SECTION_POINTS - 1), (point + 1) / (SECTION_POINTS - 1)];
        near.beam(hullPoint(along, Math.max(up, 0.02), side), hullPoint(along, upNext, side), 0.13, 0.15, "new-timber", side > 0 ? 1 : 0.88);
      }
    }
    // Floor timbers and a cross spall holding the frame's head to shape.
    near.beam(hullPoint(along, 1, -1), hullPoint(along, 1, 1), 0.07, 0.1, "stickers");
  }
  // A ribband round the frame heads.
  for (const side of [-1, 1]) {
    for (let frame = 0; frame + 1 < 6; frame++) {
      near.beam(hullPoint(0.04 + (frame / 5) * 0.92, 0.98, side), hullPoint(0.04 + ((frame + 1) / 5) * 0.92, 0.98, side), 0.05, 0.1, "new-timber-end");
      near.beam(hullPoint(0.04 + (frame / 5) * 0.92, 0.55, side), hullPoint(0.04 + ((frame + 1) / 5) * 0.92, 0.55, side), 0.04, 0.08, "new-timber-end");
    }
  }
  // Strakes from the garboard up, and stern-first along.
  const strakes = 6;
  for (let row = 0; row < PLANKED_ROWS * 2; row++) {
    const [low, high] = [(row / (PLANKED_ROWS * 2)) * 0.34 + 0.01, ((row + 1) / (PLANKED_ROWS * 2)) * 0.34 + 0.01];
    for (let bay = 0; bay < strakes; bay++) {
      const [a, b] = [PLANKED_FROM + 0.03 + (bay / strakes) * (PLANKED_TO - row * 0.05), PLANKED_FROM + 0.03 + ((bay + 1) / strakes) * (PLANKED_TO - row * 0.05)];
      for (const side of [-1, 1]) near.face([hullPoint(a, low, side), hullPoint(b, low, side), hullPoint(b, high, side), hullPoint(a, high, side)], row % 2 === 0 ? "plank" : "new-timber", (side > 0 ? 1 : 0.86) * (0.96 + (((row + bay) * 3) % 5) * 0.015));
    }
  }
  // Shores from the ground to the bilge.
  for (const along of [0.22, 0.42, 0.62, 0.8]) {
    for (const side of [-1, 1]) {
      const [x, y, z] = hullPoint(along, 0.5, side);
      near.beam([x + 0.3, 0, z + side * 1.5], [x, y, z + side * 0.05], 0.12, 0.12, "stickers");
    }
  }
  // Staging down one side, on two trestles.
  for (const x of [-4, 4]) {
    for (const z of [3.1, 3.9]) near.beam([x, 0, z], [x, 1.5, z], 0.08, 0.08, "stickers");
    near.beam([x, 1.5, 3], [x, 1.5, 4], 0.08, 0.1, "stickers");
  }
  near.box([-6, 1.55, 3.25], [6, 1.6, 3.75], "new-timber-end", { open: true, shadeTop: 1.05 });
  near.beam([1, 1.6, 3.4], [2.6, 1.6, 3.7], 0.25, 0.03, "plank");
  const far = new Marked();
  for (let bay = 0; bay < 4; bay++) {
    const [a, b] = [0.02 + (bay / 4) * 0.96, 0.02 + ((bay + 1) / 4) * 0.96];
    for (const side of [-1, 1]) {
      far.face([hullPoint(a, 0.02, side), hullPoint(b, 0.02, side), hullPoint(b, 0.4, side), hullPoint(a, 0.4, side)], "plank", side > 0 ? 1 : 0.86);
      far.face([hullPoint(a, 0.4, side), hullPoint(b, 0.4, side), hullPoint(b, 1, side), hullPoint(a, 1, side)], "new-timber-dark", side > 0 ? 0.85 : 0.72);
    }
  }
  post(far, 1, 0.5, "new-timber-dark");
  post(far, 0, -0.35, "new-timber-dark");
  far.beam([-HULL_LONG_M * 0.42, 0.5, 0], [HULL_LONG_M * 0.42, 0.5, 0], 0.5, 0.9, "plank-tarred");
  return marinaModel(near, far, 130, 900);
}

export type TimberKind = "sawn" | "logs";

/** The yard's seasoning timber: `sawn` planks in layers with stickers between them; `logs` a stack of barked pine on bearers. Lengths along +x. */
export function buildTimberStack(kind: TimberKind): RoadsideModel {
  const near = new Marked();
  const long = 6;
  for (const x of [-2.4, 0, 2.4]) near.box([x - 0.08, 0, -0.75], [x + 0.08, 0.14, 0.75], "plank-tarred", { open: true });
  if (kind === "sawn") {
    for (let layer = 0; layer < 5; layer++) {
      const y = 0.14 + layer * 0.14;
      near.box([-long / 2 + (layer % 2) * 0.1, y, -0.65], [long / 2 - (layer % 3) * 0.08, y + 0.1, 0.65], layer % 2 === 0 ? "new-timber" : "new-timber-dark", { open: true, shade: 0.95, shadeTop: 1.05 });
      if (layer < 4) near.face([[-long / 2 + 0.2, y + 0.1, 0.655], [long / 2 - 0.2, y + 0.1, 0.655], [long / 2 - 0.2, y + 0.14, 0.655], [-long / 2 + 0.2, y + 0.14, 0.655]], "roof-under");
    }
    near.face([[-long / 2 - 0.1, 0.9, -0.75], [long / 2 + 0.1, 0.9, -0.75], [long / 2 + 0.1, 0.9, 0.75], [-long / 2 - 0.1, 0.9, 0.75]], "roof-tin", 1.05);
    const far = new Marked().box([-long / 2, 0, -0.7], [long / 2, 0.9, 0.7], "new-timber", { open: true, shadeTop: 1.05 });
    return marinaModel(near, far, 60, 420);
  }
  const rows = [[-0.6, -0.2, 0.2, 0.6], [-0.4, 0, 0.4], [-0.2, 0.2]];
  rows.forEach((row, level) => {
    for (const z of row) {
      near.tube([-long / 2, 0.34 + level * 0.34, z], [long / 2, 0.34 + level * 0.34, z], 0.19, 5, { radiusTo: 0.15 }, "oak");
      near.face(Array.from({ length: 5 }, (_, side): V3 => [long / 2 + 0.002, 0.34 + level * 0.34 + Math.sin((side / 5) * TAU) * 0.15, z + Math.cos((side / 5) * TAU) * 0.15]), "new-timber-end");
    }
  });
  const far = new Marked().box([-long / 2, 0, -0.75], [long / 2, 1.2, 0.75], "oak", { open: true, shadeTop: 1.05 });
  return marinaModel(near, far, 60, 420);
}

/** A boatbuilder's steam box: a long plank box on trestles, a door at the end where the strakes go in, a kettle on a fire feeding it by a pipe. Box along +x. */
export function buildSteamBox(): RoadsideModel {
  const near = new Marked().box([-2.5, 0.9, -0.22], [2.5, 1.35, 0.22], "new-timber-dark", { shadeTop: 1.06 });
  for (const x of [-2.2, 0, 2.2]) {
    for (const z of [-0.4, 0.4]) near.beam([x, 0, z], [x, 0.9, z * 0.5], 0.07, 0.07, "stickers");
    near.beam([x, 1.38, -0.28], [x, 1.38, 0.28], 0.06, 0.05, "iron");
    near.beam([x, 0.82, -0.3], [x, 0.82, 0.3], 0.06, 0.08, "stickers");
  }
  // The door, hanging open by the box's end, and rags to seal it.
  near.face([[2.5, 0.9, 0.22], [2.75, 0.9, 0.45], [2.75, 1.35, 0.45], [2.5, 1.35, 0.22]], "plank");
  near.face([[2.502, 0.95, -0.17], [2.502, 0.95, 0.17], [2.502, 1.3, 0.17], [2.502, 1.3, -0.17]], "tar");
  // The boiler: an oil drum on bricks with a fire under.
  near.tube([-3.6, 0.32, 0], [-3.6, 1.2, 0], 0.3, 7, { cap: true, shadeFrom: 0.8, shadeTo: 1 }, "iron-rust");
  for (const [x, z] of [[-3.95, 0.25], [-3.25, 0.25], [-3.6, -0.3]] as const) near.box([x - 0.12, 0, z - 0.1], [x + 0.12, 0.32, z + 0.1], "stone-dark", { open: true });
  near.spike([-3.6, 0, 0], [-3.6, 0.3, 0], 0.17, "ember", 1.3);
  near.beam([-3.6, 1.2, 0], [-3.5, 1.45, 0], 0.06, 0.06, "tyre").beam([-3.5, 1.45, 0], [-2.5, 1.25, 0], 0.06, 0.06, "tyre");
  return marinaModel(near, new Marked().box([-2.5, 0.2, -0.3], [2.5, 1.35, 0.3], "new-timber-dark", { open: true }).tube([-3.6, 0, 0], [-3.6, 1.2, 0], 0.3, 3, {}, "iron-rust"), 50, 300);
}

/** A tar pot: an iron pot slung from a tripod over a ring of stones and a fire, and a mop in it. */
export function buildTarPot(): RoadsideModel {
  const near = new Marked();
  const top: V3 = [0, 1.45, 0];
  for (let leg = 0; leg < 3; leg++) near.beam([Math.cos((leg / 3) * TAU) * 0.75, 0, Math.sin((leg / 3) * TAU) * 0.75], [top[0], top[1] + 0.1, top[2]], 0.06, 0.06, "tar");
  near.beam(top, [0, 0.85, 0], 0.012, 0.012, "iron");
  near.lathe([0, 0.38, 0], [[0, 0.14], [0.12, 0.26], [0.42, 0.27], [0.48, 0.3]], 7, "iron");
  near.face(Array.from({ length: 7 }, (_, side): V3 => [Math.cos((side / 7) * TAU) * 0.27, 0.84, Math.sin((side / 7) * TAU) * 0.27]), "tar", 0.7);
  near.beam([0.05, 0.84, 0], [0.45, 1.3, 0.1], 0.03, 0.03, "stickers");
  const random = seeded(4);
  for (let stone = 0; stone < 8; stone++) {
    const angle = (stone / 8) * TAU;
    near.lathe([Math.cos(angle) * 0.56, 0, Math.sin(angle) * 0.56], [[0, 0.13 + random() * 0.05], [0.13, 0.09], [0.2, 0.01]], 4, "stone-dark");
  }
  near.spike([0.05, 0, 0.05], [0.05, 0.36, 0.05], 0.2, "ember", 1.3).spike([-0.1, 0, -0.08], [-0.08, 0.26, -0.08], 0.13, "ember", 1.15);
  return marinaModel(near, null, 110, 130);
}

const SMITHY: GableShed = { x: [-3.2, 3.2], z: [-2.4, 2.4], eaves: 2.3, ridge: 3.7, walls: "tar-boards", roof: "roof-under", fascia: "plank-tarred" };

/** A smithy: a low tarred shed with a stone forge chimney at one gable, doors standing open on the long side (+z), and an anvil on a stump outside. */
export function buildSmithy(): RoadsideModel {
  const near = new Marked().shed(SMITHY);
  // Open doors and the dark inside.
  near.face([[-1, 0, 2.405], [1, 0, 2.405], [1, 2.05, 2.405], [-1, 2.05, 2.405]], "tar", 0.5);
  near.face([[-1, 0, 2.41], [-1.7, 0, 3], [-1.7, 2.05, 3], [-1, 2.05, 2.41]], "door");
  near.face([[1, 0, 2.41], [1.7, 0, 3], [1.7, 2.05, 3], [1, 2.05, 2.41]], "door");
  near.face([[-0.4, 0.2, 2.42], [0.3, 0.2, 2.42], [0.3, 1.1, 2.42], [-0.4, 1.1, 2.42]], "ember", 0.5);
  near.window([2.2, 1, 2.41], 0.8, 0.8, "z", "plank-tarred");
  near.window([-3.21, 1, 0], 0.7, 0.8, "x", "plank-tarred");
  // The stone chimney at the +x gable.
  near.box([2.5, 0, -0.7], [3.7, 3, 0.7], "stone-dark", { open: true, shade: 0.95 });
  near.box([2.8, 3, -0.5], [3.5, 4.8, 0.5], "stone-dark", { shade: 0.95, shadeTop: 0.6 });
  near.box([2.75, 4.8, -0.55], [3.55, 4.95, 0.55], "stone-grey", { shadeTop: 0.5 });
  // Anvil and stump.
  near.tube([-2, 0, 3.6], [-2, 0.55, 3.6], 0.26, 6, { cap: true }, "oak");
  near.box([-2.22, 0.55, 3.5], [-1.82, 0.62, 3.7], "iron");
  near.box([-2.12, 0.62, 3.54], [-1.92, 0.68, 3.66], "iron");
  near.box([-2.3, 0.68, 3.5], [-1.76, 0.76, 3.7], "iron", { shadeTop: 1.3 });
  near.spike([-1.76, 0.72, 3.6], [-1.5, 0.74, 3.6], 0.05, "iron", 1.2);
  // A heap of old iron and a grindstone by the wall.
  near.tube([0.1, 0.5, 3.1], [0.1, 0.5, 3.2], 0.42, 8, { cap: true }, "stone-grey").beam([-0.3, 0, 3.1], [0, 0.5, 3.15], 0.06, 0.06, "stickers").beam([0.5, 0, 3.1], [0.2, 0.5, 3.15], 0.06, 0.06, "stickers");
  const far = farShed(SMITHY).box([2.5, 0, -0.7], [3.7, 3, 0.7], "stone-dark", { open: true }).box([2.8, 3, -0.5], [3.5, 4.8, 0.5], "stone-dark", { open: true });
  return marinaModel(near, far, SHED_SWAP_M, SHED_REACH_M);
}

/** A ropewalk's long shed: open-sided, low and narrow, 36 m along +x, on posts, with the head frame of hooks at one end and strands laid down the walk to a sledge. */
export function buildRopewalkShed(): RoadsideModel {
  const [long, half, eaves, ridge] = [36, 1.9, 2.05, 3];
  const near = new Marked();
  const top = eaves;
  const peak = ridge;
  for (const [outer, shade] of [[half + 0.35, 1.02], [-half - 0.35, 0.9]] as const) near.face([[-long / 2 - 0.3, peak, 0], [long / 2 + 0.3, peak, 0], [long / 2 + 0.3, top - 0.17, outer], [-long / 2 - 0.3, top - 0.17, outer]], "roof-dark", shade);
  const bays = 9;
  for (let bay = 0; bay <= bays; bay++) {
    const x = -long / 2 + (bay / bays) * long;
    for (const z of [-half, half]) near.beam([x, 0, z], [x, top, z], 0.14, 0.14, "plank-tarred");
    near.beam([x, top, -half], [x, top, half], 0.1, 0.12, "plank-tarred");
    near.beam([x, top, -half], [x, peak - 0.05, 0], 0.08, 0.1, "plank-tarred").beam([x, top, half], [x, peak - 0.05, 0], 0.08, 0.1, "plank-tarred");
  }
  for (const z of [-half, half]) near.beam([-long / 2, top, z], [long / 2, top, z], 0.1, 0.16, "plank-tarred");
  // Boarded weather side and the two boarded gables.
  near.face([[-long / 2, 0.6, -half], [long / 2, 0.6, -half], [long / 2, top, -half], [-long / 2, top, -half]], "grey-boards", 0.86);
  for (const x of [-long / 2, long / 2]) near.face([[x, top, -half], [x, top, half], [x, peak, 0]], "grey-boards", 0.9);
  // The head frame, the walk's trestles and the strands.
  near.box([-long / 2 + 0.3, 0, -0.6], [-long / 2 + 0.55, 1.5, 0.6], "new-timber-dark", { open: true });
  near.box([long / 2 - 2.2, 0.15, -0.5], [long / 2 - 1.2, 1, 0.5], "new-timber-dark", { open: true });
  for (const bar of [-0.4, 0, 0.4]) {
    near.beam([-long / 2 + 0.55, 1.1, bar], [long / 2 - 2.2, 0.75, bar * 0.2], 0.03, 0.03, "rope");
    near.tube([-long / 2 + 0.5, 1.1, bar], [-long / 2 + 0.9, 1.1, bar], 0.02, 3, {}, "iron");
  }
  for (const x of [-9, 0, 9]) near.beam([x, 0, -0.5], [x, 1, -0.5], 0.07, 0.07, "stickers").beam([x, 0, 0.5], [x, 1, 0.5], 0.07, 0.07, "stickers").beam([x, 1, -0.5], [x, 1, 0.5], 0.05, 0.08, "stickers");
  const far = new Marked();
  for (const [outer, shade] of [[half + 0.35, 1.02], [-half - 0.35, 0.9]] as const) far.face([[-long / 2, peak, 0], [long / 2, peak, 0], [long / 2, top - 0.17, outer], [-long / 2, top - 0.17, outer]], "roof-dark", shade);
  far.face([[-long / 2, 0, -half], [long / 2, 0, -half], [long / 2, top, -half], [-long / 2, top, -half]], "grey-boards", 0.7);
  for (const x of [-long / 2, long / 2]) far.face([[x, 0, -half], [x, 0, half], [x, top, half], [x, peak, 0], [x, top, -half]], "grey-boards", 0.8);
  return marinaModel(near, far, SHED_SWAP_M, SHED_REACH_M);
}

const ROW: readonly (readonly [wide: number, long: number, eaves: number, ridge: number, walls: MarinaPart])[] = [
  [5, 8, 2.3, 3.9, "tar-boards"],
  [4.4, 9, 2.1, 3.5, "red-boards"],
  [5.6, 8.5, 2.5, 4.2, "grey-boards"],
  [4.6, 7.6, 2.2, 3.6, "red-boards"],
  [5, 9, 2.4, 3.9, "tar-boards"],
];
export const SHED_ROW_M = ROW.reduce((sum, [wide]) => sum + wide + 0.3, 0);

function shedRow(into: Marked, detail: boolean): Marked {
  let left = 0;
  const foot = 0.8;
  for (const [wide, long, eaves, ridge, walls] of ROW) {
    const right = left + wide;
    const gable = (z: number, shade: number) => into.face([[left, foot, z], [right, foot, z], [right, foot + eaves, z], [(left + right) / 2, foot + ridge, z], [left, foot + eaves, z]], walls, shade);
    gable(0, 1.02);
    gable(-long, 0.85);
    for (const [x, shade] of [[left, 0.84], [right, 0.94]] as const) into.face([[x, foot, 0], [x, foot, -long], [x, foot + eaves, -long], [x, foot + eaves, 0]], walls, shade);
    const roof = walls === "tar-boards" ? "roof-under" : "roof-dark";
    const [low, high, mid] = [left - 0.1, right + 0.1, (left + right) / 2];
    for (const [edge, shade] of [[low, 0.9], [high, 1.02]] as const) into.face([[mid, foot + ridge, 0.28], [mid, foot + ridge, -long - 0.2], [edge, foot + eaves - 0.06, -long - 0.2], [edge, foot + eaves - 0.06, 0.28]], roof, shade);
    if (detail) {
      // Double doors to the water, a hoist beam over them, and the piles.
      const door = Math.min(1.5, wide * 0.34);
      for (const offset of [-door, 0]) into.face([[mid + offset + 0.02, foot + 0.05, 0.02], [mid + offset + door - 0.02, foot + 0.05, 0.02], [mid + offset + door - 0.02, foot + 2.1, 0.02], [mid + offset + 0.02, foot + 2.1, 0.02]], "door", 0.95);
      into.face([[mid - 0.28, foot + eaves + 0.2, 0.02], [mid + 0.28, foot + eaves + 0.2, 0.02], [mid + 0.28, foot + eaves + 0.72, 0.02], [mid - 0.28, foot + eaves + 0.72, 0.02]], "tar");
      into.beam([mid, foot + ridge - 0.18, -0.3], [mid, foot + ridge - 0.18, 0.75], 0.1, 0.12, "plank-tarred");
      for (const x of [left + 0.2, right - 0.2]) {
        for (const z of [-0.2, -long * 0.5, -long + 0.2]) into.tube([x, -1.2, z], [x, foot, z], 0.13, 4, { shadeFrom: 0.5, shadeTo: 1 }, "plank-tarred");
      }
      into.face([[left - 0.05, foot + 0.02, 0.9], [right + 0.05, foot + 0.02, 0.9], [right + 0.05, foot + 0.02, 0], [left - 0.05, foot + 0.02, 0]], "plank", 1.02);
    } else {
      into.face([[left, 0, 0], [right, 0, 0], [right, foot, 0], [left, foot, 0]], "plank-tarred", 0.5);
    }
    left = right + 0.3;
  }
  return into;
}

/** Five old boat sheds side by side on piles, gables and doors to the water (+z), each its own width, height and paint, running along +x from the origin. Its y 0 is the water. */
export function buildHistoricShedRow(): RoadsideModel {
  return marinaModel(shedRow(new Marked(), true), shedRow(new Marked(), false), SHED_SWAP_M, SHED_REACH_M);
}
