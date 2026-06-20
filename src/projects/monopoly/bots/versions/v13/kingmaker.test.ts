import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { evaluateTrade, kingmakerThreatCost } from "./trades";

// v13's one change: the bot's incoming-trade VOTE prices the rival-monopoly threat
// by the recipient's STANDING (the anti-kingmaker weight) instead of v5's flat
// threat — extra loath to feed its STRONGEST opponent, more willing to feed a
// harmless TRAILER. We test the vote directly via `evaluateTrade` with the
// `kingmakerThreatCost` threat fn (what `tradePending` passes) against the v5
// default (flat). Oranges = {16,18,19} (180/180/200); reds = {21,23,24}
// (220/220/240); freshGame seats p1..p4.

const base = freshGame();

/** Set per-player cash and ownership; everyone else keeps freshGame defaults. */
function board(
  ownership: Record<number, string>,
  cash: Record<string, number>,
  bankrupt: string[] = [],
): GameState {
  return {
    ...base,
    ownership,
    players: base.players.map((p) => ({
      ...p,
      cash: cash[p.id] ?? p.cash,
      bankrupt: bankrupt.includes(p.id),
    })),
  };
}

// p1 sells the orange completer (19) to p2, completing p2's orange monopoly, for
// $600 cash. Standings: p2 strongest, p4 weakest, p1/p3 mid.
const feedStrong = {
  state: board(
    { 19: "p1", 16: "p2", 18: "p2" },
    { p1: 1000, p2: 2000, p3: 1000, p4: 200 },
  ),
  terms: { propertyTo: { 19: "p2" }, gojfTo: {}, cashDelta: { p1: 600, p2: -600 } },
};

describe("v13 anti-kingmaker — standings-weighted incoming-trade vote", () => {
  it("REFUSES to feed the strongest opponent a set v5 would accept", () => {
    const { state, terms } = feedStrong;
    // v5 (flat threat): the $600 outweighs the flat orange threat → accept.
    expect(evaluateTrade(state, "p1", terms).accept).toBe(true);
    // v13 (kingmaker): p2 is the strongest opponent, so the threat is amplified
    // (~1.4×) past the cash → decline. The bot won't be p2's kingmaker.
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost).accept).toBe(false);
    // And the weighting strictly raises the priced threat for a strong recipient.
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost).delta).toBeLessThan(
      evaluateTrade(state, "p1", terms).delta,
    );
  });

  it("WILL feed a harmless trailer a set v5 would decline", () => {
    // p1 sells the red completer (24) to p4 (the weakest), for $500 — below v5's
    // flat red threat, so v5 declines; v13 discounts the trailer's threat (~0.6×)
    // so the cash now clears → accept. Feeding a laggard is cheap and can pressure
    // the leader.
    const state = board(
      { 24: "p1", 21: "p4", 23: "p4", 16: "p2", 18: "p2" },
      { p1: 1000, p2: 2000, p3: 1000, p4: 200 },
    );
    const terms = { propertyTo: { 24: "p4" }, gojfTo: {}, cashDelta: { p1: 500, p4: -500 } };
    expect(evaluateTrade(state, "p1", terms).accept).toBe(false); // v5 flat: declines
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost).accept).toBe(true); // v13: accepts
  });

  it("reduces to v5 with a single opponent (no kingmaker dynamics)", () => {
    // Only p1 and p2 active; p3/p4 bankrupt. One opponent → weight 1 → exactly v5.
    const state = board(
      { 19: "p1", 16: "p2", 18: "p2" },
      { p1: 1000, p2: 2000 },
      ["p3", "p4"],
    );
    const { terms } = feedStrong;
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost)).toEqual(
      evaluateTrade(state, "p1", terms),
    );
  });

  it("reduces to v5 on a level opponent field", () => {
    // All three opponents at equal position value → spread ~0 → weight 1 → v5.
    const state = board(
      { 19: "p1", 16: "p2", 18: "p2" },
      { p1: 1000, p2: 1000, p3: 1360, p4: 1360 },
    );
    // p2 holds 360 in assets, so p2's pv ≈ 1360 too — the field is level.
    const { terms } = feedStrong;
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost)).toEqual(
      evaluateTrade(state, "p1", terms),
    );
  });

  it("does not touch trades that create no rival monopoly (threat 0 either way)", () => {
    // p1 buys a lone lot from p3 — no rival gains a set, so flat and weighted
    // threat are both 0 and the verdicts are identical.
    const state = board({ 19: "p3" }, { p1: 1000, p2: 2000, p3: 1000, p4: 200 });
    const terms = { propertyTo: { 19: "p1" }, gojfTo: {}, cashDelta: { p1: -250, p3: 250 } };
    expect(evaluateTrade(state, "p1", terms, kingmakerThreatCost)).toEqual(
      evaluateTrade(state, "p1", terms),
    );
  });
});
