import type { FeatureArt } from "../feature-art";
import { SHADOW_RECEIVERS } from "./sun-shadows";

/*
 * Shadows out to a distance: four shadow maps in place of one, each covering
 * a slice of the view several times longer than the one before, so shadows
 * are sharp at Elliott's feet and still fall from trees and ridges most of a
 * kilometre off, fading out where the last map ends. The shadow maps read
 * this feature's define for how many maps there are (see `shadow-map.ts`).
 */

export const FAR_SHADOWS_ART: FeatureArt = {
  feature: "shadowCascades",
  chunks: [{ kinds: SHADOW_RECEIVERS, fragmentHead: "// Four shadow maps: HW_SHADOW_CASCADES sets HW_SHADOW_MAPS." }],
};
