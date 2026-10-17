import { featureGroup } from "./group";

/** Shadows, and how leaves and grass move and take the light. */
export const SHADOWS_AND_FOLIAGE_FEATURES = featureGroup("shadows-and-foliage", [
  {
    id: "sunShadows",
    name: "Shadows",
    description: "The sun casts shadows from everything that stands in its light, round Elliott (most of a kilometre with the far shadows). A pass drawing the shadow maps before the scene, and their reading in every lit material.",
  },
  {
    id: "shadowCascades",
    name: "Far shadows",
    description: "Shadows reach most of a kilometre: four shadow maps, sharp at Elliott's feet and coarser with distance, fading out where they end.",
  },
  {
    id: "softShadows",
    name: "Soft shadows",
    description: "A shadow's edge is crisp where it touches what casts it and softens with the distance below it, like a treetop's dappled shade.",
  },
  {
    id: "moonShadows",
    name: "Moon shadows",
    description: "At night the moon casts shadows, softer than the sun's and as faint as its light. Off, nights have no shadows and draw no shadow map.",
  },
  {
    id: "overcastShadows",
    name: "Overcast softening",
    description: "As cloud covers the sky, shadows widen and pale, to a soft darkening under things beneath a full overcast.",
  },
  {
    id: "farShading",
    name: "Far slopes",
    description: "Past the shadows' reach (or everywhere with them off), land turned from the light goes into shade, so far mountains keep a lit side and a shaded side.",
  },
  {
    id: "leafLight",
    name: "Light through leaves",
    description: "Leaves and fronds glow warm with the sun behind them, through the thin edge of a crown, which is the golden-hour forest.",
  },
  {
    id: "sway",
    name: "Wind sway",
    description: "Trees, bushes and flowers sway in the wind, branches and leaves fluttering, as gusts roll across the land. Their shadows sway with them.",
  },
  {
    id: "plantParting",
    name: "Parting plants",
    description: "Flowers, ferns, heather and bushes bend away from Elliott as they walk through, and spring back behind them.",
  },
]);
