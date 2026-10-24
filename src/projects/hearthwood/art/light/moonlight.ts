import type { Moon } from "../../engine/astronomy";
import { lightColourThroughAir, luminance, smooth, unitLuminance, type BodyLight } from "./sun";
import { elevationOf, lightThroughAir, type Rgb } from "./through-air";

/*
 * The moon's light: a cool silver of its own, warmed like the sun's as it
 * sinks through the air, and as bright as its phase and its height allow,
 * so a full moon high in a winter sky lights the whole valley and a new
 * moon leaves it dark.
 */

/** A full moon's light high in the sky, against the sun's at noon (by hand: far brighter than a real moon's, as the eye adapts to the night). */
export const FULL_MOON = 0.6;

/** How much of a full moon's light the moon gives at a phase: a new moon none, a half moon a quarter, as the lit part grows and faces us more squarely. */
export function moonPhaseLight(moon: Moon): number {
  return moon.illuminated * moon.illuminated;
}

/** How much of its light the air lets through from the moon's height: dimmer as it sinks, none once it has set. */
function throughAir(moon: Moon): number {
  const kept = luminance(lightThroughAir(Math.max(elevationOf(moon.direction), 0.7))) / luminance(lightThroughAir(90));
  return Math.sqrt(kept) * smooth(-0.5, 6, moon.elevation);
}

/** The moon's light at a moment, `tint` its own colour at luminance 1. */
export function moonlight(moon: Moon, tint: Rgb): BodyLight {
  const air = lightColourThroughAir(moon.direction);
  return {
    colour: unitLuminance([tint[0] * air[0], tint[1] * air[1], tint[2] * air[2]]),
    intensity: FULL_MOON * moonPhaseLight(moon) * throughAir(moon),
  };
}
