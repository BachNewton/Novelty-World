import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { LaneTraffic, SIGNAL, type LaneCar, type DrivenCar } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { junctionTile, overTheSeam, touching, twoWayRoad } from "./test-lanes";

const traffic = () => {
  const net = new LaneNet();
  net.add("A", decodeLanes(junctionTile()));
  net.add("B", decodeLanes(overTheSeam()));
  return new LaneTraffic(net, [[0.92, 2.3]]);
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

const HALF: readonly [number, number] = [0.92, 2.3];

const outlineOf = (car: LaneCar) => ({ x: car.pose.x, z: car.pose.z, yaw: car.pose.yaw, half: car.half });
const playerOutline = (player: DrivenCar) => ({ x: player.x, z: player.z, yaw: player.heading, half: player.half });

const onRoad = (width: number) => {
  const net = new LaneNet();
  net.add("R", decodeLanes(twoWayRoad(width)));
  return new LaneTraffic(net, [HALF]);
};

/** Two cars meeting head on along a road, at 60 km/h: whether they ever touch, how slow each got, and whether they got past each other. */
function meet(width: number) {
  const cars = onRoad(width);
  const east = cars.spawn({ tile: "R", index: 0, connector: false, along: 60 }, 60 / 3.6);
  const west = cars.spawn({ tile: "R", index: 1, connector: false, along: 60 }, 60 / 3.6);
  let touched = false;
  const slowest = { east: Infinity, west: Infinity };
  for (let step = 0; step < 40 / STEP_S && east.pose.x < west.pose.x + 10; step++) {
    cars.step(STEP_S);
    touched ||= touching(outlineOf(east), outlineOf(west));
    slowest.east = Math.min(slowest.east, east.speedMS);
    slowest.west = Math.min(slowest.west, west.speedMS);
  }
  return { touched, slowest, passed: east.pose.x > west.pose.x + 10 };
}

describe("cars meeting on a narrow road", () => {
  it("ease to their edges and slow as they pass, rather than clip through each other", () => {
    // 3.6 m: each lane's middle 1.8 m from the other's, a hand's width short of two cars' 1.84.
    const { touched, slowest, passed } = meet(3.6);
    expect(touched).toBe(false);
    expect(passed).toBe(true);
    expect(Math.max(slowest.east, slowest.west)).toBeLessThan(30 / 3.6);
  });

  it("on a track with no room for both to drive by, one stops on its verge for the other", () => {
    const { touched, slowest, passed } = meet(2.6);
    expect(touched).toBe(false);
    expect(passed).toBe(true);
    expect(Math.min(slowest.east, slowest.west)).toBeLessThan(0.5);
  });

  it("in queues both ways on a single track, one way waits on its verge for the whole of the other, and none is stuck", () => {
    const cars = onRoad(2.7);
    const east = [0, 1, 2].map((n) => cars.spawn({ tile: "R", index: 0, connector: false, along: 40 - n * 15 }, 8));
    const west = [0, 1, 2].map((n) => cars.spawn({ tile: "R", index: 1, connector: false, along: 200 - n * 15 }, 8));
    let touched = false;
    for (let step = 0; step < 60 / STEP_S; step++) {
      cars.step(STEP_S);
      for (const one of east) for (const other of west) touched ||= touching(outlineOf(one), outlineOf(other));
    }
    expect(touched).toBe(false);
    expect(Math.min(...east.map((car) => car.pose.x))).toBeGreaterThan(Math.max(...west.map((car) => car.pose.x)));
  });

  it("drive by on a road wide enough without slowing", () => {
    const { touched, slowest } = meet(7);
    expect(touched).toBe(false);
    expect(Math.min(slowest.east, slowest.west)).toBeGreaterThan(50 / 3.6);
  });
});

describe("traffic and the player's car", () => {
  // Standing in the eastbound lane, a little askew, or square across the centre line, which leaves the least room to
  // pull out in; either way with an oncoming car that reaches it about when the traffic car does.
  it.each([
    ["in its lane, askew", 1.6, 0.2],
    ["on the centre line", 0.2, 0],
  ])("stops behind the player's car standing %s, then goes round it once nothing is coming", (_, z, askew) => {
    // A two-lane country road, stepped at the game's rate.
    const cars = onRoad(6);
    const car = cars.spawn({ tile: "R", index: 0, connector: false, along: 20 }, 50 / 3.6);
    const player: DrivenCar = { id: "player", x: 150, z, heading: -Math.PI / 2 + askew, vx: 0, vz: 0, half: [0.95, 2.2] };
    const oncoming = cars.spawn({ tile: "R", index: 1, connector: false, along: 140 }, 50 / 3.6);
    cars.setDriven([player]);
    let touched = false;
    let stood = 0;
    let outWithOncomingAhead = false;
    for (let step = 0; step < 60 / (4 * STEP_S) && car.pose.x < player.x + 20; step++) {
      cars.step(4 * STEP_S);
      touched ||= touching(outlineOf(car), playerOutline(player));
      if (car.speedMS < 0.1) stood += 4 * STEP_S;
      outWithOncomingAhead ||= car.shiftM < -0.5 && cars.count() === 2 && oncoming.pose.x > car.pose.x;
    }
    expect(touched).toBe(false);
    expect(stood).toBeGreaterThan(2);
    expect(outWithOncomingAhead).toBe(false);
    expect(car.pose.x).toBeGreaterThan(player.x + 20);
  });

  it("brakes for the player's car across its path, whatever way it faces", () => {
    const cars = onRoad(7);
    const car = cars.spawn({ tile: "R", index: 0, connector: false, along: 40 }, 70 / 3.6);
    // Creeping north across the road, out of a drive.
    const player: DrivenCar = { id: "player", x: 140, z: 6, heading: 0, vx: 0, vz: -1.2, half: [0.95, 2.2] };
    let touched = false;
    for (let step = 0; step < 30 / STEP_S; step++) {
      player.z += player.vz * STEP_S;
      cars.setDriven([player]);
      cars.step(STEP_S);
      touched ||= touching(outlineOf(car), playerOutline(player));
    }
    expect(touched).toBe(false);
    expect(car.pose.x).toBeGreaterThan(player.x);
  });
});

