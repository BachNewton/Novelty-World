import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, TradeTerms } from "../../../types";
import {
  evaluateTrade as v1Evaluate,
  proposeBestTrade as v1Propose,
} from "../../trades";
import {
  evaluateTrade as v2Evaluate,
  proposeBestTrade as v2Propose,
} from "./trades";

// v2's one hypothesis: price the rival-monopoly threat instead of vetoing it, so
// a clean "cash for the completer" sale becomes a live deal. These tests pin that
// divergence directly against the v1 champion on the same scenario.
//
// Scenario: p1 holds two of the three oranges (16, 18); p2 holds the completer
// (19) and gets NO monopoly from selling it. v1 vetoes the sale at any price
// (handing a rival a set it doesn't match); v2 sells it for enough cash.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

/** Board with p1 one orange short and p2 holding the completer; p1 flush. */
function oneShortBoard(): GameState {
  return setCash({ ...base, ownership: { 16: "p1", 18: "p1", 19: "p2" } }, "p1", 2000);
}

/** A bare "p2 sells lot 19 to p1 for `cash`" deal. */
function cashForCompleter(cash: number): TradeTerms {
  return { propertyTo: { 19: "p1" }, gojfTo: {}, cashDelta: { p1: -cash, p2: cash } };
}

describe("v2 evaluateTrade — prices the rival threat instead of vetoing", () => {
  it("accepts the completer sale once the cash outweighs the priced threat", () => {
    const state = oneShortBoard();
    const verdict = v2Evaluate(state, "p2", cashForCompleter(800));
    expect(verdict.accept).toBe(true);
    expect(verdict.reason).toContain("cash outweighs");
  });

  it("still rejects when the cash doesn't cover the threat", () => {
    const state = oneShortBoard();
    // No sweetener: p2 just loses the lot and hands p1 a monopoly for nothing.
    expect(v2Evaluate(state, "p2", cashForCompleter(0)).accept).toBe(false);
  });

  it("v1 vetoes the same sale at ANY price (the deadlock this fixes)", () => {
    const state = oneShortBoard();
    // Even a huge cash offer can't clear v1's hard rival-monopoly veto.
    expect(v1Evaluate(state, "p2", cashForCompleter(800)).accept).toBe(false);
    expect(v1Evaluate(state, "p2", cashForCompleter(2000)).accept).toBe(false);
  });
});

describe("v2 proposeBestTrade — constructs a payable completer purchase", () => {
  it("v1 proposes nothing (its own counterparty model predicts the veto)", () => {
    expect(v1Propose(oneShortBoard(), "p1")).toBeNull();
  });

  it("v2 proposes a cash purchase of the completer the seller will accept", () => {
    const state = oneShortBoard();
    const proposal = v2Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // It transfers the missing orange to p1 for cash flowing to the seller.
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.cashDelta["p2"] ?? 0).toBeGreaterThan(0);
    expect(proposal.terms.cashDelta["p1"] ?? 0).toBeLessThan(0);
    // The counterparty genuinely accepts it under v2's pricing.
    expect(v2Evaluate(state, "p2", proposal.terms).accept).toBe(true);
  });
});
