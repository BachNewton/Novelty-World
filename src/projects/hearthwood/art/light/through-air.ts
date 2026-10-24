/*
 * How much of a body's light crosses the air to the ground, by colour, from
 * its height in the sky: white overhead, reddening as it sinks and its light
 * crosses more air, none once it has set. The air is the earth's (molecules,
 * which scatter blue most; a thin haze of aerosols, the clear northern air;
 * and the ozone, which takes a little orange), each as its column overhead,
 * times how much more air a slanted ray crosses (Kasten and Young's air
 * mass, which holds to the horizon). The light reads it for the sun's and
 * the moon's colour; nothing draws it per pixel.
 */

export type Rgb = [number, number, number];

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** The air's optical depth straight up, by colour: Rayleigh scattering, half the usual aerosols, and ozone. */
const COLUMN: Rgb = [0.0464 + 0.0027 + 0.0098, 0.1085 + 0.0027 + 0.0282, 0.2648 + 0.0027 + 0.0013];

/** The sun's angular radius in degrees: its light fades out over its own disc as it sets. */
const DISC = 0.27;

/** How many times the air overhead a ray from an elevation (degrees) crosses. */
export function airMass(elevation: number): number {
  const h = Math.max(elevation, -0.5);
  return 1 / (Math.sin((h * Math.PI) / 180) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The share of each colour of a body's light that reaches the ground from an elevation in degrees. */
export function lightThroughAir(elevation: number): Rgb {
  const visible = smoothstep(-DISC, DISC, elevation);
  if (visible === 0) return [0, 0, 0];
  const m = airMass(elevation);
  return [Math.exp(-COLUMN[0] * m) * visible, Math.exp(-COLUMN[1] * m) * visible, Math.exp(-COLUMN[2] * m) * visible];
}

/** The elevation in degrees of a unit direction. */
export function elevationOf(direction: { y: number }): number {
  return (Math.asin(Math.min(1, Math.max(-1, direction.y))) * 180) / Math.PI;
}

/** The light at the top of the air that reaches the ground white from overhead: the eye's own white balance in daylight. */
export function daylightWhite(): Rgb {
  const overhead = lightThroughAir(90);
  const luma = 0.2126 / overhead[0] + 0.7152 / overhead[1] + 0.0722 / overhead[2];
  return [1 / overhead[0] / luma, 1 / overhead[1] / luma, 1 / overhead[2] / luma];
}

/** A colour as plain numbers, from anything with `r`, `g` and `b`. */
export function rgb(colour: { r: number; g: number; b: number }, scale = 1): Rgb {
  return [colour.r * scale, colour.g * scale, colour.b * scale];
}
