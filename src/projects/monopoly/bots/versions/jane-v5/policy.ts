// ===========================================================================
// jane-v5 policy — Monte Carlo decision-making.
//
// PARADIGM SHIFT: Instead of hand-coding valuations ("is this property worth
// buying?"), we SIMULATE the consequences of each choice and pick the action
// with the highest expected win rate. Forward-looking instead of reactive.
//
// Applied at four decision points:
//   1. BUY — buy vs decline (property acquisition / denial)
//   2. JAIL — pay / card / roll
//   3. AUCTION — bid vs pass
//   4. TRADE VOTE — accept vs decline incoming proposals
//
// Everything else (trade proposal construction, development, forced
// liquidation) uses jane-v3's proven heuristics.
//
// PERF: ~4.5s/game with buy+jail MC. Adding auction+trade MC adds ~1-2s/game
// (these fire less frequently than buy decisions). Engine optimization from
// Kyle would significantly speed this up.
// ===========================================================================
import { janeV3Bot } from "../jane-v3";
import type { GameState } from "../../../types";
import type { BotDecision } from "../../decision";
import {
  monteCarloBuy,
  monteCarloJail,
  monteCarloAuction,
  monteCarloTradeVote,
} from "./montecarlo";

/** jane-v5 — Monte Carlo enhanced. Delegates buy, jail, auction, and trade
 *  vote decisions to MC forward simulation; everything else falls through to
 *  jane-v3's proven policy. */
export function janeV5Bot(state: GameState, playerId: string): BotDecision | null {
  // Try Monte Carlo at the four key decision points.
  if (state.turn.phase === "buy-decision") {
    const mcResult = monteCarloBuy(state, playerId);
    if (mcResult !== null) return mcResult;
  }

  if (state.turn.phase === "jail-decision") {
    const mcResult = monteCarloJail(state, playerId);
    if (mcResult !== null) return mcResult;
  }

  if (state.turn.phase === "auction") {
    const mcResult = monteCarloAuction(state, playerId);
    if (mcResult !== null) return mcResult;
  }

  if (state.turn.phase === "trade-pending") {
    const mcResult = monteCarloTradeVote(state, playerId);
    if (mcResult !== null) return mcResult;
  }

  // Everything else: jane-v3's proven heuristics.
  return janeV3Bot(state, playerId);
}
