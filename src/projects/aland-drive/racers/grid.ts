import type { Standing } from "../challenge/standings";
import type { RaceChallenge, StartPlace } from "../challenge/types";
import { steerLimit } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import { headingOf, type CarState } from "../sim/car-state";
import { CARS, type CarId } from "../sim/cars";
import type { SimulatedCar } from "../sim/drive";
import type { RoadLine, RoadPoint } from "../sim/road-net";
import type { Condition } from "../sim/surfaces";
import { wheelBaseOf } from "../sim/tuning";
import type { SeenCar } from "./awareness";
import { gridCars, tyresFor } from "./field";
import { Racer, type RacerHost } from "./racer";
import type { RaceLine } from "./race-line-file";
import { crestOf, signedCurvatureOf } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";
import type { RacerDriver } from "./shared";
import { RACER_SKILL } from "./skill";
import { planSpeeds } from "./speed-plan";

/*
 * The racers of one race that this page runs: each a simulated car of its own
 * in the player's world (`sim/drive.ts`), driven by a `Racer` on the race's
 * line, stepped before the world each step with every car it can see, and
 * read for the places. One is put on its grid place fresh, or taken where
 * another page had it, carrying on from its record (`racers/shared.ts`), and
 * let go when another page runs it. It owns no renderer: the game draws each
 * racer's car as it draws another player's, and tells it what else is on the
 * road.
 */

/** The tightest turn a plan asks of the steering is this much wider than the lock's own, for the tyres' slip. */
const STEERING_ROOM = 1.3;

export interface GridHost extends Omit<RacerHost, "reset"> {
  addCar(place: StartPlace, car: CarId, condition: Condition): SimulatedCar;
  /** A racer handed here, where its state has it and moving as it moves. */
  addMovingCar(state: CarState, condition: Condition): SimulatedCar;
  removeCar(car: SimulatedCar): void;
  /** Puts a racer's car still at a point on the road, as the player's reset does. */
  resetCar(car: SimulatedCar, road: RoadPoint): void;
}

export interface GridRacer {
  /** Names the racer on every page: its race, attempt and grid place, or the player it replaced. */
  id: string;
  car: SimulatedCar;
  racer: Racer;
  /** Put somewhere since the last step, so it crosses no line on the way. */
  placed: boolean;
  /** What its plan is made from, carried with it to whoever runs it next. */
  fromM: number;
  condition: Condition;
  /** The attempt at the race it races in. */
  attempt: number;
}

/** A car as racers see it, from its state and its car's box. */
export function seenCarOf(id: string, state: CarState): SeenCar {
  const [halfWidthM, , halfLengthM] = CARS[state.car].car.halfSize;
  return { id, x: state.position[0], z: state.position[2], heading: headingOf(state.rotation), vx: state.velocity[0], vz: state.velocity[2], halfWidthM, halfLengthM };
}

/** Where along a line a place on the grid stands. */
function alongOfPlace(line: RoadLine, { x, z }: StartPlace): number {
  let best = { distance: Infinity, along: 0 };
  for (let along = 0; along <= Math.min(line.length, 1000); along += 1) {
    const point = line.at(along);
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < best.distance) best = { distance, along };
  }
  return best.along;
}

/**
 * How many racers a race gets: as many as asked, of the grid places the players don't take. The racers take the grid
 * from the pole and the players start at the back, the owner's call: a lead held from the pole was no race, and
 * taking it through the pack is.
 */
export const racersOn = (race: RaceChallenge, players: number, asked: number): number => Math.max(0, Math.min(asked, race.grid.length - players));

/** A player's place on the grid: the first behind the racers, seat by seat. */
export const startPlaceOf = (race: RaceChallenge, seat: number, players: number, asked: number): StartPlace => race.grid[racersOn(race, players, asked) + seat];

/** The racers a race's grid gets, from the pole: each slot's place, and a car of the field in turn, a repeat in another paint. */
export function gridSlots(race: RaceChallenge, field: readonly CarId[], count: number): { slot: number; place: StartPlace; car: CarId; paint: number }[] {
  return gridCars(field, Math.min(count, race.grid.length)).map(({ car, paint }, slot) => ({ slot, place: race.grid[slot], car, paint }));
}

export class RaceGrid {
  readonly racers: GridRacer[] = [];
  private readonly bends: Float64Array;
  private readonly curvature: Float64Array;
  private readonly crest: Float64Array;

  constructor(
    readonly race: RaceChallenge,
    private readonly raceLine: RaceLine,
    private readonly host: GridHost,
  ) {
    this.bends = signedCurvatureOf(raceLine.line, ROUTE_STEP_M);
    this.curvature = this.bends.map((bend) => Math.abs(bend));
    this.crest = crestOf(raceLine.line, ROUTE_STEP_M);
  }

  /** A car's plan on this line from a standing start at `fromM`, in a condition, on the tyres for it. */
  private planOf(carId: CarId, condition: Condition, fromM: number) {
    const tuning = CARS[carId];
    const tyres = tyresFor(condition);
    const limits = { asphalt: limitsOn(carId, condition, "asphalt", tyres), gravel: limitsOn(carId, condition, "gravel", tyres) };
    return planSpeeds({
      curvature: this.curvature,
      crest: this.crest,
      stepM: ROUTE_STEP_M,
      limitsAt: (sample) => (this.raceLine.pavedAt(sample * ROUTE_STEP_M) ? limits.asphalt : limits.gravel),
      cornerShare: RACER_SKILL.cornerShare,
      brakeShare: RACER_SKILL.brakeShare,
      tightestRadiusAt: (speed) => (STEERING_ROOM * wheelBaseOf(tuning)) / Math.tan(steerLimit(tuning, speed, false)),
      fromM,
    });
  }

  private enter(id: string, car: SimulatedCar, fromM: number, condition: Condition, attempt: number): GridRacer {
    if (this.racers.some((racer) => racer.id === id)) throw new Error(`the racer ${id} is already run here`);
    const [halfWidthM, , halfLengthM] = CARS[car.id].car.halfSize;
    const host = this.host;
    const entry: GridRacer = {
      id,
      car,
      placed: false,
      fromM,
      condition,
      attempt,
      racer: new Racer(
        this.race,
        this.raceLine.line,
        this.planOf(car.id, condition, fromM),
        fromM,
        {
          reset: (road) => {
            host.resetCar(car, road);
            entry.placed = true;
          },
          inWater: host.inWater,
        },
        this.raceLine.geometry,
        this.bends,
        halfWidthM,
        halfLengthM,
      ),
    };
    this.racers.push(entry);
    return entry;
  }

  /** A racer on its grid place, fresh, in the condition the race is run in. */
  place(id: string, attempt: number, place: StartPlace, carId: CarId, paint: number, condition: Condition): GridRacer {
    const car = this.host.addCar(place, carId, condition);
    car.paint = paint;
    return this.enter(id, car, alongOfPlace(this.raceLine.line, place), condition, attempt);
  }

  /** A racer another page ran, or one that takes a leaver's place: where its state has it, carrying on from its record. */
  take(id: string, state: CarState, driver: RacerDriver): GridRacer {
    if (driver.race !== this.race.id) throw new Error(`a racer of ${driver.race} handed to ${this.race.id}`);
    const car = this.host.addMovingCar(state, driver.condition);
    car.paint = state.paint ?? 0;
    const entry = this.enter(id, car, driver.fromM, driver.condition, driver.attempt);
    entry.racer.resume(driver.racer);
    return entry;
  }

  /** A racer run here no longer: its car out of this world, where a stand-in shows it as whoever runs it now has it. */
  release(id: string): void {
    const at = this.racers.findIndex((racer) => racer.id === id);
    if (at < 0) throw new Error(`the racer ${id} isn't run here`);
    this.host.removeCar(this.racers[at].car);
    this.racers.splice(at, 1);
  }

  /** A racer's record as it stands, to go with its car to everyone. */
  driverOf({ racer, fromM, condition, attempt }: GridRacer): RacerDriver {
    return { kind: "racer", race: this.race.id, attempt, fromM, condition, racer: racer.snapshot() };
  }

  /** The racers' cars as racers see them. */
  seen(): SeenCar[] {
    return this.racers.map(({ id, car }) => seenCarOf(id, car.stateAt(1)));
  }

  /** Before the world steps: every racer's input for the coming step, from where its car is now and what else is on the road. */
  step(others: readonly SeenCar[] = []): void {
    const seen = [...this.seen(), ...others];
    for (const entry of this.racers) {
      entry.car.input = entry.racer.step(entry.car.stateAt(1), entry.placed, seen, entry.id);
      entry.placed = false;
    }
  }

  /** Where each racer run here stands. */
  standings(): Standing[] {
    return this.racers.map(({ racer }) => ({ finishedS: racer.finishedS, progress: racer.progress }));
  }

  /** The racers' cars out of the world. */
  dispose(): void {
    for (const { car } of this.racers) this.host.removeCar(car);
    this.racers.length = 0;
  }
}
