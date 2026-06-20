import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import { groupPositions } from "../../../development";
import type { GameState, TradeTerms } from "../../../types";
import { evaluateTrade } from "./trades";

// v15's one change: the bot's incoming-trade VOTE charges a near-monopoly OPTION
// VALUE for foreclosing its OWN one-short completion shot. We test it via
// `evaluateTrade` with `chargeOptionValue` on (what `tradePending` passes) vs off
// (v14/v5 default = the counterparty model). Dark-blue = {37, 39} (Park Place 350,
// Boardwalk 400) — a 2-lot set, so owning one IS one-short. freshGame seats p1..p4.

const base = freshGame();
const [PARK, BOARDWALK] = groupPositions("dark-blue"); // 37, 39

function board(ownership: Record<number, string>, cash: Record<string, number>): GameState {
  return {
    ...base,
    ownership,
    players: base.players.map((p) => ({ ...p, cash: cash[p.id] ?? p.cash })),
  };
}

describe("v15 near-monopoly option value (Finding 2)", () => {
  // The standoff: p1 holds Park Place, p2 holds Boardwalk — each blocks the other on
  // dark-blue. p2 proposes to BUY Park Place for $700 (a price that clears v5's
  // rival-threat but not the foreclosure of p1's own shot).
  const standoff = board(
    { [PARK]: "p1", [BOARDWALK]: "p2" },
    { p1: 1500, p2: 1500 },
  );
  const sellMyHalf: TradeTerms = {
    propertyTo: { [PARK]: "p2" },
    gojfTo: {},
    cashDelta: { p1: 700, p2: -700 },
  };

  it("DECLINES selling its half of a standoff that v14/v5 would accept", () => {
    expect(evaluateTrade(standoff, "p1", sellMyHalf).accept).toBe(true); // v14/v5: sells
    const v15 = evaluateTrade(standoff, "p1", sellMyHalf, true);
    expect(v15.accept).toBe(false); // v15: holds — foreclosing its own set isn't worth $700
    expect(v15.reason).toContain("foreclose");
    expect(v15.delta).toBeLessThan(evaluateTrade(standoff, "p1", sellMyHalf).delta);
  });

  it("STILL sells for a clear overpay (monetizing a contested completer can be right)", () => {
    const bigOverpay: TradeTerms = {
      propertyTo: { [PARK]: "p2" },
      gojfTo: {},
      cashDelta: { p1: 950, p2: -950 },
    };
    expect(evaluateTrade(standoff, "p1", bigOverpay, true).accept).toBe(true);
  });

  it("does not charge when the bot is NOT one-short of the sold color", () => {
    // p1 owns a lone orange (16, 1 of 3) — not one-short — and sells it. No own-shot
    // to foreclose, so the option-aware vote equals the plain one.
    const lone = board({ 16: "p1" }, { p1: 1500, p2: 1500 });
    const sellLone: TradeTerms = {
      propertyTo: { 16: "p2" },
      gojfTo: {},
      cashDelta: { p1: 200, p2: -200 },
    };
    expect(evaluateTrade(lone, "p1", sellLone, true)).toEqual(
      evaluateTrade(lone, "p1", sellLone),
    );
  });

  it("does not charge when the trade keeps the bot one-short (no foreclosure)", () => {
    // A trade that doesn't reduce p1's dark-blue holding (it buys an unrelated lot)
    // forecloses nothing, so the option charge is zero and the votes match.
    const buyUnrelated: TradeTerms = {
      propertyTo: { 16: "p1" },
      gojfTo: {},
      cashDelta: { p1: -150, p3: 150 },
    };
    const withHolding = board(
      { [PARK]: "p1", [BOARDWALK]: "p2", 16: "p3" },
      { p1: 1500, p3: 1500 },
    );
    expect(evaluateTrade(withHolding, "p1", buyUnrelated, true)).toEqual(
      evaluateTrade(withHolding, "p1", buyUnrelated),
    );
  });
});
