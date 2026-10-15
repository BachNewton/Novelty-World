import type { ClientState as SharedClientState, SyncEvent as SharedSyncEvent, SyncRules } from "@/shared/lib/client-sync";
import { apply, type Engine } from "../engine/step-loop";
import type { Action, GameEvent, GameState } from "../types";

/*
 * Betrayal's binding of the shared client sync (`@/shared/lib/client-sync`):
 * an action applies through the built engine, names the decision or ready
 * wait it answers, and is held by a state whose ledger names it.
 */

export type ClientState = SharedClientState<GameState, Action, GameEvent>;
export type SyncEvent = SharedSyncEvent<GameState, Action>;

/** Two actions are the same answer when they answer the same pause for the same seat. */
export function sameAnswer(a: Action, b: Action): boolean {
  if (a.kind === "ready" && b.kind === "ready") return a.wait === b.wait && a.seat === b.seat;
  if (a.kind === "choose" && b.kind === "choose") return a.decision === b.decision && a.seat === b.seat;
  return false;
}

/** Whether a state already holds an action: the decision's ledger names its
 *  answer, or the seat is no longer waited on for that ready wait. */
function included(state: GameState, action: Action): boolean {
  if (action.kind === "choose") return state.answered.some((answer) => answer.decision === action.decision && answer.seat === action.seat);
  const pending = state.pending;
  return !(pending?.type === "ready" && pending.id === action.wait && pending.seats.includes(action.seat));
}

export function syncRules(engine: Engine): SyncRules<GameState, Action, GameEvent> {
  return {
    apply: (state, action) => apply(engine, state, action),
    sameAnswer,
    included,
    lastEvents: (state) => state.lastEvents,
    eventId: (event) => event.id,
  };
}
