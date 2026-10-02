import { createRng } from "@/shared/lib/seeded-random";

// A driving vehicle rumbles: each end settles on its springs and springs back,
// quickly and a little, so the traffic looks driven rather than slid. The two
// ends bounce on their own, which tips the vehicle a hair back and forth too.
//
// The whole vehicle moves, wheels and all, and only ever down from where it
// stands: an end settles at most the rumble's drop, so its wheels press that
// little into the road and never lift off it. It never moves across the
// lanes, and the tip only leans the vehicle along the road, so seen head-on
// every point moves straight down by no more than the drop. That stays within
// the surface-detail tolerance, so the rumble never misstates the opening.
export const RUMBLE_DROP = 0.025;

// Each end's bounce is a slower swing with a quicker shiver on top, in hertz.
const SWING_RATE = [4, 6] as const;
const SHIVER_RATE = [9, 13] as const;
const SHIVER_SHARE = 0.3;

interface Bounce {
  swing: number;
  swingPhase: number;
  shiver: number;
  shiverPhase: number;
}

// One vehicle's own rates and phases, so no two vehicles bounce in step.
export interface Rumble {
  front: Bounce;
  back: Bounce;
}

function bounceFrom(next: () => number): Bounce {
  const between = ([low, high]: readonly [number, number]): number => low + (high - low) * next();
  return {
    swing: between(SWING_RATE),
    swingPhase: 2 * Math.PI * next(),
    shiver: between(SHIVER_RATE),
    shiverPhase: 2 * Math.PI * next(),
  };
}

export function rumbleFor(seed: string): Rumble {
  const { next } = createRng(`rumble:${seed}`);
  return { front: bounceFrom(next), back: bounceFrom(next) };
}

// How far an end has settled at `time`, from 0 to the drop.
function settled(bounce: Bounce, time: number): number {
  const wave = (rate: number, phase: number): number => (1 - Math.cos(2 * Math.PI * rate * time + phase)) / 2;
  const share = (1 - SHIVER_SHARE) * wave(bounce.swing, bounce.swingPhase) + SHIVER_SHARE * wave(bounce.shiver, bounce.shiverPhase);
  return RUMBLE_DROP * share;
}

// The vehicle's pose in its own frame (see parts.ts): how far its front has
// settled, and the tip, about the front's bottom edge, that settles its back
// by its own amount `length` behind.
export interface RumblePose {
  drop: number;
  tip: number;
}

export function rumblePose(rumble: Rumble, time: number, length: number): RumblePose {
  const front = settled(rumble.front, time);
  const back = settled(rumble.back, time);
  return { drop: front, tip: Math.asin((front - back) / length) };
}

// Puts a vehicle, drawn in its own frame, in its rumble pose.
export function applyRumble(
  vehicle: { position: { y: number }; rotation: { x: number } },
  pose: RumblePose,
): void {
  vehicle.position.y = -pose.drop;
  vehicle.rotation.x = pose.tip;
}
