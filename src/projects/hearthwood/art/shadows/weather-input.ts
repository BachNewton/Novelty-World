/*
 * The weather the shadows and the plants answer to, until the weather has an
 * engine of its own: how much of the sky is cloud, and how hard the wind
 * blows and which way. Set from the ~ panel, or for one visit by `?clouds=`
 * (0 to 1) and `?wind=` (0 to 1). When the weather's engine comes, it sets
 * these instead.
 */

export interface WeatherInput {
  /** How much of the sky is cloud, 0 clear to 1 overcast. */
  clouds: number;
  /** How hard the wind blows, 0 still to 1 a gale. */
  wind: number;
  /** Which way it blows towards, in radians round from +x towards +z. */
  windToward: number;
}

/** A light breeze under a clear sky. */
export const CALM: WeatherInput = { clouds: 0, wind: 0.35, windToward: 0.6 };

function fraction(params: URLSearchParams, name: string, otherwise: number): number {
  const raw = params.get(name);
  if (raw === null) return otherwise;
  const value = Number(raw);
  if (!(value >= 0 && value <= 1)) throw new Error(`?${name} must be between 0 and 1, not ${raw}`);
  return value;
}

/** The weather a page starts with: calm, but for `?clouds=` and `?wind=`. */
export function readWeatherInput(search: string): WeatherInput {
  const params = new URLSearchParams(search);
  return { ...CALM, clouds: fraction(params, "clouds", CALM.clouds), wind: fraction(params, "wind", CALM.wind) };
}

let live: WeatherInput | null = null;

/** This page's weather input, read from its address the first time it is asked for. */
export function weatherInput(): WeatherInput {
  live ??= readWeatherInput(window.location.search);
  return live;
}
