import type { FeatureArt } from "../feature-art";
import { WATER_COLUMN_GLSL } from "./absorption";

/*
 * Snell's window: looking up from under the water, the whole sky is squeezed
 * into a bright circle overhead (light from the horizon comes in bent to
 * about 49° from straight up), rippling with the surface and brightest
 * towards its rim where the sky's haze lies. Outside it the surface is a
 * perfect mirror (total internal reflection) of the water below: its own
 * deep colour.
 */

const HEAD = WATER_COLUMN_GLSL;

const COLOUR = /* glsl */ `
  if (hwBelow) {
    vec3 up = -hwView;
    vec3 down = -hwNormal;
    vec3 skyward = refract(up, down, 1.333);
    vec3 below = HW_WATER_SCATTER / (hwAbsorb + HW_WATER_SCATTER) * hwLight;
    if (dot(skyward, skyward) == 0.0) {
      hwColour = below;
    } else {
      float facing = max(dot(up, hwNormal), 0.0);
      float mirror = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
      // The rim of the window, where the whole horizon is crowded in.
      float rim = smoothstep(0.55, 0.95, length(skyward.xz));
      vec3 sky = hwSkyAlong(skyward) * (1.0 + 0.6 * rim);
      sky += uHwSunLight * 30.0 * pow(max(dot(skyward, uHwSunDir), 0.0), 400.0) * smoothstep(-0.02, 0.06, uHwSunDir.y);
      hwColour = mix(sky, below, max(mirror, smoothstep(0.85, 1.0, rim) * 0.6));
    }
  }
`;

export const SNELLS_WINDOW_ART: FeatureArt = {
  feature: "snellsWindow",
  chunks: [{ kinds: ["water"], fragmentHead: HEAD, colour: COLOUR }],
};
