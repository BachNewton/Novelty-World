import type { Direction, Moon, Sun } from "../../engine/astronomy";
import { smooth } from "./sun";

/*
 * The sun handing the world over to the moon: the sun's light fades to
 * nothing over the few degrees it takes to cross the horizon, then, once
 * the twilight has deepened, the moon's fades in. Between the two nothing
 * lights the world directly, so the light's change of direction never
 * shows. A light low on the horizon would stretch every shadow across the
 * land, so the light comes from no lower than a little above it, and the
 * sky's own light lifts a little in early night, so dusk deepens rather
 * than goes flat.
 */

/** The lowest the key light shines from, in degrees, whatever the body's own height: a shadow is at most about six times as long as its thing is tall. */
export const LOWEST_LIGHT = 10;

export interface Handover {
  /** How much of its light the sun gives, 0 to 1. */
  sun: number;
  /** How much of its light the moon gives, 0 to 1, by the twilight and its own height (its phase is the moonlight's). */
  moon: number;
  /** The sky's light, against its usual: a little more in early night. */
  skyLift: number;
}

export function handoverAt(sun: Sun, moon: Moon): Handover {
  const sunFade = smooth(-0.8, 3, sun.elevation);
  const moonFade = (1 - smooth(-7, -1.5, sun.elevation)) * smooth(-0.5, 8, moon.elevation);
  const earlyNight = smooth(-1, -5, sun.elevation) * (1 - smooth(-10, -16, sun.elevation));
  return { sun: sunFade, moon: moonFade, skyLift: 1 + 0.35 * earlyNight };
}

/** Which body lights the world now: the sun until it is below the horizon, then the moon. */
export function keyBody(sun: Sun): "sun" | "moon" {
  return sun.elevation > -1.2 ? "sun" : "moon";
}

/** A direction raised to at least `lowest` degrees above the horizon, keeping its bearing. */
export function raised(direction: Direction, lowest: number = LOWEST_LIGHT): Direction {
  const floor = Math.sin((lowest * Math.PI) / 180);
  if (direction.y >= floor) return direction;
  const flat = Math.hypot(direction.x, direction.z);
  const across = Math.sqrt(1 - floor * floor);
  if (flat < 1e-9) return { x: across, y: floor, z: 0 };
  return { x: (direction.x / flat) * across, y: floor, z: (direction.z / flat) * across };
}
