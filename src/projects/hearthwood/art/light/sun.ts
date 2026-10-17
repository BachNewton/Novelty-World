import type { Sun } from "../../engine/astronomy";
import { lightThroughAir, skyTables, type Rgb, type SkyTables } from "../sky/scattering";
import { daylightWhite } from "../sky/sky-light";

/*
 * The sun's light: its colour is the physical one, the sunlight left after
 * crossing the air (white overhead, reddening as the sun sinks and its
 * light crosses more air), with the storybook's tints laid over it low in
 * the sky (rosier in the morning, golder in the evening), at a brightness
 * set by hand for each height of the sun.
 */

/** A light's colour (luminance 1) and how bright it is. */
export interface BodyLight {
  colour: Rgb;
  intensity: number;
}

/** The sun's brightness by its elevation in degrees, by hand: none once its disc has gone, then rising quickly through the first degrees. */
const SUN_STOPS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, 0.3],
  [2, 1.1],
  [5, 1.8],
  [10, 2.05],
  [20, 2.45],
  [35, 2.7],
  [90, 2.8],
];

export function sunBrightness(elevation: number): number {
  if (elevation <= SUN_STOPS[0][0]) return SUN_STOPS[0][1];
  for (let i = 1; i < SUN_STOPS.length; i++) {
    const [high, value] = SUN_STOPS[i];
    if (elevation <= high) {
      const [low, from] = SUN_STOPS[i - 1];
      const t = (elevation - low) / (high - low);
      return from + (value - from) * t * t * (3 - 2 * t);
    }
  }
  return SUN_STOPS[SUN_STOPS.length - 1][1];
}

const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** A colour scaled to a luminance of 1. */
export function unitLuminance(c: Rgb): Rgb {
  const l = Math.max(1e-6, luminance(c));
  return [c[0] / l, c[1] / l, c[2] / l];
}

/** How far the physical colour is kept against white: the air's red at sunset is real, but a storybook keeps it soft. */
const PHYSICAL = 0.62;

/** How strongly the tints colour the light low in the sky. */
const TINT = 0.75;

/** The colour a body's light keeps through the air from its elevation, balanced to daylight, at luminance 1, and softened. */
export function lightColourThroughAir(direction: { y: number }, tables: SkyTables = skyTables()): Rgb {
  const white = daylightWhite(tables);
  const through = lightThroughAir(0, Math.max(direction.y, 0.012), tables);
  const physical = unitLuminance([through[0] * white[0], through[1] * white[1], through[2] * white[2]]);
  return physical.map((c) => 1 + (c - 1) * PHYSICAL) as Rgb;
}

/** The storybook's tint over the sun's light at its height, as a multiplier: none high in the sky, rose-gold low (rosier rising, golder setting); `morning` and `evening` are colours of luminance 1. */
export function sunTint(sun: Sun, morning: Rgb, evening: Rgb): Rgb {
  const weight = (1 - smooth(2, 20, sun.elevation)) * TINT;
  const tint = sun.azimuth < 180 ? morning : evening;
  return [1 + (tint[0] - 1) * weight, 1 + (tint[1] - 1) * weight, 1 + (tint[2] - 1) * weight];
}

/** The sun's light at a moment: the physical colour through the air, with the storybook's tint over it. */
export function sunlight(sun: Sun, morning: Rgb, evening: Rgb, tables: SkyTables = skyTables()): BodyLight {
  const colour = lightColourThroughAir(sun.direction, tables);
  const tint = sunTint(sun, morning, evening);
  return { colour: unitLuminance([colour[0] * tint[0], colour[1] * tint[1], colour[2] * tint[2]]), intensity: sunBrightness(sun.elevation) };
}

export function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
