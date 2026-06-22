// ===========================================================================
// trade-v1 CALIBRATION RECONSTRUCTOR — rebuilds opponent model from game history.
//
// Since the Bot interface is a pure function (state, playerId) => BotDecision,
// we can't hold mutable state across calls. Instead, we reconstruct the
// OpponentModel from the turn history in GameState each time. Every past trade
// accept/decline is a calibration data point we can extract.
// ===========================================================================
import type { GameState, TradeTerms } from "../../../types";
import { OpponentModel } from "./opponent-model";

/** Reconstruct an OpponentModel from the game's turn history. Every past trade
 *  event (accept or decline) is fed into the model as a calibration data point.
 *
 *  For accepted trades: ALL participants implicitly accepted (the trade only
 *  fires if nobody declines). We record each participant's "accept" observation.
 *  For declined trades: the decliner's "reject" observation.
 *
 *  The predicted delta at the time is recomputed from the pre-trade state, which
 *  we reconstruct by "undoing" the trade from the current state isn't possible
 *  (we don't have snapshots). Instead, we use the trade event's own terms
 *  against a simplified state model — the delta from the trade terms themselves.
 *  This is approximate but sufficient for calibration (we just need the sign and
 *  rough magnitude to adjust thresholds). */
export function reconstructModel(state: GameState): OpponentModel {
  const model = new OpponentModel();

  for (let i = 0; i < state.turns.length; i++) {
    const turn = state.turns[i];
    for (const e of turn.events) {
      if (e.kind === "trade") {
        // Accepted trade — all participants said yes. Record accepts for each.
        // The trade event carries the terms (propertyTo, gojfTo, cashDelta).
        const terms: TradeTerms = {
          propertyTo: { ...e.propertyTo },
          gojfTo: { ...e.gojfTo },
          cashDelta: { ...e.cashDelta },
        };
        // All players who gave or received something are participants.
        const participants = new Set<string>();
        for (const to of Object.values(terms.propertyTo)) participants.add(to);
        for (const to of Object.values(terms.gojfTo)) participants.add(to);
        for (const pid of Object.keys(terms.cashDelta)) participants.add(pid);

        // We can't perfectly reconstruct the pre-trade state from here, but
        // we CAN compute what each participant's eval delta would have been
        // using a simplified model (cash + asset changes). The exact delta
        // doesn't matter for calibration — just the direction and rough size.
        for (const pid of participants) {
          const cashChange = terms.cashDelta[pid] ?? 0;
          // Properties received (positive) and given (handled by cash).
          // A rough proxy: did they receive more in cash+assets than they gave?
          // For calibration purposes, record a positive delta for acceptors.
          model.observe(pid, terms, true, Math.max(cashChange, 50), i);
        }
      } else if (e.kind === "trade-declined") {
        // Declined trade — record the decliner's rejection.
        const terms: TradeTerms = {
          propertyTo: { ...e.propertyTo },
          gojfTo: { ...e.gojfTo },
          cashDelta: { ...e.cashDelta },
        };
        const cashChange = terms.cashDelta[e.declinedBy] ?? 0;
        // Record a negative or marginal delta prediction (we thought they'd
        // maybe accept but they declined).
        model.observe(e.declinedBy, terms, false, Math.min(cashChange, 20), i);
      }
    }
  }

  return model;
}
