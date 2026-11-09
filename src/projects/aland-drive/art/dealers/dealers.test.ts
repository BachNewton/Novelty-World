import { describe, expect, it } from "vitest";
import { CAR_ENTRIES, CAR_IDS, type CarId } from "../../sim/cars";
import { brandOf, buildExterior, carSpecOf, DEALER_SITES, EXTERIOR_IDS, restingCar, SELLER_IDS, stockOf } from "./index";
import { buildInterior, INTERIOR_IDS } from "./interiors";
import { matching } from "./stock";
import { MOST_LAMPS, type DealerInterior, type PlanPoint, type Solid } from "../../dealership/interior";
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

type Polygon = readonly (readonly number[])[];

/** Whether two convex outlines overlap, by the gap between them along every edge's normal (none gives no overlap). */
function overlap(a: Polygon, b: Polygon): boolean {
  for (const shape of [a, b]) {
    for (let index = 0; index < shape.length; index++) {
      const [x0, z0] = shape[index];
      const [x1, z1] = shape[(index + 1) % shape.length];
      const [nx, nz] = [z1 - z0, x0 - x1];
      const project = (points: Polygon) => points.map(([x, z]) => x * nx + z * nz);
      const [pa, pb] = [project(a), project(b)];
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

const insideOutline = (outline: readonly PlanPoint[], [x, z]: readonly number[]) => {
  let inside = false;
  for (let index = 0, last = outline.length - 1; index < outline.length; last = index++) {
    const [[xi, zi], [xj, zj]] = [outline[index], outline[last]];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

function solidOutline(solid: Solid): Polygon {
  if (solid.kind === "round") return Array.from({ length: 12 }, (_, side) => [solid.centre[0] + solid.radiusM * Math.cos((side * Math.PI) / 6), solid.centre[1] + solid.radiusM * Math.sin((side * Math.PI) / 6)]);
  const [cx, cz] = solid.centre;
  const [hx, hz] = solid.half;
  const [c, sn] = [Math.cos(solid.yaw ?? 0), Math.sin(solid.yaw ?? 0)];
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [cx + x * c + z * sn, cz - x * sn + z * c]);
}

/** Where each car of a room's stock stands, its spot filled in order, as its outline grown by the clearance. */
function standing(interior: DealerInterior) {
  const stock = matching(interior.stock);
  return stock.map((car, index) => {
    const { at, yaw, turntable } = interior.spots[index];
    const { noseZ, tailZ, wide } = lengthOf(car);
    const [grownNose, grownTail, grownWide] = [noseZ - CLEARANCE_M, tailZ + CLEARANCE_M, wide + CLEARANCE_M];
    const outline: Polygon = [[-grownWide, grownNose], [grownWide, grownNose], [grownWide, grownTail], [-grownWide, grownTail]].map(([x, z]) => [at[0] + x * Math.cos(yaw) + z * Math.sin(yaw), at[2] + z * Math.cos(yaw) - x * Math.sin(yaw)]);
    // A turntable's car sweeps the circle its farthest corner draws.
    const swept: Polygon | null = turntable === undefined ? null : Array.from({ length: 24 }, (_, side) => [at[0] + (carReach(car) + CLEARANCE_M) * Math.cos((side * Math.PI) / 12), at[2] + (carReach(car) + CLEARANCE_M) * Math.sin((side * Math.PI) / 12)]);
    return { car, outline: swept ?? outline };
  });
}

describe("budgets", () => {
  it.each(EXTERIOR_IDS)("%s exterior", (id) => {
    expect(buildExterior(id).soup.triangles).toBeLessThan(EXTERIOR_BUDGET);
  });
});

describe("rooms", () => {
  it.each(INTERIOR_IDS)("%s keeps within the dealer kit's triangle budget", (id) => {
    const { room, turntables } = buildInterior(id);
    expect(room.triangles + turntables.reduce((sum, { soup }) => sum + soup.triangles, 0)).toBeLessThan(INTERIOR_BUDGET);
  });

  it.each(INTERIOR_IDS)("%s has a spot for every car it sells, each car on the floor, clear of the solids and the others", (id) => {
    const interior = buildInterior(id);
    expect(interior.spots.length).toBeGreaterThanOrEqual(matching(interior.stock).length);
    const cars = standing(interior);
    for (const { car, outline } of cars) {
      for (const point of outline) expect(insideOutline(interior.floor, point), `${car} off the floor`).toBe(true);
      for (const solid of interior.solids) expect(overlap(outline, solidOutline(solid)), `${car} in a solid at ${solid.centre.join()}`).toBe(false);
    }
    cars.forEach((a, first) => cars.forEach((b, second) => {
      if (first < second) expect(overlap(a.outline, b.outline), `${a.car} in ${b.car}`).toBe(false);
    }));
  });

  it.each(INTERIOR_IDS)("%s has its door and its view on the floor, the door clear of everything", (id) => {
    const interior = buildInterior(id);
    const { door, viewFrom, floor, solids } = interior;
    for (const point of [door.at, [viewFrom[0], viewFrom[2]]]) expect(insideOutline(floor, point)).toBe(true);
    const standingRoom: Polygon = [[door.at[0] - 0.4, door.at[1] - 0.4], [door.at[0] + 0.4, door.at[1] - 0.4], [door.at[0] + 0.4, door.at[1] + 0.4], [door.at[0] - 0.4, door.at[1] + 0.4]];
    for (const solid of solids) expect(overlap(standingRoom, solidOutline(solid))).toBe(false);
    for (const { outline } of standing(interior)) expect(overlap(standingRoom, outline)).toBe(false);
  });

  it.each(INTERIOR_IDS)("%s has at most the lamps the room's shader holds, and flat windows", (id) => {
    const { light, windows } = buildInterior(id);
    expect(light.lamps.length).toBeLessThanOrEqual(MOST_LAMPS);
    for (const { corners } of windows) {
      const [a, b, c, d] = corners;
      const sub = (p: readonly number[], q: readonly number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      const [u, v, w] = [sub(b, a), sub(c, a), sub(d, a)];
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(Math.abs(normal[0] * w[0] + normal[1] * w[1] + normal[2] * w[2])).toBeLessThan(1e-6);
    }
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
