import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "./trades";

// v5's one hypothesis: extend trade CONSTRUCTION to TRADE-TO-DENY — block a rival
// who is one lot short of a set by buying the completer lot from a third-party
// holdout, even though it doesn't complete my own set. The base it forked from only
// ever constructs deals that complete MY sets, so a pure-denial board is exactly
// where the two diverge: v5 surfaces a block where a completion-only proposer finds
// nothing. `evaluateTrade` is unchanged, so completion and incoming-vote behavior is
// inherited as-is. Oranges = {16, 18, 19}; pinks = {11, 13, 14}; seats p1..p4.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v5 proposeBestTrade — trade-to-deny", () => {
  it("buys a rival's completer from a holdout to deny, holding none of the set itself", () => {
    // p2 is one orange short (owns 16, 18); p3 (a third-party holdout) holds the
    // last orange (19). p1 owns NOTHING of the set, so this deal cannot be a
    // completion — the only thing it can be is the denial.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
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

  it("adds no denial when I already hold the rival's completer — only the inherited completion", () => {
    // I (p1) hold the last orange (19); p2 owns the other two. The rival is already
    // blocked, so there's no denial to construct — but p1 now has a one-short stake
    // itself, so the inherited completion (buy 16, 18 from p2) is what fires, priced
    // as a plain cash purchase with no denial premium layered on.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p1" } },
      "p1",
      3000,
    );
    const proposal = v5Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo).toEqual({ 16: "p1", 18: "p1" });
    expect(proposal.terms.cashDelta["p2"] ?? 0).toBeGreaterThan(0);
    expect(proposal.reason).toContain("complete the monopoly");
    expect(proposal.reason).not.toContain("deny");
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
