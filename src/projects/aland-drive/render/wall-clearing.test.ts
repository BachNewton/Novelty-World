import { describe, expect, it } from "vitest";
import { STONE_WALL_HALF_WIDE_M } from "./tile-walls";
import { furnitureClearances, stampDistances, type ClearingSpec } from "./wall-clearing";

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
  stampDistances(field, SPEC, 100, 200, [{ sections: Float32Array.from([102, 0, 205.25, 108.25, 1, 205.25]), outM: 0 }]);

  it("is laid out with x along a row and z down the rows, as the shader reads it", () => {
    expect(read(field, 100, 200, 105.2, 205.2)).toBeLessThan(0.3);
    expect(read(field, 100, 200, 105.2, 207.2)).toBeCloseTo(2, 1);
    // Past the wall's end, it's from the end.
    expect(read(field, 100, 200, 110.2, 205.2)).toBeCloseTo(2, 1);
    expect(read(field, 100, 200, 103.2, 209.2)).toBeCloseTo(4, 1);
  });

  it("ignores what lies outside the square, and caps what's far", () => {
    const outside = new Uint8Array(SPEC.across * SPEC.across);
    stampDistances(outside, SPEC, 100, 200, [{ sections: Float32Array.from([90, 0, 190, 130, 0, 230]), outM: 0 }]);
    expect(Math.min(...outside)).toBe(0);
    expect(read(field, 100, 200, 119.7, 219.7)).toBe(SPEC.capM);
  });
});

describe("the clearing round a café terrace", () => {
  // Two tables 2.3 m apart along their own x, turned, as a terrace's row is; a table's chairs are on its own z.
  const yaw = 0.6;
  const along = [Math.cos(yaw), -Math.sin(yaw)];
  const front = [Math.sin(yaw), Math.cos(yaw)];
  const at = (x: number, z: number) => [110 + x * along[0] + z * front[0], 210 + x * along[1] + z * front[1]];
  const tables = [at(0, 0), at(2.3, 0)].flatMap(([x, z]) => [x, 0, z, yaw, 1, 0]);
  const field = new Uint8Array(SPEC.across * SPEC.across);
  stampDistances(field, SPEC, 100, 200, furnitureClearances({ "cafe-set": Float32Array.from(tables) }));
  const reading = (x: number, z: number) => read(field, 100, 200, ...(at(x, z) as [number, number]));

  it("keeps plants off its chairs and the gap between its tables", () => {
    for (const [x, z] of [[0, 0.62], [0, -0.62], [2.3, 0.62], [1.15, 0], [1.15, 0.62]]) expect(reading(x, z)).toBeLessThan(STONE_WALL_HALF_WIDE_M);
  });

  it("leaves the ground beyond it free", () => {
    expect(reading(0, 3.5)).toBeGreaterThan(1);
    expect(reading(-2.5, 0)).toBeGreaterThan(1);
  });
});
