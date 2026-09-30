import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLAGS } from "./flags";
import { LEGACY_COUNTRY_CODES, PEOPLES, type PeopleCode } from "./heritages";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

// Under vitest a flag import is a small file inlined as a data URI, or a
// larger one's path from the repo root.
function flagSvg(src: string): string {
  if (src.startsWith("data:")) return decodeURIComponent(src.slice(src.indexOf(",") + 1));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a package file named by a flag import from the curated list; no external input
  return readFileSync(REPO_ROOT + src, "utf8");
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

  // The cards must look exactly as they did when heritage was coded by
  // country, so each migrated people keeps that country's flag.
  it("gives each people migrated from a country code that country's flag", async () => {
    for (const [country, people] of Object.entries(LEGACY_COUNTRY_CODES)) {
      const file = (await import(`../../../node_modules/svg-country-flags/svg/${country.toLowerCase()}.svg`)) as {
        default: string;
      };
      expect(FLAGS[people].src, people).toBe(file.default);
    }
  });
});
