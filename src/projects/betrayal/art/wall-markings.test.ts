import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import type { Layout } from "../engine/board";
import { freezeRoom } from "./freeze";
import { stubCanvas } from "./headless";
import { definition } from "./house";
import { closedDoors, diffLayout, falseWindows, HOUSE_FIXTURE, MARKINGS_LAYOUT } from "./house-layout";
import { BENCH_ROOMS } from "./rooms";
import { buildRoom } from "./stage";

stubCanvas();

function tile(layout: Layout, id: string) {
  const found = layout.tiles.find((t) => t.tile === id);
  if (!found) throw new Error(`${id} is not in the layout`);
  return found;
}

describe("falseWindows", () => {
  const of = (layout: Layout, id: string) => falseWindows(layout, CATALOG, tile(layout, id));

  it("finds a window against another room, by printed edge", () => {
    // The Dining Room is turned a quarter, so its printed left window faces up, onto the Kitchen.
    expect(of(MARKINGS_LAYOUT, "dining-room")).toEqual(["left"]);
  });

  it("leaves a window facing an empty cell real, whatever lies on other floors", () => {
    expect(of(HOUSE_FIXTURE, "dining-room")).toEqual([]);
    expect(of(HOUSE_FIXTURE, "grand-staircase")).toEqual([]);
    expect(of(HOUSE_FIXTURE, "bedroom")).toEqual([]);
  });

  it("counts a room against the window whether or not that room has a door there", () => {
    // The Kitchen's bottom edge, against the window, is a plain wall.
    expect(CATALOG.rooms.kitchen.doors).not.toContain("bottom");
    expect(of(MARKINGS_LAYOUT, "dining-room")).toHaveLength(1);
  });
});

describe("diffLayout with windows", () => {
  it("rebuilds a room whose window a new neighbour blocks, as it does one whose door now meets a wall", () => {
    const change = diffLayout(HOUSE_FIXTURE, MARKINGS_LAYOUT, CATALOG);
    expect(change.added).toEqual(["kitchen"]);
    expect([...change.rebuilt].sort()).toEqual(["dining-room", "kitchen"]);
  });
});

describe("building rooms with the markings", () => {
  const ids = [...BENCH_ROOMS.map((room) => room.id), "dining-room", "bedroom"];
  it("builds and freezes every room with every door false and every window false", () => {
    for (const id of ids) {
      const room = CATALOG.rooms[id];
      const part = buildRoom(definition(id), { explorer: null, closedDoors: room.doors.filter((edge) => edge !== room.frontDoor), falseWindows: room.windows });
      expect(() => freezeRoom(id, part)).not.toThrow();
    }
  }, 30_000);

  it("builds every room in the markings house as the house would", () => {
    for (const placed of MARKINGS_LAYOUT.tiles) {
      const part = buildRoom(definition(placed.tile), {
        explorer: null,
        closedDoors: closedDoors(MARKINGS_LAYOUT, CATALOG, placed),
        falseWindows: falseWindows(MARKINGS_LAYOUT, CATALOG, placed),
      });
      expect(part.walls.length).toBeGreaterThan(0);
    }
  });
});
