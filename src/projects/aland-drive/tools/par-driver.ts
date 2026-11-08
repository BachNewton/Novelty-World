// The scripted driver that sets par, shared by the challenge and race par tools: a challenge driven alone in the
// simulation, in its own car, from the first player's start place, held on the handbrake through the countdown, through
// the challenge's own rules (`challenge/run.ts`). One core, no browser, no network.
//
// The driver goes flat out wherever the bends allow and brakes for each bend as late as a share of the car's own grip
// on the ground under it allows (`sim/limits/`, dry), the boldest share it gets round at.

import { runOn } from "../challenge/line";
import { advanceRun, lineAt, linesOf, startRun, type ChallengeRun } from "../challenge/run";
import type { Challenge } from "../challenge/types";
import type { WorldManifest } from "../render/tile";
import { Autopilot, type SpeedPlan } from "../sim/autopilot";
import { NO_INPUT } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import { speedOf } from "../sim/car-state";
import type { CarId } from "../sim/cars";
import { Drive } from "../sim/drive";
import type { RoadLine } from "../sim/road-net";
import { STEP_S, WORLD } from "../sim/tuning";
import type { World } from "../sim/world";

const FLAT_OUT_MS = 150;
/**
 * The driver corners and brakes at all of the car's measured grip on the ground under it. That grip was measured on a
 * flat pad, so a crest, a camber or a rough track can ask for less: where the driver loses the road or stops, the run
 * starts again with the grip eased round that spot alone, until it gets there. So one bad bend slows par only there.
 */
const EASE_BY = 0.85;
const LEAST_SHARE = 0.3;
/** Round a spot where the driver lost it: mostly before it, where the braking for it happens. */
const EASE_BEFORE_M = 150;
const EASE_AFTER_M = 40;
const MOST_TRIES = 30;
/** How finely the ground along a route is read. */
const GROUND_STEP_M = 8;
/** Past the finish, so the driver doesn't turn for the line's last point as it gets there. */
const RUN_ON_M = 150;
/** The ground is loaded this far round the car, and the tiles under it must have their detail. */
const GROUND_REACH_M = 400;
const LOST_M = 30;
/** A line counts as missed once the driver is this far past it along its way. */
const MISSED_M = 40;
/** A line belongs to a stretch of the driver's way running within this of its heading, not one crossing it or back along it. */
const SAME_WAY_COSINE = 0.5;
/** A pass this near a line is the way's own past it; once the way is this much further off again, it has gone on. */
const NEAR_LINE_M = 20;
const PASSED_LINE_M = 50;
const STOPPED_MS = 0.3;
const GIVE_UP_STOPPED_S = 10;
/** The longest a run may take: ten minutes, and a minute more for every 600 m past the first 6 km. */
const LONGEST_S = 600;
const SLOWEST_MS = 10;
const PROFILE_EVERY_M = 100;

/** A stretch of the route driven at a share of the grip: on a circuit, the same stretch every lap, counted along the first. */
export interface Eased {
  from: number;
  to: number;
  share: number;
}

const inSpot = ({ from, to }: Eased, along: number, lapM?: number) => {
  if (lapM === undefined) return along >= from && along <= to;
  const onLap = ((along % lapM) + lapM) % lapM;
  return [onLap - lapM, onLap, onLap + lapM].some((each) => each >= from && each <= to);
};

export function tilesNear(manifest: WorldManifest, line: RoadLine): Set<string> {
  const names = new Set<string>();
  for (let along = 0; along <= line.length; along += GROUND_REACH_M / 2) {
    const { x, z } = line.at(along);
    for (const { name, west, north } of manifest.tiles) {
      if (x >= west - GROUND_REACH_M && x < west + manifest.tileM + GROUND_REACH_M && -z <= north + GROUND_REACH_M && -z > north - manifest.tileM - GROUND_REACH_M) names.add(name);
    }
  }
  return names;
}

/**
 * The grip on the ground under each stretch of the line, for this car: its carriageway's surface,
 * asphalt or gravel as the road is laid, and the limits table's least grip there, dry, cornering and braking.
 */
function speedPlan(car: CarId, line: RoadLine, world: World, eased: readonly Eased[], lapM?: number): SpeedPlan {
  const least = (bands: readonly { g: number }[]) => Math.min(...bands.map(({ g }) => g)) * WORLD.gravity;
  const grips = { asphalt: limitsOn(car, "dry", "asphalt"), gravel: limitsOn(car, "dry", "gravel") };
  const grip = {
    asphalt: { cornerMS2: least(grips.asphalt.corner), brakeMS2: least(grips.asphalt.braking) },
    gravel: { cornerMS2: least(grips.gravel.corner), brakeMS2: least(grips.gravel.braking) },
  };
  const stretches: (typeof grip.asphalt)[] = [];
  for (let along = 0; along <= line.length + RUN_ON_M + GROUND_STEP_M; along += GROUND_STEP_M) {
    const { x, z } = line.at(Math.min(along, line.length));
    stretches.push(world.roads.nearest(x, z)?.paved === false ? grip.gravel : grip.asphalt);
  }
  const shareAt = (along: number) => eased.find((spot) => inSpot(spot, along, lapM))?.share ?? 1;
  return {
    gripAt: (along) => {
      const { cornerMS2, brakeMS2 } = stretches[Math.max(0, Math.min(stretches.length - 1, Math.round(along / GROUND_STEP_M)))];
      const share = shareAt(along);
      return { cornerMS2: cornerMS2 * share, brakeMS2: brakeMS2 * share };
    },
    leastBrakeMS2: Math.min(grip.asphalt.brakeMS2, grip.gravel.brakeMS2) * Math.min(1, ...eased.map(({ share }) => share)),
  };
}

export interface Measured {
  par: number;
  simS: number;
  profile: string[];
}

/**
 * Par at one share of the car's grip, or why the driver didn't get there. The challenge must be one it can't lose,
 * and `line` is the way it drives, from its start; `from` is how far along that the car starts.
 */
function measure(challenge: Challenge, line: RoadLine, from: number, world: World, eased: readonly Eased[], profiled: boolean, lapM?: number, shortestLookM?: number): Measured | { failed: string; along: number } {
  const [place] = challenge.starts;
  const road = world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${challenge.id}: no road at the start`);
  const drive = new Drive(world, { ...road, x: place.x, z: place.z, heading: place.heading }, challenge.car);
  const driven = runOn(line, RUN_ON_M);
  const pilot = new Autopilot(driven, FLAT_OUT_MS, from, 0, shortestLookM, speedPlan(challenge.car, driven, world, eased, lapM));
  let run: ChallengeRun = startRun(challenge, 1);
  const profile: string[] = [];
  let nextProfileM = PROFILE_EVERY_M;
  let stoppedS = 0;
  const lineAlongs = alongsOf(challenge, driven, from);
  // How near the car has come to the next line since crossing the last, which says why a line was missed.
  let nearestNext = { distance: Infinity, along: 0, line: -1 };
  const longestS = LONGEST_S + Math.max(0, challenge.lengthM - LONGEST_S * SLOWEST_MS) / SLOWEST_MS;
  try {
    for (let step = 0; step < longestS / STEP_S; step++) {
      const state = drive.stateAt(1);
      const sample = { x: state.position[0], z: state.position[2], speedMS: speedOf(state) };
      run = advanceRun(run, STEP_S, [sample]).run;
      if (run.outcome) {
        const [par] = run.outcome.results;
        if (par === null) throw new Error(`${challenge.id}: over with no result`);
        return { par, simS: run.clockS, profile };
      }
      if (run.clockS < 0) {
        // The handbrake, not the brake: held at a standstill, the brake is reverse.
        drive.step({ ...NO_INPUT, handbrake: true });
        continue;
      }
      drive.step(pilot.input(state));
      const onLine = driven.at(pilot.along);
      const { nextGate } = run.players[0];
      const next = lineAt(challenge, nextGate);
      if (nearestNext.line !== nextGate) nearestNext = { distance: Infinity, along: 0, line: nextGate };
      const fromNext = Math.hypot(next.x - sample.x, next.z - sample.z);
      if (fromNext < nearestNext.distance) nearestNext = { distance: fromNext, along: pilot.along, line: nextGate };
      const where = `${sample.x.toFixed(0)}, ${sample.z.toFixed(0)}, ${pilot.along.toFixed(0)} m along, before line ${nextGate + 1}, which it came within ${nearestNext.distance.toFixed(1)} m of ${nearestNext.along.toFixed(0)} m along`;
      if (pilot.along > lineAlongs[nextGate] + MISSED_M) return { failed: `missed line ${nextGate + 1} at ${where}`, along: lineAlongs[nextGate] };
      if (Math.hypot(onLine.x - sample.x, onLine.z - sample.z) > LOST_M) return { failed: `lost the road at ${where}`, along: pilot.along };
      stoppedS = sample.speedMS < STOPPED_MS ? stoppedS + STEP_S : 0;
      if (stoppedS > GIVE_UP_STOPPED_S) return { failed: `stopped at ${where}`, along: pilot.along };
      if (profiled && pilot.along >= nextProfileM) {
        profile.push(`${nextProfileM} m ${(sample.speedMS * 3.6).toFixed(1)}`);
        nextProfileM += PROFILE_EVERY_M;
      }
    }
    return { failed: `not over after ${longestS.toFixed(0)} s`, along: Infinity };
  } finally {
    drive.dispose();
  }
}

/**
 * Where along the driver's way each line lies, in the order they're crossed: each the nearest place on from the last
 * running its way, on the first pass by it where a circuit passes it lap after lap.
 */
function alongsOf(challenge: Challenge, line: RoadLine, from: number): number[] {
  const alongs: number[] = [];
  let after = from;
  for (let index = 0; index < linesOf(challenge); index++) {
    const { x, z, heading } = lineAt(challenge, index);
    let best = { distance: Infinity, along: after };
    for (let along = after; along <= line.length; along += 2) {
      const point = line.at(along);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < best.distance && Math.cos(point.heading - heading) > SAME_WAY_COSINE) best = { distance, along };
      // The first pass by it, not a later lap's, which can lie a hair nearer.
      else if (best.distance < NEAR_LINE_M && distance > best.distance + PASSED_LINE_M) break;
    }
    alongs.push(best.along);
    after = best.along + 1;
  }
  return alongs;
}

/**
 * Par, easing the grip round each spot the driver loses the road at until it gets there. Throws if it never does. On a
 * circuit, `lapM` is its lap, and a spot eased is eased on every lap. `shortestLookM` is the nearest the driver aims, for
 * a track with a corner too tight for its usual look, which cuts it.
 */
export function drivePar(challenge: Challenge, line: RoadLine, from: number, world: World, profiled = false, lapM?: number, shortestLookM?: number): { measured: Measured; eased: Eased[] } {
  const eased: Eased[] = [];
  for (let tries = 0; tries < MOST_TRIES; tries++) {
    const attempt = measure(challenge, line, from, world, eased, profiled, lapM, shortestLookM);
    if (!("failed" in attempt)) return { measured: attempt, eased };
    const { failed } = attempt;
    const along = lapM === undefined || !Number.isFinite(attempt.along) ? attempt.along : attempt.along % lapM;
    const spot = eased.find((each) => inSpot(each, along, lapM));
    if (spot) {
      // Failing there again: gentler, and from further back, where a fast approach brakes for it.
      spot.share *= EASE_BY;
      spot.from -= EASE_BEFORE_M;
    } else eased.push({ from: along - EASE_BEFORE_M, to: along + EASE_AFTER_M, share: EASE_BY });
    const least = Math.min(...eased.map(({ share }) => share));
    console.log(`${challenge.id}: ${failed}; easing ${eased.length} spot${eased.length === 1 ? "" : "s"}, the least to ${least.toFixed(2)} of its grip`);
    if (!Number.isFinite(along) || least < LEAST_SHARE) break;
  }
  throw new Error(`${challenge.id}: the driver never got there`);
}

/** How much of the grip the driver used: all of it, or how many spots were eased and the least. */
export const gripShareText = (eased: readonly Eased[]) => (eased.length === 0 ? "all" : `${eased.length} eased to ${Math.min(...eased.map(({ share }) => share)).toFixed(2)}`);
