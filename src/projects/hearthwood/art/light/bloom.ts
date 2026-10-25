import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { vec4 } from "three/tsl";
import type { FeatureArt } from "../feature-art";

/*
 * Bloom (`bloom`): the brightest light in the frame (the campfire and its
 * glow, the sun, the moon and its halo) spills a soft glow into what is
 * round it, the way light blooms in the eye. Three's bloom at its cheap
 * settings: the light above a threshold blurred at a quarter of the
 * screen's size through a chain of halvings and added back. It works on the
 * scene's own light, before the tone curve, so the threshold is on how
 * bright a thing really is, not on how it shows.
 */

/** How bright, in the scene's light, a thing must be to bloom, and how softly it comes in. */
const THRESHOLD = 1.05;
const SOFT = 0.5;
const STRENGTH = 0.32;
const RADIUS = 0.45;
/** The glow is soft, so it is worked out at a quarter of the screen's size. */
const SCALE = 0.25;

export const BLOOM_ART: FeatureArt = {
  feature: "bloom",
  post: [
    {
      id: "bloom",
      order: -10,
      build: ({ colour }) => {
        const glow = bloom(colour, STRENGTH, RADIUS, THRESHOLD).setResolutionScale(SCALE);
        glow.smoothWidth.value = SOFT;
        // A new chain of render targets each build: freed when the pipeline is built again.
        return { colour: vec4(colour.rgb.add(glow.rgb), colour.a), dispose: () => glow.dispose() };
      },
    },
  ],
};
