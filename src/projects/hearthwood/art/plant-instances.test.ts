import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import type { Plant } from "../engine/life";
import { layoutRegions, packPlant, packTint, PLACING_FLOATS, plantColour, plantMatrix, TINT_RANGE, unpackTint } from "./plant-instances";

const PLANT: Plant = { kind: "birch", x: 10, y: 3, z: -4, size: 9, stretch: 1.1, turn: 0.7, lean: 0.05, leanToward: 1.2, tint: 0.4, variant: 1, bands: -35 };

describe("a plant's placing on the GPU", () => {
  it("keeps a colour to within a step of its range", () => {
    for (const [r, g, b] of [
      [1, 1, 1],
      [0.81, 1.04, 1.13],
      [0, TINT_RANGE, 0.5],
    ]) {
      const back = unpackTint(packTint(r, g, b));
      for (const [i, v] of [r, g, b].entries()) expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(TINT_RANGE / 255 / 2 + 1e-9);
    }
    // Whole numbers below 2^24 are exact in a 32-bit float, as the GPU holds them.
    const packed = packTint(TINT_RANGE, TINT_RANGE, TINT_RANGE);
    expect(Math.fround(packed)).toBe(packed);
  });

  it("is the plant's matrix, with its design, its bands and its colour in the spare places", () => {
    const out = new Float32Array(PLACING_FLOATS);
    packPlant(PLANT, 7, new Object3D(), out, 0);
    const m = plantMatrix(PLANT, new Object3D()).elements;
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]) expect(out[i]).toBeCloseTo(m[i], 5);
    expect(out[3]).toBe(7);
    expect(out[7]).toBe(-35);
    expect(out[15]).toBe(1);
    const colour = new Float32Array(3);
    plantColour(PLANT, colour, 0);
    unpackTint(out[11]).forEach((v, i) => expect(v).toBeCloseTo(colour[i], 2));
  });
});

describe("the drawn copies' regions", () => {
  it("stay put while they hold enough, and grow with room to spare when one doesn't", () => {
    const first = layoutRegions([10, 0, 4], null, 1000);
    if (!first) throw new Error("A first layout is always made");
    expect(Array.from(first.start)).toEqual([0, first.capacity[0], first.capacity[0]]);
    expect(first.capacity[1]).toBe(0);
    expect(first.capacity[0]).toBeGreaterThan(10);
    expect(layoutRegions([10, 0, 4], first, 1000)).toBeNull();
    const grown = layoutRegions([10, 3, 4], first, 1000);
    expect(grown?.capacity[1]).toBeGreaterThanOrEqual(3);
  });

  it("fit exactly when room to spare would overflow the list, and never past it", () => {
    const exact = layoutRegions([50, 50], null, 100);
    expect(Array.from(exact?.capacity ?? [])).toEqual([50, 50]);
    expect(() => layoutRegions([60, 50], null, 100)).toThrow();
  });
});
