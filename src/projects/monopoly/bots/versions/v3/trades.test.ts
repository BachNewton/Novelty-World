import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v2Propose } from "../v2/trades";
import { evaluateTrade as v3Evaluate, proposeBestTrade as v3Propose } from "./trades";

// v3's one hypothesis: generalize trade CONSTRUCTION from "exactly one lot short,
// 2-way" to "any number short, N-way". v2 priced acceptance but only ever searched
// one-short colors and only moved that single missing lot, so boards where a set
// is split 1-1-1, or a proposer is two lots short, still deadlock — no 2-way deal
// completes anyone. These tests pin v3 closing exactly those boards, against v2
// (which proposes nothing on them) on the same scenarios. Oranges = {16, 18, 19}.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v3 proposeBestTrade — N-way / multi-short completion", () => {
  it("completes a 1-1-1 split by buying both missing lots from two owners (3-way)", () => {
    // p1 owns one orange (16); p2 and p3 hold the other two. Nobody is one short,
    // so v2 sees no 2-way completion and proposes nothing.
    const state = setCash(
      { ...base, ownership: { 16: "p1", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    expect(v2Propose(state, "p1")).toBeNull();

    const proposal = v3Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // Both missing oranges flow to p1 in one deal; both sellers get paid.
    expect(proposal.terms.propertyTo[18]).toBe("p1");
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.cashDelta["p2"] ?? 0).toBeGreaterThan(0);
    expect(proposal.terms.cashDelta["p3"] ?? 0).toBeGreaterThan(0);
    expect(proposal.terms.cashDelta["p1"] ?? 0).toBeLessThan(0);
    // Every party genuinely accepts under v3's evaluation.
    expect(v3Evaluate(state, "p1", proposal.terms).accept).toBe(true);
    expect(v3Evaluate(state, "p2", proposal.terms).accept).toBe(true);
    expect(v3Evaluate(state, "p3", proposal.terms).accept).toBe(true);
  });

  it("completes a two-short set held by a single owner in one deal (2-way)", () => {
    // p1 owns one orange; p2 holds BOTH others. Still not one-short, so v2 passes.
    const state = setCash(
      { ...base, ownership: { 16: "p1", 18: "p2", 19: "p2" } },
      "p1",
      3000,
    );
    expect(v2Propose(state, "p1")).toBeNull();

    const proposal = v3Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[18]).toBe("p1");
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(v3Evaluate(state, "p2", proposal.terms).accept).toBe(true);
  });

  it("still constructs v2's one-short cash purchase (inherited behavior)", () => {
    // p1 one orange short, p2 holds the single completer — the v2 deal must survive.
    const state = setCash(
      { ...base, ownership: { 16: "p1", 18: "p1", 19: "p2" } },
      "p1",
      2000,
    );
    const proposal = v3Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.cashDelta["p2"] ?? 0).toBeGreaterThan(0);
    expect(v3Evaluate(state, "p2", proposal.terms).accept).toBe(true);
  });

  it("won't construct a deal it can't fund in cash (no mortgage-to-fund)", () => {
    // Same 1-1-1 split but p1 is broke — buying two priced completers is unaffordable.
    const state = setCash(
      { ...base, ownership: { 16: "p1", 18: "p2", 19: "p3" } },
      "p1",
      40,
    );
    expect(v3Propose(state, "p1")).toBeNull();
  });
});
