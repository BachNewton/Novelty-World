import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FLAGS } from "./flags";
import { HERITAGES, type HeritageCode } from "./heritages";

const require = createRequire(import.meta.url);

function fileRatio(code: HeritageCode): number {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a package file named by a code from the curated heritage list; no external input
  const svg = readFileSync(require.resolve(`svg-country-flags/svg/${code.toLowerCase()}.svg`), "utf8");
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (match === null) throw new Error(`${code}'s flag file has no viewBox`);
  return Number(match[1]) / Number(match[2]);
}

describe("flags", () => {
  it("gives every heritage its flag file's proportions", () => {
    for (const code of Object.keys(HERITAGES) as HeritageCode[]) {
      const { width, height } = FLAGS[code];
      expect(width / height, code).toBeCloseTo(fileRatio(code), 6);
    }
  });
});
