import { describe, expect, it } from "vitest";
import { codeGround, flatGround, groundCell, painted, raised, terrainOf, type Cell, type GroundLayer } from "./ground";
import { cliffPieces } from "./cliffs";
import { PATHS } from "./town";

/** What stands in each of some cells, as `piece y turn`, sorted. */
function standing(ground: GroundLayer, cells: readonly Cell[]): string[][] {
  return cells.map(([x, z]) => cliffPieces(terrainOf(ground), x, z).map((p) => `${p.piece} ${p.y ?? 0} ${p.turn ?? 0}`).sort());
}

const ONE_UP = raised(flatGround(), [[0, 0]], 2);

describe("the cliffs", () => {
  it("stand a lid-topped face in each low cell beside a raised one, facing it, and a post in each low cell at its corners", () => {
    expect(standing(ONE_UP, [[0, 0], [1, 0], [0, -1], [-1, 0], [0, 1]])).toEqual([
      [],
      ["cliff_top_stone 0 3"],
      ["cliff_top_stone 0 0"],
      ["cliff_top_stone 0 1"],
      ["cliff_top_stone 0 2"],
    ]);
    expect(standing(ONE_UP, [[1, 1], [1, -1], [-1, -1], [-1, 1]])).toEqual([
      ["cliff_cornerTop_stone 0 3"],
      ["cliff_cornerTop_stone 0 0"],
      ["cliff_cornerTop_stone 0 1"],
      ["cliff_cornerTop_stone 0 2"],
    ]);
    expect(groundCell(ONE_UP, 0, 0, new Set()).tile).toEqual({ piece: "ground_grass", x: 0, z: 0, y: 1 });
  });

  it("stand one inner corner where a low cell meets a rise on two sides, and its storeys one on another", () => {
    const ell = raised(raised(flatGround(), [[1, 0], [1, 1], [0, 1]], 2), [[1, 0], [1, 1], [0, 1]], 2);
    expect(standing(ell, [[0, 0]])).toEqual([["cliff_cornerInnerTop_stone 1 1", "cliff_cornerInner_stone 0 1"]]);
  });

  it("stand half faces under a half storey, and a face on each side of a low cell between two rises", () => {
    expect(standing(raised(flatGround(), [[0, 0]], 1), [[1, 0]])).toEqual([["cliff_half_stone 0 3"]]);
    expect(standing(raised(flatGround(), [[-1, 0], [1, 0]], 2), [[0, 0]])).toEqual([["cliff_top_stone 0 1", "cliff_top_stone 0 3"]]);
  });

  it("stand a waterfall where water on raised ground meets the edge", () => {
    const stream = raised(painted(flatGround(), [[0, 0], [0, 1]], "water"), [[0, 1]], 4);
    expect(standing(stream, [[0, 0]])).toEqual([["cliff_waterfallTop_stone 1 0", "cliff_waterfall_stone 0 0"]]);
  });

  it("stand the code's ridge as it was built: its cave and steps in place of faces, its cut corner on the diagonal with no post beside it", () => {
    const ground = codeGround(PATHS);
    expect(standing(ground, [[-28, -30], [-20, -30], [-29, -31], [-30, -30]])).toEqual([
      ["cliff_cave_stone 0 2", "cliff_top_stone 1 2"],
      ["cliff_steps_stone 0 2"],
      ["cliff_blockDiagonal_stone 1 2", "cliff_diagonal_stone 0 2", "cliff_topDiagonal_stone 1 2"],
      [],
    ]);
  });

  it("leave an empty cell without ground, the faces of the ground above it still standing in it", () => {
    const hole = painted(ONE_UP, [[1, 0]], "empty");
    expect(groundCell(hole, 1, 0, new Set())).toEqual({ tile: null, cliffs: [{ piece: "cliff_top_stone", x: 1, z: 0, y: 0, turn: 3 }] });
    expect(painted(raised(flatGround(), [[1, 0]], 2), [[1, 0]], "empty").heights).toBe(flatGround().heights);
  });
});
