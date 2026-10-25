import type { FeatureArt } from "../feature-art";
import { ATMOSPHERE_AND_WEATHER_ART } from "./atmosphere-and-weather";
import { SEASONS_ART } from "./seasons";
import { SHADOWS_AND_FOLIAGE_ART } from "./shadows-and-foliage";
import { SKY_AND_LIGHT_ART } from "./sky-and-light";
import { WATER_ART } from "./water";

/** Every feature's art, gathered from each group's own file. The seasons come before the weather: they say what the ground is, and the rain soaks whatever it is. */
export const FEATURE_ART: readonly FeatureArt[] = [...WATER_ART, ...SKY_AND_LIGHT_ART, ...SHADOWS_AND_FOLIAGE_ART, ...SEASONS_ART, ...ATMOSPHERE_AND_WEATHER_ART];
