import {
  colorAt,
  developmentLevel,
  groupPositions,
  houseCostAt,
} from "../development";
import { BID_INCREMENT, firstNegativePlayer, JAIL_FEE } from "../engine";
import {
  heldJailCard,
  mortgageInterestAt,
  mortgageValueAt,
  ownablePrice,
} from "../logic";
import type { GameState, Intent, PropertyColor } from "../types";

/** Baseline bot policy: the decision a bot `playerId` should submit right now,
 *  or null if it isn't this bot's move. The store's auto-pacer iterates the bot
 *  seats and submits the first non-null intent; any connected client may proxy
 *  a bot (the route's version guard dedupes the redundant writes). A live
 *  human's own decisions are left to their UI — never to this policy.
 *
 *  Pure, same shape as the `Bot` interface sketched in `monopoly/CLAUDE.md`, so
 *  a smarter rule-based or learned policy can drop in later. Covers the
 *  proxy-driven decision phases:
 *  - `buy-decision`: buy whenever affordable, otherwise decline.
 *  - `auction`: while still in and not the standing leader, raise by
 *    `BID_INCREMENT` if the next bid stays within both the printed price and what
 *    cash covers, else drop. Bots never jam their own lead. v1 placeholder —
 *    TODO: net-worth bidding + real valuation.
 *  - `must-raise-cash`: if this bot is the current debtor (whoever is in the
 *    red, possibly out of turn after a trade), mortgage the cheapest
 *    un-mortgaged, building-free property — one per call until back to ≥ 0 —
 *    then, once nothing's left to mortgage, sell off a built set's buildings.
 *  - `trade-pending`: if this bot is an un-voted party, accept. v1 placeholder
 *    — permissive, no valuation. TODO: weigh the trade before accepting.
 *  - `jail-decision`: leave ASAP — a held Get-Out-of-Jail-Free card first (it's
 *    free), else pay the $50 fine when affordable, else `null` so the pacer
 *    issues the jail roll (gamble on doubles).
 *
 *  Mechanical phases (`pre-roll` → step, `post-roll` → end-turn) are handled by
 *  the pacer itself, not here. */
export function botIntent(state: GameState, playerId: string): Intent | null {
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
    // up front. (TODO: net-worth bidding + a real valuation that weighs sets,
    // railroads, and denying opponents.)
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
    // Mortgage building-free properties first (cheapest first), sparing
    // developed monopolies as long as possible.
    const toMortgage = cheapestMortgageable(state, playerId);
    if (toMortgage !== null) {
      return { kind: "mortgage", playerId, position: toMortgage };
    }
    // Only developed property is left — sell a built set's buildings. Without
    // this the debtor stalls (a built property can't be mortgaged), so the
    // forced phase would never clear.
    return sellCheapestBuiltSet(state, playerId);
  }

  if (phase === "trade-pending" && pendingTrade) {
    if (!(playerId in pendingTrade.approvals)) return null;
    if (pendingTrade.approvals[playerId]) return null;
    return { kind: "accept-trade", playerId, tradeId: pendingTrade.id };
  }

  return null;
}

/** Position of the cheapest un-mortgaged, building-free property the player
 *  owns, or null if none can be mortgaged. Cheapest first preserves the more
 *  valuable assets for as long as possible — pure heuristic, swap in a real
 *  policy when bots learn. */
function cheapestMortgageable(
  state: GameState,
  playerId: string,
): number | null {
  let best: { pos: number; value: number } | null = null;
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    if (ownerId !== playerId) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (state.houses[pos]) continue;
    const value = mortgageValueAt(pos);
    if (value === null) continue;
    if (!best || value < best.value) best = { pos, value };
  }
  return best?.pos ?? null;
}

/** A `manage` intent that liquidates the cheapest color set the player has
 *  built on — every property in it back to a bare lot — or null if they have
 *  no buildings. The forced raise-cash branch of `applyManage` applies it and
 *  re-checks the debt, so the bot just keeps returning these (and mortgages)
 *  until settled. Selling a whole set to zero is always supply-feasible (the
 *  planner's liquidation escape covers any hotel shortage). v1 heuristic: a
 *  whole set at a time, cheapest first to spare pricier development — a smarter
 *  policy can sell more granularly. */
function sellCheapestBuiltSet(
  state: GameState,
  playerId: string,
): Intent | null {
  const builtColors = new Set<PropertyColor>();
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    if (ownerId !== playerId) continue;
    if (!developmentLevel(state, Number(posStr))) continue;
    const color = colorAt(Number(posStr));
    if (color) builtColors.add(color);
  }
  let cheapest: PropertyColor | null = null;
  let cheapestCost = Infinity;
  for (const color of builtColors) {
    const cost = houseCostAt(groupPositions(color)[0]) ?? Infinity;
    if (cost < cheapestCost) {
      cheapestCost = cost;
      cheapest = color;
    }
  }
  if (cheapest === null) return null;
  const build: Record<number, number> = {};
  for (const pos of groupPositions(cheapest)) build[pos] = 0;
  return { kind: "manage", playerId, build, mortgage: {} };
}
