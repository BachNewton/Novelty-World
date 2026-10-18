import type { Leader } from "./companions";

/*
 * A hedgehog companion rides in Elliott's basket: its legs are short, so it
 * follows on foot only while Elliott ambles about, and on a long walk, a
 * run, a hop or a glide it hops up into the basket and rides there curled,
 * peeking out. Once Elliott has stood still on the ground a little while it
 * hops down beside them and snuffles about again. The hop is seen: it is an
 * arc from the ground to the basket and back, never a vanishing.
 */

export type RidePhase = "walking" | "hopping-in" | "riding" | "hopping-out";

export interface Ride {
  phase: RidePhase;
  /** When the phase began, in seconds of the animals' clock. */
  since: number;
  /** Where a hop down lands. */
  landing: { x: number; z: number } | null;
  /** How long Elliott has been on the move without a real stop, and how long still, in seconds. */
  moving: number;
  still: number;
}

export const RIDE = {
  /** How near Elliott it must be to hop up, in metres. */
  reach: 8,
  /** How long a hop up or down takes, in seconds. */
  hop: 0.7,
  /** How long Elliott walks on before it would rather ride, and how long they stand still before it gets down, in seconds. */
  longWalk: 6,
  getDown: 2.5,
  /** Faster than this, in metres a second, Elliott is running. */
  running: 4.2,
  /** A stop shorter than this doesn't end a walk, in seconds. */
  pause: 1.5,
} as const;

export function walkingRide(time = 0): Ride {
  return { phase: "walking", since: time, landing: null, moving: 0, still: 0 };
}

/** Riding from the start: a hedgehog that was already in the basket when the walk was loaded, or that comes along from camp. */
export function ridingRide(time = 0): Ride {
  return { phase: "riding", since: time, landing: null, moving: 0, still: 0 };
}

/** Whether it is in the basket or on its way in or out: its body isn't stepped on the ground. */
export const offTheGround = (ride: Ride) => ride.phase !== "walking";

/**
 * One step of the ride: Elliott's pace and whether they are aloft, how far
 * the hedgehog is from them, and where it would land beside them if it got
 * down now.
 */
export function stepRide(ride: Ride, leader: Leader, distance: number, beside: { x: number; z: number }, time: number, seconds: number): Ride {
  const onTheMove = leader.aloft || leader.speed > 0.4;
  const still = onTheMove ? 0 : ride.still + seconds;
  const moving = onTheMove ? ride.moving + seconds : still > RIDE.pause ? 0 : ride.moving;
  const next = { ...ride, still, moving };
  const elapsed = time - ride.since;
  switch (ride.phase) {
    case "walking": {
      const wantsUp = leader.aloft || leader.speed > RIDE.running || moving > RIDE.longWalk;
      return wantsUp && distance < RIDE.reach ? { ...next, phase: "hopping-in", since: time, landing: null } : next;
    }
    case "hopping-in":
      return elapsed >= RIDE.hop ? { ...next, phase: "riding", since: time } : next;
    case "riding":
      return !leader.aloft && still > RIDE.getDown ? { ...next, phase: "hopping-out", since: time, landing: beside } : next;
    case "hopping-out":
      return elapsed >= RIDE.hop ? { ...next, phase: "walking", since: time, landing: null } : next;
  }
}

/** How far along its hop it is, 0 to 1, eased, and how high over the straight line between the ends it rises, in metres. */
export function hopAt(ride: Ride, time: number): { along: number; lift: number } {
  const t = Math.min(1, Math.max(0, (time - ride.since) / RIDE.hop));
  return { along: t * t * (3 - 2 * t), lift: Math.sin(Math.PI * t) * 0.45 };
}
