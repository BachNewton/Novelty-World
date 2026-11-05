import { steerLimit, type DriveInput } from "./car";
import { headingOf, speedOf, type CarState } from "./car-state";
import type { RoadLine } from "./road-net";
import { CARS } from "./cars";
import { wheelBaseOf } from "./tuning";

/*
 * A plain driver for measuring: pure pursuit along one line, as fast as the
 * bends ahead allow. It stands in for a player in the scripted drive, and being
 * a pure function of the car's state and its place on the road, the same drive
 * comes out every time. Its steering (`pursuit`) is every computer-driven car's:
 * traffic steers along its lanes with it too.
 */

const LOOK_AHEAD_S = 0.75;
const SHORTEST_LOOK_M = 10;
const SPEED_LOOK_S = 5;
const LOOK_STEPS = 12;
const CORNER_MS2 = 9;
const THROTTLE_PER_MS = 0.5;
const SEARCH_M = 40;
const SEARCH_STEP_M = 2;
/** How finely a speed plan reads the road ahead, and how much further than a stop it looks. */
const PLAN_STEP_M = 4;
const PLAN_MARGIN_M = 30;
/** Seconds of the speed it carries before the brakes bite, so it never plans a stop to the last metre. */
const PLAN_REACTION_S = 0.25;
/** Throttle and brake for each metre a second off the planned speed: firmer than a cruise's, so it brakes late and hard. */
const PLAN_PER_MS = 2;

/** The grip a driver can count on at each place along its line: the ground there, for the car being driven. */
export interface SpeedPlan {
  gripAt(along: number): { cornerMS2: number; brakeMS2: number };
  /** The least braking anywhere, which sets how far ahead it has to look. */
  leastBrakeMS2: number;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** How far ahead on its line a driver aims at a speed: further the faster it goes, never nearer than `shortest`. */
export const lookAheadM = (speedMS: number, shortest = SHORTEST_LOOK_M) => Math.max(shortest, speedMS * LOOK_AHEAD_S);

/**
 * Pure pursuit, the steering every computer-driven car shares: the front wheels' angle that arcs a car from its rear axle,
 * facing `heading` (radians anticlockwise from north), through a point ahead on its line. Positive steers right.
 */
export function pursuit(from: { x: number; z: number }, heading: number, target: { x: number; z: number }, wheelBaseM: number): number {
  const off = wrap(Math.atan2(-(target.x - from.x), -(target.z - from.z)) - heading);
  const distance = Math.max(Math.hypot(target.x - from.x, target.z - from.z), 1e-3);
  // Heading runs anticlockwise; steering, clockwise.
  return Math.atan((2 * wheelBaseM * Math.sin(-off)) / distance);
}

export class Autopilot {
  /** How far along the line the car has got. */
  along: number;

  constructor(
    private readonly line: RoadLine,
    /** The speed to hold where the road allows it. */
    private readonly cruiseMS: number,
    from: number,
    /** How near the line's end counts as there. */
    private readonly endsWithinM = 60,
    /** Tighter for a slow, narrow corner, which a long look cuts. */
    private readonly shortestLookM = SHORTEST_LOOK_M,
    /**
     * Without one, it takes every bend at one sideways pull whatever the car, slowing
     * as soon as a bend comes into view. With one, it brakes for each bend as late as the
     * ground's grip allows, as a measure of a car's real pace needs.
     */
    private readonly plan?: SpeedPlan,
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

  /** True once the car is near enough the line's far end, by default within a stopping distance. */
  finished(): boolean {
    return this.along >= this.line.length - this.endsWithinM;
  }

  input(car: CarState): DriveInput {
    this.follow(car);
    const speed = speedOf(car);
    const ahead = this.line.at(this.along + lookAheadM(speed, this.shortestLookM));
    const wheels = pursuit({ x: car.position[0], z: car.position[2] }, headingOf(car.rotation), ahead, wheelBaseOf(CARS[car.car]));

    const allowed = this.plan ? this.planned(speed, this.plan) : this.cruising(speed);
    const error = allowed - speed;
    const gain = this.plan ? PLAN_PER_MS : THROTTLE_PER_MS;
    return {
      throttle: Math.max(0, Math.min(1, error * gain)),
      brake: Math.max(0, Math.min(1, -error * gain)),
      steer: Math.max(-1, Math.min(1, wheels / steerLimit(CARS[car.car], speed, false))),
      handbrake: false,
    };
  }

  private bendAt(along: number): number {
    return Math.abs(wrap(this.line.at(along + 12).heading - this.line.at(along - 12).heading)) / 24;
  }

  /** The slowest any bend in the next few seconds asks for. */
  private cruising(speed: number): number {
    let allowed = this.cruiseMS;
    for (let step = 1; step <= LOOK_STEPS; step++) {
      const bend = this.bendAt(this.along + (step / LOOK_STEPS) * Math.max(speed * SPEED_LOOK_S, 40));
      if (bend > 1e-5) allowed = Math.min(allowed, Math.sqrt(CORNER_MS2 / bend));
    }
    return allowed;
  }

  /** The fastest it can go here and still brake to every bend ahead in time, on the grip of the ground under each. */
  private planned(speed: number, plan: SpeedPlan): number {
    let allowed = this.cruiseMS;
    const brakingHere = plan.gripAt(this.along).brakeMS2;
    const horizon = (speed * speed) / (2 * plan.leastBrakeMS2) + speed * PLAN_REACTION_S + PLAN_MARGIN_M;
    for (let ahead = 0; ahead <= horizon; ahead += PLAN_STEP_M) {
      const along = this.along + ahead;
      const bend = this.bendAt(along);
      if (bend <= 1e-5) continue;
      const { cornerMS2, brakeMS2 } = plan.gripAt(along);
      const braking = Math.max(ahead - speed * PLAN_REACTION_S, 0);
      // It brakes from here to the bend, so on the poorer of the two grounds.
      allowed = Math.min(allowed, Math.sqrt(cornerMS2 / bend + 2 * Math.min(brakeMS2, brakingHere) * braking));
    }
    return allowed;
  }
}
