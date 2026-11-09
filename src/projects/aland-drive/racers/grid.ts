import { placeOf, type Standing } from "../challenge/standings";
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
import { tyresFor } from "./field";
import { Racer, type RacerHost } from "./racer";
import type { RaceLine } from "./race-line-file";
import { crestOf, signedCurvatureOf } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";
import { RACER_SKILL } from "./skill";
import { planSpeeds } from "./speed-plan";

/*
 * The racers of one race being played: each a simulated car of its own in the
 * player's world (`sim/drive.ts`), put on a place of the grid the players
 * don't take, driven by a `Racer` on the race's line, stepped before the world
 * each step with every car it can see, and read for the places. It owns no
 * renderer: the game draws each racer's car as it draws another player's,
 * tells it what else is on the road, and asks here where everyone stands.
 */

/** The tightest turn a plan asks of the steering is this much wider than the lock's own, for the tyres' slip. */
const STEERING_ROOM = 1.3;

export interface GridHost extends Omit<RacerHost, "reset"> {
  addCar(place: StartPlace, car: CarId, condition: Condition): SimulatedCar;
  removeCar(car: SimulatedCar): void;
  /** Puts a racer's car still at a point on the road, as the player's reset does. */
  resetCar(car: SimulatedCar, road: RoadPoint): void;
  condition(): Condition;
}

export interface GridRacer {
  /** Names the racer among everything drawn: its grid place. */
  id: string;
  car: SimulatedCar;
  racer: Racer;
  /** Put somewhere since the last step, so it crosses no line on the way. */
  placed: boolean;
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

export class RaceGrid {
  readonly racers: GridRacer[] = [];

  /**
   * `count` racers on the grid's places from the pole, each in a car of the field in turn, on the race's line and its
   * surface, in the world's condition.
   */
  constructor(
    readonly race: RaceChallenge,
    { line, pavedAt, geometry }: RaceLine,
    field: readonly CarId[],
    count: number,
    private readonly host: GridHost,
  ) {
    const condition = host.condition();
    const bends = signedCurvatureOf(line, ROUTE_STEP_M);
    const curvature = bends.map((bend) => Math.abs(bend));
    const crest = crestOf(line, ROUTE_STEP_M);
    for (let slot = 0; slot < Math.min(count, race.grid.length); slot++) {
      const carId = field[slot % field.length];
      const tuning = CARS[carId];
      const tyres = tyresFor(condition);
      const limits = { asphalt: limitsOn(carId, condition, "asphalt", tyres), gravel: limitsOn(carId, condition, "gravel", tyres) };
      const place = race.grid[slot];
      const from = alongOfPlace(line, place);
      const plan = planSpeeds({
        curvature,
        crest,
        stepM: ROUTE_STEP_M,
        limitsAt: (sample) => (pavedAt(sample * ROUTE_STEP_M) ? limits.asphalt : limits.gravel),
        cornerShare: RACER_SKILL.cornerShare,
        brakeShare: RACER_SKILL.brakeShare,
        tightestRadiusAt: (speed) => (STEERING_ROOM * wheelBaseOf(tuning)) / Math.tan(steerLimit(tuning, speed, false)),
        fromM: from,
      });
      const car = host.addCar(place, carId, condition);
      const [halfWidthM, , halfLengthM] = tuning.car.halfSize;
      const entry: GridRacer = {
        id: `racer-${slot}`,
        car,
        placed: false,
        racer: new Racer(
          race,
          line,
          plan,
          from,
          {
            reset: (road) => {
              host.resetCar(car, road);
              entry.placed = true;
            },
            inWater: host.inWater,
          },
          geometry,
          bends,
          halfWidthM,
          halfLengthM,
        ),
      };
      this.racers.push(entry);
    }
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

  /** Where each racer stands. */
  standings(): Standing[] {
    return this.racers.map(({ racer }) => ({ finishedS: racer.finishedS, progress: racer.progress }));
  }

  /** A player's place among the racers, from 1. */
  placeOf(player: Standing): number {
    return placeOf(player, this.standings());
  }

  /** The racers' cars out of the world. */
  dispose(): void {
    for (const { car } of this.racers) this.host.removeCar(car);
    this.racers.length = 0;
  }
}
