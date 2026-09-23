import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import VARIANTS_TABLE from "./variants.json";
import { TILE_SHEETS } from "./tiles";
import {
  animFor,
  isAnimSheet,
  isMatrixMember,
  isNestedSingle,
  isVariantSrc,
  matrixFor,
  matrixIndicesFor,
  matrixPaintSrc,
  matrixSwatchCss,
  nestedSingleSrcsFor,
  pickerSrcsFor,
  staticFor,
  syncGroupFor,
  syncKeyFor,
} from "./tile-variants";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "..", "..", "..", "public");

interface VariantFamily {
  canonical: string;
  variants: Record<string, Record<string, string>>;
}

const HEX = /^#[0-9a-f]{8}$/;

/** Variant families whose canonical is an animated strip (the variants
 * are synthesized tint-duplicates of the _1_Anim sheet and animate
 * through the synthesis). Everywhere else, animated sheets stay out. */
const ANIM_FAMILIES = new Set(["water-tile-anim", "water-stone-tile-anim"]);

describe("tile palette variants", () => {
  it("lists only static, non-test sheets (plus allowlisted anim families)", () => {
    for (const [family, entry] of Object.entries(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      expect(
        Object.keys(entry),
        `${family} must be { canonical, variants }`,
      ).toEqual(["canonical", "variants"]);
      const srcs = [entry.canonical, ...Object.keys(entry.variants)];
      expect(srcs.length).toBeGreaterThan(1);
      for (const src of srcs) {
        if (!ANIM_FAMILIES.has(family)) {
          expect(src, "no animated strips in the variant table").not.toMatch(
            /Anim/,
          );
        }
        expect(src, "no TEST sheets in the variant table").not.toMatch(
          /TEST/,
        );
        expect(src, "no Animation sheets in the variant table").not.toMatch(
          /Animation/,
        );
      }
      for (const [variantSrc, lut] of Object.entries(entry.variants)) {
        expect(
          Object.keys(lut).length,
          `${variantSrc} needs a non-empty LUT`,
        ).toBeGreaterThan(0);
        for (const [oldHex, newHex] of Object.entries(lut)) {
          expect(oldHex, `${variantSrc} old color`).toMatch(HEX);
          expect(newHex, `${variantSrc} new color`).toMatch(HEX);
          expect(newHex, `${variantSrc} must actually remap`).not.toBe(
            oldHex,
          );
        }
      }
    }
  });

  it("keeps canonical sheets on disk", () => {
    for (const entry of Object.values(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in variant table, never external input
      expect(existsSync(path.join(PUBLIC, entry.canonical))).toBe(true);
    }
  });

  it("keeps synthesized variant PNGs off disk", () => {
    const present: string[] = [];
    for (const entry of Object.values(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      for (const variantSrc of Object.keys(entry.variants)) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in variant table, never external input
        if (existsSync(path.join(PUBLIC, variantSrc))) {
          present.push(variantSrc);
        }
      }
    }
    expect(
      present,
      `variant PNGs must stay deleted (runtime synthesizes them): ${present.join(", ")}`,
    ).toEqual([]);
  });
});

describe("tile matrix pickers", () => {
  const WF1 = "/rpg/tiles/Waterfall/Waterfall_1.png";
  const WF5 = "/rpg/tiles/Waterfall/Waterfall_5.png";

  it("folds the brown-rock sheet into the waterfall section", () => {
    const matrix = matrixFor(WF1);
    expect(matrix?.key).toBe("waterfall");
    expect(matrix?.axes.map((axis) => axis.key)).toEqual(["bank", "rock"]);
    expect(matrixFor(WF5)).toBeNull();
    expect(isMatrixMember(WF5)).toBe(true);
    expect(isMatrixMember(WF1)).toBe(false);
  });

  it("resolves every bank x rock combination to a registered paint src", () => {
    const matrix = matrixFor(WF1);
    expect(matrix).not.toBeNull();
    if (matrix === null) return;
    const cells: Array<[number, number, string]> = [
      [0, 0, "/rpg/tiles/Waterfall/Waterfall_1.png"],
      [0, 1, "/rpg/tiles/Waterfall/Waterfall_5.png"],
      [1, 0, "/rpg/tiles/Waterfall/Waterfall_2.png"],
      [1, 1, "/rpg/tiles/Waterfall/Waterfall_6.png"],
      [2, 0, "/rpg/tiles/Waterfall/Waterfall_3.png"],
      [2, 1, "/rpg/tiles/Waterfall/Waterfall_7.png"],
      [3, 0, "/rpg/tiles/Waterfall/Waterfall_4.png"],
      [3, 1, "/rpg/tiles/Waterfall/Waterfall_8.png"],
    ];
    for (const [bank, rock, paintSrc] of cells) {
      expect(matrixPaintSrc(matrix, [bank, rock])).toBe(paintSrc);
      expect(matrixIndicesFor(matrix, paintSrc)).toEqual([bank, rock]);
      // Every cell paints through a real file or the LUT synthesis path.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in matrix table, never external input
      const onDisk = existsSync(path.join(PUBLIC, paintSrc));
      expect(
        onDisk || isVariantSrc(paintSrc),
        `${paintSrc} is neither on disk nor synthesized`,
      ).toBe(true);
    }
    expect(matrixIndicesFor(matrix, "/rpg/tiles/Grass/Grass_Tiles_1.png")).toBeNull();
  });

  it("shows rock tones on the rock axis, grass tones on the bank axis", () => {
    const matrix = matrixFor(WF1);
    expect(matrix).not.toBeNull();
    if (matrix === null) return;
    expect(matrixSwatchCss(matrix, "rock", WF1)).toBe("#6c7c9d");
    expect(matrixSwatchCss(matrix, "rock", WF5)).toBe("#9c6754");
    expect(matrixSwatchCss(matrix, "bank", WF1)).not.toBe("#888888");
    expect(matrixSwatchCss(matrix, "nope", WF1)).toBe("#888888");
  });
});

describe("tile nested singles", () => {
  const BY_SRC = new Map(TILE_SHEETS.map((sheet) => [sheet.src, sheet]));

  it("nests every 1x1 sheet in a parent section", () => {
    const singles = TILE_SHEETS.filter(
      (sheet) => sheet.cols === 1 && sheet.rows === 1,
    );
    expect(singles.length).toBeGreaterThan(0);
    for (const single of singles) {
      expect(isNestedSingle(single.src), `${single.src} needs a parent`).toBe(true);
    }
  });

  it("resolves nested children to real 1x1 manifest sheets", () => {
    const parents = new Set<string>();
    for (const sheet of TILE_SHEETS) {
      for (const childSrc of nestedSingleSrcsFor(sheet.src)) {
        parents.add(sheet.src);
        const child = BY_SRC.get(childSrc);
        expect(child, `${childSrc} must be a manifest sheet`).toBeDefined();
        expect(child?.cols).toBe(1);
        expect(child?.rows).toBe(1);
      }
    }
    // Nested sheets paint from the parent section, never standalone.
    for (const sheet of TILE_SHEETS) {
      if (isNestedSingle(sheet.src)) {
        expect(parents.has(sheet.src)).toBe(false);
      }
    }
    expect(nestedSingleSrcsFor("/rpg/tiles/Grass/Grass_Tiles_1.png")).toEqual([
      "/rpg/tiles/Grass/Grass_1_Middle.png",
      "/rpg/tiles/Grass/Path_Middle.png",
    ]);
  });

  it("nests the water middle under the stone section", () => {
    expect(nestedSingleSrcsFor("/rpg/tiles/Water/Water_Stone_Tile_1.png")).toEqual([
      "/rpg/tiles/Water/Water_Middle.png",
    ]);
    expect(
      nestedSingleSrcsFor("/rpg/tiles/Water/Water_Tile_1.png"),
    ).toEqual([]);
  });
});

describe("tile synced variant pickers", () => {
  const TILES = "/rpg/tiles/Grass/Grass_Tiles_1.png";
  const MIDDLE = "/rpg/tiles/Grass/Grass_1_Middle.png";

  it("shares one picker state across grass tiles and grass middle", () => {
    expect(syncGroupFor(TILES)).toEqual([TILES, MIDDLE]);
    expect(syncGroupFor(MIDDLE)).toEqual([TILES, MIDDLE]);
    expect(syncKeyFor(TILES)).toBe(TILES);
    expect(syncKeyFor(MIDDLE)).toBe(TILES);
    expect(syncGroupFor("/rpg/tiles/Water/Water_Tile_1.png")).toBeNull();
    expect(syncKeyFor("/rpg/tiles/Water/Water_Tile_1.png")).toBe(
      "/rpg/tiles/Water/Water_Tile_1.png",
    );
  });

  it("nests synced members under the primary so one picker drives both", () => {
    // Non-primary members must render as picker-less rows in the primary's
    // section (see the load-time invariant in tile-variants); the palette
    // then exposes exactly one swatch row per sync group.
    expect(nestedSingleSrcsFor(TILES)).toContain(MIDDLE);
    expect(isNestedSingle(MIDDLE)).toBe(true);
  });

  it("keeps synced members index-aligned over four paint srcs", () => {
    expect(pickerSrcsFor(TILES)).toEqual([
      "/rpg/tiles/Grass/Grass_Tiles_1.png",
      "/rpg/tiles/Grass/Grass_Tiles_2.png",
      "/rpg/tiles/Grass/Grass_Tiles_3.png",
      "/rpg/tiles/Grass/Grass_Tiles_4.png",
    ]);
    expect(pickerSrcsFor(MIDDLE)).toEqual([
      "/rpg/tiles/Grass/Grass_1_Middle.png",
      "/rpg/tiles/Grass/Grass_2_Middle.png",
      "/rpg/tiles/Grass/Grass_3_Middle.png",
      "/rpg/tiles/Grass/Grass_4_Middle.png",
    ]);
  });
});

describe("tile water matrix", () => {
  const STONE = "/rpg/tiles/Water/Water_Stone_Tile_1.png";
  const DIRT = "/rpg/tiles/Water/Water_Tile_1.png";

  it("folds the dirt-rim sheet into the stone section", () => {
    const matrix = matrixFor(STONE);
    expect(matrix?.key).toBe("water");
    expect(matrix?.axes.map((axis) => axis.key)).toEqual(["tint", "rim"]);
    expect(matrixFor(DIRT)).toBeNull();
    expect(isMatrixMember(DIRT)).toBe(true);
    expect(isMatrixMember(STONE)).toBe(false);
  });

  it("resolves every tint x rim combination to a registered paint src", () => {
    const matrix = matrixFor(STONE);
    expect(matrix).not.toBeNull();
    if (matrix === null) return;
    const cells: Array<[number, number, string]> = [
      [0, 0, "/rpg/tiles/Water/Water_Stone_Tile_1.png"],
      [0, 1, "/rpg/tiles/Water/Water_Tile_1.png"],
      [1, 0, "/rpg/tiles/Water/Water_Stone_Tile_2.png"],
      [1, 1, "/rpg/tiles/Water/Water_Tile_2.png"],
      [2, 0, "/rpg/tiles/Water/Water_Stone_Tile_3.png"],
      [2, 1, "/rpg/tiles/Water/Water_Tile_3.png"],
      [3, 0, "/rpg/tiles/Water/Water_Stone_Tile_4.png"],
      [3, 1, "/rpg/tiles/Water/Water_Tile_4.png"],
    ];
    for (const [tint, rim, paintSrc] of cells) {
      expect(matrixPaintSrc(matrix, [tint, rim])).toBe(paintSrc);
      expect(matrixIndicesFor(matrix, paintSrc)).toEqual([tint, rim]);
      // Every cell paints through a real file or the LUT synthesis path.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in matrix table, never external input
      const onDisk = existsSync(path.join(PUBLIC, paintSrc));
      expect(
        onDisk || isVariantSrc(paintSrc),
        `${paintSrc} is neither on disk nor synthesized`,
      ).toBe(true);
    }
    expect(matrixIndicesFor(matrix, "/rpg/tiles/Grass/Grass_Tiles_1.png")).toBeNull();
  });

  it("shows rim tones on the rim axis, grass tones on the tint axis", () => {
    const matrix = matrixFor(STONE);
    expect(matrix).not.toBeNull();
    if (matrix === null) return;
    expect(matrixSwatchCss(matrix, "rim", STONE)).toBe("#6c7c9d");
    expect(matrixSwatchCss(matrix, "rim", DIRT)).toBe("#9c6754");
    expect(matrixSwatchCss(matrix, "tint", STONE)).not.toBe("#888888");
  });
});

describe("tile static+anim pairs", () => {
  const BY_SRC = new Map(TILE_SHEETS.map((sheet) => [sheet.src, sheet]));

  /** Manifest sheet behind a paint src, following synthesized variants. */
  function manifestFor(src: string) {
    const direct = BY_SRC.get(src);
    if (direct !== undefined) return direct;
    const table = VARIANTS_TABLE as Record<
      string,
      { canonical: string; variants: Record<string, unknown> }
    >;
    for (const entry of Object.values(table)) {
      if (src in entry.variants) return BY_SRC.get(entry.canonical);
    }
    return undefined;
  }

  it("maps every water and cave-water paint src to its counterpart", () => {
    const pairs: Array<[string, string]> = [
      ["/rpg/tiles/Water/Water_Stone_Tile_1.png", "/rpg/tiles/Water/Water_Stone_Tile_1_Anim.png"],
      ["/rpg/tiles/Water/Water_Stone_Tile_2.png", "/rpg/tiles/Water/Water_Stone_Tile_2_Anim.png"],
      ["/rpg/tiles/Water/Water_Stone_Tile_3.png", "/rpg/tiles/Water/Water_Stone_Tile_3_Anim.png"],
      ["/rpg/tiles/Water/Water_Stone_Tile_4.png", "/rpg/tiles/Water/Water_Stone_Tile_4_Anim.png"],
      ["/rpg/tiles/Water/Water_Tile_1.png", "/rpg/tiles/Water/Water_Tile_1_Anim.png"],
      ["/rpg/tiles/Water/Water_Tile_2.png", "/rpg/tiles/Water/Water_Tile_2_Anim.png"],
      ["/rpg/tiles/Water/Water_Tile_3.png", "/rpg/tiles/Water/Water_Tile_3_Anim.png"],
      ["/rpg/tiles/Water/Water_Tile_4.png", "/rpg/tiles/Water/Water_Tile_4_Anim.png"],
      ["/rpg/tiles/Cave/Cave_Water.png", "/rpg/tiles/Cave/Cave_Water_Animation.png"],
    ];
    for (const [staticSrc, animSrc] of pairs) {
      expect(animFor(staticSrc)).toBe(animSrc);
      expect(staticFor(animSrc)).toBe(staticSrc);
      expect(isAnimSheet(animSrc)).toBe(true);
      expect(isAnimSheet(staticSrc)).toBe(false);
      // Frame-0 geometry matches, so stored {src, sx, sy} cells stay valid
      // whichever side of the toggle painted them.
      const staticSheet = manifestFor(staticSrc);
      const animSheet = manifestFor(animSrc);
      expect(staticSheet, `${staticSrc} must resolve`).toBeDefined();
      expect(animSheet, `${animSrc} must resolve`).toBeDefined();
      expect(animSheet?.anim, `${animSrc} must animate`).toBeDefined();
      expect(animSheet?.anim?.frameW).toBe(staticSheet?.cols);
      expect(animSheet?.rows).toBe(staticSheet?.rows);
    }
    expect(animFor("/rpg/tiles/Grass/Grass_Tiles_1.png")).toBeNull();
    expect(staticFor("/rpg/tiles/Grass/Grass_Tiles_1.png")).toBeNull();
  });

  it("animates Beach_Tiles as 6 looped frames of 5 cols", () => {
    // 30x3 reads as 6 frames of 5 cols: consecutive-frame pixel diffs are
    // small and uniform (~20/px, including last->first wraparound) while
    // every other framing shows distinct-tile jumps (200+/px) — the frames
    // are foam-motion phases of one scene, not an atlas.
    const beach = BY_SRC.get("/rpg/tiles/Beach/Beach_Tiles.png");
    expect(beach, "Beach_Tiles must be a manifest sheet").toBeDefined();
    expect(beach?.anim).toEqual({ frames: 6, frameW: 5, mode: "loop", fps: 6, sync: true });
    expect(beach?.cols).toBe(30);
    expect(beach?.rows).toBe(3);
  });
});
