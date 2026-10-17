/*
 * Where the sun and moon are, at a latitude, on a real day of the year and
 * an hour, by simplified real formulas: the sun on its slightly eccentric
 * orbit along the ecliptic, the moon offset from the sun along it by its
 * phase with a modest inclination. The hour is local solar time, so the sun
 * is highest at noon.
 *
 * The world's axes: east is +x, up is +y and north is -z (south is +z).
 */

const DEG = Math.PI / 180;
const OBLIQUITY = 23.44 * DEG;
const YEAR = 365.2422;
/** The day of the year the earth is nearest the sun, about 3 January (set so the equinoxes and solstices land on their real dates). */
const PERIHELION = 1.5;
const PERIHELION_LONGITUDE = 282.94 * DEG;
const MOON_INCLINATION = 5.14 * DEG;
/** Where the moon's orbit crosses the ecliptic going north; at 180° the full moons of summer ride highest. */
const MOON_NODE = 180 * DEG;

/** The sun's elevation, in degrees, at each twilight's edge: its upper limb on the horizon, refraction counted, then civil, nautical and astronomical. */
export const TWILIGHT_EDGES = { day: -0.833, civil: -6, nautical: -12, astronomical: -18 } as const;
export type Twilight = keyof typeof TWILIGHT_EDGES | "night";

export interface Direction {
  x: number;
  y: number;
  z: number;
}

export interface SkyBody {
  /** A unit vector towards it, in the world's axes. */
  direction: Direction;
  /** Degrees above the horizon, below it when negative. */
  elevation: number;
  /** Degrees round from north through east: 90 east, 180 south, 270 west. */
  azimuth: number;
}

export interface Sun extends SkyBody {
  twilight: Twilight;
}

export const MOON_PHASES = ["new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "last quarter", "waning crescent"] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

export interface Moon extends SkyBody {
  /** How far through its cycle: 0 new, 0.5 full. */
  age: number;
  /** The angle between it and the sun as seen from the world, in radians: 0 new, π full. */
  elongation: number;
  /** The angle between the sun and the world as seen from the moon, in radians: π new, 0 full. */
  phaseAngle: number;
  /** How much of the face towards the world is lit, 0 to 1. */
  illuminated: number;
  waxing: boolean;
  phase: MoonPhase;
}

/** How deep the sky's twilight is with the sun at an elevation, in degrees. */
export function twilightAt(elevation: number): Twilight {
  if (elevation >= TWILIGHT_EDGES.day) return "day";
  if (elevation >= TWILIGHT_EDGES.civil) return "civil";
  if (elevation >= TWILIGHT_EDGES.nautical) return "nautical";
  if (elevation >= TWILIGHT_EDGES.astronomical) return "astronomical";
  return "night";
}

/** The sun's longitude along the ecliptic, in radians, on a real day of the year (0 at the March equinox). */
export function sunLongitude(dayOfYear: number): number {
  const mean = (2 * Math.PI * (dayOfYear - PERIHELION)) / YEAR;
  const centre = (1.915 * Math.sin(mean) + 0.02 * Math.sin(2 * mean)) * DEG;
  return mean + centre + PERIHELION_LONGITUDE;
}

interface Equatorial {
  rightAscension: number;
  declination: number;
}

function equatorial(longitude: number, latitude: number): Equatorial {
  const declination = Math.asin(Math.sin(latitude) * Math.cos(OBLIQUITY) + Math.cos(latitude) * Math.sin(OBLIQUITY) * Math.sin(longitude));
  const rightAscension = Math.atan2(Math.sin(longitude) * Math.cos(OBLIQUITY) - Math.tan(latitude) * Math.sin(OBLIQUITY), Math.cos(longitude));
  return { rightAscension, declination };
}

/** The sun's declination, in radians, on a real day of the year. */
export function sunDeclination(dayOfYear: number): number {
  return equatorial(sunLongitude(dayOfYear), 0).declination;
}

/** A body at an hour angle and declination (radians) seen from a latitude (degrees). */
function seen(hourAngle: number, declination: number, latitude: number): SkyBody {
  const phi = latitude * DEG;
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.sin(declination) * Math.cos(phi) - Math.cos(declination) * Math.cos(hourAngle) * Math.sin(phi);
  const up = Math.sin(declination) * Math.sin(phi) + Math.cos(declination) * Math.cos(hourAngle) * Math.cos(phi);
  const length = Math.hypot(east, north, up);
  const azimuth = Math.atan2(east, north) / DEG;
  return {
    direction: { x: east / length, y: up / length, z: -north / length },
    elevation: Math.asin(Math.max(-1, Math.min(1, up / length))) / DEG,
    azimuth: (azimuth + 360) % 360,
  };
}

function sunHourAngle(hour: number): number {
  return (hour - 12) * 15 * DEG;
}

export function sunAt(dayOfYear: number, hour: number, latitude: number): Sun {
  const body = seen(sunHourAngle(hour), sunDeclination(dayOfYear), latitude);
  return { ...body, twilight: twilightAt(body.elevation) };
}

function phaseOf(age: number): MoonPhase {
  return MOON_PHASES[Math.floor((age * 8 + 0.5) % 8)];
}

/** The moon `age` through its cycle (0 new, 0.5 full) on a real day of the year and an hour. */
export function moonAt(dayOfYear: number, hour: number, age: number, latitude: number): Moon {
  const sunLong = sunLongitude(dayOfYear);
  const ahead = 2 * Math.PI * age;
  const longitude = sunLong + ahead;
  const eclipticLatitude = MOON_INCLINATION * Math.sin(longitude - MOON_NODE);
  const moon = equatorial(longitude, eclipticLatitude);
  const sun = equatorial(sunLong, 0);
  const body = seen(sunHourAngle(hour) - (moon.rightAscension - sun.rightAscension), moon.declination, latitude);
  const elongation = Math.acos(Math.cos(eclipticLatitude) * Math.cos(ahead));
  return {
    ...body,
    age,
    elongation,
    phaseAngle: Math.PI - elongation,
    illuminated: (1 - Math.cos(elongation)) / 2,
    waxing: age < 0.5,
    phase: phaseOf(age),
  };
}

/** The sphere of the stars at a moment, as two directions in the world's axes: anything fixed among the stars is turned with it. */
export interface CelestialFrame {
  /** The celestial pole the sky turns round: due north, as high as the latitude. */
  pole: Direction;
  /** The March equinox's point on the celestial equator, where right ascension is 0. */
  equinox: Direction;
}

/** Where the stars stand on a real day of the year at an hour: the sky turns once a sidereal day, a little faster than the sun, so the same stars rise about four minutes earlier each night. */
export function celestialFrame(dayOfYear: number, hour: number, latitude: number): CelestialFrame {
  const sun = equatorial(sunLongitude(dayOfYear), 0);
  const sidereal = sunHourAngle(hour) + sun.rightAscension;
  return { pole: seen(0, Math.PI / 2, latitude).direction, equinox: seen(sidereal, 0, latitude).direction };
}

/** When the sun rises past an elevation and sets below it again, in hours; or that it stays above or below it all day. */
export type Crossing = { rises: number; sets: number } | "always-above" | "always-below";

export interface SunDay {
  /** Its highest and lowest, in degrees, at noon and midnight. */
  highest: number;
  lowest: number;
  /** Sunrise and sunset: its upper limb on the horizon. */
  sun: Crossing;
  /** Dawn and dusk of each twilight: when the sun passes that twilight's lower edge. */
  civil: Crossing;
  nautical: Crossing;
  astronomical: Crossing;
  /** Hours from sunrise to sunset. */
  dayLength: number;
  /** The deepest the night gets: midsummer far north stays in twilight. */
  darkest: Twilight;
}

function crossing(declination: number, latitude: number, elevation: number): Crossing {
  const phi = latitude * DEG;
  const cosine = (Math.sin(elevation * DEG) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination));
  if (cosine <= -1) return "always-above";
  if (cosine >= 1) return "always-below";
  const half = Math.acos(cosine) / DEG / 15;
  return { rises: 12 - half, sets: 12 + half };
}

function hoursAbove(c: Crossing): number {
  if (c === "always-above") return 24;
  if (c === "always-below") return 0;
  return c.sets - c.rises;
}

/** The sun's day on a real day of the year at a latitude: its height, sunrise and sunset, and the twilights. */
export function sunDay(dayOfYear: number, latitude: number): SunDay {
  const declination = sunDeclination(dayOfYear);
  const phi = latitude * DEG;
  const highest = Math.asin(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination)) / DEG;
  const lowest = Math.asin(Math.sin(phi) * Math.sin(declination) - Math.cos(phi) * Math.cos(declination)) / DEG;
  const sun = crossing(declination, latitude, TWILIGHT_EDGES.day);
  return {
    highest,
    lowest,
    sun,
    civil: crossing(declination, latitude, TWILIGHT_EDGES.civil),
    nautical: crossing(declination, latitude, TWILIGHT_EDGES.nautical),
    astronomical: crossing(declination, latitude, TWILIGHT_EDGES.astronomical),
    dayLength: hoursAbove(sun),
    darkest: twilightAt(lowest),
  };
}
