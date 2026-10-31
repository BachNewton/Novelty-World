import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, streetModel, type Motion, type StreetPart } from "./paint";

/*
 * A flag is drawn in the units its law measures it in, one rectangle of mesh for
 * each field, so a cross's edge is a real edge: exact at any size, sharpened by the
 * renderer's antialiasing, with no texture and no sum in a fragment shader.
 *
 * Finland: Act on the Flag of Finland (380/1978), section 1: 11 high by 18 long, a
 * cross 3 wide, fields 4 high, 5 and 10 long. Colours: Government decision 827/1993
 * (see `tokens.css`).
 *
 * Åland: landskapslag 41/1992 om Ålands flagga: 17 high by 26 long, hoist
 * 6-1.5-2-1.5-6, fly 8-1.5-2-1.5-13. Colours: landskapsförordning 2004:15.
 */

export type FlagName = "finland" | "aland";

export interface FlagSpec {
  /** Where a field's edge lies along the fly, from the hoist, in the law's units. */
  fly: readonly number[];
  /** The same, up the hoist. */
  hoist: readonly number[];
  /** The paint of a field, by its column and row. */
  field: (column: number, row: number) => StreetPart;
}

export const FLAGS: Record<FlagName, FlagSpec> = {
  finland: {
    fly: [0, 5, 8, 18],
    hoist: [0, 4, 7, 11],
    field: (column, row) => (column === 1 || row === 1 ? "flag-fi-blue" : "flag-white"),
  },
  aland: {
    fly: [0, 8, 9.5, 11.5, 13, 26],
    hoist: [0, 6, 7.5, 9.5, 11, 17],
    field: (column, row) => {
      if (column === 2 || row === 2) return "flag-ax-red";
      return column === 1 || column === 3 || row === 1 || row === 3 ? "flag-ax-yellow" : "flag-ax-blue";
    },
  },
};

const POLE_M = 10;
/** The Interior Ministry's guide: a flag about a sixth as high as its pole. */
const FLAG_HIGH_M = POLE_M / 6;
const FLAG_TOP_M = POLE_M - 0.14;
const POLE_RADIUS_M = 0.055;
/** The cloth's sag towards the fly, a gentle air not a gale. */
const DROOP_SHARE = 0.16;
const WAVE_M = 0.22;
/** Columns of mesh to bend along the fly, each no longer than this share of it. */
const NEAR_STEP = 1 / 7;
const FLAG_SWAP_M = 130;
const FLAG_REACH_M = 640;

/** The length a flag flies at this height, by its own proportions. */
export function flyLengthM(spec: FlagSpec): number {
  return (FLAG_HIGH_M * spec.fly[spec.fly.length - 1]) / spec.hoist[spec.hoist.length - 1];
}

function cloth(into: Painted, spec: FlagSpec, step: number): Painted {
  const units = spec.fly[spec.fly.length - 1];
  const scale = FLAG_HIGH_M / spec.hoist[spec.hoist.length - 1];
  const place = (fly: number, hoist: number): V3 => {
    const share = fly / units;
    return [POLE_RADIUS_M + fly * scale, FLAG_TOP_M - FLAG_HIGH_M + hoist * scale - DROOP_SHARE * FLAG_HIGH_M * share * share, 0];
  };
  for (let column = 0; column + 1 < spec.fly.length; column++) {
    const [from, to] = [spec.fly[column], spec.fly[column + 1]];
    const pieces = Math.max(1, Math.ceil((to - from) / (units * step)));
    for (let piece = 0; piece < pieces; piece++) {
      const [left, right] = [from + ((to - from) * piece) / pieces, from + ((to - from) * (piece + 1)) / pieces];
      for (let row = 0; row + 1 < spec.hoist.length; row++) {
        const [low, high] = [spec.hoist[row], spec.hoist[row + 1]];
        into.face([place(left, low), place(right, low), place(right, high), place(left, high)], spec.field(column, row));
      }
    }
  }
  return into;
}

/** The cloth moves more towards its fly; the hoist is tied to the pole. */
function flying(flagLengthM: number): Motion {
  return (part, [x]) => (part.startsWith("flag") ? { kind: "cloth", metres: WAVE_M * Math.min(1, x / flagLengthM + 0.04) } : { kind: "still" });
}

function pole(into: Painted, sides: number): Painted {
  return into
    .box([-0.28, -0.3, -0.28], [0.28, 0.1, 0.28], "concrete", { open: true, shadeTop: 1.1 })
    .tube([0, 0.05, 0], [0, POLE_M, 0], POLE_RADIUS_M * 1.3, sides, { radiusTo: POLE_RADIUS_M * 0.6 }, "pole-white")
    .tube([0, POLE_M, 0], [0, POLE_M + 0.14, 0], 0.09, sides, { radiusTo: 0.02, cap: true, shadeFrom: 1.15 }, "pole-gold");
}

/** A white flagpole and a flag flying along +x, so `yaw` sets the wind. Yaw every flag in a town alike. */
export function buildFlagpole(flag: FlagName): RoadsideModel {
  const spec = FLAGS[flag];
  const near = cloth(pole(new Painted(), 6), spec, NEAR_STEP);
  near.tube([0, FLAG_TOP_M - FLAG_HIGH_M - 0.5, 0.02], [0, POLE_M - 0.05, 0.02], 0.007, 3, {}, "rigging");
  const far = cloth(pole(new Painted(), 3), spec, 1);
  return streetModel(near, far, FLAG_SWAP_M, FLAG_REACH_M, flying(flyLengthM(spec)));
}
