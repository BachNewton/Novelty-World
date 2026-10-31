import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { levelRing, Painted, runMotion, streetModel } from "../street/paint";

/*
 * What stands on a town's ground: hedges, a run of low boxes `runSections` lays
 * along `barrier=hedge`, and fountains for `amenity=fountain`. Both are placed with
 * `placeModel` and drawn by `streetMaterials`, so they add draw calls and no material.
 */

const SINK_M = 0.2;
export const HEDGE_M = 2.4;
const HEDGE_HIGH_M = 1.05;
const HEDGE_WIDE_M = 0.8;
const HEDGE_SWAP_M = 60;
const HEDGE_REACH_M = 260;
const LUMPS = 3;
const TOP_SHARE = 0.55;

/** One length of clipped hedge, along +x from its origin: a rounded box with lumps in its top, so a run isn't a ruled bar. */
export function buildHedge(): RoadsideModel {
  const half = HEDGE_WIDE_M / 2;
  const near = new Painted();
  const heights = [HEDGE_HIGH_M, HEDGE_HIGH_M + 0.07, HEDGE_HIGH_M - 0.05, HEDGE_HIGH_M];
  for (let lump = 0; lump < LUMPS; lump++) {
    const [from, to] = [(lump / LUMPS) * HEDGE_M, ((lump + 1) / LUMPS) * HEDGE_M];
    const [high, next] = [heights[lump], heights[lump + 1]];
    const [shoulder, shoulderNext] = [high - 0.16, next - 0.16];
    const side = (z: number): V3[] => [[from, -SINK_M, z * (half + 0.03)], [to, -SINK_M, z * (half + 0.03)], [to, shoulderNext, z * half], [from, shoulder, z * half]];
    near.face(side(1), "leaf", 0.82).face(side(-1), "leaf", 0.82);
    const top = half * TOP_SHARE;
    near.face([[from, shoulder, half], [to, shoulderNext, half], [to, next, top], [from, high, top]], "leaf-lit", 1);
    near.face([[from, shoulder, -half], [to, shoulderNext, -half], [to, next, -top], [from, high, -top]], "leaf-lit", 0.92);
    near.face([[from, high, top], [to, next, top], [to, next, -top], [from, high, -top]], "leaf-lit", 1.08);
  }
  const low = HEDGE_HIGH_M - 0.1;
  const far = new Painted()
    .face([[0, -SINK_M, half], [HEDGE_M, -SINK_M, half], [HEDGE_M, low, half], [0, low, half]], "leaf", 0.85)
    .face([[0, -SINK_M, -half], [HEDGE_M, -SINK_M, -half], [HEDGE_M, low, -half], [0, low, -half]], "leaf", 0.85)
    .face([[0, low, half], [HEDGE_M, low, half], [HEDGE_M, HEDGE_HIGH_M, 0], [0, HEDGE_HIGH_M, 0]], "leaf-lit")
    .face([[0, HEDGE_HIGH_M, 0], [HEDGE_M, HEDGE_HIGH_M, 0], [HEDGE_M, low, -half], [0, low, -half]], "leaf-lit");
  return streetModel(near, far, HEDGE_SWAP_M, HEDGE_REACH_M, runMotion);
}

const BASIN_M = 2.6;
const FOUNTAIN_SIDES = 16;
const FOUNTAIN_SWAP_M = 70;
const FOUNTAIN_REACH_M = 320;
const SHEETS = 6;

function column(into: Painted, sides: number, heights: readonly (readonly [number, number])[], part: "concrete" | "steel", shade = 1): Painted {
  for (let step = 0; step + 1 < heights.length; step++) {
    const [[lowY, lowR], [highY, highR]] = [heights[step], heights[step + 1]];
    into.tube([0, lowY, 0], [0, highY, 0], lowR, sides, { radiusTo: highR, cap: step + 2 === heights.length, shadeFrom: shade * 0.88, shadeTo: shade }, part);
  }
  return into;
}

/** A town fountain: a stone basin of water, a pedestal and a bowl, and a plume falling back into it. */
export function buildFountain(): RoadsideModel {
  const near = new Painted();
  column(near, FOUNTAIN_SIDES, [[-SINK_M, BASIN_M + 0.1], [0.42, BASIN_M + 0.06]], "concrete", 1.02);
  near.face(levelRing([0, 0.42, 0], BASIN_M + 0.06, FOUNTAIN_SIDES), "concrete", 1.12);
  near.face(levelRing([0, 0.43, 0], BASIN_M - 0.18, FOUNTAIN_SIDES), "ribbon-blue", 1.05);
  column(near, 9, [[0.4, 0.42], [0.8, 0.26], [1.25, 0.2], [1.4, 0.62], [1.5, 0.78]], "concrete");
  near.face(levelRing([0, 1.5, 0], 0.7, 9), "ribbon-blue", 1.1);
  column(near, 6, [[1.5, 0.05], [2.7, 0.015]], "steel", 1.25);
  // The fall: thin sheets from the bowl's lip, pale against everything behind.
  for (let sheet = 0; sheet < SHEETS; sheet++) {
    const turn = (sheet / SHEETS) * 2 * Math.PI;
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const [sideX, sideZ] = [-s * 0.09, c * 0.09];
    near.face([[0.8 * c + sideX, 1.5, 0.8 * s + sideZ], [0.8 * c - sideX, 1.5, 0.8 * s - sideZ], [1.02 * c - sideX, 0.43, 1.02 * s - sideZ], [1.02 * c + sideX, 0.43, 1.02 * s + sideZ]], "steel", 1.3);
  }
  const far = new Painted();
  column(far, 8, [[-SINK_M, BASIN_M + 0.1], [0.42, BASIN_M + 0.06]], "concrete");
  far.face(levelRing([0, 0.43, 0], BASIN_M, 8), "ribbon-blue", 1.05);
  column(far, 4, [[0.4, 0.42], [1.5, 0.7], [2.6, 0.02]], "concrete");
  return streetModel(near, far, FOUNTAIN_SWAP_M, FOUNTAIN_REACH_M);
}
