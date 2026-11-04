import { steerLimit, type DriveInput } from "./car";
import { headingOf, speedOf, type CarState } from "./car-state";
import type { RoadLine } from "./road-net";
import { CARS } from "./cars";
import { wheelBaseOf } from "./tuning";

/*
 * A plain driver for measuring: pure pursuit along one line, as fast as the
 * bends ahead allow. It stands in for a player in the scripted drive, and being
 * a pure function of the car's state and its place on the road, the same drive
 * comes out every time.
 */

const LOOK_AHEAD_S = 0.75;
const SHORTEST_LOOK_M = 10;
const SPEED_LOOK_S = 5;
const LOOK_STEPS = 12;
const CORNER_MS2 = 9;
const THROTTLE_PER_MS = 0.5;
const SEARCH_M = 40;
const SEARCH_STEP_M = 2;

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

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
    /** The sideways pull it takes a bend at: one for every car unless a measure asks for a car's own. */
    private readonly cornerMS2 = CORNER_MS2,
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
    const ahead = this.line.at(this.along + Math.max(this.shortestLookM, speed * LOOK_AHEAD_S));
    const toTarget = Math.atan2(-(ahead.x - car.position[0]), -(ahead.z - car.position[2]));
    const off = wrap(toTarget - headingOf(car.rotation));
    const distance = Math.hypot(ahead.x - car.position[0], ahead.z - car.position[2]);
    // Pure pursuit's arc to the target, as the wheels' angle. Heading runs anticlockwise; steering, clockwise.
    const wheels = Math.atan((2 * wheelBaseOf(CARS[car.car]) * Math.sin(-off)) / distance);

    let allowed = this.cruiseMS;
    for (let step = 1; step <= LOOK_STEPS; step++) {
      const reach = this.along + (step / LOOK_STEPS) * Math.max(speed * SPEED_LOOK_S, 40);
      const bend = Math.abs(wrap(this.line.at(reach + 12).heading - this.line.at(reach - 12).heading)) / 24;
      if (bend > 1e-5) allowed = Math.min(allowed, Math.sqrt(this.cornerMS2 / bend));
    }

    const error = allowed - speed;
    return {
      throttle: Math.max(0, Math.min(1, error * THROTTLE_PER_MS)),
      brake: Math.max(0, Math.min(1, -error * THROTTLE_PER_MS)),
      steer: Math.max(-1, Math.min(1, wheels / steerLimit(CARS[car.car], speed, false))),
      handbrake: false,
    };
  }
}
