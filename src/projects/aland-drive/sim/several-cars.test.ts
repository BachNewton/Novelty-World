import { beforeAll, describe, expect, it } from "vitest";
import { Autopilot } from "./autopilot";
import { NO_INPUT } from "./car";
import { speedOf, type CarState } from "./car-state";
import { Drive, initPhysics, START_ALONG_M, type SimulatedCar } from "./drive";
import { FIXTURE_TILES, readWorld } from "./read-tile";
import { chainLine } from "./road-net";

/*
 * More than one simulated car in the player's own world: racers, and traffic
 * once it's hit, each driven from its own input beside the player's.
 */

const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const route1 = chainLine(tile.roads, 0);

beforeAll(initPhysics);

/** How far along the road's way at the start a car is. */
const ahead = (state: CarState) => {
  const start = route1.at(START_ALONG_M);
  return (state.position[0] - start.x) * -Math.sin(start.heading) + (state.position[2] - start.z) * -Math.cos(start.heading);
};

function driveOther(drive: Drive, car: SimulatedCar, pilot: Autopilot, steps: number, each?: () => void): void {
  for (let step = 0; step < steps; step++) {
    car.input = pilot.input(car.stateAt(1));
    drive.step(NO_INPUT);
    each?.();
  }
}

describe("several simulated cars", () => {
  it("collide: a racer driven into the player's parked car shoves it, and neither passes through the other", () => {
    const drive = new Drive(world, route1.at(START_ALONG_M + 45));
    const racer = drive.addCar(route1.at(START_ALONG_M), "berg");
    let topPlayer = 0;
    let topRacer = 0;
    driveOther(drive, racer, new Autopilot(route1, 18, START_ALONG_M), 900, () => {
      topPlayer = Math.max(topPlayer, speedOf(drive.stateAt(1)));
      topRacer = Math.max(topRacer, speedOf(racer.stateAt(1)));
    });
    expect(topRacer).toBeGreaterThan(15);
    expect(topPlayer).toBeGreaterThan(4);
    expect(ahead(racer.stateAt(1))).toBeLessThan(ahead(drive.stateAt(1)));
    expect(drive.log.airborneSteps + racer.log.airborneSteps).toBeLessThan(20);
    drive.dispose();
  });

  it("load the ground round each of them: a racer 1 km from the player drives on real ground", () => {
    const drive = new Drive(world, route1.at(START_ALONG_M));
    const from = START_ALONG_M + 1000;
    const racer = drive.addCar(route1.at(from));
    const player = drive.stateAt(1).position;
    expect(Math.hypot(racer.position[0] - player[0], racer.position[2] - player[2])).toBeGreaterThan(900);
    driveOther(drive, racer, new Autopilot(route1, 25, from), 120 * 25);
    expect(racer.log.metres).toBeGreaterThan(500);
    expect(racer.log.airborneSteps).toBe(0);
    expect(racer.log.contactLosses).toBe(0);
    expect(racer.log.furthestOffRoadM).toBeLessThan(3);
    expect(racer.log.farGroundSteps).toBe(0);
    // The player's blocks and the racer's, apart.
    expect(drive.ground.loadedBlocks).toBe(18);
    drive.dispose();
  });

  it("leave the player's drive as it was: the same inputs drive the same, with a racer elsewhere or none", () => {
    const play = (withRacer: boolean) => {
      const drive = new Drive(world, route1.at(START_ALONG_M));
      const pilot = new Autopilot(route1, 30, START_ALONG_M);
      const racer = withRacer ? drive.addCar(route1.at(START_ALONG_M + 1500), "vik") : null;
      for (let step = 0; step < 900; step++) {
        if (racer) racer.input = { ...NO_INPUT, throttle: 1 };
        drive.step(pilot.input(drive.stateAt(1)));
      }
      const state = drive.stateAt(1);
      drive.dispose();
      return state;
    };
    expect(play(true)).toEqual(play(false));
  });
});
