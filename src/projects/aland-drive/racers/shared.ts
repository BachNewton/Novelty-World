import { advanceRun, startRun, type CarSample } from "../challenge/run";
import type { Standing } from "../challenge/standings";
import type { RaceChallenge } from "../challenge/types";
import type { RaceProgress } from "../net/protocol";
import type { CarState } from "../sim/car-state";
import type { RoadLine } from "../sim/road-net";
import { CONDITIONS, type Condition } from "../sim/surfaces";
import { freshCraft } from "./racecraft";
import { progressOfPlayer, type RacerSnapshot } from "./racer";

/*
 * A race's racers, shared online (`ideas/traffic-and-racers.md`, "Who runs
 * the racers online"): each racer is a computer-driven car (`net/computer-
 * cars.ts`), run by the player in the race nearest it, its record sent with
 * its car, and seen by everyone. One rule from the grid to the finish, solo
 * the same as co-op, a solo player being a team of one: each grid racer is
 * put down by the player whose start place is nearest it, and handed on as
 * the race spreads out. A player who leaves a race unfinished is replaced by
 * a racer, on the racers' side, in their car where it stood, with the lines
 * they had crossed, put down by the player still in the race nearest them.
 *
 * Everything here is pure: the record, and who does what, so every page works
 * out the same answer from the same facts.
 */

/** A racer's driver record, as it goes over the wire with its car: what its plan is made from, and its snapshot. */
export interface RacerDriver {
  kind: "racer";
  race: string;
  attempt: number;
  /** Where along the line its plan's standing start is. */
  fromM: number;
  /** The condition its plan is made for, so a handover doesn't change the plan under it. */
  condition: Condition;
  racer: RacerSnapshot;
}

export const gridRacerId = (race: string, attempt: number, slot: number) => `${race}/${attempt}/grid-${slot}`;
export const replacementId = (race: string, attempt: number, peer: string) => `${race}/${attempt}/for-${peer}`;

/** Whether a computer-driven car's record is a racer's. */
export const isRacer = (driver: Record<string, unknown>) => driver.kind === "racer";

/** Where a racer stands in its race, from its snapshot. */
export function standingOf({ racer }: RacerDriver): Standing {
  return { finishedS: racer.run.player.result, progress: progressOfPlayer(racer.run.player, racer.toNextLineM ?? Infinity) };
}

/**
 * The seat whose player puts a grid racer on its place: the one whose start place is nearest it, the lower seat on a
 * tie, so every page in the race works out the same from the race alone. `starts` are the players' places by seat.
 */
export function placerOf(racerPlace: { x: number; z: number }, starts: readonly { x: number; z: number }[]): number {
  let best = { seat: 0, off: Infinity };
  for (const [seat, start] of starts.entries()) {
    const off = Math.hypot(start.x - racerPlace.x, start.z - racerPlace.z);
    if (off < best.off) best = { seat, off };
  }
  return best.seat;
}

/**
 * Whether a player may run a race's racer, from what they last said of the race they're in: yes in its race and
 * attempt, no in another or none, and not known before they've said.
 */
export function mayRunRacer(driver: RacerDriver, said: RaceProgress | null | undefined): boolean | null {
  if (said === undefined) return null;
  return said !== null && said.race === driver.race && said.attempt === driver.attempt;
}

/**
 * Whether a player has left a race unfinished, so a racer takes their place: they were in it, still racing, and now
 * say they are in no race, or another (a retry keeps them in it), or have gone from the world (`now` null).
 */
export function leftUnfinished(was: RaceProgress | undefined, now: RaceProgress | null): boolean {
  if (!was || was.finishedS !== null) return false;
  return now === null || now.race !== was.race;
}

/**
 * Where along a race's line a car stands that has crossed `nextGate` of its lines: the nearest point of the stretch
 * of line between those lines, found by running the race's own rules along the line, so a circuit's laps can't be
 * mistaken for one another.
 */
export function alongForProgress(race: RaceChallenge, line: RoadLine, nextGate: number, x: number, z: number, stepM = 2): number {
  let run = { ...startRun(race, 1), clockS: 0 };
  let best = { along: 0, off: Infinity };
  for (let along = 0; along <= line.length; along += stepM) {
    const point = line.at(along);
    const sample: CarSample = { x: point.x, z: point.z, speedMS: 1 };
    run = advanceRun(run, 0, [sample]).run;
    const crossed = run.players[0].result !== null ? Infinity : run.players[0].nextGate;
    if (crossed > nextGate) break;
    if (crossed < nextGate) continue;
    const off = Math.hypot(point.x - x, point.z - z);
    if (off < best.off) best = { along, off };
  }
  if (!Number.isFinite(best.off)) throw new Error(`${race.id}'s line never reaches its line ${nextGate}`);
  return best.along;
}

/**
 * The racer that takes the place of a player who left a race unfinished: their car where it stood, the lines they had
 * crossed, on the clock of the page putting it down. Its plan starts from the line's start, not from a standstill
 * where it is: it is already under way.
 */
export function replacementOf(race: RaceChallenge, line: RoadLine, leaver: { state: CarState; progress: RaceProgress }, clockS: number, condition: Condition): RacerDriver {
  const along = alongForProgress(race, line, leaver.progress.nextGate, leaver.state.position[0], leaver.state.position[2]);
  return {
    kind: "racer",
    race: race.id,
    attempt: leaver.progress.attempt,
    fromM: 0,
    condition,
    racer: {
      record: { phase: "driving", along, phaseS: 0, tries: 0, furthest: along, stuckS: 0, resets: 0, lastReset: null, offsetM: 0 },
      craft: freshCraft(),
      driverAlong: along,
      run: { attempt: leaver.progress.attempt, clockS, player: { last: null, nextGate: leaver.progress.nextGate, result: null, gone: false }, outcome: null },
      toNextLineM: null,
    },
  };
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A racer's record as another player sent it; one that isn't is a bug in whoever sent it, so it fails loudly. */
export function parseRacerDriver(value: Record<string, unknown>): RacerDriver {
  const { kind, race, attempt, fromM, condition, racer } = value;
  const snapshot = isRecord(racer) ? racer : null;
  const run = snapshot && isRecord(snapshot.run) ? snapshot.run : null;
  const record = snapshot && isRecord(snapshot.record) ? snapshot.record : null;
  const player = run && isRecord(run.player) ? run.player : null;
  const fine =
    kind === "racer" &&
    typeof race === "string" &&
    isNumber(attempt) &&
    isNumber(fromM) &&
    typeof condition === "string" &&
    (CONDITIONS as readonly string[]).includes(condition) &&
    snapshot !== null &&
    record !== null &&
    ["along", "phaseS", "tries", "furthest", "stuckS", "resets", "offsetM"].every((name) => isNumber(record[name])) &&
    ["driving", "reversing", "turning"].includes(record.phase as string) &&
    isRecord(snapshot.craft) &&
    isNumber(snapshot.driverAlong) &&
    (snapshot.toNextLineM === null || isNumber(snapshot.toNextLineM)) &&
    run !== null &&
    isNumber(run.attempt) &&
    isNumber(run.clockS) &&
    player !== null &&
    isNumber(player.nextGate) &&
    (player.result === null || isNumber(player.result));
  if (!fine) throw new Error(`not a racer's record: ${JSON.stringify(value)}`);
  return value as unknown as RacerDriver;
}
