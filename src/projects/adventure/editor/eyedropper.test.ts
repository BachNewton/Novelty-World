import { describe, expect, it } from "vitest";
import type { Cliff } from "../cliffs";
import { cycled, faced, flatGround, groundCell, painted, raised, type Cell, type GroundLayer } from "../ground";
import { groundDropped } from "./eyedropper";

const RED_LARGE: Cliff = { rock: "rock", edge: "large" };
const GREY_PLAIN: Cliff = { rock: "stone", edge: "plain" };
const NONE: ReadonlySet<string> = new Set();

/** Every cliff the ground draws in the cells round a square. */
function cliffsRound(ground: GroundLayer, [x0, z0]: Cell, [x1, z1]: Cell) {
  const out = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push(...groundCell(ground, x, z, NONE).cliffs);
  return out;
}

describe("the eyedropper", () => {
  it("picks up each cliff as the raise brush in the stone of the raised cell it stands against, faces, posts and inner corners alike", () => {
    // Raised cells of two styles side by side, two heights, so faces, posts, top lips and inner corners stand against each.
    let ground = flatGround();
    const cells: Cell[] = [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [4, 1]];
    for (const [x, z] of cells) ground = raised(ground, [[x, z]], (x + z) % 4 === 0 ? 4 : 2, (x + z) % 4 === 0 ? RED_LARGE : GREY_PLAIN);
    const pieces = cliffsRound(ground, [-1, -1], [5, 3]);
    expect(pieces.some((p) => p.piece.includes("cornerInner"))).toBe(true);
    for (const p of pieces) {
      const picked = groundDropped(ground, p);
      // The kit's piece is named by the stone of the cell it stands against, and a large face only by a large cliff.
      const rock = p.piece.endsWith("_rock") ? "rock" : "stone";
      expect(picked, `${p.piece} at ${p.x},${p.z} turned ${p.turn ?? 0}`).toMatchObject({ pick: "raise", cliff: { rock } });
      if (/arge/.test(p.piece)) expect(picked).toMatchObject({ cliff: { edge: "large" } });
    }
  });

  it("picks up steps, a ramp, a cave or a cut corner as the face brush, and the plain face beside them as the raise brush", () => {
    let ground = raised(flatGround(), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], 2, GREY_PLAIN);
    ground = faced(ground, [[0, 1]], "steps");
    ground = faced(ground, [[1, 1]], "cave");
    ground = faced(ground, [[2, 1]], "cut");
    const picks = ([x, z]: Cell) => groundCell(ground, x, z, NONE).cliffs.map((p) => groundDropped(ground, p));
    expect(picks([0, 1])).toEqual([{ pick: "face", face: "steps" }]);
    expect(picks([1, 1])).toEqual([{ pick: "face", face: "cave" }]);
    expect(new Set(picks([2, 1]).map((p) => JSON.stringify(p)))).toEqual(new Set([JSON.stringify({ pick: "face", face: "cut" })]));
    expect(picks([0, -1])).toEqual([{ pick: "raise", cliff: GREY_PLAIN }]);
  });

  it("picks up a tile as its kind's brush, with the tile chosen for its cell", () => {
    const path = painted(flatGround(), [[0, 0], [0, 1], [0, 2]], "dirt");
    const rocky = cycled(path, 0, 1, NONE);
    const tile = (ground: GroundLayer, x: number, z: number) => groundCell(ground, x, z, NONE).tile ?? expect.fail("no tile");
    expect(groundDropped(rocky, tile(rocky, 0, 1))).toEqual({ pick: "paint", kind: "dirt", tile: "Rocks" });
    expect(groundDropped(rocky, tile(rocky, 0, 0))).toEqual({ pick: "paint", kind: "dirt", tile: null });
    expect(groundDropped(rocky, tile(rocky, 5, 5))).toEqual({ pick: "paint", kind: "grass", tile: null });
  });
});

describe("the face brush", () => {
  it("gives faces only to cells with ground, rubs them out, and changes nothing twice, so a stroke is one change or none", () => {
    const ground = painted(flatGround(), [[2, 0]], "empty");
    const stepped = faced(ground, [[0, 0], [1, 0], [2, 0]], "steps");
    expect(stepped.faces).toEqual({ "0,0": "steps", "1,0": "steps" });
    expect(faced(stepped, [[0, 0]], "steps")).toBe(stepped);
    expect(faced(stepped, [[0, 0], [1, 0]], null).faces).toEqual({});
    expect(faced(ground, [[0, 0]], null)).toBe(ground);
  });
});
