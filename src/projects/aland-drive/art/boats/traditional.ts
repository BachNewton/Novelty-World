import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { dressForMooring, type Mooring } from "./dress";
import { farHull, house, Hull, type HullSpec } from "./hull";
import { BoatMesh, finished, type BoatPart } from "./mesh";
import { boomOut, coverPart, farMast, farSail, nearSail, sailPart, type CoverColour, type Sail, type SailColour } from "./rig";

/*
 * The gaff and lug boats: a double-ender in the Colin Archer spirit, a galeas in the
 * spirit of Åland's Albanus, and an open allmogebåt. Gaff sails are the rig module's
 * one sail shape with a chord at the top.
 *
 * A Colin Archer double-ender is about 12.5 m on deck by 4.2 m beam, with a canoe
 * stern, its rudder hung outboard on the sternpost, strong sheer, bowsprit and a
 * ketch rig. The galeas is 21.5 m on the hull and 30 m over her spars, 6.2 m in beam,
 * 21 m tall, with the taller mast forward, as a galeas has, and eight sails.
 */

export interface TraditionalOptions {
  state?: "moored" | "sailing";
  mooring?: Mooring;
  sails?: SailColour;
  cover?: CoverColour;
  lee?: number;
  hull?: BoatPart;
}

interface Gaff {
  mastZ: number;
  /** Mast top, and how high the throat and peak hoist. */
  topY: number;
  throatY: number;
  peakY: number;
  /** Boom's height and length, and gaff's length back from the mast. */
  boomY: number;
  boomM: number;
  gaffM: number;
  footY: number;
  radius: number;
}

function gaffSail({ mastZ, throatY, peakY, boomY, boomM, gaffM, radius }: Gaff, part: BoatPart, lee: number, degrees: number, near: boolean): Sail {
  const boom = boomOut(boomM, degrees, lee);
  const gaffRun = gaffM * Math.cos(Math.asin(Math.min(1, (peakY - throatY) / gaffM)));
  const gaffOut = boomOut(gaffRun, degrees + 9, lee);
  return { tack: [0, boomY + 0.1, mastZ - radius], head: [0, throatY, mastZ - radius], foot: boom, gaff: [gaffOut[0], peakY - throatY, gaffOut[2]], rows: near ? 4 : 1, columns: near ? 3 : 1, camber: near ? 0.07 : 0, twist: 0.1, roachM: 0, lee, part };
}

/** The spars of a gaff rig, sail set or lowered: mast, boom, and the gaff up or down on the boom. */
function gaffSpars(mesh: BoatMesh, gaff: Gaff, degrees: number, lee: number, part: BoatPart, up: boolean): void {
  const { mastZ, topY, throatY, peakY, boomY, boomM, gaffM, footY, radius } = gaff;
  mesh.tube([0, footY, mastZ], [0, topY, mastZ], radius, 5, { radiusTo: radius * 0.55, cap: true }, part);
  const boom = boomOut(boomM, degrees, lee);
  mesh.tube([0, boomY, mastZ], [boom[0], boomY, mastZ + boom[2]], radius * 0.55, 4, { radiusTo: radius * 0.42, cap: true }, part);
  if (up) {
    const gaffRun = gaffM * Math.cos(Math.asin(Math.min(1, (peakY - throatY) / gaffM)));
    const out = boomOut(gaffRun, degrees + 9, lee);
    const peak: V3 = [out[0], peakY, mastZ + out[2]];
    mesh.tube([0, throatY, mastZ], peak, radius * 0.45, 4, { radiusTo: radius * 0.3 }, part);
    mesh.line([0, topY - 0.3, mastZ], [peak[0] * 0.6, throatY + (peakY - throatY) * 0.6, mastZ + (peak[2] - mastZ) * 0.6], "rope");
  } else {
    mesh.tube([0.12, boomY + 0.34, mastZ], [0.08, boomY + 0.3, mastZ - gaffM], radius * 0.45, 4, { radiusTo: radius * 0.3 }, part);
  }
  mesh.line([0, topY - 0.2, mastZ], [boom[0], boomY, mastZ + boom[2]], "rope");
}

/** A double-ender's plan: fine at both ends, the greatest beam a little forward of the middle. */
const CANOE_PLAN = [[0, 0.02], [0.08, 0.38], [0.22, 0.78], [0.42, 0.98], [0.55, 1], [0.74, 0.84], [0.9, 0.42], [1, 0.02]] as const;

const ARCHER_HULL: HullSpec = {
  halfBeamM: 2.1,
  transom: false,
  plan: CANOE_PLAN,
  sheer: [[0, 1.75], [0.25, 1.28], [0.55, 1.12], [0.8, 1.35], [1, 1.95]],
  levels: [
    { y: -0.7, stern: -5.3, stem: 5.4, beam: 0.3, sharpen: 1.4 },
    { y: 0, stern: -6.05, stem: 6, beam: 0.74, sharpen: 1.2 },
    { y: 0.1, stern: -6.1, stem: 6.05, beam: 0.77, sharpen: 1.15 },
    { up: 0.55, stern: -6.2, stem: 6.15, beam: 0.94, sharpen: 1.05 },
    { up: 1, stern: -6.25, stem: 6.25, beam: 1 },
  ],
};

const ARCHER_MAIN: Gaff = { mastZ: 1.5, topY: 16, throatY: 11.2, peakY: 14.4, boomY: 3.1, boomM: 6.4, gaffM: 5, footY: 1.1, radius: 0.13 };
const ARCHER_MIZZEN: Gaff = { mastZ: -3.7, topY: 10.6, throatY: 7.7, peakY: 9.7, boomY: 2.5, boomM: 2.9, gaffM: 2.7, footY: 1.3, radius: 0.09 };
const ARCHER_SPRIT_Z = 9.2;

/** A double-ender in the Colin Archer spirit, 12.5 m, gaff ketch, tanned sails. */
export function buildDoubleEnder({ state = "moored", mooring = "buoy", sails = "tan", cover = "green", lee = 1, hull: topside = "gelcoat-warm" }: TraditionalOptions = {}): RoadsideModel {
  const hull = new Hull(ARCHER_HULL);
  const sailing = state === "sailing";
  const sail = sailPart(sails);
  const degrees = sailing ? 16 : 0;
  const near = new BoatMesh();
  hull.skin(near, 10, ["antifoul-red", "boot", topside, topside]);
  hull.deck(near, 10, "pine", { from: 0.2, to: 0.4, halfM: 0.72, floorY: 0.72, floor: "teak", wall: "spar-wood" });
  hull.rail(near, 10, topside, 0.16);
  // Sternpost and outboard rudder, the stem head and the rubbing strake.
  near.face([[0, 1.85, -6.3], [0, 1.85, -6.62], [0, -0.3, -6.1], [0, -0.3, -5.5]], "tar");
  near.tube([0, 2.1, -6.5], [0, 2.3, -5.1], 0.04, 3, { radiusTo: 0.025 }, "spar-wood");
  house(near, { fromZ: -1.1, toZ: 0.9, halfFrom: 0.86, halfTo: 0.8, baseY: 1.05, topY: 1.62, rakeM: 0.05, tumbleM: 0.04, part: "varnish", top: "gelcoat-warm", window: { low: 0.4, high: 0.72, from: 0.2, to: 0.8 } });
  near.tube([0, 1.92, 5.9], [0, 1.65, ARCHER_SPRIT_Z], 0.08, 4, { radiusTo: 0.05, cap: true }, "spar-wood");
  gaffSpars(near, ARCHER_MAIN, degrees, lee, "spar-wood", sailing);
  gaffSpars(near, ARCHER_MIZZEN, degrees + 6, lee, "spar-wood", sailing);
  near.line([0, ARCHER_MAIN.topY - 3.8, ARCHER_MAIN.mastZ], [0, 1.95, 6.2]).line([0, ARCHER_MAIN.topY - 1.2, ARCHER_MAIN.mastZ], [0, 1.65, ARCHER_SPRIT_Z]).line([0, 1.65, ARCHER_SPRIT_Z], [0, 0.1, 5.9]);
  near.line([0, ARCHER_MAIN.topY - 2.4, ARCHER_MAIN.mastZ], [0, ARCHER_MIZZEN.topY - 0.3, ARCHER_MIZZEN.mastZ]);
  for (const side of [-1, 1]) {
    for (const z of [0.9, 1.5, 2.1]) near.line([0, ARCHER_MAIN.throatY, ARCHER_MAIN.mastZ], [side * 1.9, 1.3, z]);
    near.line([0, ARCHER_MIZZEN.throatY, ARCHER_MIZZEN.mastZ], [side * 1.45, 1.45, -3.6]);
  }

  const far = farHull(new BoatMesh(), hull, topside, "pine", 4);
  far.box([-0.8, 1, -1.1], [0.8, 1.6, 0.9], "varnish", { open: true });
  farMast(far, ARCHER_MAIN.mastZ, 1, ARCHER_MAIN.topY, 0.16, "spar-wood");
  farMast(far, ARCHER_MIZZEN.mastZ, 1.2, ARCHER_MIZZEN.topY, 0.12, "spar-wood");
  far.face([[-0.06, 1.8, 6], [0.06, 1.8, 6], [0, 1.65, ARCHER_SPRIT_Z]], "spar-wood");

  if (sailing) {
    const staysail = (near2: boolean): Sail => ({ tack: [0, 2.05, 5.6], head: [0, ARCHER_MAIN.topY - 4.6, ARCHER_MAIN.mastZ + 1.1], foot: [lee * 0.8, 0.4, -3.1], rows: near2 ? 3 : 1, columns: near2 ? 2 : 1, camber: near2 ? 0.08 : 0, twist: 0.12, roachM: 0, lee, part: sail });
    const jib = (near2: boolean): Sail => ({ tack: [0, 1.85, ARCHER_SPRIT_Z - 0.2], head: [0, ARCHER_MAIN.topY - 1.9, ARCHER_MAIN.mastZ + 0.6], foot: [lee * 1.05, 0.5, -4.9], rows: near2 ? 3 : 1, columns: near2 ? 2 : 1, camber: near2 ? 0.08 : 0, twist: 0.12, roachM: 0, lee, part: sail });
    nearSail(near, gaffSail(ARCHER_MAIN, sail, lee, degrees, true));
    nearSail(near, gaffSail(ARCHER_MIZZEN, sail, lee, degrees + 6, true));
    nearSail(near, staysail(true));
    nearSail(near, jib(true));
    for (const [gaff, off] of [[ARCHER_MAIN, 0], [ARCHER_MIZZEN, 6]] as const) farSail(far, gaffSail(gaff, sail, lee, degrees + off, false));
    farSail(far, staysail(false));
    farSail(far, jib(false));
  } else {
    near.tube([0, ARCHER_MAIN.boomY + 0.18, 1.4], [0, ARCHER_MAIN.boomY + 0.18, 1.4 - ARCHER_MAIN.boomM * 0.86], 0.22, 5, { radiusTo: 0.14, cap: true }, coverPart(cover));
    near.tube([0, ARCHER_MIZZEN.boomY + 0.14, -3.8], [0, ARCHER_MIZZEN.boomY + 0.14, -3.8 - ARCHER_MIZZEN.boomM * 0.8], 0.15, 4, { radiusTo: 0.1, cap: true }, coverPart(cover));
    dressForMooring(near, hull, { mooring, fenderCount: 3 });
    far.tube([0, ARCHER_MAIN.boomY, 1.4], [0, ARCHER_MAIN.boomY, -4.5], 0.2, 3, {}, coverPart(cover));
  }
  return finished({ near, far, swapM: 190, reachM: 1700, rock: sailing ? 0.14 : 0.22, heelDeg: sailing ? 11 : 0, lee });
}

const GALEAS_HULL: HullSpec = {
  halfBeamM: 3.1,
  transom: true,
  plan: [[0, 0.62], [0.1, 0.84], [0.3, 1], [0.6, 1], [0.8, 0.86], [0.92, 0.58], [1, 0.03]],
  sheer: [[0, 2.5], [0.2, 2.05], [0.55, 1.8], [0.8, 2.1], [1, 2.95]],
  levels: [
    { y: -0.9, stern: -9.6, stem: 9.7, beam: 0.7, sharpen: 1.2 },
    { y: 0, stern: -10.2, stem: 10.3, beam: 0.92, sharpen: 1.05 },
    { y: 0.14, stern: -10.25, stem: 10.35, beam: 0.93 },
    { up: 0.72, stern: -10.6, stem: 10.65, beam: 0.985 },
    { up: 0.86, stern: -10.68, stem: 10.7, beam: 1 },
    { up: 1, stern: -10.75, stem: 10.75, beam: 1 },
  ],
};

const GALEAS_MAIN: Gaff = { mastZ: 3.6, topY: 20.85, throatY: 13.6, peakY: 16.4, boomY: 4.2, boomM: 9.4, gaffM: 6.6, footY: 1.9, radius: 0.24 };
const GALEAS_MIZZEN: Gaff = { mastZ: -6.8, topY: 16.6, throatY: 11.1, peakY: 13.3, boomY: 4, boomM: 6.2, gaffM: 4.6, footY: 2.1, radius: 0.18 };
const GALEAS_SPRIT_Z = 17.6;
const GALEAS_JIBBOOM_Z = 19.2;

function headsails(lee: number, part: BoatPart, near: boolean): Sail[] {
  const rows = near ? 4 : 1;
  const columns = near ? 3 : 1;
  const camber = near ? 0.07 : 0;
  const sail = (tack: V3, head: V3, foot: V3): Sail => ({ tack, head, foot, rows, columns, camber, twist: 0.1, roachM: 0, lee, part });
  const { mastZ, topY } = GALEAS_MAIN;
  return [
    sail([0, 3.3, 10.4], [0, 12.9, mastZ + 0.9], [lee * 1.5, 0.3, -5.9]),
    sail([0, 3.1, 13.8], [0, 15.2, mastZ + 0.8], [lee * 1.8, 0.5, -8.3]),
    sail([0, 3, GALEAS_SPRIT_Z - 0.3], [0, topY - 2.2, mastZ + 0.7], [lee * 2.1, 0.7, -10.6]),
  ];
}

function topsail(gaff: Gaff, part: BoatPart, lee: number, degrees: number, near: boolean): Sail {
  const gaffRun = gaff.gaffM * Math.cos(Math.asin(Math.min(1, (gaff.peakY - gaff.throatY) / gaff.gaffM)));
  const out = boomOut(gaffRun * 0.94, degrees + 9, lee);
  return { tack: [0, gaff.throatY + 0.3, gaff.mastZ - gaff.radius], head: [0, gaff.topY - 0.4, gaff.mastZ - 0.1], foot: [out[0], gaff.peakY - gaff.throatY - 0.4, out[2]], rows: near ? 3 : 1, columns: near ? 2 : 1, camber: near ? 0.05 : 0, twist: 0.05, roachM: 0, lee, part };
}

function ratlines(mesh: BoatMesh, mastZ: number, throatY: number, side: number, chainplateY: number, count: number): void {
  const foot: V3 = [side * 3, chainplateY, mastZ];
  const aft: V3 = [side * 3, chainplateY, mastZ - 1.3];
  const head: V3 = [0.15 * side, throatY, mastZ];
  mesh.line(foot, head).line(aft, head);
  for (let rung = 1; rung <= count; rung++) {
    const share = rung / (count + 1);
    const at = (end: V3): V3 => [end[0] + (head[0] - end[0]) * share, end[1] + (head[1] - end[1]) * share, end[2] + (head[2] - end[2]) * share];
    mesh.line(at(foot), at(aft), "rope");
  }
}

/** A Baltic gaff-rigged cargo galeas in the spirit of Åland's Albanus: full-bodied, black, a long sprit and the taller mast forward. */
export function buildGaleas({ state = "moored", mooring = "alongside", sails = "cream", cover = "grey", lee = 1, hull: topside = "tar" }: TraditionalOptions = {}): RoadsideModel {
  const hull = new Hull(GALEAS_HULL);
  const sailing = state === "sailing";
  const sail = sailPart(sails);
  const degrees = sailing ? 20 : 0;
  const near = new BoatMesh();
  hull.skin(near, 12, ["antifoul-red", "gelcoat", topside, "gelcoat", topside], (band) => (band === 3 ? 0.92 : 1));
  hull.deck(near, 12, "pine");
  hull.rail(near, 12, "gelcoat-warm", 0.42);
  // A high bulwark's inside and its cap, the cargo hatch, the deckhouses, the wheel aft.
  near.box([-1.35, 1.75, -1.7], [1.35, 2.25, 1.9], "tar", { open: true, shadeTop: 1.7 });
  house(near, { fromZ: -5.2, toZ: -2.8, halfFrom: 1.5, halfTo: 1.5, baseY: 1.9, topY: 3.3, rakeM: 0, tumbleM: 0, part: "gelcoat-warm", top: "pine", window: { low: 0.45, high: 0.75, from: 0.15, to: 0.85 } });
  house(near, { fromZ: 5.2, toZ: 6.8, halfFrom: 1.2, halfTo: 1.2, baseY: 1.9, topY: 2.9, rakeM: 0, tumbleM: 0, part: "gelcoat-warm", top: "pine" });
  near.tube([0, 2.75, -9.5], [0, 3.7, -9.5], 0.05, 3, {}, "spar-wood");
  near.tube([-0.5, 3.7, -9.45], [0.5, 3.7, -9.45], 0.5, 8, {}, "spar-wood");
  near.box([-0.7, 2.25, 8.3], [0.7, 2.75, 8.9], "tar", { open: true, shadeTop: 1.5 });
  // Rudder hung on the transom; tackles of the boats' davits are left to the eye.
  near.face([[0, 2.5, -10.75], [0, 2.5, -11.15], [0, -0.3, -10.7], [0, -0.3, -10.2]], "tar");
  near.tube([0, 2.95, 10.2], [0, 2.8, GALEAS_SPRIT_Z], 0.17, 5, { radiusTo: 0.1 }, "spar-wood");
  near.tube([0, 2.86, GALEAS_SPRIT_Z - 2], [0, 3.1, GALEAS_JIBBOOM_Z], 0.08, 4, { radiusTo: 0.05, cap: true }, "spar-wood");
  near.line([0, 2.8, GALEAS_SPRIT_Z], [0, 0.1, 10.2]).line([0, 3.1, GALEAS_JIBBOOM_Z], [0, 1.2, 12.6]);
  gaffSpars(near, GALEAS_MAIN, degrees, lee, "spar-wood", sailing);
  gaffSpars(near, GALEAS_MIZZEN, degrees + 6, lee, "spar-wood", sailing);
  const main = GALEAS_MAIN.mastZ;
  near.line([0, 13.2, main], [0, 3.3, 10.4]).line([0, 15.6, main], [0, 2.95, 13.8]).line([0, GALEAS_MAIN.topY - 2.2, main], [0, 2.9, GALEAS_SPRIT_Z]).line([0, GALEAS_MAIN.topY - 0.5, main], [0, 3.1, GALEAS_JIBBOOM_Z]);
  near.line([0, GALEAS_MAIN.throatY, main], [0, GALEAS_MIZZEN.topY - 1, GALEAS_MIZZEN.mastZ]);
  for (const side of [-1, 1]) {
    ratlines(near, main, GALEAS_MAIN.throatY, side, 2.5, 9);
    ratlines(near, GALEAS_MIZZEN.mastZ, GALEAS_MIZZEN.throatY, side, 2.5, 7);
  }

  const far = farHull(new BoatMesh(), hull, topside, "pine", 4);
  far.box([-1.5, 1.9, -5.2], [1.5, 3.3, -2.8], "gelcoat-warm", { open: true });
  farMast(far, GALEAS_MAIN.mastZ, 1.9, GALEAS_MAIN.topY, 0.28, "spar-wood");
  farMast(far, GALEAS_MIZZEN.mastZ, 2.1, GALEAS_MIZZEN.topY, 0.22, "spar-wood");
  far.face([[-0.12, 2.9, 10.2], [0.12, 2.9, 10.2], [0, 3.1, GALEAS_JIBBOOM_Z]], "spar-wood");

  if (sailing) {
    for (const [gaff, off] of [[GALEAS_MAIN, 0], [GALEAS_MIZZEN, 6]] as const) {
      nearSail(near, gaffSail(gaff, sail, lee, degrees + off, true));
      nearSail(near, topsail(gaff, sail, lee, degrees + off, true));
      farSail(far, gaffSail(gaff, sail, lee, degrees + off, false));
      farSail(far, topsail(gaff, sail, lee, degrees + off, false));
    }
    for (const head of headsails(lee, sail, true)) nearSail(near, head);
    for (const head of headsails(lee, sail, false)) farSail(far, head);
  } else {
    const bag = coverPart(cover);
    near.tube([0.04, GALEAS_MAIN.boomY + 0.3, main - 0.3], [0, GALEAS_MAIN.boomY + 0.3, main - 8.6], 0.42, 6, { radiusTo: 0.26, cap: true }, bag);
    near.tube([0.04, GALEAS_MIZZEN.boomY + 0.26, GALEAS_MIZZEN.mastZ - 0.3], [0, GALEAS_MIZZEN.boomY + 0.26, GALEAS_MIZZEN.mastZ - 5.4], 0.32, 5, { radiusTo: 0.2, cap: true }, bag);
    dressForMooring(near, hull, { mooring, fenderCount: 4, fenders: "tar" });
    far.tube([0, GALEAS_MAIN.boomY + 0.3, main], [0, GALEAS_MAIN.boomY + 0.3, main - 8.6], 0.4, 3, {}, bag);
    far.tube([0, GALEAS_MIZZEN.boomY + 0.3, GALEAS_MIZZEN.mastZ], [0, GALEAS_MIZZEN.boomY + 0.3, GALEAS_MIZZEN.mastZ - 5.4], 0.3, 3, {}, bag);
  }
  return finished({ near, far, swapM: 240, reachM: 2600, rock: sailing ? 0.06 : 0.08, heelDeg: sailing ? 6 : 0, lee });
}

const ALLMOGE_STRAKES = 4;

const ALLMOGE_HULL: HullSpec = {
  halfBeamM: 0.98,
  transom: false,
  plan: [[0, 0.02], [0.1, 0.44], [0.26, 0.84], [0.5, 1], [0.74, 0.84], [0.9, 0.44], [1, 0.02]],
  sheer: [[0, 1.1], [0.2, 0.72], [0.5, 0.58], [0.8, 0.72], [1, 1.1]],
  levels: [
    { y: -0.3, stern: -2.6, stem: 2.6, beam: 0.3, sharpen: 1.5 },
    ...Array.from({ length: ALLMOGE_STRAKES + 1 }, (_, index) => {
      const share = index / ALLMOGE_STRAKES;
      return { up: 0.3 + 0.7 * share, stern: -3 - 0.1 * share, stem: 3 + 0.1 * share, beam: 0.78 + 0.22 * share + (index % 2 === 0 ? 0 : 0.015), sharpen: 1.2 - 0.2 * share };
    }),
  ],
};

const ALLMOGE_MAST_Z = 1;
const ALLMOGE_MAST_Y = 5.6;

function lugSail(part: BoatPart, lee: number, near: boolean): Sail {
  const tack: V3 = [0, 0.82, ALLMOGE_MAST_Z + 0.45];
  const throat: V3 = [lee * 0.14, 3.8, ALLMOGE_MAST_Z + 0.75];
  return { tack, head: throat, foot: [lee * 1.15, 0.24, -3.05], gaff: [lee * 0.5, 1.5, -2.95], rows: near ? 3 : 1, columns: near ? 3 : 1, camber: near ? 0.09 : 0, twist: 0.08, roachM: 0, lee, part };
}

/** An open allmogebåt, a double-ended clinker working boat of 6.2 m, with a tanned lug sail on a yard. */
export function buildAllmogebat({ state = "moored", mooring = "bow-to", sails = "tan", lee = 1, hull: topside = "pine" }: TraditionalOptions = {}): RoadsideModel {
  const hull = new Hull(ALLMOGE_HULL);
  const sailing = state === "sailing";
  const sail = sailPart(sails);
  const near = new BoatMesh();
  hull.skin(near, 8, ["tar", ...Array.from({ length: ALLMOGE_STRAKES }, () => topside)], (band) => (band % 2 === 0 ? 0.94 : 1.03));
  hull.hollow(near, 8, "pine-inside", 0.1, "pine-inside");
  hull.rail(near, 8, "tar", 0.05);
  for (const [z, half] of [[-1.5, 0.66], [-0.2, 0.82], [ALLMOGE_MAST_Z, 0.76], [2, 0.42]] as const) near.box([-half, 0.38, z - 0.1], [half, 0.42, z + 0.1], "spar-wood", { open: true });
  near.face([[0, 1.15, -3.15], [0, 1.15, -3.38], [0, -0.2, -3.1], [0, -0.2, -2.7]], "tar");
  near.tube([0, 1.1, -3.25], [0, 1.2, -2.1], 0.02, 3, {}, "spar-wood");
  near.tube([0, 0.2, ALLMOGE_MAST_Z], [0, ALLMOGE_MAST_Y, ALLMOGE_MAST_Z], 0.055, 5, { radiusTo: 0.035, cap: true }, "spar-wood");
  near.line([0, ALLMOGE_MAST_Y - 0.4, ALLMOGE_MAST_Z], [0, 1.05, 3.05], "rope");
  for (const side of [-1, 1]) near.line([0, ALLMOGE_MAST_Y - 0.5, ALLMOGE_MAST_Z], [side * 0.88, 0.62, ALLMOGE_MAST_Z - 0.5], "rope");

  const far = farHull(new BoatMesh(), hull, topside, "pine-inside", 4);
  farMast(far, ALLMOGE_MAST_Z, 0.3, ALLMOGE_MAST_Y, 0.07, "spar-wood");

  if (sailing) {
    const lug = lugSail(sail, lee, true);
    nearSail(near, lug);
    const [throat, gaff] = [lug.head, lug.gaff ?? [0, 0, 0]];
    near.tube([throat[0], throat[1], throat[2]], [throat[0] + gaff[0], throat[1] + gaff[1], throat[2] + gaff[2]], 0.03, 3, { radiusTo: 0.02 }, "spar-wood");
    farSail(far, lugSail(sail, lee, false));
  } else {
    // The sail lowered and rolled on its yard, lying along the thwarts.
    near.tube([0.14, 0.56, 1.9], [0.14, 0.56, -2.2], 0.1, 5, { radiusTo: 0.08, cap: true }, sail);
    near.tube([0.14, 0.62, 2.2], [0.14, 0.62, -2.5], 0.028, 3, {}, "spar-wood");
    dressForMooring(near, hull, { mooring, fenderCount: 1 });
  }
  return finished({ near, far, swapM: 110, reachM: 900, rock: sailing ? 0.55 : 0.7, heelDeg: sailing ? 12 : 0, lee });
}
