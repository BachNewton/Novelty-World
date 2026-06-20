import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "../v5/trades";
import { proposeBestTrade as v12Propose } from "./trades";

// v12 carries v5's trade-to-deny construction VERBATIM and only changes the
// tie-break among NEAR-EQUAL candidates (mixed instead of fixed order). So on any
// board with a single clear candidate v12 must propose EXACTLY what v5 does — this
// file re-pins that carried engine; the mixing divergence lives in `mix.test.ts`.
// Oranges = {16, 18, 19}; pinks = {11, 13, 14}; freshGame seats p1..p4.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v12 proposeBestTrade — carries v5's denial engine (single-candidate boards)", () => {
  it("buys a rival's completer from a holdout to deny — identical to v5", () => {
    // p2 one orange short (owns 16, 18); p3 (holdout) holds the last orange (19).
    // p1 owns nothing of the set, so its only candidate is the orange denial: with
    // one contender, v12 == v5 exactly.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    const proposal = v12Propose(state, "p1");
    expect(proposal).toEqual(v5Propose(state, "p1"));
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.cashDelta["p3"] ?? 0).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(proposal.terms.cashDelta, "p2")).toBe(false);
    expect(proposal.reason).toContain("deny");
  });

  it("does NOT deny when the completer is unowned (matches v5)", () => {
    const state = setCash({ ...base, ownership: { 16: "p2", 18: "p2" } }, "p1", 3000);
    expect(v12Propose(state, "p1")).toBeNull();
    expect(v5Propose(state, "p1")).toBeNull();
  });

  it("adds no denial when I already hold the rival's completer (matches v5)", () => {
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p1" } },
      "p1",
      3000,
    );
    expect(v12Propose(state, "p1")).toEqual(v5Propose(state, "p1"));
  });

  it("won't construct a denial it can't fund in cash (matches v5)", () => {
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      10,
    );
    expect(v12Propose(state, "p1")).toBeNull();
    expect(v5Propose(state, "p1")).toBeNull();
  });

  it("prefers completing my own strong set over denying a rival's (matches v5)", () => {
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
    const proposal = v12Propose(state, "p1");
    expect(proposal).toEqual(v5Propose(state, "p1"));
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.propertyTo[14]).toBeUndefined();
  });
});
