import { featureGroup } from "./group";

/** How the land shows the season: leaves turning and falling, snow lying, water freezing. */
export const SEASONS_FEATURES = featureGroup("seasons", [
  {
    id: "seasonalFoliage",
    name: "Seasonal plants",
    description: "Broadleaves leaf out, turn and fall bare to their branches with the date, each tree on its own days; conifers darken; flowers and heather bloom in their months; snow lies on what faces up.",
  },
  {
    id: "seasonalGround",
    name: "Seasonal ground",
    description: "Snow lies and melts with the date down to its line, with spring's dormant straw and new green, autumn's gold grass and fallen leaves, and the far woods turning.",
  },
]);
