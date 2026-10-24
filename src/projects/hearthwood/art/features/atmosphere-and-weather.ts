import { CLOUD_SHADOWS_ART } from "../atmosphere/cloud-shadows";
import { CLOUDS_ART } from "../atmosphere/clouds";
import { FOG_ART } from "../atmosphere/fog";
import { SUN_GLOW_ART } from "../atmosphere/sun-glow";
import type { FeatureArt } from "../feature-art";
import { LIGHTNING_ART } from "../weather/lightning";
import { WET_GROUND_ART } from "../weather/wet-ground";

/**
 * The art of the atmosphere's and the weather's features (see
 * `features/atmosphere-and-weather.ts`), each in its own file under
 * `art/atmosphere/` and `art/weather/`. Within a stage they run in this
 * order: the lightning lights the sky before the clouds are painted over
 * it, the puddles take the light before the clouds' shadows shade it, and
 * the fog lies over everything last, with the glow in it after.
 */
export const ATMOSPHERE_AND_WEATHER_ART: readonly FeatureArt[] = [LIGHTNING_ART, CLOUDS_ART, CLOUD_SHADOWS_ART, WET_GROUND_ART, FOG_ART, SUN_GLOW_ART];
