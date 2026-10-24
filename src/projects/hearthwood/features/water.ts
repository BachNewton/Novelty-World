import { featureGroup } from "./group";

/** Water's features: the surface, what shows through it and what it mirrors. */
export const WATER_FEATURES = featureGroup("water", [
  {
    id: "ripples",
    name: "Ripples",
    description: "Layered waves on the surface, each smaller and quicker, never lining up; rivers' run downstream. Shader only.",
  },
  {
    id: "waterAbsorption",
    name: "Colour from depth",
    description: "The water's colour from how far light travels through it: clear shallows, blue-green deeps, tinted by each region's water.",
  },
  {
    id: "shoreHighlight",
    name: "Shore highlight",
    description: "A soft bright edge and lace of foam where the water is very shallow, so shorelines read.",
  },
  {
    id: "skyReflection",
    name: "Sky reflection",
    description: "The live sky mirrored, more at grazing angles, with the sun's glint (the moon's at night).",
  },
  {
    id: "underwaterFog",
    name: "Underwater fog",
    description: "With the eye under the surface, everything fades into the water's own colour by how far light travels through it.",
  },
  {
    id: "farWater",
    name: "Far water",
    description: "Lakes in the distant land, drawn simply (colour by depth, the sky mirrored), so water reads out to the horizon.",
  },
  {
    id: "lakeIce",
    name: "Winter ice",
    description: "Ice growing out from lake and river edges into winter, and melting back in spring.",
  },
]);
