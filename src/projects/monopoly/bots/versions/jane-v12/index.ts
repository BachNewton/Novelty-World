// jane-v12 — MONTE CARLO at BUILD + TRADE on the jane-v6 substrate.
//
// The first architectural departure from the jane-v6 evaluation framework.
// Six versions (v7-v11) beat the entire external panel but couldn't separate
// from jane-v6 in self-play (49.9-50.4%) — the self-play wall is structural
// for heuristic-only changes. jane-v12 replaces the heuristic DECISION at two
// critical points with forward-simulation search:
//
//   MC-BUILD (managing phase): Instead of accepting jane-v6's planBuild output
//       blindly, generate candidate plans (heuristic, no-build, conservative,
//       aggressive), MC-evaluate each via 10 rollouts of 50 turns, and pick
//       the one with the highest expected win rate.
//
//   MC-TRADE (trade-pending phase): Instead of jane-v6's evaluateTrade
//       heuristic, simulate accept vs decline via 10 rollouts of 50 turns.
//
// All other decisions (buy, auction, jail, trade PROPOSAL construction,
// raising cash, etc.) use jane-v6's heuristics unchanged.
//
// Rollout policy: jane-v6 for all players (no recursive MC).
//
// This is a WRAPPER, not a ParamVector variant — MC can't be expressed as a
// param knob. The wrapper delegates to janeV6Bot for all phases except
// managing and trade-pending, where it intercepts and runs MC.
//
// First version evaluated under NEW PROMOTION CRITERIA:
//   (1) No regression vs base in mirror (EVEN/50% OK)
//   (2) Must beat the field (panel — all BETTER, no WORSE)

import type { Bot, BotDecision } from "../../decision";
import type { GameState } from "../../../types";
import { janeV6Bot } from "../jane-v6";
import { mcBuild, mcTradeVote } from "./montecarlo";

/** jane-v12: MC wrapper around jane-v6. Intercepts managing and trade-pending
 *  phases with Monte Carlo search; delegates everything else to jane-v6. */
export function janeV12Bot(state: GameState, playerId: string): BotDecision | null {
  const phase = state.turn.phase;

  // --- MC-BUILD: managing phase ---
  // Get jane-v6's heuristic decision first. If v6 has no build to do (returns
  // null), we're done. If v6 has a plan, run MC to see if a variant does better.
  if (phase === "managing") {
    const heuristic = janeV6Bot(state, playerId);
    if (heuristic === null) return null;

    // Only MC-evaluate if there's an actual build (not just an empty manage).
    if (heuristic.intent.kind === "manage" && Object.keys(heuristic.intent.build).length > 0) {
      const mcResult = mcBuild(state, playerId, heuristic);
      // Use MC result if available; fall back to heuristic on MC failure.
      if (mcResult !== null) return mcResult;
    }

    // No build or MC failed — use jane-v6's heuristic.
    return heuristic;
  }

  // --- MC-TRADE: trade-pending phase ---
  if (phase === "trade-pending") {
    // Verify this player actually needs to vote.
    const pending = state.turn.pendingTrade;
    if (!pending || !(playerId in pending.approvals) || pending.approvals[playerId]) {
      return janeV6Bot(state, playerId);
    }

    const mcResult = mcTradeVote(state, playerId);
    if (mcResult !== null) return mcResult;

    // MC failed — fall back to jane-v6's heuristic trade evaluation.
    return janeV6Bot(state, playerId);
  }

  // --- Everything else: delegate to jane-v6 unchanged ---
  return janeV6Bot(state, playerId);
}
