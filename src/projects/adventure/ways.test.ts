import { describe, expect, it } from "vitest";
import { tilesOf, type Cell } from "./ways";

/** The tile and turn laid on each cell of a stretch, by its place. */
function laid(cells: readonly Cell[]): Record<string, string> {
  return Object.fromEntries(tilesOf("river", cells).map((t) => [`${t.x},${t.z}`, `${t.piece.slice("ground_river".length)} ${t.turn}`]));
}

describe("a wide stretch of water", () => {
  it("banks its rim, rounds its corners, and opens where a narrow way leaves it", () => {
    // Three cells by three, a narrow way leaving the middle of its +z side for two cells.
    const pool: Cell[] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [1, 3], [1, 4]];
    expect(laid(pool)).toMatchObject({
      "0,0": "Corner 0",
      "1,0": "Side 0",
      "2,0": "Corner 3",
      "0,1": "Side 1",
      "1,1": "Open 0",
      "0,2": "Corner 1",
      "1,2": "SideOpen 0",
      "1,3": "Straight 0",
      "1,4": "EndClosed 2",
    });
  });

  it("rounds an inner corner with a nub where only the diagonal is dry", () => {
    // An L: the cell at its crook has water on every side but one diagonal.
    const bend: Cell[] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
    expect(laid(bend)["1,1"]).toBe("CornerSmall 1");
  });
});
