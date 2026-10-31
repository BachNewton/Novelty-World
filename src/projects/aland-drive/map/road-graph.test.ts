import { describe, expect, it } from "vitest";
import { decodeRoadGraph, RoadGraph, type RoadMapFile } from "./road-graph";

/*
 * A small town of made-up roads, in metres east and north:
 *
 *   0 ---- 1 ---- 2      A fast road along the top, 0 to 2, with a slow short cut
 *          |             down and back that a route by distance would take.
 *   5 ---- 3 ---- 4      The bottom road runs one way, 3 to 4.
 *
 *   6 ---- 7             An island: joined to nothing, so not to be routed to.
 */

const ONE_WAY = 1;
const CAN_ROUTE = 2;

function town(): RoadGraph {
  const nodes = [
    [0, 1000],
    [1000, 1000],
    [2000, 1000],
    [1000, 0],
    [2000, 0],
    [0, 0],
    [0, -3000],
    [1000, -3000],
  ];
  const file: RoadMapFile = {
    unitM: 1,
    names: ["", "Top Road", "Cross Street", "Bottom Road"],
    kinds: ["primary", "service"],
    nodes: nodes.flat(),
    from: [0, 1, 1, 3, 5, 6],
    to: [1, 2, 3, 4, 3, 7],
    kind: [0, 0, 1, 1, 1, 0],
    name: [1, 1, 2, 3, 3, 0],
    flags: [CAN_ROUTE, CAN_ROUTE, CAN_ROUTE, CAN_ROUTE | ONE_WAY, CAN_ROUTE, 0],
    counts: [0, 0, 0, 0, 0, 0],
    points: [],
  };
  return new RoadGraph(decodeRoadGraph(file, 0));
}

const east = Math.PI / 2;

describe("the GPS", () => {
  it("turns right down the cross street, and says so", () => {
    const route = town().route(100, -1000, east, 1900, 0);
    if (!route) throw new Error("no route");
    expect([route.end.x, route.end.z]).toEqual([1900, 0]);
    expect(route.line.length).toBeCloseTo(900 + 1000 + 900, 0);
    expect(route.turns).toHaveLength(2);
    expect(route.turns[0].radians).toBeCloseTo(Math.PI / 2, 1);
    expect(route.turns[1].radians).toBeCloseTo(-Math.PI / 2, 1);
  });

  it("won't drive a one-way road backwards", () => {
    const route = town().route(1900, 0, east, 1100, 0);
    expect(route).toBeNull();
  });

  it("won't route to a road no bridge joins to the rest", () => {
    const route = town().route(100, -1000, east, 500, 3000);
    if (!route) throw new Error("no route");
    expect(route.end.z).not.toBeCloseTo(3000);
  });
});
