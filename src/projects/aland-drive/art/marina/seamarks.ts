import type { V3 } from "../roadside/mesh";
import { seeded } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { farShed, Marked, marinaModel, TAU, type GableShed, type MarinaPart, type Motion } from "./paint";

/*
 * Sea marks under the IALA Maritime Buoyage System, region A, which is Finland's and so
 * Åland's: red to port and green to starboard going with the direction of buoyage.
 * Cardinals, the isolated danger, safe water and special marks are the same in both
 * regions. A mark's bands follow its topmark's cones: black where their points point.
 *
 * Traficom's chart key names the things built here: viitta (a spar, here the common
 * mark, tagged `spar` on 438 of the 490 lateral and cardinal buoys that have a shape
 * in OSM), poijuviitta (a short pillar), reunamerkki (a fixed mark), kummeli (a
 * cairn), linjamerkit (leading marks).
 */

export const SEA_MARKS = ["north", "south", "east", "west", "port", "starboard", "isolated", "safe", "special"] as const;
export type SeaMark = (typeof SEA_MARKS)[number];

type MarkPaint = Extract<MarinaPart, `mark-${string}`>;
type Topmark = "cones-up" | "cones-down" | "cones-base-to-base" | "cones-point-to-point" | "can" | "cone" | "two-balls" | "ball" | "cross";

/** A mark's horizontal bands from the top down, or its vertical stripes, and its topmark. */
interface MarkSpec {
  bands: readonly MarkPaint[];
  vertical?: readonly MarkPaint[];
  topmark: Topmark;
  topmarkPaint: MarkPaint;
}

export const MARK_SPECS: Record<SeaMark, MarkSpec> = {
  north: { bands: ["mark-black", "mark-yellow"], topmark: "cones-up", topmarkPaint: "mark-black" },
  south: { bands: ["mark-yellow", "mark-black"], topmark: "cones-down", topmarkPaint: "mark-black" },
  east: { bands: ["mark-black", "mark-yellow", "mark-black"], topmark: "cones-base-to-base", topmarkPaint: "mark-black" },
  west: { bands: ["mark-yellow", "mark-black", "mark-yellow"], topmark: "cones-point-to-point", topmarkPaint: "mark-black" },
  port: { bands: ["mark-red"], topmark: "can", topmarkPaint: "mark-red" },
  starboard: { bands: ["mark-green"], topmark: "cone", topmarkPaint: "mark-green" },
  isolated: { bands: ["mark-black", "mark-red", "mark-black"], topmark: "two-balls", topmarkPaint: "mark-black" },
  safe: { bands: [], vertical: ["mark-red", "mark-white"], topmark: "ball", topmarkPaint: "mark-red" },
  special: { bands: ["mark-yellow"], topmark: "cross", topmarkPaint: "mark-yellow" },
};

/** The swell's lean, nothing at the waterline. */
const swing: Motion = (_, [, y]) => ({ kind: "hull", metres: Math.max(0, y) * 0.018 });

const CONE_SIDES = 5;

function cone(into: Marked, base: number, tip: number, radius: number, sides: number, part: MarinaPart): Marked {
  return into.tube([0, base, 0], [0, tip, 0], radius, sides, { radiusTo: 0.004, cap: false, shadeFrom: 0.9, shadeTo: 1.15 }, part).face(Array.from({ length: sides }, (_, side): V3 => [Math.cos((side / sides) * TAU) * radius, base, Math.sin((side / sides) * TAU) * radius]), part, 0.75);
}

function ball(into: Marked, centreY: number, radius: number, sides: number, part: MarinaPart): Marked {
  return into.lathe([0, centreY - radius, 0], [[0, 0.01], [radius * 0.5, radius * 0.9], [radius * 1.5, radius * 0.9], [radius * 2, 0.01]], sides, part);
}

/** A topmark from `y` up, about `size` across: far wider than a spar, because it is what a mark says at a distance. */
function topmark(into: Marked, kind: Topmark, part: MarkPaint, y: number, size: number, sides: number): void {
  const [radius, tall] = [size / 2, size * 0.85];
  const gap = size * 0.14;
  if (kind === "cones-up") {
    cone(into, y, y + tall, radius, sides, part);
    cone(into, y + tall + gap, y + 2 * tall + gap, radius, sides, part);
  } else if (kind === "cones-down") {
    cone(into, y + tall, y, radius, sides, part);
    cone(into, y + 2 * tall + gap, y + tall + gap, radius, sides, part);
  } else if (kind === "cones-base-to-base") {
    cone(into, y + tall, y, radius, sides, part);
    cone(into, y + tall, y + 2 * tall, radius, sides, part);
  } else if (kind === "cones-point-to-point") {
    cone(into, y, y + tall, radius, sides, part);
    cone(into, y + 2 * tall, y + tall, radius, sides, part);
  } else if (kind === "can") {
    into.tube([0, y, 0], [0, y + tall * 1.1, 0], radius * 0.82, sides, { cap: true, shadeFrom: 0.9, shadeTo: 1.05 }, part);
  } else if (kind === "cone") {
    cone(into, y, y + tall * 1.2, radius, sides, part);
  } else if (kind === "two-balls") {
    ball(into, y + radius * 0.85, radius * 0.8, sides, part);
    ball(into, y + radius * 2.75, radius * 0.8, sides, part);
  } else if (kind === "ball") {
    ball(into, y + radius, radius, sides, part);
  } else {
    const [a, b] = [radius, y + radius];
    into.beam([-a, b - a, 0], [a, b + a, 0], size * 0.16, size * 0.16, part).beam([a, b - a, 0], [-a, b + a, 0], size * 0.16, size * 0.16, part);
  }
}

/** The body under a topmark, in bands or in vertical stripes. */
function bandedShaft(into: Marked, spec: MarkSpec, foot: number, top: number, radiusAt: (y: number) => number, sides: number): void {
  if (spec.vertical !== undefined) {
    const [a, b] = [radiusAt(foot), radiusAt(top)];
    const stripes = sides % 2 === 0 ? sides : sides + 1;
    for (let stripe = 0; stripe < stripes; stripe++) {
      const [u, v] = [(stripe / stripes) * TAU, ((stripe + 1) / stripes) * TAU];
      into.face([[Math.cos(u) * a, foot, Math.sin(u) * a], [Math.cos(v) * a, foot, Math.sin(v) * a], [Math.cos(v) * b, top, Math.sin(v) * b], [Math.cos(u) * b, top, Math.sin(u) * b]], spec.vertical[stripe % 2], 0.96 + 0.1 * Math.cos(u));
    }
    return;
  }
  const count = spec.bands.length;
  spec.bands.forEach((part, index) => {
    const [high, low] = [top + ((foot - top) * index) / count, top + ((foot - top) * (index + 1)) / count];
    into.tube([0, low, 0], [0, high, 0], radiusAt(low), sides, { radiusTo: radiusAt(high), shadeFrom: 0.92, shadeTo: 1.06, cap: index === 0 }, part);
  });
}

const SPAR_ABOVE_M = 2.3;
const SPAR_RADIUS_M = 0.08;
const TOPMARK_M = 0.5;
const MARK_SWAP_M = 110;
const MARK_REACH_M = 1800;
/** A far spar is fattened so it is a stroke at a kilometre rather than a shimmer. */
const FAR_RADIUS_M = 0.15;

/** A spar (viitta): a thin plastic pole with bands, its topmark far wider than it, no float showing. Its origin is on the water. */
export function buildSpar(mark: SeaMark): RoadsideModel {
  const spec = MARK_SPECS[mark];
  const build = (radius: number, sides: number, coneSides: number) => {
    const into = new Marked();
    bandedShaft(into, spec, -0.25, SPAR_ABOVE_M, () => radius, sides);
    topmark(into, spec.topmark, spec.topmarkPaint, SPAR_ABOVE_M + 0.02, TOPMARK_M, coneSides);
    return into;
  };
  return marinaModel(build(SPAR_RADIUS_M, 6, CONE_SIDES), build(FAR_RADIUS_M, 3, 3), MARK_SWAP_M, MARK_REACH_M, swing);
}

const PILLAR_BODY_M = 1.1;
const PILLAR_ABOVE_M = 3.9;

/** A pillar buoy (poijuviitta): a broad float carrying a tapered tube, topmark and lamp. For a main fairway. */
export function buildPillarBuoy(mark: SeaMark): RoadsideModel {
  const spec = MARK_SPECS[mark];
  const build = (detail: boolean) => {
    const sides = detail ? 6 : 4;
    const into = new Marked();
    const body = spec.vertical === undefined ? spec.bands[spec.bands.length - 1] : "mark-white";
    into.tube([0, -0.3, 0], [0, PILLAR_BODY_M, 0], 1, sides, { radiusTo: 0.78, shadeFrom: 0.85, shadeTo: 1 }, body);
    into.tube([0, PILLAR_BODY_M, 0], [0, PILLAR_BODY_M + 0.12, 0], 0.78, sides, { radiusTo: 0.42, shadeFrom: 1, shadeTo: 1.1 }, body);
    bandedShaft(into, spec, PILLAR_BODY_M + 0.12, PILLAR_ABOVE_M, (y) => 0.42 - ((y - PILLAR_BODY_M) / (PILLAR_ABOVE_M - PILLAR_BODY_M)) * 0.2, detail ? 6 : 4);
    if (detail) {
            into.tube([0, PILLAR_ABOVE_M, 0], [0, PILLAR_ABOVE_M + 0.25, 0], 0.09, 5, { cap: true }, "mark-lens");
    }
    topmark(into, spec.topmark, spec.topmarkPaint, PILLAR_ABOVE_M + (detail ? 0.28 : 0.02), 0.8, detail ? 6 : 3);
    return into;
  };
  return marinaModel(build(true), build(false), MARK_SWAP_M, MARK_REACH_M, swing);
}

/** A fixed mark (reunamerkki): a concrete caisson on a shoal with a banded steel post and the same topmark. Its origin is on the water. */
export function buildFixedMark(mark: SeaMark): RoadsideModel {
  const spec = MARK_SPECS[mark];
  const [foot, top] = [1.6, 7.2];
  const build = (sides: number, lower: number) => {
    const into = new Marked().tube([0, -0.8, 0], [0, foot, 0], 1.5, sides, { radiusTo: 1.25, cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete-wet");
    bandedShaft(into, spec, foot, top, () => 0.3, lower);
    topmark(into, spec.topmark, spec.topmarkPaint, top + 0.05, 1, lower);
    return into;
  };
  return marinaModel(build(8, 6), build(4, 3), MARK_SWAP_M, MARK_REACH_M);
}

export type LeadingRole = "front" | "rear";

/** A leading mark (linjamerkki): a timber trestle carrying a board, whose daymark is that board (linjataulu), in the yellow OSM has on every one of the island's 99, with a dark centre line to judge the alignment by. The rear stands higher, so the pair reads one over the other on the line. Board faces +z. */
export function buildLeadingMark(role: LeadingRole): RoadsideModel {
  const tall = role === "front" ? 7 : 11;
  const [wide, high] = [1.6, 3.2];
  const legs = (into: Marked) => {
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 0.7], [1.3, 0.7]] as const) into.beam([x, 0, z], [x * 0.2, tall, z * 0.1 - 0.15], 0.14, 0.14, "stickers");
    return into;
  };
  const near = legs(new Marked());
  for (const up of [0.3, 0.62]) {
    const y = tall * up;
    const inset = 1.3 - 1.04 * up;
    near.beam([-inset, y, -1.1 + up * 0.9], [inset, y, -1.1 + up * 0.9], 0.08, 0.08, "stickers").beam([-inset, y, 0.6 - up * 0.5], [inset, y, 0.6 - up * 0.5], 0.08, 0.08, "stickers");
    near.beam([-inset, y, -1.1 + up * 0.9], [inset, y + 2, 0.6 - up * 0.5], 0.06, 0.06, "stickers");
  }
  const bottom = tall - 0.4;
  near.box([-wide / 2, bottom, -0.04], [wide / 2, bottom + high, 0.02], "mark-yellow", { shade: 0.98 });
  near.face([[-0.17, bottom, 0.023], [0.17, bottom, 0.023], [0.17, bottom + high, 0.023], [-0.17, bottom + high, 0.023]], "mark-black");
  near.beam([0, tall - 0.4, -0.14], [0, bottom + high, -0.14], 0.12, 0.12, "stickers");
  const far = legs(new Marked()).face([[-wide / 2, bottom, 0.02], [wide / 2, bottom, 0.02], [wide / 2, bottom + high, 0.02], [-wide / 2, bottom + high, 0.02]], "mark-yellow").face([[-0.2, bottom, 0.03], [0.2, bottom, 0.03], [0.2, bottom + high, 0.03], [-0.2, bottom + high, 0.03]], "mark-black");
  return marinaModel(near, far, 150, MARK_REACH_M);
}

/** A bare stone cairn (kummel, kummeli): rough dry-laid rock narrowing to a point. Identity's `buildKummel` is the whitewashed one. */
export function buildCairn(seed: number): RoadsideModel {
  const stone = (index: number): MarinaPart => (index % 3 === 0 ? "stone-pink" : "stone-grey");
  const random = seeded(seed);
  const near = new Marked();
  const rings: readonly (readonly [up: number, count: number, reach: number, size: number])[] = [[0, 8, 1.35, 0.55], [0.55, 7, 1.05, 0.48], [1.05, 6, 0.75, 0.42], [1.5, 4, 0.45, 0.35], [1.95, 2, 0.16, 0.26]];
  rings.forEach(([up, count, reach, size], level) => {
    for (let index = 0; index < count; index++) {
      const angle = ((index + (level % 2) * 0.5) / count) * TAU + random() * 0.2;
      const [x, z] = [Math.cos(angle) * reach, Math.sin(angle) * reach];
      near.lathe([x, up - 0.05, z], [[0, size * (0.75 + random() * 0.3)], [size * 0.85, size * 0.3]], 4, stone(index + level));
    }
  });
  near.tube([0, 0, 0], [0, 2.1, 0], 1.05, 5, { radiusTo: 0.1, cap: true, shadeFrom: 0.55, shadeTo: 0.8 }, "stone-grey");
  const far = new Marked().tube([0, 0, 0], [0, 2.4, 0], 1.5, 4, { radiusTo: 0.1, cap: true }, "stone-grey");
  return marinaModel(near, far, 100, MARK_REACH_M);
}

/** A closed pyramid of boards on a stone footing, the sort of beacon that stood on a pilot's skerry. Identity's `buildWoodenDaymark` is the open-framed kind. */
export function buildPyramidBeacon(): RoadsideModel {
  const [tall, half] = [9, 2.6];
  const pyramid = (into: Marked) => {
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]] as const;
    corners.forEach(([a, b], index) => {
      const [c, d] = corners[(index + 1) % 4];
      into.face([[a, 0.5, b], [c, 0.5, d], [0, tall, 0]], "red-boards", 0.86 + index * 0.07);
    });
    return into.box([-half - 0.2, 0, -half - 0.2], [half + 0.2, 0.5, half + 0.2], "stone-grey", { open: true });
  };
  const near = pyramid(new Marked()).beam([0, tall - 0.3, 0], [0, tall + 1.1, 0], 0.1, 0.1, "stickers");
  near.face([[-0.4, 0.5, half - 0.01], [0.4, 0.5, half - 0.01], [0.4, 2.1, half * 0.68], [-0.4, 2.1, half * 0.68]], "door");
  return marinaModel(near, pyramid(new Marked()), 150, MARK_REACH_M);
}

/** A skerry light: a short concrete sector light on a caisson, the common sort on a fairway; 6 m to its lantern, where identity's `buildLighthouse` is a 16 m tower. */
export function buildSkerryLight(): RoadsideModel {
  const [tall, foot, base] = [6, 1.2, 1.1];
  const build = (detail: boolean) => {
    const sides = detail ? 8 : 4;
    const into = new Marked().tube([0, -0.6, 0], [0, foot, 0], base + 0.8, sides, { radiusTo: base + 0.6, cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete-wet");
    const radius = (y: number) => base - ((y - foot) / (tall - foot)) * base * 0.42;
    const band = tall * 0.55;
    const bandHigh = band + tall * 0.2;
    into.tube([0, foot, 0], [0, band, 0], radius(foot), sides, { radiusTo: radius(band), shadeFrom: 0.9, shadeTo: 1 }, "mark-white");
    into.tube([0, band, 0], [0, bandHigh, 0], radius(band), sides, { radiusTo: radius(bandHigh) }, "mark-red");
    into.tube([0, bandHigh, 0], [0, tall, 0], radius(bandHigh), sides, { radiusTo: radius(tall), shadeFrom: 1, shadeTo: 1.05 }, "mark-white");
    into.tube([0, tall, 0], [0, tall + 0.14, 0], radius(tall) + 0.45, sides, { cap: true, shadeFrom: 0.75, shadeTo: 1 }, "mark-black");
    into.tube([0, tall + 0.14, 0], [0, tall + 1.1, 0], radius(tall) * 0.72, sides, {}, detail ? "glass" : "mark-lens");
    into.tube([0, tall + 1.1, 0], [0, tall + 1.75, 0], radius(tall) * 0.85, sides, { radiusTo: 0.03, shadeFrom: 0.85, shadeTo: 1.1 }, "mark-red");
    if (detail) {
      into.tube([0, tall + 0.42, 0], [0, tall + 0.82, 0], 0.16, 5, { cap: true }, "mark-lens");
      into.hoop([0, tall + 0.9, 0], radius(tall) + 0.42, 8, 0.035, "mark-black", "xz");
      into.face([[-0.35, foot, base + 0.02], [0.35, foot, base + 0.02], [0.28, foot + 1.9, base * 0.93], [-0.28, foot + 1.9, base * 0.93]], "door");
    }
    return into;
  };
  return marinaModel(build(true), build(false), MARK_SWAP_M + 40, MARK_REACH_M);
}

const STATION: GableShed = { x: [-5.5, 5.5], z: [-4, 4], eaves: 5, ridge: 7.2, foot: 0.7, overhang: 0.4, walls: "red-boards", roof: "roof-dark", fascia: "trim" };

/** A pilot station on its skerry, in the spirit of Kobba Klintar's 1910 house: a two-storey timber house with white trim on a stone plinth, a balcony to seaward (+z), a glazed lookout on the ridge, a mast for the signals, and the old pilot's cottage beside it. It isn't that house: the colour and the lookout's shape are this model's. */
export function buildPilotStation(): RoadsideModel {
  const near = new Marked().box([-5.8, -0.5, -4.3], [5.8, 0.7, 4.3], "stone-grey", { open: true, shadeTop: 1.05 }).shed(STATION);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    near.window([x, 1.6, 4.01], 1, 1.4, "z");
    if (Math.abs(x) > 2) near.window([x, 3.75, 4.01], 1, 1.3, "z");
    near.window([x, 1.6, -4.01], 1, 1.4, "z");
    near.window([x, 3.75, -4.01], 1, 1.3, "z");
  }
  for (const x of [-5.51, 5.51]) {
    near.window([x, 1.6, -1.6], 1, 1.4, "x");
    near.window([x, 3.75, 1.6], 1, 1.3, "x");
    near.window([x, 5.9, 0], 0.8, 0.9, "x");
  }
  for (const [x, z] of [[-5.5, 4], [5.5, 4], [-5.5, -4], [5.5, -4]] as const) near.box([x - 0.08, 0.7, z - 0.08], [x + 0.08, 5.8, z + 0.08], "trim", { open: true });
  // A band between the storeys.
  near.face([[-5.52, 3.45, 4.02], [5.52, 3.45, 4.02], [5.52, 3.6, 4.02], [-5.52, 3.6, 4.02]], "trim");
  near.face([[-5.52, 3.45, -4.02], [5.52, 3.45, -4.02], [5.52, 3.6, -4.02], [-5.52, 3.6, -4.02]], "trim");
  // The balcony over the seaward door, on posts.
  const deck = 3.4;
  near.box([-1.9, deck, 4], [1.9, deck + 0.12, 5.5], "trim", { shadeTop: 1.02 });
  for (const x of [-1.8, 1.8]) near.beam([x, 0.7, 5.4], [x, deck, 5.4], 0.14, 0.14, "trim");
  near.beam([-1.9, deck + 1.05, 5.5], [1.9, deck + 1.05, 5.5], 0.06, 0.08, "trim");
  for (const x of [-1.9, 1.9]) near.beam([x, deck + 1.05, 4], [x, deck + 1.05, 5.5], 0.06, 0.08, "trim");
  for (let bar = 0; bar <= 8; bar++) near.beam([-1.9 + bar * 0.475, deck + 0.1, 5.5], [-1.9 + bar * 0.475, deck + 1.05, 5.5], 0.03, 0.03, "trim");
  near.face([[-0.55, 3.55, 4.01], [0.55, 3.55, 4.01], [0.55, 5, 4.01], [-0.55, 5, 4.01]], "glass");
  near.face([[-0.55, 0.7, 4.01], [0.55, 0.7, 4.01], [0.55, 2.8, 4.01], [-0.55, 2.8, 4.01]], "door");
  near.box([-1, 0, 4.3], [1, 0.3, 5.3], "stone-grey", { open: true });
  // The lookout: a small glazed room astride the ridge, its own little hip roof and ball.
  const [low, high] = [6.7, 8.9];
  near.box([-1.25, low, -1.25], [1.25, high - 1.3, 1.25], "trim", { open: true });
  for (const [a, b, c, d] of [[-1.15, 1.26, 1.15, 1.26], [-1.15, -1.26, 1.15, -1.26]] as const) near.face([[a, high - 1.2, b], [c, high - 1.2, d], [c, high - 0.1, d], [a, high - 0.1, b]], "glass");
  for (const [a, b, c, d] of [[1.26, -1.15, 1.26, 1.15], [-1.26, -1.15, -1.26, 1.15]] as const) near.face([[a, high - 1.2, b], [c, high - 1.2, d], [c, high - 0.1, d], [a, high - 0.1, b]], "glass");
  for (const [x, z] of [[-1.27, -1.27], [1.27, -1.27], [1.27, 1.27], [-1.27, 1.27]] as const) near.box([x - 0.08, high - 1.3, z - 0.08], [x + 0.08, high, z + 0.08], "trim", { open: true });
  near.box([-1.45, high, -1.45], [1.45, high + 0.1, 1.45], "trim");
  near.tube([0, high + 0.1, 0], [0, high + 1.05, 0], 2.05, 4, { radiusTo: 0.04, shadeFrom: 0.95, shadeTo: 1.08 }, "roof-dark");
  near.lathe([0, high + 1, 0], [[0, 0.01], [0.12, 0.18], [0.3, 0.01]], 5, "brass");
  // A gallery round the lookout.
  near.hoop([0, low + 0.9, 0], 1.95, 8, 0.05, "trim", "xz");
  // The chimney, the signal mast and the old cottage.
  near.box([2.7, 5.4, -0.45], [3.5, 8.2, 0.45], "stone-dark", { shadeTop: 0.6 });
  near.tube([-7.6, 0, 3.2], [-7.6, 13, 3.2], 0.11, 5, { radiusTo: 0.05, cap: true }, "trim");
  near.tube([-7.6, 9.5, 1.9], [-7.6, 9.5, 4.5], 0.05, 4, { cap: true }, "trim");
  const cottage: GableShed = { x: [8, 13], z: [-2.5, 2], eaves: 2.3, ridge: 3.9, foot: 0.3, walls: "red-boards", roof: "roof-under", fascia: "trim" };
  near.shed(cottage).box([7.8, -0.3, -2.7], [13.2, 0.3, 2.2], "stone-grey", { open: true });
  near.window([9.5, 1, 2.01], 0.8, 1, "z").window([11.6, 1, 2.01], 0.8, 1, "z");
  near.face([[10.2, 0.3, 2.01], [10.9, 0.3, 2.01], [10.9, 2.2, 2.01], [10.2, 2.2, 2.01]], "door");
  const far = farShed(STATION).box([-5.8, -0.5, -4.3], [5.8, 0.7, 4.3], "stone-grey", { open: true }).box([-1.25, 6.7, -1.25], [1.25, 8.9, 1.25], "trim", { open: true }).tube([0, 8.9, 0], [0, 10, 0], 2, 4, { radiusTo: 0.04 }, "roof-dark").face([[-4.3, 1.6, 4.02], [4.3, 1.6, 4.02], [4.3, 3, 4.02], [-4.3, 3, 4.02]], "glass").shed({ ...cottage, fascia: undefined }).beam([-7.6, 0, 3.2], [-7.6, 13, 3.2], 0.16, 0.16, "trim");
  return marinaModel(near, far, 200, 1800);
}
