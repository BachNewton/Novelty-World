import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Marked, marinaModel, type MarinaPart } from "./paint";

/*
 * A radar mark (tutkamerkki, radarmärke): a tall square pillar on a bare skerry, painted
 * in broad horizontal bands so it reads by day, with a radar reflector at its head so it
 * shows on a ship's radar at night. Väylävirasto's register lists 82 round Åland, from
 * which the game places them.
 */

/** The register's band schemes, read from the top: white over red over white, and so on. */
export const RADAR_BANDS = ["white-red", "white-orange", "red-white", "red", "white"] as const;
export type RadarBands = (typeof RADAR_BANDS)[number];

type BandPaint = Extract<MarinaPart, "mark-white" | "mark-red" | "mark-orange">;

const BANDS: Record<RadarBands, readonly BandPaint[]> = {
  "white-red": ["mark-white", "mark-red", "mark-white"],
  "white-orange": ["mark-white", "mark-orange", "mark-white"],
  "red-white": ["mark-red", "mark-white", "mark-red"],
  red: ["mark-red"],
  white: ["mark-white"],
};

/** The height a mark is built at, the register's median, to the reflector's top. */
export const RADAR_MARK_M = 6.5;
/** The middle band is the widest, as on the real marks, so it is what reads first. */
const THREE_BANDS = [0.3, 0.4, 0.3] as const;

const FOOT_TOP_M = 0.4;
const FOOT_HALF_M = 0.8;
const COLUMN_TOP_M = RADAR_MARK_M - 0.85;
const [HALF_FOOT_M, HALF_TOP_M] = [0.5, 0.4];
const REFLECTOR_M = 0.32;
/** Far enough that the far pillar's extra width is under half a pixel where they trade. */
const SWAP_M = 700;
/** Out to here the pillar is still a stroke of colour on the skyline; it grows from nothing over its last stretch. */
const REACH_M = 4000;
/** The far pillar is a little stouter, so at a few kilometres it is a pixel rather than a shimmer. */
const FAR_FATTEN = 1.4;

/** The scale that stands a mark built at `RADAR_MARK_M` to the register's height: taller marks are stouter too. */
export function radarMarkScale(heightM: number): number {
  return Math.min(2, Math.max(0.5, heightM / RADAR_MARK_M));
}

/** A square frustum with its faces square to x and z, from `low` to `high`, its top closed if asked. */
function block(into: Marked, low: number, high: number, halfLow: number, halfHigh: number, part: MarinaPart, top: boolean): Marked {
  const corner = (y: number, half: number, x: number, z: number): V3 => [x * half, y, z * half];
  const ring = [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const;
  const shades = [1, 0.9, 0.84, 0.94];
  ring.forEach(([x, z], index) => {
    const [u, v] = ring[(index + 1) % 4];
    into.face([corner(low, halfLow, x, z), corner(low, halfLow, u, v), corner(high, halfHigh, u, v), corner(high, halfHigh, x, z)], part, shades[index]);
  });
  if (top) into.face(ring.map(([x, z]) => corner(high, halfHigh, x, z)), part, 1.08);
  return into;
}

/** An octahedral corner reflector: three square plates crossed at right angles, turned a quarter off the pillar. */
function reflector(into: Marked, centreY: number, size: number): Marked {
  const r = size;
  const turn = (x: number, z: number): [number, number] => [(x - z) * Math.SQRT1_2, (x + z) * Math.SQRT1_2];
  const at = (x: number, y: number, z: number): V3 => {
    const [a, b] = turn(x, z);
    return [a, centreY + y, b];
  };
  into.face([at(r, 0, 0), at(0, r, 0), at(-r, 0, 0), at(0, -r, 0)], "galvanised", 1.05);
  into.face([at(0, 0, r), at(0, r, 0), at(0, 0, -r), at(0, -r, 0)], "galvanised", 0.9);
  return into.face([at(r, 0, 0), at(0, 0, r), at(-r, 0, 0), at(0, 0, -r)], "galvanised", 1.12);
}

function pillar(into: Marked, bands: RadarBands, fatten: number): Marked {
  const paints = BANDS[bands];
  const shares = paints.length === 3 ? THREE_BANDS : [1];
  const halfAt = (y: number) => fatten * (HALF_FOOT_M + ((y - FOOT_TOP_M) / (COLUMN_TOP_M - FOOT_TOP_M)) * (HALF_TOP_M - HALF_FOOT_M));
  let high = COLUMN_TOP_M;
  paints.forEach((part, index) => {
    const low = high - shares[index] * (COLUMN_TOP_M - FOOT_TOP_M);
    block(into, low, high, halfAt(low), halfAt(high), part, index === 0);
    high = low;
  });
  // The footing is cast into the rock, so it runs on under the origin and a sloping skerry shows no gap.
  block(into, -0.6, FOOT_TOP_M, FOOT_HALF_M * fatten, (FOOT_HALF_M - 0.05) * fatten, "concrete", true);
  block(into, COLUMN_TOP_M, COLUMN_TOP_M + 0.12, (HALF_TOP_M + 0.08) * fatten, (HALF_TOP_M + 0.08) * fatten, "galvanised", true);
  return into;
}

/** A radar mark (tutkamerkki) on its skerry: a banded square pillar on a concrete footing, a cap and a radar reflector on a short mast. Origin on the rock at the pillar's foot; built `RADAR_MARK_M` tall, placed at `radarMarkScale` of the register's height. Its ladder faces +z. */
export function buildRadarMark(bands: RadarBands): RoadsideModel {
  const capTop = COLUMN_TOP_M + 0.12;
  const reflectorY = RADAR_MARK_M - REFLECTOR_M;

  const near = pillar(new Marked(), bands, 1);
  near.tube([0, capTop, 0], [0, RADAR_MARK_M, 0], 0.045, 5, { cap: true }, "galvanised");
  reflector(near, reflectorY, REFLECTOR_M);
  // The ladder up the +z face, standing off it on its brackets.
  const faceZ = (y: number) => HALF_FOOT_M + ((y - FOOT_TOP_M) / (COLUMN_TOP_M - FOOT_TOP_M)) * (HALF_TOP_M - HALF_FOOT_M) + 0.13;
  for (const x of [-0.2, 0.2]) near.beam([x, FOOT_TOP_M, faceZ(FOOT_TOP_M)], [x, capTop + 0.6, faceZ(capTop + 0.6)], 0.045, 0.045, "galvanised");
  for (let y = FOOT_TOP_M + 0.35; y < capTop + 0.5; y += 0.4) {
    near.face([[-0.2, y, faceZ(y)], [0.2, y, faceZ(y)], [0.2, y + 0.04, faceZ(y)], [-0.2, y + 0.04, faceZ(y)]], "galvanised", 0.95);
  }

  const far = pillar(new Marked(), bands, FAR_FATTEN).beam([0, capTop, 0], [0, RADAR_MARK_M, 0], 0.1, 0.1, "galvanised");
  reflector(far, reflectorY, REFLECTOR_M * FAR_FATTEN);
  return marinaModel(near, far, SWAP_M, REACH_M);
}
