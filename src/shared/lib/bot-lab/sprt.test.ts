import { describe, expect, it } from "vitest";
import {
  eloToWinProb,
  expectedToDecide,
  fewestToDecide,
  luceWinProb,
  sprt,
  walkGauntletSprt,
  walkGroupedSprt,
  type GauntletSprtConfig,
  type SprtConfig,
} from "./sprt";

const CFG: SprtConfig = { elo0: -20, elo1: 20, alpha: 0.05, beta: 0.05 };
const GAUNTLET: GauntletSprtConfig = { margin: 20, alpha: 0.05, beta: 0.05 };

describe("eloToWinProb", () => {
  it("maps 0 Elo to a coin flip", () => {
    expect(eloToWinProb(0)).toBeCloseTo(0.5, 12);
  });
  it("is symmetric about 0", () => {
    expect(eloToWinProb(150) + eloToWinProb(-150)).toBeCloseTo(1, 12);
  });
  it("matches the known 1-in-10 odds at ~400 Elo", () => {
    expect(eloToWinProb(400)).toBeCloseTo(10 / 11, 12);
  });
});

describe("sprt", () => {
  it("uses the classic Wald bounds for the given error rates", () => {
    const s = sprt(0, 0, CFG);
    expect(s.upper).toBeCloseTo(Math.log(0.95 / 0.05), 12);
    expect(s.lower).toBeCloseTo(Math.log(0.05 / 0.95), 12);
    expect(s.llr).toBe(0);
    expect(s.verdict).toBe("continue");
  });

  it("accepts H1 once enough net wins accumulate", () => {
    // Symmetric ±20 Elo bounds resolve at a net margin of 26 wins (just under
    // is still undecided — the boundary is sharp).
    expect(sprt(25, 0, CFG).verdict).toBe("continue");
    expect(sprt(26, 0, CFG).verdict).toBe("accept-h1");
  });

  it("accepts H0 once enough net losses accumulate", () => {
    expect(sprt(0, 26, CFG).verdict).toBe("accept-h0");
  });

  it("is undecided near 50%", () => {
    expect(sprt(100, 100, CFG).verdict).toBe("continue");
  });

  it("LLR is symmetric: swapping wins/losses negates it", () => {
    const a = sprt(30, 18, CFG);
    const b = sprt(18, 30, CFG);
    expect(a.llr).toBeCloseTo(-b.llr, 12);
  });
});

describe("walkGauntletSprt", () => {
  it("calls a one-sided winning stream BETTER", () => {
    const stream = Array.from({ length: 500 }, () => true);
    const w = walkGauntletSprt(stream, GAUNTLET, 4000);
    expect(w.verdict).toBe("better");
    expect(w.decisive).toBeLessThan(80);
  });

  it("calls a one-sided losing stream WORSE", () => {
    const stream = Array.from({ length: 500 }, () => false);
    const w = walkGauntletSprt(stream, GAUNTLET, 4000);
    expect(w.verdict).toBe("worse");
  });

  it("does NOT promote a near-tie — the regression that the symmetric test had", () => {
    // 51.8% over 720 games (v3-vs-v2 on the train seeds): a symmetric [−E,+E]
    // test crossed "better" at net +26 wins; the dual one-sided test must NOT.
    const wins = 373;
    const losses = 347;
    const stream = [
      ...Array.from({ length: wins }, () => true),
      ...Array.from({ length: losses }, () => false),
    ];
    // Interleave so the walk sees a realistic near-50% mix, not all wins first.
    const mixed: boolean[] = [];
    let w = 0;
    let l = 0;
    for (let i = 0; i < stream.length; i++) {
      // alternate proportionally to keep the running ratio near 373:347
      if (w * losses <= l * wins && w < wins) {
        mixed.push(true);
        w++;
      } else {
        mixed.push(false);
        l++;
      }
    }
    const res = walkGauntletSprt(mixed, GAUNTLET, 720);
    expect(res.verdict).not.toBe("better");
    expect(res.verdict).not.toBe("worse");
  });

  it("calls a true coin flip EVEN once enough games rule out ±E", () => {
    const stream = Array.from({ length: 4000 }, (_, i) => i % 2 === 0);
    const w = walkGauntletSprt(stream, GAUNTLET, 4000);
    expect(w.verdict).toBe("even");
  });

  it("reports inconclusive when the decisive cap is hit before any verdict", () => {
    const stream = Array.from({ length: 1000 }, (_, i) => i % 2 === 0);
    const w = walkGauntletSprt(stream, GAUNTLET, 200);
    expect(w.verdict).toBe("inconclusive");
    expect(w.decisive).toBe(200);
  });

  it("is batch-independent: a longer prefix gives the same verdict + stop point", () => {
    const base = [true, false, true, true, false, true, true, true, false, true];
    const stream = Array.from({ length: 600 }, (_, i) => base[i % base.length]);
    const short = walkGauntletSprt(stream.slice(0, 300), GAUNTLET, 4000);
    const long = walkGauntletSprt(stream, GAUNTLET, 4000);
    expect(long.verdict).toBe(short.verdict);
    expect(long.decisive).toBe(short.decisive);
    expect(long.wins).toBe(short.wins);
  });

  it("reports need-more when the stream runs out mid-test", () => {
    const w = walkGauntletSprt([true, false, true], GAUNTLET, 4000);
    expect(w.verdict).toBe("need-more");
  });
});

describe("luceWinProb", () => {
  it("is the side's par share at equal strength", () => {
    expect(luceWinProb(1, 6)(0)).toBeCloseTo(1 / 6, 12);
    expect(luceWinProb(5, 6)(0)).toBeCloseTo(5 / 6, 12);
    expect(luceWinProb(2, 4)(0)).toBeCloseTo(0.5, 12);
  });

  it("reduces to the logistic when the sides hold equal shares", () => {
    expect(luceWinProb(1, 2)(120)).toBeCloseTo(eloToWinProb(120), 12);
    expect(luceWinProb(2, 4)(-75)).toBeCloseTo(eloToWinProb(-75), 12);
  });

  it("gives a seat 10× the strength at +400 Elo: 10/(10+5) alone against five", () => {
    expect(luceWinProb(1, 6)(400)).toBeCloseTo(10 / 15, 12);
  });

  it("is the complement of the other side's view of the same table", () => {
    // One candidate among five base copies, seen from the base side (5 seats, −d).
    expect(luceWinProb(1, 6)(50) + luceWinProb(5, 6)(-50)).toBeCloseTo(1, 12);
  });

  it("rejects a side with no seats or every seat", () => {
    expect(() => luceWinProb(0, 4)).toThrow();
    expect(() => luceWinProb(4, 4)).toThrow();
  });
});

describe("walkGroupedSprt", () => {
  it("is the per-game walk when every group holds one game", () => {
    const stream = Array.from({ length: 900 }, (_, i) => i % 7 !== 0 && i % 3 !== 0);
    const grouped = walkGroupedSprt(
      stream.map((won) => [won]),
      GAUNTLET,
      4000,
    );
    expect(grouped).toEqual(walkGauntletSprt(stream, GAUNTLET, 4000));
  });

  it("only stops between groups", () => {
    // All wins: the per-game walk stops mid-group; the grouped one finishes the group.
    const perGame = walkGauntletSprt(Array.from({ length: 500 }, () => true), GAUNTLET, 4000);
    const groups = Array.from({ length: 100 }, () => [true, true, true, true, true, true]);
    const grouped = walkGroupedSprt(groups, GAUNTLET, 4000);
    expect(grouped.verdict).toBe("better");
    expect(grouped.decisive % 6).toBe(0);
    expect(grouped.decisive).toBeGreaterThanOrEqual(perGame.decisive);
    expect(grouped.decisive).toBeLessThan(perGame.decisive + 6);
  });

  it("tests a 1-in-6 seat against its 1/6 par, not 50%", () => {
    // Exactly par: one win in every six decisive games. Under the logistic this
    // would read as a crushing loss; under Luce it is a tie.
    const groups = Array.from({ length: 2000 }, () => [true, false, false, false, false, false]);
    const cfg: GauntletSprtConfig = { ...GAUNTLET, margin: 50, winProb: luceWinProb(1, 6) };
    expect(walkGroupedSprt(groups, cfg, 1e6).verdict).toBe("even");
    expect(walkGroupedSprt(groups, GAUNTLET, 1e6).verdict).toBe("worse");
  });

  it("calls a 1-in-6 seat winning a third of the time BETTER", () => {
    const groups = Array.from({ length: 500 }, () => [true, false, false, true, false, false]);
    const cfg: GauntletSprtConfig = { ...GAUNTLET, margin: 50, winProb: luceWinProb(1, 6) };
    expect(walkGroupedSprt(groups, cfg, 1e6).verdict).toBe("better");
  });

  it("checks after a group with no decisive games without moving", () => {
    const w = walkGroupedSprt([[], [true], []], GAUNTLET, 4000);
    expect(w.verdict).toBe("need-more");
    expect(w.decisive).toBe(1);
  });
});

describe("fewestToDecide", () => {
  const tables = [GAUNTLET, { margin: 30, alpha: 0.05, beta: 0.05, winProb: luceWinProb(1, 5) }, { margin: 30, alpha: 0.05, beta: 0.05, winProb: luceWinProb(4, 5) }];

  it("is the shortest stream that decides: one game fewer never does", () => {
    for (const cfg of tables) {
      const n = fewestToDecide(0, 0, cfg);
      const decides = (stream: boolean[]) => walkGauntletSprt(stream, cfg, 1e6).verdict !== "need-more";
      // Every stream of n−1 games is between the bounds; checking the extremes and every mix
      // of wins first then losses covers the LLR's range, since it is linear in the counts.
      for (let w = 0; w < n; w++) expect(decides([...Array<boolean>(w).fill(true), ...Array<boolean>(n - 1 - w).fill(false)])).toBe(false);
      const wins = Array<boolean>(n).fill(true);
      const losses = Array<boolean>(n).fill(false);
      const some = [wins, losses].some(decides) || Array.from({ length: n + 1 }, (_, w) => [...wins.slice(0, w), ...losses.slice(w)]).some(decides);
      expect(some).toBe(true);
    }
  });

  it("counts from where the test stands", () => {
    const from0 = fewestToDecide(0, 0, GAUNTLET);
    expect(fewestToDecide(10, 0, GAUNTLET)).toBeLessThan(from0);
  });
});

describe("expectedToDecide", () => {
  it("is Wald's distance to the bound over the drift, at a hypothesis", () => {
    const cfg = { margin: 30, alpha: 0.05, beta: 0.05, winProb: luceWinProb(1, 5) };
    const p0 = cfg.winProb(0);
    const p1 = cfg.winProb(30);
    const drift = p1 * Math.log(p1 / p0) + (1 - p1) * Math.log((1 - p1) / (1 - p0));
    expect(expectedToDecide(0, 0, p1, cfg)).toBeCloseTo(Math.log(0.95 / 0.05) / drift, 9);
  });

  it("grows as the edge shrinks toward the margin", () => {
    const cfg = { margin: 30, alpha: 0.05, beta: 0.05, winProb: luceWinProb(1, 5) };
    const at = (elo: number) => expectedToDecide(0, 0, cfg.winProb(elo), cfg);
    expect(at(200)).toBeLessThan(at(60));
    expect(at(60)).toBeLessThan(at(30));
    expect(at(-200)).toBeLessThan(at(-60));
  });

  it("matches the mean stop point of simulated streams", () => {
    const cfg = { margin: 30, alpha: 0.05, beta: 0.05, winProb: luceWinProb(1, 5) };
    const p = cfg.winProb(120);
    let seed = 1;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let total = 0;
    const trials = 400;
    for (let t = 0; t < trials; t++) total += walkGauntletSprt(Array.from({ length: 5000 }, () => next() < p), cfg, 1e6).decisive;
    // Wald's estimate ignores the overshoot past the bound, so the mean runs a little longer.
    const expected = expectedToDecide(0, 0, p, cfg);
    expect(total / trials).toBeGreaterThan(0.8 * expected);
    expect(total / trials).toBeLessThan(1.5 * expected);
  });
});
