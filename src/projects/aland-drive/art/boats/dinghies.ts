import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { farHull, Hull, type HullSpec } from "./hull";
import { BoatMesh, finished } from "./mesh";
import { boomOut, farMast, farSail, nearSail, sailPart, type Sail, type SailColour } from "./rig";

/*
 * Two small dinghies. An Optimist is a pram: 2.3 m overall, 1.13 m beam, flat-bottomed
 * and hard-chined with a square bow, a 2.26 m mast and a sprit sail of 3.3 m². A
 * Laser-type single-hander is 4.2 m overall, 1.4 m beam, with an unstayed mast of about
 * 6.4 m and a sleeved sail of about 7 m². Moored, each is bare: nobody leaves a dinghy's
 * sail up, so it lies on a running mooring with its mast alone.
 */

export interface DinghyOptions {
  state?: "moored" | "sailing";
  sails?: SailColour;
  lee?: number;
}

const OPTIMIST: HullSpec = {
  halfBeamM: 0.565,
  transom: true,
  plan: [[0, 0.82], [0.35, 1], [0.7, 0.92], [1, 0.62]],
  sheer: [[0, 0.32], [0.5, 0.3], [1, 0.36]],
  levels: [
    { y: -0.06, stern: -1.0, stem: 0.92, beam: 0.72 },
    { y: 0.06, stern: -1.1, stem: 1.1, beam: 0.8 },
    { up: 1, stern: -1.15, stem: 1.15, beam: 1 },
  ],
};
const OPTI_MAST_Z = 0.55;
const OPTI_MAST_M = 2.26;
const OPTI_BOOM_Y = 0.58;

function spritsail(lee: number, colour: SailColour, near: boolean): Sail {
  return {
    tack: [0, OPTI_BOOM_Y, OPTI_MAST_Z - 0.04],
    head: [0, OPTI_MAST_M + 0.08, OPTI_MAST_Z - 0.04],
    foot: boomOut(1.85, 24, lee),
    gaff: boomOut(1.28, 30, lee, -0.3),
    rows: near ? 3 : 1,
    columns: near ? 3 : 1,
    camber: near ? 0.1 : 0,
    twist: 0.1,
    roachM: 0,
    lee,
    part: sailPart(colour),
  };
}

/** An Optimist pram. Her sprit runs from low on the mast to the peak of the sail. */
export function buildOptimist({ state = "moored", sails = "white", lee = 1 }: DinghyOptions = {}): RoadsideModel {
  const hull = new Hull(OPTIMIST);
  const sailing = state === "sailing";
  const near = new BoatMesh();
  hull.skin(near, 5, ["gelcoat", "gelcoat"]);
  hull.hollow(near, 5, "gelcoat-warm", 0.06, "gelcoat-warm");
  hull.rail(near, 5, "pine", 0.03);
  // The square pram bow, the thwart, and the mast.
  const [x, y, z] = hull.point(hull.top, 1, 1);
  near.face([[-x, y, z], [x, y, z], [x * 0.8, -0.05, 0.94], [-x * 0.8, -0.05, 0.94]], "gelcoat", 0.97);
  near.box([-0.5, 0.2, 0.42], [0.5, 0.25, 0.68], "pine", { open: true });
  near.tube([0, 0.1, OPTI_MAST_Z], [0, OPTI_MAST_M, OPTI_MAST_Z], 0.022, 4, { radiusTo: 0.018, cap: true }, "alu");
  const far = farHull(new BoatMesh(), hull, "gelcoat", "gelcoat-warm", 2);
  farMast(far, OPTI_MAST_Z, 0.1, OPTI_MAST_M, 0.03, "alu");
  if (sailing) {
    const sail = spritsail(lee, sails, true);
    nearSail(near, sail);
    const boom = sail.foot;
    near.tube(sail.tack, [sail.tack[0] + boom[0], sail.tack[1], sail.tack[2] + boom[2]], 0.016, 3, {}, "alu");
    const peak: V3 = [sail.head[0] + (sail.gaff?.[0] ?? 0), sail.head[1] + (sail.gaff?.[1] ?? 0), sail.head[2] + (sail.gaff?.[2] ?? 0)];
    near.tube([0, 0.82, OPTI_MAST_Z - 0.03], peak, 0.015, 3, {}, "alu");
    near.box([-0.03, -0.3, -0.4], [0.03, 0.1, -0.1], "gelcoat-warm", { open: true });
    near.face([[0, 0.3, -1.18], [0, 0.3, -1.42], [0, -0.3, -1.42], [0, -0.3, -1.16]], "gelcoat-warm");
    near.tube([0, 0.36, -1.22], [0, 0.42, -0.55], 0.012, 3, {}, "pine");
    farSail(far, spritsail(lee, sails, false));
  }
  return finished({ near, far, swapM: 70, reachM: 520, rock: 1, heelDeg: sailing ? 10 : 0, lee });
}

const LASER: HullSpec = {
  halfBeamM: 0.7,
  transom: true,
  plan: [[0, 0.84], [0.2, 0.96], [0.45, 1], [0.7, 0.8], [0.88, 0.42], [1, 0.03]],
  sheer: [[0, 0.3], [0.5, 0.33], [0.85, 0.37], [1, 0.42]],
  levels: [
    { y: -0.14, stern: -1.8, stem: 1.8, beam: 0.6, sharpen: 1.3 },
    { y: 0.02, stern: -2.03, stem: 1.96, beam: 0.8, sharpen: 1.1 },
    { up: 0.88, stern: -2.1, stem: 2.1, beam: 1 },
    { up: 1, stern: -2.11, stem: 2.11, beam: 0.97 },
  ],
};
const LASER_MAST_Z = 0.95;
const LASER_MAST_M = 6.4;
const LASER_BOOM_Y = 1.15;

function sleevedSail(lee: number, colour: SailColour, near: boolean): Sail {
  return {
    tack: [0, LASER_BOOM_Y + 0.05, LASER_MAST_Z - 0.03],
    head: [0, LASER_MAST_M - 0.1, LASER_MAST_Z - 0.03],
    foot: boomOut(2.74, 14, lee),
    rows: near ? 5 : 1,
    columns: near ? 3 : 1,
    camber: near ? 0.09 : 0,
    twist: 0.28,
    roachM: 0.32,
    lee,
    part: sailPart(colour),
  };
}

/** A Laser-type single-hander: a flush deck with a small foot-well, an unstayed mast and a sleeved sail. */
export function buildSingleHander({ state = "moored", sails = "white", lee = 1 }: DinghyOptions = {}): RoadsideModel {
  const hull = new Hull(LASER);
  const sailing = state === "sailing";
  const near = new BoatMesh();
  hull.skin(near, 6, ["gelcoat", "gelcoat", "gelcoat"]);
  hull.deck(near, 6, "gelcoat", { from: 1 / 6, to: 3 / 6, halfM: 0.2, floorY: 0.1, floor: "non-skid", wall: "non-skid" });
  near.tube([0, 0.3, LASER_MAST_Z], [0, LASER_MAST_M, LASER_MAST_Z], 0.03, 4, { radiusTo: 0.018, cap: true }, "alu");
  const boom = boomOut(2.74, sailing ? 14 : 0, lee);
  near.tube([0, LASER_BOOM_Y, LASER_MAST_Z - 0.03], [boom[0], LASER_BOOM_Y, LASER_MAST_Z + boom[2]], 0.022, 3, {}, "alu");
  near.face([[0, 0.3, -2.1], [0, 0.3, -2.28], [0, -0.3, -2.3], [0, -0.3, -2.08]], "non-skid");
  near.tube([0, 0.38, -2.15], [0, 0.45, -1.3], 0.012, 3, {}, "pine");
  const far = farHull(new BoatMesh(), hull, "gelcoat", "gelcoat", 3);
  farMast(far, LASER_MAST_Z, 0.3, LASER_MAST_M, 0.04, "alu");
  if (sailing) {
    nearSail(near, sleevedSail(lee, sails, true));
    near.line([boom[0], LASER_BOOM_Y, LASER_MAST_Z + boom[2]], [0, 0.34, -1.9], "rope");
    farSail(far, sleevedSail(lee, sails, false));
  }
  return finished({ near, far, swapM: 90, reachM: 800, rock: sailing ? 0.7 : 0.9, heelDeg: sailing ? 14 : 0, lee });
}
