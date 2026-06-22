import type { GameState, TradeTerms, GameEvent, CardSource } from "../../../types";
import { positionValue } from "./valuation";

/**
 * Observation-based opponent model for trade-v2.
 *
 * Kyle's principle: "We don't care what eval THEY use, we just know OURS is
 * the best. We figure out their eval by offering trades and seeing what they
 * say yes and no to."
 *
 * For each opponent we maintain an accept threshold: the minimum positionValue
 * delta (from OUR perspective on THEIR behalf) that we've observed them accept.
 * No other bot's logic is used — pure observation.
 */

interface Observation {
  ourEvalDelta: number;
  accepted: boolean;
  turn: number;
}

interface PlayerModel {
  observations: Observation[];
  threshold: number;
}

const INITIAL_THRESHOLD = 30;
const THRESHOLD_FLOOR = 5;
const MAX_OBS = 20;

export class OpponentModel {
  private models = new Map<string, PlayerModel>();

  /** Reconstruct models from the game's trade history. */
  reconstruct(state: GameState, pid: string): void {
    this.models.clear();
    for (const turn of state.turns) {
      for (const event of turn.events) {
        if (event.kind === "trade") {
          for (const [, toId] of Object.entries(event.propertyTo)) {
            if (toId === pid) continue;
            const terms = this.eventToTerms(event);
            this.recordFromTerms(state, toId, terms, turn.turn, true);
          }
        } else if (event.kind === "trade-declined") {
          const decliner = event.declinedBy;
          if (decliner === pid) continue;
          const terms = this.eventToTerms(event);
          this.recordFromTerms(state, decliner, terms, turn.turn, false);
        }
      }
    }
  }

  /** Convert a GameEvent into TradeTerms. */
  private eventToTerms(event: GameEvent): TradeTerms {
    const e = event as Extract<GameEvent, { kind: "trade" | "trade-declined" }>;
    return {
      propertyTo: { ...e.propertyTo } as Record<number, string>,
      gojfTo: { ...e.gojfTo } as Partial<Record<CardSource, string>>,
      cashDelta: { ...e.cashDelta } as Record<string, number>,
    };
  }

  /** Record an observation for a player. */
  private recordFromTerms(
    state: GameState,
    playerId: string,
    terms: TradeTerms,
    turn: number,
    accepted: boolean,
  ): void {
    const ourEvalDelta = this.ourEvalFor(state, playerId, terms);
    let model = this.models.get(playerId);
    if (!model) {
      model = { observations: [], threshold: INITIAL_THRESHOLD };
      this.models.set(playerId, model);
    }
    model.observations.push({ ourEvalDelta, accepted, turn });
    if (model.observations.length > MAX_OBS) {
      model.observations.shift();
    }
    this.recalibrate(playerId);
  }

  /** What OUR positionValue says a trade is worth to a given player. */
  ourEvalFor(state: GameState, playerId: string, terms: TradeTerms): number {
    const after = this.postTradeState(state, terms);
    return positionValue(after, playerId) - positionValue(state, playerId);
  }

  /** Apply trade terms to state (clone). */
  private postTradeState(state: GameState, terms: TradeTerms): GameState {
    const ownership = { ...state.ownership };
    for (const [posStr, toId] of Object.entries(terms.propertyTo)) {
      ownership[Number(posStr)] = toId;
    }
    const players = state.players.map((p) => ({
      ...p,
      cash: p.cash + (terms.cashDelta[p.id] ?? 0),
    }));
    return { ...state, ownership, players };
  }

  /** Adjust threshold based on observations. */
  private recalibrate(playerId: string): void {
    const model = this.models.get(playerId);
    if (!model || model.observations.length === 0) return;

    let highestAccept = -Infinity;
    let lowestReject = Infinity;

    for (const obs of model.observations) {
      if (obs.accepted) {
        highestAccept = Math.max(highestAccept, obs.ourEvalDelta);
      } else {
        lowestReject = Math.min(lowestReject, obs.ourEvalDelta);
      }
    }

    if (highestAccept > -Infinity && lowestReject < Infinity) {
      model.threshold = Math.max(THRESHOLD_FLOOR, highestAccept + 1);
    } else if (highestAccept > -Infinity) {
      const lowestAccept = Math.min(
        ...model.observations.filter((o) => o.accepted).map((o) => o.ourEvalDelta),
      );
      model.threshold = Math.max(THRESHOLD_FLOOR, Math.min(lowestAccept, INITIAL_THRESHOLD));
    } else if (lowestReject < Infinity) {
      const highestReject = Math.max(
        ...model.observations.filter((o) => !o.accepted).map((o) => o.ourEvalDelta),
      );
      model.threshold = Math.max(INITIAL_THRESHOLD, highestReject + 10);
    }
  }

  /** Would this player accept a trade with the given OUR-eval delta? */
  wouldAccept(playerId: string, ourEvalDelta: number): boolean {
    const model = this.models.get(playerId);
    const threshold = model ? model.threshold : INITIAL_THRESHOLD;
    return ourEvalDelta >= threshold;
  }

  /** Get the current estimated threshold for a player. */
  getThreshold(playerId: string): number {
    const model = this.models.get(playerId);
    return model ? model.threshold : INITIAL_THRESHOLD;
  }
}
