import { fbm, gradientNoise, smoothstep, type Noise2 } from "./noise";
import type { LandSample } from "./land";

/*
 * The world's regions, each with a character of its own, so a long walk
 * feels like travelling somewhere new. Each region has its own slowly
 * varying field, nudged by the land (the pine highlands keep to the ranges,
 * birch to the wet lowlands, heath to the open hills), and a point belongs to
 * the region whose field is highest there, blending softly across a border.
 * The greenwood is home: it holds the land round the world's origin, where
 * camp is.
 */

export const REGIONS = ["greenwood", "birchvale", "highlands", "heath", "maplewood"] as const;
export type Region = (typeof REGIONS)[number];

export const PLANT_KINDS = ["conifer", "pine", "broadleaf", "birch", "aspen", "maple", "bush", "heather", "fern", "mushroom", "flowers", "rock"] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];
export type TreeKind = Extract<PlantKind, "conifer" | "pine" | "broadleaf" | "birch" | "aspen" | "maple">;
export const TREE_KINDS: readonly TreeKind[] = ["conifer", "pine", "broadleaf", "birch", "aspen", "maple"];

export const PLACE_KINDS = ["stone-circle", "cairn", "tor", "shrine", "fallen-tree", "fairy-ring", "seter", "tarn", "cascade", "waterfall"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** What grows in a region and what is found there: the shares are weights, not fractions. */
export interface RegionCharacter {
  name: string;
  /** How much of the land the woods cover, 0 to 1. */
  woods: number;
  /** The trees, low down and up towards the treeline. */
  trees: Partial<Record<TreeKind, number>>;
  highTrees: Partial<Record<TreeKind, number>>;
  /** Out in the open and under the trees, how often each smaller plant grows, per scatter spot. */
  open: Partial<Record<Exclude<PlantKind, TreeKind>, number>>;
  underTrees: Partial<Record<Exclude<PlantKind, TreeKind>, number>>;
  /** Which of the flower designs bloom here. */
  flowers: readonly number[];
  /** The places a region's land holds (waterfalls happen wherever a river falls). */
  places: Partial<Record<Exclude<PlaceKind, "waterfall">, number>>;
  /** Fireflies over its meadows at night, per scatter chunk. */
  fireflies: number;
}

export const REGION_CHARACTER: Record<Region, RegionCharacter> = {
  greenwood: {
    name: "Greenwood",
    woods: 0.5,
    trees: { broadleaf: 5, conifer: 2, birch: 2, aspen: 0.6 },
    highTrees: { conifer: 5, broadleaf: 1 },
    open: { flowers: 0.1, bush: 0.035, rock: 0.012 },
    underTrees: { bush: 0.08, fern: 0.08, mushroom: 0.015 },
    flowers: [0, 1, 2],
    places: { "stone-circle": 2, shrine: 2, cairn: 2, "fallen-tree": 2, cascade: 1 },
    fireflies: 10,
  },
  birchvale: {
    name: "Birch vale",
    woods: 0.38,
    trees: { birch: 7, pine: 1.5, aspen: 1.5, conifer: 1 },
    highTrees: { birch: 3, conifer: 3 },
    open: { flowers: 0.2, bush: 0.02, rock: 0.008 },
    underTrees: { fern: 0.1, mushroom: 0.04, flowers: 0.04 },
    flowers: [0, 1],
    places: { "fairy-ring": 3, "stone-circle": 2, shrine: 1 },
    fireflies: 16,
  },
  highlands: {
    name: "Pine highlands",
    woods: 0.62,
    trees: { pine: 5, conifer: 4, birch: 0.6, aspen: 0.6 },
    highTrees: { conifer: 6, pine: 1 },
    open: { rock: 0.06, heather: 0.03, flowers: 0.02, bush: 0.01 },
    underTrees: { fern: 0.06, rock: 0.025, mushroom: 0.01 },
    flowers: [2],
    places: { seter: 3, tarn: 3, cascade: 3, cairn: 2, shrine: 1, tor: 1 },
    fireflies: 3,
  },
  heath: {
    name: "Heath",
    woods: 0.07,
    trees: { pine: 2, birch: 2 },
    highTrees: { pine: 2 },
    open: { heather: 0.42, rock: 0.04, flowers: 0.03, bush: 0.012 },
    underTrees: { heather: 0.1 },
    flowers: [1, 2],
    places: { tor: 3, cairn: 2, "stone-circle": 2, tarn: 1 },
    fireflies: 4,
  },
  maplewood: {
    name: "Maple wood",
    woods: 0.72,
    trees: { maple: 6, aspen: 2.5, birch: 1.2, broadleaf: 1 },
    highTrees: { conifer: 3, maple: 2 },
    open: { flowers: 0.06, bush: 0.04, fern: 0.03, rock: 0.01 },
    underTrees: { fern: 0.14, mushroom: 0.05, bush: 0.03 },
    flowers: [1],
    places: { "fallen-tree": 3, "fairy-ring": 2, shrine: 2 },
    fireflies: 8,
  },
};

/** A point's share of each region, in REGIONS order, summing to 1. */
export type RegionWeights = Float32Array;

/** How sharply one region gives way to the next: higher is a narrower border. */
const BORDER_SHARPNESS = 9;
const HOME_REACH = [500, 1500] as const;

export interface Regions {
  weightsAt: (x: number, z: number, land: LandSample, out?: RegionWeights) => RegionWeights;
}

export function makeRegions(seed: string): Regions {
  const fields: Noise2[] = REGIONS.map((r) => gradientNoise(`${seed}/region/${r}`));
  const scores = new Float32Array(REGIONS.length);
  return {
    weightsAt(x, z, land, out = new Float32Array(REGIONS.length)) {
      const home = 1 - smoothstep(HOME_REACH[0], HOME_REACH[1], Math.hypot(x, z));
      const { mountainous: m, wetness: wet, hilly } = land;
      const bias: Record<Region, number> = {
        greenwood: 0.85 * home - 0.25 * m,
        birchvale: 0.45 * wet - 0.5 * m - 0.1,
        highlands: 1.2 * m - 0.35,
        heath: 0.45 * hilly - 0.4 * wet - 0.3 * m,
        maplewood: 0.3 * hilly - 0.15 * wet - 0.3 * m,
      };
      let best = -Infinity;
      REGIONS.forEach((r, i) => {
        scores[i] = fbm(fields[i], x / 1500 + i * 13.7, z / 1500 - i * 7.1, 2) + bias[r];
        best = Math.max(best, scores[i]);
      });
      let total = 0;
      for (let i = 0; i < REGIONS.length; i++) {
        out[i] = Math.exp((scores[i] - best) * BORDER_SHARPNESS);
        total += out[i];
      }
      for (let i = 0; i < REGIONS.length; i++) out[i] /= total;
      return out;
    },
  };
}

/** The region with the largest share. */
export function mainRegion(weights: RegionWeights): Region {
  let best = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
  return REGIONS[best];
}
