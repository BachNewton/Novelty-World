import { describe, expect, it } from "vitest";
import { ROOMS } from "../data/rooms";
import type { PlacedTile } from "../types";
import { inHouse, walkLength, walkPath, walkPose, WALK_SPEED } from "./house-walk";
import { BENCH_ROOMS } from "./rooms";

/** Every stair drawn between two rooms, once each way. */
const LINKS = BENCH_ROOMS.flatMap((room) => Object.keys(room.stairs ?? {}).map((toward) => [room.id, toward] as const));

const ways = (id: string) => {
  const room = BENCH_ROOMS.find((candidate) => candidate.id === id);
  if (!room) throw new Error(`${id} has no art`);
  return room;
};

/** A room where the game puts it at the start, or else unturned, as its art is built. A room
 *  without a start (the Stairs from Basement) is turned in play whichever way its door fits, so
 *  its link is held to line up only unturned: it is a secret way, not one continuous flight. */
function tileOf(id: string): PlacedTile {
  const tile = ROOMS.find((candidate) => candidate.id === id);
  if (!tile) throw new Error(`${id} is not a room`);
  return { tile: id, ...(tile.start ?? { floor: tile.floors[0], x: 0, y: 0 }), rotation: 0 };
}

const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

describe("the stairs between floors", () => {
  it("are drawn at both ends", () => {
    expect(LINKS.length).toBeGreaterThan(0);
    for (const [from, to] of LINKS) expect(ways(to).stairs?.[from], `${to} has no stair back to ${from}`).toBeDefined();
  });

  it.each(LINKS)("from %s to %s, arrive facing the way the walker climbed or went down", (from, to) => {
    const layout = { tiles: [tileOf(from), tileOf(to)] };
    const foot = ways(from).stairs?.[to]?.[0];
    const off = ways(to).stairs?.[from]?.[0];
    if (!foot || !off) throw new Error(`no stair joins ${from} and ${to}`);
    const path = walkPath(layout, [from, to], inHouse(layout, from, foot), inHouse(layout, to, off), ways);
    const change = path.findIndex((point, i) => i > 0 && point.floor !== path[i - 1].floor);
    const at = walkLength(path.slice(0, change));
    const heading = (distance: number) => walkPose({ path, start: 0 }, distance / WALK_SPEED).heading;
    // Half a metre either side of the change of floor: the last stride on one floor and the first on the next.
    expect(Math.abs(wrapped(heading(at + 0.5) - heading(at - 0.5)))).toBeLessThan(0.05);
    // And on along the stair to where the walker steps off it.
    expect(Math.abs(wrapped(heading(walkLength(path) - 0.05) - heading(at - 0.5)))).toBeLessThan(0.05);
  });
});
