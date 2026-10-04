import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import type { Board, PlacedTile, Rotation } from "../types";
import {
  adjacent,
  connections,
  distances,
  freeDoorways,
  lineOfSight,
  openings,
  placements,
  startingBoard,
  turn,
} from "./board";
import { randomFor } from "./random";

const base = () =>
  startingBoard(CATALOG, ["base"], randomFor("board", "setup"));

function withTiles(board: Board, ...tiles: PlacedTile[]): Board {
  return { ...board, tiles: [...board.tiles, ...tiles] };
}

describe("startingBoard", () => {
  it("lays out the base starting tiles and stacks the other base rooms (44 tiles, two of them landings)", () => {
    const board = base();
    expect(board.tiles.map((t) => t.tile).sort()).toEqual([
      "basement-landing",
      "entrance-hall",
      "foyer",
      "grand-staircase",
      "upper-landing",
    ]);
    expect(board.stack).toHaveLength(42);
    expect(board.stack.every((id) => CATALOG.rooms[id].set === "base")).toBe(
      true,
    );
  });

  it("adds the roof and the Widow's Walk rooms when the expansion is in play", () => {
    const board = startingBoard(
      CATALOG,
      ["base", "widows-walk"],
      randomFor("board", "setup"),
    );
    expect(board.tiles.map((t) => t.tile)).toContain("roof-landing");
    expect(board.stack).toHaveLength(42 + 19);
  });
});

describe("connections", () => {
  it("joins the three rooms of the starting tile and the stairs to the Upper Landing", () => {
    const board = base();
    expect(connections(board, CATALOG, "foyer")).toEqual([
      "entrance-hall",
      "grand-staircase",
    ]);
    expect(connections(board, CATALOG, "grand-staircase")).toEqual([
      "foyer",
      "upper-landing",
    ]);
    expect(connections(board, CATALOG, "upper-landing")).toEqual([
      "grand-staircase",
    ]);
  });

  it("never opens the front door", () => {
    const entrance = base().tiles.find((t) => t.tile === "entrance-hall");
    expect(entrance && openings(CATALOG, entrance)).toEqual([
      "top",
      "bottom",
      "left",
    ]);
  });

  it("links the Stairs from Basement to the Foyer only once it is discovered", () => {
    const board = base();
    expect(connections(board, CATALOG, "foyer")).not.toContain(
      "stairs-from-basement",
    );
    const after = withTiles(board, {
      tile: "stairs-from-basement",
      floor: "basement",
      x: 0,
      y: -1,
      rotation: 0,
    });
    expect(connections(after, CATALOG, "foyer")).toContain(
      "stairs-from-basement",
    );
  });

  it("doesn't pass a false feature, though the rooms are still adjacent", () => {
    // The Chasm's doors are left and right; turned upright it shows a wall to the Basement Landing's top door.
    const board = withTiles(base(), {
      tile: "chasm",
      floor: "basement",
      x: 0,
      y: -1,
      rotation: 0,
    });
    expect(connections(board, CATALOG, "basement-landing")).not.toContain(
      "chasm",
    );
    expect(adjacent(board, "basement-landing")).toEqual(["chasm"]);
  });
});

describe("turn", () => {
  it("turns printed edges clockwise with the tile", () => {
    expect(turn("top", 1)).toBe("right");
    expect(turn("left", 1)).toBe("top");
    expect(turn("right", 3)).toBe("top");
  });
});

describe("lineOfSight and distances", () => {
  // Basement Landing at (0,0) with a straight corridor of four-door hallways running right.
  const board = withTiles(
    base(),
    { tile: "creaky-hallway", floor: "basement", x: 1, y: 0, rotation: 0 },
    { tile: "dusty-hallway", floor: "basement", x: 2, y: 0, rotation: 0 },
    { tile: "game-room", floor: "basement", x: 2, y: 1, rotation: 0 },
  );

  it("sees along an unbroken line of doors", () => {
    expect(lineOfSight(board, CATALOG, "basement-landing")).toEqual([
      "creaky-hallway",
      "dusty-hallway",
    ]);
  });

  it("counts spaces by route", () => {
    expect(distances(board, CATALOG, "basement-landing")).toEqual({
      "basement-landing": 0,
      "creaky-hallway": 1,
      "dusty-hallway": 2,
      "game-room": 3,
    });
  });
});

describe("placements", () => {
  it("offers only rotations with a door back to the room it was entered from", () => {
    // The Crypt has a single door, printed on top: entering from the Basement Landing's right door
    // needs that door facing left, which is three quarter turns.
    const result = placements(base(), CATALOG, "crypt", {
      room: "basement-landing",
      direction: "right",
    });
    expect(result.map((p) => p.rotation)).toEqual([3]);
    expect(result[0].matched).toBe(1);
  });

  it("flags a placement that would seal off its floor", () => {
    // One-door rooms close every Basement Landing door but the top one.
    const basement = (
      tile: string,
      x: number,
      y: number,
      rotation: Rotation,
    ): PlacedTile => ({
      tile,
      floor: "basement",
      x,
      y,
      rotation,
    });
    const board = withTiles(
      base(),
      basement("crypt", 1, 0, 3),
      basement("storeroom", -1, 0, 1),
      basement("vault", 0, 1, 0),
    );
    const last = { room: "basement-landing", direction: "top" } as const;
    expect(freeDoorways(board, CATALOG, "basement")).toEqual([last]);
    expect(placements(board, CATALOG, "pentagram-chamber", last)).toEqual([
      { rotation: 1, matched: 1, seals: true },
    ]);
    expect(
      placements(board, CATALOG, "creaky-hallway", last).every((p) => !p.seals),
    ).toBe(true);
  });

  it("refuses a doorway that doesn't open onto an empty cell", () => {
    expect(() =>
      placements(base(), CATALOG, "crypt", {
        room: "foyer",
        direction: "left",
      }),
    ).toThrow();
  });
});
