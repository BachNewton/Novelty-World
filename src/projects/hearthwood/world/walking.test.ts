import { describe, expect, it } from "vitest";
import { makeGrid, sample } from "./grid";
import { walk, WALK_LIMITS } from "./walking";

/** A test land: flat at 2 m, with a cliff up to 20 m beyond x = 10 and the lake's deep water beyond x = -10. */
function land() {
  const grid = makeGrid(41, 1);
  for (let i = 0; i < grid.values.length; i++) {
    const x = grid.origin + (i % grid.side);
    grid.values[i] = x > 10 ? 20 : x < -10 ? -3 : 2;
  }
  return grid;
}

describe("walk", () => {
  it("goes where it's asked on open ground", () => {
    const to = walk(land(), { x: 0, z: 0 }, 3, -2);
    expect(to.x).toBeCloseTo(3);
    expect(to.z).toBeCloseTo(-2);
  });

  it("stops at the foot of a cliff", () => {
    const heights = land();
    const to = walk(heights, { x: 5, z: 0 }, 10, 0);
    expect(to.x).toBeLessThan(10);
    expect(sample(heights, to.x, to.z)).toBe(2);
  });

  it("slides along a cliff it meets at an angle", () => {
    const to = walk(land(), { x: 8, z: 0 }, 6, 6);
    expect(to.x).toBeLessThan(10);
    expect(to.z).toBeCloseTo(6);
  });

  it("wades no deeper than a paddle", () => {
    const heights = land();
    const to = walk(heights, { x: -5, z: 0 }, -10, 0);
    expect(sample(heights, to.x, to.z)).toBeGreaterThanOrEqual(-WALK_LIMITS.wade);
  });

  it("never leaves the land", () => {
    const heights = land();
    const to = walk(heights, { x: 0, z: 0 }, 0, 100);
    expect(to.z).toBeLessThanOrEqual(20 - WALK_LIMITS.margin);
  });
});
