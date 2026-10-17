import { sunDay } from "./astronomy";
import { CALENDAR, dateAt, secondsPerDay, type CalendarDate, type CalendarTuning } from "./calendar";
import { clamp, gradientNoise, lerp, smoothstep, type Noise2 } from "./noise";
import { REGIONS, type Region, type RegionWeights } from "./regions";

/*
 * The weather, as pure functions of the world's seed and the calendar's
 * time: the same moment of the same world always has the same sky. Slow
 * noise drifts the temperature, the humidity, the cloud and the wind over
 * game days, the season sets the temperature and how often it clouds over,
 * the hour makes the dawn cold and the afternoon warm, and rain or snow
 * follows from the humidity, the cloud and the temperature. A region nudges
 * it where the camera stands: damper in the pine highlands, drier over the
 * heath. Everything the art shows of the weather is read from here: the
 * haze, the valley mist, the clouds, the rain and snow, the wind, the wet
 * ground and the puddles.
 */

export interface Wind {
  /** Which way it blows to, a unit vector in the world's x and z. */
  x: number;
  z: number;
  /** Metres a second. */
  speed: number;
}

export interface Weather {
  /** Degrees Celsius. */
  temperature: number;
  /** Relative humidity, 0 to 1. */
  humidity: number;
  /** How much of the sky the clouds cover, 0 to 1. */
  cloudCover: number;
  /** How heaped the clouds are: 0 flat grey layers, 1 tall fair-weather heaps. */
  heaped: number;
  wind: Wind;
  /** How hard it rains or snows, 0 (dry) to 1 (a downpour). */
  precipitation: number;
  /** How much of what falls is snow, 0 to 1. */
  snow: number;
  /** How stormy it is, 0 to 1: lightning comes with it. */
  storm: number;
  /** How thick the far haze is against an ordinary day: about 0.3 on a crisp clear day, 3 in a downpour. */
  haze: number;
  /** How thick the mist lying in the valleys is, 0 to 1. */
  mist: number;
  /** How wet the ground is, 0 to 1: it soaks in rain and dries after. */
  wetness: number;
  /** How much standing water lies in the hollows, 0 to 1: it lingers after rain and dries slower than the ground. */
  puddles: number;
}

/** The weathers that can be held for a look or a screenshot, whatever the sky would have done. */
export const WEATHER_KINDS = ["clear", "fair", "cloudy", "overcast", "mist", "rain", "storm", "snow", "after-rain"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** How long the weather takes to drift, in game hours: the scale of each field's noise. */
const DRIFT = {
  temperature: 40,
  humidity: 26,
  cloud: 15,
  heaped: 22,
  wind: 18,
  windTurn: 60,
  shower: 4,
} as const;

/** How each region nudges the weather over it. */
const REGION_WEATHER: Record<Region, { humidity: number; cloud: number; temperature: number }> = {
  greenwood: { humidity: 0, cloud: 0, temperature: 0 },
  birchvale: { humidity: 0.05, cloud: 0, temperature: 0 },
  highlands: { humidity: 0.1, cloud: 0.08, temperature: -2 },
  heath: { humidity: -0.1, cloud: -0.1, temperature: 0.5 },
  maplewood: { humidity: 0.03, cloud: 0.02, temperature: 0 },
};

/** How often each season clouds over, against the year's usual. */
const SEASON_CLOUD = { spring: 0, summer: -0.06, autumn: 0.1, winter: 0.06 } as const;

/** How many game hours back the ground remembers rain, and how often it is sampled. */
const WET_MEMORY = 30;
const WET_STEP = 1.5;

export interface WeatherAt {
  /** The weather at a time (seconds since the calendar began), over a point's mix of regions when given. */
  at: (seconds: number, regions?: RegionWeights) => Weather;
}

/** A slice through 2D noise along time, on a lane of its own, in about [-1, 1]. */
function drift(noise: Noise2, hours: number, period: number, lane: number): number {
  return 0.67 * noise(hours / period, lane + 0.37) + 0.33 * noise((hours / period) * 2.3 + 5.1, lane + 0.71);
}

/** The year's mean temperature on a real day of the year, as at Helsinki: about −4 °C in late January and 18 °C in late July. */
export function seasonalTemperature(realDayOfYear: number): number {
  return 7 - 11 * Math.cos((2 * Math.PI * (realDayOfYear - 22)) / 365);
}

/** The day's swing about its mean: coldest about dawn, warmest mid-afternoon; clouds damp it. */
export function dailySwing(hour: number, amplitude: number): number {
  const fromWarmest = (((hour - 15) % 24) + 24) % 24;
  // Cooling for fourteen hours from the afternoon to a little before five, then warming for ten.
  const turn = fromWarmest < 14 ? fromWarmest / 14 : 1 + (fromWarmest - 14) / 10;
  return amplitude * Math.cos(Math.PI * turn);
}

/** How far the night's mist has built (0 to 1): none in the evening, gathering through the night, thickest at sunrise, gone some hours after. */
export function mistHour(hour: number, date: CalendarDate, tuning: CalendarTuning): number {
  const day = sunDay(date.realDayOfYear, tuning.latitude);
  const crossing = day.sun === "always-above" ? { rises: 2.5, sets: 21.5 } : day.sun === "always-below" ? { rises: 11, sets: 13 } : day.sun;
  const night = crossing.rises + 24 - crossing.sets;
  const sinceSunset = (((hour - crossing.sets) % 24) + 24) % 24;
  if (sinceSunset < night) return smoothstep(1, night, sinceSunset);
  return 1 - smoothstep(1, 4.5, sinceSunset - night);
}

interface Fields {
  temperature: number;
  humidity: number;
  cloudCover: number;
  heaped: number;
  precipitation: number;
  snow: number;
}

export function makeWeather(seed: string, tuning: CalendarTuning = CALENDAR): WeatherAt {
  const noise = gradientNoise(`${seed}/weather`);
  const hoursOf = (seconds: number) => (seconds / secondsPerDay(tuning)) * 24;

  /** The fields that fall from the sky at a moment, before the ground and the air are worked out from them. */
  const fields = (seconds: number, nudge: { humidity: number; cloud: number; temperature: number }): Fields => {
    const hours = hoursOf(seconds);
    const date = dateAt(seconds, tuning);
    const cloudNoise = drift(noise, hours, DRIFT.cloud, 11);
    const humidityNoise = drift(noise, hours, DRIFT.humidity, 7);
    const swing = dailySwing(date.hour, 1);
    // Cloud follows the humidity, and a season of its own: grey autumns, brighter summers.
    const cloudCover = clamp(0.45 + 0.95 * cloudNoise + 0.3 * humidityNoise + SEASON_CLOUD[date.season] + nudge.cloud, 0, 1);
    const amplitude = lerp(1.5, 4.5, smoothstep(40, 200, date.realDayOfYear) * (1 - smoothstep(230, 320, date.realDayOfYear))) * (1 - 0.6 * cloudCover);
    const temperature = seasonalTemperature(date.realDayOfYear) + 4 * drift(noise, hours, DRIFT.temperature, 3) + swing * amplitude + nudge.temperature;
    // Relative humidity rises as the air cools in the night, and under cloud.
    const humidity = clamp(0.58 + 0.3 * humidityNoise - 0.12 * swing + 0.15 * (cloudCover - 0.5) + nudge.humidity, 0, 1);
    // Showers come and go within a spell of rain, so a wet day has its breaks.
    const showers = 0.5 + 0.5 * drift(noise, hours, DRIFT.shower, 19);
    const wet = cloudCover * 0.65 + humidity * 0.35 + 0.18 * (showers - 0.5);
    const precipitation = smoothstep(0.67, 0.9, wet);
    return {
      temperature,
      humidity,
      cloudCover,
      heaped: clamp(0.55 + 0.6 * drift(noise, hours, DRIFT.heaped, 23) - 0.5 * smoothstep(0.75, 1, cloudCover) + 0.2 * smoothstep(8, 20, temperature), 0, 1),
      precipitation,
      snow: smoothstep(2, -1, temperature),
    };
  };

  return {
    at(seconds, regions) {
      const nudge = { humidity: 0, cloud: 0, temperature: 0 };
      if (regions) {
        REGIONS.forEach((region, i) => {
          nudge.humidity += REGION_WEATHER[region].humidity * regions[i];
          nudge.cloud += REGION_WEATHER[region].cloud * regions[i];
          nudge.temperature += REGION_WEATHER[region].temperature * regions[i];
        });
      }
      const now = fields(seconds, nudge);
      const hours = hoursOf(seconds);
      const date = dateAt(seconds, tuning);

      // The ground soaks up the rain of the last day or so, and dries the faster the warmer it is; puddles last longer.
      let wetness = 0;
      let puddles = 0;
      for (let back = WET_MEMORY; back >= 0; back -= WET_STEP) {
        const then = back === 0 ? now : fields(seconds - (back / 24) * secondsPerDay(tuning), nudge);
        const rain = then.precipitation * (1 - then.snow);
        const drying = (0.05 + 0.012 * Math.max(0, then.temperature)) * (1 - 0.5 * then.cloudCover);
        wetness = clamp(wetness + rain * 0.9 - drying * WET_STEP * 0.35, 0, 1);
        puddles = clamp(puddles + rain * 0.5 - drying * WET_STEP * 0.12, 0, 1);
      }

      const angle = Math.PI * drift(noise, hours, DRIFT.windTurn, 29) + 0.3;
      const speed = clamp(3.5 + 3 * drift(noise, hours, DRIFT.wind, 31) + 5 * now.precipitation * now.cloudCover, 0.3, 14);
      const storm = smoothstep(0.35, 0.8, now.precipitation) * smoothstep(11, 17, now.temperature);
      // Mist gathers in still, damp nights under a clearish sky and burns off in the morning; rain and drizzle bring a mist of their own.
      const still = 1 - smoothstep(2, 7, speed);
      const nightMist = mistHour(date.hour, date, tuning) * smoothstep(0.55, 0.85, now.humidity) * still * (1 - 0.5 * smoothstep(0.7, 1, now.cloudCover));
      const mist = clamp(Math.max(nightMist, 0.55 * now.precipitation * (1 - 0.5 * now.snow)), 0, 1);
      const haze = 0.3 + 1.6 * now.humidity * now.humidity + 1.4 * now.precipitation + 0.6 * now.snow * now.precipitation;

      return {
        temperature: now.temperature,
        humidity: now.humidity,
        cloudCover: now.cloudCover,
        heaped: now.heaped,
        wind: { x: Math.cos(angle), z: Math.sin(angle), speed },
        precipitation: now.precipitation,
        snow: now.snow,
        storm,
        haze,
        mist,
        wetness,
        puddles,
      };
    },
  };
}

/** A weather held whatever the sky would do, for a look or a screenshot: only what makes it that kind is set, the rest is the day's own. */
export function holdWeather(kind: WeatherKind, base: Weather): Weather {
  const calm = { ...base.wind, speed: 2 };
  switch (kind) {
    case "clear":
      return { ...base, humidity: 0.4, cloudCover: 0, precipitation: 0, storm: 0, haze: 0.3, mist: 0, wetness: 0, puddles: 0, wind: calm };
    case "fair":
      return { ...base, humidity: 0.5, cloudCover: 0.35, heaped: 0.9, precipitation: 0, storm: 0, haze: 0.7, mist: 0, wetness: 0, puddles: 0 };
    case "cloudy":
      return { ...base, humidity: 0.6, cloudCover: 0.65, heaped: 0.6, precipitation: 0, storm: 0, haze: 1, mist: 0, wetness: 0.1, puddles: 0 };
    case "overcast":
      return { ...base, humidity: 0.75, cloudCover: 0.95, heaped: 0.1, precipitation: 0, storm: 0, haze: 1.4, mist: 0.15 };
    case "mist":
      return { ...base, humidity: 0.95, cloudCover: 0.3, heaped: 0.4, precipitation: 0, storm: 0, haze: 1.8, mist: 1, wetness: 0.3, puddles: 0, wind: { ...calm, speed: 0.5 } };
    case "rain":
      return { ...base, humidity: 0.95, cloudCover: 1, heaped: 0.2, precipitation: 0.7, snow: 0, storm: 0, haze: 2.4, mist: 0.4, wetness: 1, puddles: 0.8, wind: { ...base.wind, speed: 6 } };
    case "storm":
      return { ...base, humidity: 1, cloudCover: 1, heaped: 0.5, precipitation: 1, snow: 0, storm: 1, haze: 2.8, mist: 0.5, wetness: 1, puddles: 1, wind: { ...base.wind, speed: 11 } };
    case "snow":
      return { ...base, temperature: -4, humidity: 0.9, cloudCover: 0.95, heaped: 0.2, precipitation: 0.6, snow: 1, storm: 0, haze: 2, mist: 0.2, wetness: 0, puddles: 0, wind: { ...base.wind, speed: 3 } };
    case "after-rain":
      return { ...base, humidity: 0.8, cloudCover: 0.45, heaped: 0.8, precipitation: 0, storm: 0, haze: 0.9, mist: 0.25, wetness: 0.8, puddles: 0.9 };
  }
}

/** The weather a page holds, from `?weather=`: one of the kinds, or null to let the sky do as it will. */
export function parseWeather(text: string | null): WeatherKind | null {
  if (text === null) return null;
  const kind = WEATHER_KINDS.find((k) => k === text);
  if (kind === undefined) throw new Error(`?weather must be one of ${WEATHER_KINDS.join(", ")}, not ${text}`);
  return kind;
}

/** A flash of lightning at a moment, 0 to 1: rare, from the storm's strength, each a bright stroke and a flicker or two, the same at the same moment of the same world. */
export function makeLightning(seed: string): (seconds: number, storm: number) => number {
  const noise = gradientNoise(`${seed}/lightning`);
  // A slot of a few real seconds may hold one stroke, more often the stormier it is.
  const SLOT = 7;
  return (seconds, storm) => {
    if (storm <= 0) return 0;
    const slot = Math.floor(seconds / SLOT);
    const chance = 0.5 + 0.5 * noise(slot * 0.731 + 0.5, 3.3);
    if (chance > 0.25 + 0.5 * storm) return 0;
    const start = slot * SLOT + SLOT * (0.5 + 0.5 * noise(slot * 0.517 + 0.25, 8.1)) * 0.8;
    const t = seconds - start;
    if (t < 0 || t > 0.9) return 0;
    // A first stroke, a dark gap, a second and a fading glow.
    const strokes = Math.exp(-t * 22) + 0.8 * Math.exp(-Math.abs(t - 0.18) * 30) + 0.35 * Math.exp(-Math.max(0, t - 0.32) * 6) * (t > 0.32 ? 1 : 0);
    return clamp(strokes * smoothstep(0, 0.4, storm), 0, 1);
  };
}
