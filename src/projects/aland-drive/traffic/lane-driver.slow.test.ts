import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { LaneTraffic } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { touching, twoWayRoad } from "./test-lanes";

/*
 * A single track kept full both ways for three minutes, as the lane lab's spawner fills a quiet country road: the
 * passing rules only show a jam (two queues each waiting for the other, or one waiting for good) after many meetings
 * of cars in queues, which no short case reaches. Seeded, so each run is the same.
 */

const EVERY = 4;

function busyTrack(width: number, seed: number) {
  const net = new LaneNet();
  net.add("R", decodeLanes(twoWayRoad(width, 1000)));
  const cars = new LaneTraffic(net, [[0.92, 2.3], [0.73, 1.375], [0.99, 2.75]], seed);
  const still = new Map<string, number>();
  const born = new Map<string, number>();
  let longestStill = 0;
  let touches = 0;
  for (let step = 0; step < 180 / (STEP_S * EVERY); step++) {
    cars.keep(500, 0, 20, 500, 0);
    cars.step(STEP_S * EVERY);
    const all = [...cars.all()];
    for (const car of all) {
      if (!born.has(car.id)) born.set(car.id, step);
      const time = car.speedMS < 0.3 ? (still.get(car.id) ?? 0) + STEP_S * EVERY : 0;
      still.set(car.id, time);
      longestStill = Math.max(longestStill, time);
    }
    // A car put down head on a few seconds from another is the stand-in spawner's doing, not the driver's.
    const settled = all.filter((car) => (step - (born.get(car.id) ?? 0)) * STEP_S * EVERY > 5);
    for (const one of settled) for (const other of settled) if (one.id < other.id && Math.cos(one.pose.yaw - other.pose.yaw) < 0 && touching({ ...one.pose, half: one.half }, { ...other.pose, half: other.half })) touches++;
  }
  return { longestStill, touches };
}

describe("a single track busy both ways", () => {
  for (const [width, seed] of [
    [2.5, 1],
    [2.7, 2],
    [3.2, 1],
  ])
    it(`${width} m wide: the two ways take turns, none stands still for long and none touch (seed ${seed})`, () => {
      const { longestStill, touches } = busyTrack(width, seed);
      expect(longestStill).toBeLessThan(45);
      expect(touches).toBe(0);
    });
});
