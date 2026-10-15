import { describe, expect, it } from "vitest";
import { fitElo, pairsFromFinishes, topRated, type PairResult } from "./elo";

describe("fitElo", () => {
  it("anchors the floor at 0 Elo", () => {
    const results: PairResult[] = [{ a: "v2", b: "v1", aWins: 70, bWins: 30 }];
    const elo = fitElo(["v1", "v2"], results, { anchor: "v1" });
    expect(elo["v1"]).toBeCloseTo(0, 9);
  });

  it("recovers the closed-form 2-player Elo gap from a win rate", () => {
    // For two players, the BT MLE gives γ_a/γ_b = aWins/bWins, so the Elo gap is
    // 400·log10(aWins/bWins). At 75% that's 400·log10(3) ≈ 190.85.
    const results: PairResult[] = [{ a: "v2", b: "v1", aWins: 75, bWins: 25 }];
    const elo = fitElo(["v1", "v2"], results, { anchor: "v1" });
    expect(elo["v2"]).toBeCloseTo(400 * Math.log10(3), 4);
  });

  it("gives every version equal Elo when the field is a wash", () => {
    const results: PairResult[] = [
      { a: "v1", b: "v2", aWins: 50, bWins: 50 },
      { a: "v2", b: "v3", aWins: 50, bWins: 50 },
      { a: "v1", b: "v3", aWins: 50, bWins: 50 },
    ];
    const elo = fitElo(["v1", "v2", "v3"], results, { anchor: "v1" });
    expect(elo["v1"]).toBeCloseTo(0, 6);
    expect(elo["v2"]).toBeCloseTo(0, 6);
    expect(elo["v3"]).toBeCloseTo(0, 6);
  });

  it("orders a transitive field and ranks the champion highest", () => {
    const results: PairResult[] = [
      { a: "v2", b: "v1", aWins: 70, bWins: 30 },
      { a: "v3", b: "v2", aWins: 65, bWins: 35 },
      { a: "v3", b: "v1", aWins: 80, bWins: 20 },
    ];
    const elo = fitElo(["v1", "v2", "v3"], results, { anchor: "v1" });
    expect(elo["v3"]).toBeGreaterThan(elo["v2"]);
    expect(elo["v2"]).toBeGreaterThan(elo["v1"]);
    const champion = Object.entries(elo).sort((x, y) => y[1] - x[1])[0][0];
    expect(champion).toBe("v3");
  });

  it("can crown a non-transitive champion the head-to-head misses", () => {
    // v3 ties v2 but crushes v1; v2 only edges v1. Against the whole field v3 is
    // strongest even though v3-vs-v2 alone is a coin flip — the point of Elo.
    const results: PairResult[] = [
      { a: "v3", b: "v2", aWins: 50, bWins: 50 },
      { a: "v3", b: "v1", aWins: 75, bWins: 25 },
      { a: "v2", b: "v1", aWins: 60, bWins: 40 },
    ];
    const elo = fitElo(["v1", "v2", "v3"], results, { anchor: "v1" });
    expect(elo["v3"]).toBeGreaterThan(elo["v2"]);
    expect(elo["v3"]).toBeGreaterThan(elo["v1"]);
  });
});

describe("pairsFromFinishes", () => {
  it("breaks a finishing order into every cross-label pair, won by the higher place", () => {
    const pairs = pairsFromFinishes([
      { label: "a", place: 2 },
      { label: "b", place: 1 },
      { label: "c", place: 3 },
    ]);
    expect(pairs).toEqual([
      { a: "a", b: "b", aWins: 0, bWins: 1 },
      { a: "a", b: "c", aWins: 1, bWins: 0 },
      { a: "b", b: "c", aWins: 1, bWins: 0 },
    ]);
  });

  it("compares nothing between copies of one bot, nor between tied places", () => {
    const pairs = pairsFromFinishes([
      { label: "base", place: 1 },
      { label: "base", place: 3 },
      { label: "cand", place: 2 },
      { label: "other", place: 2 },
    ]);
    // base(1) > cand, base(1) > other, cand > base(3), other > base(3); cand–other tie.
    expect(pairs).toHaveLength(4);
    const tally = (x: string, y: string) =>
      pairs.filter((p) => p.a === x && p.b === y).reduce((n, p) => n + p.aWins, 0) +
      pairs.filter((p) => p.a === y && p.b === x).reduce((n, p) => n + p.bWins, 0);
    expect(tally("cand", "base")).toBe(1);
    expect(tally("base", "cand")).toBe(1);
    expect(tally("cand", "other") + tally("other", "cand")).toBe(0);
  });

  it("recovers Plackett–Luce strengths from simulated finishing orders", () => {
    // Exact expected counts for a 3-seat Plackett–Luce table with strengths 4:2:1,
    // fed through full breaking: the fit recovers the 2:1 ratios (≈ +120.4 Elo).
    const gamma: Record<string, number> = { a: 4, b: 2, c: 1 };
    const labels = ["a", "b", "c"];
    const results: PairResult[] = [];
    const orders: string[][] = [
      ["a", "b", "c"], ["a", "c", "b"], ["b", "a", "c"],
      ["b", "c", "a"], ["c", "a", "b"], ["c", "b", "a"],
    ];
    for (const order of orders) {
      let rest = 7;
      let p = 1;
      for (const l of order) {
        p *= gamma[l] / rest;
        rest -= gamma[l];
      }
      const weight = Math.round(p * 1e6);
      for (const pair of pairsFromFinishes(order.map((label, i) => ({ label, place: i + 1 })))) {
        results.push({ ...pair, aWins: pair.aWins * weight, bWins: pair.bWins * weight });
      }
    }
    const elo = fitElo(labels, results, { anchor: "c" });
    expect(elo["b"]).toBeCloseTo(400 * Math.log10(2), 0);
    expect(elo["a"]).toBeCloseTo(400 * Math.log10(4), 0);
    expect(topRated(elo, labels)).toBe("a");
  });
});
