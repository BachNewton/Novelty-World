import { placeOf, type Standing } from "../challenge/standings";
import type { RaceChallenge, StartPlace } from "../challenge/types";
import { steerLimit } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import { CARS, type CarId } from "../sim/cars";
import type { SimulatedCar } from "../sim/drive";
import type { RoadLine, RoadPoint } from "../sim/road-net";
import type { Condition } from "../sim/surfaces";
import { wheelBaseOf } from "../sim/tuning";
import { SKILLS, type Difficulty } from "./difficulty";
import { tyresFor } from "./field";
import { Racer, type RacerHost } from "./racer";
import { crestOf, curvatureOf } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";
import { planSpeeds } from "./speed-plan";

/*
 * The racers of one race being played: each a simulated car of its own in the
 * player's world (`sim/drive.ts`), put on a place of the grid the players
 * don't take, driven by a `Racer` on the race's line at a difficulty, stepped
 * before the world each step, and read for the places. It owns no renderer:
 * the game draws each racer's car as it draws another player's, and asks here
 * where everyone stands.
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
  difficulty: Difficulty;
  /** Put somewhere since the last step, so it crosses no line on the way. */
  placed: boolean;
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

export class RaceGrid {
  readonly racers: GridRacer[] = [];

  /**
   * Racers on the grid's places from `firstSlot` on, each in a car of the field in turn, on the race's line and its
   * surface, at a difficulty, in the world's condition: as many as asked and the grid has room for.
   */
  constructor(
    readonly race: RaceChallenge,
    line: RoadLine,
    pavedAt: (alongM: number) => boolean,
    field: readonly CarId[],
    difficulty: Difficulty,
    count: number,
    firstSlot: number,
    private readonly host: GridHost,
  ) {
    const condition = host.condition();
    const curvature = curvatureOf(line, ROUTE_STEP_M);
    const crest = crestOf(line, ROUTE_STEP_M);
    const skill = SKILLS[difficulty];
    for (let slot = firstSlot, made = 0; slot < race.grid.length && made < count; slot++, made++) {
      const carId = field[made % field.length];
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
        cornerShare: skill.cornerShare,
        brakeShare: skill.brakeShare,
        tightestRadiusAt: (speed) => (STEERING_ROOM * wheelBaseOf(tuning)) / Math.tan(steerLimit(tuning, speed, false)),
        fromM: from,
      });
      const car = host.addCar(place, carId, condition);
      const entry: GridRacer = {
        id: `racer-${slot}`,
        car,
        difficulty,
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
          skill.throttleShare,
        ),
      };
      this.racers.push(entry);
    }
  }

  /** Before the world steps: every racer's input for the coming step, from where its car is now. */
  step(): void {
    for (const entry of this.racers) {
      entry.car.input = entry.racer.step(entry.car.stateAt(1), entry.placed);
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
