/*
 * Where the sun and the moon stand over Åland at an instant, as the game's grid has them: an azimuth clockwise from
 * grid north and an elevation above the horizon. The sun is NOAA's solar calculator, good to a few hundredths of a
 * degree; the moon is the Astronomical Almanac's low-precision series, good to a few tenths, with its parallax, so it
 * rises where a player would see it. The grid's north is not true north: Åland lies west of the grid's central
 * meridian, where true north leans east of grid north.
 */

/** Mariehamn, where the sky is worked out for the whole island: across it the sun's place differs by under half a degree. */
export const OBSERVER = { latitudeDeg: 60.0973, longitudeDeg: 19.9348 };
/** The grid bearing of true north over Åland, clockwise from grid north. */
export const TRUE_NORTH_GRID_DEG = 6.25;
/** The sun's centre at sunrise and sunset: refraction lifts it and its upper edge shows first. */
export const SUNRISE_ELEVATION_DEG = -0.833;

export interface SkyPlace {
  /** Clockwise from grid north. */
  azimuthDeg: number;
  /** Up from the horizon; negative below it. */
  elevationDeg: number;
}

export interface MoonPlace extends SkyPlace {
  /** The share of its face lit, 0 at new moon and 1 at full. */
  lit: number;
  waxing: boolean;
}

const RAD = Math.PI / 180;
const sinD = (deg: number) => Math.sin(deg * RAD);
const cosD = (deg: number) => Math.cos(deg * RAD);
const wrap = (deg: number) => ((deg % 360) + 360) % 360;

const julianDay = (utcMs: number) => utcMs / 86_400_000 + 2_440_587.5;
const centuries = (utcMs: number) => (julianDay(utcMs) - 2_451_545) / 36_525;

function obliquityDeg(t: number) {
  const omega = 125.04 - 1934.136 * t;
  const mean = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  return mean + 0.00256 * cosD(omega);
}

function equatorial(longitudeDeg: number, latitudeDeg: number, obliquity: number) {
  const declination = Math.asin(sinD(latitudeDeg) * cosD(obliquity) + cosD(latitudeDeg) * sinD(obliquity) * sinD(longitudeDeg)) / RAD;
  const rightAscension = Math.atan2(sinD(longitudeDeg) * cosD(obliquity) - Math.tan(latitudeDeg * RAD) * sinD(obliquity), cosD(longitudeDeg)) / RAD;
  return { rightAscension, declination };
}

/** Right ascension and declination, as seen from Åland at this instant. */
function onHorizon(utcMs: number, rightAscension: number, declination: number): SkyPlace {
  const days = julianDay(utcMs) - 2_451_545;
  const t = days / 36_525;
  const siderealDeg = 280.46061837 + 360.98564736629 * days + 0.000387933 * t * t;
  const hourAngle = siderealDeg + OBSERVER.longitudeDeg - rightAscension;
  const latitude = OBSERVER.latitudeDeg;
  const elevation = Math.asin(sinD(latitude) * sinD(declination) + cosD(latitude) * cosD(declination) * cosD(hourAngle)) / RAD;
  const trueAzimuth = Math.atan2(-sinD(hourAngle), Math.tan(declination * RAD) * cosD(latitude) - sinD(latitude) * cosD(hourAngle)) / RAD;
  return { azimuthDeg: wrap(trueAzimuth + TRUE_NORTH_GRID_DEG), elevationDeg: elevation };
}

function sunLongitudeDeg(t: number) {
  const meanLongitude = 280.46646 + t * (36000.76983 + t * 0.0003032);
  const anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const centre = sinD(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) + sinD(2 * anomaly) * (0.019993 - 0.000101 * t) + sinD(3 * anomaly) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  return meanLongitude + centre - 0.00569 - 0.00478 * sinD(omega);
}

/** The sun's centre, without refraction: at sunrise and sunset it stands at `SUNRISE_ELEVATION_DEG`. */
export function sunPlace(utcMs: number): SkyPlace {
  const t = centuries(utcMs);
  const { rightAscension, declination } = equatorial(sunLongitudeDeg(t), 0, obliquityDeg(t));
  return onHorizon(utcMs, rightAscension, declination);
}

function moonEcliptic(t: number) {
  const term = (amplitude: number, base: number, rate: number) => amplitude * sinD(base + rate * t);
  const longitude = 218.32 + 481_267.881 * t + term(6.29, 135.0, 477_198.87) + term(-1.27, 259.3, -413_335.36) + term(0.66, 235.7, 890_534.22) + term(0.21, 269.9, 954_397.74) + term(-0.19, 357.5, 35_999.05) + term(-0.11, 186.5, 966_404.03);
  const latitude = term(5.13, 93.3, 483_202.02) + term(0.28, 228.2, 960_400.89) + term(-0.28, 318.3, 6003.15) + term(-0.17, 217.6, -407_332.21);
  const parallax = 0.9508 + 0.0518 * cosD(135.0 + 477_198.87 * t) + 0.0095 * cosD(259.3 - 413_335.36 * t) + 0.0078 * cosD(235.7 + 890_534.22 * t) + 0.0028 * cosD(269.9 + 954_397.74 * t);
  return { longitude, latitude, parallax };
}

export function moonPlace(utcMs: number): MoonPlace {
  const t = centuries(utcMs);
  const moon = moonEcliptic(t);
  const { rightAscension, declination } = equatorial(moon.longitude, moon.latitude, obliquityDeg(t));
  const seen = onHorizon(utcMs, rightAscension, declination);
  const ahead = wrap(moon.longitude - sunLongitudeDeg(t));
  const elongation = Math.acos(cosD(moon.latitude) * cosD(ahead)) / RAD;
  return {
    azimuthDeg: seen.azimuthDeg,
    // Seen from the ground rather than the Earth's centre, the moon sits lower by its parallax.
    elevationDeg: seen.elevationDeg - moon.parallax * cosD(seen.elevationDeg),
    lit: (1 - cosD(elongation)) / 2,
    waxing: ahead < 180,
  };
}

/** A unit vector towards a place in the sky, in the scene's frame: east +x, up +y, north -z. */
export function towards({ azimuthDeg, elevationDeg }: SkyPlace): [x: number, y: number, z: number] {
  return [sinD(azimuthDeg) * cosD(elevationDeg), sinD(elevationDeg), -cosD(azimuthDeg) * cosD(elevationDeg)];
}
