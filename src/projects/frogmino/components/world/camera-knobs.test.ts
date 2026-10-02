import { describe, expect, it } from "vitest";
import { TUNING } from "../../tuning";
import { CAMERA_PITCH, cameraEye, cameraPitch } from "../camera-fit";
import { CAMERA_KNOB_KEYS, CAMERA_KNOB_RANGES, TUNED_CAMERA, formatKnob, tuningSnippet } from "./camera-knobs";

describe("camera knobs", () => {
  it("copy as the lines they take in tuning.ts", () => {
    expect(tuningSnippet({ cameraHeight: 8.5, cameraFollow: 7, cameraLookAhead: 6 })).toBe(
      "  cameraHeight: 8.5,\n  cameraFollow: 7,\n  cameraLookAhead: 6,",
    );
  });

  it("drop a slider step's float noise", () => {
    expect(formatKnob(0.1 + 0.2)).toBe("0.3");
    expect(formatKnob(8.55)).toBe("8.55");
  });

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
