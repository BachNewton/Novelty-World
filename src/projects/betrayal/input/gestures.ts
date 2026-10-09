import type { Point } from "./navigate";

/*
 * Reading what a hand means, as pure functions: whether a press was a tap or a
 * drag, whether two fingers pinch, twist or tilt, what a tap on a choice does, and
 * which way across the floor a push on the screen moves the camera.
 */

/** A press that moves less than this, in CSS pixels, is a tap or a click, not a drag. */
export const TAP_SLOP = 10;
/** Two fingers are pinching once their spread has changed by this share. */
export const PINCH_START = 0.08;
/** Two fingers are twisting once the line between them has turned this far, in radians. */
export const TWIST_START = (12 * Math.PI) / 180;
/** Two fingers are tilting once they have moved up or down together this far, in CSS pixels. */
export const TILT_START = 18;

export function isDrag(start: Point, now: Point): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > TAP_SLOP;
}

/** Two fingers' spread, the angle of the line between them, and the point between them, on the screen. */
export interface Span {
  spread: number;
  angle: number;
  middle: Point;
}

export function spanOf(a: Point, b: Point): Span {
  return { spread: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** How far a line on the screen has turned from `from` to `to`, in radians,
 *  the short way round: positive is clockwise on the screen. */
export function turnBetween(from: number, to: number): number {
  const turn = (to - from) % (Math.PI * 2);
  return turn > Math.PI ? turn - Math.PI * 2 : turn < -Math.PI ? turn + Math.PI * 2 : turn;
}

export type TwoFingerGesture = "pending" | "pinch" | "twist" | "tilt";

/**
 * What two fingers are doing, from where they started: a pinch once their
 * spread has changed enough, a twist once the line between them has turned
 * enough, a tilt once they have moved up or down together enough, and
 * pending until then. Whichever passes its threshold by the largest share
 * decides, and the gesture keeps it, so zooming never orbits or tilts too.
 */
export function classifyTwoFinger(start: Span, now: Span): TwoFingerGesture {
  if (start.spread === 0) return "pending";
  const scores: [TwoFingerGesture, number][] = [
    ["pinch", Math.abs(Math.log(now.spread / start.spread)) / PINCH_START],
    ["twist", Math.abs(turnBetween(start.angle, now.angle)) / TWIST_START],
    ["tilt", Math.abs(now.middle.y - start.middle.y) / TILT_START],
  ];
  const [gesture, score] = scores.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return score < 1 ? "pending" : gesture;
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
