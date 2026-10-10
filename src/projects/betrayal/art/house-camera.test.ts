import { describe, expect, it } from "vitest";
import { cameraDistance, clampPitch, DEFAULT_PITCH, depthRange, depthStep, houseDepthStep, LENS_NEAREST, MIN_EYE_HEIGHT, PITCH_RANGE, ZOOM_RANGE } from "./house-camera";

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

describe("depthRange", () => {
  const level = { min: { x: -15, y: -2, z: -15 }, max: { x: 15, y: 3.2, z: 15 } };
  /** The camera as the house places it: `distance` back from a target on the floor, at a tilt, on a screen of an aspect. */
  const camera = (distance: number, pitch: number) => ({
    eye: { x: 0, y: distance * Math.sin(pitch), z: distance * Math.cos(pitch) },
    forward: { x: 0, y: -Math.sin(pitch), z: -Math.cos(pitch) },
  });

  it("stands the near plane at the nearest thing the camera can see, far from the lens", () => {
    const distance = cameraDistance(1, 16 / 9);
    const { eye, forward } = camera(distance, DEFAULT_PITCH);
    const range = depthRange(eye, forward, 16 / 9, level);
    expect(range.near).toBeGreaterThan(10);
    expect(range.near).toBeLessThan(distance);
    expect(range.far).toBeGreaterThan(distance);
  });

  it("holds every corner of the bounds the camera can see between its planes", () => {
    const { eye, forward } = camera(cameraDistance(0.5, 360 / 780), PITCH_RANGE[0]);
    const range = depthRange(eye, forward, 360 / 780, level);
    for (const x of [level.min.x, level.max.x]) {
      for (const y of [level.min.y, level.max.y]) {
        for (const z of [level.min.z, level.max.z]) {
          const along = (x - eye.x) * forward.x + (y - eye.y) * forward.y + (z - eye.z) * forward.z;
          expect(along).toBeLessThan(range.far);
        }
      }
    }
  });

  it("falls back to the lens's own near plane when the camera stands among what it shows", () => {
    const { eye, forward } = camera(4, PITCH_RANGE[0]);
    expect(depthRange(eye, forward, 16 / 9, level).near).toBeCloseTo(LENS_NEAREST, 2);
  });

  it("separates a millimetre at the floor anywhere in the camera's reach, where a fixed 0.1 m near plane could not", () => {
    expect(houseDepthStep()).toBeLessThan(0.0005);
    const far = cameraDistance(ZOOM_RANGE[0], 360 / 780);
    expect(depthStep(far, { near: 0.1, far: 400 })).toBeGreaterThan(0.01);
  });
});
