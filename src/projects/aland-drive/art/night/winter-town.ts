import { seedOfWhole, unitOfSeed } from "../hash";
import type { GlowInstance } from "./glows";
import { LAMP_LOOKS, type LampSpot } from "./lamps";
import { nightRgb } from "./night";

/*
 * Mariehamn's Christmas in the street (`docs/TIME-AND-WEATHER.md`, Reference, Winter lights): Torggatan's Julgatan
 * with strings of lights across it from wall to wall, the Esplanade's lamps swagged one to the next, and Torget's tree.
 * Places are ETRS-TM35FIN metres, read off OpenStreetMap's Torggatan, Norra Esplanadgatan, Storagatan and Torget. Each
 * string has its own threshold against the season's `lightsTown`, so the town is dressed string by string over its
 * evening, and taken down the same way.
 */

interface EastNorth {
  east: number;
  north: number;
}

/** Torggatan from Ålandsvägen's end of the walking street to Storagatan: the Julgatan, where its lights hang. */
const JULGATAN: readonly EastNorth[] = [
  { east: 108004.4, north: 6683400 },
  { east: 108004.6, north: 6683347 },
  { east: 108005.1, north: 6683277 },
  { east: 108005.5, north: 6683259 },
  { east: 108006.5, north: 6683240 },
  { east: 108005.5, north: 6683210 },
];
const ACROSS_EVERY_M = 11;
/** From the street's middle to each wall, and how high a string is tied there. */
const ACROSS_HALF_M = 6.8;
const ACROSS_TIED_M = 6.4;
const ACROSS_SAG_M = 0.9;
const ACROSS_BULB_EVERY_M = 0.42;

/** The Esplanade between Norra Esplanadgatan and Storagatan, and the town's end of both streets: their lamps are swagged. */
const ESPLANADE = { west: 107130, east: 108010, south: 6683195, north: 6683265 } as const;
const SWAG_LONGEST_M = 45;
/** Lamps on one side of a street stand in a line this straight: the streets are straight here. */
const SAME_SIDE_M = 2.5;
const SWAG_BELOW_HEAD_M = 0.45;
const SWAG_SAG_M = 1.1;
const SWAG_BULB_EVERY_M = 0.6;

/** Torget's tree, in the paved middle of the square. */
export const TORGET_TREE: EastNorth = { east: 108050, north: 6683300 };
/** The tree goes up first, before any string: its threshold against `lightsTown`. */
export const TREE_THRESHOLD = 0.03;

const SALT = 7201;
const BULB = { sizeM: 0.13, minPixels: 1.3, brightness: 0.95, reachM: 1600 } as const;

/** A string of lights in the scene's metres, with its own threshold against `lightsTown`. */
export interface TownString {
  bulbs: { x: number; y: number; z: number }[];
  threshold: number;
}

type Ground = (x: number, z: number) => number;

const sceneOf = ({ east, north }: EastNorth, origin: EastNorth) => ({ x: east - origin.east, z: origin.north - north });

/** Bulbs along a hanging string between two points, every `every` metres, sagging to `sag` in the middle. */
function hang(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, sag: number, every: number) {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.max(2, Math.round(length / every));
  return Array.from({ length: count + 1 }, (_, at) => {
    const share = at / count;
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share - 4 * sag * share * (1 - share), z: from.z + (to.z - from.z) * share };
  });
}

const thresholdAt = (x: number, z: number) => TREE_THRESHOLD + unitOfSeed(seedOfWhole(Math.round(x * 10), Math.round(z * 10)), SALT) * (1 - TREE_THRESHOLD);

/** Strings across the Julgatan from wall to wall, every few metres along it. */
export function julgatanStrings(origin: EastNorth, ground: Ground): TownString[] {
  const line = JULGATAN.map((point) => sceneOf(point, origin));
  const strings: TownString[] = [];
  let carried = ACROSS_EVERY_M / 2;
  for (let leg = 1; leg < line.length; leg++) {
    const [a, b] = [line[leg - 1], line[leg]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const [alongX, alongZ] = [(b.x - a.x) / length, (b.z - a.z) / length];
    for (; carried < length; carried += ACROSS_EVERY_M) {
      const [x, z] = [a.x + alongX * carried, a.z + alongZ * carried];
      const tie = (side: number) => {
        const [tx, tz] = [x - alongZ * side * ACROSS_HALF_M, z + alongX * side * ACROSS_HALF_M];
        return { x: tx, y: ground(tx, tz) + ACROSS_TIED_M, z: tz };
      };
      strings.push({ bulbs: hang(tie(-1), tie(1), ACROSS_SAG_M, ACROSS_BULB_EVERY_M), threshold: thresholdAt(x, z) });
    }
    carried -= length;
  }
  return strings;
}

/** The Esplanade's town lamps, each swagged to the next along its side of the street. */
export function esplanadeStrings(lamps: readonly LampSpot[], origin: EastNorth): TownString[] {
  const [west, east] = [ESPLANADE.west - origin.east, ESPLANADE.east - origin.east];
  const [north, south] = [origin.north - ESPLANADE.north, origin.north - ESPLANADE.south];
  const here = lamps.filter(({ kind, x, z }) => kind === "town" && x > west && x < east && z > north && z < south).sort((a, b) => a.z - b.z);
  const rows: LampSpot[][] = [];
  for (const lamp of here) {
    const row = rows.at(-1);
    if (row !== undefined && lamp.z - (row.at(-1)?.z ?? lamp.z) < SAME_SIDE_M) row.push(lamp);
    else rows.push([lamp]);
  }
  const head = LAMP_LOOKS.town.headM - SWAG_BELOW_HEAD_M;
  return rows.flatMap((row) => {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    return sorted.slice(1).flatMap((lamp, at) => {
      const before = sorted[at];
      if (Math.hypot(lamp.x - before.x, lamp.z - before.z) > SWAG_LONGEST_M) return [];
      const from = { x: before.x, y: before.y + head, z: before.z };
      const to = { x: lamp.x, y: lamp.y + head, z: lamp.z };
      return [{ bulbs: hang(from, to, SWAG_SAG_M, SWAG_BULB_EVERY_M).slice(1, -1), threshold: thresholdAt(before.x, before.z) }];
    });
  });
}

/** Torget's tree in the scene. */
export const treePlace = (origin: EastNorth) => sceneOf(TORGET_TREE, origin);

/** A bulb of a town string as a glow. */
export function bulbGlow(at: { x: number; y: number; z: number }, token = "string-warm"): GlowInstance {
  return { ...at, ...BULB, colour: nightRgb(token), rhythm: -1, periodS: 1, phase: 0 };
}

/** The star on top of a tree, bigger and brighter than its bulbs. */
export function starGlow(at: { x: number; y: number; z: number }): GlowInstance {
  return { ...at, sizeM: 1.6, minPixels: 2.5, brightness: 1.2, reachM: 3000, colour: nightRgb("star"), rhythm: -1, periodS: 1, phase: 0 };
}
