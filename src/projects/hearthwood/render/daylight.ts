import { Color } from "three/webgpu";
import { celestialFrame } from "../engine/astronomy";
import { auroraAt } from "../engine/aurora";
import { CALENDAR } from "../engine/calendar";
import { MOMENTS } from "../engine/day";
import type { Clock } from "./clock";
import { air } from "./air";
import type { MomentPart, Palette } from "./palette";
import { skyState } from "./sky";

/*
 * The day's light from the clock: each moment's colours (night, dawn,
 * morning, noon, golden hour, dusk) blended by how much of each the sun's
 * real height makes the hour, with the engine's strengths, set into the
 * shared air and sky once a frame.
 */

/** How thick the haze is on a usual day: about a third of the light gets through 50 km of air at the ground. */
const HAZE = 0.000022;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface Daylight {
  /** Sets the light and the sky for the clock's moment; returns the exposure the frame is drawn at. */
  update: (clock: Clock) => number;
}

export function makeDaylight(palette: Palette, auroraHeld: () => number | null): Daylight {
  const blended = (part: MomentPart, mix: Record<string, number>, out: Color) => {
    out.setRGB(0, 0, 0);
    for (const moment of MOMENTS) {
      const weight = mix[moment];
      if (weight > 0) out.add(palette.moments[moment][part].clone().multiplyScalar(weight));
    }
    return out;
  };
  const scratch = new Color();
  return {
    update(clock) {
      const { sky, date } = clock;
      const { key, light, mix, sun, moon } = sky;
      air.keyDirection.value.set(key.direction.x, key.direction.y, key.direction.z);
      blended("sun", mix, air.keyColour.value).multiplyScalar(light.sun * key.strength);
      blended("sky-light", mix, air.skyLight.value).multiplyScalar(light.ambient);
      blended("ground-light", mix, air.groundLight.value).multiplyScalar(light.ambient);
      blended("sky", mix, air.zenith.value);
      blended("haze", mix, air.horizon.value);
      air.sunDirection.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
      const sunUp = smooth(-4, 2, sun.elevation);
      air.sunGlow.value.copy(blended("sun", mix, scratch)).multiplyScalar(sunUp);
      air.haze.value = HAZE * light.haze;

      skyState.night.value = light.night;
      skyState.sunShows.value = smooth(-0.8, 0.4, sun.elevation);
      skyState.moonDirection.value.set(moon.direction.x, moon.direction.y, moon.direction.z);
      skyState.moonShows.value = smooth(-2, 1, moon.elevation);
      const frame = celestialFrame(date.realDayOfYear, date.hour, CALENDAR.latitude);
      skyState.pole.value.set(frame.pole.x, frame.pole.y, frame.pole.z);
      skyState.equinox.value.set(frame.equinox.x, frame.equinox.y, frame.equinox.z);
      skyState.aurora.value = auroraAt(date, sun, auroraHeld());
      return light.exposure;
    },
  };
}
