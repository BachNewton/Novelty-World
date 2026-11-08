import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAGS } from "./flags";
import { PEOPLES, type PeopleCode } from "./heritages";

const FLAG_DIR = join(dirname(createRequire(import.meta.url).resolve("svg-country-flags/package.json")), "svg");

// Under vitest a flag import is a small file inlined as a data URI, or a
// larger one's URL, which ends in the package file's name.
function flagSvg(src: string): string {
  if (src.startsWith("data:")) return decodeURIComponent(src.slice(src.indexOf(",") + 1));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a package file named by a flag import from the curated list; no external input
  return readFileSync(join(FLAG_DIR, basename(src)), "utf8");
}

function viewBoxRatio(src: string): number {
  const svg = flagSvg(src);
  const match = /viewBox=["']0 0 ([\d.]+) ([\d.]+)["']/.exec(svg);
  if (match === null) throw new Error(`a flag file has no viewBox: ${svg.slice(0, 80)}`);
  return Number(match[1]) / Number(match[2]);
}

describe("flags", () => {
  it("gives every people its flag file's proportions", () => {
    for (const people of Object.keys(PEOPLES) as PeopleCode[]) {
      const { src, width, height } = FLAGS[people];
      expect(width / height, people).toBeCloseTo(viewBoxRatio(src), 6);
    }
  });
});
