import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { setValue as engineSetValue } from "../../engine/cards";
import { setValue } from "./cards";
import { battleOutcome, exchange, pathRun, winProb } from "./odds";

// The bot's battle tables are exact; these pin them to the figures the design quotes
// and to a simulation of the dice, and its set values to the engine's.

describe("v1's battle odds", () => {
  it("match the design's figures", () => {
    expect(winProb(3, 1)).toBeCloseTo(0.916, 3);
    expect(winProb(6, 6)).toBeCloseTo(0.52, 2);
    expect(winProb(20, 20)).toBeCloseTo(0.63, 2);
    expect(winProb(30, 30)).toBeCloseTo(0.68, 2);
    expect(pathRun(16, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.95, 2);
    expect(pathRun(10, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.52, 2);
    expect(pathRun(12, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.74, 2);
    expect(pathRun(14, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.88, 2);
    expect(pathRun(18, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.98, 2);
  });

  it("agree with rolling the dice", () => {
    const rng = createRng("odds");
    const die = () => 1 + Math.floor(rng.next() * 6);
    const trials = 40_000;
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      let a = 7;
      let d = 5;
      while (a > 0 && d > 0) {
        const ad = Array.from({ length: Math.min(3, a) }, die).sort((x, y) => y - x);
        const dd = Array.from({ length: Math.min(2, d) }, die).sort((x, y) => y - x);
        for (let k = 0; k < Math.min(ad.length, dd.length); k++) {
          if (ad[k] > dd[k]) d--;
          else a--;
        }
      }
      if (d === 0) wins++;
    }
    expect(Math.abs(wins / trials - winProb(7, 5))).toBeLessThan(0.01);
  });

  it("account for every outcome", () => {
    const o = battleOutcome(12, 9);
    const total = [...o.win, ...o.fail].reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(o.pWin).toBeCloseTo(winProb(12, 9), 12);
  });

  it("price an exchange: the attacker of a big battle comes out ahead, an outnumbered one never attacks", () => {
    expect(exchange(30, 30)).toBeGreaterThan(exchange(5, 5));
    expect(exchange(14, 3)).toBeGreaterThan(0);
    expect(exchange(3, 14)).toBe(0);
  });
});

describe("v1's set values", () => {
  it("are the engine's (`CARDS-6`)", () => {
    for (let n = 1; n <= 30; n++) expect(setValue(n)).toBe(engineSetValue(n));
  });
});
