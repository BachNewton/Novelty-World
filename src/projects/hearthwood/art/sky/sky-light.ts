import type { Moon, Sun } from "../../engine/astronomy";
import { sunTint, unitLuminance } from "../light/sun";
import { lightThroughAir, skyRadiance, skyTables, type Rgb, type SkyLight, type SkyTables, type Vec } from "./scattering";
import type { SkyColours } from "./tokens";

/*
 * How bright the physical sky is drawn, set by hand for each height of the
 * sun rather than by an automatic exposure: a clear noon, a sunset glowing
 * round the horizon, a blue hour that lifts rather than goes flat, and a
 * night lit by the moon, or by the faint glow of the air itself when there
 * is none. The sky's shader and the light both read these, so the land is
 * lit by the very sky it stands under.
 */

/** The sky's brightness against the physical model's, by the sun's elevation in degrees: steps a factor at a time, between which it eases by its logarithm. */
const SKY_STOPS: readonly (readonly [number, number])[] = [
  [-18, 8.0e4],
  [-12, 4.0e4],
  [-9, 2.0e4],
  [-6, 1.1e4],
  [-3, 900],
  [0, 150],
  [4, 105],
  [10, 72],
  [25, 57],
  [90, 51],
];

export function skyScale(sunElevation: number): number {
  const stops = SKY_STOPS;
  if (sunElevation <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [high, value] = stops[i];
    if (sunElevation <= high) {
      const [low, from] = stops[i - 1];
      const t = (sunElevation - low) / (high - low);
      return Math.exp(Math.log(from) + (Math.log(value) - Math.log(from)) * t);
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * The sun's light at the top of the air, balanced so that a sun overhead
 * reaches the ground white: the eye's own white balance in daylight, so the
 * air's colour shows only as the sun sinks.
 */
export function daylightWhite(tables: SkyTables = skyTables()): Rgb {
  const overhead = lightThroughAir(0, 1, tables);
  const luma = 0.2126 / overhead[0] + 0.7152 / overhead[1] + 0.0722 / overhead[2];
  return [1 / overhead[0] / luma, 1 / overhead[1] / luma, 1 / overhead[2] / luma];
}

/** How bright the moon lights the sky against the sun's light, full and high: enough for a deep moonlit blue. */
const MOON_SKY = 2.5;

/** How much of a full moon's light the moon gives at a phase: a new moon none, a half moon a quarter, as the lit part grows and faces us more squarely. */
export function moonPhaseLight(moon: Moon): number {
  return moon.illuminated * moon.illuminated;
}

/** How bright the air's own glow is, by the sun's elevation: only once the twilight has gone. */
export function airglowAmount(sunElevation: number): number {
  const t = Math.min(1, Math.max(0, (-4 - sunElevation) / 8));
  return t * t * (3 - 2 * t);
}

/** The lights the sky is drawn with at a moment, each already at the brightness the sky is drawn at. */
export interface SkyLighting {
  sun: SkyLight;
  moon: SkyLight;
  /** The air's own glow, the night sky's floor. */
  airglow: Rgb;
  /** The sky's brightness against the model's, for anything drawn in it at the same scale (the sun's disc). */
  scale: number;
  saturation: number;
}

/** A colour as plain numbers, from anything with `r`, `g` and `b`. */
export function rgb(colour: { r: number; g: number; b: number }, scale = 1): Rgb {
  return [colour.r * scale, colour.g * scale, colour.b * scale];
}

/** The lights the sky is drawn with: `moonTint` the moon's light, `airglow` the air's own glow, and `glow` the tint over the glow round a low sun (the sunlight's own, see `light/sun.ts`). */
export function skyLighting(sun: Sun, moon: Moon, moonTint: Rgb, airglow: Rgb, glow: Rgb = [1, 1, 1], tables: SkyTables = skyTables()): SkyLighting {
  const scale = skyScale(sun.elevation);
  const white = daylightWhite(tables);
  const moonLevel = MOON_SKY * moonPhaseLight(moon);
  const night = airglowAmount(sun.elevation);
  return {
    sun: { direction: sun.direction, light: [white[0] * scale, white[1] * scale, white[2] * scale], glow },
    moon: { direction: moon.direction, light: [moonTint[0] * moonLevel, moonTint[1] * moonLevel, moonTint[2] * moonLevel] },
    airglow: [airglow[0] * night, airglow[1] * night, airglow[2] * night],
    scale,
    saturation: skySaturation(sun.elevation),
  };
}

/** How much more colourful than the physical model the sky is drawn, for the storybook: a fuller blue by day, while the twilight's own violet is left as it is. */
export function skySaturation(sunElevation: number): number {
  const t = Math.min(1, Math.max(0, (sunElevation + 3) / 9));
  return 1.02 + 0.23 * t * t * (3 - 2 * t);
}

/**
 * The brightness the sky's own range rolls off towards: the real horizon is
 * many times brighter than the zenith, and the glow round a low sun brighter
 * still, which would leave a storybook's sky white below its deep blue top.
 * Each colour keeps its hue as its brightness is rolled off.
 */
export const SKY_RANGE = 1.3;

export function rollOff(colour: Rgb): Rgb {
  const luma = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
  const k = 1 / (1 + luma / SKY_RANGE);
  return [colour[0] * k, colour[1] * k, colour[2] * k];
}

/** The air glows brighter towards the horizon, where the eye looks through more of it. */
export function airglowAt(view: Vec, airglow: Rgb): Rgb {
  const low = 1 + 1.6 * Math.pow(1 - Math.max(0, view.y), 3);
  return [airglow[0] * low, airglow[1] * low, airglow[2] * low];
}

export function saturate(colour: Rgb, amount: number): Rgb {
  const luma = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
  return [Math.max(0, luma + (colour[0] - luma) * amount), Math.max(0, luma + (colour[1] - luma) * amount), Math.max(0, luma + (colour[2] - luma) * amount)];
}

/** The sky's colour in a direction as it is drawn (the sun's disc aside): the air lit by the sun and the moon, its own glow, made a little more colourful. Below the horizon, the horizon's. */
export function skyColour(view: Vec, altitude: number, lighting: SkyLighting, steps = 12, tables: SkyTables = skyTables()): Rgb {
  const up = Math.max(view.y, 0);
  const flat = Math.hypot(view.x, view.z);
  const level = flat > 0 ? { x: (view.x / flat) * Math.sqrt(1 - up * up), y: up, z: (view.z / flat) * Math.sqrt(1 - up * up) } : { x: 0, y: 1, z: 0 };
  const scattered = skyRadiance(level, altitude, [lighting.sun, lighting.moon], steps, tables);
  const glow = airglowAt(level, lighting.airglow);
  return saturate(rollOff([scattered[0] + glow[0], scattered[1] + glow[1], scattered[2] + glow[2]]), lighting.saturation);
}

/** The tint over the glow round a low sun: the sunlight's own rose-gold (`light/sun.ts`), from the tokens. */
export function sunGlow(sun: Sun, colours: SkyColours): Rgb {
  return sunTint(sun, unitLuminance(rgb(colours["sun-morning"])), unitLuminance(rgb(colours["sun-evening"])));
}
