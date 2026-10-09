import { describe, expect, it } from "vitest";
import { clampPitch, DEFAULT_PITCH, MIN_EYE_HEIGHT, PITCH_RANGE } from "./house-camera";

describe("clampPitch", () => {
  it("keeps a tilt within the limits as it is", () => {
    expect(clampPitch(DEFAULT_PITCH)).toBe(DEFAULT_PITCH);
  });

  it("stops near eye level, never level with or under the floor", () => {
    expect(clampPitch(0)).toBe(PITCH_RANGE[0]);
    expect(clampPitch(-1)).toBe(PITCH_RANGE[0]);
    expect(PITCH_RANGE[0]).toBeGreaterThan(0);
  });

  it("stops short of straight down, where the angle round the vertical would be lost", () => {
    expect(clampPitch(Math.PI / 2)).toBe(PITCH_RANGE[1]);
    expect(PITCH_RANGE[1]).toBeLessThan(Math.PI / 2);
  });
});

describe("clampPitch near the target", () => {
  it("keeps the camera above the furniture when it stands close", () => {
    const close = 8;
    const pitch = clampPitch(PITCH_RANGE[0], close);
    expect(close * Math.sin(pitch)).toBeCloseTo(MIN_EYE_HEIGHT);
  });

  it("allows the lowest tilt when it stands far enough back", () => {
    expect(clampPitch(0, 60)).toBe(PITCH_RANGE[0]);
  });

  it("never lifts the tilt past top-down's limit", () => {
    expect(clampPitch(0, 1)).toBe(PITCH_RANGE[1]);
  });
});
