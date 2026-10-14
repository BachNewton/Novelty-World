// Moving a focus round a screen's controls by controller, pure: which way a
// pad points this frame (its d-pad, or its left stick held past a threshold),
// when a held way moves the focus again, and which control a move lands on.
// The DOM side is `pad-focus.ts`.

import { readPad, DEFAULT_DEADZONE, type PadSnapshot } from "./state";

/** A control's box on the screen, in CSS pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Direction = "up" | "down" | "left" | "right";

const middleY = (box: Box) => (box.top + box.bottom) / 2;
const middleX = (box: Box) => (box.left + box.right) / 2;
/** Two controls share a row when either's middle lies within the other's height. */
const sameRow = (a: Box, b: Box) => (middleY(a) > b.top && middleY(a) < b.bottom) || (middleY(b) > a.top && middleY(b) < a.bottom);

/**
 * Where a controller's d-pad moves the focus among controls laid out on the
 * screen (a panel's buttons, in rows): left and right go to the nearest
 * control along the same row, up and down to the nearest row above or below,
 * and in it to the control nearest across. Null at an edge: nothing wraps.
 */
export function nextInDirection(boxes: readonly Box[], from: number, direction: Direction): number | null {
  const here = boxes[from];
  const indexed = boxes.map((box, index) => ({ box, index })).filter(({ index }) => index !== from);
  const nearest = (candidates: typeof indexed, distance: (box: Box) => number) =>
    candidates.reduce<(typeof indexed)[number] | null>((best, candidate) => (best === null || distance(candidate.box) < distance(best.box) ? candidate : best), null)?.index ?? null;
  if (direction === "left" || direction === "right") {
    const sign = direction === "right" ? 1 : -1;
    const along = indexed.filter(({ box }) => sameRow(box, here) && (middleX(box) - middleX(here)) * sign > 0);
    return nearest(along, (box) => Math.abs(middleX(box) - middleX(here)));
  }
  const sign = direction === "down" ? 1 : -1;
  const beyond = indexed.filter(({ box }) => !sameRow(box, here) && (middleY(box) - middleY(here)) * sign > 0);
  const row = nearest(beyond, (box) => Math.abs(middleY(box) - middleY(here)));
  if (row === null) return null;
  return nearest(
    beyond.filter(({ box }) => sameRow(box, boxes[row])),
    (box) => Math.abs(middleX(box) - middleX(here)),
  );
}

/** How far a stick, past its deadzone, must tilt along an axis to hold that
 *  way, and how far back it must come to let go: two thresholds, so a stick
 *  resting near one doesn't chatter between held and let go. */
export interface StickThresholds {
  press: number;
  release: number;
}

/**
 * Which way one axis holds: the d-pad's way if one of its two is pressed,
 * or the stick's once it tilts past the press threshold, kept until it
 * comes back inside the release threshold.
 */
export function axisWay<W extends string>(
  stick: number,
  negativePad: boolean,
  positivePad: boolean,
  [negative, positive]: readonly [W, W],
  was: W | null,
  { press, release }: StickThresholds,
): W | null {
  if (negativePad !== positivePad) return negativePad ? negative : positive;
  const beyond = (way: W): number => (was === way ? release : press);
  if (stick <= -beyond(negative)) return negative;
  if (stick >= beyond(positive)) return positive;
  return null;
}

export interface NavTuning extends StickThresholds {
  deadzone: number;
  /** Milliseconds from a direction's press to its first repeat. */
  delay: number;
  /** Milliseconds between repeats after that. */
  interval: number;
}

/** A menu's feel: the stick as play reads it, and a held way repeating like
 *  a held key, a beat after the press and then a few steps a second. */
export const NAV_TUNING: NavTuning = { deadzone: DEFAULT_DEADZONE, press: 0.5, release: 0.35, delay: 400, interval: 120 };

/** What one pad is pointing, between frames. */
export interface NavHold {
  x: "left" | "right" | null;
  y: "up" | "down" | null;
  /** The way the focus moves while held: one of the axes' ways, or none. */
  direction: Direction | null;
  /** When the held direction next moves the focus, in milliseconds. */
  nextAt: number;
}

export const NAV_AT_REST: NavHold = { x: null, y: null, direction: null, nextAt: 0 };

/**
 * One frame of a pad pointing round a menu, at `now` milliseconds: the d-pad
 * or the left stick (the d-pad winning on its axis), and whether the focus
 * moves this frame. A new way moves at once, and a held way again after the
 * delay, then every interval. Pointing two ways at once, the way held longer
 * keeps moving, and a way just added takes over; letting go of the moving
 * way leaves the other to repeat after a delay. A missing pad (one that
 * disconnected), or one whose layout isn't standard, points nowhere.
 */
export function navStep(prev: NavHold, pad: PadSnapshot | null, now: number, tuning: NavTuning = NAV_TUNING): { hold: NavHold; move: Direction | null } {
  const controls = pad === null ? null : readPad(pad, { deadzone: tuning.deadzone }).controls;
  if (controls === null) return { hold: NAV_AT_REST, move: null };
  const { buttons, leftStick } = controls;
  // Up is negative on a stick.
  const x = axisWay(leftStick.x, buttons.DpadLeft.pressed, buttons.DpadRight.pressed, ["left", "right"], prev.x, tuning);
  const y = axisWay(leftStick.y, buttons.DpadUp.pressed, buttons.DpadDown.pressed, ["up", "down"], prev.y, tuning);
  const fresh = [y !== prev.y ? y : null, x !== prev.x ? x : null].find((way) => way !== null) ?? null;
  const direction = fresh ?? (prev.direction !== null && (prev.direction === x || prev.direction === y) ? prev.direction : (y ?? x));
  if (direction === null) return { hold: { x, y, direction, nextAt: 0 }, move: null };
  // A way left held as the other lets go waits a repeat's delay: it was
  // already held, so it isn't a new press.
  if (direction !== prev.direction) return { hold: { x, y, direction, nextAt: now + tuning.delay }, move: fresh };
  if (now >= prev.nextAt) return { hold: { x, y, direction, nextAt: now + tuning.interval }, move: direction };
  return { hold: { x, y, direction, nextAt: prev.nextAt }, move: null };
}
