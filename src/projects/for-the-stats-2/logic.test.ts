import { describe, expect, it } from "vitest";
import { chanceOfAtLeast, damageForSuccesses, expectedDamage, outcomes, type Attack } from "./logic";

const axe: Attack = { minDamage: 4, maxDamage: 11, slots: 3, slotChance: 0.8 };

describe("damageForSuccesses", () => {
  it("deals the minimum on no successes and the maximum on a perfect roll", () => {
    expect(damageForSuccesses(axe, 0)).toBe(4);
    expect(damageForSuccesses(axe, 3)).toBe(11);
  });

  it("matches players' measured damage tables", () => {
    expect([0, 1, 2, 3].map((hits) => damageForSuccesses(axe, hits))).toEqual([4, 6, 9, 11]);
    const hammer: Attack = { minDamage: 4, maxDamage: 9, slots: 4, slotChance: 0.5 };
    expect([0, 1, 2, 3, 4].map((hits) => damageForSuccesses(hammer, hits))).toEqual([4, 5, 7, 8, 9]);
  });

  it("matches the 4-slot 10-30 example: two misses deal 20", () => {
    expect(damageForSuccesses({ minDamage: 10, maxDamage: 30, slots: 4, slotChance: 0.5 }, 2)).toBe(20);
  });
});

describe("outcomes", () => {
  it("follows the binomial distribution", () => {
    const probabilities = outcomes(axe).map((o) => o.probability);
    expect(probabilities[0]).toBeCloseTo(0.008);
    expect(probabilities[1]).toBeCloseTo(0.096);
    expect(probabilities[2]).toBeCloseTo(0.384);
    expect(probabilities[3]).toBeCloseTo(0.512);
  });

  it("sums to one", () => {
    const total = outcomes({ ...axe, slots: 6, slotChance: 0.37 }).reduce((sum, o) => sum + o.probability, 0);
    expect(total).toBeCloseTo(1);
  });

  it("is certain at the extremes of slot chance", () => {
    expect(outcomes({ ...axe, slotChance: 1 }).at(-1)?.probability).toBe(1);
    expect(outcomes({ ...axe, slotChance: 0 })[0]?.probability).toBe(1);
  });
});

describe("expectedDamage", () => {
  it("weights each outcome's damage by its chance", () => {
    expect(expectedDamage(axe)).toBeCloseTo(4 * 0.008 + 6 * 0.096 + 9 * 0.384 + 11 * 0.512);
  });
});

describe("chanceOfAtLeast", () => {
  it("adds up every outcome that reaches the target", () => {
    expect(chanceOfAtLeast(axe, 9)).toBeCloseTo(0.896);
    expect(chanceOfAtLeast(axe, 10)).toBeCloseTo(0.512);
  });

  it("is certain at or below the minimum and impossible above the maximum", () => {
    expect(chanceOfAtLeast(axe, 4)).toBeCloseTo(1);
    expect(chanceOfAtLeast(axe, 12)).toBe(0);
  });
});
