import type { Point } from "@/shared/lib/input";
import type { StandardButton, StandardControls } from "@/shared/lib/gamepad";

/*
 * What each input means for walking, as pure functions: which way the player
 * asks to go (x to the right, y ahead, each -1 to 1, relative to the camera),
 * how fast, and how the camera turns.
 */

export interface Move {
  x: number;
  y: number;
}

export const STILL: Move = { x: 0, y: 0 };

/** Metres per second at a full stick or a held key, and running. */
export const WALK_SPEED = 3.4;
export const RUN_SPEED = 7;

/** A touch stick's reach from where the thumb went down, in CSS pixels. */
export const STICK_RADIUS = 56;
/** Past this share of its reach, a touch stick runs. */
export const STICK_RUN = 0.92;

/** How fast the camera turns: radians per pixel dragged or moved with the pointer locked, and per second at a full stick or a held key. */
export const LOOK = {
  mouse: 0.0055,
  locked: 0.0024,
  touch: 0.008,
  stick: 2.6,
  keys: 1.8,
} as const;

const KEYS_AHEAD = ["KeyW", "ArrowUp"];
const KEYS_BACK = ["KeyS", "ArrowDown"];
const KEYS_LEFT = ["KeyA", "ArrowLeft"];
const KEYS_RIGHT = ["KeyD", "ArrowRight"];
const KEYS_TURN_LEFT = ["KeyQ"];
const KEYS_TURN_RIGHT = ["KeyE"];
export const KEYS_RUN = ["ShiftLeft", "ShiftRight"];
/** The key and the pad button that switch between first and third person. */
export const KEY_VIEW = "KeyV";
export const PAD_VIEW: StandardButton = "View";
/** Every key walking listens to, so the page doesn't also scroll on them. */
export const WALK_KEYS: readonly string[] = [...KEYS_AHEAD, ...KEYS_BACK, ...KEYS_LEFT, ...KEYS_RIGHT, ...KEYS_TURN_LEFT, ...KEYS_TURN_RIGHT, ...KEYS_RUN];

const anyHeld = (held: ReadonlySet<string>, keys: readonly string[]) => keys.some((k) => held.has(k));
const axis = (held: ReadonlySet<string>, minus: readonly string[], plus: readonly string[]) => (anyHeld(held, plus) ? 1 : 0) - (anyHeld(held, minus) ? 1 : 0);

/** Held keys as a move, the same speed every way (a diagonal is no faster). */
export function keyboardMove(held: ReadonlySet<string>): Move {
  const x = axis(held, KEYS_LEFT, KEYS_RIGHT);
  const y = axis(held, KEYS_BACK, KEYS_AHEAD);
  const length = Math.hypot(x, y);
  return length === 0 ? STILL : { x: x / length, y: y / length };
}

export function keyboardRunning(held: ReadonlySet<string>): boolean {
  return anyHeld(held, KEYS_RUN);
}

/** The camera's turn from held keys, -1 (left) to 1. */
export function keyboardTurn(held: ReadonlySet<string>): number {
  return axis(held, KEYS_TURN_LEFT, KEYS_TURN_RIGHT);
}

/** A touch stick's move: from where the thumb went down to where it is, up the screen ahead, reaching full at the stick's rim. */
export function stickMove(start: Point, now: Point, radius = STICK_RADIUS): Move {
  const x = (now.x - start.x) / radius;
  const y = -(now.y - start.y) / radius;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** A pad's move from its left stick (down is positive on the pad, ahead here). */
export function padMove(controls: StandardControls): Move {
  return { x: controls.leftStick.x, y: -controls.leftStick.y };
}

/** A pad runs while its right trigger is held most of the way. */
export function padRunning(controls: StandardControls): boolean {
  return controls.rightTrigger > 0.5;
}

/** Whether anything on a pad is being used, to know a pad was the last input. */
export function padInUse(controls: StandardControls): boolean {
  return (
    Math.hypot(controls.leftStick.x, controls.leftStick.y) > 0 ||
    Math.hypot(controls.rightStick.x, controls.rightStick.y) > 0 ||
    Object.values(controls.buttons).some((b) => b.pressed)
  );
}

/** The walker's speed for a move: how far the stick or keys are pushed, and running. */
export function walkSpeed(move: Move, running: boolean): number {
  const push = Math.min(1, Math.hypot(move.x, move.y));
  return push * (running ? RUN_SPEED : WALK_SPEED);
}

/**
 * Where a move goes in the world, for a camera looking along `yaw` (radians
 * from +z towards +x): its x and z, as a share of the move's speed.
 */
export function moveInWorld(move: Move, yaw: number): { x: number; z: number } {
  const aheadX = Math.sin(yaw);
  const aheadZ = Math.cos(yaw);
  return { x: aheadX * move.y - aheadZ * move.x, z: aheadZ * move.y + aheadX * move.x };
}
