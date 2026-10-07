import { auctionBidCap, BID_INCREMENT, firstNegativePlayer, hasPendingBoundary } from "../../engine";
import type { AiDecision, GameState, Intent } from "../../types";
import { isAiSeat } from "./profiles";
import { aiSeat, currentTurnNumber } from "./seat";
import { turnStartOwed } from "./turn-start";

/** The decision an AI seat owes a model call for right now, or null when it owes
 *  nothing (or isn't an AI seat). One function decides it for both the pacer
 *  (whether to ask the route) and the route (what to ask the model), so the two
 *  can't disagree. It mirrors where the pacer consults a rule-based bot, except:
 *  - the seat's own turn start (its `pre-roll`, or its `jail-decision` before
 *    the jail choice) is one "turn-start" question, asked at most once per
 *    turn-group and skipped when nothing relevant changed (`turnStartOwed`);
 *    the seat never arms at anyone else's boundary;
 *  - an auction asks once, for a maximum, then the pacer bids for it
 *    (`auctionProxyIntent`), so a seat that already answered owes nothing here.
 *  `raise-to-buy`, `manage` and `trade-build` can't arise while the seat opens
 *  every intermission it uses and closes it in the same write; they are named so
 *  that reaching one fails loudly in the route instead of stalling silently. */
export function aiDecisionFor(state: GameState, seat: string): AiDecision | null {
  if (state.status !== "active" || !isAiSeat(state, seat)) return null;
  const turn = state.turn;
  const active = turn.playerId === seat;
  switch (turn.phase) {
    case "pre-roll":
      return active && !hasPendingBoundary(state) && turnStartOwed(state, seat)
        ? "turn-start"
        : null;
    case "jail-decision":
      if (!active || hasPendingBoundary(state)) return null;
      return turnStartOwed(state, seat) ? "turn-start" : "jail";
    case "buy-decision":
      return active ? "buy" : null;
    case "raising-cash":
      return active ? "raise-to-buy" : null;
    case "must-raise-cash":
      return firstNegativePlayer(state) === seat ? "settle-debt" : null;
    case "trade-pending": {
      const pending = turn.pendingTrade;
      if (!pending || !(seat in pending.approvals)) return null;
      return pending.approvals[seat] ? null : "trade-vote";
    }
    case "auction": {
      const auction = turn.auction;
      if (!auction || !auction.active.includes(seat) || auction.leaderId === seat) {
        return null;
      }
      return currentAuctionMax(state, seat) === null ? "auction" : null;
    }
    case "managing":
      return turn.managerId === seat ? "manage" : null;
    case "trade-building":
      return turn.tradeDraft?.proposerId === seat ? "trade-build" : null;
    case "post-roll":
    case "game-over":
      return null;
  }
}

/** The seat's answered maximum for the auction now running, or null if it
 *  hasn't been asked about this one. */
export function currentAuctionMax(state: GameState, seat: string): number | null {
  const auction = state.turn.auction;
  const max = aiSeat(state, seat).auctionMax;
  if (!auction || !max) return null;
  const sameAuction =
    max.position === auction.position && max.turn === currentTurnNumber(state);
  return sameAuction ? max.max : null;
}

/** The bid (or drop) an AI seat makes on its own in an auction it has already
 *  answered a maximum for: one increment over the high bid, never past its
 *  maximum or what it can pay, and a drop once it's outbid past that. Null when
 *  the seat isn't a non-leading bidder with a maximum for this auction. */
export function auctionProxyIntent(state: GameState, seat: string): Intent | null {
  const auction = state.turn.auction;
  if (state.turn.phase !== "auction" || !auction) return null;
  if (!auction.active.includes(seat) || auction.leaderId === seat) return null;
  const max = currentAuctionMax(state, seat);
  if (max === null) return null;
  const ceiling = Math.min(max, auctionBidCap(state, seat));
  const amount = Math.min(auction.highBid + BID_INCREMENT, ceiling);
  if (amount > auction.highBid && amount >= BID_INCREMENT) {
    return { kind: "bid", playerId: seat, amount };
  }
  return { kind: "pass-bid", playerId: seat };
}
