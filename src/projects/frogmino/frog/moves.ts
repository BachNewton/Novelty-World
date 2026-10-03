import { tickTiming, toSeconds } from "../ticks";
import type { Tuning } from "../tuning";

// The drawn frog's everyday moves, the jumps forward and back and the slides
// left and right, as pure functions of how far through a move it is, from 0
// to 1, shared by the scene and the frog preview. Each move is a small hop:
// the frog glides from where it was drawn to its new place, and rises a
// little and comes down again on the way.

// How high a move's hop rises, in cells: a hint of a hop, since moves are the
// game's most frequent actions.
export const MOVE_HOP_HEIGHT = 0.14;

// A move takes as long as a held key's repeat, in the rules' whole ticks, so
// held moves chain: each one lands just as the next takes off, and a held
// jump flows on without a stop.
export function moveDuration(tuning: Tuning): number {
  return toSeconds(tickTiming(tuning).holdRepeat);
}

export function moveProgress(seconds: number, duration: number): number {
  return Math.min(1, Math.max(0, seconds / duration));
}

// How far along its way a move has carried the frog: setting off and
// settling gently, fastest in the middle of its hop. Chained moves meet at
// rest, so a held jump flows from one into the next without a jolt.
export function glide(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

// How high a move's hop has the frog: a sine arc, up and down again as the
// move ends. Chained hops bounce from one into the next.
export function moveHopLift(progress: number): number {
  return progress >= 1 ? 0 : MOVE_HOP_HEIGHT * Math.sin(Math.PI * progress);
}
