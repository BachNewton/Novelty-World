import { beforeAll, describe, expect, it } from "vitest";
import { ALL_ASSISTS, NO_INPUT, type Assists, type DriveInput } from "./car";
import { CAR_IDS, CARS, type CarId } from "./cars";
import { headingOf, speedOf } from "./car-state";
import { Drive, initPhysics } from "./drive";
import type { Surface } from "./surfaces";
import { padPoint, PAD_M, testPad } from "./test-pad";
import type { World } from "./world";

beforeAll(initPhysics);

const pads = new Map<Surface, World>();
const padOf = (surface: Surface) => pads.get(surface) ?? pads.set(surface, testPad(surface)).get(surface) ?? testPad(surface);

function driveOn(surface: Surface, id: CarId, assists: Assists = ALL_ASSISTS, x = 200, heading = -Math.PI / 2): Drive {
  const drive = new Drive(padOf(surface), { ...padPoint(x, -PAD_M / 2), heading }, id);
  drive.assists = assists;
  for (let step = 0; step < 60; step++) drive.step(NO_INPUT);
  return drive;
}

describe("the wheels", () => {
  it("the handbrake beats the engine: no car pulls away on full throttle with it held", () => {
    for (const id of CAR_IDS) {
      const drive = driveOn("asphalt", id);
      const [x, , z] = drive.stateAt(1).position;
      for (let step = 0; step < 120; step++) drive.step({ ...NO_INPUT, throttle: 1, handbrake: true });
      const after = drive.stateAt(1).position;
      expect(Math.hypot(after[0] - x, after[2] - z), id).toBeLessThan(0.05);
      drive.dispose();
    }
  });

  it("spin against a wall flat out without traction control, the revs at the limiter; with it, they grip", () => {
    for (const traction of [true, false]) {
      // Nosed up to the pad's west wall.
      const drive = driveOn("grass", "sund", { ...ALL_ASSISTS, traction }, 20, Math.PI / 2);
      for (let step = 0; step < 600; step++) drive.step({ ...NO_INPUT, throttle: 0.3 });
      for (let step = 0; step < 240; step++) drive.step({ ...NO_INPUT, throttle: 1 });
      const rearSpin = drive.player.treads()[2].spinMS;
      expect(speedOf(drive.stateAt(1))).toBeLessThan(0.5);
      if (traction) expect(rearSpin).toBe(0);
      else {
        expect(rearSpin).toBeGreaterThan(10);
        expect(drive.engine().rpm).toBeGreaterThan(0.95 * CARS.sund.gearbox.redlineRpm);
      }
      drive.dispose();
    }
  });

  it("lock under the brakes without ABS, and never with it", () => {
    for (const abs of [true, false]) {
      const drive = driveOn("grass", "skerry-gt", { ...ALL_ASSISTS, abs });
      while (speedOf(drive.stateAt(1)) < 80 / 3.6) drive.step({ ...NO_INPUT, throttle: 1 });
      let locked = false;
      for (let step = 0; step < 120; step++) {
        drive.step({ ...NO_INPUT, brake: 1 });
        locked ||= drive.player.treads().some((tread) => tread.spinMS < -0.9 * tread.rollMS);
      }
      expect(locked).toBe(!abs);
      drive.dispose();
    }
  });

  it("turn a braking car at least as far at full lock as at half: past their grip the fronts plough on", () => {
    const turned = (after: Pick<DriveInput, "brake" | "steer">) => {
      const drive = driveOn("asphalt", "skerry-gt");
      while (speedOf(drive.stateAt(1)) < 120 / 3.6) drive.step({ ...NO_INPUT, throttle: 1 });
      for (let step = 0; step < 120; step++) drive.step({ ...NO_INPUT, brake: 1 });
      const before = headingOf(drive.stateAt(1).rotation);
      for (let step = 0; step < 144; step++) drive.step({ ...NO_INPUT, ...after });
      const turn = headingOf(drive.stateAt(1).rotation) - before;
      drive.dispose();
      return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    };
    expect(turned({ brake: 1, steer: 1 })).toBeGreaterThanOrEqual(turned({ brake: 1, steer: 0.5 }));
  });
});
