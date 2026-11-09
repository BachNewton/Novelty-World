import type { CarLimits, SpeedBand } from "../sim/car-limits";
import { WORLD } from "../sim/tuning";

/*
 * The speed plan along a line (`ideas/traffic-and-racers.md`, "A speed plan for
 * its own car"): the fastest speed at every sample of the line from the car's
 * measured limits on the ground under it (`sim/limits/`), at a share of them.
 * Three passes: the speed each sample's curvature allows on the grip the car
 * holds at that speed; backwards, so the car can brake to every slower sample
 * ahead at its measured braking, less what the bend it is in takes of the
 * tyres; and forwards, so the plan never asks for a speed the car's pull can't
 * reach. Pure arithmetic on a table: no simulation, so a plan costs nothing a
 * frame and every page plans the same.
 */

export interface PacePlan {
  stepM: number;
  /** The planned speed at each sample, metres a second. */
  speeds: Float64Array;
  /** The line's curvature at each sample, radians a metre. */
  curvature: Float64Array;
  /** The least planned speed anywhere a stop isn't planned: what the slowest corner asks. */
  slowestMS: number;
}

/** Nothing in the plan runs faster than this, on a straight with no end. */
const FLAT_OUT_MS = 150;
const KMH_PER_MS = 3.6;
/** How many times the corner speed is settled against the grip at that speed, which grows with downforce. */
const CORNER_SETTLES = 4;
/** Over a crest the car may go this light before the plan slows it: past it the wheels leave the road. */
const MOST_LIGHTNESS = 0.6;

/** The grip in g at a speed, read between the table's points and held flat past its ends. */
function cornerG(limits: CarLimits, speedMS: number): number {
  const kmh = speedMS * KMH_PER_MS;
  const { corner } = limits;
  if (kmh <= corner[0].kmh) return corner[0].g;
  for (let at = 1; at < corner.length; at++) {
    if (kmh > corner[at].kmh) continue;
    const share = (kmh - corner[at - 1].kmh) / (corner[at].kmh - corner[at - 1].kmh);
    return corner[at - 1].g + share * (corner[at].g - corner[at - 1].g);
  }
  return corner[corner.length - 1].g;
}

/** A band's rate at a speed: the band the speed is in, or the nearest end's, or none past the last. */
function bandG(bands: readonly SpeedBand[], speedMS: number, pastEnd: number): number {
  const kmh = speedMS * KMH_PER_MS;
  for (const band of bands) if (kmh >= Math.min(band.fromKmh, band.toKmh) && kmh <= Math.max(band.fromKmh, band.toKmh)) return band.g;
  const slowest = Math.min(...bands.map((band) => Math.min(band.fromKmh, band.toKmh)));
  const fastest = Math.max(...bands.map((band) => Math.max(band.fromKmh, band.toKmh)));
  if (kmh < slowest) return bands.find((band) => Math.min(band.fromKmh, band.toKmh) === slowest)?.g ?? pastEnd;
  if (kmh > fastest) return pastEnd;
  return pastEnd;
}

/** Braking in g at a speed: past the fastest band measured, the fastest band's. */
export const brakingG = (limits: CarLimits, speedMS: number) => bandG(limits.braking, speedMS, limits.braking[0].g);

/** Pull in g at a speed: nothing past the fastest the car reached. */
export const pullG = (limits: CarLimits, speedMS: number) => (speedMS * KMH_PER_MS >= limits.reachedKmh ? 0 : bandG(limits.pull, speedMS, 0));

/**
 * The plan for a line: its curvature at each sample, the limits of the car on the ground under each, the share of those
 * limits the driver plans on, and where along the line the car starts from a standstill.
 */
export interface PlanInputs {
  /** The line's curvature at each sample, radians a metre. */
  curvature: Float64Array;
  /** How sharply the road crests at each sample, radians a metre, positive over a crest; none for a line with no heights. */
  crest?: Float64Array;
  stepM: number;
  limitsAt: (sample: number) => CarLimits;
  /** The share of the car's measured cornering grip the plan uses, and of its braking. */
  cornerShare: number;
  brakeShare?: number;
  /** The tightest turn the car's steering makes at a speed, as a radius: its lock narrows with speed (`sim/car.ts`). */
  tightestRadiusAt?: (speedMS: number) => number;
  /** Where along the line the car starts from a standstill. */
  fromM?: number;
}

/** The plan for a line: its curvature at each sample, the limits of the car on the ground under each, the shares of those limits the driver plans on. */
export function planSpeeds({ curvature, crest, stepM, limitsAt, cornerShare, brakeShare = cornerShare, tightestRadiusAt, fromM = 0 }: PlanInputs): PacePlan {
  const count = curvature.length;
  const g = WORLD.gravity;
  /** How much of its weight the car keeps on its wheels at a speed over a sample: lighter over a crest. */
  const weightOn = (at: number, speed: number) => Math.max(0, 1 - ((crest?.[at] ?? 0) * speed * speed) / g);
  const speeds = new Float64Array(count);
  // The speed each bend allows on the grip the car holds at that speed, and no lighter over a crest than the wheels stay down.
  for (let at = 0; at < count; at++) {
    const limits = limitsAt(at);
    const bend = curvature[at];
    let speed = FLAT_OUT_MS;
    if (bend > 1e-6) {
      speed = Math.sqrt((cornerG(limits, 0) * g * cornerShare) / bend);
      for (let settle = 0; settle < CORNER_SETTLES; settle++) speed = Math.sqrt((cornerG(limits, speed) * g * cornerShare * weightOn(at, speed)) / bend);
    }
    const rise = crest?.[at] ?? 0;
    if (rise > 1e-6) speed = Math.min(speed, Math.sqrt((MOST_LIGHTNESS * g) / rise));
    // And no faster than the steering can turn this tight: the lock narrows with speed, so the fastest speed that still turns the bend.
    if (tightestRadiusAt && bend > 1e-6) speed = Math.min(speed, fastestTurning(tightestRadiusAt, 1 / bend, speed));
    speeds[at] = Math.min(FLAT_OUT_MS, speed);
  }
  // Backwards: brake for every slower sample ahead, with what the bend there leaves of the tyres.
  for (let at = count - 2; at >= 0; at--) {
    const next = speeds[at + 1];
    const limits = limitsAt(at + 1);
    const lateral = (next * next * curvature[at + 1]) / Math.max(cornerG(limits, next) * g * cornerShare, 1e-6);
    const room = Math.sqrt(Math.max(0, 1 - Math.min(1, lateral) ** 2));
    const braking = brakingG(limits, next) * g * brakeShare * room * weightOn(at + 1, next);
    speeds[at] = Math.min(speeds[at], Math.sqrt(next * next + 2 * braking * stepM));
  }
  // Forwards: no faster than the car's pull gets it from a standstill at the start, the sample at or before it, with
  // what the bend leaves of the tyres: out of a corner the throttle comes in as the steering unwinds, not before.
  const start = Math.max(0, Math.min(count - 1, Math.floor(fromM / stepM)));
  speeds[start] = 0;
  for (let at = start + 1; at < count; at++) {
    const last = speeds[at - 1];
    const limits = limitsAt(at - 1);
    const lateral = (last * last * curvature[at - 1]) / Math.max(cornerG(limits, last) * g * cornerShare, 1e-6);
    const room = Math.sqrt(Math.max(0, 1 - Math.min(1, lateral) ** 2));
    // Pull is the whole engine's, not a share of it: a driver at ease still uses full throttle on a straight.
    const pull = pullG(limits, last) * g * room;
    speeds[at] = Math.min(speeds[at], Math.sqrt(last * last + 2 * pull * stepM));
  }
  let slowest = FLAT_OUT_MS;
  for (let at = start + 1; at < count; at++) if (speeds[at] > 0.5) slowest = Math.min(slowest, speeds[at]);
  return { stepM, speeds, curvature, slowestMS: slowest };
}

/** The fastest speed, up to `most`, at which the steering still turns a radius: the tightest turn opens with speed, so it is found by halving. */
function fastestTurning(tightestRadiusAt: (speedMS: number) => number, radius: number, most: number): number {
  if (tightestRadiusAt(most) <= radius) return most;
  let low = 0;
  let high = most;
  for (let halving = 0; halving < 24; halving++) {
    const middle = (low + high) / 2;
    if (tightestRadiusAt(middle) <= radius) low = middle;
    else high = middle;
  }
  return low;
}

/** The planned speed a distance along the line, between samples. */
export function plannedSpeedAt(plan: PacePlan, alongM: number): number {
  const place = alongM / plan.stepM;
  const before = Math.max(0, Math.min(plan.speeds.length - 1, Math.floor(place)));
  const after = Math.min(plan.speeds.length - 1, before + 1);
  const share = Math.max(0, Math.min(1, place - before));
  return plan.speeds[before] + share * (plan.speeds[after] - plan.speeds[before]);
}

/** The slowest the plan asks for over a stretch ahead: what a driver holds its speed under. */
export function slowestAhead(plan: PacePlan, fromM: number, toM: number): number {
  let slowest = plannedSpeedAt(plan, fromM);
  for (let at = Math.ceil(fromM / plan.stepM); at <= Math.floor(toM / plan.stepM) && at < plan.speeds.length; at++) slowest = Math.min(slowest, plan.speeds[at]);
  return Math.min(slowest, plannedSpeedAt(plan, toM));
}
