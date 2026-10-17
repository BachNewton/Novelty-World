import type { Weather, WeatherKind } from "../../engine/weather";
import { REGIONS } from "../../engine/regions";

/*
 * The weather as the art reads it each frame: the engine's weather where
 * the camera is, the lightning's flash, the floor of the valley the mist
 * pools in, and the camera's mix of regions, for colours that blend across
 * their borders. The scene works it out once a frame; the art only reads it.
 */

export interface WeatherNow {
  weather: Weather;
  /** The weather held for a look, or null while the sky does as it will. */
  held: WeatherKind | null;
  /** The lightning's flash, 0 to 1. */
  flash: number;
  /** The valley floor round the camera, in metres: where the mist lies thickest. */
  floor: number;
  /** The camera's share of each region, in `REGIONS` order. */
  regions: Float32Array;
}

/** A still, fair day: what's drawn where no weather is worked out (the art gallery). */
export function calmWeather(): WeatherNow {
  const regions = new Float32Array(REGIONS.length);
  regions[0] = 1;
  return {
    weather: {
      temperature: 14,
      humidity: 0.5,
      cloudCover: 0.3,
      heaped: 0.8,
      wind: { x: 1, z: 0, speed: 2 },
      precipitation: 0,
      snow: 0,
      storm: 0,
      haze: 0.7,
      mist: 0,
      wetness: 0,
      puddles: 0,
    },
    held: null,
    flash: 0,
    floor: 0,
    regions,
  };
}
