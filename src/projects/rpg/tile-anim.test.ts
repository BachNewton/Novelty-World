import { describe, expect, it } from "vitest";
import {
  animFrameIndex,
  animPhase,
  animSrcCol,
  foldAnimSx,
  sheetForTileSrc,
} from "./tile-anim";
import type { TileSheet } from "./tiles";

const PINGPONG_8 = { frames: 8, frameW: 3, mode: "pingpong", fps: 8 } as const;
const LOOP_4 = { frames: 4, frameW: 5, mode: "loop", fps: 6 } as const;

function sheetWithAnim(anim: TileSheet["anim"]): TileSheet {
  return { src: "/s.png", name: "s", category: "c", cols: 24, rows: 5, anim };
}

describe("tile animation math", () => {
  it("loops frame indices modulo frames", () => {
    expect(animFrameIndex(LOOP_4, 0, 0, 0)).toBe(0);
    expect(animFrameIndex(LOOP_4, 1000 / 6, 0, 0)).toBe(1);
    expect(animFrameIndex(LOOP_4, (1000 / 6) * 4, 0, 0)).toBe(0);
  });

  it("ping-pongs over a 2*frames-2 triangle wave", () => {
    const at = (step: number) =>
      animFrameIndex(PINGPONG_8, step * (1000 / 8), 0, 0);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(at)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect([8, 9, 10, 11, 12, 13].map(at)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(at(14)).toBe(0);
  });

  it("offsets adjacent cells so water does not shimmer in lockstep", () => {
    const a = animFrameIndex(PINGPONG_8, 1000, 0, 0);
    const neighbors = [
      animFrameIndex(PINGPONG_8, 1000, 1, 0),
      animFrameIndex(PINGPONG_8, 1000, 0, 1),
      animFrameIndex(PINGPONG_8, 1000, 37, 12),
    ];
    expect(neighbors.some((n) => n !== a)).toBe(true);
    expect(animPhase(3, 5, 8)).toBe(animPhase(3, 5, 8));
  });

  it("maps frame + frame-0 sx to a source column, leaving sy alone", () => {
    const sheet = sheetWithAnim({ ...PINGPONG_8 });
    expect(animSrcCol(sheet, 1, 0, 0, 0)).toBe(1);
    expect(animSrcCol(sheet, 1, 1000 / 8, 0, 0)).toBe(3 + 1);
    const plain: TileSheet = { src: "/p.png", name: "p", category: "c", cols: 3, rows: 5 };
    expect(animSrcCol(plain, 2, 99999, 4, 4)).toBe(2);
  });

  it("folds legacy sx >= frameW into frame-0 range", () => {
    const sheet = sheetWithAnim({ ...PINGPONG_8 });
    expect(foldAnimSx(sheet, 7)).toBe(1);
    expect(foldAnimSx(sheet, 2)).toBe(2);
    expect(foldAnimSx(undefined, 7)).toBe(7);
  });

  it("resolves synthesized anim variants to their canonical anim sheet", () => {
    // Variant anim strips own no manifest entry (their PNGs are
    // synthesized); playback follows them to the canonical sheet so the
    // LUT remap preserves animation frames.
    const pairs: Array<[string, string]> = [
      [
        "/rpg/tiles/Water/Water_Tile_2_Anim.png",
        "/rpg/tiles/Water/Water_Tile_1_Anim.png",
      ],
      [
        "/rpg/tiles/Water/Water_Stone_Tile_4_Anim.png",
        "/rpg/tiles/Water/Water_Stone_Tile_1_Anim.png",
      ],
    ];
    for (const [variantSrc, canonicalSrc] of pairs) {
      const sheet = sheetForTileSrc(variantSrc);
      expect(sheet?.src).toBe(canonicalSrc);
      expect(sheet?.anim).toEqual({ frames: 8, frameW: 3, mode: "pingpong", fps: 8 });
      expect(foldAnimSx(sheet, 7)).toBe(1);
    }
  });
});
