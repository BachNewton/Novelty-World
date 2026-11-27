import { describe, expect, it } from "vitest";
import { codeGround, cycled, flatGround, GROUND, GROUND_SIDE, painted, raised, tileAt, type Cell, type GroundLayer } from "./ground";
import { PATHS } from "./town";

const GRASS: GroundLayer = flatGround();

/** The tile laid on each of a few cells, by hand from the bench: what each tile's path does unturned, and a quarter turn taking +x to −z. */
function tilesAt(ground: GroundLayer, cells: readonly Cell[], ramps: ReadonlySet<string> = new Set()): string[] {
  return cells.map(([x, z]) => {
    const tile = tileAt(ground, x, z, ramps);
    return tile === null ? "none" : `${tile.piece} ${tile.turn ?? 0}`;
  });
}

/** A path from cell to cell in straight runs, painted on grass. */
const path = (...way: Cell[]): GroundLayer => painted(GRASS, line(way), "dirt");
function line(way: readonly Cell[]): Cell[] {
  const cells: Cell[] = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [[fx, fz], [tx, tz]] = [way[i - 1], way[i]];
    for (let s = 1; s <= Math.abs(tx - fx) + Math.abs(tz - fz); s++) cells.push([fx + Math.sign(tx - fx) * s, fz + Math.sign(tz - fz) * s]);
  }
  return cells;
}

describe("the ground", () => {
  it("lays an L-shaped path's ends, runs and bend each the right way round", () => {
    expect(tilesAt(path([0, 0], [0, 2], [2, 2]), [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]])).toEqual([
      "ground_pathEndClosed 0",
      "ground_pathStraight 0",
      "ground_pathBend 1",
      "ground_pathStraight 1",
      "ground_pathEndClosed 3",
    ]);
  });

  it("joins crossing paths with a crossing, and a branch with a split facing it", () => {
    expect(tilesAt(painted(path([0, 0], [4, 0]), line([[2, -2], [2, 2]]), "dirt"), [[2, 0]])).toEqual(["ground_pathCross 0"]);
    expect(tilesAt(painted(path([0, 0], [4, 0]), line([[2, 0], [2, -2]]), "dirt"), [[2, 0]])).toEqual(["ground_pathSplit 2"]);
  });

  it("retiles a painted cell's neighbours, and rubbing it out puts them back", () => {
    const straight = path([0, 0], [0, 4]);
    const branched = painted(straight, [[1, 2]], "dirt");
    expect(tilesAt(branched, [[0, 2], [1, 2]])).toEqual(["ground_pathSplit 1", "ground_pathEndClosed 3"]);
    expect(painted(branched, [[1, 2]], "grass")).toEqual(straight);
  });

  it("lays any painted shape, where the kit has no tile for a wide stretch's, as a way joining the same neighbours", () => {
    // A narrow way running into a square of four, flush with its side.
    const ground = painted(path([0, -2], [0, 1]), [[1, 0], [1, 1]], "dirt");
    expect(tilesAt(ground, [[0, 0]])).toEqual(["ground_pathSplit 1"]);
  });

  it("keeps a chosen tile while it fits the cell's shape, and lets it go to the plain one when a repaint changes the shape", () => {
    const rocky = cycled(path([0, 0], [0, 4]), 0, 2, new Set());
    expect(tilesAt(rocky, [[0, 2]])).toEqual(["ground_pathRocks 0"]);
    expect(tilesAt(painted(rocky, [[0, 5]], "dirt"), [[0, 2]])).toEqual(["ground_pathRocks 0"]);
    const branched = painted(rocky, [[1, 2]], "dirt");
    expect(tilesAt(painted(branched, [[1, 2]], "grass"), [[0, 2]])).toEqual(["ground_pathStraight 0"]);
  });

  it("runs an end out level onto steps or a ramp, and closes it where cycled to", () => {
    const ground = path([0, 0], [0, 2]);
    const steps = new Set(["0,-1,0"]);
    expect(tilesAt(ground, [[0, 0]], steps)).toEqual(["ground_pathEnd 0"]);
    expect(tilesAt(cycled(ground, 0, 0, steps), [[0, 0]], steps)).toEqual(["ground_pathEndClosed 0"]);
  });

  it("lays the code's water over its paths, a path ending either side of the water it crosses", () => {
    // The road west crosses the river's broad reach on a bridge.
    const ground = codeGround(PATHS);
    expect(tilesAt(ground, [[-34, 0], [-30, 0]]).map((t) => t.split(" ")[0])).toEqual(["ground_pathEndClosed", "ground_pathEndClosed"]);
    expect(tileAt(ground, -32, 0, new Set())?.piece.startsWith("ground_river")).toBe(true);
  });

  it("joins a way only to its kind at its own height, and water to water below, which it runs on into", () => {
    const raisedPath = raised(path([0, 0], [0, 4]), [[0, 3], [0, 4]], 2);
    expect(tilesAt(raisedPath, [[0, 2], [0, 3]])).toEqual(["ground_pathEndClosed 2", "ground_pathEndClosed 0"]);
    const stream = raised(painted(GRASS, line([[0, 0], [0, 4]]), "water"), [[0, 3], [0, 4]], 2);
    expect(tilesAt(stream, [[0, 2], [0, 3]])).toEqual(["ground_riverEndClosed 2", "ground_riverStraight 0"]);
  });

  it("raises a cell from the ground with the cliff of the rise beside it, never lower than the ground, and never an empty cell", () => {
    const at = (x: number, z: number): number => (z - GROUND.min) * GROUND_SIDE + (x - GROUND.min);
    const marks = GRASS.cliffs.split("");
    marks[at(0, 0)] = "P";
    const mesa = raised({ ...GRASS, cliffs: marks.join("") }, [[0, 0]], 2);
    expect(raised(mesa, [[1, 0]], 2).cliffs[at(1, 0)]).toBe("P");
    expect(raised(mesa, [[0, 0]], -4)).toEqual(raised(mesa, [[0, 0]], -2));
    const empty = painted(GRASS, [[0, 0]], "empty");
    expect(raised(empty, [[0, 0]], 2)).toBe(empty);
  });
});
