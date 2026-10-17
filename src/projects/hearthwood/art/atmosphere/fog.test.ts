import { describe, expect, it } from "vitest";
import { AIR, fogLayerDepth, MIST, SKY_DISTANCE } from "./fog";

/** A layer's depth along a ray summed in small steps, for the closed form to be held to. */
function marched(density: number, floorY: number, height: number, eyeY: number, pointY: number, dist: number): number {
  const steps = 20000;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const y = eyeY + ((pointY - eyeY) * (i + 0.5)) / steps;
    sum += density * Math.exp(-Math.max(y - floorY, -height) / height) * (dist / steps);
  }
  return sum;
}

describe("the fog's layers", () => {
  it("have the depth a ray really crosses, from 10 cm to tens of kilometres, level, up and down", () => {
    for (const dist of [0.1, 3, 250, 4000, 30000, 90000]) {
      for (const rise of [0, 0.02, -0.01, 0.3]) {
        for (const [density, floor, height] of [
          [AIR.density, 0, AIR.height],
          [MIST.density, 40, MIST.height],
        ] as const) {
          const eye = floor + 2;
          const point = Math.max(eye + rise * dist, floor - height * 0.5);
          const closed = fogLayerDepth(density, floor, height, eye, point, dist);
          expect(closed).toBeGreaterThanOrEqual(0);
          expect(Math.abs(closed - marched(density, floor, height, eye, point, dist)) / Math.max(1e-9, closed)).toBeLessThan(0.01);
        }
      }
    }
  });

  it("thin with height, so the mist lies in the valleys and a ridge stands out of it", () => {
    const valley = fogLayerDepth(MIST.density, 40, MIST.height, 42, 42, 500);
    const ridge = fogLayerDepth(MIST.density, 40, MIST.height, 340, 340, 500);
    expect(1 - Math.exp(-valley)).toBeGreaterThan(0.99);
    expect(1 - Math.exp(-ridge)).toBeLessThan(0.05);
  });

  it("let a crisp clear day see out to the horizon, and keep a ray into the sky finite", () => {
    const clear = (dist: number) => 1 - Math.exp(-fogLayerDepth(AIR.density, 0, AIR.height, 50, 50, dist));
    expect(clear(1000)).toBeLessThan(0.02);
    expect(clear(30000)).toBeLessThan(0.4);
    const up = fogLayerDepth(AIR.density, 0, AIR.height, 50, 50 + SKY_DISTANCE * 0.5, SKY_DISTANCE);
    expect(up).toBeLessThan(AIR.density * AIR.height * 2.5);
  });
});
