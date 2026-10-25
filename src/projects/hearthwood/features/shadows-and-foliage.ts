import { featureGroup } from "./group";

/** Shadows, and how leaves and grass move and take the light. */
export const SHADOWS_AND_FOLIAGE_FEATURES = featureGroup("shadows-and-foliage", [
  {
    id: "sunShadows",
    name: "Shadows",
    description: "The sun casts soft shadows from everything that stands in its light, tinted by the moment's own colour rather than black, fading as the sun nears the horizon and paling as cloud covers the sky.",
  },
  {
    id: "moonShadows",
    name: "Moon shadows",
    description: "At night the moon casts shadows too, lighter than the sun's and as faint as its light. Off, nights have no shadows.",
  },
  {
    id: "leafLight",
    name: "Light through leaves",
    description: "Leaves and fronds glow warm with the light behind them, brightest looking towards it: the golden-hour forest.",
  },
  {
    id: "sway",
    name: "Wind sway",
    description: "Trees, bushes and flowers lean downwind and sway, branches and leaves fluttering, as gusts roll across the land. Their shadows sway with them.",
  },
  {
    id: "plantParting",
    name: "Parting plants",
    description: "Flowers, ferns, heather and bushes bend away from Elliott as they walk through, and spring back behind them.",
  },
]);
