import { pursuit } from "../sim/autopilot";
import { steerLimit, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { CARS } from "../sim/cars";
import type { RoadLine } from "../sim/road-net";
import { wheelBaseOf } from "../sim/tuning";
import { slowestAhead, type PacePlan } from "./speed-plan";

/*
 * The driver of a line and its speed plan: pure pursuit along the line (the
 * steering every computer-driven car shares, `sim/autopilot.ts`) and the
 * throttle and brake that hold the car at the plan's speed, looking a moment
 * ahead so the brakes are on by the time the plan falls. Racecraft steers it
 * by two numbers: an offset to run right of the line, and a speed to hold
 * under for a car ahead. It is a pure function of the car's state and its
 * place along the line, so the same drive comes out every time. The racer
 * grows out of it: recovery and racecraft are its own, and this is what every
 * one of them drives with underneath.
 */

/** How far ahead on the plan the driver holds its speed under: a reaction's worth, and never less than a car's length or so. */
const PLAN_AHEAD_S = 0.3;
const PLAN_AHEAD_LEAST_M = 6;
const PLAN_FROM_M = 2;
/** Throttle and brake for each metre a second off the planned speed: firm, so it brakes late and hard and holds its speed in a bend. */
const GAIN_PER_MS = 2;
/** The nearest the driver aims on its line: on a racing line's apex a long look cuts inside the line, so it looks a little nearer than the autopilot. */
const SHORTEST_LOOK_M = 8;
/**
 * How far ahead it aims at speed, in seconds of travel: much nearer than the autopilot's traffic looks, which never
 * races. A long look cuts every bend's inside and runs wide out of it, and the vetting tool read every step nearer as
 * cleaner (1.0, 0.75, 0.55, 0.4, 0.3 s: 0, 4, 6, 7 and 10 races clean of 32), with 0.2 s no better; scaling the look
 * by a car's steering lag, for the heavy and slow-racked cars that still swing from side to side, didn't help them.
 */
const LOOK_AHEAD_S = 0.3;
const SEARCH_M = 40;
const SEARCH_STEP_M = 2;
/**
 * Pure pursuit alone lets a car run a metre or two beside its line for a long way: a little steering towards the line
 * by how far off it is, softened at speed, closes that. Metres a second of sideways closing for each metre off.
 */
const CLOSE_PER_M = 0.15;
const CLOSE_SOFT_MS = 5;

/** A point on a line moved right of it. */
const rightOf = (point: { x: number; z: number; heading: number }, metres: number) => ({ x: point.x + metres * Math.cos(point.heading), z: point.z - metres * Math.sin(point.heading) });

export class LineDriver {
  /** How far along the line the car has got. */
  along: number;

  constructor(
    readonly line: RoadLine,
    readonly plan: PacePlan,
    from: number,
    private readonly shortestLookM = SHORTEST_LOOK_M,
  ) {
    this.along = from;
  }

  private follow(car: CarState): void {
    let best = this.along;
    let nearest = Infinity;
    for (let along = Math.max(this.along - SEARCH_M, 0); along <= this.along + SEARCH_M; along += SEARCH_STEP_M) {
      const point = this.line.at(along);
      const distance = Math.hypot(point.x - car.position[0], point.z - car.position[2]);
      if (distance < nearest) {
        nearest = distance;
        best = along;
      }
    }
    this.along = best;
  }

  /** The speed the plan asks for over the next moment: from just ahead, since the plan at a standing start is a standstill. */
  plannedSpeed(speed: number): number {
    return slowestAhead(this.plan, this.along + PLAN_FROM_M, this.along + Math.max(PLAN_AHEAD_LEAST_M, speed * PLAN_AHEAD_S));
  }

  /** The input for the coming step: along the line moved `offsetM` to the right, no faster than `holdUnderMS` where given. */
  input(car: CarState, offsetM = 0, holdUnderMS: number | null = null): DriveInput {
    this.follow(car);
    const speed = speedOf(car);
    const tuning = CARS[car.car];
    const ahead = rightOf(this.line.at(this.along + Math.max(this.shortestLookM, speed * LOOK_AHEAD_S)), offsetM);
    const here = this.line.at(this.along);
    // How far right of the line's offset the car stands: steering runs clockwise, so right of it asks for left.
    const rightOfLine = (car.position[0] - here.x) * Math.cos(here.heading) - (car.position[2] - here.z) * Math.sin(here.heading) - offsetM;
    const wheels = pursuit({ x: car.position[0], z: car.position[2] }, headingOf(car.rotation), ahead, wheelBaseOf(tuning)) - Math.atan((CLOSE_PER_M * rightOfLine) / (speed + CLOSE_SOFT_MS));
    const wanted = holdUnderMS === null ? this.plannedSpeed(speed) : Math.min(this.plannedSpeed(speed), holdUnderMS);
    const error = wanted - speed;
    return {
      throttle: Math.max(0, Math.min(1, error * GAIN_PER_MS)),
      brake: Math.max(0, Math.min(1, -error * GAIN_PER_MS)),
      steer: Math.max(-1, Math.min(1, wheels / steerLimit(tuning, speed, false))),
      handbrake: false,
    };
  }
}
