import { type Node, type UniformNode } from "three/webgpu";
import { float, uniform } from "three/tsl";
import type { Season } from "../climate/season";

/*
 * The season every material reads, as the sun is (`art/sun.ts`): a gallery hands a kit fixed dials, the game hands it
 * the live ones, uniforms the date moves. Either way a material reads each dial as a float node and never needs to
 * know there is a date. The dials are `climate/season.ts`'s shares, flattened; each thing then changes on its own
 * threshold rolled from its place (`changeOf`, the shader's `oneByOne`), so a wood turns tree by tree.
 */

export interface SeasonDials {
  /** The share of broadleaf trees in leaf, and the share turned to their autumn colour. */
  leafed: number;
  turned: number;
  /** Fallen leaves on the verges and under the trees, 0 to 1. */
  fallen: number;
  /** How much of the open ground is white, 0 to 1, and how deep the snow lies, cm. */
  snowCover: number;
  snowDepthCm: number;
  /** How far out the sea is frozen, and bears a car, as exposures from 0 (the most sheltered bay) to 1 (the open sea). */
  iceReach: number;
  iceDrivable: number;
  /** The winter's lights: the town's streets, homes', windows', and the Advent candles lit (0 to 4). */
  lightsTown: number;
  lightsHomes: number;
  lightsWindows: number;
  adventCandles: number;
  /** Placed things out in their season. */
  terraces: number;
  grazing: number;
  boatsAfloat: number;
  bales: number;
}

export const DIAL_NAMES = [
  "leafed",
  "turned",
  "fallen",
  "snowCover",
  "snowDepthCm",
  "iceReach",
  "iceDrivable",
  "lightsTown",
  "lightsHomes",
  "lightsWindows",
  "adventCandles",
  "terraces",
  "grazing",
  "boatsAfloat",
  "bales",
] as const satisfies readonly (keyof SeasonDials)[];

/** High summer: everything in leaf, nothing frozen, every summer thing out. What a kit draws when it's given no season. */
export const SUMMER: SeasonDials = {
  leafed: 1,
  turned: 0,
  fallen: 0,
  snowCover: 0,
  snowDepthCm: 0,
  iceReach: 0,
  iceDrivable: 0,
  lightsTown: 0,
  lightsHomes: 0,
  lightsWindows: 0,
  adventCandles: 0,
  terraces: 1,
  grazing: 1,
  boatsAfloat: 1,
  bales: 1,
};

export function dialsOf(season: Season): SeasonDials {
  return {
    leafed: season.leaves.leafed,
    turned: season.leaves.turned,
    fallen: season.leaves.fallen,
    snowCover: season.snow.cover,
    snowDepthCm: season.snow.depthCm,
    iceReach: season.seaIce.reach,
    iceDrivable: season.seaIce.drivable,
    lightsTown: season.lights.town,
    lightsHomes: season.lights.homes,
    lightsWindows: season.lights.windows,
    adventCandles: season.lights.adventCandles,
    terraces: season.inSeason.terraces,
    grazing: season.inSeason.grazing,
    boatsAfloat: season.inSeason.boatsAfloat,
    bales: season.inSeason.bales,
  };
}

export type SeasonNodes = Record<keyof SeasonDials, Node<"float">>;

/** The game's season, moved by the date. */
export interface LiveSeason {
  uniforms: Record<keyof SeasonDials, UniformNode<"float", number>>;
  /** The dials as last set, for what is worked out on the CPU. */
  current: () => SeasonDials;
  set: (dials: SeasonDials) => void;
}

export type SeasonLook = SeasonDials | LiveSeason;

const isLive = (season: SeasonLook): season is LiveSeason => "uniforms" in season;

export function createLiveSeason(start: SeasonDials): LiveSeason {
  let current = { ...start };
  const uniforms = Object.fromEntries(DIAL_NAMES.map((name) => [name, uniform(start[name])])) as LiveSeason["uniforms"];
  return {
    uniforms,
    current: () => current,
    set(dials) {
      current = { ...dials };
      for (const name of DIAL_NAMES) uniforms[name].value = dials[name];
    },
  };
}

/** The season's dials for a shader. */
export function seasonNodes(season: SeasonLook = SUMMER): SeasonNodes {
  if (isLive(season)) return season.uniforms;
  const dial = (value: number): Node<"float"> => float(value);
  return Object.fromEntries(DIAL_NAMES.map((name) => [name, dial(season[name])])) as SeasonNodes;
}

/** The season's dials as the CPU sees them now. */
export function dialsNow(season: SeasonLook = SUMMER): SeasonDials {
  return isLive(season) ? season.current() : season;
}

/** One thing's state, 0 to 1, as the share of its kind reaches its own threshold: `climate/season.ts`'s `oneByOne` on the GPU. */
export function changeOf(share: Node<"float">, threshold: Node<"float">, softness = 0.04): Node<"float"> {
  return share.mul(1 + softness).sub(threshold).div(softness).clamp(0, 1);
}
