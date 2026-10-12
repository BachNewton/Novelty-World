import { describe, expect, it } from "vitest";
import {
  chanceOfAtLeast,
  damageForSuccesses,
  expectedDamage,
  focusBonus,
  outcomes,
  rangeMatchesChance,
  rolledSlotPercent,
  type Attack,
} from "./logic";

/** A basic attack: min 4 is half of 72% of 11. */
const axe: Attack = { minDamage: 4, maxDamage: 11, slots: 3, slotPercent: 72, focus: 0 };
/** A heavy attack: no minimum. */
const hammer: Attack = { minDamage: 0, maxDamage: 12, slots: 3, slotPercent: 80, focus: 0 };

const damages = (attack: Attack) =>
  Array.from({ length: attack.slots + 1 }, (_, hits) => damageForSuccesses(attack, hits));

describe("damageForSuccesses", () => {
  it("truncates the share of the range a roll earns", () => {
    expect(damages(hammer)).toEqual([0, 3, 8, 12]); // 12 × 0.33 = 3.96, 12 × 0.67 = 8.04
  });

  it("floors a basic attack's low rolls at half its stat, above the shown minimum", () => {
    expect(damages(axe)).toEqual([6, 6, 8, 11]); // floor 0.36: 4 + 7 × 0.36 = 6.52
  });

  it("truncates an exact half", () => {
    const club: Attack = { minDamage: 4, maxDamage: 9, slots: 4, slotPercent: 89, focus: 0 };
    expect(damages(club)).toEqual([6, 6, 6, 7, 9]); // 4 + 5 × 0.5 = 6.5
  });

  it("whiffs with no successes when there is no minimum", () => {
    expect(damageForSuccesses({ ...hammer, slots: 6 }, 0)).toBe(0);
  });
});

describe("rangeMatchesChance", () => {
  it("accepts the range a basic attack has at the shown chance", () => {
    expect(rangeMatchesChance(axe)).toBe(true);
    expect(rangeMatchesChance({ ...axe, slotPercent: 80 })).toBe(true); // 4.4 → 4
  });

  it("rejects a minimum the shown chance can't produce", () => {
    expect(rangeMatchesChance({ ...axe, slotPercent: 90 })).toBe(false); // 4.95 → 5
  });

  it("rounds an exact half to even, as the game does", () => {
    expect(rangeMatchesChance({ ...axe, minDamage: 2, maxDamage: 10, slotPercent: 50 })).toBe(true); // 2.5 → 2
    expect(rangeMatchesChance({ ...axe, minDamage: 3, maxDamage: 10, slotPercent: 50 })).toBe(false);
  });

  it("always accepts an attack with no minimum", () => {
    expect(rangeMatchesChance(hammer)).toBe(true);
  });
});

describe("focus", () => {
  it("adds a halving, truncated bonus per point", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(focusBonus)).toEqual([0, 10, 15, 17, 18, 18, 18]);
  });

  it("clamps the rolled chance between 10% and 100%", () => {
    expect(rolledSlotPercent({ ...hammer, slotPercent: 95, focus: 1 })).toBe(100);
    expect(rolledSlotPercent({ ...hammer, slotPercent: 4 })).toBe(10);
  });

  it("guarantees the focused slots and rolls the rest at the boosted chance", () => {
    const focused = outcomes({ ...hammer, focus: 1 });
    expect(focused.map((o) => o.successes)).toEqual([1, 2, 3]);
    expect(focused.map((o) => o.probability)).toEqual(
      outcomes({ ...hammer, slots: 2, slotPercent: 90 }).map((o) => o.probability),
    );
  });

  it("makes a fully focused attack a certain perfect roll", () => {
    expect(outcomes({ ...hammer, focus: 3 })).toEqual([{ successes: 3, damage: 12, probability: 1 }]);
  });
});

describe("outcomes", () => {
  it("follows the binomial distribution", () => {
    const probabilities = outcomes(hammer).map((o) => o.probability);
    expect(probabilities[0]).toBeCloseTo(0.008);
    expect(probabilities[1]).toBeCloseTo(0.096);
    expect(probabilities[2]).toBeCloseTo(0.384);
    expect(probabilities[3]).toBeCloseTo(0.512);
  });

  it("sums to one", () => {
    const total = outcomes({ ...hammer, slots: 6, slotPercent: 37 }).reduce((sum, o) => sum + o.probability, 0);
    expect(total).toBeCloseTo(1);
  });
});

describe("expectedDamage", () => {
  it("weights each outcome's damage by its chance", () => {
    expect(expectedDamage(hammer)).toBeCloseTo(0 * 0.008 + 3 * 0.096 + 8 * 0.384 + 12 * 0.512);
  });
});

describe("chanceOfAtLeast", () => {
  it("adds up every outcome that reaches the target", () => {
    expect(chanceOfAtLeast(hammer, 8)).toBeCloseTo(0.896);
    expect(chanceOfAtLeast(hammer, 9)).toBeCloseTo(0.512);
  });

  it("is certain at zero and impossible above the maximum", () => {
    expect(chanceOfAtLeast(hammer, 0)).toBeCloseTo(1);
    expect(chanceOfAtLeast(hammer, 13)).toBe(0);
  });
});
