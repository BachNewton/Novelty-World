import type { FeatureArt } from "../feature-art";
import { ABSORPTION_ART } from "../water/absorption";
import { ICE_ART } from "../water/ice";
import { RIPPLES_ART } from "../water/ripples";
import { SHORE_ART } from "../water/shore";
import { SKY_REFLECTION_ART } from "../water/sky-reflection";
import { UNDERWATER_ART } from "../water/underwater";

/**
 * The art of water's features (see `features/water.ts`), each in its own file
 * in `art/water/`. Their part in the water's own material is its steps
 * (`water/steps.ts`), in the order they build the surface; here is what
 * reaches beyond it: the per-frame updates, and the fog under the water,
 * a colour stage of every kind.
 */
export const WATER_ART: readonly FeatureArt[] = [
  RIPPLES_ART,
  ABSORPTION_ART,
  SKY_REFLECTION_ART,
  SHORE_ART,
  ICE_ART,
  UNDERWATER_ART,
  // Far water is meshes of its own, which the world builds only while it is on.
  { feature: "farWater" },
];
