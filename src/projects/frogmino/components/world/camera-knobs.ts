import { TUNING } from "../../tuning";
import { VEHICLE_TOP } from "../../world/structures";
import { CAMERA_NEAR, type CameraKnobs } from "../camera-fit";

// The world preview's live camera controls: a slider per camera knob, and the
// knobs written out as they sit in `tuning.ts`, ready to paste back.

export interface KnobRange {
  label: string;
  min: number;
  max: number;
  step: number;
}

// The camera never comes lower than the near plane above the tallest vehicle,
// which passes beneath it.
const LOWEST_CAMERA = VEHICLE_TOP + CAMERA_NEAR;

export const CAMERA_KNOB_RANGES: Record<keyof CameraKnobs, KnobRange> = {
  cameraHeight: { label: "Height", min: LOWEST_CAMERA, max: 18, step: 0.05 },
  cameraFollow: { label: "Follow distance", min: 0, max: 18, step: 0.05 },
  cameraLookAhead: { label: "Look-ahead", min: 0, max: 24, step: 0.05 },
};

export const CAMERA_KNOB_KEYS = Object.keys(CAMERA_KNOB_RANGES) as (keyof CameraKnobs)[];

export const TUNED_CAMERA: CameraKnobs = {
  cameraHeight: TUNING.cameraHeight,
  cameraFollow: TUNING.cameraFollow,
  cameraLookAhead: TUNING.cameraLookAhead,
};

// Rounds away the float noise of slider steps, so 8.55 reads as 8.55.
export function formatKnob(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function tuningSnippet(knobs: CameraKnobs): string {
  return CAMERA_KNOB_KEYS.map((key) => `  ${key}: ${formatKnob(knobs[key])},`).join("\n");
}
