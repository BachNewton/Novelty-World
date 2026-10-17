import type { FeatureArt } from "../feature-art";
import { ABSORPTION_ART } from "../water/absorption";
import { CAUSTICS_ART } from "../water/caustics";
import { ICE_ART } from "../water/ice";
import { REFLECTIONS_ART } from "../water/reflections";
import { REFRACTION_ART } from "../water/refraction";
import { RIPPLE_PARALLAX_ART, RIPPLES_ART } from "../water/ripples";
import { SHORE_ART } from "../water/shore";
import { SKY_REFLECTION_ART } from "../water/sky-reflection";
import { SNELLS_WINDOW_ART } from "../water/snell";
import { UNDERWATER_ART } from "../water/underwater";

/**
 * The art of water's features (see `features/water.ts`), each in its own file
 * in `art/water/`. Their GLSL runs at each hook point in this order, so the
 * order is how the water is built up: parallax moves where the ripples are
 * read before they bend the normal, and ice flattens it last; the bed is
 * found before the light goes through the water to it; the sky is mirrored
 * before screen-space reflections replace it where they can; ice covers
 * everything under it; and from below, Snell's window comes before the fog.
 */
export const WATER_ART: readonly FeatureArt[] = [
  RIPPLE_PARALLAX_ART,
  RIPPLES_ART,
  ABSORPTION_ART,
  REFRACTION_ART,
  CAUSTICS_ART,
  SKY_REFLECTION_ART,
  REFLECTIONS_ART,
  SHORE_ART,
  ICE_ART,
  SNELLS_WINDOW_ART,
  UNDERWATER_ART,
  // Far water is meshes of its own (`water/far-water.ts`), which the world builds only while it is on.
  { feature: "farWater" },
];
