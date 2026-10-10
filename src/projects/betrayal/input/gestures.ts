import type { Point } from "./navigate";

/*
 * Reading what a hand means, as pure functions: whether a press was a tap or a
 * drag, which of two fingers' turn, tilt and zoom have begun, what a tap on a choice does, and
 * which way across the floor a push on the screen moves the camera.
 */

/** A press that moves less than this, in CSS pixels, is a tap or a click, not a drag. */
export const TAP_SLOP = 10;
/** Two fingers zoom once their spread has changed by this share. */
export const PINCH_START = 0.08;
/** Two fingers turn once they have moved sideways together this far, in CSS pixels. */
export const TURN_START = 18;
/** Two fingers tilt once they have moved up or down together this far, in CSS pixels. */
export const TILT_START = 18;

export function isDrag(start: Point, now: Point): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > TAP_SLOP;
}

/** Two fingers' spread and the point between them, on the screen. */
export interface Span {
  spread: number;
  middle: Point;
}

export function spanOf(a: Point, b: Point): Span {
  return { spread: Math.hypot(b.x - a.x, b.y - a.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** Which parts of a two-finger gesture are under way. */
export interface TwoFingerParts {
  turn: boolean;
  tilt: boolean;
  zoom: boolean;
}

export const NO_PARTS: TwoFingerParts = { turn: false, tilt: false, zoom: false };

/**
 * Two fingers turn, tilt and zoom at once: their middle moving sideways
 * turns, moving up and down tilts, and their spread changing zooms. Each part
 * begins once it has passed its own threshold, from where the fingers went
 * down, so a small wobble doesn't leak into the others, and once begun it
 * stays under way until the fingers lift.
 */
export function partsUnderWay(start: Span, now: Span, already: TwoFingerParts): TwoFingerParts {
  return {
    turn: already.turn || Math.abs(now.middle.x - start.middle.x) >= TURN_START,
    tilt: already.tilt || Math.abs(now.middle.y - start.middle.y) >= TILT_START,
    zoom: already.zoom || (start.spread > 0 && Math.abs(Math.log(now.spread / start.spread)) >= PINCH_START),
  };
}

/**
 * What a tap or click on a choice does. A mouse click takes it. A finger's
 * first tap focuses it, to see its route and name before acting, and a tap on
 * the focused choice takes it; with only one choice there is nothing to
 * compare, so one tap does.
 */
export function tapAction(kind: "mouse" | "touch", id: string, focused: string | null, choices: number): "commit" | "focus" {
  return kind === "mouse" || id === focused || choices === 1 ? "commit" : "focus";
}

/**
 * The move across the floor, in scene x and z, that a push on the screen
 * means: `right` along the screen's right and `down` towards its bottom,
 * seen by a camera at angle `yaw` round the vertical (its back direction
 * along the floor being sin and cos of the yaw). Pushing up moves the view
 * away from the camera, into the screen.
 */
export function panOnFloor(right: number, down: number, yaw: number): { x: number; z: number } {
  const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
  return { x: right * cos + down * sin, z: -right * sin + down * cos };
}
