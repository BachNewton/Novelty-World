import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { eloGapVariance, fitElo, pairsFromFinishes, pairsFromWinner, topRated, type ComparisonSource, type PairResult } from "./elo";

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

describe("pairsFromWinner", () => {
  it("compares the winner with every other label's seats, once per seat", () => {
    const pairs = pairsFromWinner([
      { label: "cand", place: 1 },
      { label: "base", place: 2 },
      { label: "base", place: 3 },
      { label: "cand", place: 4 },
    ]);
    expect(pairs).toEqual([
      { a: "cand", b: "base", aWins: 1, bWins: 0 },
      { a: "cand", b: "base", aWins: 1, bWins: 0 },
    ]);
  });

  it("compares nothing in a game with no single winner", () => {
    expect(pairsFromWinner([{ label: "a", place: 1 }, { label: "b", place: 1 }, { label: "c", place: 3 }])).toEqual([]);
  });

  it("recovers the Luce edge from one candidate among five base seats", () => {
    // Luce at +100 Elo: the lone candidate wins r/(r+5) of games, r = 10^(100/400).
    const r = Math.pow(10, 100 / 400);
    const games = 1_000_000;
    const candWins = Math.round((games * r) / (r + 5));
    const results: PairResult[] = [];
    const lone = (winner: "cand" | "base") =>
      pairsFromWinner([
        { label: "cand", place: winner === "cand" ? 1 : 2 },
        ...Array.from({ length: 5 }, (_, i) => ({ label: "base", place: winner === "base" && i === 0 ? 1 : 2 })),
      ]);
    for (const p of lone("cand")) results.push({ ...p, aWins: p.aWins * candWins, bWins: p.bWins * candWins });
    for (const p of lone("base")) results.push({ ...p, aWins: p.aWins * (games - candWins), bWins: p.bWins * (games - candWins) });
    const elo = fitElo(["base", "cand"], results, { anchor: "base" });
    expect(elo["cand"]).toBeCloseTo(100, 0);
  });
});

describe("eloGapVariance", () => {
  const elo2 = (sources: ComparisonSource[]) => fitElo(["x", "y"], sources, { anchor: "y" });
  /** Elo per natural unit of log-strength, squared. */
  const scale = (400 / Math.LN10) ** 2;

  it("is the textbook Bradley–Terry variance when every game is one comparison", () => {
    const sources = [{ a: "x", b: "y", aWins: 70, bWins: 30, aPerWin: 1, bPerWin: 1 }];
    const variance = eloGapVariance(["x", "y"], elo2(sources), sources);
    expect(variance("x", "y") / (scale / (100 * 0.7 * 0.3))).toBeCloseTo(1, 6);
    expect(variance("y", "x")).toBe(variance("x", "y"));
    expect(variance("x", "x")).toBe(0);
  });

  it("counts a lone seat's win among copies as one game, not n − 1 comparisons", () => {
    // 5 players: the lone x won 30 of 100 decisive games, each win 4 comparisons. The
    // Luce model's Fisher information is q(1 − q) a game, q the lone seat's win share.
    const sources = [{ a: "x", b: "y", aWins: 4 * 30, bWins: 70, aPerWin: 4, bPerWin: 1 }];
    const variance = eloGapVariance(["x", "y"], elo2(sources), sources);
    expect(variance("x", "y") / (scale / (100 * 0.3 * 0.7))).toBeCloseTo(1, 6);
  });

  it("knows nothing of a gap no games connect", () => {
    const sources = [{ a: "x", b: "y", aWins: 5, bWins: 5, aPerWin: 1, bPerWin: 1 }];
    const variance = eloGapVariance(["x", "y", "z"], { x: 0, y: 0, z: 0 }, sources);
    expect(variance("x", "z")).toBe(Infinity);
  });

  it("matches the spread of the fit over many simulated ladders", () => {
    // Three bots on the Luce model, each alone among copies of each other at 4 players:
    // the fitted gaps' spread over 300 ladders against the variance each ladder reports.
    const strength: Record<string, number> = { x: 0, y: 120, z: 300 };
    const labels = Object.keys(strength);
    const rng = createRng("eloGapVariance");
    const gaps: number[] = [];
    const reported: number[] = [];
    for (let run = 0; run < 300; run++) {
      const sources: ComparisonSource[] = [];
      for (const lone of labels) {
        for (const rest of labels) {
          if (lone === rest) continue;
          const r = 10 ** ((strength[lone] - strength[rest]) / 400);
          let wins = 0;
          for (let g = 0; g < 200; g++) if (rng.next() < r / (r + 3)) wins++;
          sources.push({ a: lone, b: rest, aWins: 3 * wins, bWins: 200 - wins, aPerWin: 3, bPerWin: 1 });
        }
      }
      const elo = fitElo(labels, sources, { anchor: "x" });
      gaps.push(elo.z - elo.y);
      reported.push(eloGapVariance(labels, elo, sources)("z", "y"));
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const spread = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length - 1);
    const typical = reported.reduce((s, v) => s + v, 0) / reported.length;
    expect(spread / typical).toBeGreaterThan(0.8);
    expect(spread / typical).toBeLessThan(1.25);
  });
});
