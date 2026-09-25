import { describe, expect, it } from "vitest";
import {
  EYEDROPPER_CURSOR,
  cellFromPoint,
  isAltModifierCode,
  resolveEyedropperActive,
  resolveMouseDownIntent,
  resolveMouseMoveIntent,
  resolvePickedTile,
} from "./editor-logic";
import {
  matrixFor,
  pickerSrcsFor,
  syncKeyFor,
  variantSrcsFor,
} from "./tile-variants";

const GRASS = "/rpg/tiles/Grass/Grass_Tiles_1.png";
const WATER_PRIMARY = "/rpg/tiles/Water/Water_Stone_Tile_1.png";
const WATER_ANIM = "/rpg/tiles/Water/Water_Stone_Tile_1_Anim.png";
const NESTED_SINGLE = "/rpg/tiles/Grass/Path_Middle.png";

describe("map editor pointer intent", () => {
  it("paints on plain left press, picks with Alt held", () => {
    expect(resolveMouseDownIntent(0, false)).toBe("paint");
    expect(resolveMouseDownIntent(0, true)).toBe("pick");
  });

  it("keeps right-button erase under Alt and ignores middle", () => {
    expect(resolveMouseDownIntent(2, false)).toBe("erase");
    expect(resolveMouseDownIntent(2, true)).toBe("erase");
    expect(resolveMouseDownIntent(1, false)).toBe("ignore");
    expect(resolveMouseDownIntent(1, true)).toBe("ignore");
  });

  it("resolves drags with left-before-right priority, Alt picking on left", () => {
    expect(resolveMouseMoveIntent(0, false)).toBe("none");
    expect(resolveMouseMoveIntent(1, false)).toBe("paint");
    expect(resolveMouseMoveIntent(1, true)).toBe("pick");
    expect(resolveMouseMoveIntent(2, false)).toBe("erase");
    expect(resolveMouseMoveIntent(2, true)).toBe("erase");
    expect(resolveMouseMoveIntent(3, false)).toBe("paint");
    expect(resolveMouseMoveIntent(3, true)).toBe("pick");
  });
});

describe("resolvePickedTile", () => {
  it("picks a canonical cell with the canonical variant index", () => {
    const resolved = resolvePickedTile({ src: GRASS, sx: 2, sy: 3 });
    expect(resolved).not.toBeNull();
    expect(resolved?.sheetSrc).toBe(GRASS);
    expect(resolved?.src).toBe(GRASS);
    expect(resolved?.sx).toBe(2);
    expect(resolved?.sy).toBe(3);
    expect(resolved?.variant).toEqual({ key: syncKeyFor(GRASS), index: 0 });
    expect(resolved?.matrix).toBeNull();
  });

  it("syncs the variant picker to a picked variant src", () => {
    const variants = variantSrcsFor(GRASS);
    expect(variants.length).toBeGreaterThan(0);
    const src = variants[0] as string;
    const resolved = resolvePickedTile({ src, sx: 0, sy: 0 });
    expect(resolved?.sheetSrc).toBe(GRASS);
    expect(resolved?.src).toBe(src);
    expect(resolved?.variant).toEqual({
      key: syncKeyFor(GRASS),
      index: pickerSrcsFor(GRASS).indexOf(src),
    });
    expect(pickerSrcsFor(GRASS).indexOf(src)).toBeGreaterThan(0);
  });

  it("attributes matrix-member paints to the owning primary section", () => {
    const matrix = matrixFor(WATER_PRIMARY);
    expect(matrix).not.toBeNull();
    const cells = matrix?.cells ?? [];
    expect(cells.length).toBeGreaterThan(1);
    // Water_Tile_1 is a folded member: it paints from the primary section.
    const member = cells.find((src) => src !== WATER_PRIMARY) as string;
    const resolved = resolvePickedTile({ src: member, sx: 1, sy: 1 });
    expect(resolved?.sheetSrc).toBe(WATER_PRIMARY);
    expect(resolved?.src).toBe(member);
    expect(resolved?.variant).toBeNull();
    expect(resolved?.matrix?.primary).toBe(WATER_PRIMARY);
  });

  it("marks anim-side picks so the section toggle syncs on", () => {
    const resolved = resolvePickedTile({ src: WATER_ANIM, sx: 0, sy: 0 });
    expect(resolved?.sheetSrc).toBe(WATER_PRIMARY);
    expect(resolved?.src).toBe(WATER_ANIM);
    expect(resolved?.anim).toEqual({
      primary: WATER_PRIMARY,
      animated: true,
    });
  });

  it("marks static picks from anim-capable families so the toggle syncs off", () => {
    const resolved = resolvePickedTile({ src: WATER_PRIMARY, sx: 0, sy: 0 });
    expect(resolved?.anim).toEqual({
      primary: WATER_PRIMARY,
      animated: false,
    });
  });

  it("leaves nested singles on their own row with no anim toggle", () => {
    const resolved = resolvePickedTile({ src: NESTED_SINGLE, sx: 0, sy: 0 });
    expect(resolved?.sheetSrc).toBe(NESTED_SINGLE);
    expect(resolved?.anim).toBeNull();
  });

  it("returns null for srcs with no manifest sheet", () => {
    expect(
      resolvePickedTile({ src: "/rpg/tiles/Deleted.png", sx: 0, sy: 0 }),
    ).toBeNull();
  });
});

describe("eyedropper Alt hygiene", () => {
  it("matches only physical Alt keys by code", () => {
    expect(isAltModifierCode("AltLeft")).toBe(true);
    expect(isAltModifierCode("AltRight")).toBe(true);
    expect(isAltModifierCode("Alt")).toBe(false);
    expect(isAltModifierCode("ControlLeft")).toBe(false);
    expect(isAltModifierCode("MetaLeft")).toBe(false);
    expect(isAltModifierCode("KeyA")).toBe(false);
  });

  it("shows the eyedropper for plain Alt only", () => {
    expect(resolveEyedropperActive({ alt: true })).toBe(true);
    expect(resolveEyedropperActive({ alt: false })).toBe(false);
    // AltGr reports as Ctrl+Alt — must not trigger the eyedropper.
    expect(resolveEyedropperActive({ alt: true, ctrl: true })).toBe(false);
    expect(resolveEyedropperActive({ alt: true, altGraph: true })).toBe(false);
    expect(resolveEyedropperActive({ alt: true, meta: true })).toBe(false);
  });

  it("uses an inline data-URI eyedropper with crosshair fallback", () => {
    expect(EYEDROPPER_CURSOR).toContain("data:image/svg+xml");
    expect(EYEDROPPER_CURSOR).toContain("crosshair");
  });
});

describe("cellFromPoint", () => {
  it("maps origin through offsets at unit scale", () => {
    expect(cellFromPoint(10, 10, 1, 10, 10)).toEqual({ c: 0, r: 0 });
    expect(cellFromPoint(26, 27, 1, 10, 10)).toEqual({ c: 1, r: 1 });
  });

  it("honours fractional scale and centering offsets", () => {
    // 40x28 of 16px cells at 0.5 scale = 320x224; centered in 400px gives x=40.
    expect(cellFromPoint(40, 0, 0.5, 40, 0)).toEqual({ c: 0, r: 0 });
    expect(cellFromPoint(47.9, 7.9, 0.5, 40, 0)).toEqual({ c: 0, r: 0 });
    expect(cellFromPoint(48, 8, 0.5, 40, 0)).toEqual({ c: 1, r: 1 });
  });

  it("rejects out-of-map points", () => {
    expect(cellFromPoint(9, 10, 1, 10, 10)).toBeNull();
    expect(cellFromPoint(10, 9, 1, 10, 10)).toBeNull();
    expect(cellFromPoint(10 + 40 * 16, 10, 1, 10, 10)).toBeNull();
    expect(cellFromPoint(10, 10 + 28 * 16, 1, 10, 10)).toBeNull();
  });
});
