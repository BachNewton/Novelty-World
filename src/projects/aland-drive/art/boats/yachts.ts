import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { dressForMooring, guardRails, type Mooring } from "./dress";
import { farHull, house, Hull, type House, type HullSpec } from "./hull";
import { BoatMesh, finished, type BoatPart } from "./mesh";
import { boomOut, coverPart, dodger, farMast, farSail, nearBermudan, nearSail, rolledJib, sailCover, sailPart, type BermudanRig, type CoverColour, type Sail, type SailColour } from "./rig";

/*
 * The Bermudan yachts, one builder over three specs: a Nordic Folkboat, a modern
 * cruiser of 33 ft and a larger one of 45 ft. Numbers are the boat's own where a class
 * has them. Folkboat: 7.68 m overall, 6.0 m on the water, 2.2 m beam, a main of P 8.8
 * by E 3.4 and a small three-quarter jib, 14.8 and 5.7 m². Clinker, with a raked
 * transom and spoon bow, a low cabin and a lot of sheer.
 */

export interface YachtOptions {
  state?: "moored" | "sailing";
  mooring?: Mooring;
  sails?: SailColour;
  cover?: CoverColour;
  /** Sailing: 1 blows to +x. */
  lee?: number;
  /** Sailing: how far the boom is out, and the heel that goes with it. A reach eases one and stands up the other. */
  trim?: "close" | "reach";
  hull?: BoatPart;
}

interface YachtSpec {
  hull: HullSpec;
  stations: number;
  /** A band of the shell's paint from the lowest level: antifoul, boot top, topsides. */
  bands: (topside: BoatPart) => readonly BoatPart[];
  shadeOf?: (band: number) => number;
  antifoul: BoatPart;
  deck: BoatPart;
  well: { from: number; to: number; halfM: number; floorY: number; floor: BoatPart; wall: BoatPart };
  cabin: House;
  rig: BermudanRig;
  /** The tiller or wheels. */
  helm: (mesh: BoatMesh, hull: Hull) => void;
  dress: (mesh: BoatMesh, hull: Hull) => void;
  /** The furled sail's bag's radius. */
  coverM: number;
  rolled: boolean;
  dodger: { z: number; y: number; halfM: number; tallM: number; longM: number } | null;
  transomExtra?: (mesh: BoatMesh, hull: Hull, topside: BoatPart) => void;
  fenders: number;
  rock: number;
  swapM: number;
  reachM: number;
  heelDeg: number;
}

const FOLKBOAT_STRAKES = 6;

const FOLKBOAT: YachtSpec = (() => {
  const below = -0.45;
  const sternAt = -3.84;
  const stemAt = 3.84;
  const strake = (index: number) => ({ up: 0.42 + (0.58 * index) / FOLKBOAT_STRAKES, stern: sternAt + 0.62 * (1 - index / FOLKBOAT_STRAKES), stem: stemAt - 1.02 * (1 - index / FOLKBOAT_STRAKES) ** 1.5, beam: 0.9 + (0.1 * index) / FOLKBOAT_STRAKES + (index % 2 === 0 ? 0 : 0.012), sharpen: 1 + 0.25 * (1 - index / FOLKBOAT_STRAKES) });
  const hull: HullSpec = {
    halfBeamM: 1.1,
    transom: true,
    plan: [[0, 0.6], [0.14, 0.8], [0.32, 0.96], [0.5, 1], [0.68, 0.9], [0.84, 0.56], [0.94, 0.24], [1, 0.02]],
    sheer: [[0, 0.8], [0.25, 0.68], [0.55, 0.64], [0.8, 0.76], [1, 0.98]],
    levels: [{ y: below, stern: -2.9, stem: 2.5, beam: 0.3, sharpen: 1.5 }, ...Array.from({ length: FOLKBOAT_STRAKES + 1 }, (_, index) => strake(index))],
  };
  const mastZ = 0.75;
  return {
    hull,
    stations: 9,
    bands: (topside) => ["antifoul-red", ...Array.from({ length: FOLKBOAT_STRAKES }, () => topside)],
    shadeOf: (band) => (band % 2 === 0 ? 0.95 : 1.02),
    antifoul: "antifoul-red",
    deck: "non-skid",
    well: { from: 1 / 9, to: 4 / 9, halfM: 0.62, floorY: 0.34, floor: "teak", wall: "gelcoat-warm" },
    cabin: { fromZ: -0.72, toZ: 1.85, halfFrom: 0.8, halfTo: 0.58, baseY: 0.64, topY: 1.08, rakeM: 0.25, part: "varnish", top: "non-skid", window: { low: 0.42, high: 0.72, from: 0.2, to: 0.72 } },
    rig: {
      mastZ,
      footY: 1.05,
      topY: 10.75,
      mastRadius: 0.075,
      boomY: 1.9,
      boomM: 3.4,
      hounceY: 8.1,
      stem: [0, 0.96, 3.7],
      stern: null,
      chainplate: { x: 1, y: 0.7, z: 0.45 },
      spreaders: [[5.1, 0.48]],
      mast: "spar-wood",
      jibFoot: [0.55, 0.15, -2.15],
      jibHeadY: 7.9,
    },
    helm: (mesh, built) => {
      const [, y] = built.point(built.top, 0.02, 1);
      mesh.face([[0, y + 0.1, -3.9], [0, y + 0.1, -3.72], [0, -0.1, -3.5], [0, -0.1, -3.95]], "varnish");
      mesh.tube([0, y + 0.14, -3.8], [0, y + 0.22, -2.6], 0.022, 3, { radiusTo: 0.015 }, "spar-wood");
    },
    dress: () => undefined,
    coverM: 0.15,
    rolled: false,
    dodger: { z: -0.72, y: 1.02, halfM: 0.62, tallM: 0.5, longM: 0.72 },
    fenders: 2,
    rock: 0.5,
    swapM: 150,
    reachM: 1300,
    heelDeg: 16,
  };
})();

function cruiserHull(lengthM: number, halfBeamM: number, freeboardM: number): HullSpec {
  const half = lengthM / 2;
  const tip = half - lengthM * 0.008;
  return {
    halfBeamM,
    transom: true,
    plan: [[0, 0.8], [0.15, 0.9], [0.4, 1], [0.6, 0.98], [0.78, 0.8], [0.9, 0.5], [0.97, 0.2], [1, 0.02]],
    sheer: [[0, freeboardM * 0.86], [0.3, freeboardM * 0.86], [0.6, freeboardM * 0.92], [1, freeboardM * 1.2]],
    levels: [
      { y: -0.6, stern: -half + lengthM * 0.09, stem: half - lengthM * 0.09, beam: 0.3, sharpen: 1.5 },
      { y: 0, stern: -half + lengthM * 0.05, stem: half - lengthM * 0.03, beam: 0.8, sharpen: 1.2 },
      { y: 0.09, stern: -half + lengthM * 0.04, stem: half - lengthM * 0.025, beam: 0.83, sharpen: 1.15 },
      { up: 0.72, stern: -half + lengthM * 0.008, stem: tip - lengthM * 0.005, beam: 0.98 },
      { up: 1, stern: -half, stem: tip, beam: 1 },
    ],
  };
}

const twinOrOneWheel = (wheels: number, zShare: number) => (mesh: BoatMesh, hull: Hull) => {
  const [x, y, z] = hull.point(hull.top, zShare, 1);
  const spots = wheels === 1 ? [0] : [-x * 0.48, x * 0.48];
  for (const at of spots) {
    mesh.tube([at, y - 0.38, z], [at, y + 0.1, z + 0.06], 0.035, 3, {}, "alu");
    mesh.tube([at - 0.03, y + 0.1, z + 0.06], [at + 0.03, y + 0.1, z + 0.06], 0.38, 6, { radiusTo: 0.38 }, "spar-black");
  }
};

const swimPlatform = (mesh: BoatMesh, hull: Hull, topside: BoatPart) => {
  const [x, , z] = hull.point(hull.top, 0, 1);
  mesh.face([[-x, 0.34, z], [x, 0.34, z], [x * 0.92, 0.36, z - 0.55], [-x * 0.92, 0.36, z - 0.55]], "teak");
  mesh.face([[-x, 0.34, z], [x, 0.34, z], [x, 0.14, z + 0.03], [-x, 0.14, z + 0.03]], topside, 0.9);
};

const CRUISER: YachtSpec = {
  hull: cruiserHull(10.05, 1.72, 1.2),
  stations: 9,
  bands: (topside) => ["antifoul-blue", "boot", topside, topside],
  antifoul: "antifoul-blue",
  deck: "non-skid",
  well: { from: 1 / 9, to: 3 / 9, halfM: 1.05, floorY: 0.72, floor: "teak", wall: "gelcoat" },
  cabin: { fromZ: -1.55, toZ: 2.35, halfFrom: 1.28, halfTo: 0.86, baseY: 1.05, topY: 1.5, rakeM: 0.9, tumbleM: 0.14, part: "gelcoat", window: { low: 0.34, high: 0.68, from: 0.14, to: 0.72 } },
  rig: {
    mastZ: 0.7,
    footY: 1.45,
    topY: 15,
    mastRadius: 0.1,
    boomY: 2.75,
    boomM: 4.3,
    hounceY: 13.5,
    stem: [0, 1.42, 4.92],
    stern: [0, 1.1, -4.9],
    chainplate: { x: 1.25, y: 1.1, z: 0.15 },
    spreaders: [[6.1, 0.86], [10.2, 0.55]],
    mast: "alu",
    jibFoot: [0.92, 0.12, -3.6],
    jibHeadY: 13.1,
  },
  helm: twinOrOneWheel(1, 0.17),
  dress: (mesh, hull) => guardRails(mesh, hull, [0.08, 0.26, 0.44, 0.62, 0.8, 0.94], 0.6),
  coverM: 0.21,
  rolled: true,
  dodger: { z: -1.48, y: 1.46, halfM: 0.82, tallM: 0.62, longM: 0.9 },
  transomExtra: swimPlatform,
  fenders: 3,
  rock: 0.3,
  swapM: 170,
  reachM: 1500,
  heelDeg: 15,
};

const LARGE: YachtSpec = {
  hull: cruiserHull(13.7, 2.15, 1.55),
  stations: 10,
  bands: (topside) => ["antifoul-blue", "boot", topside, topside],
  antifoul: "antifoul-blue",
  deck: "teak",
  well: { from: 0.1, to: 0.3, halfM: 1.4, floorY: 1.0, floor: "teak", wall: "gelcoat" },
  cabin: { fromZ: -2.4, toZ: 3.4, halfFrom: 1.62, halfTo: 1.05, baseY: 1.4, topY: 2.0, rakeM: 1.5, tumbleM: 0.2, part: "gelcoat", window: { low: 0.3, high: 0.76, from: 0.08, to: 0.82 } },
  rig: {
    mastZ: 1.1,
    footY: 1.95,
    topY: 21,
    mastRadius: 0.13,
    boomY: 3.75,
    boomM: 5.8,
    hounceY: 19.4,
    stem: [0, 1.82, 6.7],
    stern: [0, 1.4, -6.7],
    chainplate: { x: 1.65, y: 1.45, z: 0.4 },
    spreaders: [[7.3, 1.1], [12.5, 0.85], [16.4, 0.5]],
    mast: "alu",
    jibFoot: [1.2, 0.16, -5.2],
    jibHeadY: 18.9,
  },
  helm: twinOrOneWheel(2, 0.14),
  dress: (mesh, hull) => guardRails(mesh, hull, [0.06, 0.22, 0.38, 0.54, 0.7, 0.84, 0.95], 0.66),
  coverM: 0.28,
  rolled: true,
  dodger: { z: -2.32, y: 1.96, halfM: 1.12, tallM: 0.72, longM: 1.15 },
  transomExtra: swimPlatform,
  fenders: 4,
  rock: 0.2,
  swapM: 200,
  reachM: 1800,
  heelDeg: 13,
};

function mainOf(rig: BermudanRig, boom: V3, part: BoatPart, lee: number, near: boolean): Sail {
  return {
    tack: [0, rig.boomY + 0.06, rig.mastZ - 0.06],
    head: [0, rig.topY - 0.2, rig.mastZ - 0.06],
    foot: boom,
    rows: near ? 6 : 1,
    columns: near ? 3 : 1,
    camber: near ? 0.08 : 0,
    twist: 0.22,
    roachM: rig.boomM * 0.06,
    lee,
    part,
  };
}

function jibOf(rig: BermudanRig, part: BoatPart, lee: number, near: boolean): Sail {
  const [, , stemZ] = rig.stem;
  const headShare = (rig.jibHeadY - rig.stem[1]) / (rig.hounceY - rig.stem[1]);
  return {
    tack: [0, rig.stem[1] + 0.15, stemZ - 0.08],
    head: [0, rig.jibHeadY, stemZ + (rig.mastZ - stemZ) * headShare],
    foot: [rig.jibFoot[0] * lee, rig.jibFoot[1], rig.jibFoot[2]],
    rows: near ? 4 : 1,
    columns: near ? 3 : 1,
    camber: near ? 0.09 : 0,
    twist: 0.14,
    roachM: 0,
    lee,
    part,
  };
}

function buildYacht(spec: YachtSpec, { state = "moored", mooring = "bow-to", sails = "white", cover = "navy", lee = 1, trim = "close", hull: topside = "gelcoat" }: YachtOptions): RoadsideModel {
  const hull = new Hull(spec.hull);
  const { rig } = spec;
  const sailing = state === "sailing";
  const sail = sailPart(sails);
  const boom = boomOut(rig.boomM, sailing ? (trim === "close" ? 9 : 34) : 0, lee, sailing ? -0.1 : 0);
  const near = new BoatMesh();
  hull.skin(near, spec.stations, spec.bands(topside), spec.shadeOf);
  hull.deck(near, spec.stations, spec.deck, spec.well);
  house(near, spec.cabin);
  hull.rail(near, spec.stations, "teak", 0.04);
  spec.transomExtra?.(near, hull, topside);
  spec.helm(near, hull);
  spec.dress(near, hull);
  nearBermudan(near, rig, boom);

  const far = farHull(new BoatMesh(), hull, topside, spec.deck);
  far.box([-spec.cabin.halfFrom * 0.9, spec.cabin.baseY - 0.1, spec.cabin.fromZ], [spec.cabin.halfFrom * 0.9, spec.cabin.topY, spec.cabin.toZ - (spec.cabin.rakeM ?? 0.2)], spec.cabin.part, { open: true });
  farMast(far, rig.mastZ, rig.footY, rig.topY, rig.mastRadius * 1.2, rig.mast);

  if (sailing) {
    nearSail(near, mainOf(rig, boom, sail, lee, true));
    nearSail(near, jibOf(rig, sail, lee, true));
    farSail(far, mainOf(rig, boom, sail, lee, false));
    farSail(far, jibOf(rig, sail, lee, false));
  } else {
    const coverPaint = coverPart(cover);
    sailCover(near, rig.mastZ, rig.boomY, rig.boomM, spec.coverM, coverPaint);
    if (spec.rolled) {
      rolledJib(near, rig.stem, [0, rig.hounceY, rig.mastZ], "sail-white");
      near.line([rig.stem[0], rig.stem[1] + 0.3, rig.stem[2] - 0.2], [0, rig.stem[1], rig.stem[2] - 0.6], "rope");
    }
    if (spec.dodger !== null) dodger(near, spec.dodger.z, spec.dodger.y, spec.dodger.halfM, spec.dodger.tallM, spec.dodger.longM, coverPaint);
    near.line([0, rig.topY - 0.1, rig.mastZ], [0, rig.boomY + spec.coverM, rig.mastZ - rig.boomM * 0.95], "rope");
    dressForMooring(near, hull, { mooring, fenderCount: spec.fenders });
    far.tube([0, rig.boomY + spec.coverM * 0.5, rig.mastZ], [0, rig.boomY + spec.coverM * 0.5, rig.mastZ - rig.boomM * 0.92], spec.coverM, 3, {}, coverPaint);
  }
  return finished({ near, far, swapM: spec.swapM, reachM: spec.reachM, rock: spec.rock * (sailing ? 0.6 : 1), heelDeg: sailing ? (trim === "close" ? spec.heelDeg : spec.heelDeg * 0.55) : 0, lee });
}

/** A Nordic Folkboat: clinker, 7.68 m. Moored, its main is under a cover and its jib bagged below. */
export const buildFolkboat = (options: YachtOptions = {}) => buildYacht(FOLKBOAT, { sails: "cream", hull: "gelcoat-warm", ...options });
/** A modern cruising sloop of 33 ft: a plumb stem, wide stern, swim platform, fractional rig with a backstay and a roller genoa. */
export const buildCruiser = (options: YachtOptions = {}) => buildYacht(CRUISER, options);
/** A larger cruising yacht of 45 ft: as the cruiser with twin wheels, three spreaders and a teak deck. */
export const buildLargeCruiser = (options: YachtOptions = {}) => buildYacht(LARGE, { hull: "navy", ...options });
