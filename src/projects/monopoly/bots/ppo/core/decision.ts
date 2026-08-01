import type { GameState } from "../../../types";
import type { RlObservation } from "./encode-rl";

/** Who owes a POLICY decision now, and via which head — or `null` when the engine
 *  can mechanically advance (the worker drains those phases itself). Mirrors the
 *  pacer's per-phase "who is consulted", minus the phases with no policy head
 *  (`must-raise-cash`, `raising-cash`, `managing`), which the worker drives
 *  mechanically.
 *
 *  `managing` is deliberately absent: the manage plan is GATED onto the pre-roll
 *  action that arms it, so the intermission opens and closes inside one
 *  `applyAction` and never survives long enough to owe anyone a decision. A
 *  `managing` phase reaching an advance loop is therefore a leak, and both loops
 *  cancel out of it mechanically rather than deadlock. */
export interface Decision {
  seatId: string;
  head: RlObservation["head"];
}

export function pendingDecision(state: GameState): Decision | null {
  if (state.status !== "active") return null;
  const { phase, playerId } = state.turn;
  switch (phase) {
    case "pre-roll":
    case "post-roll":
    case "buy-decision":
    case "jail-decision":
      return { seatId: playerId, head: "global" };
    case "trade-building": {
      const actor = state.turn.tradeDraft?.proposerId;
      return actor === undefined ? null : { seatId: actor, head: "trade" };
    }
    case "auction": {
      const auction = state.turn.auction;
      if (!auction) return null;
      for (const p of state.players) {
        if (!auction.active.includes(p.id) || p.id === auction.leaderId) continue;
        return { seatId: p.id, head: "global" };
      }
      return null;
    }
    case "trade-pending": {
      const pending = state.turn.pendingTrade;
      if (!pending) return null;
      for (const p of state.players) {
        if (!(p.id in pending.approvals) || pending.approvals[p.id]) continue;
        return { seatId: p.id, head: "global" };
      }
      return null;
    }
    // must-raise-cash / raising-cash: no policy head — driven mechanically.
    default:
      return null;
  }
}
