import { describe, expect, it } from "vitest";
import { balance, balancedFight, captureChance, fairFight, resolveBlitz, type Fight } from "./blitz";

/** Every outcome's chance added up: the attacker's captures and the defender's hold. */
const total = (fight: Fight) => fight.attackerLost.reduce((sum, p) => sum + p, 0);

describe("the fair odds (COMBAT-8 step 1)", () => {
  it("know the classic odds: one die against one, ties to the defender", () => {
    expect(fairFight(1, 1).defenderLost[1]).toBeCloseTo(15 / 36, 12);
  });

  it("account for every way a fight can end, on both sides", () => {
    for (const [a, d] of [[1, 1], [3, 2], [7, 5], [12, 20]]) {
      const fight = fairFight(a, d);
      expect(total(fight)).toBeCloseTo(1, 12);
      let holds = fight.defenderLost[d];
      for (let j = 0; j < d; j++) holds += fight.defenderLost[j];
      expect(holds).toBeCloseTo(1, 12);
    }
  });
});

describe("Balanced Blitz (COMBAT-8 steps 2 to 5)", () => {
  it("pushes the favourite's chance up as GD does: (p^1.3 / (p^1.3 + (1 − p)^1.3) − 0.1) / 0.8", () => {
    for (const [a, d] of [[5, 5], [8, 5], [4, 6], [10, 7]]) {
      const p = fairFight(a, d).defenderLost[d];
      const pushed = p ** 1.3 / (p ** 1.3 + (1 - p) ** 1.3);
      expect(captureChance(a, d)).toBeCloseTo((pushed - 0.1) / 0.8, 5);
    }
  });

  it("makes a long shot of 5% or less a certain loss, for either side", () => {
    expect(fairFight(2, 12).defenderLost[12]).toBeLessThan(0.05);
    expect(captureChance(2, 12)).toBe(0);
    expect(fairFight(30, 2).attackerLost[30]).toBeLessThan(0.05);
    expect(captureChance(30, 2)).toBe(1);
  });

  it("keeps every outcome's chance a whole", () => {
    for (const [a, d] of [[3, 2], [9, 9], [15, 4], [6, 11]]) expect(total(balance(fairFight(a, d)))).toBeCloseTo(1, 12);
  });

  it("cuts away the luckiest results at both ends", () => {
    const fair = fairFight(10, 10);
    const balanced = balance(fair);
    expect(fair.attackerLost[0]).toBeGreaterThan(0);
    expect(balanced.attackerLost[0]).toBe(0);
    expect(fair.defenderLost[0]).toBeGreaterThan(0);
    expect(balanced.defenderLost[0]).toBe(0);
  });
});

describe("resolving a blitz", () => {
  it("draws the outcome at the uniform number's place in the combined order", () => {
    const fight = balancedFight(8, 6) as Fight;
    const win = fight.defenderLost[6];
    // A draw just past the capture chance lands on the defender's first outcome with any chance.
    const firstHold = Array.from(fight.defenderLost.slice(0, 6)).findIndex((p) => p > 0);
    expect(resolveBlitz(8, 6, win + 1e-12, () => 0)).toEqual({ attackerLosses: 8, defenderLosses: firstHold });
    // The smallest draw takes the attacker's best outcome with any chance.
    const best = Array.from(fight.attackerLost.slice(0, 8)).findIndex((p) => p > 0);
    expect(resolveBlitz(8, 6, 0, () => 0)).toEqual({ attackerLosses: best, defenderLosses: 6 });
  });

  it("captures as often as the balanced odds say", () => {
    let seed = 1;
    const uniform = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let captures = 0;
    for (let i = 0; i < 20_000; i++) if (resolveBlitz(6, 5, uniform(), uniform).defenderLosses === 5) captures++;
    expect(captures / 20_000).toBeCloseTo(captureChance(6, 5), 1);
  });
});

describe("very large fights", () => {
  it("over 2,000 armies, GD's estimate still gives a whole set of odds", () => {
    const fight = balancedFight(1500, 900) as Fight;
    expect(total(fight)).toBeCloseTo(1, 9);
    expect(captureChance(1500, 900)).toBe(1);
    expect(captureChance(900, 1100)).toBeGreaterThan(0);
    expect(captureChance(900, 1100)).toBeLessThan(1);
  });

  it("over 100,000, the fight is rolled with fair dice", () => {
    expect(balancedFight(60_000, 50_000)).toBeNull();
  });
});
