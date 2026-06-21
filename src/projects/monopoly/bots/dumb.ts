import { BID_INCREMENT, firstNegativePlayer, JAIL_FEE } from "../engine";
import { heldJailCard, mortgageInterestAt, ownablePrice } from "../logic";
import type { GameState, Intent } from "../types";
import { type BotDecision, move } from "./decision";
import { forcedRaiseStep } from "./fallback";

/** The "dumb" bot policy: a note-less `BotDecision` wrapping the decision a bot
 *  `playerId` should submit right now, or null if it isn't this bot's move.
 *  Purely REACTIVE — it answers the decision phases the engine pauses on and
 *  never initiates (it doesn't build, mortgage voluntarily, or propose trades).
 *  The pacer iterates the bot seats and submits the first non-null decision; any
 *  connected client may proxy a bot (the route's version guard dedupes the
 *  redundant writes). A live human's own decisions are left to their UI — never
 *  to this policy.
 *
 *  Resolved per seat through `bots/registry.ts`. The contrast strategy is the
 *  proactive `policy` (`bots/policy.ts`). Covers the proxy-driven decision
 *  phases:
 *  - `buy-decision`: buy whenever affordable, otherwise decline.
 *  - `auction`: while still in and not the standing leader, raise by
 *    `BID_INCREMENT` if the next bid stays within both the printed price and what
 *    cash covers, else drop. Bots never jam their own lead.
 *  - `must-raise-cash`: if this bot is the current debtor (whoever is in the
 *    red, possibly out of turn after a trade), mortgage the cheapest
 *    un-mortgaged, building-free property — one per call until back to ≥ 0 —
 *    then, once nothing's left to mortgage, sell off a built set's buildings.
 *  - `trade-pending`: if this bot is an un-voted party, accept (permissive — no
 *    valuation).
 *  - `jail-decision`: leave ASAP — a held Get-Out-of-Jail-Free card first (it's
 *    free), else pay the $50 fine when affordable, else `null` so the pacer
 *    issues the jail roll (gamble on doubles).
 *
 *  At `pre-roll` it returns null (no proactive arming), so the pacer simply
 *  rolls. Mechanical phases (`pre-roll` → step, `post-roll` → end-turn) are
 *  handled by the pacer itself, not here. */
export function dumbBot(state: GameState, playerId: string): BotDecision | null {
  return move(dumbIntent(state, playerId));
}

/** The dumb policy's raw intent (or null) — wrapped note-less by `dumbBot`. Split
 *  out so the policy reads as plain intent logic; the `BotDecision` shape (which
 *  the Claude policy uses to attach reasoning) is added by the one-line wrap. */
function dumbIntent(state: GameState, playerId: string): Intent | null {
  const { phase, pendingBuy, pendingTrade } = state.turn;

  if (phase === "jail-decision") {
    if (state.turn.playerId !== playerId) return null;
    // Card → cash → roll: spend a free card before $50, and only roll for
    // doubles (returning null, the pacer steps) when neither is available.
    if (heldJailCard(state, playerId) !== null) {
      return { kind: "use-jail-card", playerId };
    }
    const player = state.players.find((p) => p.id === playerId);
    if (player && player.cash >= JAIL_FEE) {
      return { kind: "pay-to-leave-jail", playerId };
    }
    return null;
  }

  if (phase === "buy-decision" && pendingBuy !== undefined) {
    if (state.turn.playerId !== playerId) return null;
    const player = state.players.find((p) => p.id === playerId);
    const price = ownablePrice(pendingBuy);
    if (!player || price === null) return null;
    return player.cash >= price
      ? { kind: "buy", playerId }
      : { kind: "decline-buy", playerId };
  }

  if (phase === "auction" && state.turn.auction) {
    const auction = state.turn.auction;
    // Only act if still in, and never bid against our own standing lead — a bot
    // has no reason to jam its own price up (that stays a human move).
    if (!auction.active.includes(playerId)) return null;
    if (auction.leaderId === playerId) return null;
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return null;
    const next = auction.highBid + BID_INCREMENT;
    // v1 valuation: never bid above the printed price, and only what cash
    // covers — an estate lot that's still mortgaged also costs the 10% interest
    // up front.
    const interest =
      auction.resume.kind === "bank-estate" && state.mortgaged[auction.position]
        ? (mortgageInterestAt(auction.position) ?? 0)
        : 0;
    const cap = Math.min(ownablePrice(auction.position) ?? 0, player.cash - interest);
    return next <= cap
      ? { kind: "bid", playerId, amount: next }
      : { kind: "pass-bid", playerId };
  }

  if (phase === "must-raise-cash") {
    if (firstNegativePlayer(state) !== playerId) return null;
    // The canonical value-preserving liquidation step (mortgage cheapest, then
    // sell a built set) — shared with the pacer's must-raise-cash safety default
    // (`bots/fallback.ts`).
    return forcedRaiseStep(state, playerId);
  }

  if (phase === "trade-pending" && pendingTrade) {
    if (!(playerId in pendingTrade.approvals)) return null;
    if (pendingTrade.approvals[playerId]) return null;
    return { kind: "accept-trade", playerId, tradeId: pendingTrade.id };
  }

  return null;
}
