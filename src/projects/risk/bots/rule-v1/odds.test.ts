import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { captureChance, fairFight, resolveBlitz } from "../../blitz";
import { battleOutcome, blitzCommit, exchange, pathRun, winProb } from "./odds";

// The bot's attack odds are exact: Balanced Blitz's (`blitz.ts`, which the engine
// resolves blitzes with), mixed with single fair battles where rolling first is the
// better way to the capture. These pin them to the figures the design quotes and to a
// simulation of the same play on the engine's own resolution.

describe("v1's attack odds", () => {
  it("are Balanced Blitz's wherever the attacker is the favourite", () => {
    for (const [a, d] of [[3, 1], [5, 2], [6, 3], [8, 4], [12, 8], [20, 15], [40, 30]]) {
      expect(battleOutcome(a, d).roll).toBe(false);
      expect(winProb(a, d)).toBeCloseTo(captureChance(a, d), 12);
    }
  });

  it("match the design's figures", () => {
    // Certain captures: the smallest blitz that cannot fail.
    expect(winProb(3, 1)).toBeCloseTo(1, 9);
    expect(winProb(5, 2)).toBeCloseTo(1, 9);
    expect(winProb(6, 3)).toBeCloseTo(1, 9);
    expect(winProb(8, 4)).toBeCloseTo(1, 9);
    // Close fights: rolling until the favourite, then blitzing, beats either alone.
    expect(captureChance(8, 8)).toBeCloseTo(0.58, 2);
    expect(winProb(8, 8)).toBeCloseTo(0.64, 2);
    expect(winProb(2, 1)).toBeCloseTo(0.89, 2);
    expect(winProb(1, 1)).toBeCloseTo(15 / 36, 6);
    // The kill run of scenario 1 (§5).
    expect(pathRun(10, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.83, 2);
    expect(pathRun(12, [2, 1, 1, 3]).pSuccess).toBeCloseTo(0.98, 2);
    expect(pathRun(14, [2, 1, 1, 3]).pSuccess).toBeCloseTo(1, 3);
  });

  it("roll a single battle only where it raises the capture chance", () => {
    expect(battleOutcome(1, 1).roll).toBe(true);
    expect(battleOutcome(4, 6).roll).toBe(true);
    for (const [a, d] of [[1, 1], [3, 3], [4, 6], [8, 8], [10, 10], [15, 15]]) {
      expect(winProb(a, d)).toBeGreaterThan(Math.max(captureChance(a, d), fairFight(a, d).defenderLost[d]) - 1e-12);
    }
  });

  it("agree with playing the same way on the engine's blitz", () => {
    const rng = createRng("odds");
    const die = () => 1 + Math.floor(rng.next() * 6);
    for (const [a0, d0] of [[7, 5], [9, 9], [4, 2]]) {
      const trials = 20_000;
      let wins = 0;
      for (let i = 0; i < trials; i++) {
        let a = a0;
        let d = d0;
        while (a > 0 && d > 0) {
          if (!battleOutcome(a, d).roll) {
            const r = resolveBlitz(a, d, rng.next(), () => rng.next());
            a -= r.attackerLosses;
            d -= r.defenderLosses;
            break;
          }
          const ad = Array.from({ length: Math.min(3, a) }, die).sort((x, y) => y - x);
          const dd = Array.from({ length: Math.min(2, d) }, die).sort((x, y) => y - x);
          for (let k = 0; k < Math.min(ad.length, dd.length); k++) {
            if (ad[k] > dd[k]) d--;
            else a--;
          }
        }
        if (d === 0) wins++;
      }
      expect(Math.abs(wins / trials - winProb(a0, d0))).toBeLessThan(0.012);
    }
  });

  it("account for every outcome", () => {
    for (const [a, d] of [[12, 9], [6, 8], [30, 4]]) {
      const o = battleOutcome(a, d);
      const total = [...o.win, ...o.fail].reduce((s, p) => s + p, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("commit only the armies a sure capture needs", () => {
    expect(blitzCommit(9, 1)).toBe(3);
    expect(blitzCommit(20, 2)).toBe(5);
    expect(blitzCommit(20, 4)).toBe(8);
    // A capture that is not sure takes every army.
    expect(blitzCommit(6, 5)).toBe(6);
  });

  it("price an exchange: the bigger stack comes out ahead, an outnumbered one never attacks", () => {
    expect(exchange(30, 30)).toBeGreaterThan(exchange(5, 5));
    expect(exchange(14, 3)).toBeGreaterThan(0);
    expect(exchange(3, 14)).toBe(0);
  });
});
