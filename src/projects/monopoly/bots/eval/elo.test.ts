import { describe, expect, it } from "vitest";
import { fitElo, type PairResult } from "./elo";

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
