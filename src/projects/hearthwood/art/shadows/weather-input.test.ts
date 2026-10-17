import { describe, expect, it } from "vitest";
import { holdWeather } from "../../engine/weather";
import { calmWeather } from "../weather/now";
import { readWeatherOverrides, weatherInputOf } from "./weather-input";

const fair = calmWeather().weather;

describe("the weather the shadows and plants answer to", () => {
  it("follows the weather unless the address says otherwise", () => {
    const none = readWeatherOverrides("");
    expect(weatherInputOf(fair, none).clouds).toBe(fair.cloudCover);
    expect(weatherInputOf(holdWeather("overcast", fair), none).clouds).toBeGreaterThan(0.9);
    expect(weatherInputOf(holdWeather("storm", fair), none).wind).toBeGreaterThan(weatherInputOf(fair, none).wind);
    expect(weatherInputOf(fair, readWeatherOverrides("?clouds=0.8&wind=1"))).toMatchObject({ clouds: 0.8, wind: 1 });
  });

  it("blows the way the weather's wind blows", () => {
    const toward = weatherInputOf({ ...fair, wind: { x: 0, z: 1, speed: 3 } }, readWeatherOverrides("")).windToward;
    expect(toward).toBeCloseTo(Math.PI / 2, 5);
  });

  it("refuses what isn't between 0 and 1", () => {
    expect(() => readWeatherOverrides("?clouds=2")).toThrow(/clouds/);
    expect(() => readWeatherOverrides("?wind=gusty")).toThrow(/wind/);
  });
});
