import { describe, expect, it } from "vitest";
import { NIGHT_STOPS } from "../art/night/night";
import { darkness, lateness, nightAmount } from "./day-and-night";

const noMoon = { azimuthDeg: 0, elevationDeg: -30, lit: 0, waxing: true };

describe("the night by the sun's height", () => {
  it("meets each of the night's looks at the height its sun was drawn at, and moves only one way between them", () => {
    expect(nightAmount(40)).toBe(NIGHT_STOPS.day);
    expect(nightAmount(6)).toBeCloseTo(NIGHT_STOPS.golden, 9);
    expect(nightAmount(-1.5)).toBeCloseTo(NIGHT_STOPS.dusk, 9);
    expect(nightAmount(-40)).toBe(NIGHT_STOPS.night);
    for (let height = 30; height > -20; height -= 0.5) expect(nightAmount(height - 0.5)).toBeGreaterThanOrEqual(nightAmount(height));
  });

  it("goes darker than a midsummer night only once the sun is lower than it ever gets at midsummer", () => {
    expect(darkness(-6.5, noMoon)).toBe(0);
    expect(darkness(-18, noMoon)).toBe(1);
    const fullMoonUp = { azimuthDeg: 180, elevationDeg: 30, lit: 1, waxing: false };
    expect(darkness(-30, fullMoonUp)).toBeCloseTo(0.5, 9);
  });

  it("turns rooms out in the small hours by the clock, whatever the season", () => {
    expect(lateness(20)).toBe(0);
    expect(lateness(2)).toBe(1);
    expect(lateness(7)).toBe(0);
    expect(lateness(23)).toBeGreaterThan(0);
    expect(lateness(23)).toBeLessThan(1);
  });
});
