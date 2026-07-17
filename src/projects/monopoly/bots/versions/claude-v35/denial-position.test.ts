import { describe, expect, it } from "vitest";
import { SPACES } from "../../../data";
import { freshGame } from "../../../mocks";
import type { GameState, TradeTerms } from "../../../types";
import { evaluateTrade as v35Eval, proposeBestTrade as v35Propose } from "./trades";
import { DENY_FACTOR, isDistressed, monopolyBonus } from "./valuation";

// v35 prices the DENIAL-POSITION OPTION VALUE: a holder of a completer (a lot that
// would complete a one-short rival's set) values it at the premium it can extract,
// so it won't sell its position cheap to ANOTHER denier — which is what makes the
// hot-potato hop stop clearing. Selling TO the rival is the cash-out, priced by
// rivalThreatCost; the two are mutually exclusive (the recipient is the rival xor
// not), so the premium is charged exactly ONCE either way — that no-double-count is
// the invariant these tests pin. A distressed holder still sheds it cheap.
// Oranges = {16,18,19}; greens = {31,32,34}. freshGame seats p1..p4.

const base = freshGame();

function board(ownership: Record<number, string>, cash: Record<string, number>): GameState {
  return {
    ...base,
    ownership,
    players: base.players.map((p) => ({ ...p, cash: cash[p.id] ?? p.cash })),
  };
}

/** p3 owns a hoteled green monopoly → a deadly developed rent, so a thin holder of
 *  the completer can be genuinely distressed. */
function withDeadlyBoard(ownership: Record<number, string>, cash: Record<string, number>): GameState {
  const s = board({ 31: "p3", 32: "p3", 34: "p3", ...ownership }, cash);
  return { ...s, houses: { 31: 5, 32: 5, 34: 5 } };
}

/** Printed price of an ownable space — the book value a transfer moves. */
function price(index: number): number {
  const space = SPACES[index];
  if (space.kind !== "property") throw new Error(`space ${index} is not a property`);
  return space.price;
}

const NY_AVE = 19; // the orange completer
const ORIENTAL = 6; // a light-blue lot with no denial position at stake — the baseline
const ORANGE_PREMIUM = Math.round(monopolyBonus("orange") * DENY_FACTOR); // held-completer option value

/** p2 is one orange short (16,18); the completer sits with healthy holdout p3. */
const heldCompleter = board({ 16: "p2", 18: "p2", 19: "p3" }, { p1: 3000, p2: 1000, p3: 1000, p4: 1000 });

describe("v35 — denial-position option value (symmetric ring pricing)", () => {
  it("a HEALTHY holder won't sell its completer cheap to another denier — the ring won't start", () => {
    // p1 books the deny premium as a buyer, but p3 now prices 19 at the premium it can
    // extract, so no non-rival hop clears and p1 constructs nothing.
    expect(v35Propose(heldCompleter, "p1")).toBeNull();
  });

  it("charges book + the DENY premium to hand a held completer to a NON-rival", () => {
    const giveToDenier: TradeTerms = { propertyTo: { [NY_AVE]: "p1" }, gojfTo: {}, cashDelta: {} };
    // p3 forfeits the option value on top of the lot's book value.
    expect(v35Eval(heldCompleter, "p3", giveToDenier).delta).toBe(-(price(NY_AVE) + ORANGE_PREMIUM));
  });

  it("charges book ALONE for a lot with no denial position at stake", () => {
    // Same board plus an idle light-blue at p3: handing it over forfeits no premium,
    // which is what isolates the premium in the assertion above to the completer.
    const withIdleLot = board(
      { 16: "p2", 18: "p2", 19: "p3", 6: "p3" },
      { p1: 3000, p2: 1000, p3: 1000, p4: 1000 },
    );
    const givePlain: TradeTerms = { propertyTo: { [ORIENTAL]: "p1" }, gojfTo: {}, cashDelta: {} };
    expect(v35Eval(withIdleLot, "p3", givePlain).delta).toBe(-price(ORIENTAL));
  });

  it("selling TO the one-short rival is the cash-out — premium charged ONCE, not twice", () => {
    // rivalThreatCost fires and denialPositionCost does not (mutually exclusive), so the
    // cost matches the non-rival handover exactly rather than double-counting.
    const giveToRival: TradeTerms = { propertyTo: { [NY_AVE]: "p2" }, gojfTo: {}, cashDelta: {} };
    expect(v35Eval(heldCompleter, "p3", giveToRival).delta).toBe(-(price(NY_AVE) + ORANGE_PREMIUM));
  });

  it("a DISTRESSED holder still sheds it cheap — the protective grab off a near-bust seat is preserved", () => {
    // Completer 19 at thin, distressed p4 (under the hoteled-green board). p4 forfeits
    // the premium cheap, so p1's protective deny still clears — v35 fires it.
    const st = withDeadlyBoard({ 16: "p2", 18: "p2", 19: "p4" }, { p1: 3000, p2: 1000, p3: 1000, p4: 5 });
    expect(isDistressed(st, "p4")).toBe(true);
    const deal = v35Propose(st, "p1");
    expect(deal?.terms.propertyTo[NY_AVE]).toBe("p1");
    expect(deal?.reason).toContain("deny");
  });

  it("leaves COMPLETION construction untouched (the rival caving / cash-out is unchanged)", () => {
    // p1 is the one-short owner; buying 19 from p3 completes p1's set — the cash-out,
    // not a denier hop, so construction still fires and pays the holdout.
    const st = board({ 16: "p1", 18: "p1", 19: "p3" }, { p1: 3000, p2: 1000, p3: 1000, p4: 1000 });
    const deal = v35Propose(st, "p1");
    expect(deal?.terms.propertyTo[NY_AVE]).toBe("p1");
    expect(deal?.terms.cashDelta["p3"] ?? 0).toBeGreaterThan(0);
    expect(deal?.reason).toContain("complete my oranges monopoly");
  });
});
