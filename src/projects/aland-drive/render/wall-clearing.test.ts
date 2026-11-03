import { describe, expect, it } from "vitest";
import { stampDistances, type ClearingSpec } from "./wall-clearing";

const SPEC: ClearingSpec = { across: 40, texelM: 0.5, capM: 4, recentreM: 10 };

/** The distance written for the texel whose middle is nearest a place in the scene. */
function read(field: Uint8Array, west: number, north: number, x: number, z: number) {
  const column = Math.floor((x - west) / SPEC.texelM);
  const row = Math.floor((z - north) / SPEC.texelM);
  return (field[row * SPEC.across + column] / 255) * SPEC.capM;
}

describe("the distance to a stone wall", () => {
  // A wall running east along a row of texels' middles, in a square whose corner is at (100, 200).
  const field = new Uint8Array(SPEC.across * SPEC.across);
  stampDistances(field, SPEC, 100, 200, [Float32Array.from([102, 0, 205.25, 108.25, 1, 205.25])]);

  it("is laid out with x along a row and z down the rows, as the shader reads it", () => {
    expect(read(field, 100, 200, 105.2, 205.2)).toBeLessThan(0.3);
    expect(read(field, 100, 200, 105.2, 207.2)).toBeCloseTo(2, 1);
    // Past the wall's end, it's from the end.
    expect(read(field, 100, 200, 110.2, 205.2)).toBeCloseTo(2, 1);
    expect(read(field, 100, 200, 103.2, 209.2)).toBeCloseTo(4, 1);
  });

  it("ignores what lies outside the square, and caps what's far", () => {
    const outside = new Uint8Array(SPEC.across * SPEC.across);
    stampDistances(outside, SPEC, 100, 200, [Float32Array.from([90, 0, 190, 130, 0, 230])]);
    expect(Math.min(...outside)).toBe(0);
    expect(read(field, 100, 200, 119.7, 219.7)).toBe(SPEC.capM);
  });
});
