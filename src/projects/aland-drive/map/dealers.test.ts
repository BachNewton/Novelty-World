import { describe, expect, it } from "vitest";
import { DEALER_SITES } from "../art/dealers";
import { dealerDoors } from "../dealership/doors";
import { DEALERSHIPS } from "../dealership/registry";
import { mapDealersOf } from "./dealers";

const origin = { east: 100000, north: 6690000 };
const dealers = mapDealersOf(dealerDoors(origin));

describe("dealerships on the maps", () => {
  it("lists every dealership with a walk-in, and nothing else", () => {
    expect(dealers.map(({ id }) => id).sort()).toEqual(DEALERSHIPS.map(({ site }) => site).sort());
    expect(dealers.some(({ id }) => id === "tyre-shop")).toBe(false);
  });

  it("marks each at its own door, in the scene's frame (east +x, north -z)", () => {
    for (const dealer of dealers) {
      const site = DEALER_SITES.find(({ id }) => id === dealer.id);
      if (!site) throw new Error(`no site for ${dealer.id}`);
      // The door is on the site's own plot, tens of metres from its origin at most.
      expect(Math.hypot(dealer.x - (site.east - origin.east), dealer.z - (origin.north - site.north))).toBeLessThan(45);
    }
  });

  it("gives each a name of its own and something it sells", () => {
    expect(new Set(dealers.map(({ name }) => name)).size).toBe(dealers.length);
    for (const { sells } of dealers) expect(sells).toMatch(/[A-ZÄÖÅ][a-zäöå]+$/);
  });
});
