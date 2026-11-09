import { describe, expect, it } from "vitest";
import { FIXTURE_TILES, readWorld } from "../sim/read-tile";
import { chainLine } from "../sim/road-net";
import { LaidRoad } from "./laid-road";

/*
 * The laid road read along a route: the width either side of the middle, in the
 * route's own left and right, whichever way the chain under it was laid.
 */

const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const route1 = chainLine(tile.roads, 0);
const laid = new LaidRoad(world);

describe("the laid road under a route", () => {
  it("finds the section under a place on the road, with a carriageway and a wider surface", () => {
    const { x, z, heading } = route1.at(400);
    const under = laid.nearest(x, z, heading);
    expect(under).not.toBeNull();
    expect(under?.distance).toBeLessThan(1);
    expect(under?.leftM).toBeGreaterThan(2);
    expect(under?.outerLeftM).toBeGreaterThan(under?.leftM ?? Infinity);
    expect(under?.paved).toBe(true);
  });

  it("gives left and right in the route's own direction: driven the other way, they swap", () => {
    const { x, z, heading } = route1.at(400);
    const along = laid.nearest(x + 1, z, heading);
    const back = laid.nearest(x + 1, z, heading + Math.PI);
    expect(along).not.toBeNull();
    expect(back).not.toBeNull();
    // A place a metre east of the middle is right of it one way and left of it the other.
    const rightOf = (point: NonNullable<typeof along>) => (x + 1 - point.x) * Math.cos(point.heading) - (z - point.z) * Math.sin(point.heading);
    expect(rightOf(along as NonNullable<typeof along>)).toBeCloseTo(-rightOf(back as NonNullable<typeof back>), 3);
    expect(along?.leftM).toBeCloseTo(back?.rightM ?? NaN, 3);
  });

  it("finds nothing far from any road, and nothing on a road crossing the way asked", () => {
    const { x, z, heading } = route1.at(400);
    expect(laid.nearest(x + 200, z + 200, heading)).toBeNull();
    expect(laid.nearest(x, z, heading + Math.PI / 2)).toBeNull();
  });
});
