import { describe, expect, it } from "vitest";
import { captureChance } from "../blitz";
import { blitzOdds } from "./odds";

describe("the odds of a planned blitz", () => {
  it("gives the balanced chance of capturing and the expected cost", () => {
    expect(blitzOdds(8, 5, 1).capture).toBe(captureChance(7, 5));
    const big = blitzOdds(20, 3, 1);
    expect(big.capture).toBe(1);
    expect(big.defenderLosses).toBe(3);
    expect(big.attackerLosses).toBeGreaterThan(0);
    expect(blitzOdds(5, 10, 1).capture).toBeLessThan(0.1);
    // Keeping more back can only lower the odds.
    expect(blitzOdds(10, 5, 5).capture).toBeLessThan(blitzOdds(10, 5, 1).capture);
  });

  it("has nothing to attack with when everything is kept back", () => {
    expect(blitzOdds(4, 2, 4)).toEqual({ capture: 0, attackerLosses: 0, defenderLosses: 0 });
  });
});
