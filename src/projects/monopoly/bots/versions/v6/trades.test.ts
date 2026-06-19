import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { proposeBestTrade as v5Propose } from "../v5/trades";
import { proposeBestTrade as v6Propose } from "./trades";

// v6's one hypothesis: the proven trade-to-deny (v5) should also be fundable IN
// KIND — pay the holdout with a junk lot + minimal cash, not cash alone — so a
// denial the bot wants but can't afford in cash still fires. v5 returns null when
// it can't cover the cash sweetener; v6 swaps a junk lot instead. The junk-lot
// filter never gives away set progress (mine) or advances the holdout. Oranges =
// {16, 18, 19}; reds = {21, 23, 24}; light-blues = {6, 8, 9}; freshGame seats p1..p4.

const base = freshGame();

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

describe("v6 proposeBestTrade — deny-via-swap", () => {
  it("funds a denial with a junk lot when too cash-short for v5's cash buy", () => {
    // p2 one orange short (16, 18); p3 holds the completer (19). p1 wants to deny
    // but has only $50 — nowhere near the ~$230 cash sweetener the holdout needs,
    // so v5 proposes nothing. p1 holds a lone red (21) it has no stake in; v6 swaps
    // that for the orange completer plus a small cash top-up it CAN afford.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3", 21: "p1" } },
      "p1",
      50,
    );
    expect(v5Propose(state, "p1")).toBeNull();

    const proposal = v6Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // The completer flows to p1; my junk red (21) flows to the holdout p3; the
    // rival p2 is not a party.
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.terms.propertyTo[21]).toBe("p3");
    expect(Object.prototype.hasOwnProperty.call(proposal.terms.cashDelta, "p2")).toBe(false);
    expect(proposal.reason).toContain("deny");
  });

  it("won't give away a lot from a set I have a stake in (near-monopoly protected)", () => {
    // Same cash-short denial, but p1's only spare lots are TWO reds (21, 23) — a
    // near-monopoly. The junk filter requires a LONE lot (no set stake), so neither
    // red is offerable; with no affordable cash buy either, v6 proposes nothing.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3", 21: "p1", 23: "p1" } },
      "p1",
      50,
    );
    expect(v6Propose(state, "p1")).toBeNull();
  });

  it("won't hand the holdout a lot in a color they already hold (no advancing them)", () => {
    // Cash-short denial again. p1's only spare lot is a light-blue (6), but the
    // holdout p3 already owns a light-blue (8) — giving 6 would advance p3 toward a
    // set. The junk filter rejects it, and with no affordable cash buy v6 passes.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3", 6: "p1", 8: "p3" } },
      "p1",
      50,
    );
    expect(v6Propose(state, "p1")).toBeNull();
  });

  it("still denies via cash when flush (inherited v5 behavior intact)", () => {
    // No junk lot to give and plenty of cash — v6 falls back to v5's cash buy and
    // still blocks the rival's orange.
    const state = setCash(
      { ...base, ownership: { 16: "p2", 18: "p2", 19: "p3" } },
      "p1",
      3000,
    );
    const proposal = v6Propose(state, "p1");
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.terms.propertyTo[19]).toBe("p1");
    expect(proposal.reason).toContain("deny");
  });
});
