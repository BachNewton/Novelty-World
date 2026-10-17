import { describe, expect, it } from "vitest";
import { walk, WALK_LIMITS, type WalkGround } from "./walking";

/** A test land: flat at 2 m, with a cliff up to 20 m beyond x = 10, and a lake standing at 2 m over ground at -3 m beyond x = -10. */
const land: WalkGround = {
  heightAt: (x) => (x > 10 ? 20 : x < -10 ? -3 : 2),
  waterAt: () => 2,
};

describe("walk", () => {
  it("goes where it's asked on open ground", () => {
    const to = walk(land, { x: 0, z: 0 }, 3, -2);
    expect(to.x).toBeCloseTo(3);
    expect(to.z).toBeCloseTo(-2);
  });

  it("stops at the foot of a cliff", () => {
    const to = walk(land, { x: 5, z: 0 }, 10, 0);
    expect(to.x).toBeLessThan(10);
    expect(land.heightAt(to.x, to.z)).toBe(2);
  });

  it("slides along a cliff it meets at an angle", () => {
    const to = walk(land, { x: 8, z: 0 }, 6, 6);
    expect(to.x).toBeLessThan(10);
    expect(to.z).toBeCloseTo(6);
  });

  it("wades no deeper than a paddle", () => {
    const to = walk(land, { x: -5, z: 0 }, -10, 0);
    expect(land.waterAt(to.x, to.z) - land.heightAt(to.x, to.z)).toBeLessThanOrEqual(WALK_LIMITS.wade);
  });

  it("walks on for ever where nothing stops it", () => {
    const to = walk(land, { x: 0, z: 0 }, 0, 5000);
    expect(to.z).toBeCloseTo(5000);
  });
});
