import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { LaneTraffic } from "./lane-driver";
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
