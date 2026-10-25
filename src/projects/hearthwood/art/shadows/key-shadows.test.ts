import { describe, expect, it } from "vitest";
import { shadowIntensity, sliceBreaks } from "./key-shadows";

describe("the key light's shadows", () => {
  it("fall full in clear sun, fade near the horizon, and pale under cloud", () => {
    expect(shadowIntensity("sun", 0.5, 0)).toBe(1);
    expect(shadowIntensity("sun", 0.01, 0)).toBe(0);
    expect(shadowIntensity("sun", 0.045, 0)).toBeGreaterThan(0);
    expect(shadowIntensity("sun", 0.045, 0)).toBeLessThan(1);
    const overcast = shadowIntensity("sun", 0.5, 1);
    expect(overcast).toBeGreaterThan(0);
    expect(overcast).toBeLessThan(0.3);
    expect(shadowIntensity("sun", 0.5, 0.6)).toBeLessThan(1);
    expect(shadowIntensity("sun", 0.5, 0.6)).toBeGreaterThan(overcast);
  });

  it("are lighter by moonlight", () => {
    expect(shadowIntensity("moon", 0.5, 0)).toBeLessThan(shadowIntensity("sun", 0.5, 0));
    expect(shadowIntensity("moon", 0.5, 0)).toBeGreaterThan(0.5);
  });

  it("cut the view into slices that grow by one ratio out to the reach", () => {
    const breaks = sliceBreaks(3, 900, 8);
    expect(breaks).toHaveLength(3);
    expect(breaks[2]).toBe(1);
    expect(breaks[0] * 900).toBeCloseTo(8 * (900 / 8) ** (1 / 3), 6);
    const ends = [8, ...breaks.map((b) => b * 900)];
    const ratios = ends.slice(1).map((d, i) => d / ends[i]);
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 6);
    expect(() => sliceBreaks(3, 5, 8)).toThrow();
  });
});
