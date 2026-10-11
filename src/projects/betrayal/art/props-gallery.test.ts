import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stubCanvas } from "./headless";
import {
  galleryEntries,
  KIT_FILES_WITHOUT_PIECES,
  kitMatch,
  nameWord,
  possibleDuplicates,
  shapeOf,
  shelfLayout,
  similarSize,
  type ShapedPiece,
} from "./props-gallery";

const piece = (key: string, name: string, group: string, size: [number, number, number], vertices: number): ShapedPiece => ({
  key,
  name,
  group,
  shape: { size, vertices },
});

describe("the props gallery", () => {
  it("shows a piece from every kit file that builds one", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixed kit/ directory beside this file
    const files = readdirSync(new URL("./kit", import.meta.url)).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    const shown = new Set(galleryEntries().flatMap(({ source }) => (source.kind === "kit" ? [source.file] : [])));
    expect(files.filter((file) => !shown.has(file) && !KIT_FILES_WITHOUT_PIECES.includes(file))).toEqual([]);
  });

  it("builds every piece headless, and leaves out the rooms' blocks of wall", () => {
    stubCanvas();
    const entries = galleryEntries();
    expect(new Set(entries.map(({ key }) => key)).size).toBe(entries.length);
    expect(entries.some(({ name }) => name?.endsWith("corner"))).toBe(false);
    for (const entry of entries) expect(shapeOf(entry.build()).vertices, entry.key).toBeGreaterThan(0);
  });

  it("groups by the word that says what a piece is", () => {
    expect(nameWord("ritualCandle")).toBe("candle");
    expect(nameWord("slot shaft left")).toBe("shaft");
    expect(nameWord("flight above the cut")).toBe("flight");
    expect(nameWord("chair, no cushion")).toBe("chair");
    expect(nameWord("crates")).toBe("crate");
    expect(nameWord("glass")).toBe("glass");
  });

  it("calls sizes alike either way round, within a third", () => {
    expect(similarSize([0.48, 1.16, 0.47], [0.48, 0.47, 1.16])).toBe(true);
    expect(similarSize([0.5, 1, 0.5], [0.5, 1.3, 0.5])).toBe(true);
    expect(similarSize([0.5, 1, 0.5], [0.5, 2, 0.5])).toBe(false);
    expect(similarSize([0.8, 0.5, 0], [0.8, 0.5, 0.02])).toBe(true);
  });

  it("flags pieces alike from different places built by different code", () => {
    const groups = possibleDuplicates([
      piece("a", "candle", "kit", [0.05, 0.2, 0.05], 40),
      piece("b", "candle", "chasm", [0.05, 0.2, 0.05], 40),
      piece("c", "floorCandle", "cellar", [0.06, 0.22, 0.06], 90),
      piece("d", "chair", "kit", [0.48, 1.16, 0.47], 200),
      piece("e", "chair", "dining", [0.48, 1.16, 0.47], 200),
      piece("f", "tableCandle", "cellar", [0.25, 0.27, 0.18], 300),
    ]);
    // The chairs are one builder, shared; so is the chasm's candle with the kit's, which stands for both.
    expect(groups).toEqual([{ word: "candle", keys: ["a", "c"] }]);
  });

  it("names a piece by the kit piece it is", () => {
    const kit = [{ name: "chair", shape: { size: [0.48, 1.16, 0.47] as [number, number, number], vertices: 200 } }];
    expect(kitMatch({ size: [0.48, 1.16, 0.47], vertices: 200 }, kit)).toBe("chair");
    expect(kitMatch({ size: [0.48, 1.31, 0.47], vertices: 200 }, kit)).toBe(null);
  });

  it("lays sections out in rows that wrap, each section after the last", () => {
    const { at, titles, bounds } = shelfLayout(
      [
        { title: "Kit", items: [{ key: "a", width: 3, depth: 1 }, { key: "b", width: 3, depth: 2 }, { key: "c", width: 3, depth: 1 }] },
        { title: "Empty", items: [] },
        { title: "Room", items: [{ key: "d", width: 1, depth: 1 }] },
      ],
      7,
    );
    expect(titles.map(({ title }) => title)).toEqual(["Kit", "Room"]);
    const [a, b, c, d] = ["a", "b", "c", "d"].map((key) => at.get(key) ?? [NaN, NaN]);
    expect(a[1]).toBe(b[1]);
    expect(c[1]).toBeGreaterThan(b[1]);
    expect(c[0]).toBe(a[0]);
    expect(d[1]).toBeGreaterThan(c[1]);
    expect(bounds.x[1]).toBeLessThanOrEqual(7);
  });
});
