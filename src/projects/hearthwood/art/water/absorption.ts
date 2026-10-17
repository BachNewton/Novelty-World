import { BufferAttribute } from "three";
import { REGIONS, type Region } from "../../engine/regions";
import type { FeatureArt } from "../feature-art";

/*
 * The water's colour from how far light travels through it. Water is nearly
 * clear: it absorbs red fastest and blue slowest, so the shallows show their
 * bed and the deeps turn blue-green, and what each region's water carries
 * tints it on top (the tannin of the lakeland's birch bogs, the peat of the
 * heath, the clear turquoise of a mountain tarn). These are absorption
 * coefficients per metre, red, green and blue, not colours: the colour comes
 * out of the light that reaches the eye through so much water.
 */

export type Absorption = readonly [number, number, number];

export const REGION_ABSORPTION: Record<Region, Absorption> = {
  // Clear, a little green.
  greenwood: [0.42, 0.1, 0.14],
  // The lakeland's tea-brown water, from the birch and the bogs round it.
  birchvale: [0.36, 0.25, 0.4],
  // Mountain water, clear to a turquoise depth.
  highlands: [0.5, 0.065, 0.05],
  // Dark with peat.
  heath: [0.32, 0.36, 0.55],
  // Olive, with what the autumn woods drop into it.
  maplewood: [0.38, 0.15, 0.22],
};

/** How much light the water scatters back per metre, the same for every colour: the deep water's own colour is this against what it absorbs. */
export const WATER_SCATTER = 0.045;

/** The absorption of water lying across regions, by each region's weight (`REGIONS.length` weights from `offset`). */
export function absorptionOf(weights: ArrayLike<number>, offset = 0): Absorption {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  REGIONS.forEach((region, i) => {
    const w = weights[offset + i];
    const [ar, ag, ab] = REGION_ABSORPTION[region];
    r += ar * w;
    g += ag * w;
    b += ab * w;
    total += w;
  });
  if (!(total > 0)) throw new Error("Water lies in no region: its region weights sum to nothing");
  return [r / total, g / total, b / total];
}

/** The deep water's own colour against white light: what it scatters back out of what it doesn't absorb. */
export function deepColourOf([r, g, b]: Absorption): Absorption {
  return [WATER_SCATTER / (r + WATER_SCATTER), WATER_SCATTER / (g + WATER_SCATTER), WATER_SCATTER / (b + WATER_SCATTER)];
}

/** Every vertex of a piece of water in one region: for water drawn outside the world (a fall's ribbon, the gallery's pool). */
export function regionAbsorption(region: Region, count: number): BufferAttribute {
  const values = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) values.set(REGION_ABSORPTION[region], v * 3);
  return new BufferAttribute(values, 3);
}

/** A tile's water's absorption, vertex by vertex, from its region weights. */
export function tileAbsorption(regions: Float32Array, count: number): BufferAttribute {
  const values = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) values.set(absorptionOf(regions, v * REGIONS.length), v * 3);
  return new BufferAttribute(values, 3);
}

/** The light through a column of water: `extinct` is what it absorbs and scatters per metre. */
export const WATER_COLUMN_GLSL = /* glsl */ `
#ifndef HW_WATER_COLUMN
#define HW_WATER_COLUMN
const float HW_WATER_SCATTER = ${WATER_SCATTER.toFixed(4)};
// What comes up out of a column of water of this length lit by light: the bed through it, and the water's own colour where the bed is lost.
vec3 hwThroughWater(vec3 bed, vec3 absorb, float path, vec3 light) {
  vec3 extinct = absorb + HW_WATER_SCATTER;
  vec3 through = exp(-extinct * path);
  return bed * through + HW_WATER_SCATTER / extinct * light * (1.0 - through);
}
#endif
`;

/** The way light goes: down to the bed, and back up to the eye along the view bent by the surface. */
const ABSORPTION_LIGHT = /* glsl */ `
  float cosV = max(dot(hwView, hwNormal), 0.0);
  float cosT = sqrt(max(1.0 - (1.0 - cosV * cosV) / 1.777, 0.0));
  hwBody = hwThroughWater(hwBed, hwAbsorb, hwDepth * (1.0 + 1.0 / max(cosT, 0.3)), hwLight);
`;

export const ABSORPTION_ART: FeatureArt = {
  feature: "waterAbsorption",
  chunks: [
    {
      kinds: ["water"],
      fragmentHead: WATER_COLUMN_GLSL,
      // The bed under the water as the land draws it, until something sees the real one.
      surface: "hwBed = uBed * hwLight;",
      light: ABSORPTION_LIGHT,
    },
  ],
};
