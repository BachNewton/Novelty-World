import { beforeAll, describe, expect, it } from "vitest";
import { NO_INPUT } from "./car";
import { Drive, initPhysics } from "./drive";
import { evenExposure, exposureAt, exposureOfLand, gridExposureAt } from "./sea-ice";
import { padPoint, POND, testPad } from "./test-pad";

beforeAll(initPhysics);

const STEPS = 240;
const middle = { x: (POND.west + POND.east) / 2, z: (POND.north + POND.south) / 2 };

/** A drive with the car let go over the middle of the pond, with the sea's exposure there and how far out the ice bears a car. */
function dropped(exposure: number, drivable: number) {
  const world = testPad("asphalt", { pond: true });
  world.setIceExposure(evenExposure(exposure));
  world.setIceDrivable(drivable);
  const drive = new Drive(world, padPoint(middle.x, middle.z));
  for (let step = 0; step < STEPS; step++) drive.step(NO_INPUT);
  return drive;
}

describe("sea ice", () => {
  it("holds a car up at the water's surface where it bears one, as ice whatever the weather", () => {
    const drive = dropped(0.1, 0.5);
    expect(drive.player.position[1]).toBeGreaterThan(POND.surfaceM);
    expect(drive.player.conditions()).toEqual(["ice", "ice", "ice", "ice"]);
    drive.dispose();
  });

  it("lets a car sink where the water is open, or the ice too thin to bear it", () => {
    for (const [exposure, drivable] of [
      [0.1, 0],
      [0.6, 0.5],
    ]) {
      const drive = dropped(exposure, drivable);
      expect(drive.player.position[1]).toBeLessThan(POND.surfaceM);
      expect(drive.player.conditions()).toEqual(["dry", "dry", "dry", "dry"]);
      drive.dispose();
    }
  });

  it("finds a bay sheltered and the open sea exposed, from the land round them", () => {
    // A square island 40 pixels across in a sea 200 across, with a bay cut into it: alpha is the land.
    const size = 200;
    const image = new Uint8Array(size * size * 4);
    for (let row = 60; row < 140; row++) for (let column = 60; column < 140; column++) image[(row * size + column) * 4 + 3] = 255;
    for (let row = 95; row < 105; row++) for (let column = 60; column < 110; column++) image[(row * size + column) * 4 + 3] = 0;
    const grid = exposureOfLand(image, size, size, { west: 0, north: 0, columns: size / 2 + 1, stepM: 80 });
    const at = (column: number, row: number) => gridExposureAt(grid, (column + 0.5) * 40, (row + 0.5) * 40);
    expect(at(105, 100)).toBeLessThan(at(62, 100));
    expect(at(62, 100)).toBeLessThan(at(10, 10));
    expect(at(10, 10)).toBeGreaterThan(0.9);
    // The ragged edge moves a place's exposure only a little.
    expect(Math.abs(exposureAt(grid, 400, 400) - gridExposureAt(grid, 400, 400))).toBeLessThan(0.06);
  });
});
