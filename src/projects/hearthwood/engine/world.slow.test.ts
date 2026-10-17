import { describe, expect, it } from "vitest";
import { createWorld } from "./world";

/*
 * Checks that need a wide stretch of the world worked out: finding a tarn
 * means working out the places of a few hundred cells among the ranges.
 */

const world = createWorld("first-valley");

describe("the world, widely", () => {
  it("holds a tarn's water in its hollow", () => {
    const tarn = world.placesNear(-2500, 4000, 1800).find((p) => p.kind === "tarn");
    if (!tarn?.pool) throw new Error("No tarn among the ranges near the origin");
    const { level, radius } = tarn.pool;
    expect(world.waterAt(tarn.x, tarn.z)).toBe(level);
    expect(world.heightAt(tarn.x, tarn.z)).toBeLessThan(level - 1);
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2;
      const x = tarn.x + Math.cos(angle) * (radius + 3.5);
      const z = tarn.z + Math.sin(angle) * (radius + 3.5);
      expect(world.heightAt(x, z)).toBeGreaterThan(level);
    }
  }, 60_000);
});
