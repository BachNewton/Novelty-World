import { FROG_THICKNESS } from "../run";
import { DECK_LENGTH, DECK_TOP } from "../world/structures";

// The drawn frog's two set pieces, each a pure function of how far through it
// is, from 0 to 1: the leap off the overpass to the road at the start, and
// the leap from the spring pad onto the finish gantry's deck. Depths run
// forward along the course, and levels and heights up from the road, in the
// scene's units.

// Where a set piece began: the drawn frog's depth, and the ground under it.
export interface LeapStart {
  fromDepth: number;
  fromLevel: number;
}

export interface LeapPose {
  depth: number;
  // The level the camera rides above: the ground under the frog, and through
  // a set piece a smooth path from one ground to the other.
  level: number;
  // How high the frog's feet are.
  height: number;
  // How far the frog has turned about its upright axis, in radians.
  spin: number;
}

// The drop leaps this high above the deck at the top of its arc.
const DROP_PEAK = 3;
// The camera rides the drop's arc, this much lower at its middle: it rises a
// little with the frog, keeping it in view, rather than swooping with it.
const DROP_CAMERA_DIP = 2;

// The finish leap springs back and up from the spring pad, clear of the
// gantry's near face, and comes down in the middle of its deck.
const LEAP_BACK = 1.5;
const LEAP_PEAK = DECK_TOP + 3;

export const FULL_TURN = 2 * Math.PI;

const lerp = (from: number, to: number, t: number): number => (1 - t) * from + t * to;

// How far through a set piece `duration` seconds long is, `seconds` into it.
export function leapProgress(seconds: number, duration: number): number {
  return Math.min(1, seconds / duration);
}

// The drop off the overpass, `progress` of the way down to the road at
// `toDepth`: a big leap off the deck, up along a falling body's arc and
// down onto the road, sweeping forward fastest in the middle and gently at
// either end, so the camera following it glides forward over the deck.
export function dropPose(start: LeapStart, toDepth: number, progress: number): LeapPose {
  const { fromLevel } = start;
  // The parabola from the deck through the peak to the road.
  const fall = fromLevel + 2 * DROP_PEAK + 2 * Math.sqrt(DROP_PEAK * (fromLevel + DROP_PEAK));
  const height = fromLevel + (fall - fromLevel) * progress - fall * progress ** 2;
  return {
    depth: lerp(start.fromDepth, toDepth, (1 - Math.cos(Math.PI * progress)) / 2),
    level: height - DROP_CAMERA_DIP * Math.sin(Math.PI * progress),
    height,
    spin: 0,
  };
}

// The frog's one celebratory turn over the finish leap, fast off the pad and
// easing into the landing.
export function finishLeapSpin(progress: number): number {
  return FULL_TURN * (1 - (1 - progress) ** 2);
}

// Where the frog stands on the finish gantry's deck, whose near face is over
// the finish line: in the middle of it.
export function gantryStand(finishLine: number): number {
  return finishLine + DECK_LENGTH / 2 + FROG_THICKNESS / 2;
}

// The finish leap, `progress` of the way onto the gantry's deck over the
// finish line at `finishLine`: along a curve that swings back and up clear of
// the deck's near face, then forward onto it.
export function finishLeapPose(start: LeapStart, finishLine: number, progress: number): LeapPose {
  const bezier = (from: number, via: number, to: number): number =>
    (1 - progress) ** 2 * from + 2 * progress * (1 - progress) * via + progress ** 2 * to;
  return {
    depth: bezier(start.fromDepth, finishLine - LEAP_BACK, gantryStand(finishLine)),
    level: lerp(start.fromLevel, DECK_TOP, progress),
    height: bezier(start.fromLevel, LEAP_PEAK, DECK_TOP),
    spin: finishLeapSpin(progress),
  };
}
