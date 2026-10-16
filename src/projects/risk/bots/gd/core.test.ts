import { describe, expect, it } from "vitest";
import type { CardId } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { position } from "../../engine/test-kit";
import { ADJACENCY, TERRITORIES, type TerritoryId } from "../../map";
import { Board, GD_LINKS, GD_ORDER } from "./board";
import { bestCardMatch, bonusTerritoryOf } from "./cards";
import { applyStepVariance, getChoice, iterativeArray } from "./choice";
import { cutOff, Helper, scoreItems } from "./helper";
import { balanceWinChance, idealAttackUnits, roundHalfEven, winChance } from "./odds";
import { normalizeScore } from "./persona";

describe("GD's map order", () => {
  it("names every territory once, with exactly our borders", () => {
    expect([...GD_ORDER].sort()).toEqual(TERRITORIES.map((t) => t.id).sort());
    for (const t of GD_ORDER) expect([...GD_LINKS[t]].sort()).toEqual([...ADJACENCY[t]].sort());
  });
});

describe("GetChoice at Expert", () => {
  it("takes the top score, the earliest on a tie", () => {
    expect(getChoice(["a", "b", "c", "d"], (x) => ({ a: 0.2, b: 0.7, c: 0.7, d: 0.1 })[x] ?? 0)).toBe("b");
  });

  it("takes nothing when no score is above 0", () => {
    expect(getChoice(["a", "b"], () => 0)).toBeNull();
    expect(getChoice([], () => 1)).toBeNull();
  });

  it("keeps a NaN score, as GD's test does, but sorts it after every real one", () => {
    expect(getChoice(["a", "b"], (x) => (x === "a" ? NaN : 0.01))).toBe("b");
    expect(getChoice(["a", "b"], (x) => (x === "a" ? 0 : NaN))).toBe("b");
  });

  it("scores every candidate, in order", () => {
    const seen: number[] = [];
    getChoice([1, 2, 3], (x) => {
      seen.push(x);
      return 1;
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("GetIterativeArray and the step variance", () => {
  it("lists every amount up to 100 of them, with no variance", () => {
    expect(iterativeArray(3, 7)).toEqual({ amounts: [3, 4, 5, 6, 7], variance: 0 });
    expect(iterativeArray(1, 100).amounts).toHaveLength(100);
  });

  it("spreads 100 amounts over a wider range, its ends exact", () => {
    const { amounts, variance } = iterativeArray(1, 300);
    expect(amounts).toHaveLength(100);
    expect([amounts[0], amounts[99]]).toEqual([1, 300]);
    // step 299/99 ≈ 3.02: variance floor(1.51) = 1; the 50th amount is round(49 · 3.02) + 1.
    expect(variance).toBe(1);
    expect(amounts[49]).toBe(roundHalfEven((49 * 299) / 99) + 1);
  });

  it("jitters only with a variance, never past the range, and turns a 0 into the minimum", () => {
    expect(applyStepVariance(0, 1, 5, 0, () => 0.5)).toBe(1);
    expect(applyStepVariance(4, 1, 5, 0, () => 0.5)).toBe(4);
    // Unity's Range(-v, v) on ints: -v … v-1.
    expect(applyStepVariance(10, 1, 20, 3, () => 0)).toBe(7);
    expect(applyStepVariance(10, 1, 20, 3, () => 0.999)).toBe(12);
    expect(applyStepVariance(20, 1, 20, 3, () => 0.999)).toBe(18);
    expect(applyStepVariance(1, 1, 20, 3, () => 0.999)).toBe(3);
  });
});

describe("scores", () => {
  it("normalise as GD's NormalizeScore: capped, floored at 0, NaN kept", () => {
    expect(normalizeScore(50, 200)).toBe(0.25);
    expect(normalizeScore(300, 200)).toBe(1);
    expect(normalizeScore(-5, 200)).toBe(0);
    expect(normalizeScore(NaN, 1)).toBeNaN();
  });

  it("weigh items by their counts and cut off as GD's ScoreItems and CutOff", () => {
    // The cards goal with no +2 card in hand and a short one: (1·1 + 0.5·10) / 11.
    expect(scoreItems([1, 1, 0.5, 10])).toBeCloseTo(6 / 11);
    expect(scoreItems([1, 2, 3])).toBe(0);
    expect(cutOff(0.05, 0.1)).toBe(0);
    expect(cutOff(0.55, 0.1)).toBeCloseTo(0.5);
    expect(cutOff(1, 0.55)).toBe(1);
  });
});

describe("the AI's odds", () => {
  it("are the balanced capture chance up to 2000 armies", () => {
    expect(winChance(0, 3)).toBe(0);
    expect(winChance(10, 1)).toBe(1);
    expect(winChance(5, 5)).toBeGreaterThan(0.3);
    expect(winChance(5, 5)).toBeLessThan(0.7);
  });

  it("balance an estimated chance as AppleWinChanceBalance does", () => {
    expect(balanceWinChance(0.97)).toBe(1);
    expect(balanceWinChance(0.03)).toBe(0);
    expect(balanceWinChance(0.5)).toBeCloseTo(0.5);
    // 0.7^1.3 / (0.7^1.3 + 0.3^1.3) = w; (w - 0.1) / 0.8.
    const w = 0.7 ** 1.3 / (0.7 ** 1.3 + 0.3 ** 1.3);
    expect(balanceWinChance(0.7)).toBeCloseTo((w - 0.1) / 0.8);
  });

  it("find the fewest attackers reaching a chance, never probing 1 unless the search starts there", () => {
    const ideal = idealAttackUnits(10);
    expect(winChance(ideal, 10)).toBeGreaterThanOrEqual(Math.fround(0.9));
    expect(winChance(ideal - 1, 10)).toBeLessThan(Math.fround(0.9));
    for (const d of [1, 2, 3, 7, 25]) {
      let first = 2;
      while (winChance(first, d) < Math.fround(0.9)) first++;
      expect(idealAttackUnits(d)).toBe(first);
    }
    // A threshold of 0 to 100 (GD's continent goal passes one) is clamped to a sure capture.
    const sure = idealAttackUnits(4, 99);
    expect(winChance(sure, 4)).toBe(1);
    expect(winChance(sure - 1, 4)).toBeLessThan(1);
  });
});

describe("GetBestCardMatch", () => {
  const owns = (mine: readonly TerritoryId[]) => (t: TerritoryId) => mine.includes(t);

  it("spends a wild on one of each (10) before a natural three of a kind", () => {
    // Three artillery would be 8; a wild with infantry and cavalry is 10.
    const hand: CardId[] = ["brazil", "venezuela", "quebec", "alaska", "wild-1"];
    expect(bestCardMatch(hand, owns([]))).toEqual(["alaska", "wild-1", "brazil"]);
  });

  it("takes the highest three of a kind when no 10 is possible", () => {
    const hand: CardId[] = ["alaska", "alberta", "brazil", "venezuela", "quebec"];
    expect(bestCardMatch(hand, owns([]))?.sort()).toEqual(["brazil", "quebec", "venezuela"]);
  });

  it("swaps a card in so the set pictures one owned territory, and out when it pictures several", () => {
    // Infantry, cavalry, artillery taken first in hand order; none owned, so the owned infantry
    // card (japan) replaces alaska, going last.
    expect(bestCardMatch(["alaska", "peru", "brazil", "japan"], owns(["japan"]))).toEqual(["peru", "brazil", "japan"]);
    // All three owned: the first two owned with an unowned twin are swapped for it.
    const set = bestCardMatch(["alaska", "peru", "brazil", "japan", "congo"], owns(["alaska", "peru", "brazil"]));
    expect(set).toEqual(["brazil", "japan", "congo"]);
  });

  it("gives the +2 to the first owned territory in the set's order", () => {
    const owner = (t: TerritoryId) => (t === "peru" || t === "brazil" ? 0 : 1);
    expect(bonusTerritoryOf(["wild-1", "brazil", "peru"], 0, owner)).toBe("brazil");
    expect(bonusTerritoryOf(["wild-1", "alaska", "japan"], 0, owner)).toBeNull();
  });

  it("finds nothing in a hand with no set", () => {
    expect(bestCardMatch(["alaska", "alberta", "peru", "argentina"], owns([]))).toBeNull();
  });
});

describe("the helper's features", () => {
  // Seat 0 holds all of Australia but Indonesia's neighbour Siam is seat 1's.
  const state = position({
    board: {
      "indonesia": [0, 6],
      "new-guinea": [0, 2],
      "western-australia": [0, 2],
      "eastern-australia": [0, 2],
      "siam": [1, 9],
      "china": [1, 4],
      "india": [1, 3],
    },
    rest: [2, 1],
    active: 0,
    phase: "attack",
  });
  const view = engine.view(state, 0);
  const helper = new Helper({
    board: new Board(view, false),
    me: 0,
    hand: [],
    humans: [false, false, false],
    conqueredThisTurn: 0,
    attacksThisTurn: 0,
    attackSuccessThreshold: 80,
  });

  it("weighs a border by the armies beyond it against what it takes to capture it", () => {
    // Indonesia, in Australia held whole: Siam's 9 from Asia, against the attackers that take 6.
    expect(helper.borderWeakness("indonesia")).toBeCloseTo(Math.min(1, (9 / idealAttackUnits(6)) * 0.5));
    expect(helper.borderWeakness("eastern-australia")).toBe(0);
  });

  it("counts a continent's bonus towards stealing only for the largest one", () => {
    // Siam attacking Indonesia, whose owner holds Australia (+2, under Asia's 7): only the odds.
    const asSiam = new Helper({ ...helperInput(1), board: new Board(engine.view(state, 1), false) });
    const bs = asSiam.battleSuccess("siam", "indonesia");
    expect(asSiam.stealContinentBonus("siam", "indonesia")).toBeCloseTo(Math.min(1, bs * 0.4 + 0.2));
  });

  it("reads the share of a continent a seat holds", () => {
    expect(helper.continentOwnership("australia", 0)).toBe(1);
    expect(helper.continentOwnership("asia", 1)).toBe(3 / 12);
  });

  it("gives the power of a stack against the seat's largest", () => {
    expect(helper.countryPower("indonesia")).toBe(1);
    expect(helper.countryPower("new-guinea")).toBe(1 / 5);
  });
});

function helperInput(me: number) {
  return { me, hand: [] as CardId[], humans: [false, false, false], conqueredThisTurn: 0, attacksThisTurn: 0, attackSuccessThreshold: 80 };
}
