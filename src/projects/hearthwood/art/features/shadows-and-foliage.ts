import type { FeatureArt } from "../feature-art";
import { LEAF_LIGHT_ART } from "../foliage/leaf-light";
import { partingArt } from "../foliage/parting";
import { SWAY_ART } from "../foliage/wind";
import { FAR_SHADING_ART } from "../shadows/far-shading";
import { FAR_SHADOWS_ART } from "../shadows/far-shadows";
import { MOON_SHADOWS_ART } from "../shadows/moon-shadows";
import { OVERCAST_ART } from "../shadows/overcast";
import { SOFT_SHADOWS_ART } from "../shadows/soft-shadows";
import { SUN_SHADOWS_ART } from "../shadows/sun-shadows";

/*
 * The art of the shadows' and foliage's features (see
 * `features/shadows-and-foliage.ts`), each in its own file under
 * `art/shadows/` and `art/foliage/`. The order matters: the shadows'
 * declarations come before what reads them, the sun's frame sets the shadow
 * light before the moon's and the cloud's change it, and the shadow darkens
 * a leaf before the light through it is added.
 */
export const SHADOWS_AND_FOLIAGE_ART: readonly FeatureArt[] = [
  SUN_SHADOWS_ART,
  FAR_SHADOWS_ART,
  SOFT_SHADOWS_ART,
  MOON_SHADOWS_ART,
  OVERCAST_ART,
  FAR_SHADING_ART,
  LEAF_LIGHT_ART,
  SWAY_ART,
  partingArt(),
];
