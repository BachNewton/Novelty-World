import type { Weather } from "../../engine/weather";

/*
 * The weather the shadows and the plants answer to: how much of the sky is
 * cloud, and how hard the wind blows and which way. It is the engine's
 * weather (`engine/weather.ts`, as each frame has it), unless overridden for
 * testing: from the ~ panel, or for one visit by `?clouds=` (0 to 1) and
 * `?wind=` (0 to 1).
 */

export interface WeatherInput {
  /** How much of the sky is cloud, 0 clear to 1 overcast. */
  clouds: number;
  /** How hard the wind blows, 0 still to 1 a gale. */
  wind: number;
  /** Which way it blows towards, in radians round from +x towards +z. */
  windToward: number;
}

/** What is held whatever the weather does: null follows the weather. */
export type WeatherOverrides = { [K in keyof WeatherInput]: number | null };

/** The wind's speed, in metres a second, that counts as a gale. */
const GALE = 14;

function fraction(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!(value >= 0 && value <= 1)) throw new Error(`?${name} must be between 0 and 1, not ${raw}`);
  return value;
}

/** The overrides a page starts with: none, but for `?clouds=` and `?wind=`. */
export function readWeatherOverrides(search: string): WeatherOverrides {
  const params = new URLSearchParams(search);
  return { clouds: fraction(params, "clouds"), wind: fraction(params, "wind"), windToward: null };
}

/** The weather as the shadows and plants read it, with any overrides laid over it. */
export function weatherInputOf(weather: Weather, overrides: WeatherOverrides): WeatherInput {
  return {
    clouds: overrides.clouds ?? weather.cloudCover,
    wind: overrides.wind ?? Math.min(1, weather.wind.speed / GALE),
    windToward: overrides.windToward ?? (Math.atan2(weather.wind.z, weather.wind.x) + Math.PI * 2) % (Math.PI * 2),
  };
}

let live: WeatherOverrides | null = null;

/** This page's overrides, read from its address the first time they are asked for. */
export function weatherOverrides(): WeatherOverrides {
  live ??= readWeatherOverrides(window.location.search);
  return live;
}

/** The weather the shadows and plants answer to this frame. */
export function weatherInput(weather: Weather): WeatherInput {
  return weatherInputOf(weather, weatherOverrides());
}

/** Holds one of the clouds and wind at a value for testing, or lets it follow the weather again with null. */
export function holdWeatherInput(key: keyof WeatherOverrides, value: number | null): WeatherOverrides {
  const overrides = weatherOverrides();
  overrides[key] = value;
  return { ...overrides };
}
