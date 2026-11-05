import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { LaneTraffic, SIGNAL } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { junctionTile, overTheSeam } from "./test-lanes";

const traffic = () => {
  const net = new LaneNet();
  net.add("A", decodeLanes(junctionTile()));
  net.add("B", decodeLanes(overTheSeam()));
  return new LaneTraffic(net, 1);
};

describe("cars driving the lanes", () => {
  it("follow one another without closing in, through a junction and over a seam", () => {
    const cars = traffic();
    const leader = cars.spawn({ tile: "A", index: 0, connector: false, along: 60 }, 5);
    const follower = cars.spawn({ tile: "A", index: 0, connector: false, along: 0 }, 70 / 3.6);
    let closest = Infinity;
    const reached = new Set<string>();
    for (let step = 0; step < 400 / STEP_S && cars.count() === 2; step++) {
      cars.step(STEP_S);
      closest = Math.min(closest, Math.hypot(leader.pose.x - follower.pose.x, leader.pose.z - follower.pose.z));
      reached.add(follower.place.tile);
    }
    expect(closest).toBeGreaterThan(6);
    expect(reached).toContain("B");
  });

  it("turn through a junction a little each step, swinging round on their axles rather than at each corner of the line", () => {
    const cars = traffic();
    const turning = cars.spawn({ tile: "A", index: 2, connector: false, along: 70 }, 6);
    let sharpest = 0;
    for (let step = 0; step < 15 / STEP_S && cars.count() === 1; step++) {
      const before = turning.pose.yaw;
      cars.step(STEP_S);
      let turn = turning.pose.yaw - before;
      turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
      sharpest = Math.max(sharpest, Math.abs(turn));
    }
    expect(turning.place).toMatchObject({ index: 1, connector: false });
    expect(sharpest).toBeLessThan(0.05);
  });

  it("steer through a turn on their wheels and keep close to the lane", () => {
    const cars = traffic();
    const turning = cars.spawn({ tile: "A", index: 2, connector: false, along: 40 }, 8);
    let furthest = 0;
    for (let step = 0; step < 20 / STEP_S && cars.count() === 1 && turning.place.index !== 1; step++) {
      cars.step(STEP_S);
      // The lane under the car runs north (the side road) and then east: whichever it's on, how far the car is off it.
      const off = turning.place.connector ? 0 : turning.place.index === 2 ? Math.abs(turning.pose.x - 100) : Math.abs(turning.pose.z);
      furthest = Math.max(furthest, off);
    }
    expect(turning.place).toMatchObject({ index: 1 });
    expect(furthest).toBeLessThan(0.75);
  });

  it("signal a turn before its junction, and nothing going straight on", () => {
    const cars = traffic();
    const turning = cars.spawn({ tile: "A", index: 2, connector: false, along: 30 }, 8);
    const straight = cars.spawn({ tile: "A", index: 0, connector: false, along: 30 }, 8);
    const signalled = { turning: new Set<number>(), straight: new Set<number>() };
    let signalledFrom = 0;
    for (let step = 0; step < 15 / STEP_S && cars.count() === 2; step++) {
      cars.step(STEP_S);
      signalled.turning.add(turning.signal);
      signalled.straight.add(straight.signal);
      if (turning.signal === SIGNAL.right && !turning.place.connector) signalledFrom = Math.max(signalledFrom, 95 - turning.place.along);
    }
    expect(signalled.turning).toContain(SIGNAL.right);
    expect(signalled.turning).not.toContain(SIGNAL.left);
    expect([...signalled.straight]).toEqual([SIGNAL.off]);
    // Signalled for the last 35 m or 4 s, whichever is further: not the whole lane and not only at the line.
    expect(signalledFrom).toBeGreaterThan(30);
    expect(signalledFrom).toBeLessThan(55);
  });

  it("keep a turn waiting at its line while something it gives way to is coming, then let it go", () => {
    const cars = traffic();
    const main = cars.spawn({ tile: "A", index: 0, connector: false, along: 20 }, 70 / 3.6);
    const side = cars.spawn({ tile: "A", index: 2, connector: false, along: 80 }, 8);
    let turnedWith: typeof main.place | null = null;
    for (let step = 0; step < 30 / STEP_S && !turnedWith; step++) {
      cars.step(STEP_S);
      if (side.place.connector) turnedWith = main.place;
    }
    expect(turnedWith).toMatchObject({ index: 1, connector: false });
  });
});
