import { describe, expect, it } from "vitest";
import { BOARD_WIDTH, TERRITORY_SHAPES } from "../board/board-data";
import type { TerritoryId } from "../map";
import { nearestTo, nextTerritory, type Placed } from "./territory-nav";

const at = (id: TerritoryId): Placed => ({ id, x: TERRITORY_SHAPES[id].label[0], y: TERRITORY_SHAPES[id].label[1] });
const from = (id: TerritoryId) => at(id);

describe("nextTerritory", () => {
  const grid: Placed[] = [
    { id: "centre", x: 100, y: 100 },
    { id: "east", x: 160, y: 104 },
    { id: "far-east", x: 260, y: 100 },
    { id: "north-east", x: 150, y: 40 },
    { id: "south", x: 98, y: 170 },
  ];

  it("goes to the nearest territory the way pressed", () => {
    expect(nextTerritory(grid, grid[0], "right", 1000)).toBe("east");
    expect(nextTerritory(grid, grid[0], "down", 1000)).toBe("south");
    expect(nextTerritory(grid, grid[0], "up", 1000)).toBe("north-east");
  });

  it("prefers one straight ahead to a nearer one off to the side", () => {
    const points: Placed[] = [
      { id: "here", x: 0, y: 0 },
      { id: "aside", x: 30, y: 25 },
      { id: "ahead", x: 60, y: 0 },
    ];
    expect(nextTerritory(points, points[0], "right", 1000)).toBe("ahead");
  });

  it("stays put with nothing that way, up and down never wrapping", () => {
    expect(nextTerritory(grid, grid[4], "down", 1000)).toBeNull();
    expect(nextTerritory([grid[0]], grid[0], "left", 1000)).toBeNull();
  });

  it("wraps east to west across the board's edge: Alaska and Kamchatka", () => {
    const pacific = [at("alaska"), at("kamchatka"), at("northwest-territory"), at("yakutsk")];
    expect(nextTerritory(pacific, from("alaska"), "left", BOARD_WIDTH)).toBe("kamchatka");
    expect(nextTerritory(pacific, from("kamchatka"), "right", BOARD_WIDTH)).toBe("alaska");
  });

  it("walks the real board sensibly", () => {
    const all = (Object.keys(TERRITORY_SHAPES) as TerritoryId[]).map(at);
    expect(nextTerritory(all, from("india"), "right", BOARD_WIDTH)).toBe("siam");
    expect(nextTerritory(all, from("western-australia"), "right", BOARD_WIDTH)).toBe("eastern-australia");
    expect(nextTerritory(all, from("egypt"), "down", BOARD_WIDTH)).toBe("east-africa");
  });
});

describe("nearestTo", () => {
  it("takes the candidate nearest the point, or nothing with no candidates", () => {
    expect(nearestTo([at("peru"), at("china")], { x: 300, y: 400 })).toBe("peru");
    expect(nearestTo([], { x: 0, y: 0 })).toBeNull();
  });
});
