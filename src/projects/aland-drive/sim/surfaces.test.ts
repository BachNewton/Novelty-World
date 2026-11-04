import { beforeAll, describe, expect, it } from "vitest";
import { RING_POINTS } from "../render/tile";
import { NO_INPUT } from "./car";
import { Drive, initPhysics, START_ALONG_M } from "./drive";
import { FIXTURE_TILES, readWorld } from "./read-tile";
import { chainLine } from "./road-net";

/*
 * Each wheel finds its own surface from the triangle its ray hit, which only
 * works while the collision blocks' triangles are counted as Rapier counts
 * them. A car straddling a road's edge is where a miscount shows: one side on
 * the carriageway, the other on the shoulder.
 */

const world = readWorld(FIXTURE_TILES);
const tile = world.named("L2343C").detail ?? (() => { throw new Error("the fixture has no detail"); })();
const route1 = chainLine(tile.roads, 0);
const EDGE_LEFT = 1;

beforeAll(initPhysics);

/** Route 1's left carriageway edge nearest a place along it. */
function leftEdgeNear(x: number, z: number) {
  const { rings, chains } = tile.surface;
  const { first, sections } = chains[0];
  let best = { x: 0, y: 0, z: 0, distance: Infinity };
  for (let section = first; section < first + sections; section++) {
    const at = (section * RING_POINTS + EDGE_LEFT) * 3;
    const distance = Math.hypot(rings[at] - x, rings[at + 2] - z);
    if (distance < best.distance) best = { x: rings[at], y: rings[at + 1], z: rings[at + 2], distance };
  }
  return best;
}

describe("the surface under each wheel", () => {
  it("is the carriageway's under the wheels on it and the shoulder's under those over the edge", () => {
    const road = route1.at(START_ALONG_M);
    const edge = leftEdgeNear(road.x, road.z);
    const drive = new Drive(world, road);
    drive.placeAt({ ...road, x: edge.x, y: edge.y, z: edge.z });
    for (let step = 0; step < 10; step++) drive.step(NO_INPUT);
    // Front left, front right, rear left, rear right.
    expect(drive.player.surfaces()).toEqual(["gravel", "asphalt", "gravel", "asphalt"]);
    drive.dispose();
  });
});
