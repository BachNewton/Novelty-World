import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "../v5/trades";
import { proposeBestTrade as v12Propose } from "./trades";
import { mixPick, mixUnit } from "./mix";

// v12's one change: when several trade candidates are within MIX_TOLERANCE of the
// best effective delta, MIX which one to propose (drawn from `state.rngState`),
// rather than v5's fixed-color-order argmax. The mix is replay-safe (a pure hash
// of `rngState` + a salt — never Math.random) and reduces EXACTLY to v5 when only
// one candidate clears. Oranges = {16,18,19} (prices 180/180/200); reds =
// {21,23,24} (220/220/240); freshGame seats p1..p4.

const base = freshGame();

function setup(ownership: Record<number, string>, cash: number): GameState {
  return {
    ...base,
    ownership,
    players: base.players.map((p) => (p.id === "p1" ? { ...p, cash } : p)),
  };
}

describe("v12 mixUnit / mixPick — replay-safe seeded draw", () => {
  it("is deterministic in (rngState, salt) and decorrelated across both", () => {
    expect(mixUnit(12345, "a")).toBe(mixUnit(12345, "a")); // stable
    expect(mixUnit(12345, "a")).not.toBe(mixUnit(12345, "b")); // salt matters
    expect(mixUnit(12345, "a")).not.toBe(mixUnit(99999, "a")); // state matters
    const u = mixUnit(7, "x");
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  });

  it("mixPick returns the sole item regardless of draw (no-choice reduces cleanly)", () => {
    for (let r = 0; r < 32; r++) expect(mixPick(["only"], r, "s")).toBe("only");
  });

  it("mixPick spreads across items as rngState varies", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 64; r++) seen.add(mixPick(["a", "b", "c"], r, "s"));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("v12 proposeBestTrade — mixed near-equal tie-break", () => {
  // Two denial candidates of near-equal value, both bought from the same holdout
  // p3: deny p2's orange (buy 19) vs deny p4's red (buy 24). Their effective deltas
  // (denyBonus ≈ 336 vs 326, each net the same ~$30 sweetener) sit within
  // MIX_TOLERANCE, so v12 mixes; v5 always takes orange (first in color order).
  const twoDenials = setup(
    { 16: "p2", 18: "p2", 19: "p3", 21: "p4", 23: "p4", 24: "p3" },
    3000,
  );

  it("v5 is fixed; v12 mixes across BOTH near-equal denials as rngState varies", () => {
    // v5 deterministic: the same lot every time.
    const v5Lots = new Set<number>();
    for (let r = 0; r < 64; r++) {
      const p = v5Propose({ ...twoDenials, rngState: r }, "p1");
      expect(p).not.toBeNull();
      if (p) v5Lots.add(Object.keys(p.terms.propertyTo).map(Number)[0]);
    }
    expect([...v5Lots]).toEqual([19]); // always orange-denial, never red

    // v12 mixed: BOTH denials appear across the rngState sweep, and every proposal
    // is one of the two valid denials (never a trade-down to something worse).
    const v12Lots = new Set<number>();
    for (let r = 0; r < 64; r++) {
      const p = v12Propose({ ...twoDenials, rngState: r }, "p1");
      expect(p).not.toBeNull();
      if (p) v12Lots.add(Object.keys(p.terms.propertyTo).map(Number)[0]);
    }
    expect(v12Lots).toEqual(new Set([19, 24]));
  });

  it("is stable for a fixed rngState (re-consult-safe — won't spin the arm/commit)", () => {
    const a = v12Propose({ ...twoDenials, rngState: 42 }, "p1");
    const b = v12Propose({ ...twoDenials, rngState: 42 }, "p1");
    expect(a).toEqual(b);
  });

  it("reduces to v5 when only one candidate clears (single denial)", () => {
    // Only p2's orange is deniable; no red threat. One contender → no mixing.
    const oneDenial = setup({ 16: "p2", 18: "p2", 19: "p3" }, 3000);
    for (const r of [0, 1, 7, 31, 255]) {
      const s = { ...oneDenial, rngState: r };
      expect(v12Propose(s, "p1")).toEqual(v5Propose(s, "p1"));
    }
  });

  it("prefers a clear best over a worse alternative (mix never trades down)", () => {
    // A STRONG orange denial (deny p2, denyBonus ≈ 336) vs a WEAK brown denial
    // (deny p4, denyBonus ≈ 50; browns = {1,3}). Their effective deltas are far
    // more than MIX_TOLERANCE apart, so the orange is the sole contender: v12 never
    // mixes in the inferior brown — it picks the same clear best v5 does.
    const strongVsWeak = setup(
      { 16: "p2", 18: "p2", 19: "p3", 1: "p4", 3: "p3" },
      3000,
    );
    for (let r = 0; r < 32; r++) {
      const p = v12Propose({ ...strongVsWeak, rngState: r }, "p1");
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.terms.propertyTo[19]).toBe("p1"); // denies the orange (strong)
      expect(p.terms.propertyTo[3]).toBeUndefined(); // never the brown (weak)
    }
  });
});
