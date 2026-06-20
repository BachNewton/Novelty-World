import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v3Propose } from "../v3/trades";
import { proposeBestTrade as v5Propose } from "./trades";

// v9 carries v5's trade-to-deny engine VERBATIM (the v9 change is in valuation.ts
// `liquidityFloor`). These tests pin that the carried denial CONSTRUCTION is
// intact in v9 — they import `./trades` (v9's copy) and assert the same v5
// behavior, so a regression in the carried engine is caught here.
//
// v5's hypothesis (carried): extend trade CONSTRUCTION to TRADE-TO-DENY — block a rival
// who is one lot short of a set by buying the completer lot from a third-party
// holdout, even though it doesn't complete my own set. v3 (the base) only ever
// constructs deals that complete MY sets, so on a pure-denial board it proposes
// nothing; v5 surfaces the block. `evaluateTrade` is unchanged, so completion and
// incoming-vote behavior is identical to v3. Oranges = {16, 18, 19}; pinks =
// {11, 13, 14}; freshGame seats p1..p4.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v5 proposeBestTrade — trade-to-deny", () => {
  it("buys a rival's completer from a holdout to deny, where v3 proposes nothing", () => {
    // p2 is one orange short (owns 16, 18); p3 (a third-party holdout) holds the
    // last orange (19). p1 owns nothing of the set, so it has nothing to complete:
    // v3 proposes nothing; v5 buys 19 from p3 to block p2.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    expect(v3Propose(state, "p1")).toBeNull();

    const proposal = v5Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // The completer flows to the denier; the holdout (p3) is paid; the rival (p2)
    // is NOT a party — it can't veto its own denial.
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.cashDelta["p3"] ?? 0).toBeGreaterThan(0);
    expect(proposal.terms.cashDelta["p1"] ?? 0).toBeLessThan(0);
    expect(Object.prototype.hasOwnProperty.call(proposal.terms.cashDelta, "p2")).toBe(false);
    expect(proposal.reason).toContain("deny");
  });

  it("does NOT deny when the completer is unowned (that's a buy/auction, not a trade)", () => {
    // p2 one orange short, but the last orange (19) is unowned — nothing to buy
    // from a holdout, so no denial trade exists (the landing/auction path handles
    // it via acquisitionValue instead).
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2" } },
      "p1",
      3000,
    );
    expect(v5Propose(state, "p1")).toBeNull();
  });

  it("adds no denial when I already hold the rival's completer (matches v3)", () => {
    // I (p1) hold the last orange (19); p2 owns the other two. The rival is already
    // blocked, so there's no denial to construct — but p1 now has a one-short
    // stake itself, so v3's inherited completion (buy 16, 18 from p2) still fires.
    // v5 must propose EXACTLY what v3 does here: denial changes nothing.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p1" } },
      "p1",
      3000,
    );
    expect(v5Propose(state, "p1")).toEqual(v3Propose(state, "p1"));
  });

  it("won't construct a denial it can't fund in cash (no mortgage-to-fund)", () => {
    // Same denial board, but p1 is broke — it can't pay the holdout's sweetener.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      10,
    );
    expect(v5Propose(state, "p1")).toBeNull();
  });

  it("prefers completing my own strong set over denying a rival's", () => {
    // p1 is one orange short with the completer at a holdout (p3 owns 19) — a
    // completion buy is available — AND p2 is one pink short with its completer
    // also at p3. Completing my orange (full monopoly bonus) must outrank denying
    // the pink (only DENY_FACTOR × bonus).
    const state = setCash(
      {
        ...base,
        ownership: {
          16: "p1", 18: "p1", 19: "p3", // p1 one orange short
          11: "p2", 13: "p2", 14: "p3", // p2 one pink short, p3 holds completer
        },
      },
      "p1",
      3000,
    );
    const proposal = v5Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // It buys the orange completer (19) for itself, not the pink denial (14).
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.propertyTo[14]).toBeUndefined();
  });
});
