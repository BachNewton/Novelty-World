import type { Moon, Sun } from "../../engine/astronomy";
import { smooth } from "./sun";

/*
 * The sun handing the world over to the moon: the sun's light fades to
 * nothing over the few degrees it takes to cross the horizon, then, once
 * the twilight has deepened, the moon's fades in. Which body is the key
 * light, and from where, stays the engine's (the shadows follow it too):
 * the sun's light is gone by the time the engine hands over to the moon, and
 * the moon's comes in only well after, so the change of direction never
 * shows. The sky's own light lifts a little in early night, so dusk deepens
 * rather than goes flat.
 */

export interface Handover {
  /** How much of its light the sun gives, 0 to 1. */
  sun: number;
  /** How much of its light the moon gives, 0 to 1, by the twilight and its own height (its phase is the moonlight's). */
  moon: number;
  /** The sky's light, against its usual: a little more in early night. */
  skyLift: number;
}

export function handoverAt(sun: Sun, moon: Moon): Handover {
  const sunFade = smooth(0, 3.5, sun.elevation);
  const moonFade = (1 - smooth(-7, -1.5, sun.elevation)) * smooth(-0.5, 8, moon.elevation);
  const earlyNight = smooth(-1, -5, sun.elevation) * (1 - smooth(-10, -16, sun.elevation));
  return { sun: sunFade, moon: moonFade, skyLift: 1 + 0.35 * earlyNight };
}
