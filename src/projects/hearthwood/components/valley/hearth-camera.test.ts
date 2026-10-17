import { describe, expect, it } from "vitest";
import { fromFire, hearthView, sideOf, towardFire } from "./hearth-camera";

const fire = { x: 10, y: 2, z: -4 };

describe("the camera at the hearth", () => {
  it("lays the fire's frame out with +z towards Elliott", () => {
    const side = sideOf(fire, { x: 13, z: -4 });
    const towards = fromFire(fire, side, { x: 0, y: 0, z: 2 });
    expect(towards.x).toBeCloseTo(12);
    expect(towards.z).toBeCloseTo(-4);
    // Facing the fire from the east is facing west.
    expect(Math.sin(towardFire(side))).toBeCloseTo(-1);
    expect(Math.cos(towardFire(side))).toBeCloseTo(0);
  });

  it("looks from behind Elliott and above, down towards the fire, wherever they stand round it", () => {
    for (const side of [0, 1, 2.5, -2]) {
      for (const distance of [0.5, 2, 6]) {
        const { eye, look } = hearthView(fire, side, distance);
        const elliott = fromFire(fire, side, { x: 0, y: 0, z: Math.min(3.4, Math.max(1.7, distance)) });
        expect(Math.hypot(eye.x - fire.x, eye.z - fire.z)).toBeGreaterThan(Math.hypot(elliott.x - fire.x, elliott.z - fire.z));
        expect(eye.y).toBeGreaterThan(look.y + 1);
        expect(Math.hypot(look.x - fire.x, look.z - fire.z)).toBeLessThan(1);
      }
    }
  });
});
