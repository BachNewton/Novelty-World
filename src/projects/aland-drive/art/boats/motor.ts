import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { dressForMooring, guardRails, type Mooring } from "./dress";
import { farHull, house, Hull, lerp, type HullSpec } from "./hull";
import { BoatMesh, finished, type BoatPart } from "./mesh";
import { farMast } from "./rig";

/*
 * The boats under power. A hull here is hard-chined: a level at the chine, flaring to
 * the sheer, a sharp entry, the flat stern a planing or semi-planing boat has.
 * Lengths are real boats': a Swedish clinker mahogany launch of about 7.25 by 2.25 m,
 * a Finnish lifeboat of 10.1 by 3.2 m, a pilot boat of 16.3 by 5 m. Hull colours of
 * the two service boats are the art's call, in the high-visibility family such boats
 * belong to, with no operator's marks; the pilot boat carries only the generic word.
 */

export interface MotorOptions {
  mooring?: Mooring;
  hull?: BoatPart;
}

interface PowerHull {
  lengthM: number;
  halfBeamM: number;
  sternY: number;
  midY: number;
  bowY: number;
  /** Where the stem meets the water, as a share of the length back from the bow's sheer. */
  rakeShare: number;
  belowM: number;
}

function powerHull({ lengthM, halfBeamM, sternY, midY, bowY, rakeShare, belowM }: PowerHull): HullSpec {
  const half = lengthM / 2;
  return {
    halfBeamM,
    transom: true,
    plan: [[0, 0.88], [0.3, 0.97], [0.55, 1], [0.76, 0.86], [0.9, 0.54], [0.97, 0.24], [1, 0.02]],
    sheer: [[0, sternY], [0.45, midY], [0.8, lerp(midY, bowY, 0.5)], [1, bowY]],
    levels: [
      { y: belowM, stern: -half + 0.1, stem: half - lengthM * (rakeShare + 0.08), beam: 0.36, sharpen: 1.5 },
      { y: 0, stern: -half + 0.04, stem: half - lengthM * rakeShare, beam: 0.8, sharpen: 1.3 },
      { up: 0.42, stern: -half + 0.02, stem: half - lengthM * rakeShare * 0.45, beam: 0.92, sharpen: 1.1 },
      { up: 1, stern: -half, stem: half, beam: 1 },
    ],
  };
}

/** A stool of a sort: a box with a padded top. */
const seat = (mesh: BoatMesh, x: number, y: number, z: number, wide: number, deep: number, tall: number, part: BoatPart) => mesh.box([x - wide / 2, y, z - deep / 2], [x + wide / 2, y + tall, z + deep / 2], part, { open: true, shadeTop: 1.08 });

function ensign(mesh: BoatMesh, z: number, y: number): void {
  mesh.tube([0, y - 0.1, z], [0, y + 1, z - 0.2], 0.012, 3, {}, "spar-wood");
  mesh.face([[0, y + 0.98, z - 0.2], [0, y + 0.58, z - 0.14], [0.03, y + 0.5, z - 0.82], [0.05, y + 0.84, z - 0.86]], "sail-blue");
}

function mooredIn(near: BoatMesh, hull: Hull, mooring: Mooring, fenderCount: number): void {
  dressForMooring(near, hull, { mooring, side: 1, fenderCount });
}

const LAUNCH = new Hull(powerHull({ lengthM: 7.25, halfBeamM: 1.12, sternY: 0.72, midY: 0.74, bowY: 1.05, rakeShare: 0.07, belowM: -0.3 }));

/** A Swedish-style open wooden motorboat: varnished mahogany, a long foredeck, windscreen, and a bench each side of the engine box. */
export function buildLaunch({ mooring = "bow-to", hull: planking = "mahogany" }: MotorOptions = {}): RoadsideModel {
  const hull = LAUNCH;
  const near = new BoatMesh();
  hull.skin(near, 8, ["antifoul-red", planking, planking], (band) => (band === 2 ? 1.06 : 1));
  const foreShare = 0.56;
  hull.hollow(near, 8, "varnish", 0.24, "teak");
  // Foredeck and short afterdeck, laid over the open boat.
  const deckBetween = (from: number, to: number, part: BoatPart) => {
    const stations = 4;
    for (let station = 0; station < stations; station++) {
      const [a, b] = [lerp(from, to, station / stations), lerp(from, to, (station + 1) / stations)];
      near.face([hull.point(hull.top, a, -1), hull.point(hull.top, b, -1), hull.point(hull.top, b, 1), hull.point(hull.top, a, 1)], part, station % 2 === 0 ? 1 : 1.05);
    }
  };
  deckBetween(foreShare, 1, "varnish");
  deckBetween(0, 0.12, "varnish");
  hull.rail(near, 8, "spar-wood", 0.05);
  const [screenX, screenY, screenZ] = hull.point(hull.top, foreShare, 1);
  near.face([[-screenX * 0.92, screenY, screenZ], [screenX * 0.92, screenY, screenZ], [screenX * 0.72, screenY + 0.42, screenZ - 0.24], [-screenX * 0.72, screenY + 0.42, screenZ - 0.24]], "glass");
  for (const side of [-1, 1]) near.tube([side * screenX * 0.92, screenY, screenZ], [side * screenX * 0.72, screenY + 0.44, screenZ - 0.24], 0.018, 3, {}, "alu");
  near.box([-0.45, 0.24, -1.9], [0.45, 0.72, -0.4], "varnish", { open: true, shadeTop: 1.1 });
  for (const side of [-1, 1]) seat(near, side * 0.72, 0.24, -1.1, 0.46, 2.1, 0.32, "cover-red");
  seat(near, 0, 0.24, 0.45, 1.5, 0.5, 0.34, "cover-red");
  near.tube([0.42, 0.74, 0.92], [0.42, 0.94, 0.78], 0.16, 7, {}, "gelcoat-warm");
  ensign(near, -3.5, 0.8);
  mooredIn(near, hull, mooring, 2);
  const far = farHull(new BoatMesh(), hull, planking, "varnish", 3);
  far.face([[-0.8, 0.8, screenZ], [0.8, 0.8, screenZ], [0.62, 1.2, screenZ - 0.24], [-0.62, 1.2, screenZ - 0.24]], "glass");
  return finished({ near, far, swapM: 110, reachM: 900, rock: 0.5 });
}

const RIB_HULL = new Hull(powerHull({ lengthM: 6.5, halfBeamM: 1.02, sternY: 0.58, midY: 0.6, bowY: 0.82, rakeShare: 0.12, belowM: -0.25 }));
const TUBE_RADIUS_M = 0.26;

/** The collar round a RIB: tube segments along the sheer, from the stern round the nose. */
function collar(mesh: BoatMesh, hull: Hull, part: BoatPart): void {
  const shares = [0, 0.18, 0.36, 0.54, 0.7, 0.82, 0.92, 0.985];
  for (const side of [-1, 1]) {
    const along = shares.map((share): V3 => {
      const [x, y, z] = hull.point(hull.top, share, side);
      return [x + side * TUBE_RADIUS_M * 0.7, y, z];
    });
    for (let index = 0; index + 1 < along.length; index++) mesh.tube(along[index], along[index + 1], TUBE_RADIUS_M * (index < 4 ? 1 : 0.93 - index * 0.03), 5, { radiusTo: TUBE_RADIUS_M * (index < 3 ? 1 : 0.93 - (index + 1) * 0.03) }, part);
    const [x, y, z] = along[0];
    mesh.tube([x, y, z], [x, y + 0.06, z - 0.38], TUBE_RADIUS_M, 5, { radiusTo: TUBE_RADIUS_M * 0.8, cap: true }, part);
  }
}

/** A modern RIB of 6.5 m: grey collar, centre console, jockey seat and one outboard. */
export function buildRib({ mooring = "alongside", hull: shell = "gelcoat" }: MotorOptions = {}): RoadsideModel {
  const hull = RIB_HULL;
  const near = new BoatMesh();
  hull.skin(near, 6, ["antifoul-blue", shell, shell]);
  hull.deck(near, 6, "non-skid");
  collar(near, hull, "rib-tube");
  near.box([-0.42, 0.58, -0.25], [0.42, 1.36, 0.65], "gelcoat", { open: true, shadeTop: 1.05 });
  near.face([[-0.42, 1.36, 0.45], [0.42, 1.36, 0.45], [0.36, 1.74, 0.26], [-0.36, 1.74, 0.26]], "glass");
  seat(near, 0, 0.58, -1, 0.56, 0.6, 0.46, "rib-tube");
  near.box([-0.28, 1.04, -1.25], [0.28, 1.16, -0.75], "rib-tube", { shadeTop: 1.2 });
  near.tube([0.14, 1.36, 0.25], [0.14, 1.42, 0.1], 0.17, 6, {}, "spar-black");
  // The arch aft, with its light.
  for (const side of [-1, 1]) near.tube([side * 0.85, 0.62, -2.1], [side * 0.45, 2.05, -2.1], 0.028, 3, {}, "alu");
  near.tube([-0.45, 2.05, -2.1], [0.45, 2.05, -2.1], 0.028, 3, {}, "alu");
  near.tube([0, 2.05, -2.1], [0, 2.5, -2.1], 0.014, 3, {}, "alu");
  // The outboard, on the transom.
  near.box([-0.24, 0.68, -3.72], [0.24, 1.2, -3.26], "engine", { shadeTop: 1.4 });
  near.tube([0, 0.7, -3.5], [0, -0.3, -3.55], 0.12, 4, { radiusTo: 0.06 }, "engine");
  mooredIn(near, hull, mooring, 0);
  const far = farHull(new BoatMesh(), hull, "rib-tube", "non-skid", 3);
  far.box([-0.42, 0.58, -0.25], [0.42, 1.7, 0.65], "gelcoat", { open: true });
  far.box([-0.24, 0.6, -3.7], [0.24, 1.2, -3.26], "engine", { open: true });
  return finished({ near, far, swapM: 100, reachM: 900, rock: 0.6 });
}

const FISHING_HULL = new Hull(powerHull({ lengthM: 8.8, halfBeamM: 1.45, sternY: 0.95, midY: 0.95, bowY: 1.75, rakeShare: 0.03, belowM: -0.4 }));

/** A small inshore fishing boat, 8.8 m: wheelhouse aft, a net hauler on the working deck forward of it, a mast and dan flags. */
export function buildFishingBoat({ mooring = "alongside", hull: shell = "fisher-blue" }: MotorOptions = {}): RoadsideModel {
  const hull = FISHING_HULL;
  const near = new BoatMesh();
  hull.skin(near, 8, ["antifoul-red", shell, shell], (band) => (band === 2 ? 1.04 : 1));
  hull.deck(near, 8, "hull-grey");
  hull.rail(near, 8, "gelcoat", 0.36);
  house(near, { fromZ: -2.9, toZ: -0.9, halfFrom: 1.02, halfTo: 0.96, baseY: 0.9, topY: 2.75, rakeM: -0.14, tumbleM: 0.06, part: "gelcoat", top: "hull-grey", window: { low: 0.56, high: 0.84, from: 0.12, to: 0.84 }, front: { low: 0.56, high: 0.86 } });
  near.box([-0.44, 0.95, 1.1], [0.44, 1.32, 2.1], "alu", { open: true, shadeTop: 1.06 });
  near.tube([0.64, 1, 2.55], [0.64, 1.72, 2.72], 0.05, 4, {}, "alu");
  near.tube([0.5, 1.72, 2.72], [0.8, 1.72, 2.72], 0.16, 6, {}, "engine");
  for (const [x, z] of [[-0.6, -0.1], [0.6, 0.2]] as const) near.box([x - 0.3, 0.95, z - 0.25], [x + 0.3, 1.25, z + 0.25], "fender-blue", { open: true, shadeTop: 1.1 });
  near.tube([0, 2.75, -2.4], [0, 6.4, -2.4], 0.05, 4, { radiusTo: 0.03, cap: true }, "alu");
  near.tube([0, 3.9, -2.35], [0.01, 3.72, 0.8], 0.03, 3, {}, "alu");
  near.line([0, 5.9, -2.4], [0, 1.72, 4.1]).line([0, 5.9, -2.4], [0, 3.72, 0.8]).line([0, 4.4, -2.4], [-1.25, 1.2, -2.2]).line([0, 4.4, -2.4], [1.25, 1.2, -2.2]);
  near.box([-0.28, 2.75, -2.1], [0.28, 2.82, -1.6], "gelcoat", { shadeTop: 1.04 });
  for (const [z, part] of [[-3.5, "sail-red"], [-3.65, "sail-red"]] as const) {
    near.tube([0.9, 0.9, z], [0.92, 3.4, z - 0.2], 0.012, 3, {}, "spar-black");
    near.face([[0.92, 3.4, z - 0.2], [0.92, 3, z - 0.18], [0.92, 3.1, z - 0.62], [0.92, 3.4, z - 0.66]], part);
  }
  mooredIn(near, hull, mooring, 3);
  const far = farHull(new BoatMesh(), hull, shell, "hull-grey", 3);
  far.box([-1, 0.9, -2.9], [1, 2.75, -0.9], "gelcoat", { open: true });
  farMast(far, -2.4, 2.75, 6.4, 0.06, "alu");
  return finished({ near, far, swapM: 130, reachM: 1200, rock: 0.34 });
}

const RESCUE_HULL = new Hull(powerHull({ lengthM: 10.1, halfBeamM: 1.6, sternY: 0.95, midY: 1.02, bowY: 1.75, rakeShare: 0.05, belowM: -0.4 }));

/** A rubbing collar, the black foam fender a working boat wears at the sheer. */
function fenderBand(mesh: BoatMesh, hull: Hull, stations: number, part: BoatPart, drop: number, proud: number): void {
  for (let station = 0; station < stations; station++) {
    const [a, b] = [station / stations, (station + 1) / stations];
    for (const side of [-1, 1]) {
      const push = ([x, y, z]: V3): V3 => [x + side * proud, y, z];
      const [from, to] = [push(hull.point(hull.top, a, side)), push(hull.point(hull.top, b, side))];
      const low = (corner: V3): V3 => [corner[0], corner[1] - drop, corner[2]];
      mesh.face([from, to, low(to), low(from)], part);
      mesh.face([from, to, [to[0] - side * proud * 1.5, to[1], to[2]], [from[0] - side * proud * 1.5, from[1], from[2]]], part, 1.1);
    }
  }
}

/** An orange sea-rescue boat of 10 m: aluminium-built, a fender band, a raked wheelhouse forward of the working deck, a radar arch and a blue beacon. */
export function buildRescueBoat({ mooring = "alongside", hull: shell = "rescue" }: MotorOptions = {}): RoadsideModel {
  const hull = RESCUE_HULL;
  const near = new BoatMesh();
  hull.skin(near, 8, ["antifoul-blue", shell, shell]);
  hull.deck(near, 8, "non-skid");
  fenderBand(near, hull, 8, "rib-tube", 0.34, 0.1);
  house(near, { fromZ: -1.2, toZ: 2, halfFrom: 1.12, halfTo: 1, baseY: 1.05, topY: 2.95, rakeM: 0.42, tumbleM: 0.12, part: shell, top: "gelcoat", window: { low: 0.52, high: 0.86, from: 0.08, to: 0.9 }, front: { low: 0.52, high: 0.88 } });
  guardRails(near, hull, [0.06, 0.2, 0.34, 0.74, 0.86, 0.95], 0.7);
  for (const side of [-1, 1]) near.tube([side * 0.82, 2.95, -0.8], [side * 0.55, 4.2, -0.8], 0.05, 4, { radiusTo: 0.04 }, "alu");
  near.tube([-0.55, 4.2, -0.8], [0.55, 4.2, -0.8], 0.04, 3, {}, "alu");
  near.box([-0.55, 4.26, -1.02], [0.55, 4.34, -0.72], "gelcoat", { shadeTop: 1.04 });
  near.tube([0, 4.2, -0.8], [0, 4.62, -0.8], 0.11, 5, { radiusTo: 0.09, cap: true }, "beacon");
  near.tube([0.32, 4.2, -0.8], [0.32, 6, -0.8], 0.012, 3, {}, "spar-black");
  near.tube([-0.32, 4.2, -0.8], [-0.32, 5.2, -0.8], 0.012, 3, {}, "spar-black");
  // A hatch and towing post on the after deck.
  near.box([-0.5, 1, -3.2], [0.5, 1.2, -2.2], "alu", { open: true });
  near.tube([0, 1, -4.2], [0, 1.72, -4.2], 0.08, 5, { cap: true }, "alu");
  near.face([[-1.3, 0.34, -5.05], [1.3, 0.34, -5.05], [1.25, 0.36, -5.45], [-1.25, 0.36, -5.45]], "alu");
  mooredIn(near, hull, mooring, 0);
  const far = farHull(new BoatMesh(), hull, shell, "non-skid", 3);
  far.box([-1.05, 1, -1.2], [1.05, 2.95, 1.7], shell, { open: true });
  far.tube([0, 2.95, -0.8], [0, 4.6, -0.8], 0.12, 3, {}, "alu");
  return finished({ near, far, swapM: 160, reachM: 1600, rock: 0.24 });
}

const PILOT_HULL = new Hull(powerHull({ lengthM: 16.3, halfBeamM: 2.5, sternY: 1.35, midY: 1.4, bowY: 2.6, rakeShare: 0.05, belowM: -0.5 }));

/** Upright rectangles of a generic word, on a unit tall line: left, bottom, width, height. */
const PILOT_WORD = [[0, 0, 0.2, 1], [0.2, 0.8, 0.45, 0.2], [0.2, 0.4, 0.45, 0.2], [0.65, 0.4, 0.2, 0.6], [1.1, 0, 0.2, 1], [1.55, 0, 0.2, 1], [1.75, 0, 0.45, 0.2], [2.4, 0, 0.2, 1], [2.6, 0.8, 0.4, 0.2], [2.6, 0, 0.4, 0.2], [3, 0, 0.2, 1], [3.45, 0.8, 0.9, 0.2], [3.8, 0, 0.2, 0.8]] as const;

function lettering(mesh: BoatMesh, side: number, x: number, y: number, z: number, tallM: number, part: BoatPart): void {
  for (const [left, bottom, wide, high] of PILOT_WORD) {
    const at = (a: number, b: number): V3 => [x, y + b * tallM, z - side * a * tallM];
    mesh.face([at(left, bottom), at(left + wide, bottom), at(left + wide, bottom + high), at(left, bottom + high)], part);
  }
}

/** A pilot boat of 16 m: a black hull with a strong sheer forward, a high-visibility house amidships with a wide bridge, and the word on its side. */
export function buildPilotBoat({ mooring = "alongside", hull: shell = "tar" }: MotorOptions = {}): RoadsideModel {
  const hull = PILOT_HULL;
  const near = new BoatMesh();
  hull.skin(near, 9, ["antifoul-red", shell, shell]);
  hull.deck(near, 9, "hull-grey");
  fenderBand(near, hull, 9, "rib-tube", 0.42, 0.13);
  house(near, { fromZ: -2.4, toZ: 3.3, halfFrom: 1.75, halfTo: 1.55, baseY: 1.5, topY: 3.9, rakeM: 0.35, tumbleM: 0.14, part: "pilot", top: "gelcoat", window: { low: 0.6, high: 0.88, from: 0.05, to: 0.9 }, front: { low: 0.56, high: 0.9 } });
  house(near, { fromZ: -1.6, toZ: 1.6, halfFrom: 1.3, halfTo: 1.25, baseY: 3.9, topY: 5, rakeM: 0.45, tumbleM: 0.1, part: "pilot", top: "gelcoat", window: { low: 0.34, high: 0.9, from: 0.06, to: 0.92 }, front: { low: 0.3, high: 0.92 } });
  guardRails(near, hull, [0.04, 0.16, 0.28, 0.74, 0.84, 0.93], 0.85);
  for (const side of [-1, 1]) lettering(near, side, side * 1.72, 2.05, 1.3, 0.62, "gelcoat");
  near.tube([0, 5, -0.8], [0, 7.6, -0.8], 0.09, 5, { radiusTo: 0.05, cap: true }, "alu");
  near.box([-0.7, 6.4, -1.05], [0.7, 6.5, -0.65], "gelcoat", { shadeTop: 1.04 });
  near.tube([0.9, 5, -1.2], [0.9, 7, -1.2], 0.012, 3, {}, "spar-black");
  near.tube([-0.9, 5, -1.2], [-0.9, 5.9, -1.2], 0.012, 3, {}, "spar-black");
  near.box([-1.6, 1.45, -6.6], [1.6, 1.75, -5.2], "alu", { open: true, shadeTop: 1.04 });
  mooredIn(near, hull, mooring, 0);
  const far = farHull(new BoatMesh(), hull, shell, "hull-grey", 3);
  far.box([-1.7, 1.4, -2.4], [1.7, 3.9, 3], "pilot", { open: true });
  far.box([-1.25, 3.9, -1.6], [1.25, 5, 1.2], "pilot", { open: true });
  farMast(far, -0.8, 5, 7.6, 0.1, "alu");
  return finished({ near, far, swapM: 200, reachM: 2000, rock: 0.14 });
}

const PASSENGER_HULL = new Hull({
  halfBeamM: 2.6,
  transom: true,
  plan: [[0, 0.74], [0.14, 0.92], [0.4, 1], [0.68, 0.98], [0.86, 0.68], [0.96, 0.28], [1, 0.02]],
  sheer: [[0, 1.5], [0.4, 1.32], [0.8, 1.55], [1, 2.1]],
  levels: [
    { y: -0.5, stern: -8.4, stem: 8.7, beam: 0.5, sharpen: 1.4 },
    { y: 0, stern: -8.9, stem: 9.3, beam: 0.8, sharpen: 1.2 },
    { y: 0.12, stern: -9, stem: 9.35, beam: 0.82, sharpen: 1.18 },
    { up: 0.7, stern: -9.4, stem: 9.5, beam: 0.97, sharpen: 1.02 },
    { up: 1, stern: -9.6, stem: 9.6, beam: 1 },
  ],
});

/** A small archipelago passenger boat of 19 m: white, a long saloon with a band of windows, an open upper deck under an awning, wheelhouse forward, one funnel. */
export function buildPassengerBoat({ mooring = "alongside", hull: shell = "gelcoat" }: MotorOptions = {}): RoadsideModel {
  const hull = PASSENGER_HULL;
  const near = new BoatMesh();
  hull.skin(near, 10, ["antifoul-red", "boot", shell, "navy"], (band) => (band === 3 ? 1.1 : 1));
  hull.deck(near, 10, "teak");
  house(near, { fromZ: -6.4, toZ: 4.4, halfFrom: 2.1, halfTo: 1.85, baseY: 1.2, topY: 3.5, rakeM: 0.2, tumbleM: 0.04, part: shell, top: "teak", window: { low: 0.42, high: 0.8, from: 0.04, to: 0.97 }, front: { low: 0.5, high: 0.82 } });
  house(near, { fromZ: 1.8, toZ: 4.2, halfFrom: 1.5, halfTo: 1.3, baseY: 3.5, topY: 5.3, rakeM: 0.3, tumbleM: 0.08, part: shell, top: "gelcoat-warm", window: { low: 0.45, high: 0.88, from: 0.08, to: 0.92 }, front: { low: 0.42, high: 0.9 } });
  // The awning on its posts, and the benches under it.
  for (const z of [-5.9, -3.3, -0.7]) for (const side of [-1, 1]) near.tube([side * 1.9, 3.5, z], [side * 1.85, 5.25, z], 0.03, 3, {}, "alu");
  near.face([[-1.95, 5.25, -6.2], [1.95, 5.25, -6.2], [1.95, 5.32, 1.7], [-1.95, 5.32, 1.7]], "sail-white");
  for (const side of [-1, 1]) near.face([[side * 1.95, 5.25, -6.2], [side * 1.95, 5.32, 1.7], [side * 1.95, 5.1, 1.7], [side * 1.95, 5.05, -6.2]], "cover-navy");
  for (const z of [-5, -3, -1, 1]) near.box([-1.5, 3.5, z - 0.2], [1.5, 3.95, z + 0.2], "teak", { open: true });
  for (const [from, to] of [[-6.3, 1.7]] as const) for (const side of [-1, 1]) near.line([side * 2.02, 4.5, from], [side * 2.02, 4.5, to]);
  near.tube([0, 3.5, 0.9], [0, 4.5, 0.9], 0.34, 7, { cap: true }, "navy");
  near.tube([0, 4.5, 0.9], [0, 4.9, 0.9], 0.34, 7, { cap: true }, "sail-red");
  near.tube([0, 5.3, 3], [0, 8, 3], 0.05, 4, { radiusTo: 0.03, cap: true }, "alu");
  near.line([0, 7.6, 3], [0, 2.05, 9.5]).line([0, 7.6, 3], [0, 5.3, -6.2]);
  guardRails(near, hull, [0.05, 0.14, 0.72, 0.8, 0.88, 0.95], 0.95);
  mooredIn(near, hull, mooring, 3);
  ensign(near, -9.4, 1.6);
  const far = farHull(new BoatMesh(), hull, shell, "teak", 3);
  far.box([-2.05, 1.2, -6.4], [2.05, 3.5, 4.3], shell, { open: true });
  far.box([-1.4, 3.5, 1.8], [1.4, 5.3, 4], shell, { open: true });
  far.face([[-1.95, 5.25, -6.2], [1.95, 5.25, -6.2], [1.95, 5.32, 1.7], [-1.95, 5.32, 1.7]], "sail-white");
  far.face([[1.95, 3.5, -6.2], [1.95, 3.5, 1.7], [1.95, 5.3, 1.7], [1.95, 5.3, -6.2]], "cover-navy", 0.4);
  return finished({ near, far, swapM: 230, reachM: 2400, rock: 0.1 });
}
