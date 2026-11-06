import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { LaneTraffic, SIGNAL, type LaneCar, type DrivenCar } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { encoded, footwaysAcrossRoad, junctionTile, lane, overTheSeam, pathMeetsRoad, touching, twoWayPath, twoWayRoad } from "./test-lanes";

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

  it("carry on through a junction from a lane whose last point is written twice, as the pipeline sometimes writes it", () => {
    const net = new LaneNet();
    const tile = junctionTile();
    tile.lanes[0] = lane([[0, 0, 0], [95, 0, 0], [95, 0, 0]]);
    net.add("A", decodeLanes(tile));
    const cars = new LaneTraffic(net, [[0.92, 2.3]]);
    const car = cars.spawn({ tile: "A", index: 0, connector: false, along: 60 }, 8);
    for (let step = 0; step < 10 / STEP_S; step++) cars.step(STEP_S);
    expect(car.place).toMatchObject({ index: 1, connector: false });
    expect(car.offLaneM).toBeLessThan(0.5);
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


describe("cyclists", () => {
  /** How near two outlines on the ground come across the way they drive, while side by side: none if never alongside. */
  const besideGap = (a: LaneCar, b: LaneCar) => (Math.abs(a.pose.x - b.pose.x) < a.half[1] + b.half[1] ? Math.abs(a.pose.z - b.pose.z) - a.half[0] - b.half[0] : Infinity);

  it("are overtaken by a car with room to spare, only once the oncoming side is clear", () => {
    const net = new LaneNet();
    net.add("R", decodeLanes(twoWayRoad(6, 1000)));
    const cars = new LaneTraffic(net, [HALF]);
    const bike = cars.spawn({ tile: "R", index: 0, connector: false, along: 120 }, 5, { kind: "bike", seed: 3 });
    const car = cars.spawn({ tile: "R", index: 0, connector: false, along: 20 }, 60 / 3.6);
    // Coming the other way about when the car has caught the cyclist up and waited behind it.
    const oncoming = cars.spawn({ tile: "R", index: 1, connector: false, along: 480 }, 50 / 3.6);
    let closest = Infinity;
    let touched = false;
    let outWithOncomingNear = false;
    for (let step = 0; step < 60 / (4 * STEP_S) && car.pose.x < bike.pose.x + 20; step++) {
      cars.step(4 * STEP_S);
      touched ||= touching(outlineOf(car), outlineOf(bike)) || touching(outlineOf(car), outlineOf(oncoming));
      closest = Math.min(closest, besideGap(car, bike));
      outWithOncomingNear ||= car.shiftM < -0.5 && cars.get(oncoming.id) !== undefined && oncoming.pose.x > car.pose.x && oncoming.pose.x - car.pose.x < 60;
    }
    expect(touched).toBe(false);
    expect(outWithOncomingNear).toBe(false);
    expect(car.pose.x).toBeGreaterThan(bike.pose.x + 20);
    expect(closest).toBeGreaterThan(1);
  });

  it("turn off a road on to a path at a square corner, as a link can be, and ride on along the path", () => {
    const file = pathMeetsRoad();
    // Straight across from the lane to the path's start, and the path off south-west from there, back the way the
    // cyclist came, so a rider that cuts the corner never passes it.
    file.lanes[3] = lane([[300, 0, 4], [290, 0, 14], [250, 0, 54]], { kind: "cycleway", width: 1, speeds: [[0, 20]] });
    file.links = [{ path: 3, road: 0, along: 300, onToRoad: false, points: encoded([[300, 0, 1.5], [300, 0, 4]]) }];
    let turned = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const net = new LaneNet();
      net.add("P", decodeLanes(file));
      const cars = new LaneTraffic(net, [HALF], seed);
      const bike = cars.spawn({ tile: "P", index: 0, connector: false, along: 260 }, 5, { kind: "bike", seed });
      if (!bike.exit) continue;
      turned++;
      for (let step = 0; step < 20 / (4 * STEP_S); step++) cars.step(4 * STEP_S);
      expect(bike.place).toMatchObject({ index: 3, connector: false });
      expect(bike.place.link).toBeUndefined();
      expect(bike.offLaneM).toBeLessThan(1);
    }
    expect(turned).toBeGreaterThan(0);
  });

  it("ride a road near its edge, and join it from a path only once what's coming has passed", () => {
    const net = new LaneNet();
    net.add("P", decodeLanes(pathMeetsRoad()));
    const cars = new LaneTraffic(net, [HALF]);
    const bike = cars.spawn({ tile: "P", index: 2, connector: false, along: 60 }, 5, { kind: "bike", seed: 3 });
    // A few seconds behind the cyclist reaching the road: soon enough that it should wait.
    const car = cars.spawn({ tile: "P", index: 0, connector: false, along: 10 }, 50 / 3.6);
    let joinedBehindCar = null as boolean | null;
    let edge = 0;
    for (let step = 0; step < 40 / (4 * STEP_S); step++) {
      cars.step(4 * STEP_S);
      if (joinedBehindCar === null && bike.place.index === 0 && !bike.place.link) joinedBehindCar = car.pose.x > bike.pose.x;
      if (bike.place.index === 0 && bike.pose.x > 150 && bike.pose.x < 250) edge = Math.max(edge, bike.pose.z);
    }
    expect(joinedBehindCar).toBe(true);
    // The eastbound lane's middle is 1.5 m south; a cyclist keeps most of the way to its outer edge at 3 m.
    expect(edge).toBeGreaterThan(2.1);
    expect(edge).toBeLessThan(2.8);
  });
});


describe("walkers", () => {
  const STEP = 4 * STEP_S;
  const crossing = (pace?: (seed: number) => number) => {
    const net = new LaneNet();
    net.add("X", decodeLanes(footwaysAcrossRoad()));
    return new LaneTraffic(net, [HALF], 1, pace);
  };

  it("cross a road from a path to the path beyond, once what's coming has passed", () => {
    const cars = crossing(() => 1.3);
    const walker = cars.spawn({ tile: "X", index: 2, connector: false, along: 40 }, 1.3, { kind: "walker", seed: 1 });
    // Westbound, at the crossing about when the walker reaches the kerb.
    const car = cars.spawn({ tile: "X", index: 1, connector: false, along: 300 }, 50 / 3.6);
    let carPastWhenOut = null as boolean | null;
    let touched = false;
    for (let step = 0; step < 40 / STEP && !(walker.place.index === 4 && !walker.place.link); step++) {
      cars.step(STEP);
      touched ||= touching(outlineOf(walker), outlineOf(car));
      if (carPastWhenOut === null && walker.place.link) carPastWhenOut = car.pose.x < 95;
    }
    expect(touched).toBe(false);
    expect(carPastWhenOut).toBe(true);
    expect(walker.place).toMatchObject({ index: 4, connector: false });
    expect(walker.pose.z).toBeLessThan(-4);
  });

  it("are stopped for by a car while they cross", () => {
    const cars = crossing(() => 1.3);
    const walker = cars.spawn({ tile: "X", index: 0, connector: false, link: true, along: 0 }, 1.3, { kind: "walker", seed: 1 });
    walker.crossing = 1;
    const car = cars.spawn({ tile: "X", index: 0, connector: false, along: 55 }, 40 / 3.6);
    let touched = false;
    for (let step = 0; step < 20 / STEP; step++) {
      cars.step(STEP);
      touched ||= touching(outlineOf(walker), outlineOf(car));
    }
    expect(touched).toBe(false);
    expect(car.pose.x).toBeGreaterThan(110);
  });

  it("keep clear of each other on a narrow path: passing the slower, meeting those coming, and round someone standing", () => {
    const net = new LaneNet();
    net.add("F", decodeLanes({ lanes: twoWayPath([[0, 0, 0], [200, 0, 0]], 1, 1.2), connectors: [], junctions: [], issues: [] }));
    const cars = new LaneTraffic(net, [HALF], 1, (seed) => (seed === 1 ? 0.9 : 1.45));
    const slow = cars.spawn({ tile: "F", index: 0, connector: false, along: 30 }, 0.9, { kind: "walker", seed: 1 });
    const fast = cars.spawn({ tile: "F", index: 0, connector: false, along: 20 }, 1.45, { kind: "walker", seed: 2 });
    const coming = [60, 64, 90].map((along, at) => cars.spawn({ tile: "F", index: 1, connector: false, along: 200 - along }, 1.45, { kind: "walker", seed: 3 + at }));
    // Someone standing on the eastbound way, a little right of its middle.
    cars.setStill("F", [70, 0.4]);
    const standing = { x: 70, z: 0.4, yaw: 0, half: [0.28, 0.28] as const };
    const walkers = [slow, fast, ...coming];
    let touched = false;
    for (let step = 0; step < 60 / STEP; step++) {
      cars.step(STEP);
      for (const [at, one] of walkers.entries()) {
        touched ||= touching(outlineOf(one), standing);
        for (const two of walkers.slice(at + 1)) touched ||= touching(outlineOf(one), outlineOf(two));
      }
    }
    expect(touched).toBe(false);
    expect(fast.pose.x).toBeGreaterThan(slow.pose.x + 5);
    expect(fast.pose.x).toBeGreaterThan(75);
  });

  it("step aside for a cyclist catching them up, who passes with room", () => {
    const net = new LaneNet();
    net.add("C", decodeLanes({ lanes: twoWayPath([[0, 0, 0], [300, 0, 0]], 1, 2.4, "cycleway"), connectors: [], junctions: [], issues: [] }));
    const cars = new LaneTraffic(net, [HALF], 1, () => 1.3);
    const walker = cars.spawn({ tile: "C", index: 0, connector: false, along: 60 }, 1.3, { kind: "walker", seed: 1 });
    const bike = cars.spawn({ tile: "C", index: 0, connector: false, along: 10 }, 5, { kind: "bike", seed: 3 });
    let [touched, aside, closest] = [false, 0, Infinity];
    for (let step = 0; step < 40 / STEP && bike.pose.x < walker.pose.x + 10; step++) {
      cars.step(STEP);
      touched ||= touching(outlineOf(walker), outlineOf(bike));
      aside = Math.max(aside, walker.shiftM);
      if (Math.abs(walker.pose.x - bike.pose.x) < 1) closest = Math.min(closest, Math.abs(walker.pose.z - bike.pose.z) - walker.half[0] - bike.half[0]);
    }
    expect(touched).toBe(false);
    expect(bike.pose.x).toBeGreaterThan(walker.pose.x + 10);
    expect(aside).toBeGreaterThan(0.2);
    expect(closest).toBeGreaterThan(0.3);
  });

  it("turn back at a path's dead end and walk its other way", () => {
    const net = new LaneNet();
    net.add("D", decodeLanes({ lanes: twoWayPath([[0, 0, 0], [40, 0, 0]], 1, 2), connectors: [], junctions: [], issues: [] }));
    const cars = new LaneTraffic(net, [HALF], 1, () => 1.3);
    const walker = cars.spawn({ tile: "D", index: 0, connector: false, along: 30 }, 1.3, { kind: "walker", seed: 1 });
    for (let step = 0; step < 30 / STEP; step++) cars.step(STEP);
    expect(walker.place.index).toBe(1);
    expect(walker.pose.x).toBeLessThan(25);
    expect(walker.finished).toBe(false);
  });
});
