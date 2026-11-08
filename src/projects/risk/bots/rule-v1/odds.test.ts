import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { resolveBlitz } from "../../blitz";
import { battleOutcome, winProb } from "./odds";

// The bot's attack odds are exact: Balanced Blitz's (`blitz.ts`, which the engine
// resolves blitzes with), mixed with single fair battles where rolling first is the
// better way to the capture. Card odds and the native engine's vectors read them too, so they are
// held to a simulation of the same play on the engine's own resolution.

describe("v1's attack odds", () => {
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
});
