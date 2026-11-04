import { describe, expect, it } from "vitest";
import { Discovery, type FoundStore } from "./discovery";
import type { Place } from "./places";
import { decodeRoadGraph, RoadGraph } from "./road-graph";

/* One straight road, east along z = 0 from x 0 to 2000, and places beside it and away from it. */

function road(): RoadGraph {
  return new RoadGraph(decodeRoadGraph({ unitM: 1, names: [""], kinds: ["primary"], nodes: [0, 0, 2000, 0], from: [0], to: [1], kind: [0], name: [0], flags: [2], counts: [0], points: [] }, 0));
}

const place = (id: string, x: number, z: number): Place => ({ id, name: id, kind: "church", x, z, note: "" });
const BY_THE_ROAD = place("by-the-road", 500, 10);
const UP_A_TRACK = place("up-a-track", 1500, 150);

function memory(saved: readonly string[] | null = null): FoundStore & { saved: readonly string[] | null } {
  const store = {
    saved,
    load: () => store.saved,
    save: (ids: readonly string[]) => {
      store.saved = ids;
    },
  };
  return store;
}

describe("finding places", () => {
  it("needs the car as close as the road lets it, plus a margin", () => {
    const discovery = new Discovery(road(), memory(), [BY_THE_ROAD, UP_A_TRACK]);
    // Each is found from the nearest point of the road, and not from 60 m short of it.
    expect(discovery.update(500, -60)).toEqual([]);
    expect(discovery.update(1500, -60)).toEqual([]);
    expect(discovery.update(500, 0).map(({ id }) => id)).toEqual(["by-the-road"]);
    expect(discovery.update(1500, 0).map(({ id }) => id)).toEqual(["up-a-track"]);
  });

  it("finds a place once, and keeps it for the next drive", () => {
    const store = memory();
    const first = new Discovery(road(), store, [BY_THE_ROAD]);
    expect(first.update(500, 0)).toHaveLength(1);
    expect(first.update(500, 0)).toHaveLength(0);
    const next = new Discovery(road(), store, [BY_THE_ROAD]);
    expect(next.isFound(BY_THE_ROAD)).toBe(true);
    expect(next.update(500, 0)).toHaveLength(0);
  });

  it("forgets a kept place the game no longer has", () => {
    const discovery = new Discovery(road(), memory(["gone", "by-the-road"]), [BY_THE_ROAD]);
    expect(discovery.foundCount).toBe(1);
  });
});
