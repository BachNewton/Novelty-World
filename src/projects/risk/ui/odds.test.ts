import { describe, expect, it } from "vitest";
import { battleOutcomes, blitzOdds } from "./odds";

describe("the odds", () => {
  it("knows the classic battle odds", () => {
    // Three dice against two: the attacker takes both armies 2890 times in 7776.
    const both = battleOutcomes(3, 2).find((o) => o.defenderLosses === 2);
    expect(both?.p).toBeCloseTo(2890 / 7776, 10);
    // One against one: ties go to the defender, so the attacker wins 15 in 36.
    expect(battleOutcomes(1, 1).find((o) => o.defenderLosses === 1)?.p).toBeCloseTo(15 / 36, 10);
    for (const [a, d] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]]) expect(battleOutcomes(a, d).reduce((sum, o) => sum + o.p, 0)).toBeCloseTo(1, 10);
  });

  it("gives a blitz's chance of capturing and its expected cost", () => {
    expect(blitzOdds(2, 1, 1).capture).toBeCloseTo(15 / 36, 10);
    const big = blitzOdds(20, 3, 1);
    expect(big.capture).toBeGreaterThan(0.99);
    expect(big.defenderLosses).toBeGreaterThan(2.99);
    expect(big.attackerLosses).toBeGreaterThan(0);
    expect(blitzOdds(5, 10, 1).capture).toBeLessThan(0.1);
    // Keeping more back can only lower the odds.
    expect(blitzOdds(10, 5, 5).capture).toBeLessThan(blitzOdds(10, 5, 1).capture);
  });
});
