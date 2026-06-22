// ===========================================================================
// trade-v1 OPPONENT MODEL — per-player subjective valuation with online learning.
//
// Kyle's design: "we learn going forward what trades are approved and rejected
// to give us insight into how close our eval is to what they actually value."
//
// Each opponent gets a calibrated EvalWeights profile. Initially all default
// (rational actor). Every trade accept/reject is a data point that adjusts the
// weights to better predict that player's future behavior. Over time:
//   - Bots (deterministic) converge to their exact valuation function
//   - Humans converge to their psychological profile (tight/loose, biases)
//
// The model lives per-game (instance-scoped). Cross-game persistence is a
// future enhancement once the per-game loop is validated.
// ===========================================================================
import type { TradeTerms } from "../../../types";
import type { EvalWeights } from "./eval";
import { DEFAULT_WEIGHTS } from "./eval";

/** A single observed accept/reject data point for calibration. */
interface TradeObservation {
  /** The player whose behavior was observed. */
  playerId: string;
  /** The trade terms they were offered. */
  terms: TradeTerms;
  /** Did they accept? */
  accepted: boolean;
  /** Our predicted eval delta for them at the time (what we thought they'd value). */
  predictedDelta: number;
  /** Game turn when observed. */
  turn: number;
}

/** Per-player calibration state. */
interface PlayerCalibration {
  weights: EvalWeights;
  observations: TradeObservation[];
}

/** The opponent model — tracks calibrated weights for every player in the game.
 *  One instance per game. The bot owns one for SELF (always default — we know
 *  our own valuation) and one per opponent (learned). */
export class OpponentModel {
  private calibrations: Map<string, PlayerCalibration> = new Map();

  /** Get the current best-guess weights for a player. Falls back to default
   *  if we haven't observed them yet. */
  getWeights(playerId: string): EvalWeights {
    const cal = this.calibrations.get(playerId);
    return cal ? { ...cal.weights } : { ...DEFAULT_WEIGHTS };
  }

  /** Record an accept/reject observation and recalibrate. This is the LEARNING
   *  LOOP — each data point adjusts our model of that player's valuation. */
  observe(
    playerId: string,
    terms: TradeTerms,
    accepted: boolean,
    predictedDelta: number,
    turn: number,
  ): void {
    let cal = this.calibrations.get(playerId);
    if (!cal) {
      cal = { weights: { ...DEFAULT_WEIGHTS }, observations: [] };
      this.calibrations.set(playerId, cal);
    }
    cal.observations.push({ playerId, terms, accepted, predictedDelta, turn });

    // Recalibrate after each observation using accumulated data points.
    this.recalibrate(playerId);
  }

  /** Adjust weights to better predict observed behavior. Simple gradient-free
   *  heuristic: if we predicted they'd reject (delta < threshold) but they
   *  accepted, they're LOOSER — lower their threshold or increase their weight
   *  on the factors the trade favored. Vice versa for unexpected rejections. */
  private recalibrate(playerId: string): void {
    const cal = this.calibrations.get(playerId);
    if (!cal || cal.observations.length < 1) return;

    const w = { ...cal.weights };

    for (const obs of cal.observations) {
      const predictedAccept = obs.predictedDelta >= w.acceptThreshold;
      if (obs.accepted && !predictedAccept) {
        // They accepted when we thought they wouldn't → they're looser.
        // Lower their threshold (they'll take smaller gains).
        w.acceptThreshold = Math.max(1, w.acceptThreshold * 0.9);
      } else if (!obs.accepted && predictedAccept) {
        // They rejected when we thought they'd accept → they're tighter.
        // Raise their threshold (they need bigger gains to say yes).
        w.acceptThreshold = Math.min(200, w.acceptThreshold * 1.15);
      }
    }

    cal.weights = w;
  }

  /** How confident are we in our model of this player? More observations = more
   *  confidence. Used to decide exploration vs exploitation. */
  confidence(playerId: string): number {
    const cal = this.calibrations.get(playerId);
    if (!cal) return 0;
    // Confidence ramps with observations, capped at 1.0 after ~10 data points.
    return Math.min(1.0, cal.observations.length / 10);
  }

  /** Should we explore (probe their thresholds with a borderline offer) or
   *  exploit (offer exactly what our model says they'll take)? Early game with
   *  low confidence → explore; late game with high confidence → exploit. */
  shouldExplore(playerId: string): boolean {
    return this.confidence(playerId) < 0.3;
  }

  /** Predict whether a player would accept a trade with the given eval delta,
   *  based on our current model of their weights. */
  wouldAccept(playerId: string, evalDelta: number): boolean {
    const w = this.getWeights(playerId);
    return evalDelta >= w.acceptThreshold;
  }
}
