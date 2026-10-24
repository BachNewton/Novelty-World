import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { resolveBlitz } from "../blitz";
import { blitzFiles, blitzSamples, blitzTables, boardJson, resolveFromTables } from "./gpu-tables";

function data(name: string): Buffer {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the committed data files, by name, in this repo
  return readFileSync(fileURLToPath(new URL(`../gpu/data/${name}`, import.meta.url)));
}

const noRoll = () => {
  throw new Error("a fight within the tables is never rolled");
};

describe("the GPU engine's data", () => {
  it("regenerates the committed board.json", () => {
    expect(boardJson()).toBe(data("board.json").toString("utf8"));
  });

  it("regenerates the committed blitz tables and samples", () => {
    expect(blitzFiles(blitzTables(32)).bin.equals(data("blitz-32.bin"))).toBe(true);
    expect(`${JSON.stringify(blitzSamples(32, 2000))}\n`).toBe(data("blitz-32-samples.json").toString("utf8"));
  });

  it("resolves every blitz from the tables exactly as resolveBlitz does", () => {
    const bound = 12;
    const tables = blitzTables(bound);
    const rng = createRng("gpu-tables-test");
    const edges = [0, Number.MIN_VALUE, 1e-12, 0.5, 1 - 2 ** -53];
    for (let a = 1; a <= bound; a++) {
      for (let d = 1; d <= bound; d++) {
        for (const r of [...edges, ...Array.from({ length: 40 }, () => rng.next())]) {
          expect(resolveFromTables(tables, a, d, r)).toEqual(resolveBlitz(a, d, r, noRoll));
        }
      }
    }
  });

  it("lays the file out as its meta says", () => {
    const { bin, meta } = blitzFiles(blitzTables(4));
    const { sections } = meta as { sections: Record<string, { dtype: string; offset: number; bytes: number; count: number }> };
    expect(sections.capture).toEqual({ dtype: "float64", offset: 0, bytes: 25 * 8, count: 25 });
    expect(sections.index).toEqual({ dtype: "int32", offset: 200, bytes: 25 * 16, count: 100 });
    expect(sections.values).toEqual({ dtype: "float64", offset: 600, bytes: 4 * 4 * 5 * 8, count: 4 * 4 * 5 });
    expect(bin.length).toBe(600 + 4 * 4 * 5 * 8);
  });
});
