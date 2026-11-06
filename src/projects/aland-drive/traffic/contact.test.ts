import { beforeAll, describe, expect, it } from "vitest";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT, type DriveInput } from "../sim/car";
import { headingOf, speedOf } from "../sim/car-state";
import { Drive, initPhysics } from "../sim/drive";
import { FIXTURE_TILES, readWorld } from "../sim/read-tile";
import { chainLine } from "../sim/road-net";
import { CARS } from "../sim/cars";
import { TrafficContact } from "./contact";
import { LaneTraffic } from "./lane-driver";
import { decodeLanes } from "./lane-map";
import { LaneNet } from "./lane-net";
import { lane, touching } from "./test-lanes";

/*
 * Traffic meeting the player's car in the simulation: a lane along the fixture's
 * first road, a traffic car on it, and the player's car driven by the autopilot.
 */

const EVERY = 4;
const KINDS = [[0.92, 2.3]] as const;
const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const road = chainLine(tile.roads, 0);
const FROM_M = 150;

beforeAll(initPhysics);

function setUp() {
  const points: [number, number, number][] = [];
  for (let along = FROM_M; along <= Math.min(road.length, FROM_M + 600); along += 4) {
    const { x, y, z } = road.at(along);
    points.push([x, y, z]);
  }
  const net = new LaneNet();
  net.add("T", decodeLanes({ lanes: [lane(points, { width: 4 })], connectors: [], junctions: [], issues: [] }));
  const traffic = new LaneTraffic(net, KINDS);
  const drive = new Drive(world, road.at(FROM_M + 2));
  const contact = new TrafficContact(drive, traffic, KINDS, EVERY);
  const [wide, , long] = CARS[drive.carId].car.halfSize;
  let steps = 0;
  /** One step of the simulation, and of traffic every fourth, as the game steps them. */
  const step = (input: DriveInput) => {
    contact.beforeStep(steps);
    drive.step(input);
    contact.afterStep();
    steps = (steps + 1) % EVERY;
    if (steps === 0) {
      traffic.setDriven(contact.driven([wide, long]));
      traffic.step(drive.rapier.timestep * EVERY);
    }
  };
  return { traffic, drive, contact, step, half: [wide, long] as const };
}

describe("traffic and the player's car", () => {
  it("a traffic car hit hard from behind is shoved on as a car of its own, stops with its hazards on, then drives on", () => {
    const { traffic, drive, contact, step, half } = setUp();
    const car = traffic.spawn({ tile: "T", index: 0, connector: false, along: 40 }, 6);
    const pilot = new Autopilot(road, 25, FROM_M + 2);
    let hitAt: number | null = null;
    let fastestHit = 0;
    let overlapped = false;
    for (let at = 0; at < 30 / drive.rapier.timestep; at++) {
      const player = drive.stateAt(1);
      // Once it has hit, the player stops: on the brake, which would reverse a car once it stood, then the handbrake.
      step(hitAt === null ? pilot.input(player) : speedOf(player) > 1 ? { ...NO_INPUT, brake: 1 } : { ...NO_INPUT, handbrake: true });
      if (hitAt === null && contact.count() > 0) hitAt = at;
      for (const hit of drive.cars()) fastestHit = Math.max(fastestHit, speedOf(hit.stateAt(1)));
      // As drawn, in traffic or out of it, a hand's width inside each outline.
      const inTraffic = traffic.get(car.id);
      const drawn = inTraffic ? traffic.poseBetween(inTraffic, 1) : contact.hitCars(1)[0].pose;
      const state = drive.stateAt(1);
      overlapped ||= touching({ x: state.position[0], z: state.position[2], yaw: headingOf(state.rotation), half: [half[0] - 0.1, half[1] - 0.1] }, { ...drawn, half: [KINDS[0][0] - 0.1, KINDS[0][1] - 0.1] });
    }
    expect(hitAt).not.toBeNull();
    expect(fastestHit).toBeGreaterThan(8);
    expect(overlapped).toBe(false);
    expect(contact.count()).toBe(0);
    expect(traffic.get(car.id)?.speedMS).toBeGreaterThan(1);
  });

});
