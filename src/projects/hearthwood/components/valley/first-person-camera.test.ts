import { describe, expect, it } from "vitest";
import { broomSway, EYE_HEIGHT, eyePosition, FIELD_OF_VIEW, fieldOfView, headBob, landingDip, lookDirection, PITCH_LIMIT, turnLook } from "./first-person-camera";

describe("the first-person camera", () => {
  const level = { yaw: 0, pitch: 0 };
  const still = { yaw: 0, pitch: 0 };

  it("turns right and looks down for a drag right and down, as the screen reads", () => {
    const look = turnLook(level, { yaw: 0.2, pitch: 0.1 }, still, 0);
    expect(look.yaw).toBeCloseTo(-0.2);
    expect(look.pitch).toBeCloseTo(-0.1);
  });

  it("turns at a held rate for as long as the frame lasted", () => {
    expect(turnLook(level, still, { yaw: 2, pitch: 0 }, 0.5).yaw).toBeCloseTo(-1);
  });

  it("never looks past straight up or down", () => {
    expect(turnLook(level, { yaw: 0, pitch: -10 }, still, 0).pitch).toBe(PITCH_LIMIT);
    expect(turnLook(level, { yaw: 0, pitch: 10 }, still, 0).pitch).toBe(-PITCH_LIMIT);
  });

  it("looks the way the walk goes: along +z at yaw 0, +x a quarter turn on", () => {
    expect(lookDirection(level)).toEqual({ x: 0, y: 0, z: 1 });
    const turned = lookDirection({ yaw: Math.PI / 2, pitch: 0 });
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
    expect(lookDirection({ yaw: 0, pitch: 0.4 }).y).toBeCloseTo(Math.sin(0.4));
  });

  it("holds the head still when standing, and bobs gently, more at a run", () => {
    expect(headBob(1.3, 0)).toEqual({ up: 0, side: 0 });
    const span = (pace: number) => {
      const ups = Array.from({ length: 64 }, (_, i) => headBob((i / 64) * 2 * Math.PI, pace).up);
      return Math.max(...ups) - Math.min(...ups);
    };
    expect(span(0.85)).toBeGreaterThan(0);
    expect(span(1)).toBeGreaterThan(span(0.85));
    expect(span(1)).toBeLessThan(0.05);
  });

  it("puts her eyes at their height above her feet, swaying to her right", () => {
    expect(eyePosition({ x: 1, y: 2, z: 3 }, 0, { up: 0, side: 0 })).toEqual({ x: 1, y: 2 + EYE_HEIGHT, z: 3 });
    // Looking along +z, her right is -x.
    expect(eyePosition({ x: 0, y: 0, z: 0 }, 0, { up: 0, side: 0.1 }).x).toBeCloseTo(-0.1);
  });
});

describe("the first-person camera in the air", () => {
  it("dips softly on landing, deeper the harder they came down, and comes back up", () => {
    expect(landingDip(0, 3)).toBeCloseTo(0);
    expect(landingDip(0.17, 3)).toBeLessThan(0);
    expect(landingDip(0.17, 6)).toBeLessThan(landingDip(0.17, 3));
    expect(landingDip(0.17, 100)).toBeGreaterThanOrEqual(-0.13);
    expect(landingDip(1, 6)).toBe(0);
  });

  it("widens the view in the broom's wind", () => {
    expect(fieldOfView("first", 0)).toBe(FIELD_OF_VIEW.first);
    expect(fieldOfView("first", 1)).toBeGreaterThan(FIELD_OF_VIEW.first);
  });

  it("leans into a turn, the way it turns, within bounds", () => {
    expect(broomSway(0, 1, 0).roll).toBeGreaterThan(0);
    expect(broomSway(0, -1, 0).roll).toBeLessThan(0);
    expect(Math.abs(broomSway(0, 50, 0).roll)).toBeLessThanOrEqual(0.14);
  });
});
