import { describe, expect, it } from "vitest";
import { CALM, readWeatherInput } from "./weather-input";

describe("the weather the shadows and plants answer to", () => {
  it("is calm unless the address says otherwise", () => {
    expect(readWeatherInput("")).toEqual(CALM);
    expect(readWeatherInput("?clouds=0.8&wind=1")).toMatchObject({ clouds: 0.8, wind: 1, windToward: CALM.windToward });
  });

  it("refuses what isn't between 0 and 1", () => {
    expect(() => readWeatherInput("?clouds=2")).toThrow(/clouds/);
    expect(() => readWeatherInput("?wind=gusty")).toThrow(/wind/);
  });
});
