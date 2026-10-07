import type { AiDecision, GameState, Intent, TradeTerms } from "../../../types";
import type { Settled } from "../decide";
import type { AiResolution } from "../spec";

// A scenario is one hand-made position where an AI seat owes one decision, and
// a check on what it decided. Checks read the decision as intents (what the
// version's answer became), never a version's own answer fields, so the same
// scenario measures every version.

export type Phase = "early" | "mid" | "late";

export interface Verdict {
  pass: boolean;
  reason: string;
}

/** What one answer amounted to: the state the model was asked about, its
 *  parsed answer, the version's reading of it, and the shared settle step's
 *  outcome (the state it left, when it committed). */
export interface Outcome {
  asked: GameState;
  seat: string;
  answer: Record<string, unknown>;
  resolution: AiResolution | null;
  settled: Settled;
}

export interface Scenario {
  id: string;
  phase: Phase;
  decision: AiDecision;
  /** What judgement this position tests, and why the check's line is where it
   *  is. */
  tests: string;
  /** The position, with every seat played by `strategy`. */
  build: (strategy: string) => GameState;
  check: (outcome: Outcome) => Verdict;
}

export const pass = (reason: string): Verdict => ({ pass: true, reason });
export const fail = (reason: string): Verdict => ({ pass: false, reason });

/** The intents the answer became, in order. */
export function intentsOf(o: Outcome): Intent[] {
  return (o.resolution?.ops ?? []).flatMap((op) => (op.kind === "intent" ? [op.intent] : []));
}

export function did(o: Outcome, kind: Intent["kind"]): boolean {
  return intentsOf(o).some((i) => i.kind === kind);
}

/** The state the answer left, or null when it didn't commit. */
export function after(o: Outcome): GameState | null {
  return o.settled.kind === "commit" ? o.settled.state : null;
}

export function cashOf(state: GameState, seat: string): number {
  const player = state.players.find((p) => p.id === seat);
  if (!player) throw new Error(`no seat ${seat}`);
  return player.cash;
}

/** The trade the answer put on the table (a proposal or a counter), or null. */
export function proposedTerms(o: Outcome): TradeTerms | null {
  const state = after(o);
  return state?.turn.phase === "trade-pending" && state.turn.pendingTrade?.proposerId === o.seat
    ? state.turn.pendingTrade
    : null;
}

/** Houses added across `positions` (a hotel counts as five). */
export function housesAdded(o: Outcome, positions: readonly number[]): number {
  const state = after(o);
  if (!state) return 0;
  return positions.reduce((sum, pos) => sum + (state.houses[pos] ?? 0) - (o.asked.houses[pos] ?? 0), 0);
}

/** Every answer must at least be usable: an answer the settle step failed is a
 *  failed scenario whatever it chose, with the reason it failed. */
export function settledOr(o: Outcome, check: () => Verdict): Verdict {
  if (o.settled.kind === "fail") return fail(`unusable answer: ${o.settled.reason}`);
  if (o.settled.kind === "stale") return fail("the answer went stale against its own position");
  return check();
}
