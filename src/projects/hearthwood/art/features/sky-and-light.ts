import type { FeatureArt } from "../feature-art";
import { BLOOM_ART } from "../light/bloom";
import { COLOUR_GRADE_ART } from "../light/grade";
import { INK_EDGES_ART } from "../light/ink-edges";
import { VIGNETTE_ART } from "../light/vignette";
import { AURORA_ART } from "../sky/aurora";
import { MILKY_WAY_ART } from "../sky/milky-way";
import { MOON_ART } from "../sky/moon";
import { RAINBOW_ART } from "../sky/rainbow";
import { STARS_ART } from "../sky/stars";

/*
 * The art of the sky's and the light's features (see
 * `features/sky-and-light.ts`), each in its own file under `sky/` and
 * `light/`. Their order is the order their stages meet the sky's colour:
 * the far sights first (the Milky Way, the stars, the aurora), then the
 * moon in front of them, then the rainbow in the rain in front of it all.
 * The post steps order themselves around the tone curve. The sunlight, the
 * handover to the moon, the moonlight and the tone curve are the light
 * itself (`light/daylight.tsx`, `light/tone-mapping.ts`), with no stages of
 * their own.
 */
export const SKY_AND_LIGHT_ART: readonly FeatureArt[] = [MILKY_WAY_ART, STARS_ART, AURORA_ART, MOON_ART, RAINBOW_ART, INK_EDGES_ART, BLOOM_ART, COLOUR_GRADE_ART, VIGNETTE_ART];
