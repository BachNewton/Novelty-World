import { steerLimit, type DriveInput } from "./car";
import { headingOf, speedOf, type CarState } from "./car-state";
import type { RoadNet } from "./road-net";
import { CAR } from "./tuning";

/*
 * A plain driver for measuring: pure pursuit along one chain, as fast as the
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
  /** How far along the chain the car has got. */
  along: number;

  constructor(
    private readonly net: RoadNet,
    private readonly chain: number,
    /** The speed to hold where the road allows it. */
    private readonly cruiseMS: number,
    from: number,
  ) {
    this.along = from;
  }

  private follow(car: CarState): void {
    let best = this.along;
    let nearest = Infinity;
    for (let along = this.along - SEARCH_M; along <= this.along + SEARCH_M; along += SEARCH_STEP_M) {
      const point = this.net.at(this.chain, along);
      const distance = Math.hypot(point.x - car.position[0], point.z - car.position[2]);
      if (distance < nearest) {
        nearest = distance;
        best = along;
      }
    }
    this.along = best;
  }

  /** True once the car is within a stopping distance of the chain's far end. */
  finished(): boolean {
    return this.along >= this.net.lengthOf(this.chain) - 60;
  }

  input(car: CarState): DriveInput {
    this.follow(car);
    const speed = speedOf(car);
    const ahead = this.net.at(this.chain, this.along + Math.max(SHORTEST_LOOK_M, speed * LOOK_AHEAD_S));
    const toTarget = Math.atan2(-(ahead.x - car.position[0]), -(ahead.z - car.position[2]));
    const off = wrap(toTarget - headingOf(car.rotation));
    const distance = Math.hypot(ahead.x - car.position[0], ahead.z - car.position[2]);
    // Pure pursuit's arc to the target, as the wheels' angle. Heading runs anticlockwise; steering, clockwise.
    const wheels = Math.atan((2 * CAR.wheelBaseM * Math.sin(-off)) / distance);

    let allowed = this.cruiseMS;
    for (let step = 1; step <= LOOK_STEPS; step++) {
      const reach = this.along + (step / LOOK_STEPS) * Math.max(speed * SPEED_LOOK_S, 40);
      const bend = Math.abs(wrap(this.net.at(this.chain, reach + 12).heading - this.net.at(this.chain, reach - 12).heading)) / 24;
      if (bend > 1e-5) allowed = Math.min(allowed, Math.sqrt(CORNER_MS2 / bend));
    }

    const error = allowed - speed;
    return {
      throttle: Math.max(0, Math.min(1, error * THROTTLE_PER_MS)),
      brake: Math.max(0, Math.min(1, -error * THROTTLE_PER_MS)),
      steer: Math.max(-1, Math.min(1, wheels / steerLimit(speed, false))),
      handbrake: false,
    };
  }
}
