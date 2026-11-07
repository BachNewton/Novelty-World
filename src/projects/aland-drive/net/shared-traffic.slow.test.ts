import { describe, expect, it } from "vitest";
import { slotOf } from "../traffic/bubble";
import type { VehicleKind } from "../traffic/lane-driver";
import { decodeLanes } from "../traffic/lane-map";
import { twoWayPath, twoWayRoad } from "../traffic/test-lanes";
import { createTrafficPages, TRAFFIC_HZ, type TrafficPage } from "./traffic-pages";

/*
 * Shared traffic on several pages at once, over a wire a step late: players
 * near each other see one traffic, the same vehicles in the same places,
 * through handovers and a player leaving, and nothing jumps, doubles or
 * vanishes on the way. Slow, at a few seconds of simulation for each page a
 * test: a double, a jump or a vehicle lost only shows over a drive's worth of
 * steps with a road full of vehicles, which no faster test reaches.
 */

/** Each test runs a road full of traffic on two pages for tens of seconds of game time. */
const SIMULATION_TIMEOUT_MS = 60_000;

const LENGTH_M = 4000;

/** A long two-way road with a footway beside it, for cars, cyclists and walkers. */
function tiles() {
  const road = twoWayRoad(7, LENGTH_M);
  return new Map([["T", decodeLanes({ ...road, lanes: [...road.lanes, ...twoWayPath([[0, 0, 12], [LENGTH_M, 0, 12]], 1, 2)] })]]);
}

const kinds = () => ({ car: { reachM: 400, density: 30 }, bike: { reachM: 200, density: 30 }, walker: { reachM: 100, density: 15 } });
const HALVES: readonly (readonly [number, number])[] = [[0.92, 2.3], [0.73, 1.375]];

const placesOf = (page: TrafficPage) => new Map([...page.traffic.all()].map((vehicle) => [vehicle.id, { x: vehicle.pose.x, z: vehicle.pose.z, kind: vehicle.kind, speedMS: vehicle.speedMS }]));

/** How far each kind may move in a traffic step on a page, its record put right included: its own speed's worth, and a little. */
const MOST_STEP_M: Record<VehicleKind, number> = { car: 30 / TRAFFIC_HZ + 0.3, bike: 7 / TRAFFIC_HZ + 0.2, walker: 2 / TRAFFIC_HZ + 0.15 };

/** Runs the pages, moving players as `move` says, and lists every vehicle that jumps or vanishes where a player would see it. */
function run(world: ReturnType<typeof createTrafficPages>, seconds: number, move: (page: TrafficPage, second: number) => void = () => undefined) {
  const jumps: string[] = [];
  const vanished: string[] = [];
  for (let step = 0; step < seconds * TRAFFIC_HZ; step++) {
    const before = new Map([...world.pages.values()].map((page) => [page, placesOf(page)]));
    for (const page of world.pages.values()) move(page, step / TRAFFIC_HZ);
    world.step();
    for (const [page, was] of before) {
      if (!world.pages.has(page.id)) continue;
      const now = placesOf(page);
      for (const [id, at] of was) {
        const there = now.get(id);
        const seen = Math.hypot(at.x - page.at.x, at.z - page.at.z) < kinds()[at.kind].reachM;
        if (!there) {
          if (seen) vanished.push(`${id} on ${page.id} at ${at.x.toFixed(0)}`);
          continue;
        }
        // Out of sight a page doesn't hold what the vehicle meets there, and its copy drifts until its next message puts it right.
        const moved = Math.hypot(there.x - at.x, there.z - at.z);
        if (seen && moved > MOST_STEP_M[at.kind]) jumps.push(`${id} on ${page.id} moved ${moved.toFixed(2)} m at ${at.x.toFixed(0)}`);
      }
    }
  }
  return { jumps, vanished };
}

/** Every vehicle two pages both hold, and how far apart they have it. */
function apart(a: TrafficPage, b: TrafficPage): number {
  const there = placesOf(b);
  let most = 0;
  for (const [id, at] of placesOf(a)) {
    const other = there.get(id);
    if (other) most = Math.max(most, Math.hypot(at.x - other.x, at.z - other.z));
  }
  return most;
}

describe("shared traffic", () => {
  it("fills the road round two players together once: one vehicle a slot, the same on both pages", () => {
    const world = createTrafficPages(tiles(), kinds, HALVES);
    const a = world.add("a", { x: 2000, z: 0 });
    // The second arrives once the first has filled the road round them both.
    run(world, 1);
    const b = world.add("b", { x: 2060, z: 0 });
    const { jumps, vanished } = run(world, 12);
    const slots = new Map<string, Set<string>>();
    for (const page of [a, b]) for (const vehicle of page.traffic.all()) slots.set(slotOf(vehicle.id), new Set([...(slots.get(slotOf(vehicle.id)) ?? []), vehicle.id]));
    const doubled = [...slots].filter(([, ids]) => ids.size > 1);
    expect(doubled).toEqual([]);
    // Within both players' reach, both hold the same vehicles.
    const near = (page: TrafficPage) => new Set([...page.traffic.all()].filter((vehicle) => Math.hypot(vehicle.pose.x - 2030, vehicle.pose.z) < 300).map((vehicle) => vehicle.id));
    expect(near(a).size).toBeGreaterThan(10);
    expect(near(b)).toEqual(near(a));
    expect(new Set([...a.traffic.all()].map((vehicle) => vehicle.kind))).toEqual(new Set(["car", "bike", "walker"]));
    // Each runs some of them.
    expect([...a.traffic.all()].filter((vehicle) => a.shared.runsHere(vehicle)).length).toBeGreaterThan(0);
    expect([...b.traffic.all()].filter((vehicle) => b.shared.runsHere(vehicle)).length).toBeGreaterThan(0);
    // A step late, each page has the other's vehicles where they were then, and has driven them on as they were driven.
    expect(apart(a, b)).toBeLessThan(MOST_STEP_M.car);
    expect(jumps).toEqual([]);
    expect(vanished).toEqual([]);
  }, SIMULATION_TIMEOUT_MS);

  it("hands vehicles to a player driving past, and they carry on where they were", () => {
    const world = createTrafficPages(tiles(), kinds, HALVES);
    const a = world.add("a", { x: 1500, z: 0 });
    const b = world.add("b", { x: 1400, z: 0 });
    run(world, 3);
    const handovers = () => Math.max(...[...a.shared.runners().values()].map(({ handovers }) => handovers));
    expect(handovers()).toBe(0);
    // B drives east at 25 m/s, past A and on.
    const { jumps, vanished } = run(world, 12, (page) => {
      if (page === b) page.at.x += 25 / TRAFFIC_HZ;
    });
    expect(handovers()).toBeGreaterThan(0);
    expect(jumps).toEqual([]);
    expect(vanished).toEqual([]);
    expect(apart(a, b)).toBeLessThan(MOST_STEP_M.car);
  }, SIMULATION_TIMEOUT_MS);

  it("when a player leaves, the one left takes their vehicles where they are, and none vanishes", () => {
    const world = createTrafficPages(tiles(), kinds, HALVES);
    const a = world.add("a", { x: 2000, z: 0 });
    const b = world.add("b", { x: 2100, z: 0 });
    run(world, 8);
    const theirs = [...b.traffic.all()].filter((vehicle) => !b.shared.runsHere(vehicle)).map((vehicle) => vehicle.id);
    expect(theirs.length).toBeGreaterThan(5);
    expect([...a.traffic.all()].length).toBeGreaterThan(0);
    world.leave("a");
    const { jumps, vanished } = run(world, 5);
    expect(jumps).toEqual([]);
    expect(vanished).toEqual([]);
    const still = theirs.filter((id) => b.traffic.get(id));
    expect(still.length).toBeGreaterThan(5);
    for (const id of still) expect(b.traffic.elsewhere.has(id), id).toBe(false);
  }, SIMULATION_TIMEOUT_MS);
});
