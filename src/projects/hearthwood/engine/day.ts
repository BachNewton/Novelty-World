import { moonAt, sunAt, type Direction, type Moon, type Sun } from "./astronomy";
import { CALENDAR, type CalendarDate } from "./calendar";

/*
 * The day's light, from where the sun really is: the moments of the day
 * (night, dawn, morning, noon, golden hour, dusk) are stops along the sun's
 * elevation, dawn and morning while it climbs and golden hour and dusk while
 * it sinks, so a long midsummer evening lingers in golden light and twilight
 * and a short midwinter day stays low and warm. The colours of each moment
 * are the drawing's; the strengths that go with them are here.
 */

export const MOMENTS = ["night", "dawn", "morning", "noon", "golden", "dusk"] as const;
export type Moment = (typeof MOMENTS)[number];

/** The strengths that go with each moment's colours. */
export interface MomentLight {
  /** The sun's (or at night the moon's) light. */
  sun: number;
  /** The light from the sky and the ground all round. */
  ambient: number;
  /** How thick the valley's haze is. */
  haze: number;
  /** How strongly the campfire lights its surroundings. */
  fire: number;
  /** How much of the night sky shows: stars, and fireflies over the meadow. */
  night: number;
  /** The camera's exposure. */
  exposure: number;
}

export const MOMENT_LIGHT: Record<Moment, MomentLight> = {
  night: { sun: 0.35, ambient: 0.32, haze: 0.8, fire: 1, night: 1, exposure: 1.15 },
  dawn: { sun: 1.1, ambient: 0.65, haze: 1.5, fire: 0.6, night: 0.25, exposure: 1 },
  morning: { sun: 2.3, ambient: 0.95, haze: 1.1, fire: 0.25, night: 0, exposure: 1 },
  noon: { sun: 2.7, ambient: 1, haze: 0.8, fire: 0.2, night: 0, exposure: 0.95 },
  golden: { sun: 2.4, ambient: 0.8, haze: 1.1, fire: 0.35, night: 0, exposure: 1 },
  dusk: { sun: 0.9, ambient: 0.75, haze: 1.0, fire: 0.8, night: 0.4, exposure: 1.1 },
};

/** How much of each moment the light is now, summing to 1. */
export type MomentMix = Record<Moment, number>;

type Stops = readonly (readonly [Moment, number])[];
/** The sun's elevation, in degrees, at which each moment is at its fullest while it climbs, and while it sinks. */
const RISING: Stops = [
  ["night", -14],
  ["dawn", -1],
  ["morning", 12],
  ["noon", 32],
];
const SETTING: Stops = [
  ["night", -14],
  ["dusk", -3],
  ["golden", 10],
  ["noon", 32],
];
/** Hours either side of noon and midnight over which the light turns from the climbing sun's moments to the sinking sun's. */
const TURNING = 2;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function addAlong(stops: Stops, elevation: number, weight: number, mix: MomentMix): void {
  const last = stops.length - 1;
  if (elevation <= stops[0][1]) mix[stops[0][0]] += weight;
  else if (elevation >= stops[last][1]) mix[stops[last][0]] += weight;
  else {
    let k = 1;
    while (elevation > stops[k][1]) k++;
    const [from, low] = stops[k - 1];
    const [to, high] = stops[k];
    const t = smooth(low, high, elevation);
    mix[from] += weight * (1 - t);
    mix[to] += weight * t;
  }
}

/** How far the sun is into its sinking half of the day, 0 to 1: a half at noon and at midnight, turning smoothly over a few hours. */
function sinking(hour: number): number {
  const fromNoon = (((hour % 24) + 24) % 24) - 12;
  const toTurn = Math.abs(fromNoon) <= 6 ? fromNoon : Math.sign(fromNoon) * (12 - Math.abs(fromNoon));
  return smooth(-TURNING, TURNING, toTurn);
}

/** The light's mix of moments with the sun at an elevation (degrees) at an hour of solar time. */
export function mixAt(elevation: number, hour: number): MomentMix {
  const mix: MomentMix = { night: 0, dawn: 0, morning: 0, noon: 0, golden: 0, dusk: 0 };
  const setting = sinking(hour);
  addAlong(RISING, elevation, 1 - setting, mix);
  addAlong(SETTING, elevation, setting, mix);
  return mix;
}

export function lightOf(mix: MomentMix): MomentLight {
  const light: MomentLight = { sun: 0, ambient: 0, haze: 0, fire: 0, night: 0, exposure: 0 };
  for (const moment of MOMENTS) {
    const weight = mix[moment];
    const strengths = MOMENT_LIGHT[moment];
    light.sun += strengths.sun * weight;
    light.ambient += strengths.ambient * weight;
    light.haze += strengths.haze * weight;
    light.fire += strengths.fire * weight;
    light.night += strengths.night * weight;
    light.exposure += strengths.exposure * weight;
  }
  return light;
}

function ease(edge: number, x: number): number {
  return smooth(0, edge, x);
}

export interface KeyLight {
  /** Which body lights the world. */
  body: "sun" | "moon";
  direction: Direction;
  /** How much of its moment's strength the light has, fading out as it nears the horizon, and by the moon's phase. */
  strength: number;
}

/** The moon's light by its phase, against a full moon's: a thin crescent still gives a little. */
function moonlight(moon: Moon): number {
  return 0.25 + 0.75 * moon.illuminated;
}

/** The light the world is lit by: the sun by day and the moon by night, each fading near the horizon, so the handover between them is in the dark. */
export function keyLight(sun: Sun, moon: Moon): KeyLight {
  if (sun.direction.y > 0) return { body: "sun", direction: sun.direction, strength: ease(0.12, sun.direction.y) };
  return { body: "moon", direction: moon.direction, strength: ease(0.1, -sun.direction.y) * ease(0.12, moon.direction.y) * moonlight(moon) };
}

/** Everything the sky and the light are drawn from, at one moment. */
export interface DaySky {
  sun: Sun;
  moon: Moon;
  key: KeyLight;
  mix: MomentMix;
  light: MomentLight;
}

export function skyAt(date: CalendarDate, latitude: number = CALENDAR.latitude): DaySky {
  const sun = sunAt(date.realDayOfYear, date.hour, latitude);
  const moon = moonAt(date.realDayOfYear, date.hour, date.moonAge, latitude);
  const mix = mixAt(sun.elevation, date.hour);
  return { sun, moon, key: keyLight(sun, moon), mix, light: lightOf(mix) };
}
