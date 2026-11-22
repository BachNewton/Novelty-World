import { advanceRun, startRun, type CarSample, type ChallengeRun, type Outcome, type PlayerRun } from "../challenge/run";
import type { RaceChallenge } from "../challenge/types";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import type { RoadLine, RoadPoint } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
import { placeOnLine, type Relative, type SeenCar } from "./awareness";
import { LineDriver } from "./driver";
import { craft, freshCraft, type CraftState, type Room } from "./racecraft";
import { EDGE_MARGIN_M, type LineGeometry } from "./racing-line";
import { alongsOf } from "./route-plan";
import { plannedSpeedAt, type PacePlan } from "./speed-plan";

/*
 * One racer (`ideas/traffic-and-racers.md`, "The driver"): the driver of its
 * line and speed plan, racecraft for the cars it sees (`racecraft.ts`), and
 * what a player would do when it goes wrong. Off the road, it drives back to
 * its line at a careful speed; spun round, it stops and turns about in the
 * road, a three-point turn; stuck against something, it backs out and tries
 * again. Its own R is the last resort it is for a player: stuck again, too
 * far off its line to have driven there on purpose, on its roof, in the water,
 * or past a line it was to cross without crossing it, it is back on its line,
 * at the player's cost in time. Over the finish it cools down, slowly along the road's right edge to
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
/**
 * Off where it means to be by this much, a racer has left the road, and comes back to it no faster than this; further
 * off than the second, it is lost: reset. A car knocked into a spin at speed comes to rest well out in a field, and a
 * driver drives back from there: the reset is for further than that.
 */
const ASTRAY_M = 5;
const REJOIN_MS = 14;
const LOST_M = 60;
/** Astray this long without getting back to its line, a racer takes its R as a player would: among trees it backs and fills for minutes, each try a fresh one. */
const ASTRAY_PATIENCE_S = 15;
/**
 * A racer whose R is for being stuck behind a car that stands in its road is put down past that car, where the road is
 * next clear: one standing within this far ahead and this near its line, with this much room left to it, looked for no
 * further than this. Put down behind it again, it would be stuck there for as long as the car stood.
 */
const BLOCKED_WITHIN_M = 25;
const BLOCKED_BESIDE_M = 0.5;
const PUT_DOWN_CLEAR_M = 5;
const PUT_DOWN_MOST_M = 60;
const STANDING_MS = 1.5;
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
/** The room racecraft has to move over in is the least over the stretch ahead this long, in seconds of travel and never less than this far: the road it is about to be on, not only the road under it. */
const ROOM_AHEAD_S = 1.5;
const ROOM_AHEAD_LEAST_M = 30;
/**
 * Off its line a racer is on a path the plan didn't draw: nearer a bend's inside its turn is tighter than the line's,
 * so where it is tighter by more than this share its speed is the plan's less the difference, braked for at this firm
 * rate from this far off.
 */
const OFF_LINE_FROM_M = 0.3;
const OFF_LINE_TIGHTER = 0.02;
const OFF_LINE_LOOK_M = 120;
const OFF_LINE_BRAKE_MS2 = 7;
const TIGHTEST_SHARE = 0.2;
/** A reset looks this far back along the line for the line it has yet to cross, and lands this far before it: put down past it, it could never finish. */
const GATE_LOOK_BACK_M = 60;
const BEFORE_GATE_M = 8;
const GATE_NEAR_M = 14;
/** This far along its line past the line it is to cross next, without having crossed it, a racer has missed it: its own R, back before it. */
const MISSED_M = 24;
/** Over the finish, a racer cools down at this speed along the road's right edge, to its line's end. */
const COOL_DOWN_MS = 12;
/** This near its line's end a racer stops: the line runs on past the finish, and there is nothing beyond it. */
const LINE_END_M = 8;

export type RacerPhase = "driving" | "reversing" | "turning";
/** Why a racer last pressed its own R. */
export type ResetCause = "lost" | "rolled" | "water" | "stuck" | "turning" | "missed";

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
  /** Seconds it has been well off its line since it was last on it. */
  astrayS: number;
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
    /** Where along the line its place on the grid is. */
    private readonly from: number,
    private readonly host: RacerHost,
    /** The room to each side along the line, for racecraft; without it the racer sees no one. */
    private readonly geometry: LineGeometry | null = null,
    private readonly halfWidthM = 0.9,
    private readonly halfLengthM = 2.2,
  ) {
    this.driver = new LineDriver(line, plan, from);
    this.lineAlongs = alongsOf(race, line, from);
    this.run = startRun(race, 1);
    this.record = { phase: "driving", along: from, phaseS: 0, tries: 0, furthest: from, stuckS: 0, resets: 0, lastReset: null, offsetM: 0, astrayS: 0 };
  }

  /** Its progress along the race, for the places: lines crossed, and how near the next, as a count of lines. */
  get progress(): number {
    return progressOf(this.run, this.distanceToNextLine);
  }

  private distanceToNextLine = Infinity;
  /** Where along its line each of the race's lines lies, in the order they're crossed. */
  private readonly lineAlongs: number[];

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
    if (!this.geometry) return { rightM: 0, leftM: 0, middleM: 0, bridged: false };
    const at = Math.max(0, Math.min(this.geometry.middleM.length - 1, Math.round(along / this.geometry.stepM)));
    const keep = this.halfWidthM + EDGE_MARGIN_M;
    const middleM = this.geometry.middleM[at];
    return { rightM: Math.max(0, middleM + this.geometry.rightM[at] - keep), leftM: Math.max(0, -middleM + this.geometry.leftM[at] - keep), middleM, bridged: this.geometry.rightM[at] === 0 && this.geometry.leftM[at] === 0 };
  }

  /** The least room to each side over a stretch ahead of a racer. */
  private roomOver(along: number, aheadM: number): Room {
    const room = this.roomAt(along);
    if (!this.geometry) return room;
    for (let ahead = this.geometry.stepM; ahead <= aheadM; ahead += this.geometry.stepM) {
      const there = this.roomAt(along + ahead);
      room.rightM = Math.min(room.rightM, there.rightM);
      room.leftM = Math.min(room.leftM, there.leftM);
      room.bridged ||= there.bridged;
    }
    return room;
  }

  /** The fastest a racer may go here on a path a way right of its line: the plan's speed at each bend ahead, less for the tighter turn its path makes of it, and the firm braking that gets it there. */
  private offLineSpeed(along: number, offsetM: number): number {
    const { plan } = this.driver;
    let most = Infinity;
    for (let ahead = 0; ahead <= OFF_LINE_LOOK_M; ahead += plan.stepM) {
      const sample = Math.max(0, Math.min(plan.speeds.length - 1, Math.round((along + ahead) / plan.stepM)));
      // How much nearer the bend's middle the path runs than the line, as a share of the line's radius.
      const tighter = offsetM * plan.bends[sample];
      if (tighter < OFF_LINE_TIGHTER) continue;
      const there = plan.speeds[sample] * Math.sqrt(Math.max(TIGHTEST_SHARE, 1 - tighter));
      most = Math.min(most, Math.sqrt(there * there + 2 * OFF_LINE_BRAKE_MS2 * ahead));
    }
    return most;
  }

  /** The sharpest bend within reach ahead, signed, or 0 on a straight. */
  private bendAhead(along: number): number {
    const { bends, stepM } = this.driver.plan;
    let sharpest = 0;
    for (let at = Math.ceil(along / stepM); at <= Math.min(bends.length - 1, Math.floor((along + BEND_LOOK_M) / stepM)); at++) if (Math.abs(bends[at]) > Math.abs(sharpest)) sharpest = bends[at];
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
    let waiting = false;
    let around: Relative[] = [];
    if (this.geometry) {
      around = placeOnLine(this.line, along, self, seen, speed);
      const lateralM = (sample.x - onLine.x) * Math.cos(onLine.heading) - (sample.z - onLine.z) * Math.sin(onLine.heading);
      const crafted = craft({ speedMS: speed, lateralM, offGridM: along - this.from, halfWidthM: this.halfWidthM, halfLengthM: this.halfLengthM }, (aheadM) => plannedSpeedAt(this.driver.plan, along + aheadM), this.bendAhead(along), record.offsetM, this.roomOver(along, Math.max(ROOM_AHEAD_LEAST_M, speed * ROOM_AHEAD_S)), (aheadM) => this.roomOver(along, aheadM), around, this.craft, along);
      this.craft = crafted.state;
      holdUnder = crafted.holdUnderMS;
      wantedOffsetM = crafted.offsetM;
      ({ waiting } = crafted);
    }
    // Over the finish: cool down along the right edge, still holding behind whoever is ahead.
    if (finished) {
      holdUnder = Math.min(holdUnder ?? Infinity, COOL_DOWN_MS);
      wantedOffsetM = this.roomAt(along).rightM;
    }
    const astray = offLine - Math.abs(record.offsetM) > ASTRAY_M;
    record.astrayS = astray ? record.astrayS + STEP_S : 0;
    if (astray) holdUnder = Math.min(holdUnder ?? Infinity, REJOIN_MS);
    const move = Math.max(-OFFSET_RATE_MS * STEP_S, Math.min(OFFSET_RATE_MS * STEP_S, wantedOffsetM - record.offsetM));
    record.offsetM += move;
    if (Math.abs(record.offsetM) > OFF_LINE_FROM_M) holdUnder = Math.min(holdUnder ?? Infinity, this.offLineSpeed(along, record.offsetM));
    const input = this.driver.input(car, record.offsetM, holdUnder);
    record.along = this.driver.along;
    // At its line's end there is nowhere left to drive: stop there, over the finish or not.
    if (record.along >= this.line.length - LINE_END_M) return speed > 1 ? { ...NO_INPUT, brake: 1 } : this.held();
    if (finished) return input;

    if (record.along >= record.furthest + STUCK_M) {
      record.furthest = record.along;
      record.stuckS = 0;
      if (record.phase === "driving") record.tries = 0;
    } else if (!waiting) record.stuckS += STEP_S;
    const up = 1 - 2 * (car.rotation[0] * car.rotation[0] + car.rotation[2] * car.rotation[2]);
    const missed = next < this.lineAlongs.length && record.along > this.lineAlongs[next] + MISSED_M;
    const lost: ResetCause | null = offLine > LOST_M || record.astrayS > ASTRAY_PATIENCE_S ? "lost" : up < ROLLED_UP ? "rolled" : (this.host.inWater?.(sample.x, sample.z) ?? false) ? "water" : missed ? "missed" : null;
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
      // In reverse the brake pedal drives the car backwards, so one caught backing out is stopped on its handbrake.
      if (speed > TURN_STOP_MS) return { throttle: 0, brake: 1, steer: 0, handbrake: car.lamps.reverse };
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
        this.reset("stuck", this.pastWhatStands(around));
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

  /** How far on along its line the road is next clear, where a car stands in the racer's way: 0 where none does, or none is clear within reach. */
  private pastWhatStands(around: readonly Relative[]): number {
    const inRoad = (other: Relative) => Math.abs(other.lateralM) < other.car.halfWidthM + this.halfWidthM + BLOCKED_BESIDE_M;
    const standing = around.filter((other) => other.alongM > 0 && other.alongM < BLOCKED_WITHIN_M && Math.abs(other.speedAlongMS) < STANDING_MS && inRoad(other));
    if (standing.length === 0) return 0;
    // Past the furthest of them, and on past each car further along that the place would touch, nearest first.
    const clearOf = (other: Relative) => other.car.halfLengthM + this.halfLengthM + PUT_DOWN_CLEAR_M;
    let onM = Math.max(...standing.map((other) => other.alongM + clearOf(other)));
    for (const other of around.filter(inRoad).sort((a, b) => a.alongM - b.alongM)) if (other.alongM > onM - clearOf(other) && other.alongM < onM + clearOf(other)) onM = other.alongM + clearOf(other);
    return onM <= PUT_DOWN_MOST_M ? onM : 0;
  }

  /** The racer's own R: back on its line at the nearest point, or `onM` past it where a car stands in the way there, facing along it, and before the line it has yet to cross. */
  private reset(cause: ResetCause, onM = 0): void {
    const { record } = this;
    record.lastReset = cause;
    record.along = Math.min(record.along + onM, this.beforeNextGate(record.along + onM));
    const point = this.line.at(record.along);
    this.host.reset(point);
    // The driver follows its line from where the car is put down, which may be well back from where it lost it.
    this.driver.along = record.along;
    record.phase = "driving";
    record.phaseS = 0;
    record.tries = 0;
    record.stuckS = 0;
    record.furthest = record.along;
    record.offsetM = 0;
    record.astrayS = 0;
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
