import { advanceRun, startRun, type CarSample, type ChallengeRun, type Outcome, type PlayerRun } from "../challenge/run";
import type { RaceChallenge } from "../challenge/types";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import type { RoadLine, RoadPoint } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
import { placeOnLine, type SeenCar } from "./awareness";
import { LineDriver } from "./driver";
import { craft, freshCraft, type CraftState, type Room } from "./racecraft";
import { EDGE_MARGIN_M, type LineGeometry } from "./racing-line";
import { plannedSpeedAt, type PacePlan } from "./speed-plan";

/*
 * One racer (`ideas/traffic-and-racers.md`, "The driver"): the driver of its
 * line and speed plan, racecraft for the cars it sees (`racecraft.ts`), and
 * what a player would do when it goes wrong. Spun round, it stops and turns
 * about in the road, a three-point turn; stuck against something, it backs out
 * and tries again; stuck again, off the road for good, on its roof or in the
 * water, it presses its own R, back to the nearest road, at the player's cost
 * in time. Over the finish it cools down, slowly along the road's right edge to
 * its line's end, so the line stays clear for those still racing, and stops
 * there. It runs the race's own rules for itself (`challenge/run.ts`), so
 * its lap, its next line and its finish are read the same way the player's
 * are, and its progress along the race orders the places. A pure function of
 * the car's state, what it sees and its own small record, so whoever runs it
 * next, online, carries on from exactly here.
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
/** Facing further than this off the line's way is facing the wrong way: a spin to turn out of. */
const SPUN_COSINE = -0.2;
/** Turning about: slow to this first, then each leg of the turn lasts this long, and this many legs without coming round is a reset. */
const TURN_STOP_MS = 2;
const TURN_LEG_S = 1.6;
const TURN_LEGS = 4;
/** Facing within this of the line's way again, the turn is done. */
const TURNED_COSINE = 0.5;
/** How fast the offset racecraft asks for is taken up, metres a second sideways, so a move reads as a move and not a twitch. */
const OFFSET_RATE_MS = 2.5;
/** How far ahead racecraft looks for the bend it passes or defends into. */
const BEND_LOOK_M = 120;
/** A reset looks this far back along the line for the line it has yet to cross, and lands this far before it: put down past it, it could never finish. */
const GATE_LOOK_BACK_M = 60;
const BEFORE_GATE_M = 8;
const GATE_NEAR_M = 14;
/** Over the finish, a racer cools down at this speed along the road's right edge, to its line's end. */
const COOL_DOWN_MS = 12;
/** This near its line's end a racer stops: the line runs on past the finish, and there is nothing beyond it. */
const LINE_END_M = 8;

export type RacerPhase = "driving" | "reversing" | "turning";
/** Why a racer last pressed its own R. */
export type ResetCause = "lost" | "rolled" | "water" | "stuck" | "turning";

export interface RacerRecord {
  phase: RacerPhase;
  /** How far along its line the racer has got. */
  along: number;
  /** Seconds in the phase it's in. */
  phaseS: number;
  /** How many times it has backed out at this spot, or how many legs of a turn it has made. */
  tries: number;
  furthest: number;
  stuckS: number;
  resets: number;
  lastReset: ResetCause | null;
  /** How far right of its line it runs now. */
  offsetM: number;
}

/**
 * Everything a racer carries from one step to the next beyond its car: its record, its racecraft, where its driver
 * is along the line and the race's rules as they stand for it. Plain data, so it goes over the wire with the car's
 * state, and a racer resumed from it drives on exactly as the one it was taken from.
 */
export interface RacerSnapshot {
  record: RacerRecord;
  craft: CraftState;
  /** Where its driver is along the line, which a reset moves apart from the record's. */
  driverAlong: number;
  run: { attempt: number; clockS: number; player: PlayerRun; outcome: Outcome | null };
  /** How far its next line was, at its last step; null before its first. */
  toNextLineM: number | null;
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
  craft: CraftState = freshCraft();
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
    /** The room to each side along the line, for racecraft; without it the racer sees no one. */
    private readonly geometry: LineGeometry | null = null,
    /** The line's signed curvature at the plan's step, which way each bend goes. */
    private readonly bends: Float64Array | null = null,
    private readonly halfWidthM = 0.9,
    private readonly halfLengthM = 2.2,
  ) {
    this.driver = new LineDriver(line, plan, from);
    this.run = startRun(race, 1);
    this.record = { phase: "driving", along: from, phaseS: 0, tries: 0, furthest: from, stuckS: 0, resets: 0, lastReset: null, offsetM: 0 };
  }

  /** Its progress along the race, for the places: lines crossed, and how near the next, as a count of lines. */
  get progress(): number {
    return progressOf(this.run, this.distanceToNextLine);
  }

  private distanceToNextLine = Infinity;

  /** What it carries beyond its car, to be resumed elsewhere. */
  snapshot(): RacerSnapshot {
    const { attempt, clockS, players, outcome } = this.run;
    return structuredClone({
      record: this.record,
      craft: this.craft,
      driverAlong: this.driver.along,
      run: { attempt, clockS, player: players[0], outcome },
      toNextLineM: Number.isFinite(this.distanceToNextLine) ? this.distanceToNextLine : null,
    });
  }

  /** Carries on from a snapshot, taken from this racer or another on the same race, line and plan. */
  resume(snapshot: RacerSnapshot): void {
    const { record, craft, driverAlong, run, toNextLineM } = structuredClone(snapshot);
    this.record = record;
    this.craft = craft;
    this.driver.along = driverAlong;
    this.run = { challenge: this.race, attempt: run.attempt, clockS: run.clockS, players: [run.player], outcome: run.outcome };
    this.distanceToNextLine = toNextLineM ?? Infinity;
  }

  /** Before the countdown's green, held on the handbrake. */
  held(): DriveInput {
    return { ...NO_INPUT, handbrake: true };
  }

  /** The room to each side where the racer is, for a car of its width. */
  private roomAt(along: number): Room {
    if (!this.geometry) return { rightM: 0, leftM: 0, middleM: 0 };
    const at = Math.max(0, Math.min(this.geometry.middleM.length - 1, Math.round(along / this.geometry.stepM)));
    const keep = this.halfWidthM + EDGE_MARGIN_M;
    const middleM = this.geometry.middleM[at];
    return { rightM: Math.max(0, middleM + this.geometry.rightM[at] - keep), leftM: Math.max(0, -middleM + this.geometry.leftM[at] - keep), middleM };
  }

  /** The sharpest bend within reach ahead, signed, or 0 on a straight. */
  private bendAhead(along: number): number {
    if (!this.bends) return 0;
    const step = this.driver.plan.stepM;
    let sharpest = 0;
    for (let at = Math.ceil(along / step); at <= Math.min(this.bends.length - 1, Math.floor((along + BEND_LOOK_M) / step)); at++) if (Math.abs(this.bends[at]) > Math.abs(sharpest)) sharpest = this.bends[at];
    return sharpest;
  }

  /**
   * One step: the race's rules on where the car is, then the input for the coming step, with the cars it sees. `placed`
   * says the car was put somewhere since the last step, so it crosses no line on the way.
   */
  step(car: CarState, placed = false, seen: readonly SeenCar[] = [], self = ""): DriveInput {
    const { record } = this;
    const speed = speedOf(car);
    const sample: CarSample = { x: car.position[0], z: car.position[2], speedMS: speed, placed };
    this.run = advanceRun(this.run, STEP_S, [sample]).run;
    if (this.run.clockS < 0) return this.held();
    const along = this.driver.along;
    const onLine = this.line.at(along);
    const offLine = Math.hypot(onLine.x - sample.x, onLine.z - sample.z);
    const facing = Math.cos(headingOf(car.rotation) - onLine.heading);
    const next = this.run.players[0].nextGate;
    const gate = this.race.gates[next % this.race.gates.length];
    this.distanceToNextLine = Math.hypot(gate.x - sample.x, gate.z - sample.z);
    const finished = this.finishedS !== null;
    record.phaseS += STEP_S;

    // Racecraft, from what it sees: what to hold its speed under, and where to run.
    let holdUnder: number | null = null;
    let wantedOffsetM = 0;
    if (this.geometry) {
      const around = placeOnLine(this.line, along, self, seen);
      const crafted = craft({ speedMS: speed, halfWidthM: this.halfWidthM, halfLengthM: this.halfLengthM }, (aheadM) => plannedSpeedAt(this.driver.plan, along + aheadM), this.bendAhead(along), record.offsetM, this.roomAt(along), around, this.craft, along);
      this.craft = crafted.state;
      holdUnder = crafted.holdUnderMS;
      wantedOffsetM = crafted.offsetM;
    }
    // Over the finish: cool down along the right edge, still holding behind whoever is ahead.
    if (finished) {
      holdUnder = Math.min(holdUnder ?? Infinity, COOL_DOWN_MS);
      wantedOffsetM = this.roomAt(along).rightM;
    }
    const move = Math.max(-OFFSET_RATE_MS * STEP_S, Math.min(OFFSET_RATE_MS * STEP_S, wantedOffsetM - record.offsetM));
    record.offsetM += move;
    const input = this.driver.input(car, record.offsetM, holdUnder);
    record.along = this.driver.along;
    // At its line's end there is nowhere left to drive: stop there, over the finish or not.
    if (record.along >= this.line.length - LINE_END_M) return speed > 1 ? { ...NO_INPUT, brake: 1 } : this.held();
    if (finished) return input;

    if (record.along >= record.furthest + STUCK_M) {
      record.furthest = record.along;
      record.stuckS = 0;
      if (record.phase === "driving") record.tries = 0;
    } else record.stuckS += STEP_S;
    const up = 1 - 2 * (car.rotation[0] * car.rotation[0] + car.rotation[2] * car.rotation[2]);
    const lost: ResetCause | null = offLine > LOST_M ? "lost" : up < ROLLED_UP ? "rolled" : (this.host.inWater?.(sample.x, sample.z) ?? false) ? "water" : null;
    if (lost) {
      this.reset(lost);
      return this.held();
    }
    // Spun round: stop, then turn about in legs, reversing on one lock and driving forward on the other.
    if (record.phase === "turning") {
      if (facing > TURNED_COSINE) {
        record.phase = "driving";
        record.phaseS = 0;
        record.stuckS = 0;
        record.tries = 0;
        return input;
      }
      if (record.phaseS >= TURN_LEG_S) {
        record.phaseS = 0;
        record.tries++;
        if (record.tries >= TURN_LEGS) {
          this.reset("turning");
          return this.held();
        }
      }
      const reversing = record.tries % 2 === 0;
      // The line's way lies to one side: back away from it with the wheels turned that way, then drive round towards it.
      const lineToRight = Math.sin(headingOf(car.rotation) - onLine.heading) > 0;
      const steer = (lineToRight ? 1 : -1) * (reversing ? -1 : 1);
      return reversing ? { throttle: 0, brake: 1, steer, handbrake: false } : { throttle: 0.5, brake: 0, steer, handbrake: false };
    }
    if (facing < SPUN_COSINE) {
      if (speed > TURN_STOP_MS) return { throttle: 0, brake: 1, steer: 0, handbrake: false };
      record.phase = "turning";
      record.phaseS = 0;
      record.tries = 0;
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
        this.reset("stuck");
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

  /** The racer's own R: back on its line at the nearest point, facing along it, and before the line it has yet to cross. */
  private reset(cause: ResetCause): void {
    const { record } = this;
    record.lastReset = cause;
    record.along = Math.min(record.along, this.beforeNextGate(record.along));
    const point = this.line.at(record.along);
    this.host.reset(point);
    record.phase = "driving";
    record.phaseS = 0;
    record.tries = 0;
    record.stuckS = 0;
    record.furthest = record.along;
    record.offsetM = 0;
    record.resets++;
    this.craft = freshCraft();
  }


  /** Where along the line to land short of the next line to cross, where that is behind or at `along`; `along` itself otherwise. */
  private beforeNextGate(along: number): number {
    const gate = this.race.gates[this.run.players[0].nextGate % this.race.gates.length];
    let best = { distance: Infinity, along };
    for (let at = Math.max(0, along - GATE_LOOK_BACK_M); at <= along + BEFORE_GATE_M; at += 2) {
      const point = this.line.at(at);
      const distance = Math.hypot(point.x - gate.x, point.z - gate.z);
      if (distance < best.distance) best = { distance, along: at };
    }
    return best.distance <= GATE_NEAR_M ? Math.max(0, best.along - BEFORE_GATE_M) : along;
  }
}

/** Progress along a race as a count of lines: those crossed, and how near the next, so places can be read among cars at any moment. */
export function progressOf(run: ChallengeRun, distanceToNextLineM: number, player = 0): number {
  return progressOfPlayer(run.players[player], distanceToNextLineM);
}

/** The same, from one player's run alone. */
export function progressOfPlayer({ nextGate, result }: PlayerRun, distanceToNextLineM: number): number {
  if (result !== null) return nextGate;
  return nextGate + Math.max(0, 1 - Math.min(distanceToNextLineM, LINE_SPACING_M) / LINE_SPACING_M);
}

/** The way a car faces, for a reset facing along the line: the line's heading at the point. */
export const facingAlong = (car: CarState, point: RoadPoint): boolean => Math.cos(headingOf(car.rotation) - point.heading) >= 0;
