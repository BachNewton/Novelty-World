import type { RoadLine } from "../sim/road-net";

/*
 * What a racer sees of the cars around it (`ideas/traffic-and-racers.md`,
 * "Overtaking and defending"): every car, other players' and traffic
 * included, placed on the racer's own line, so the questions racecraft asks
 * are one-dimensional: how far ahead or behind along my way, how far to my
 * left or right of it, going my way or against it, and closing how fast.
 * Nothing here knows the lane map; a racer reads everything along its route,
 * as the design settled.
 */

/** A car as a racer sees it: its middle, the way its nose points (radians anticlockwise from north), its velocity and its half sizes. */
export interface SeenCar {
  id: string;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  halfWidthM: number;
  halfLengthM: number;
}

/** A seen car placed on the racer's line. */
export interface Relative {
  car: SeenCar;
  /** Metres ahead of the racer along the line, below zero behind. */
  alongM: number;
  /** Metres right of the line where it stands. */
  lateralM: number;
  /** Whether it points the line's way, within a right angle. */
  sameWay: boolean;
  /** Its speed along the line's way there, below zero against it. */
  speedAlongMS: number;
}

/** How far behind and ahead a racer looks, and how finely it places a car on its line. */
const BEHIND_M = 60;
const AHEAD_M = 200;
const PLACE_STEP_M = 4;
/** A car further than this from the line isn't on the racer's road. */
const OFF_ROAD_M = 16;
const SAME_WAY_COSINE = 0.3;

/**
 * The cars around a racer placed on its line, nearest first. `along` is where the racer is on the line and `self` its
 * own id, which it doesn't see.
 */
export function placeOnLine(line: RoadLine, along: number, self: string, seen: readonly SeenCar[]): Relative[] {
  const placed: Relative[] = [];
  const from = Math.max(0, along - BEHIND_M);
  const to = Math.min(line.length, along + AHEAD_M);
  for (const car of seen) {
    if (car.id === self) continue;
    // Only a car near enough to matter is placed at all.
    const here = line.at(along);
    if (Math.hypot(car.x - here.x, car.z - here.z) > AHEAD_M + OFF_ROAD_M) continue;
    let best = { distance: Infinity, at: along };
    for (let at = from; at <= to; at += PLACE_STEP_M) {
      const point = line.at(at);
      const distance = Math.hypot(point.x - car.x, point.z - car.z);
      if (distance < best.distance) best = { distance, at };
    }
    if (best.distance > OFF_ROAD_M) continue;
    const point = line.at(best.at);
    const lateralM = (car.x - point.x) * Math.cos(point.heading) - (car.z - point.z) * Math.sin(point.heading);
    const forwardX = -Math.sin(point.heading);
    const forwardZ = -Math.cos(point.heading);
    placed.push({
      car,
      alongM: best.at - along,
      lateralM,
      sameWay: Math.cos(car.heading - point.heading) > SAME_WAY_COSINE,
      speedAlongMS: car.vx * forwardX + car.vz * forwardZ,
    });
  }
  return placed.sort((a, b) => Math.abs(a.alongM) - Math.abs(b.alongM));
}
