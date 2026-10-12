import { describe, expect, it } from "vitest";
import {
  chanceOfAtLeast,
  critPercent,
  damageForSuccesses,
  expectedDamage,
  floorRaises,
  focusBonus,
  hitDamage,
  outcomes,
  predict,
  resolve,
  rolledSlotPercent,
  type Attack,
  type ScreenAttack,
} from "./logic";

/** No crits and no armor, so the roll alone decides the damage. */
const plain = { critChance: 0, critDamage: 0, armor: 0, ignoresArmor: false, shocked: false };
/** A range above zero: its min 4 is half of 72% of 11, and its floor that same share. */
const axe: Attack = { minDamage: 4, maxDamage: 11, slots: 3, slotPercent: 72, focus: 0, floorShare: 3600, ...plain };
/** A range from zero, with no floor. */
const hammer: Attack = { minDamage: 0, maxDamage: 12, slots: 3, slotPercent: 80, focus: 0, floorShare: 0, ...plain };

const damages = (attack: Attack) =>
  Array.from({ length: attack.slots + 1 }, (_, hits) => damageForSuccesses(attack, hits));

describe("damageForSuccesses", () => {
  it("truncates the share of the range a roll earns", () => {
    expect(damages(hammer)).toEqual([0, 3, 8, 12]); // 12 × 0.33 = 3.96, 12 × 0.67 = 8.04
  });

  it("floors the low rolls at the floor share, past the shown minimum", () => {
    expect(damages(axe)).toEqual([6, 6, 8, 11]); // 4 + 7 × 0.36 = 6.52
  });

  it("truncates an exact half", () => {
    const club: Attack = { ...axe, maxDamage: 9, slots: 4, slotPercent: 89, floorShare: 4450 };
    expect(damages(club)).toEqual([6, 6, 6, 7, 9]); // 4 + 5 × 0.5 = 6.5
  });

  it("whiffs with no successes when there is no floor and no minimum", () => {
    expect(damageForSuccesses({ ...hammer, slots: 6 }, 0)).toBe(0);
  });
});

describe("floorRaises", () => {
  it("marks the rolls the floor lifts above their plain share", () => {
    expect([0, 1, 2, 3].map((hits) => floorRaises(axe, hits))).toEqual([true, false, false, false]);
    expect([0, 1, 2, 3].map((hits) => floorRaises(hammer, hits))).toEqual([false, false, false, false]);
  });
});

describe("focus", () => {
  it("adds a halving, truncated bonus per point", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(focusBonus)).toEqual([0, 10, 15, 17, 18, 18, 18]);
  });

  it("clamps the rolled chance between 10% and 100%", () => {
    expect(rolledSlotPercent({ slotPercent: 95, focus: 1 })).toBe(100);
    expect(rolledSlotPercent({ slotPercent: 4, focus: 0 })).toBe(10);
  });

  it("guarantees the focused slots and rolls the rest at the boosted chance", () => {
    const bySuccesses = (attack: Attack) =>
      [0, 1, 2, 3].map((n) =>
        outcomes(attack)
          .filter((o) => o.successes === n)
          .reduce((sum, o) => sum + o.probability, 0),
      );
    const focused = bySuccesses({ ...hammer, focus: 1 });
    const twoRolledAt90 = bySuccesses({ ...hammer, slots: 2, slotPercent: 90 });
    expect(focused[0]).toBe(0);
    [1, 2, 3].forEach((n) => expect(focused[n]).toBeCloseTo(twoRolledAt90[n - 1] ?? 0));
  });

  it("makes a fully focused attack a certain perfect roll, which crits at 5% per Focus", () => {
    expect(outcomes({ ...hammer, focus: 3 })).toEqual([
      { successes: 3, crit: false, damage: 12, probability: 0.85 },
      { successes: 3, crit: true, damage: 14, probability: 0.15 },
    ]);
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

describe("expectedDamage and chanceOfAtLeast", () => {
  it("weight each outcome's damage by its chance", () => {
    expect(expectedDamage(hammer)).toBeCloseTo(0 * 0.008 + 3 * 0.096 + 8 * 0.384 + 12 * 0.512);
  });

  it("add up every outcome that reaches the damage", () => {
    expect(chanceOfAtLeast(hammer, 8)).toBeCloseTo(0.896);
    expect(chanceOfAtLeast(hammer, 9)).toBeCloseTo(0.512);
    expect(chanceOfAtLeast(hammer, 0)).toBeCloseTo(1);
    expect(chanceOfAtLeast(hammer, 13)).toBe(0);
  });
});

describe("crits", () => {
  const perfect = (attack: Attack) => hitDamage(attack, attack.slots, true);

  it("add 15% plus Crit Damage of the hit, rounded halves to even, at least 1", () => {
    expect(perfect(hammer)).toBe(14); // 12 × 0.15 = 1.8
    expect(perfect({ ...hammer, critDamage: 10 })).toBe(15); // 12 × 0.25 = 3
    expect(perfect({ ...hammer, maxDamage: 30 })).toBe(34); // 30 × 0.15 = 4.5, to even
    expect(perfect({ ...hammer, maxDamage: 3 })).toBe(4); // 0.45 rounds to 0, at least 1
  });

  it("gain 5% chance per Focus spent", () => {
    expect(critPercent({ critChance: 5, focus: 2 })).toBe(15);
  });

  it("split only the perfect roll", () => {
    const rolls = outcomes({ ...hammer, critChance: 20 });
    expect(rolls.filter((o) => o.crit)).toHaveLength(1);
    expect(rolls.find((o) => o.crit)?.probability).toBeCloseTo(0.512 * 0.2);
    expect(expectedDamage({ ...hammer, critChance: 20 })).toBeCloseTo(expectedDamage(hammer) + 0.512 * 0.2 * 2);
  });
});

describe("armor", () => {
  const landed = (attack: Attack) =>
    Array.from({ length: attack.slots + 1 }, (_, hits) => hitDamage(attack, hits, false));

  it("comes off every hit last, never below zero", () => {
    expect(landed({ ...hammer, armor: 4 })).toEqual([0, 0, 4, 8]);
    expect(hitDamage({ ...hammer, armor: 4 }, 3, true)).toBe(10);
  });

  it("is skipped by a piercing attack on a perfect roll only", () => {
    expect(landed({ ...hammer, armor: 4, ignoresArmor: true })).toEqual([0, 0, 4, 12]);
    expect(hitDamage({ ...hammer, armor: 4, ignoresArmor: true }, 3, true)).toBe(14);
  });
});

describe("splash", () => {
  const splashed = (attack: Attack) =>
    Array.from({ length: attack.slots + 1 }, (_, hits) => hitDamage(attack, hits, false, "splash"));

  it("halves the hit, rounding halves to even", () => {
    expect(splashed(hammer)).toEqual([0, 2, 4, 6]); // 3 / 2 = 1.5
    expect(splashed({ ...hammer, maxDamage: 5 })).toEqual([0, 0, 2, 2]); // rolls 0, 1, 3, 5
  });

  it("halves a crit's hit, crit bonus included", () => {
    expect(hitDamage(hammer, 3, true, "splash")).toBe(7); // 14 / 2
  });

  it("takes the full armor off the halved hit, except a pierce's perfect roll", () => {
    expect(splashed({ ...hammer, armor: 4 })).toEqual([0, 0, 0, 2]);
    expect(hitDamage({ ...hammer, armor: 4 }, 3, true, "splash")).toBe(3);
    expect(splashed({ ...hammer, armor: 4, ignoresArmor: true })).toEqual([0, 0, 0, 6]);
  });

  it("gives the neighbours' own chances", () => {
    // Rolls 0, 3, 8 and 12 halve to 0, 2, 4 and 6: 2 needs one success of three.
    expect(chanceOfAtLeast(hammer, 2, "splash")).toBeCloseTo(1 - 0.2 ** 3);
  });
});

describe("shock", () => {
  it("fails the first slot when no Focus is spent, so the roll can't be perfect", () => {
    const shocked = outcomes({ ...hammer, shocked: true, critChance: 50 });
    expect(shocked.map((o) => o.successes)).toEqual([0, 1, 2]);
    shocked.forEach((o, n) => expect(o.probability).toBeCloseTo(outcomes({ ...hammer, slots: 2 })[n]?.probability ?? 0));
  });

  it("is cancelled by spending Focus", () => {
    expect(outcomes({ ...hammer, shocked: true, focus: 1 })).toEqual(outcomes({ ...hammer, focus: 1 }));
  });
});

/** What a player enters for a five-slot basic attack: min 4 is half of 80% of
 *  an attack value of 11. Only one shape in the game's data fits it. */
const screen: ScreenAttack = {
  minDamage: 4,
  maxDamage: 11,
  slots: 5,
  slotPercent: 80,
  focus: 0,
  ...plain,
  poisoned: false,
  frozen: false,
};
const range = ({ minDamage, maxDamage, slotPercent, floorShare }: Attack) => ({
  minDamage,
  maxDamage,
  slotPercent,
  floorShare,
});

describe("resolve", () => {
  it("finds the attack's hidden numbers, keeping the screen's range", () => {
    const { attacks, matched } = resolve(screen);
    expect(matched).toBe(true);
    // 80% could be a stat of 70, 75 or 80: weapons give +0, +5 or +10 accuracy.
    expect(attacks.map(range)).toEqual([
      { minDamage: 4, maxDamage: 11, slotPercent: 80, floorShare: 3500 },
      { minDamage: 4, maxDamage: 11, slotPercent: 80, floorShare: 3750 },
      { minDamage: 4, maxDamage: 11, slotPercent: 80, floorShare: 4000 },
    ]);
  });

  it("keeps only the stats that round to the shown min", () => {
    // 13 x 0.5 x 0.8 = 5.2 would show a min of 5; stats of 85 and 90 show 6.
    expect(resolve({ ...screen, minDamage: 6, maxDamage: 13, slotPercent: 90 }).attacks.map(range)).toEqual([
      { minDamage: 6, maxDamage: 13, slotPercent: 90, floorShare: 4250 },
      { minDamage: 6, maxDamage: 13, slotPercent: 90, floorShare: 4500 },
    ]);
  });

  it("freezing the target rebuilds the range a quarter higher before rounding", () => {
    // At a stat of 80: 4.4 x 1.25 = 5.5, to even; 11 x 1.25 = 13.75.
    expect(resolve({ ...screen, frozen: true }).attacks.map(range).at(-1)).toEqual({
      minDamage: 6,
      maxDamage: 14,
      slotPercent: 80,
      floorShare: 4000,
    });
  });

  it("poison takes 10 from the stat: the chance, the minimum and the floor", () => {
    expect(resolve({ ...screen, poisoned: true }).attacks.map(range).at(-1)).toEqual({
      minDamage: 4,
      maxDamage: 11,
      slotPercent: 70,
      floorShare: 3500,
    });
    expect(resolve({ ...screen, poisoned: true, frozen: true }).attacks.map(range).at(-1)).toEqual({
      minDamage: 5,
      maxDamage: 14,
      slotPercent: 70,
      floorShare: 3500,
    });
  });

  it("reads numbers nothing in the game fits as cautiously as it can: no floor", () => {
    const { attacks, matched } = resolve({ ...screen, minDamage: 9 });
    expect(matched).toBe(false);
    expect(attacks.map(range)).toEqual([{ minDamage: 9, maxDamage: 11, slotPercent: 80, floorShare: 0 }]);
  });

  it("moves an unmatched range by the least a what-if could", () => {
    // 11 could be 10.5, which freezes to 13.125; poison takes an unknown share off the min.
    expect(resolve({ ...screen, minDamage: 9, frozen: true, poisoned: true }).attacks.map(range)).toEqual([
      { minDamage: 0, maxDamage: 13, slotPercent: 70, floorShare: 0 },
    ]);
  });
});

describe("predict", () => {
  it("shows the lowest of the attacks that fit", () => {
    const { rows, expected } = predict(screen, "target");
    expect(rows.map((row) => row.damage)).toEqual([11, 9, 8, 6, 6, 6]);
    expect(expected).toBeCloseTo(expectedDamage({ ...axe, slots: 5, slotPercent: 80, floorShare: 3500 }));
  });

  it("counts weapon accuracy in the shown chance, which the floor leaves out", () => {
    // A stat of 70 with +5 accuracy and an attack value of 13 shows 5-13 at
    // 75%. Its floor is 35% of the way: 5 + 8 x 0.35 = 7.8, truncated.
    const { rows } = predict({ ...screen, minDamage: 5, maxDamage: 13, slots: 3, slotPercent: 75 }, "target");
    expect(rows.map((row) => row.damage)).toEqual([13, 10, 7, 7]);
  });

  it("reads a three-slot basic attack as the ordinary one, not the Zodiac Tome's stun", () => {
    const { rows } = predict({ ...screen, slots: 3 }, "target");
    expect(rows.map((row) => row.damage)).toEqual([11, 8, 6, 6]);
  });

  it("freezes a range from zero to the lowest max any fitting attack gives", () => {
    // Max 12 could be 0.5 x 23 (11.5, to even), which freezes to 14.375.
    const { rows } = predict({ ...screen, minDamage: 0, maxDamage: 12, slots: 3, frozen: true }, "target");
    expect(rows[0]?.damage).toBe(14);
  });

  it("gives a certain outcome a chance of exactly 1", () => {
    const { rows } = predict({ ...screen, slots: 1, slotPercent: 15, minDamage: 0, maxDamage: 1 }, "target");
    expect(rows.at(-1)?.chance).toBe(1);
  });

  it("tells a crit that armor blocks from a miss", () => {
    const { crit } = predict({ ...screen, minDamage: 0, maxDamage: 5, armor: 10, critChance: 5 }, "target");
    expect(crit).toEqual({ damage: 0, beforeArmor: 6, chance: 1 });
  });

  it("shows the full chance once every slot is focused, as the combat screen does", () => {
    expect(predict({ ...screen, slots: 3, focus: 3 }, "target").focusedPercent).toBe(100);
  });

  it("adds no Focus to a shown 10%, which could be lower before the game clamps it", () => {
    expect(predict({ ...screen, minDamage: 0, slotPercent: 10, focus: 1 }, "target").focusedPercent).toBe(10);
    expect(predict({ ...screen, minDamage: 0, slotPercent: 11, focus: 1 }, "target").focusedPercent).toBe(21);
  });
});

describe("the average", () => {
  const oneSlot: ScreenAttack = { ...screen, minDamage: 0, maxDamage: 10, slots: 1, critChance: 20, armor: 2 };

  it("counts misses, crits, armor and pierce together", () => {
    // Hit 80%: a crit (20%) adds 10 × 0.15 = 1.5, to even 2, so 12; armor 2
    // comes off both: 0.8 × (0.8 × 8 + 0.2 × 10).
    expect(predict(oneSlot, "target").expected).toBeCloseTo(0.8 * (0.8 * 8 + 0.2 * 10));
    // A perfect roll pierces the armor: 0.8 × (0.8 × 10 + 0.2 × 12).
    expect(predict({ ...oneSlot, ignoresArmor: true }, "target").expected).toBeCloseTo(0.8 * (0.8 * 10 + 0.2 * 12));
  });

  it("counts Focus and Shock", () => {
    // Shocked with no Focus, the only slot fails.
    expect(predict({ ...oneSlot, shocked: true }, "target").expected).toBe(0);
    // One Focus makes the hit certain, cancels the shock, and adds 5% to the crit.
    expect(predict({ ...oneSlot, shocked: true, focus: 1 }, "target").expected).toBeCloseTo(0.75 * 8 + 0.25 * 10);
  });

  it("counts the what-ifs", () => {
    // Five slots, 4-11, every slot at 100%: always perfect, 11; frozen, 14.
    const sure = { ...screen, slotPercent: 100, minDamage: 6 }; // half of 100% of 11, to even
    expect(predict(sure, "target").expected).toBeCloseTo(11);
    expect(predict({ ...sure, frozen: true }, "target").expected).toBeCloseTo(14);
  });
});
