import type { FeatureArt } from "../feature-art";
import { BLOOM_ART } from "../light/bloom";
import { COLOUR_GRADE_ART } from "../light/grade";
import { NIGHT_VISION_ART } from "../light/night-vision";
import { VIGNETTE_ART } from "../light/vignette";
import { AURORA_ART } from "../sky/aurora";
import { MILKY_WAY_ART } from "../sky/milky-way";
import { MOON_ART } from "../sky/moon";
import { NOCTILUCENT_ART } from "../sky/noctilucent";
import { RAINBOW_ART } from "../sky/rainbow";
import { SKY_SCATTERING_ART } from "../sky/sky-scattering";
import { STARS_ART } from "../sky/stars";

/*
 * The art of the sky's and the light's features (see
 * `features/sky-and-light.ts`), each in its own file under `sky/` and
 * `light/`. Their order is the order their GLSL meets a colour: the sky
 * first, then the eye's night vision over it, then what shines through the
 * night unshifted (the Milky Way, the stars, the aurora, the noctilucent
 * clouds and the moon, nearest last), then the rainbow in the rain in front
 * of it all. The sunlight, the handover to the moon, the moonlight, the
 * sky's light all round and the tone curve are the light itself
 * (`light/daylight.tsx`), with no GLSL or pass of their own.
 */
export const SKY_AND_LIGHT_ART: readonly FeatureArt[] = [
  SKY_SCATTERING_ART,
  NIGHT_VISION_ART,
  MILKY_WAY_ART,
  STARS_ART,
  AURORA_ART,
  NOCTILUCENT_ART,
  MOON_ART,
  RAINBOW_ART,
  BLOOM_ART,
  COLOUR_GRADE_ART,
  VIGNETTE_ART,
];
