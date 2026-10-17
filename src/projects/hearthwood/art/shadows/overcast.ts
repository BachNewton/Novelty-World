import type { FeatureArt } from "../feature-art";
import { shadowLight } from "./shadow-map";
import { weatherInput } from "./weather-input";

/*
 * Shadows under cloud: as the sky clouds over, the light comes from more and
 * more of it, so shadows widen and pale until, under a full overcast, only a
 * soft darkening is left under things. Reads the cloud cover from the
 * weather (`weather-input.ts`, the engine's weather).
 */

/** The widest the light grows under a full overcast, as the tangent of its radius. */
const OVERCAST_ANGLE = 0.16;
const OVERCAST_BLUR = 0.5;
/** How much of a shadow is left under a full overcast. */
const OVERCAST_STRENGTH = 0.3;

export const OVERCAST_ART: FeatureArt = {
  feature: "overcastShadows",
  frame: ({ weather }) => {
    const { clouds } = weatherInput(weather.weather);
    const spread = Math.sqrt(clouds);
    shadowLight.angle += (OVERCAST_ANGLE - shadowLight.angle) * spread;
    shadowLight.blur += (OVERCAST_BLUR - shadowLight.blur) * spread;
    shadowLight.strength *= 1 - (1 - OVERCAST_STRENGTH) * clouds;
  },
};
