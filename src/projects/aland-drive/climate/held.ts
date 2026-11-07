import { withReading, type Weather, type WeatherState } from "./weather";

/*
 * A weather held by a link (`?weather=rain`) or the dev menu, to see and drive one without waiting for the climate to
 * bring it: one of each state, as the climate makes it at its height, and black ice, which no state names.
 */

export type HeldWeather = WeatherState | "ice";

const calm = { cloudCover: 0.1, rain: 0, snowfall: 0, fog: 0, windMS: 4, windFromDeg: 225, temperatureC: 14, roadWet: 0, roadSnow: 0, blackIce: 0, aurora: 0 };

export const HELD_WEATHER: Record<HeldWeather, Weather> = {
  clear: withReading(calm),
  cloud: withReading({ ...calm, cloudCover: 0.6, windMS: 6, temperatureC: 12 }),
  overcast: withReading({ ...calm, cloudCover: 0.97, windMS: 7, temperatureC: 8 }),
  rain: withReading({ ...calm, cloudCover: 1, rain: 0.7, windMS: 10, temperatureC: 9, roadWet: 1 }),
  snowfall: withReading({ ...calm, cloudCover: 1, snowfall: 0.7, windMS: 6, windFromDeg: 20, temperatureC: -3, roadSnow: 0.7 }),
  fog: withReading({ ...calm, cloudCover: 0.7, fog: 0.5, windMS: 1.5, temperatureC: 6 }),
  ice: withReading({ ...calm, cloudCover: 0.3, windMS: 3, temperatureC: -4, roadWet: 0.8, blackIce: 0.8 }),
};

export const isHeldWeather = (name: string): name is HeldWeather => name in HELD_WEATHER;
