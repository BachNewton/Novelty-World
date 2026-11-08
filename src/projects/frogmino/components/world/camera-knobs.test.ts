import { describe, expect, it } from "vitest";
import { TUNING } from "../../tuning";
import { CAMERA_PITCH, cameraEye, cameraPitch } from "../camera-fit";
import { CAMERA_KNOB_KEYS, CAMERA_KNOB_RANGES, TUNED_CAMERA } from "./camera-knobs";

describe("camera knobs", () => {
  it("start from the tuning, inside every slider's range", () => {
    for (const key of CAMERA_KNOB_KEYS) {
      const { min, max } = CAMERA_KNOB_RANGES[key];
      expect(TUNED_CAMERA[key]).toBe(TUNING[key]);
      expect(TUNED_CAMERA[key]).toBeGreaterThanOrEqual(min);
      expect(TUNED_CAMERA[key]).toBeLessThanOrEqual(max);
    }
  });

  it("drive the same camera maths as the game", () => {
    expect(cameraPitch(TUNED_CAMERA)).toBe(CAMERA_PITCH);
    expect(cameraPitch({ cameraHeight: 5, cameraFollow: 2, cameraLookAhead: 3 })).toBeCloseTo(-Math.PI / 4);
    expect(cameraEye({ cameraHeight: 5, cameraFollow: 2, cameraLookAhead: 3 }, 10, 1)).toEqual({ y: 6, z: -8 });
  });
});
