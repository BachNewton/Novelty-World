import { describe, expect, it } from "vitest";
import { wilsonInterval } from "./stats";

describe("wilsonInterval", () => {
  it("matches the textbook Wilson interval", () => {
    // 20 of 100: 95% Wilson interval ≈ [0.1333, 0.2888].
    const ci = wilsonInterval(20, 100);
    expect(ci.share).toBe(0.2);
    expect(ci.low).toBeCloseTo(0.1333, 3);
    expect(ci.high).toBeCloseTo(0.2888, 3);
  });

  it("stays inside [0, 1] at the extremes", () => {
    const none = wilsonInterval(0, 10);
    expect(none.low).toBeCloseTo(0, 12);
    expect(none.high).toBeGreaterThan(0.2);
    const all = wilsonInterval(10, 10);
    expect(all.high).toBeCloseTo(1, 12);
  });

  it("says nothing without trials", () => {
    expect(wilsonInterval(0, 0)).toEqual({ share: 0, low: 0, high: 1 });
  });
});
