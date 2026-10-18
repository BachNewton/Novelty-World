import type { StandardButton, StandardControls } from "@/shared/lib/gamepad";

/*
 * What each input means for the debug free camera, as pure functions:
 * rising and sinking, and the flying speed, which the wheel or the
 * bumpers step up and down. Moving and looking are walking's own.
 */

/** The key that turns the free camera on and off. */
export const KEY_FLY = "Backslash";

const KEYS_RISE = ["KeyE", "Space"];
const KEYS_SINK = ["KeyQ", "KeyC"];
/** Every key flying listens to beyond walking's, so the page doesn't also scroll on them. */
export const FLY_KEYS: readonly string[] = [...KEYS_RISE, ...KEYS_SINK];

export const PAD_FASTER: StandardButton = "RB";
export const PAD_SLOWER: StandardButton = "LB";

/** Metres per second: where it starts, and how slow and fast the wheel takes it, from a close look at a flower to crossing a range in seconds. */
export const FLY_SPEED = { start: 20, min: 1, max: 5000 } as const;
/** Each notch of the wheel or press of a bumper multiplies the speed by this. */
const SPEED_STEP = 1.25;
/** Held Shift or the right trigger flies this much faster for the moment. */
export const FLY_BOOST = 5;
/** A wheel's notch, in its deltaY. */
const WHEEL_NOTCH = 100;

/** Held keys as a rise (1) or sink (-1). */
export function keyboardRise(held: ReadonlySet<string>): number {
  const rise = KEYS_RISE.some((k) => held.has(k)) ? 1 : 0;
  const sink = KEYS_SINK.some((k) => held.has(k)) ? 1 : 0;
  return rise - sink;
}

/** A pad rises on A and sinks on the left trigger, by how far it is pulled. */
export function padRise(controls: StandardControls): number {
  return (controls.buttons.A.pressed ? 1 : 0) - controls.leftTrigger;
}

/** The speed after some steps up (positive) or down, within its bounds. */
export function steppedSpeed(speed: number, steps: number): number {
  return Math.min(FLY_SPEED.max, Math.max(FLY_SPEED.min, speed * SPEED_STEP ** steps));
}

/** A wheel's turn as steps of speed: rolled up (away) is faster. */
export function wheelSteps(deltaY: number): number {
  return -deltaY / WHEEL_NOTCH;
}
