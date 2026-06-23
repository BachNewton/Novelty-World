// ===========================================================================
// kyle-v3 SNAPSHOT — branched from kyle-v2. Keeps kyle-v2's buy / auction /
// raise-cash / forced-liquidation behavior, but swaps the mortgage ordering onto
// the single MATCH_VALUE ladder (see ./match-value.ts) and adds a TRADE engine
// (see ./trades.ts). Plain-language strategy is in this folder's PHILOSOPHY.md;
// this file wires it into our `Bot` contract (see ../../decision.ts).
// ===========================================================================
import { SPACES } from "../../../data";
import {
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../../../development";
import { auctionBidCap, BID_INCREMENT, firstNegativePlayer } from "../../../engine";
import {
  mortgageInterestAt,
  mortgageValueAt,
  ownablePrice,
} from "../../../logic";
import type { GameState, ManageStaged, PropertyColor } from "../../../types";
import type { Bot, BotDecision } from "../../decision";
import { mortgageRank, myPositions, railroadCount } from "./match-value";
import { acceptsTrade, bestProposal, sameTerms } from "./trades";

/** Would owning every member of `color` (treating `boughtPos` as already mine)
 *  give me the full set? True exactly when the only lot I'm missing is one I
 *  already own or am about to. */
function completesColor(
  state: GameState,
  pid: string,
  color: PropertyColor,
  boughtPos: number,
): boolean {
  return groupPositions(color).every(
    (p) => state.ownership[p] === pid || p === boughtPos,
  );
}

/** Does buying `pos` complete a set worth mortgaging for? A full color monopoly,
 *  or a 3rd-or-later railroad. Never a utility (their rent is too weak to chase). */
function completesSet(state: GameState, pid: string, pos: number): boolean {
  const space = SPACES[pos];
  if (space.kind === "railroad") return railroadCount(state, pid) + 1 >= 3;
  const color = colorAt(pos);
  return color !== null && completesColor(state, pid, color, pos);
}

/** A lot I can raise cash from right now: mine, not the one I'm buying, not
 *  already mortgaged, and bare (no building stands anywhere in its group — the
 *  official mortgage rule, and our "never sell houses" rule, both fall out of
 *  this since we never clear those buildings). */
function canMortgage(
  state: GameState,
  pid: string,
  buyingPos: number,
  pos: number,
): boolean {
  if (pos === buyingPos) return false;
  if (state.mortgaged[pos]) return false;
  if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
    return false;
  }
  return mortgageValueAt(pos) !== null;
}

/** True when `pos` is part of the set I'm completing this turn by buying
 *  `buyingPos` — the one set the mortgage order must never break into (else I'd
 *  finish a monopoly with a mortgaged member). For a color buy that completes the
 *  group, that's the other lots of that color; for a railroad buy, my other
 *  railroads. `buyingPos < 0` means "no buy in progress" (forced debt). */
function inCompletingSet(
  state: GameState,
  pid: string,
  buyingPos: number,
  pos: number,
): boolean {
  if (buyingPos < 0) return false;
  const buying = SPACES[buyingPos];
  if (buying.kind === "railroad") return SPACES[pos].kind === "railroad";
  const color = colorAt(buyingPos);
  if (color === null || !completesColor(state, pid, color, buyingPos)) return false;
  return colorAt(pos) === color;
}

/** True when `pos` belongs to a COMPLETED set I hold — a full color monopoly or
 *  all four railroads. These are mortgaged only after every non-set lot. Utilities
 *  are never a "set" (always shed early). */
function isCompletedSet(state: GameState, pid: string, pos: number): boolean {
  const space = SPACES[pos];
  if (space.kind === "railroad") return railroadCount(state, pid) === 4;
  const color = colorAt(pos);
  return (
    color !== null && groupPositions(color).every((q) => state.ownership[q] === pid)
  );
}

/** The order kyle-v3 mortgages its holdings: NON-SET lots first, then completed
 *  SETS — and within each phase, least valuable first (highest MATCH_VALUE rank).
 *  So junk and loose low-value lots go before good loose lots, and a weak monopoly
 *  (brown) goes before a strong one (orange); your best set is protected longest.
 *  The set being completed this turn is excluded so a raise never breaks the very
 *  monopoly it's funding. Buildings are never sold — a lot with one anywhere in its
 *  group isn't mortgageable, and the engine's default sells houses only as the last
 *  forced-debt resort. */
function mortgageOrder(
  state: GameState,
  pid: string,
  buyingPos: number,
): number[] {
  const lots = myPositions(state, pid)
    .filter((p) => canMortgage(state, pid, buyingPos, p))
    .filter((p) => !inCompletingSet(state, pid, buyingPos, p));
  const leastValuableFirst = (a: number, b: number): number =>
    mortgageRank(state, pid, b) - mortgageRank(state, pid, a) || a - b;
  const nonSets = lots
    .filter((p) => !isCompletedSet(state, pid, p))
    .sort(leastValuableFirst);
  const sets = lots
    .filter((p) => isCompletedSet(state, pid, p))
    .sort(leastValuableFirst);
  return [...nonSets, ...sets];
}

function mortgageableTotal(order: readonly number[]): number {
  return order.reduce((sum, p) => sum + (mortgageValueAt(p) ?? 0), 0);
}

function buyDecision(state: GameState, pid: string): BotDecision | null {
  const { turn } = state;
  if (turn.playerId !== pid || turn.pendingBuy === undefined) return null;
  const pos = turn.pendingBuy;
  const price = ownablePrice(pos);
  const me = state.players.find((p) => p.id === pid);
  if (price === null || !me) return null;

  if (me.cash >= price) {
    return {
      intent: { kind: "buy", playerId: pid },
      note: `Landed on it — I always buy when I can afford it ($${price}).`,
    };
  }

  if (completesSet(state, pid, pos)) {
    const order = mortgageOrder(state, pid, pos);
    if (me.cash + mortgageableTotal(order) >= price) {
      return {
        intent: { kind: "raise-cash", playerId: pid },
        note: `This completes a set — mortgaging to afford the $${price}.`,
      };
    }
  }
  return {
    intent: { kind: "decline-buy", playerId: pid },
    note: `Can't afford $${price} without selling houses — passing.`,
  };
}

function sameMortgage(
  a: Readonly<Record<number, boolean>>,
  b: Readonly<Record<number, boolean>>,
): boolean {
  const keys = (o: Readonly<Record<number, boolean>>) =>
    Object.keys(o)
      .filter((k) => o[Number(k)])
      .sort()
      .join(",");
  return keys(a) === keys(b);
}

function raisingCash(state: GameState, pid: string): BotDecision | null {
  const { turn } = state;
  if (turn.playerId !== pid) return null;
  const pos = turn.pendingBuy;
  const me = state.players.find((p) => p.id === pid);
  const price = pos === undefined ? null : ownablePrice(pos);
  if (pos === undefined || price === null || !me) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }

  const need = price - me.cash;
  const mortgage: Record<number, boolean> = {};
  let raised = 0;
  for (const lot of mortgageOrder(state, pid, pos)) {
    if (raised >= need) break;
    mortgage[lot] = true;
    raised += mortgageValueAt(lot) ?? 0;
  }
  if (raised < need) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }

  const current = turn.manageStaged ?? { build: {}, mortgage: {} };
  if (sameMortgage(current.mortgage, mortgage)) {
    return {
      intent: { kind: "buy", playerId: pid },
      note: "Cash raised — completing the buy.",
    };
  }
  const staged: ManageStaged = { build: {}, mortgage };
  return { intent: { kind: "update-manage-staging", playerId: pid, staged } };
}

/** Auctions follow the same instinct as landing: I want the lot, and I'll bid up
 *  to list price + one increment ($10 over list), no more. I pay with the same
 *  capacity I'd use on landing — my cash, plus (only when winning it completes a
 *  set) the mortgage raise I'd take to buy it on the board. A still-mortgaged
 *  estate lot also costs its 10% interest up front, so that comes off my capacity. */
function auction(state: GameState, pid: string): BotDecision | null {
  const a = state.turn.auction;
  if (!a || !a.active.includes(pid) || a.leaderId === pid) return null;
  const me = state.players.find((p) => p.id === pid);
  const price = ownablePrice(a.position);
  if (!me || price === null) return null;

  const interest =
    a.resume.kind === "bank-estate" && state.mortgaged[a.position]
      ? (mortgageInterestAt(a.position) ?? 0)
      : 0;
  const raise = completesSet(state, pid, a.position)
    ? mortgageableTotal(mortgageOrder(state, pid, a.position))
    : 0;
  const capacity = me.cash - interest + raise;
  const cap = Math.min(
    price + BID_INCREMENT,
    capacity,
    auctionBidCap(state, pid),
  );
  const next = a.highBid + BID_INCREMENT;
  if (next <= cap) {
    return {
      intent: { kind: "bid", playerId: pid, amount: next },
      note: `Bidding $${next} on ${spaceName(a.position)} — I'll go up to $${cap}.`,
    };
  }
  return {
    intent: { kind: "pass-bid", playerId: pid },
    note: `Dropping out — won't pay over $${cap} for ${spaceName(a.position)}.`,
  };
}

function spaceName(pos: number): string {
  const s = SPACES[pos];
  return s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? s.name
    : "a property";
}

/** Forced debt settlement. Mortgage in the SAME MATCH_VALUE order as a voluntary
 *  raise — one lot per consult (the only shape the `mortgage` intent allows here);
 *  the engine re-checks solvency after each and leaves the phase the moment cash
 *  is back in the green. When every bare lot is mortgaged and we're still short,
 *  fall through to `null` so the engine's default can sell houses (the one place
 *  we let buildings go — there's nothing left to protect them with). The settler
 *  can be off-turn, so key off `firstNegativePlayer`, not `turn.playerId`. */
function mustRaiseCash(state: GameState, pid: string): BotDecision | null {
  if (firstNegativePlayer(state) !== pid) return null;
  const order = mortgageOrder(state, pid, -1);
  if (order.length === 0) return null;
  const lot = order[0];
  return {
    intent: { kind: "mortgage", playerId: pid, position: lot },
    note: `In the red — mortgaging ${spaceName(lot)} to cover it.`,
  };
}

/** Vote on a pending trade I'm a named, not-yet-voted party to. */
function tradePending(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;
  if (acceptsTrade(state, pid, pending)) {
    return {
      intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id },
      note: "This completes a set for me on fair terms — accepting.",
    };
  }
  return {
    intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id },
    note: "Doesn't complete a set for me on terms I'd take — declining.",
  };
}

/** At a turn boundary, arm a trade window if I have a worthwhile proposal — my own
 *  turn or off-turn (the pacer consults every seat). */
function preRollTrade(state: GameState, pid: string): BotDecision | null {
  if (!bestProposal(state, pid)) return null;
  return {
    intent: { kind: "set-queue", playerId: pid, queue: "trade", armed: true },
  };
}

/** Drive the trade intermission I armed: stage the best draft, then propose it
 *  once it's in place; back out if nothing qualifies anymore. */
function tradeBuilding(state: GameState, pid: string): BotDecision | null {
  const draft = state.turn.tradeDraft;
  if (!draft || draft.proposerId !== pid) return null;
  const best = bestProposal(state, pid);
  if (!best) return { intent: { kind: "cancel-trade", playerId: pid } };
  if (sameTerms(draft, best.terms)) {
    return { intent: { kind: "propose-trade", playerId: pid }, note: best.note };
  }
  // Stage the draft silently; the note rides the propose commit a beat later.
  return {
    intent: { kind: "update-trade-draft", playerId: pid, terms: best.terms },
  };
}

export const policy: Bot = (state, playerId) => {
  switch (state.turn.phase) {
    case "buy-decision":
      return buyDecision(state, playerId);
    case "raising-cash":
      return raisingCash(state, playerId);
    case "auction":
      return auction(state, playerId);
    case "must-raise-cash":
      return mustRaiseCash(state, playerId);
    case "trade-pending":
      return tradePending(state, playerId);
    case "pre-roll":
      return preRollTrade(state, playerId);
    case "trade-building":
      return tradeBuilding(state, playerId);
    default:
      return null;
  }
};
