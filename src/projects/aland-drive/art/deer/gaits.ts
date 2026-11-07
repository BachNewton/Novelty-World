/*
 * How a roe deer moves, as numbers the shader reads (`material.ts`): each gait is a
 * cycle of the four legs, each leg on the ground for a share of it from its own
 * offset, swinging through an arc and folding at its knee or hock while it's off,
 * with the body's rise and pitch and the neck's carriage over the cycle.
 *
 * - Standing alert: square on its legs, the neck up and the head level, ears
 *   forward, turning slowly to look.
 * - Walk: four beats, each hind foot followed by the front on its side.
 * - Trot: diagonal pairs, the neck lower, a little bounce.
 * - Bound: the hind pair drives and the front pair lands, with a long flight after
 *   the drive, the body pitching nose up then down: the roe's escape.
 */

export const GAITS = ["stand", "walk", "trot", "bound"] as const;
export type Gait = (typeof GAITS)[number];

interface GaitShape {
  /** The share of the cycle a foot is on the ground. */
  stance: number;
  /** How far a leg swings either side of upright, in radians. */
  swing: number;
  /** How far a front knee and a hind hock fold while the foot is off the ground. */
  foldFront: number;
  foldHind: number;
  /** Where in the cycle each foot comes down: front left, front right, hind left, hind right, in turns. */
  offsets: readonly [number, number, number, number];
  /** The body's dip twice a cycle, a step on each side, in metres. */
  bob: number;
  /** The body's rise once a cycle in flight, in metres, highest at `liftAt` turns. */
  lift: number;
  liftAt: number;
  /** The body's pitch once a cycle, nose up at `pitchAt` turns, in radians. */
  pitch: number;
  pitchAt: number;
  /** The neck raised above its rest, the head's nod twice a cycle and the head's own pitch, in radians. */
  neck: number;
  nod: number;
  head: number;
  /** How much the head turns about of its own accord, standing. */
  wander: number;
  /** Metres covered in a cycle, so feet keep pace with the ground: none for standing. */
  strideM: number;
  /** Cycles a second at the gait's own speed. */
  rate: number;
}

export const GAIT_SHAPES: Record<Gait, GaitShape> = {
  stand: { stance: 1, swing: 0, foldFront: 0, foldHind: 0, offsets: [0, 0, 0, 0], bob: 0, lift: 0, liftAt: 0, pitch: 0, pitchAt: 0, neck: 0.26, nod: 0, head: -0.14, wander: 1, strideM: 0, rate: 0.12 },
  walk: { stance: 0.64, swing: 0.27, foldFront: 0.95, foldHind: 0.75, offsets: [0.25, 0.75, 0, 0.5], bob: 0.012, lift: 0, liftAt: 0, pitch: 0.02, pitchAt: 0.1, neck: -0.06, nod: 0.06, head: 0.04, wander: 0, strideM: 0.95, rate: 1.1 },
  trot: { stance: 0.42, swing: 0.4, foldFront: 1.25, foldHind: 0.95, offsets: [0, 0.5, 0.52, 0.02], bob: 0.028, lift: 0, liftAt: 0, pitch: 0.025, pitchAt: 0.2, neck: 0.04, nod: 0.03, head: -0.02, wander: 0, strideM: 1.5, rate: 2.2 },
  bound: { stance: 0.27, swing: 0.72, foldFront: 1.7, foldHind: 1.3, offsets: [0.44, 0.5, 0, 0.06], bob: 0, lift: 0.2, liftAt: 0.3, pitch: 0.24, pitchAt: 0.95, neck: -0.04, nod: 0.1, head: 0.02, wander: 0, strideM: 3.8, rate: 2.6 },
};

/** A gait's own speed, metres a second, which a mover moves a deer at. */
export const gaitSpeed = (gait: Gait) => GAIT_SHAPES[gait].strideM * GAIT_SHAPES[gait].rate;

/** The shader's table: five vec4 rows a gait, in `GAITS`' order. */
export const GAIT_ROWS = 5;
export function gaitTable(): [number, number, number, number][] {
  return GAITS.flatMap((gait) => {
    const g = GAIT_SHAPES[gait];
    return [
      [g.stance, g.swing, g.foldFront, g.foldHind],
      [...g.offsets],
      [g.bob, g.lift, g.liftAt, g.pitch],
      [g.pitchAt, g.neck, g.nod, g.head],
      [g.wander, 0, 0, 0],
    ] as [number, number, number, number][];
  });
}

/** What the year does to a roe deer's look, each 0 to 1. */
export interface DeerSeason {
  /** The winter coat's share over the summer's red. */
  winter: number;
  /** A buck's antlers grown, 1 clean and hard; less is in velvet, 0 cast. */
  antlers: number;
  /** A kid's spots. */
  spots: number;
}

const ramp = (day: number, from: number, to: number) => Math.min(1, Math.max(0, (day - from) / (to - from)));

/**
 * The season by day of the year (1 January is 0), from Nordic roe deer: the red summer coat moulted in through May and
 * out through September, antlers cast in November and December and grown again in velvet over the winter, clean by
 * April, and kids born in late May and June whose spots fade by early September.
 */
export function seasonOf(day: number): DeerSeason {
  const winter = day < 120 ? 1 : day < 155 ? 1 - ramp(day, 120, 155) : day < 245 ? 0 : day < 285 ? ramp(day, 245, 285) : 1;
  const antlers = day < 100 ? 0.1 + 0.9 * ramp(day, 0, 100) : day < 305 ? 1 : day < 335 ? 1 - ramp(day, 305, 335) : 0.1 * ramp(day, 335, 365);
  const spots = day < 145 ? 0 : day < 215 ? 1 : 1 - ramp(day, 215, 250);
  return { winter, antlers, spots };
}

export const SUMMER: DeerSeason = { winter: 0, antlers: 1, spots: 1 };
