import { describe, expect, it } from "vitest";
import { burst, reach } from "./motion";

describe("reach", () => {
  it("puts the end of two segments on a target in reach", () => {
    const [a1, a2] = reach([0, 0], [-0.15, 0.03], 0.1, 0.09, -1);
    const end = [-Math.cos(a1) * 0.1 - Math.cos(a2) * 0.09, -Math.sin(a1) * 0.1 - Math.sin(a2) * 0.09];
    expect(end[0]).toBeCloseTo(-0.15, 4);
    expect(end[1]).toBeCloseTo(0.03, 4);
  });

  it("bends a knee forward and an elbow back", () => {
    const [knee] = reach([0, 0], [-0.15, 0], 0.1, 0.09, -1);
    const [elbow] = reach([0, 0], [-0.15, 0], 0.1, 0.09, 1);
    expect(-Math.sin(knee)).toBeGreaterThan(0);
    expect(-Math.sin(elbow)).toBeLessThan(0);
  });
});

describe("a burst", () => {
  it("rises and falls within its window, and is seeded", () => {
    const samples = Array.from({ length: 2000 }, (_, i) => burst(3, 1, i * 0.01, 4, 0.5).amount);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    expect(samples.filter((v) => v > 0).length / samples.length).toBeLessThan(0.2);
    expect(burst(3, 1, 7.3, 4, 0.5)).toEqual(burst(3, 1, 7.3, 4, 0.5));
  });
});
