import { liveFeatures } from "../../features";
import type { FeatureArt } from "../feature-art";
import { LEAF_LIGHT_ART } from "../foliage/leaf-light";
import { partingArt } from "../foliage/parting";
import { SWAY_ART } from "../foliage/wind";
import { KeyShadows } from "../shadows/key-shadows";

/*
 * The art of the shadows' and foliage's features (see
 * `features/shadows-and-foliage.ts`), each in its own file under
 * `art/shadows/` and `art/foliage/`. The shadows are three's own, on the key
 * light: the sun's feature sets them up and keeps them each frame, reading
 * the far shadows' and the moon's switches as it does. The foliage's stages
 * move a plant in the world in order: the wind, then the parting round
 * Elliott.
 */

let shadows: KeyShadows | null = null;

/** The page's key light shadows, made the first time a frame asks for them (the switches are the page's). */
function keyShadows(): KeyShadows {
  shadows ??= new KeyShadows(liveFeatures());
  return shadows;
}

export const SHADOWS_AND_FOLIAGE_ART: readonly FeatureArt[] = [
  { feature: "sunShadows", frame: (frame) => keyShadows().update(frame) },
  { feature: "shadowCascades" },
  { feature: "moonShadows" },
  LEAF_LIGHT_ART,
  SWAY_ART,
  partingArt(),
];
