import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import { testGame } from "../testing";
import type { Board, PlacedTile } from "../types";
import { drawRoom, placeOptions, type Where } from "./tiles";

// The one placement rule every way of putting a tile in the house shares.

const upper = (
  tile: string,
  x: number,
  y: number,
  rotation: PlacedTile["rotation"] = 0,
): PlacedTile => ({ tile, floor: "upper", x, y, rotation });

function board(...tiles: PlacedTile[]): Board {
  return {
    tiles: [upper("upper-landing", 0, 0), ...tiles],
    stack: [],
    discards: [],
  };
}

describe("placeOptions", () => {
  it("lets a tile face any of the doorways that open onto its cell", () => {
    // Hallways north and east of the Upper Landing both have a door onto (1, -1).
    const b = board(
      upper("creaky-hallway", 0, -1),
      upper("dusty-hallway", 1, 0),
    );
    const options = placeOptions(CATALOG, b, "storeroom", {
      kind: "doorways",
      floors: ["upper"],
      except: null,
    }).filter((o) => o.x === 1 && o.y === -1);
    // The Storeroom's one door, printed on top, turned to face south or west.
    expect(options.map((o) => o.rotation).sort()).toEqual([2, 3]);
  });

  it("keeps a tile off floors its back doesn't list", () => {
    expect(
      placeOptions(CATALOG, board(), "crypt", {
        kind: "doorways",
        floors: ["upper"],
        except: null,
      }),
    ).toEqual([]);
  });

  it("picks a moving tile up first, and leaves out the cell it left", () => {
    const b = board(upper("creaky-hallway", 0, -1));
    const options = placeOptions(CATALOG, b, "creaky-hallway", {
      kind: "doorways",
      floors: ["upper"],
      except: { floor: "upper", x: 0, y: -1 },
    });
    // The Landing's other three doors; the hallway's own doorways went with it.
    expect(options.map((o) => [o.x, o.y]).sort()).toEqual([
      [-1, 0],
      [0, 1],
      [1, 0],
    ]);
  });

  it("never moves a tile so that the floor it leaves is sealed", () => {
    // One-door rooms fill the Landing's doors. A hallway put beyond the
    // Storeroom's back wall (as by a Wall Switch) holds the floor's only free
    // doorways, so taking it away would seal the upper floor.
    const b = board(
      upper("storeroom", 1, 0, 3),
      upper("solarium", 0, 1, 0),
      upper("attic", -1, 0, 3),
      upper("bathroom", 0, -1, 0),
      upper("creaky-hallway", 2, 0),
      { tile: "entrance-hall", floor: "ground", x: 2, y: 0, rotation: 0 },
    );
    const ground: Where = {
      kind: "doorways",
      floors: ["ground"],
      except: null,
    };
    expect(placeOptions(CATALOG, b, "creaky-hallway", ground)).toEqual([]);
    // A tile not yet in the house may go there.
    expect(placeOptions(CATALOG, b, "dusty-hallway", ground)).not.toEqual([]);
  });

  it("puts a tile on a given cell any way round, lining up as many doors as it can", () => {
    const options = placeOptions(CATALOG, board(), "storeroom", {
      kind: "cell",
      spot: { floor: "upper", x: 1, y: 0 },
    });
    // Only facing the Landing's east door lines up a door.
    expect(options).toEqual([{ floor: "upper", x: 1, y: 0, rotation: 3 }]);
  });
});

describe("drawRoom", () => {
  it("in one pass, discards what doesn't pass and gives up at the end of the stack", () => {
    const state = testGame();
    state.board.stack = ["crypt", "larder"];
    state.board.discards = ["kitchen"];
    const tile = drawRoom(
      state,
      (items) => [...items],
      (t) => t === "kitchen",
      false,
    );
    expect(tile).toBeNull();
    expect(state.board.discards).toEqual(["kitchen", "crypt", "larder"]);
  });

  it("otherwise reshuffles the discards into a new stack", () => {
    const state = testGame();
    state.board.stack = ["crypt"];
    state.board.discards = ["kitchen"];
    const tile = drawRoom(
      state,
      (items) => [...items],
      (t) => t === "kitchen",
    );
    expect(tile).toBe("kitchen");
    expect(state.board.discards).toEqual([]);
    expect(state.board.stack).toEqual(["crypt"]);
  });
});
