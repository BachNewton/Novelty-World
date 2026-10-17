import { featureGroup } from "./group";

/** Water's features: the surface, what shows through it and what it mirrors. */
export const WATER_FEATURES = featureGroup("water", [
  {
    id: "ripples",
    name: "Ripples",
    description: "Layered waves on the surface, each smaller and quicker, never lining up; rivers' run downstream. Shader only.",
  },
  {
    id: "rippleParallax",
    name: "Ripple parallax",
    description: "A few steps through the ripples' height along the view, so the surface has depth. Needs the ripples.",
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
    id: "refraction",
    name: "Refraction",
    description: "The real bed seen through the water, bent by the ripples. A copy of the scene behind the water.",
  },
  {
    id: "screenSpaceReflections",
    name: "Screen-space reflections",
    description: "The land, trees and sky on screen mirrored in the water, the sky's reflection where they leave it. A copy of the scene at half size.",
  },
  {
    id: "caustics",
    name: "Caustics",
    description: "Dancing light on the bed of shallow water, where the ripples focus the sun.",
  },
  {
    id: "underwaterFog",
    name: "Underwater fog",
    description: "With the eye under the surface, everything fades into the water's own colour by how far light travels through it.",
  },
  {
    id: "snellsWindow",
    name: "Snell's window",
    description: "From under the water, the sky through a bright circle overhead, and the water mirrored outside it.",
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
