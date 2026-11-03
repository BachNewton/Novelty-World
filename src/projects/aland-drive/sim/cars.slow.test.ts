import { beforeAll, describe, expect, it } from "vitest";
import { Autopilot } from "./autopilot";
import { NO_INPUT, type DriveInput } from "./car";
import { CAR_IDS, CARS } from "./cars";
import { speedOf, type CarState } from "./car-state";
import { Drive, initPhysics, START_ALONG_M } from "./drive";
import { topSpeedMS } from "./gearbox";
import { FIXTURE_TILES, readWorld } from "./read-tile";
import { chainLine } from "./road-net";

/*
 * Every car on the fixture's Route 1, for what a tuning change most easily
 * breaks in one car and not the others: following a real road, stopping, and
 * staying on its wheels when the wheel is thrown over at speed.
 */

const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const route1 = chainLine(tile.roads, 0);
/** Far enough along Route 1 for its bends and a crest, and no further: the whole road is the default car's test, in `drive.test.ts`. */
const ROUTE_M = 800;

beforeAll(initPhysics);

const upOf = ({ rotation: [x, , z] }: CarState) => 1 - 2 * (x * x + z * z);

function upTo(drive: Drive, speed: number): void {
  for (let step = 0; step < 120 * 60 && speedOf(drive.stateAt(1)) < speed; step++) drive.step({ ...NO_INPUT, throttle: 1 });
}

describe.each(CAR_IDS)("%s", (id) => {
  it("follows Route 1 with every wheel down", () => {
    const drive = new Drive(world, route1.at(START_ALONG_M), id);
    const pilot = new Autopilot(route1, 25, START_ALONG_M);
    for (let step = 0; step < 120 * 100 && drive.log.metres < ROUTE_M; step++) drive.step(pilot.input(drive.stateAt(1)));
    expect(drive.log.metres).toBeGreaterThanOrEqual(ROUTE_M);
    expect(drive.log.furthestOffRoadM).toBeLessThan(3);
    expect(drive.log.airborneSteps).toBe(0);
    expect(drive.log.worstJoltG).toBeLessThan(0.6);
    drive.dispose();
  });

  it("stops from 100 km/h in under 50 m", () => {
    const drive = new Drive(world, route1.at(START_ALONG_M), id);
    upTo(drive, 27.8);
    const from = drive.stateAt(1).position;
    let state = drive.stateAt(1);
    for (let step = 0; step < 120 * 8 && speedOf(state) > 0.3; step++) {
      drive.step({ ...NO_INPUT, brake: 1 });
      state = drive.stateAt(1);
    }
    expect(speedOf(state)).toBeLessThan(0.3);
    expect(Math.hypot(state.position[0] - from[0], state.position[2] - from[2])).toBeLessThan(50);
    drive.dispose();
  });

  it("stays on its wheels at full lock at speed, and on the handbrake", () => {
    const speed = Math.min(36, topSpeedMS(CARS[id]) * 0.8);
    for (const turn of [{ steer: 1 }, { steer: -1, handbrake: true }] satisfies Partial<DriveInput>[]) {
      const drive = new Drive(world, route1.at(START_ALONG_M), id);
      upTo(drive, speed);
      let lowest = 1;
      for (let step = 0; step < 120 * 3; step++) {
        drive.step({ ...NO_INPUT, throttle: 0.5, ...turn });
        lowest = Math.min(lowest, upOf(drive.stateAt(1)));
      }
      expect(lowest).toBeGreaterThan(0.7);
      drive.dispose();
    }
  });
});
