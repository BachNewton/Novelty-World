/*
 * The day's turn: where the sun and moon are at each hour, and how the light
 * blends between the day's moments (night, dawn, morning, noon, golden hour,
 * dusk). The colours of each moment are the drawing's; the strengths that go
 * with them are here.
 */

/** How long a whole day lasts, in real seconds. */
export const DAY_SECONDS = 12 * 60;
/** The hour a valley's first day begins at. */
export const FIRST_HOUR = 9;

export const MOMENTS = ["night", "dawn", "morning", "noon", "golden", "dusk"] as const;
export type Moment = (typeof MOMENTS)[number];

/** The hour each moment is at its fullest; the light blends between neighbours. */
const MOMENT_HOURS: readonly (readonly [Moment, number])[] = [
  ["night", 0],
  ["night", 4.6],
  ["dawn", 6],
  ["morning", 8.2],
  ["noon", 12.5],
  ["golden", 17.2],
  ["dusk", 18.9],
  ["night", 20.4],
  ["night", 24],
];

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

export interface Blend {
  from: Moment;
  to: Moment;
  /** How far from `from` to `to`, 0 to 1, eased. */
  t: number;
}

export function wrapHours(hours: number): number {
  return ((hours % 24) + 24) % 24;
}

/** The hour of the day `seconds` into a valley's life. */
export function hourAt(seconds: number): number {
  return wrapHours(FIRST_HOUR + (seconds / DAY_SECONDS) * 24);
}

export function blendAt(hours: number): Blend {
  const h = wrapHours(hours);
  for (let k = 1; k < MOMENT_HOURS.length; k++) {
    const [to, end] = MOMENT_HOURS[k];
    if (h <= end) {
      const [from, start] = MOMENT_HOURS[k - 1];
      const u = (h - start) / (end - start);
      return { from, to, t: u * u * (3 - 2 * u) };
    }
  }
  return { from: "night", to: "night", t: 0 };
}

export function lightAt(hours: number): MomentLight {
  const { from, to, t } = blendAt(hours);
  const a = MOMENT_LIGHT[from];
  const b = MOMENT_LIGHT[to];
  const mix = (key: keyof MomentLight) => a[key] + (b[key] - a[key]) * t;
  return { sun: mix("sun"), ambient: mix("ambient"), haze: mix("haze"), fire: mix("fire"), night: mix("night"), exposure: mix("exposure") };
}

export interface Direction {
  x: number;
  y: number;
  z: number;
}

const SUNRISE = 6;
const SUNSET = 18.6;
/** The sun's highest, in radians above the horizon. */
const SUN_HIGHEST = (52 * Math.PI) / 180;

function unit(x: number, y: number, z: number): Direction {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

/** A body's direction across the sky: rising in the east (+x), leaning south (+z), setting in the west. */
function arcDirection(hours: number, highest: number, south: number): Direction {
  const day = (wrapHours(hours) - SUNRISE) / (SUNSET - SUNRISE);
  const arc = day * Math.PI;
  const elevation = Math.sin(arc) * highest;
  const flat = Math.cos(elevation);
  return unit(Math.cos(arc) * flat, Math.sin(elevation), Math.sin(arc) * flat * 0.6 + south);
}

/** The sun's direction from the valley, y up: below the horizon at night. */
export function sunDirection(hours: number): Direction {
  return arcDirection(hours, SUN_HIGHEST, 0.25);
}

/** The moon's: it crosses the sky through the night, higher than the sun does. */
export function moonDirection(hours: number): Direction {
  return arcDirection(hours + 12, (62 * Math.PI) / 180, 0.2);
}

function ease(edge: number, x: number): number {
  const t = Math.min(1, Math.max(0, x / edge));
  return t * t * (3 - 2 * t);
}

export interface KeyLight {
  direction: Direction;
  /** How much of its moment's strength the light has, fading out as it nears the horizon. */
  strength: number;
}

/** The light the valley is lit by: the sun by day and the moon by night, each fading near the horizon, so the handover between them is in the dark. */
export function keyLight(hours: number): KeyLight {
  const sun = sunDirection(hours);
  if (sun.y > 0) return { direction: sun, strength: ease(0.12, sun.y) };
  const moon = moonDirection(hours);
  return { direction: moon, strength: ease(0.1, -sun.y) * ease(0.12, moon.y) };
}
