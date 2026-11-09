import { advanceRun, startRun, type CarSample, type ChallengeRun } from "../challenge/run";
import type { RaceChallenge } from "../challenge/types";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import type { RoadLine, RoadPoint } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
import { LineDriver } from "./driver";
import type { PacePlan } from "./speed-plan";

/*
 * One racer (`ideas/traffic-and-racers.md`, "The driver"): the driver of its
 * line and speed plan, and what a player would do when it goes wrong. Stuck
 * against something, it backs out and tries again; stuck again, off the road
 * for good, on its roof or in the water, it presses its own R, back to the
 * nearest road, at the player's cost in time. It runs the race's own rules for
 * itself (`challenge/run.ts`), so its lap, its next line and its finish are
 * read the same way the player's are, and its progress along the race orders
 * the places. A pure function of the car's state and its own small record, so
 * whoever runs it next, online, carries on from exactly here.
 */

/** Getting no further along its line than this in that long is stuck. */
const STUCK_M = 2;
const STUCK_AFTER_S = 3;
/** How long it backs out for before trying again, and how many tries before it resets. */
const REVERSE_S = 2;
const TRIES_BEFORE_RESET = 2;
/** Off its line by this much, it has left the road: reset. */
const LOST_M = 14;
/** A car whose roof points down this far has rolled: reset. */
const ROLLED_UP = 0.2;
/** How far a line a racer has yet to cross counts for in its progress, so a racer nearer its next line is ahead of one further from it. */
const LINE_SPACING_M = 400;

export type RacerPhase = "driving" | "reversing";

export interface RacerRecord {
  phase: RacerPhase;
  /** How far along its line the racer has got. */
  along: number;
  /** Seconds in the phase it's in. */
  phaseS: number;
  /** How many times it has backed out at this spot. */
  tries: number;
  furthest: number;
  stuckS: number;
  resets: number;
}

export interface RacerHost {
  /** Puts the racer's car still at a point on the road, as the player's reset does. */
  reset(road: RoadPoint): void;
  /** Whether a place is in water a car sinks in. */
  inWater?(x: number, z: number): boolean;
}

export class Racer {
  readonly driver: LineDriver;
  /** The race's rules run for this racer alone. */
  run: ChallengeRun;
  record: RacerRecord;
  /** Where the racer stands when it finished, or null while it's racing. */
  get finishedS(): number | null {
    return this.run.players[0].result;
  }

  constructor(
    readonly race: RaceChallenge,
    readonly line: RoadLine,
    plan: PacePlan,
    from: number,
    private readonly host: RacerHost,
  ) {
    this.driver = new LineDriver(line, plan, from);
    this.run = startRun(race, 1);
    this.record = { phase: "driving", along: from, phaseS: 0, tries: 0, furthest: from, stuckS: 0, resets: 0 };
  }

  /** Its progress along the race, for the places: lines crossed, and how near the next, as a count of lines. */
  get progress(): number {
    return progressOf(this.run, this.distanceToNextLine);
  }

  private distanceToNextLine = Infinity;

  /** Before the countdown's green, held on the handbrake. */
  held(): DriveInput {
    return { ...NO_INPUT, handbrake: true };
  }

  /**
   * One step: the race's rules on where the car is, then the input for the coming step. `placed` says the car was put
   * somewhere since the last step, so it crosses no line on the way.
   */
  step(car: CarState, placed = false): DriveInput {
    const { record } = this;
    const speed = speedOf(car);
    const sample: CarSample = { x: car.position[0], z: car.position[2], speedMS: speed, placed };
    this.run = advanceRun(this.run, STEP_S, [sample]).run;
    if (this.run.clockS < 0) return this.held();
    const input = this.driver.input(car);
    record.along = this.driver.along;
    const next = this.run.players[0].nextGate;
    const line = this.race.gates[next % this.race.gates.length];
    this.distanceToNextLine = Math.hypot(line.x - sample.x, line.z - sample.z);
    if (this.finishedS !== null) return { ...NO_INPUT, brake: speed > 1 ? 0.5 : 0 };
    record.phaseS += STEP_S;
    if (record.along >= record.furthest + STUCK_M) {
      record.furthest = record.along;
      record.stuckS = 0;
      if (record.phase === "driving") record.tries = 0;
    } else record.stuckS += STEP_S;
    const onLine = this.line.at(record.along);
    const offLine = Math.hypot(onLine.x - sample.x, onLine.z - sample.z);
    const up = 1 - 2 * (car.rotation[0] * car.rotation[0] + car.rotation[2] * car.rotation[2]);
    const lost = offLine > LOST_M || up < ROLLED_UP || (this.host.inWater?.(sample.x, sample.z) ?? false);
    if (lost) {
      this.reset();
      return this.held();
    }
    const reverse = { throttle: 0, brake: 1, steer: -input.steer, handbrake: false };
    if (record.phase === "reversing") {
      if (record.phaseS < REVERSE_S) return reverse;
      record.phase = "driving";
      record.phaseS = 0;
      record.stuckS = 0;
      return input;
    }
    if (record.stuckS > STUCK_AFTER_S) {
      // Stuck once more after backing out twice: its own R.
      if (record.tries >= TRIES_BEFORE_RESET) {
        this.reset();
        return this.held();
      }
      record.phase = "reversing";
      record.phaseS = 0;
      record.stuckS = 0;
      record.tries++;
      return reverse;
    }
    return input;
  }

  /** The racer's own R: back on its line at the nearest point, facing along it. */
  private reset(): void {
    const { record } = this;
    const point = this.line.at(record.along);
    this.host.reset(point);
    record.phase = "driving";
    record.phaseS = 0;
    record.tries = 0;
    record.stuckS = 0;
    record.furthest = record.along;
    record.resets++;
  }
}

/** Progress along a race as a count of lines: those crossed, and how near the next, so places can be read among cars at any moment. */
export function progressOf(run: ChallengeRun, distanceToNextLineM: number, player = 0): number {
  const { nextGate, result } = run.players[player];
  if (result !== null) return nextGate;
  return nextGate + Math.max(0, 1 - Math.min(distanceToNextLineM, LINE_SPACING_M) / LINE_SPACING_M);
}

/** The way a car faces, for a reset facing along the line: the line's heading at the point. */
export const facingAlong = (car: CarState, point: RoadPoint): boolean => Math.cos(headingOf(car.rotation) - point.heading) >= 0;
