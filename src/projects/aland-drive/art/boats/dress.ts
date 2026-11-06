import type { V3 } from "../roadside/mesh";
import type { Hull } from "./hull";
import type { BoatMesh, BoatPart } from "./mesh";

/*
 * What a boat wears at its mooring. In Åland a visitor mostly lies bow-to a jetty
 * with a stern buoy, or between booms, so that is the default: two bow lines up to
 * the jetty ahead, one stern line back to a small buoy. Alongside takes a line from
 * each end to the quay on one side, with fenders down that side. Each line's far end
 * stays where it's made fast as the boat rocks.
 *
 * The far version keeps the lines and the buoy, which reach well out from the hull,
 * and leaves the fenders, which lie against it.
 */

export type Mooring = "bow-to" | "alongside" | "buoy";

/** How far from the bow or side a jetty lies, and how high its edge. */
export const JETTY_GAP_M = 0.7;
export const JETTY_DECK_M = 0.7;
const STERN_BUOY_M = 9;
const BUOY_PENNANT_M = 7;

interface MooringLine {
  from: V3;
  to: V3;
  sagM: number;
}

/** Where a line with a little slack lies, a share of the way along. */
function along({ from, to, sagM }: MooringLine, share: number): V3 {
  if (share === 1) return to;
  return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share - 4 * sagM * share * (1 - share), from[2] + (to[2] - from[2]) * share];
}

/** A line in spans between these shares of the way, its last end made fast. */
function slackLine(mesh: BoatMesh, line: MooringLine, shares: readonly number[], kept: boolean): void {
  for (let index = 0; index + 1 < shares.length; index++) mesh.line(along(line, shares[index]), along(line, shares[index + 1]), "rope", { fast: index + 2 === shares.length, kept });
}

function fender(mesh: BoatMesh, x: number, y: number, z: number, part: BoatPart, drop: number): void {
  mesh.tube([x, y - drop, z], [x, y - drop + 0.14, z], 0.05, 4, { radiusTo: 0.11 }, part);
  mesh.tube([x, y - drop + 0.14, z], [x, y - drop + 0.52, z], 0.11, 4, { radiusTo: 0.09, cap: true }, part);
  mesh.line([x, y - drop + 0.52, z], [x, y + 0.04, z], "rope");
}

function mooringBall(mesh: BoatMesh, at: V3, sides: number): void {
  mesh.tube([at[0], 0.32, at[2]], [at[0], 0, at[2]], 0.05, sides, { radiusTo: 0.22, shadeFrom: 1.05 }, "fender-white");
}

export interface Dress {
  mooring: Mooring;
  /** Side the fenders and quay are on, alongside: 1 is +x. */
  side?: number;
  fenders?: BoatPart;
  /** How many along each side. */
  fenderCount?: number;
  /** The far version draws the lines too, with `farMooring`. */
  kept?: boolean;
}

interface Moored {
  /** The lines and buoys, in the order they're drawn. */
  gear: ({ line: MooringLine } | { ball: V3 })[];
  /** The sides fenders hang down. */
  fendered: number[];
}

function moored(hull: Hull, mooring: Mooring, side: number): Moored {
  const level = hull.top;
  const bow = hull.point(level, 0.95, 1);
  const stern = hull.point(level, 0.06, 1);
  if (mooring === "alongside") {
    const quayX = hull.spec.halfBeamM + JETTY_GAP_M;
    return {
      gear: [
        { line: { from: [bow[0] * side * 0.6, bow[1], bow[2]], to: [side * quayX, JETTY_DECK_M, bow[2] + 2.2], sagM: 0.1 } },
        { line: { from: [stern[0] * side, stern[1], stern[2]], to: [side * quayX, JETTY_DECK_M, stern[2] - 2.2], sagM: 0.1 } },
      ],
      fendered: [side],
    };
  }
  if (mooring === "buoy") {
    const ball: V3 = [0, 0.3, hull.spec.levels[level].stem + BUOY_PENNANT_M];
    return { gear: [{ ball }, { line: { from: [0, bow[1], bow[2]], to: ball, sagM: 0.35 } }], fendered: [] };
  }
  const jettyZ = hull.spec.levels[level].stem + JETTY_GAP_M;
  const ball: V3 = [0.15, 0.3, stern[2] - STERN_BUOY_M];
  return {
    gear: [...[-1, 1].map((onSide) => ({ line: { from: [onSide * bow[0], bow[1], bow[2]] as V3, to: [onSide * 1.1, JETTY_DECK_M, jettyZ] as V3, sagM: 0.08 } })), { ball }, { line: { from: [stern[0] * 0.7, stern[1], stern[2]], to: ball, sagM: 0.45 } }],
    fendered: [1, -1],
  };
}

/** Fenders and mooring lines for a hull lying at rest. */
export function dressForMooring(mesh: BoatMesh, hull: Hull, { mooring, side = 1, fenders = "fender-white", fenderCount = 2, kept = false }: Dress): BoatMesh {
  const { gear, fendered } = moored(hull, mooring, side);
  const level = hull.top;
  const bow = hull.point(level, 0.95, 1);
  const stern = hull.point(level, 0.06, 1);
  const lengthZ = bow[2] - stern[2];
  const fendersAt = Array.from({ length: fenderCount }, (_, index) => hull.shareAt(stern[2] + lengthZ * (0.3 + (0.42 * index) / Math.max(1, fenderCount - 1))));
  for (const onSide of fendered) {
    for (const share of fendersAt) {
      const [x, y, z] = hull.point(level, share, onSide);
      fender(mesh, x + onSide * 0.1, y, z, fenders, Math.min(y - 0.02, 0.56));
    }
  }
  for (const item of gear) {
    if ("ball" in item) mooringBall(mesh, item.ball, 5);
    else slackLine(mesh, item.line, [0, 0.35, 0.7, 1], kept);
  }
  return mesh;
}

/** The far version's mooring: each line straight, and a cheaper buoy. */
export function farMooring(mesh: BoatMesh, hull: Hull, { mooring, side = 1 }: Dress): BoatMesh {
  for (const item of moored(hull, mooring, side).gear) {
    if ("ball" in item) mooringBall(mesh, item.ball, 3);
    else slackLine(mesh, item.line, [0, 1], true);
  }
  return mesh;
}

/** Guard rails: stanchions up from the sheer and a wire along their tops. */
export function guardRails(mesh: BoatMesh, hull: Hull, shares: readonly number[], tallM: number, part: BoatPart = "alu"): BoatMesh {
  for (const side of [-1, 1]) {
    const tops = shares.map((share): V3 => {
      const [x, y, z] = hull.point(hull.top, share, side);
      mesh.line([x * 0.96, y, z], [x * 0.96, y + tallM, z], part);
      return [x * 0.96, y + tallM, z];
    });
    for (let index = 0; index + 1 < tops.length; index++) {
      mesh.line(tops[index], tops[index + 1], "wire");
    }
  }
  return mesh;
}
