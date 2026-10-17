import { describe, expect, it } from "vitest";
import { CAMERA_CLEARANCE, clampOrbit, eyeFor, ORBIT_LIMITS, turnBetween } from "./follow-camera";

describe("the follow camera", () => {
  const flat = () => 0;

  it("sits behind and above what it looks at", () => {
    const eye = eyeFor({ x: 0, y: 1.5, z: 0 }, { yaw: 0, pitch: 0.3, distance: 7 }, flat);
    expect(eye.z).toBeLessThan(-6);
    expect(eye.y).toBeGreaterThan(1.5);
    expect(Math.hypot(eye.x, eye.y - 1.5, eye.z)).toBeCloseTo(7);
  });

  it("comes in rather than climbing when land rises behind the walker", () => {
    const wallBehind = (_: number, z: number) => (z < -3 ? 30 : 0);
    const eye = eyeFor({ x: 0, y: 1.5, z: 0 }, { yaw: 0, pitch: 0.2, distance: 8 }, wallBehind);
    expect(eye.z).toBeGreaterThan(-3);
    expect(eye.y).toBeLessThan(5);
  });

  it("never sinks into the ground", () => {
    const eye = eyeFor({ x: 0, y: 1.5, z: 0 }, { yaw: 0, pitch: -0.12, distance: 10 }, flat);
    expect(eye.y).toBeGreaterThanOrEqual(CAMERA_CLEARANCE);
  });

  it("keeps its tilt and distance in bounds", () => {
    const orbit = clampOrbit({ yaw: 5, pitch: 3, distance: 100 });
    expect(orbit).toEqual({ yaw: 5, pitch: ORBIT_LIMITS.pitch[1], distance: ORBIT_LIMITS.distance[1] });
  });

  it("turns the short way round", () => {
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
});
