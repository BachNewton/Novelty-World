import { describe, expect, it } from "vitest";
import { normalCdf, normalQuantile, wilsonInterval } from "./stats";

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

describe("normalQuantile", () => {
  it("gives the familiar critical values", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963985, 8);
    expect(normalQuantile(0.95)).toBeCloseTo(1.644853627, 8);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232306, 8);
  });

  it("inverts the normal CDF across the range", () => {
    for (const p of [1e-9, 0.01, 0.2, 0.7, 0.99, 1 - 1e-9]) expect(normalCdf(normalQuantile(p)) / p).toBeCloseTo(1, 9);
  });
});
