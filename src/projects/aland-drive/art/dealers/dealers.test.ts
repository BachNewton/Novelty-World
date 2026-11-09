import { describe, expect, it } from "vitest";
import { CARS } from "../cars/specs";
import { CAR_ENTRIES, CAR_IDS, type CarId } from "../../sim/cars";
import { brandOf, buildExterior, carSpecOf, DEALER_SITES, EXTERIOR_IDS, restingCar, SELLER_IDS, stockOf } from "./index";
import { buildInterior, INTERIOR_IDS, type Interior } from "./interiors";
import { groundY } from "../cars/build";

const EXTERIOR_BUDGET = 2500;
const INTERIOR_BUDGET = 12000;
const CLEARANCE_M = 0.1;

const carReach = (car: CarId) => {
  const { noseZ, tailZ, wide } = lengthOf(car);
  return Math.hypot(Math.max(-noseZ, tailZ), wide);
};

function lengthOf(car: CarId) {
  const { body, shadowHalf } = carSpecOf(car);
  const zs = body.silhouette.map(({ z }) => z);
  return { noseZ: Math.min(...zs), tailZ: Math.max(...zs), wide: shadowHalf[0] };
}

/** A car's four corners in the room, from its slot. */
function corners(car: CarId, at: readonly number[], yaw: number) {
  const { noseZ, tailZ, wide } = lengthOf(car);
  return [[-wide, noseZ], [wide, noseZ], [wide, tailZ], [-wide, tailZ]].map(([x, z]) => [at[0] + x * Math.cos(yaw) + z * Math.sin(yaw), at[2] + z * Math.cos(yaw) - x * Math.sin(yaw)]);
}

const inside = ({ room }: Interior, x: number, z: number) => x > room.x[0] && x < room.x[1] && z > room.z[0] && z < room.z[1];

describe("budgets", () => {
  it.each(EXTERIOR_IDS)("%s exterior", (id) => {
    expect(buildExterior(id).soup.triangles).toBeLessThan(EXTERIOR_BUDGET);
  });
  it.each(INTERIOR_IDS)("%s interior", (id) => {
    const { soup, turntable } = buildInterior(id);
    expect(soup.triangles + turntable.soup.triangles).toBeLessThan(INTERIOR_BUDGET);
  });
});

// A car that doesn't fit is the mistake that shows only once someone buys the longest one.
describe("real cars fit", () => {
  it.each(INTERIOR_IDS)("every car turns on the %s turntable", (id) => {
    const { turntable } = buildInterior(id);
    for (const { id } of CARS) if (id !== undefined) expect(carReach(id) + CLEARANCE_M).toBeLessThan(turntable.radiusM);
  });

  it.each(INTERIOR_IDS)("the %s displays stand in the room, clear of the turntable and each other", (id) => {
    const interior = buildInterior(id);
    const { displays, turntable } = interior;
    const footprints = displays.map(({ car, at, yaw }) => corners(car, at, yaw));
    for (const footprint of footprints) {
      for (const [x, z] of footprint) {
        expect(inside(interior, x, z)).toBe(true);
        expect(Math.hypot(x - turntable.centre[0], z - turntable.centre[2])).toBeGreaterThan(turntable.radiusM);
      }
    }
    displays.forEach((a, first) => {
      displays.forEach((b, second) => {
        if (first >= second) return;
        expect(Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2])).toBeGreaterThan(2 * (lengthOf(a.car).wide + CLEARANCE_M));
      });
    });
  });

  it("the tallest car clears a garage door and every ceiling", () => {
    const tallest = Math.max(...CARS.flatMap(({ body }) => body.silhouette.map(({ h }) => h)));
    expect(tallest).toBeLessThan(3.3);
    for (const id of INTERIOR_IDS) expect(tallest).toBeLessThan(buildInterior(id).room.height);
  });
});

describe("rooms", () => {
  it.each(INTERIOR_IDS)("%s has its cameras inside and a turntable camera off the deck", (id) => {
    const interior = buildInterior(id);
    expect(interior.cameras.map(({ kind }) => kind)).toEqual(["floor", "desk", "turntable"]);
    for (const { position } of interior.cameras) expect(inside(interior, position[0], position[2])).toBe(true);
    const camera = interior.cameras[2];
    expect(Math.hypot(camera.position[0] - interior.turntable.centre[0], camera.position[2] - interior.turntable.centre[2])).toBeGreaterThan(interior.turntable.radiusM + 0.5);
  });
});

describe("the data", () => {
  it("every car a dealer sells is sold at one place, under its maker's badge", () => {
    const sold = SELLER_IDS.flatMap(stockOf);
    expect(new Set(sold).size).toBe(sold.length);
    expect([...sold].sort()).toEqual(CAR_IDS.filter((id) => CAR_ENTRIES[id].from === "dealer").sort());
    for (const id of sold) expect(() => brandOf(CAR_ENTRIES[id].maker)).not.toThrow();
  });

  it("the town dealer's forecourt and the garage's yard show every car they sell", () => {
    expect(buildExterior("town-dealer").slots.map(({ car }) => car)).toEqual(stockOf("town-dealer"));
    expect(buildExterior("village-garage").slots.map(({ car }) => car)).toEqual(stockOf("village-garage"));
  });

  // A stock that grows by a longer car is the mistake: it would stand in a wall or another car.
  it.each(EXTERIOR_IDS)("the %s cars stand on the plot, clear of its walls and each other", (id) => {
    const { slots, plot, walls } = buildExterior(id);
    const footprints = slots.map(({ car, at, yaw }) => corners(car, at, yaw));
    for (const footprint of footprints) {
      for (const [x, z] of footprint) {
        expect(x > plot[0] && x < plot[2] && z > plot[1] && z < plot[3]).toBe(true);
        for (const [x0, z0, x1, z1] of walls) expect(x > x0 && x < x1 && z > z0 && z < z1).toBe(false);
      }
    }
    slots.forEach((a, first) => {
      slots.forEach((b, second) => {
        if (first >= second) return;
        expect(Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2])).toBeGreaterThan(2 * (lengthOf(a.car).wide + CLEARANCE_M));
      });
    });
  });

  it("every exterior has a site", () => {
    expect(DEALER_SITES.map(({ id }) => id).sort()).toEqual([...EXTERIOR_IDS].sort());
  });

  it("a resting car's wheels stand on the floor it's given", () => {
    const spec = carSpecOf("holm");
    const state = restingCar(spec, [1, 0.5, 2], 0);
    expect(state.position[1] + groundY(spec)).toBeCloseTo(0.5);
  });
});
