import type { Vector3, Vector4 } from "three";
import { positionWorld } from "three/tsl";
import { throughAir } from "../atmosphere";
import { REGIONS } from "../../engine/regions";
import type { DayState } from "../light/daylight";
import type { FeatureArt } from "../feature-art";
import type { WeatherNow } from "../weather/now";
import { REGION_AIR } from "../palette";

/*
 * Fog: the air between the eye and what it sees, worked out per pixel along
 * the ray. Two kinds of air mix in it. The clear air scatters blue more than
 * red (as Rayleigh scattering does), so far land turns blue before it fades
 * into the horizon's colour, and it thins slowly with height. Mist and the
 * veil of rain are droplets, which scatter forward (as Mie scattering does),
 * so they glow white towards the sun; the mist lies in a shallow layer on
 * the valley floor round the camera, so it pools in the valleys and the
 * ridges stand out of it, and the rain's veil reaches higher. How thick each
 * is comes from the weather: a crisp clear day shows the land out to the
 * horizon, a damp dawn fills the valleys with mist that lifts by noon, and a
 * downpour closes the view in. The mist takes the colour of the region the
 * camera is in, blended across their borders.
 *
 * Each layer's density falls off exponentially with height, so its depth
 * along a ray has a closed form: correct from a hand's breadth to the
 * horizon, and on rays into the sky, whose depth the falling density keeps
 * finite. With the fog on, the plain haze every material ends in steps
 * aside (see `atmosphere.ts`) and this takes its place, after the grade.
 */

/** How far a ray into the sky is taken through the air, in metres. */
export const SKY_DISTANCE = 100_000;

/** The clear air's density at the valley floor on a crisp day (per metre), and how it thins with height (its scale height, in metres). */
export const AIR = { density: 1.4e-5, height: 2000 } as const;
/** The thickest valley mist (per metre: a hundred metres or so of sight) and the depth of its layer. */
export const MIST = { density: 0.03, height: 45 } as const;
/** The veil of rain or snow at its heaviest, and the depth of its layer. */
const VEIL = { density: 1.2e-3, height: 1000 } as const;

/** The depth of a layer whose density falls off exponentially above its floor, along a ray: `hwFogLayer` in the GLSL above, the same function. */
export function fogLayerDepth(density: number, floorY: number, height: number, eyeY: number, pointY: number, dist: number): number {
  const h0 = Math.max(eyeY - floorY, -height) / height;
  const h1 = Math.max(pointY - floorY, -height) / height;
  const dh = h1 - h0;
  const e0 = Math.exp(-h0);
  const mean = Math.abs(dh) > 1e-4 ? (e0 - Math.exp(-h1)) / dh : e0;
  return density * dist * mean;
}

/**
 * The fog's layers now, from the weather: the clear air's, the mist's and the veil's densities at their floors (per
 * metre), and the air's scale height, the mist's floor and the mist's and the veil's scale heights (metres). Read by
 * anything that marches through the same air (the god rays).
 */
export function fogLayers(day: DayState, weather: WeatherNow, density: Vector3, layers: Vector4): void {
  const w = weather.weather;
  const regionAir = REGIONS.reduce((sum, region, i) => sum + weather.regions[i] * REGION_AIR[region], 0);
  // The moments' own haze (thicker at dawn, thinner at noon) moves it half as much as it moves the plain haze.
  const hour = 0.5 + 0.5 * day.light.haze;
  density.set(AIR.density * Math.pow(w.haze / 0.3, 1.2) * regionAir * hour, MIST.density * Math.pow(w.mist, 1.5) * (0.6 + 0.4 * regionAir), VEIL.density * w.precipitation * (1 + w.snow));
  layers.set(AIR.height, weather.floor, MIST.height * (1 + w.precipitation), VEIL.height);
}

export const FOG_ART: FeatureArt = {
  feature: "fog",
  replacesAir: true,
  stages: [{ kinds: ["land", "ground", "foliage", "solid"], colour: (colour, { air }) => throughAir(air, colour, positionWorld) }],
};
