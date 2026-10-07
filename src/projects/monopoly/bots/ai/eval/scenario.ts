import { SPACES } from "../../../data";
import type { AiDecision, GameState, Intent, TradeTerms } from "../../../types";
import type { Settled } from "../decide";
import type { AiResolution } from "../spec";

// A scenario is one hand-made position where an AI seat owes one decision.
//
// Scenarios are a TOOL, not the truth: the suite finds errors fast, but only
// real games decide whether a version plays better. So a scenario never grades
// a choice strong players could reasonably differ on. Each one is one of two
// kinds:
//
// - `error`: an objective mistake is possible here, and `error` names it when it
//   happens: a move no strong player would make (selling below what a mortgage
//   pays, terms whose cash runs the wrong way, breaking up houses when spare lots
//   cover the debt). These are gated: a version should make none.
// - `judgment`: strong players could differ. The scenario only RECORDS what the
//   seat chose (`choose`), and the scoreboard reports the spread across
//   repetitions. It is never pass or fail.
//
// Either kind counts an unusable answer (one the settle step rejects) as an
// error, since that is never a matter of taste. Checks read the decision as
// intents, never a version's own answer fields, so one scenario measures every
// version. Error scenarios come with disguised variants (other sets, seats and
// cash), so a fix that only learned the original position shows up.

export type Phase = "early" | "mid" | "late";
export type ScenarioKind = "error" | "judgment";

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
  kind: ScenarioKind;
  phase: Phase;
  decision: AiDecision;
  /** What the position tests, and, for an error scenario, why its error is
   *  objective. */
  tests: string;
  /** The position, with every seat played by `strategy`. */
  build: (strategy: string) => GameState;
  /** A short label for what the seat chose ("buy", "max $450", "decline"),
   *  so choices tally across repetitions. */
  choose: (outcome: Outcome) => string;
  /** For an error scenario: the objective mistake in this answer, or null. */
  error?: (outcome: Outcome) => string | null;
}

/** A scenario's verdict on one answer. Only `error` counts against a version. */
export interface Judged {
  kind: ScenarioKind;
  choice: string;
  error: string | null;
}

/** Judge one answer: an unusable answer is an error in any scenario; otherwise
 *  record the choice, and run the error check if the scenario has one. */
export function judge(scenario: Scenario, o: Outcome): Judged {
  if (o.settled.kind === "fail") {
    return { kind: scenario.kind, choice: "unusable", error: `unusable answer: ${o.settled.reason}` };
  }
  if (o.settled.kind === "stale") {
    return { kind: scenario.kind, choice: "stale", error: "the answer went stale against its own position" };
  }
  return { kind: scenario.kind, choice: scenario.choose(o), error: scenario.error?.(o) ?? null };
}

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

/** The seat's cash after the answer (its cash before, if it didn't commit). */
export function cashAfter(o: Outcome): number {
  return cashOf(after(o) ?? o.asked, o.seat);
}

/** The trade the answer put on the table (a proposal or a counter), or null. */
export function proposedTerms(o: Outcome): TradeTerms | null {
  const state = after(o);
  return state?.turn.phase === "trade-pending" && state.turn.pendingTrade?.proposerId === o.seat
    ? state.turn.pendingTrade
    : null;
}

/** Cash the seat receives under the terms it put on the table (negative = it
 *  pays). */
export function cashIn(o: Outcome): number {
  return proposedTerms(o)?.cashDelta[o.seat] ?? 0;
}

/** Whether the terms the seat put on the table give `position` away. */
export function gives(o: Outcome, position: number): boolean {
  const terms = proposedTerms(o);
  return terms !== null && position in terms.propertyTo && terms.propertyTo[position] !== o.seat;
}

/** Whether the terms bring `position` to the seat. */
export function takes(o: Outcome, position: number): boolean {
  return proposedTerms(o)?.propertyTo[position] === o.seat;
}

/** Houses added across `positions` (a hotel counts as five; negative = sold). */
export function housesAdded(o: Outcome, positions: readonly number[]): number {
  const state = after(o);
  if (!state) return 0;
  return positions.reduce((sum, pos) => sum + (state.houses[pos] ?? 0) - (o.asked.houses[pos] ?? 0), 0);
}

/** A square's name, for choice labels. */
export function nameOf(position: number): string {
  const space = SPACES[position];
  return "name" in space ? space.name : `#${String(position)}`;
}

/** Terms in a few words, from the seat's side: what it gives, what it takes,
 *  and the cash it receives or pays. */
export function describeTerms(o: Outcome): string {
  const terms = proposedTerms(o);
  if (!terms) return "nothing";
  const entries = Object.entries(terms.propertyTo).map(([pos, to]) => [Number(pos), to] as const);
  const giving = entries.filter(([pos, to]) => to !== o.seat && o.asked.ownership[pos] === o.seat).map(([pos]) => nameOf(pos));
  const taking = entries.filter(([, to]) => to === o.seat).map(([pos]) => nameOf(pos));
  const cash = cashIn(o);
  const parts = [
    giving.length > 0 ? `gives ${giving.join(" + ")}` : null,
    taking.length > 0 ? `takes ${taking.join(" + ")}` : null,
    cash > 0 ? `gets $${String(cash)}` : cash < 0 ? `pays $${String(-cash)}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(", ") : "an empty trade";
}

/** What a turn-start answer did: houses built, mortgages lifted, a proposal. */
export function describeTurnStart(o: Outcome): string {
  const state = after(o);
  if (!state) return "nothing";
  const mine = Object.entries(o.asked.ownership).filter(([, owner]) => owner === o.seat).map(([pos]) => Number(pos));
  const houses = housesAdded(o, mine);
  const lifted = mine.filter((pos) => o.asked.mortgaged[pos] && !state.mortgaged[pos]).length;
  const mortgaged = mine.filter((pos) => !o.asked.mortgaged[pos] && state.mortgaged[pos]).length;
  const parts = [
    houses !== 0 ? `${houses > 0 ? "builds" : "sells"} ${String(Math.abs(houses))}` : null,
    lifted > 0 ? `lifts ${String(lifted)}` : null,
    mortgaged > 0 ? `mortgages ${String(mortgaged)}` : null,
    proposedTerms(o) ? `proposes (${describeTerms(o)})` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? `${parts.join(", ")}; keeps $${String(cashAfter(o))}` : "nothing";
}
