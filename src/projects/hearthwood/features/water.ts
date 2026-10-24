import { featureGroup } from "./group";

/** Water's features: the surface, its colour, what it mirrors and its edges. */
export const WATER_FEATURES = featureGroup("water", [
  {
    id: "ripples",
    name: "Ripples",
    description: "A few soft waves over the surface, each smaller and quicker, never lining up; a river's run downstream and rain roughens them. They fade before they would shimmer.",
  },
  {
    id: "waterAbsorption",
    name: "Colour from depth",
    description: "The water's colour from how far light goes through it: the bed showing through the shallows, the deeps in each region's own water (clear green, tea-brown, turquoise, peat, olive).",
  },
  {
    id: "shoreHighlight",
    name: "Shore highlight",
    description: "Storybook foam lines along the very edge of the water, breathing in and out, so every shoreline reads at a glance.",
  },
  {
    id: "skyReflection",
    name: "Sky reflection",
    description: "The sky mirrored along the reflected view, more at a glance than looking down, with the sun's glint by day and the moon's by night.",
  },
  {
    id: "underwaterFog",
    name: "Underwater fog",
    description: "With the eye under the surface, everything fades into the water's own colour by how far light goes through it.",
  },
  {
    id: "farWater",
    name: "Far water",
    description: "Lakes in the distant land, flat and still, so water reads out to the horizon.",
  },
  {
    id: "lakeIce",
    name: "Winter ice",
    description: "Pale, cracked ice growing out from lake and river edges into winter, and melting back in spring.",
  },
]);
