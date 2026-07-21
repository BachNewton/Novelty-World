import { describe, expect, it } from "vitest";
import {
  eloToWinProb,
  sprt,
  walkGauntletSprt,
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
