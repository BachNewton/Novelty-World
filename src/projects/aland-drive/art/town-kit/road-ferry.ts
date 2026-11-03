import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel, type TownPart } from "./paint";

/*
 * A double-ended car ferry of the archipelago's lines, invented, with no real line's name or colours: it crosses and
 * comes back without turning, so it is the same at both ends. An open car deck on a low, blunt hull, a ramp raised at
 * each end, and the wheelhouse up on a casing to one side. Its middle is the origin, the ends along x, y up from the
 * water. It's drawn under way by `render/boats-under-way.ts` at a place the sea's clock gives. The road ferries on
 * their wires are `art/identity`'s cable ferry.
 */

const LENGTH_M = 62;
const BEAM_M = 14;
const SWAP_M = 500;
const REACH_M = 9000;

const BOTTOM_M = -0.8;
const BOOT_M = 0.3;
const DECK_M = 2.2;
const RAIL_M = 1.1;
/** The share of the half length over which an end narrows. */
const END_SHARE = 0.16;
const END_BEAM = 0.78;

/** Half the beam at x, narrowing to each blunt end. */
function halfBeam(x: number, half: number, beam: number): number {
  const into = Math.max(0, (Math.abs(x) - half * (1 - END_SHARE)) / (half * END_SHARE));
  return (beam / 2) * (1 - (1 - END_BEAM) * into ** 1.6);
}

function hull(into: TownPainted, lengthM: number, beamM: number, stations: number): TownPainted {
  const half = lengthM / 2;
  const xs = Array.from({ length: stations + 1 }, (_, at) => -half + (lengthM * at) / stations);
  const bands: readonly [number, number, TownPart, number][] = [
    [BOTTOM_M, BOOT_M, "ferry-boot", 0.95],
    [BOOT_M, DECK_M, "ferry-hull", 1],
    [DECK_M, DECK_M + RAIL_M, "ferry-white", 1.02],
  ];
  for (const side of [-1, 1]) {
    for (let at = 0; at + 1 < xs.length; at++) {
      const [a, b] = [xs[at], xs[at + 1]];
      for (const [low, high, part, shade] of bands) {
        const [za, zb] = [side * halfBeam(a, half, beamM), side * halfBeam(b, half, beamM)];
        into.face([[a, low, za], [b, low, zb], [b, high, zb], [a, high, za]], part, side > 0 ? shade : shade * 0.95);
      }
    }
  }
  // The ends, where the ramps meet the deck.
  for (const end of [-1, 1]) {
    const x = end * half;
    const z = halfBeam(x, half, beamM);
    into.face([[x, BOTTOM_M, -z], [x, BOTTOM_M, z], [x, DECK_M, z], [x, DECK_M, -z]], "ferry-hull", 0.9);
  }
  for (let at = 0; at + 1 < xs.length; at++) {
    const [a, b] = [xs[at], xs[at + 1]];
    into.face([[a, DECK_M, -halfBeam(a, half, beamM)], [b, DECK_M, -halfBeam(b, half, beamM)], [b, DECK_M, halfBeam(b, half, beamM)], [a, DECK_M, halfBeam(a, half, beamM)]], "ramp-deck", 1);
  }
  return into;
}

/** A ramp at each end, raised for the crossing. */
function ramps(into: TownPainted, lengthM: number, beamM: number): TownPainted {
  const half = lengthM / 2;
  const z = halfBeam(half, half, beamM) - 0.6;
  const [rampM, raise] = [4.5, 1.05];
  for (const end of [-1, 1]) {
    const foot: V3 = [end * half, DECK_M, 0];
    const top: V3 = [end * (half + Math.cos(raise) * rampM), DECK_M + Math.sin(raise) * rampM, 0];
    into.face([[foot[0], foot[1], -z], [foot[0], foot[1], z], [top[0], top[1], z], [top[0], top[1], -z]], "ramp-steel", end > 0 ? 1 : 0.92);
    for (const side of [-1, 1]) into.beam([foot[0], foot[1] + 0.1, side * z], [top[0], top[1] + 0.1, side * z], 0.2, 0.35, "ferry-steel");
  }
  return into;
}

/** A band of windows along x on both faces of a box's sides. */
function windows(into: TownPainted, from: number, to: number, low: number, high: number, half: number): TownPainted {
  for (const side of [-1, 1]) into.face([[from, low, side * (half + 0.03)], [to, low, side * (half + 0.03)], [to, high, side * (half + 0.03)], [from, high, side * (half + 0.03)]], "ferry-glass", 1.1);
  return into;
}

function archipelagoTop(into: TownPainted, lengthM: number, beamM: number, far: boolean): TownPainted {
  const half = beamM / 2;
  const casing = lengthM * 0.32;
  const [casingTop, bridgeLow, bridgeHigh] = [DECK_M + 3.4, DECK_M + 3.4, DECK_M + 6.2];
  // The casing along one side, the passengers' saloon in it, and the wheelhouse across the deck on top.
  into.box([-casing, DECK_M, half - 2.8], [casing, casingTop, half - 0.2], "ferry-white", { open: true, shadeTop: 1.05 });
  into.box([-6, bridgeLow, -half + 0.2], [6, bridgeHigh, half - 0.2], "ferry-white", { open: true, shadeTop: 1.06 });
  for (const end of [-1, 1]) into.face([[end * 6.03, bridgeLow + 1, -half + 0.4], [end * 6.03, bridgeLow + 1, half - 0.4], [end * 6.03, bridgeHigh - 0.4, half - 0.4], [end * 6.03, bridgeHigh - 0.4, -half + 0.4]], "ferry-glass", 1.1);
  if (far) return into;
  windows(into, -casing + 1.5, casing - 1.5, DECK_M + 1.6, DECK_M + 2.6, half - 0.2);
  into.box([-casing + 0.5, DECK_M, -half + 0.2], [-casing + 3, DECK_M + 2.6, -half + 2.2], "ferry-shade", { open: true, shadeTop: 1.04 });
  into.box([casing - 3, DECK_M, -half + 0.2], [casing - 0.5, DECK_M + 2.6, -half + 2.2], "ferry-shade", { open: true, shadeTop: 1.04 });
  into.tube([0, bridgeHigh, 0], [0, bridgeHigh + 5, 0], 0.18, 5, { radiusTo: 0.08 }, "ferry-steel");
  into.beam([0, bridgeHigh + 3, -1.6], [0, bridgeHigh + 3, 1.6], 0.12, 0.12, "ferry-steel");
  // A funnel each side of the wheelhouse, low and squat.
  for (const x of [-8.5, 8.5]) into.box([x - 1, casingTop, half - 2.2], [x + 1, casingTop + 1.6, half - 0.8], "ferry-funnel", { open: true, shadeTop: 0.7 });
  return into;
}

/** The ferry: near under 600 triangles, far under 150, trading pixels at its swap. Goes through `townMaterials`. */
export function buildRoadFerry(): RoadsideModel {
  const near = archipelagoTop(ramps(hull(new TownPainted(), LENGTH_M, BEAM_M, 10), LENGTH_M, BEAM_M), LENGTH_M, BEAM_M, false);
  const far = archipelagoTop(ramps(hull(new TownPainted(), LENGTH_M, BEAM_M, 4), LENGTH_M, BEAM_M), LENGTH_M, BEAM_M, true);
  return townModel(near, far, SWAP_M, REACH_M);
}
