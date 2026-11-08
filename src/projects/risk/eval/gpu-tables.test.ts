import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { resolveBlitz } from "../blitz";
import { balanceWinChance, idealAttackUnits, winChance } from "../bots/gd/odds";
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

  it("keeps the committed odds samples to the odds, in their cheap parts", () => {
    // The whole file takes seconds to regenerate (`--odds-samples`); these rows catch a change to the odds.
    const odds = JSON.parse(data("odds-samples.json").toString("utf8")) as Record<string, number[][]>;
    for (const [a, d, p] of odds.winChance) expect(winChance(a, d)).toBe(p);
    for (const [p, balanced] of odds.balanceWinChance) expect(balanceWinChance(p)).toBe(balanced);
    for (const [defend, threshold, ideal] of odds.idealAttackUnits) expect(idealAttackUnits(defend, threshold)).toBe(ideal);
  });
});
