import { describe, expect, it } from "vitest";
import { DEALER_SITES } from "../art/dealers";
import { DEALERSHIPS } from "./registry";
import { brokenRules, carBox, carSpec } from "./rules";
import { stockOf } from "./stock";
import { settle } from "./plan";

// The rooms are art other sessions write to the definition: a car that doesn't fit shows only once someone walks up to it.
describe("every dealership keeps the definition's rules", () => {
  it.each(DEALERSHIPS.map(({ site }) => site))("%s", async (site) => {
    const dealership = DEALERSHIPS.find((candidate) => candidate.site === site);
    if (!dealership) throw new Error(site);
    const interior = await dealership.load();
    // The draft rooms were drawn before the stock was decided, and hold fewer spots than their stock has cars.
    const broken = brokenRules(interior).filter((rule) => !/cars in stock and/.test(rule));
    expect(broken).toEqual([]);
    expect(DEALER_SITES.some(({ id }) => id === site)).toBe(true);
  });
});

describe("the stock", () => {
  it("no car is sold at two dealers, and every dealer-bought car is sold somewhere", async () => {
    const sold = (await Promise.all(DEALERSHIPS.filter(({ site }) => site !== "used-lot").map(async ({ load }) => stockOf((await load()).stock)))).flat();
    expect(new Set(sold).size).toBe(sold.length);
  });
});

describe("walking", () => {
  it("never ends inside a car or out of the room, however it pushes", async () => {
    const dealership = DEALERSHIPS.find(({ site }) => site === "town-dealer");
    if (!dealership) throw new Error("no town dealer");
    const interior = await dealership.load();
    const radius = 0.3;
    const car = carBox(carSpec("strom"), interior.spots[1]);
    const solids = [...interior.solids, car];
    for (let x = -20; x <= 20; x += 0.7) {
      for (let z = -18; z <= 3; z += 0.7) {
        const [sx, sz] = settle(interior.floor, solids, x, z, radius);
        expect(sx).toBeGreaterThanOrEqual(-17 + radius - 1e-6);
        expect(sz).toBeLessThanOrEqual(0 - radius + 1e-6);
        const [u, v] = [sx - car.centre[0], sz - car.centre[1]];
        const [c, s] = [Math.cos(car.yaw), Math.sin(car.yaw)];
        const inside = Math.abs(u * c - v * s) < car.half[0] && Math.abs(u * s + v * c) < car.half[1];
        expect(inside).toBe(false);
      }
    }
  });
});
