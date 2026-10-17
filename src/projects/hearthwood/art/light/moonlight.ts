import type { Moon } from "../../engine/astronomy";
import { lightThroughAir, skyTables, type Rgb, type SkyTables } from "../sky/scattering";
import { moonPhaseLight } from "../sky/sky-light";
import { lightColourThroughAir, smooth, unitLuminance, type BodyLight } from "./sun";

/*
 * The moon's light: a cool silver of its own, warmed like the sun's as it
 * sinks through the air, and as bright as its phase and its height allow,
 * so a full moon high in a winter sky lights the whole valley and a new
 * moon leaves it dark.
 */

/** A full moon's light high in the sky, against the sun's at noon (by hand: far brighter than a real moon's, as the eye adapts to the night). */
export const FULL_MOON = 0.6;

/** How much of its light the air lets through from the moon's height: dimmer and warmer as it sinks, none once it has set. */
function throughAir(moon: Moon, tables: SkyTables): number {
  const through = lightThroughAir(0, Math.max(moon.direction.y, 0.012), tables);
  const overhead = lightThroughAir(0, 1, tables);
  const kept = (0.2126 * through[0] + 0.7152 * through[1] + 0.0722 * through[2]) / (0.2126 * overhead[0] + 0.7152 * overhead[1] + 0.0722 * overhead[2]);
  return Math.sqrt(kept) * smooth(-0.5, 6, moon.elevation);
}

/** The moon's light at a moment, `tint` its own colour at luminance 1. */
export function moonlight(moon: Moon, tint: Rgb, tables: SkyTables = skyTables()): BodyLight {
  const air = lightColourThroughAir(moon.direction, tables);
  return {
    colour: unitLuminance([tint[0] * air[0], tint[1] * air[1], tint[2] * air[2]]),
    intensity: FULL_MOON * moonPhaseLight(moon) * throughAir(moon, tables),
  };
}
