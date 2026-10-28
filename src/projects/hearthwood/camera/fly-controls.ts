import type { StandardButton, StandardControls } from "@/shared/lib/gamepad";

/*
 * What each input means for the free camera, as pure functions: moving,
 * rising and sinking, looking, and the flying speed, which the wheel or the
 * bumpers step up and down.
 */

const KEYS_AHEAD = ["KeyW", "ArrowUp"];
const KEYS_BACK = ["KeyS", "ArrowDown"];
const KEYS_LEFT = ["KeyA", "ArrowLeft"];
const KEYS_RIGHT = ["KeyD", "ArrowRight"];
const KEYS_RISE = ["KeyE", "Space"];
const KEYS_SINK = ["KeyQ", "KeyC"];
const KEYS_BOOST = ["ShiftLeft", "ShiftRight"];
/** Every key flying listens to, so the page doesn't also scroll on them. */
export const FLY_KEYS: readonly string[] = [...KEYS_AHEAD, ...KEYS_BACK, ...KEYS_LEFT, ...KEYS_RIGHT, ...KEYS_RISE, ...KEYS_SINK, ...KEYS_BOOST];

export const PAD_FASTER: StandardButton = "RB";
export const PAD_SLOWER: StandardButton = "LB";

/** How fast the camera turns: radians per pixel moved with the pointer locked, and per second at a full stick. */
export const LOOK = { locked: 0.0024, stick: 2.4 } as const;

/** Metres per second: where it starts, and how slow and fast the wheel takes it, from a close look at a flower to crossing a range in seconds. */
export const FLY_SPEED = { start: 20, min: 1, max: 5000 } as const;
/** Each notch of the wheel or press of a bumper multiplies the speed by this. */
const SPEED_STEP = 1.25;
/** Held Shift or the right trigger flies this much faster for the moment. */
export const FLY_BOOST = 5;
/** A wheel's notch, in its deltaY. */
const WHEEL_NOTCH = 100;

const anyHeld = (held: ReadonlySet<string>, keys: readonly string[]) => keys.some((k) => held.has(k));
const axis = (held: ReadonlySet<string>, minus: readonly string[], plus: readonly string[]) => (anyHeld(held, plus) ? 1 : 0) - (anyHeld(held, minus) ? 1 : 0);

/** Held keys as a move, x to the right and y ahead, the same speed every way (a diagonal is no faster). */
export function keyboardMove(held: ReadonlySet<string>): { x: number; y: number } {
  const x = axis(held, KEYS_LEFT, KEYS_RIGHT);
  const y = axis(held, KEYS_BACK, KEYS_AHEAD);
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** Held keys as a rise (1) or sink (-1). */
export function keyboardRise(held: ReadonlySet<string>): number {
  return axis(held, KEYS_SINK, KEYS_RISE);
}

export function keyboardBoost(held: ReadonlySet<string>): boolean {
  return anyHeld(held, KEYS_BOOST);
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
