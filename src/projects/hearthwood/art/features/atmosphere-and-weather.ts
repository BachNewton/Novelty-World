import { BLOOMY_FOG_ART } from "../atmosphere/bloomy-fog";
import { CLOUD_SHADOWS_ART } from "../atmosphere/cloud-shadows";
import { CLOUDS_ART } from "../atmosphere/clouds";
import { CREPUSCULAR_RAYS_ART } from "../atmosphere/crepuscular-rays";
import { FOG_ART } from "../atmosphere/fog";
import { SUN_SHAFTS_ART } from "../atmosphere/sun-shafts";
import type { FeatureArt } from "../feature-art";
import { LIGHTNING_ART } from "../weather/lightning";
import { WET_GROUND_ART } from "../weather/wet-ground";

/**
 * The art of the atmosphere's and the weather's features (see
 * `features/atmosphere-and-weather.ts`), each in its own file under
 * `art/atmosphere/` and `art/weather/`. Within a hook their chunks run in
 * this order: the lightning lights the sky before the clouds are drawn
 * over it, the puddles take the light before the clouds' shadows shade it,
 * and the fog lies over everything last.
 */
export const ATMOSPHERE_AND_WEATHER_ART: readonly FeatureArt[] = [LIGHTNING_ART, CLOUDS_ART, CLOUD_SHADOWS_ART, WET_GROUND_ART, FOG_ART, CREPUSCULAR_RAYS_ART, SUN_SHAFTS_ART, BLOOMY_FOG_ART];
