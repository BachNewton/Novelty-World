import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ART_LICENSES, SYMBOL_ART, symbolArtFile, symbolDisplayFile, type SymbolArt } from "./symbol-art";
import { SYMBOLS, type SymbolId } from "./symbol-timelines";

const ART_DIR = new URL("./symbol-art/", import.meta.url);

// A file that big is almost certainly the wrong file, and would bloat the repo.
const MAX_BYTES = 5_000_000;
// How far a file's proportions may drift from the official ones: raster
// pixel rounding, never a different design.
const RATIO_TOLERANCE = 0.005;

function artBytes(file: string): Buffer {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file named by a symbol id from the curated list, inside symbol-art/
  return readFileSync(new URL(file, ART_DIR));
}

function artRecords(): [SymbolId, SymbolArt][] {
  return Object.entries(SYMBOL_ART) as [SymbolId, SymbolArt][];
}

// The width-to-height ratio of an SVG's root element: its viewBox, or else
// its width and height.
function svgRatio(svg: string): number {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (root === undefined) throw new Error("no <svg> element");
  const attrs = new Map([...root.matchAll(/\s([\w:-]+)=["']([^"']*)["']/g)].map(([, name, value]) => [name, value]));
  const viewBox = attrs.get("viewBox");
  if (viewBox !== undefined) {
    const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
    return width / height;
  }
  const width = attrs.get("width");
  const height = attrs.get("height");
  if (width === undefined || height === undefined) throw new Error("neither a viewBox nor a width and height");
  if (width.endsWith("%") || height.endsWith("%")) throw new Error("a percentage size has no ratio");
  return parseFloat(width) / parseFloat(height);
}

// A PNG's pixel width over height, from its IHDR chunk.
function pngRatio(png: Buffer): number {
  if (png.toString("latin1", 1, 4) !== "PNG") throw new Error("not a PNG");
  return png.readUInt32BE(16) / png.readUInt32BE(20);
}

// A JPEG's pixel width over height, from its first start-of-frame marker
// (baseline, progressive or any other SOFn).
function jpegRatio(jpeg: Buffer): number {
  if (jpeg.readUInt16BE(0) !== 0xffd8) throw new Error("not a JPEG");
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error(`no marker at byte ${offset}`);
    const marker = jpeg[offset + 1];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return jpeg.readUInt16BE(offset + 7) / jpeg.readUInt16BE(offset + 5);
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error("no start-of-frame marker");
}

function artRatio(art: SymbolArt, bytes: Buffer): number {
  switch (art.format) {
    case "svg":
      return svgRatio(bytes.toString("utf8"));
    case "png":
      return pngRatio(bytes);
    case "jpg":
      return jpegRatio(bytes);
  }
}

describe("symbol art", () => {
  it("is stored unedited: each file's SHA-1 is its record's", () => {
    for (const [symbol, art] of artRecords()) {
      const hash = createHash("sha1").update(artBytes(symbolArtFile(symbol, art))).digest("hex");
      expect(hash, symbol).toBe(art.sha1);
    }
  });

  it("has the symbol's official proportions", () => {
    for (const [symbol, art] of artRecords()) {
      const bytes = artBytes(symbolArtFile(symbol, art));
      const ratio = artRatio(art, bytes);
      const official = art.proportions.width / art.proportions.height;
      expect(Math.abs(ratio / official - 1), symbol).toBeLessThanOrEqual(RATIO_TOLERANCE);
    }
  });

  it("pins each display file, a PNG of the trimmed symbol with a transparent background", () => {
    for (const [symbol, art] of artRecords()) {
      if (art.display === undefined) continue;
      expect(art.format, symbol).not.toBe("svg");
      const bytes = artBytes(symbolDisplayFile(symbol, art));
      expect(createHash("sha1").update(bytes).digest("hex"), symbol).toBe(art.display.sha1);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], symbol).toEqual([art.display.width, art.display.height]);
      // IHDR colour type 6: RGBA.
      expect(bytes[25], symbol).toBe(6);
    }
  });

  it("keeps only files that belong to a record, none of them oversized", () => {
    const expected = new Set(
      artRecords().flatMap(([symbol, art]) => [symbolArtFile(symbol, art), symbolDisplayFile(symbol, art)]),
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixed symbol-art/ directory beside this file
    for (const file of readdirSync(ART_DIR)) {
      expect(expected.has(file), file).toBe(true);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file listed from symbol-art/ itself
      expect(statSync(new URL(file, ART_DIR)).size, file).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  it("records a listed symbol, a licence and the credit it requires, and what the art rests on", () => {
    const texts = (art: SymbolArt): string[] =>
      art.kind === "published"
        ? [art.source, art.licenseBasis, ...art.checkedAgainst]
        : [...art.searched, ...art.elements.flatMap((e) => [e.element, ...e.sources])];
    for (const [symbol, art] of artRecords()) {
      expect(Object.hasOwn(SYMBOLS, symbol), symbol).toBe(true);
      expect(art.sha1, symbol).toMatch(/^[0-9a-f]{40}$/);
      expect(Object.hasOwn(ART_LICENSES, art.license), symbol).toBe(true);
      expect(art.attribution !== "", symbol).toBe(ART_LICENSES[art.license].attribution);
      for (const text of [art.author, art.checked, ...texts(art)]) {
        expect(text.trim(), symbol).toBe(text);
        expect(text, symbol).not.toBe("");
      }
      if (art.kind === "published") {
        expect(art.source, symbol).toMatch(/^https:\/\/\S+$/);
        expect(art.checkedAgainst.length, symbol).toBeGreaterThan(0);
      } else {
        expect(art.searched.length, symbol).toBeGreaterThan(0);
        expect(art.elements.length, symbol).toBeGreaterThan(0);
        for (const { element, sources } of art.elements) expect(sources.length, `${symbol}: ${element}`).toBeGreaterThan(0);
      }
      expect(art.proportions.width, symbol).toBeGreaterThan(0);
      expect(art.proportions.height, symbol).toBeGreaterThan(0);
    }
  });
});

describe("svgRatio", () => {
  it("prefers the viewBox, and falls back to the width and height", () => {
    expect(svgRatio('<svg width="100" height="100" viewBox="0 0 18 11">')).toBeCloseTo(18 / 11);
    expect(svgRatio('<?xml version="1.0"?><svg xmlns="x" height="1000" width="1500px">')).toBeCloseTo(1.5);
    expect(() => svgRatio('<svg width="100%" height="100%">')).toThrow();
  });
});

describe("jpegRatio", () => {
  it("reads the frame size past other segments, from a progressive frame too", () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
    const sof2 = [0xff, 0xc2, 0x00, 0x0b, 0x08, 0x06, 0x2a, 0x03, 0x54, 0x01, 0x01, 0x11, 0x00];
    expect(jpegRatio(Buffer.from([0xff, 0xd8, ...app0, ...sof2]))).toBeCloseTo(852 / 1578);
    expect(() => jpegRatio(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toThrow();
  });
});
