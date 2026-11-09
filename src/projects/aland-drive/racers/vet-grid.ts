import type { Indexed } from "@/shared/lib/bot-lab/pool";
import { placeOf, type Standing } from "../challenge/standings";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { speedOf } from "../sim/car-state";
import type { CarId } from "../sim/cars";
import { Drive, type SimulatedCar } from "../sim/drive";
import type { Condition, Tyre } from "../sim/surfaces";
import { STEP_S } from "../sim/tuning";
import type { SeenCar } from "./awareness";
import { seenCarOf } from "./grid";
import type { Racer } from "./racer";
import { alongOfPlace, racerFor, racingLineFor, type LoadedRace } from "./vet";

/*
 * A whole grid vetted at once (`ideas/races.md`, "Racecraft... a grid of six
 * finishes every race with passes made and no pile-up the vetting tool can
 * find"): every place on the grid filled with a racer in a car of the field,
 * all in one simulation, each seeing the others, through the race's own rules
 * for each, and counted as a race: who finished and where, each one's hits and
 * resets, the passes made among them, and the pile-ups, a knot of racers
 * stopped together. Deterministic, so a change to racecraft reads as an exact
 * difference.
 */

export interface GridSpec extends Indexed {
  race: string;
  /** The cars on the grid, pole first, as many as the grid has places for. */
  slots: CarId[];
  condition: Condition;
  tyres: Tyre;
  gripShare: number;
  brakeShare: number;
  skill: string;
  folder: string;
}

export interface GridRacerResult {
  slot: number;
  car: CarId;
  finished: boolean;
  raceS: number | null;
  /** Its place at the end, by finish time, then by how far round it got. */
  place: number;
  hits: number;
  resets: number;
  offSurfaceM: number;
}

export interface GridResult extends Indexed {
  race: string;
  condition: Condition;
  skill: string;
  racers: GridRacerResult[];
  /** Times one racer moved ahead of another over the race, read every second. */
  passes: number;
  /** Knots of three or more racers stopped together for a few seconds. */
  pileUps: number;
  /** Seconds until the last finisher, or the cap. */
  simS: number;
  failed?: string;
}

/** The longest a grid may take: the race at a crawl, and a margin. */
const SLOWEST_MS = 8;
const LONGEST_MARGIN_S = 120;
/** A loss of speed in one step no brake makes: a hit. */
const HIT_DROP_MS = 1;
const HIT_APART_S = 1;
/** A pile-up is this many racers within this of each other, under this speed, for this long. */
const PILE_UP_CARS = 3;
const PILE_UP_WITHIN_M = 12;
const PILE_UP_SLOW_MS = 3;
const PILE_UP_AFTER_S = 3;
/** Places are read this often for the passes. */
const PLACES_EVERY_S = 1;
/** How often the trace speaks, in seconds: finer when diagnosing a moment. */
const TRACE_EVERY_S = Number(process.env.RACE_VET_TRACE_EVERY_S ?? "1");

interface Entry {
  slot: number;
  car: SimulatedCar;
  racer: Racer;
  id: string;
  hits: number;
  lastSpeed: number;
  lastHitS: number;
  placed: boolean;
  /** Put down this step, so its loss of speed is no hit. */
  justPlaced: boolean;
  offSurfaceM: number;
  input: DriveInput;
  /** For the trace: where the car stands right of its line, and whether it's on the laid surface. */
  rightOfLineM: number;
  onSurface: boolean;
}

/** What a grid run says of each racer every second, for diagnosing one. */
export type GridTrace = (line: string) => void;

export function vetGridRun(
  spec: GridSpec,
  loaded: LoadedRace,
  trace?: GridTrace,
): GridResult {
  const { race, world, laid } = loaded;
  if (spec.slots.length === 0 || spec.slots.length > race.grid.length)
    throw new Error(
      `${race.id} has ${race.grid.length} grid places, not ${spec.slots.length}`,
    );
  const roadAt = (slot: number) => {
    const place = race.grid[slot];
    const road = world.roads.nearest(place.x, place.z);
    if (!road) throw new Error(`${race.id}: no road at grid place ${slot}`);
    return { ...road, x: place.x, z: place.z, heading: place.heading };
  };
  const drive = new Drive(world, roadAt(0), spec.slots[0]);
  drive.condition = spec.condition;
  drive.tyres = spec.tyres;
  const entries: Entry[] = [];
  const skill = { cornerShare: spec.gripShare, brakeShare: spec.brakeShare };
  spec.slots.forEach((carId, slot) => {
    const car =
      slot === 0 ? drive.player : drive.addCar(roadAt(slot), carId, spec.tyres);
    const driven = racingLineFor(loaded, carId);
    const from = alongOfPlace(
      driven.line,
      race.grid[slot].x,
      race.grid[slot].z,
    );
    const entry: Entry = {
      slot,
      car,
      id: `racer-${slot}`,
      hits: 0,
      lastSpeed: 0,
      lastHitS: -Infinity,
      placed: false,
      justPlaced: false,
      offSurfaceM: 0,
      input: NO_INPUT,
      rightOfLineM: 0,
      onSurface: true,
      racer: null as unknown as Racer,
    };
    entry.racer = racerFor(
      loaded,
      driven,
      carId,
      spec.condition,
      spec.tyres,
      skill,
      from,
      (point) => {
        const road = world.roads.nearest(point.x, point.z);
        if (!road)
          throw new Error(
            `${race.id}: no road to reset to at ${point.x}, ${point.z}`,
          );
        const at = { ...road, x: point.x, z: point.z, heading: point.heading };
        if (slot === 0) drive.placeAt(at);
        else {
          car.place(at);
          car.land();
        }
        entry.placed = true;
      },
    );
    entries.push(entry);
  });
  const base = {
    index: spec.index,
    race: race.id,
    condition: spec.condition,
    skill: spec.skill,
  };
  const standings = (): Standing[] =>
    entries.map(({ racer }) => ({
      finishedS: racer.finishedS,
      progress: racer.progress,
    }));
  const placesNow = () =>
    entries.map((_, at) =>
      placeOf(
        standings()[at],
        standings().filter((__, other) => other !== at),
      ),
    );
  let places = placesNow();
  let passes = 0;
  let pileUps = 0;
  let pileS = 0;
  let nextPlacesS = PLACES_EVERY_S;
  let nextTraceS = 0;
  const longestS = race.lengthM / SLOWEST_MS + LONGEST_MARGIN_S;
  // A racer at its line's end unfinished missed a line on the way: it is said so, since it can never finish.
  const failedText = () => {
    const unfinished = entries.filter(({ racer }) => racer.finishedS === null);
    const ranOut = unfinished.filter(({ racer }) => racer.record.along >= racer.line.length - 10);
    return `${unfinished.length} racer(s) not over after ${longestS.toFixed(0)} s${ranOut.length > 0 ? `, ${ranOut.length} at the end of its line` : ""}`;
  };
  let clockS = -3;
  try {
    for (let step = 0; step < (longestS + 3) / STEP_S; step++) {
      const states = entries.map(({ car }) => car.stateAt(1));
      const seen: SeenCar[] = entries.map(({ id }, at) =>
        seenCarOf(id, states[at]),
      );
      let playerInput: DriveInput = NO_INPUT;
      entries.forEach((entry, at) => {
        const input = entry.racer.step(
          states[at],
          entry.placed,
          seen,
          entry.id,
        );
        entry.justPlaced = entry.placed;
        entry.placed = false;
        entry.input = input;
        if (at === 0) playerInput = input;
        else entry.car.input = input;
      });
      clockS = entries[0].racer.run.clockS;
      if (entries.every(({ racer }) => racer.finishedS !== null)) break;
      drive.step(playerInput);
      if (clockS < 0) continue;
      for (const entry of entries) {
        const state = entry.car.stateAt(1);
        const speed = speedOf(state);
        if (
          !entry.justPlaced &&
          entry.lastSpeed - speed > HIT_DROP_MS &&
          clockS - entry.lastHitS > HIT_APART_S
        ) {
          entry.hits++;
          entry.lastHitS = clockS;
        }
        entry.lastSpeed = speed;
        const under = laid.nearest(
          state.position[0],
          state.position[2],
          Math.atan2(-state.velocity[0], -state.velocity[2]),
        );
        if (under) {
          const offset =
            (state.position[0] - under.x) * Math.cos(under.heading) -
            (state.position[2] - under.z) * Math.sin(under.heading);
          const pastSurface =
            offset > 0
              ? offset - under.outerRightM
              : -offset - under.outerLeftM;
          if (pastSurface > 0) entry.offSurfaceM += speed * STEP_S;
          entry.onSurface = pastSurface <= 0;
        } else entry.onSurface = false;
        const onLine = entry.racer.line.at(entry.racer.record.along);
        entry.rightOfLineM = (state.position[0] - onLine.x) * Math.cos(onLine.heading) - (state.position[2] - onLine.z) * Math.sin(onLine.heading);
      }
      // A knot of racers stopped together.
      const slow = entries.filter(
        ({ car }) =>
          speedOf(car.stateAt(1)) < PILE_UP_SLOW_MS &&
          !entries.find((e) => e.car === car)?.racer.finishedS,
      );
      const knotted = slow.some(
        (one) =>
          slow.filter(
            (other) =>
              Math.hypot(
                other.car.position[0] - one.car.position[0],
                other.car.position[2] - one.car.position[2],
              ) < PILE_UP_WITHIN_M,
          ).length >= PILE_UP_CARS,
      );
      if (knotted) {
        pileS += STEP_S;
        if (pileS >= PILE_UP_AFTER_S && pileS - STEP_S < PILE_UP_AFTER_S)
          pileUps++;
      } else pileS = 0;
      if (trace && clockS >= nextTraceS) {
        for (const entry of entries) {
          const state = entry.car.stateAt(1);
          const { record } = entry.racer;
          trace(
            `${clockS.toFixed(0).padStart(4)} s slot ${entry.slot + 1} ${entry.racer.finishedS !== null ? "finished" : record.phase.padEnd(9)} ${record.along.toFixed(0).padStart(5)} m ${(speedOf(state) * 3.6).toFixed(0).padStart(3)} km/h at ${state.position[0].toFixed(0)}, ${state.position[2].toFixed(0)}; offset ${record.offsetM.toFixed(1)} hold ${entry.racer.craft.passing ? `passing ${entry.racer.craft.passing.id} on ${entry.racer.craft.passing.side}` : "-"}; hits ${entry.hits} resets ${record.resets}${record.lastReset ? ` (${record.lastReset})` : ""}; lines ${entry.racer.progress.toFixed(2)}; ${entry.rightOfLineM.toFixed(1)} right of line, ${entry.onSurface ? "on" : "OFF"} the surface; steer ${entry.input.steer.toFixed(2)} throttle ${entry.input.throttle.toFixed(2)} brake ${entry.input.brake.toFixed(2)}`,
          );
        }
        nextTraceS = clockS + TRACE_EVERY_S;
      }
      if (clockS >= nextPlacesS) {
        const now = placesNow();
        passes += now.filter((place, at) => place < places[at]).length;
        places = now;
        nextPlacesS += PLACES_EVERY_S;
      }
    }
    const final = placesNow();
    return {
      ...base,
      racers: entries.map((entry, at) => ({
        slot: entry.slot,
        car: spec.slots[at],
        finished: entry.racer.finishedS !== null,
        raceS: entry.racer.finishedS,
        place: final[at],
        hits: entry.hits,
        resets: entry.racer.record.resets,
        offSurfaceM: entry.offSurfaceM,
      })),
      passes,
      pileUps,
      simS: clockS,
      failed: entries.every(({ racer }) => racer.finishedS !== null) ? undefined : failedText(),
    };
  } finally {
    drive.dispose();
  }
}
