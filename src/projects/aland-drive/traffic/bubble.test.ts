import { describe, expect, it } from "vitest";
import { STEP_S } from "../sim/tuning";
import { Bubble } from "./bubble";
import { LaneTraffic, type LaneCar } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { pathMeetsRoad, twoWayRoad } from "./test-lanes";

const EVERY = 4;

function setUp(density: number) {
  const net = new LaneNet();
  net.add("R", decodeLanes(twoWayRoad(7, 3000)));
  const traffic = new LaneTraffic(net, [[0.92, 2.3], [0.73, 1.375]]);
  const bubble = new Bubble(net, traffic, { car: { reachM: 400, density }, bike: { reachM: 200, density }, walker: { reachM: 200, density: 0 } });
  return { traffic, bubble };
}

const placed = (traffic: LaneTraffic) => new Map([...traffic.all()].map((vehicle) => [vehicle.id, { ...vehicle.pose }]));

describe("the bubble", () => {
  it("after its first fill, puts vehicles down and takes them away only where they can't be seen", () => {
    const net = new LaneNet();
    net.add("R", decodeLanes(twoWayRoad(7, 1500)));
    const traffic = new LaneTraffic(net, [[0.92, 2.3], [0.73, 1.375]]);
    const bubble = new Bubble(net, traffic, { car: { reachM: 400, density: 20 }, bike: { reachM: 200, density: 20 }, walker: { reachM: 200, density: 0 } });
    // The player stands near where the westbound lane ends, looking west past it: cars end their trips there in sight,
    // and those starting in sight eastbound drive off to the far end and go, leaving their slots in sight empty.
    const player = { x: 200, z: 0 };
    const seen = ({ pose }: Pick<LaneCar, "pose">) => pose.x < player.x + 5 && pose.x > player.x - 300;
    bubble.update(player, seen);
    let before = placed(traffic);
    const inSight: string[] = [];
    for (let step = 0; step < 120 / (STEP_S * EVERY); step++) {
      bubble.update(player, seen);
      traffic.step(STEP_S * EVERY);
      const now = placed(traffic);
      for (const [id, pose] of now) if (!before.has(id) && seen({ pose })) inSight.push(`${id} came at ${pose.x.toFixed(0)}`);
      for (const [id, pose] of before) if (!now.has(id) && seen({ pose })) inSight.push(`${id} went at ${pose.x.toFixed(0)}`);
      before = now;
    }
    // More than the first fill: slots emptied and filled again.
    expect(bubble.counts().spawned).toBeGreaterThan(12);
    expect(inSight).toEqual([]);
  });

  it("leaves an empty slot in sight empty until it's out of sight", () => {
    const { traffic, bubble } = setUp(5);
    bubble.update({ x: 1500, z: 0 }, () => false);
    const filled = traffic.count();
    for (const vehicle of [...traffic.all()]) traffic.remove(vehicle.id);
    for (let update = 0; update < 5; update++) bubble.update({ x: 1500, z: 0 }, () => true);
    expect(traffic.count()).toBe(0);
    bubble.update({ x: 1500, z: 0 }, () => false);
    expect(traffic.count()).toBe(filled);
  });

  it("fills a road with the same vehicles each time, each slot its own seed", () => {
    const { traffic, bubble } = setUp(10);
    const who = () => new Map([...traffic.all()].map((vehicle) => [vehicle.id, `${vehicle.kind} ${vehicle.seed} ${vehicle.model}`]));
    bubble.update({ x: 1500, z: 0 }, () => false);
    const first = who();
    bubble.setDensity("car", 0);
    bubble.setDensity("bike", 0);
    bubble.setDensity("car", 10);
    bubble.setDensity("bike", 10);
    bubble.update({ x: 1500, z: 0 }, () => false);
    expect(first.size).toBeGreaterThan(5);
    expect(who()).toEqual(first);
  });

  it("puts cyclists on the cycleways and the roads, and cars on the roads only", () => {
    const net = new LaneNet();
    net.add("P", decodeLanes(pathMeetsRoad()));
    const traffic = new LaneTraffic(net, [[0.92, 2.3]]);
    const bubble = new Bubble(net, traffic, { car: { reachM: 400, density: 30 }, bike: { reachM: 400, density: 30 }, walker: { reachM: 200, density: 0 } });
    bubble.update({ x: 300, z: 0 }, () => false);
    const lanesOf = (kind: string) => new Set([...traffic.all()].filter((vehicle) => vehicle.kind === kind).map((vehicle) => vehicle.place.index));
    expect([...lanesOf("car")].sort()).toEqual([0, 1]);
    expect(lanesOf("bike")).toContain(2);
    expect(lanesOf("bike")).toContain(0);
  });
});
