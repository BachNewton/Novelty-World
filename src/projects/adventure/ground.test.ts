import { describe, expect, it } from "vitest";
import { groundOf, type Cell } from "./ground";

/** The tile laid on each of a few cells, by hand from the bench: what each tile's path does unturned, and a quarter turn taking +x to −z. */
function tilesAt(paths: readonly (readonly Cell[])[], cells: readonly Cell[]): string[] {
  const ground = groundOf(paths);
  return cells.map(([x, z]) => {
    const tile = ground.find((p) => p.x === x && p.z === z);
    return `${tile?.piece} ${tile?.turn ?? 0}`;
  });
}

describe("the ground", () => {
  it("lays an L-shaped path's ends, runs and bend each the right way round", () => {
    expect(tilesAt([[[0, 0], [0, 2], [2, 2]]], [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]])).toEqual([
      "ground_pathEndClosed 0",
      "ground_pathStraight 0",
      "ground_pathBend 1",
      "ground_pathStraight 1",
      "ground_pathEndClosed 3",
    ]);
  });

  it("joins crossing paths with a crossing, and a branch with a split facing it", () => {
    expect(tilesAt([[[0, 0], [4, 0]], [[2, -2], [2, 2]]], [[2, 0]])).toEqual(["ground_pathCross 0"]);
    expect(tilesAt([[[0, 0], [4, 0]], [[2, 0], [2, -2]]], [[2, 0]])).toEqual(["ground_pathSplit 2"]);
  });
});
