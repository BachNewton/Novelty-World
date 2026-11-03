import { Vector3, type InstancedBufferAttribute } from "three/webgpu";
import { float, vec3 } from "three/tsl";
import { describe, expect, it } from "vitest";
import { buildRegatta, type RegattaInputs } from "./regatta";

const inputs: RegattaInputs = { linear: () => new Vector3(1, 1, 1), colour: () => vec3(1, 1, 1), hazed: (color) => color, time: float(0) };

// The game's clock wraps once a day: a boat that hasn't sailed whole laps by then jumps along its line.
describe("the regatta's clock", () => {
  it("has every boat sail whole laps in the period the clock wraps at", () => {
    const course = { from: { x: 0, z: 0 }, to: { x: 3000, z: -2000 }, y: 0, wideM: 500, count: 30, seed: 5, speedMs: 2.5, periodS: 86_400 };
    const lane = buildRegatta(inputs, course).geometry.getAttribute("lane") as InstancedBufferAttribute;
    const length = Math.hypot(3000, 2000);
    for (let boat = 0; boat < course.count; boat++) {
      const laps = (course.periodS * ((2 * course.speedMs) / length) * lane.getZ(boat)) / (2 * Math.PI);
      expect(laps).toBeCloseTo(Math.round(laps), 4);
      expect(lane.getZ(boat)).toBeGreaterThan(0.85);
      expect(lane.getZ(boat)).toBeLessThan(1.15);
    }
  });
});
