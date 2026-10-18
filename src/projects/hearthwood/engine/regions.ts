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

export const PLANT_KINDS = ["conifer", "pine", "broadleaf", "birch", "aspen", "maple", "bush", "heather", "fern", "flowers", "rock"] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];
export type TreeKind = Extract<PlantKind, "conifer" | "pine" | "broadleaf" | "birch" | "aspen" | "maple">;
export const TREE_KINDS: readonly TreeKind[] = ["conifer", "pine", "broadleaf", "birch", "aspen", "maple"];

/** What can be picked in the forests: berries, and mushrooms (the fly agaric for brewing, never for eating). */
export const WOODLAND_KINDS = ["bilberry", "lingonberry", "wild-strawberry", "raspberry", "cloudberry", "chanterelle", "porcini", "funnel-chanterelle", "fly-agaric"] as const;
/** The witch's herbs, gathered for brewing: yarrow on dry meadows, meadowsweet by the water, juniper on the heath. */
export const HERB_KINDS = ["yarrow", "meadowsweet", "juniper"] as const;
export type Herb = (typeof HERB_KINDS)[number];
export const FORAGE_KINDS = [...WOODLAND_KINDS, ...HERB_KINDS] as const;
export type ForageKind = (typeof FORAGE_KINDS)[number];

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
  /** How plentiful each thing to pick is here, where its ground suits it: about 1 is usual, 0 never. */
  forage: Partial<Record<ForageKind, number>>;
}

export const REGION_CHARACTER: Record<Region, RegionCharacter> = {
  greenwood: {
    name: "Greenwood",
    woods: 0.5,
    trees: { broadleaf: 5, conifer: 2, birch: 2, aspen: 0.6 },
    highTrees: { conifer: 5, broadleaf: 1 },
    open: { flowers: 0.1, bush: 0.035, rock: 0.012 },
    underTrees: { bush: 0.08, fern: 0.08 },
    flowers: [0, 1, 2],
    places: { "stone-circle": 2, shrine: 2, cairn: 2, "fallen-tree": 2, cascade: 1 },
    fireflies: 10,
    forage: { "wild-strawberry": 1.3, raspberry: 1.3, bilberry: 0.7, porcini: 1.1, chanterelle: 0.7, "fly-agaric": 0.7, lingonberry: 0.3, "funnel-chanterelle": 0.3, yarrow: 1.2, meadowsweet: 1, juniper: 0.4 },
  },
  birchvale: {
    name: "Birch vale",
    woods: 0.38,
    trees: { birch: 7, pine: 1.5, aspen: 1.5, conifer: 1 },
    highTrees: { birch: 3, conifer: 3 },
    open: { flowers: 0.2, bush: 0.02, rock: 0.008 },
    underTrees: { fern: 0.1, flowers: 0.04 },
    flowers: [0, 1],
    places: { "fairy-ring": 3, "stone-circle": 2, shrine: 1 },
    fireflies: 16,
    forage: { chanterelle: 1.7, "fly-agaric": 1.5, cloudberry: 1.5, bilberry: 0.9, "wild-strawberry": 0.7, raspberry: 0.5, porcini: 0.6, lingonberry: 0.6, "funnel-chanterelle": 0.6, meadowsweet: 1.4, yarrow: 0.8, juniper: 0.5 },
  },
  highlands: {
    name: "Pine highlands",
    woods: 0.62,
    trees: { pine: 5, conifer: 4, birch: 0.6, aspen: 0.6 },
    highTrees: { conifer: 6, pine: 1 },
    open: { rock: 0.06, heather: 0.03, flowers: 0.02, bush: 0.01 },
    underTrees: { fern: 0.06, rock: 0.025 },
    flowers: [2],
    places: { seter: 3, tarn: 3, cascade: 3, cairn: 2, shrine: 1, tor: 1 },
    fireflies: 3,
    forage: { bilberry: 1.7, lingonberry: 1.2, "funnel-chanterelle": 1.5, chanterelle: 0.9, cloudberry: 1, porcini: 0.6, "fly-agaric": 0.5, raspberry: 0.4, "wild-strawberry": 0.3, juniper: 1, yarrow: 0.5, meadowsweet: 0.6 },
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
    forage: { lingonberry: 1.4, bilberry: 0.7, cloudberry: 0.9, "fly-agaric": 0.5, "wild-strawberry": 0.4, chanterelle: 0.3, juniper: 1.6, yarrow: 1.1, meadowsweet: 0.5 },
  },
  maplewood: {
    name: "Maple wood",
    woods: 0.72,
    trees: { maple: 6, aspen: 2.5, birch: 1.2, broadleaf: 1 },
    highTrees: { conifer: 3, maple: 2 },
    open: { flowers: 0.06, bush: 0.04, fern: 0.03, rock: 0.01 },
    underTrees: { fern: 0.14, bush: 0.03 },
    flowers: [1],
    places: { "fallen-tree": 3, "fairy-ring": 2, shrine: 2 },
    fireflies: 8,
    forage: { porcini: 1.5, raspberry: 1.1, chanterelle: 0.9, "wild-strawberry": 0.7, "fly-agaric": 0.6, bilberry: 0.3, "funnel-chanterelle": 0.3, meadowsweet: 0.9, yarrow: 0.7, juniper: 0.2 },
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
