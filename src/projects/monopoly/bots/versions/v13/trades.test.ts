import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "../v5/trades";
import { proposeBestTrade as v13Propose } from "./trades";

// v13 changes ONLY the bot's incoming-trade vote (anti-kingmaker, pinned in
// `kingmaker.test.ts`). Trade CONSTRUCTION — including v5's trade-to-deny — is
// carried verbatim (proposeBestTrade calls evaluateTrade with the DEFAULT flat
// threat), so v13's proposals must be byte-for-byte v5's. This file re-pins that.
// Oranges = {16, 18, 19}; freshGame seats p1..p4.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v13 proposeBestTrade — construction is verbatim v5", () => {
  it("builds the same trade-to-deny v5 does", () => {
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    const proposal = v13Propose(state, "p1");
    expect(proposal).toEqual(v5Propose(state, "p1"));
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.reason).toContain("deny");
  });

  it("proposes the same completion v5 does", () => {
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p1" } },
      "p1",
      3000,
    );
    expect(v13Propose(state, "p1")).toEqual(v5Propose(state, "p1"));
  });

  it("prefers completing my own strong set — exactly as v5", () => {
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
    expect(v13Propose(state, "p1")).toEqual(v5Propose(state, "p1"));
  });

  it("proposes nothing where v5 proposes nothing (unfundable / no candidate)", () => {
    const broke = setCash({ ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } }, "p1", 10);
    expect(v13Propose(broke, "p1")).toEqual(v5Propose(broke, "p1"));
    const noCand = setCash({ ...base, ownership: { 16: "p2", 18: "p2" } }, "p1", 3000);
    expect(v13Propose(noCand, "p1")).toEqual(v5Propose(noCand, "p1"));
  });
});
