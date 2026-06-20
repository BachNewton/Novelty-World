import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "../v5/trades";
import { proposeBestTrade as v18Propose } from "./trades";

// v14 changes ONLY Offer C's phantom-denial gate (pinned in `phantom-denial.test.ts`).
// On boards where the denial is REAL (the rival could realistically acquire the
// completer) or where there's no denial at all, v14's construction must match v5
// exactly. This file re-pins that. Oranges = {16,18,19}; pinks = {11,13,14}.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v14 proposeBestTrade — matches v5 where the denial is real / absent", () => {
  it("builds the same strong-set denial v5 does (rival can acquire it)", () => {
    // p2 one orange short with the completer (19) at holdout p3; default cash leaves
    // p2 able to extract it, so the denial is real — v14 == v5.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    const proposal = v18Propose(state, "p1");
    expect(proposal).toEqual(v5Propose(state, "p1"));
    expect(proposal?.terms.propertyTo[19]).toBe("p1");
    expect(proposal?.reason).toContain("deny");
  });

  it("proposes the same completion v5 does", () => {
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p1" } },
      "p1",
      3000,
    );
    expect(v18Propose(state, "p1")).toEqual(v5Propose(state, "p1"));
  });

  it("prefers completing my own strong set over denying a rival's — as v5", () => {
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
    const proposal = v18Propose(state, "p1");
    expect(proposal).toEqual(v5Propose(state, "p1"));
    expect(proposal?.terms.propertyTo[19]).toBe("p1");
  });

  it("proposes nothing where v5 proposes nothing (unowned completer / unfundable)", () => {
    const unowned = setCash({ ...base, ownership: { 16: "p2", 18: "p2" } }, "p1", 3000);
    expect(v18Propose(unowned, "p1")).toEqual(v5Propose(unowned, "p1"));
    const broke = setCash({ ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } }, "p1", 10);
    expect(v18Propose(broke, "p1")).toEqual(v5Propose(broke, "p1"));
  });
});
