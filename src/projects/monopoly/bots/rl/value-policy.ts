import type { BotDecision } from "../decision";
import type { GameState, Intent, TradeTerms } from "../../types";
import type { Bot } from "../decision";
import { applyCandidate, legalCandidates } from "./candidates";
import { bestTrade } from "./trade-search";
import { heuristicValue, valueNetBot, type ValueFn } from "./value-net-stub";

// ---------------------------------------------------------------------------
// The full-capability hybrid agent — the value-net stub grown so the model
// controls the WHOLE legal action surface, not just the reactive subset (see
// monopoly/CLAUDE.md "Bots" and the design discussion).
//
// It is `valueNetBot` (the score-candidates loop) plus one thing the loop can't
// express on its own: OPENING an intermission. Constructing a build/trade happens
// inside a `managing` / `trade-building` window, but a 1-ply lookahead on the ARM
// that opens that window sees a no-op (arming changes nothing yet), so it would
// never arm. So this layer makes the structural decision to open the window, and
// once inside, the ordinary value loop picks the best commit from the candidates
// `candidates.ts` now generates there (e.g. the develop-to-level build commits).
//
// "Open the window" is a STRUCTURAL gate (here: "is there a beneficial trade?"
// via the search, or "is a build even possible?"), not a hardcoded value judgment
// — the value function decides WHAT to trade/build (or to cancel if nothing
// helps). The pacer's per-turn-group `boundaryServed` guard means each window is
// offered at most once, so this can't loop the turn boundary. A trade window is
// preferred over a build window: completing a set is the prerequisite to
// developing it, and after a trade resolves, the same turn-group's next pre-roll
// can open a BUILD window on the freshly-completed set — trade-then-build in one
// turn.
//
// Slices wired so far: reactive decisions (via `valueNetBot`) + DEVELOPMENT (arm
// `manage` → pick the best build commit) + TRADE CONSTRUCTION (arm `trade` →
// `trade-search.ts` builds the draft → propose). Next: raise-to-buy / auction
// willingness (the deferred-payoff cluster), each adding a generator and, if it
// needs a window, an arm here.
// ---------------------------------------------------------------------------

/** The state as if `pid` had a `managing` window open — used to ask the REAL
 *  build generator (`candidates.ts`) what it would offer, so the arm decision
 *  exactly predicts the in-window decision (no separate structural guess to drift
 *  from it). */
function managingHypothetical(state: GameState, pid: string): GameState {
  return {
    ...state,
    turn: {
      playerId: pid,
      phase: "managing",
      managerId: pid,
      doublesStreak: state.turn.doublesStreak,
      manageStaged: { build: {}, mortgage: {} },
      boundaryServed: state.turn.boundaryServed,
    },
  };
}

/** Would opening a build window actually lead to a build? True iff some legal
 *  build commit scores above standing pat — exactly the test the value loop runs
 *  inside `managing`. Gating the arm on this (rather than a loose "owns a
 *  developable set") stops the agent from opening a window every turn only to
 *  cancel when it can't afford / wouldn't benefit. */
function developmentImproves(state: GameState, pid: string, value: ValueFn): boolean {
  const hypo = managingHypothetical(state, pid);
  const base = value(hypo, pid);
  for (const c of legalCandidates(hypo, pid)) {
    if (c.op.kind !== "intent" || c.op.intent.kind !== "manage") continue;
    if (value(applyCandidate(hypo, c.op), pid) > base) return true;
  }
  return false;
}

/** Already opened a window of this kind this turn-group? (Mirrors the pacer's
 *  `boundaryServed` guard so we don't re-arm what we've already used.) */
function alreadyServed(state: GameState, pid: string, kind: "trade" | "manage"): boolean {
  return (state.turn.boundaryServed ?? []).some(
    (e) => e.playerId === pid && e.kind === kind,
  );
}

/** Is a `kind` window already queued for `pid`? (A redundant arm is a no-op.) */
function alreadyQueued(state: GameState, pid: string, kind: "trade" | "manage"): boolean {
  return state.boundaryQueue.some((e) => e.playerId === pid && e.kind === kind);
}

/** The proactive arm to open this turn, or null to just roll. Prefer a TRADE
 *  window when a beneficial deal exists (completing a set precedes developing it),
 *  else a BUILD window when development is possible — each gated to once per
 *  turn-group (`boundaryServed`). */
function armToOpen(state: GameState, pid: string, value: ValueFn): Intent | null {
  if (
    !alreadyQueued(state, pid, "trade") &&
    !alreadyServed(state, pid, "trade") &&
    bestTrade(state, pid, value) !== null
  ) {
    return { kind: "set-queue", playerId: pid, queue: "trade", armed: true };
  }
  if (
    !alreadyQueued(state, pid, "manage") &&
    !alreadyServed(state, pid, "manage") &&
    developmentImproves(state, pid, value)
  ) {
    return { kind: "set-queue", playerId: pid, queue: "manage", armed: true };
  }
  return null;
}

/** Canonical string of a trade's moves, so a draft can be compared to the target
 *  the search wants (drive `update-trade-draft` only until they match). */
function termsKey(terms: TradeTerms): string {
  const entries = (o: object): string =>
    Object.entries(o)
      .map(([k, v]) => `${k}=${String(v)}`)
      .sort()
      .join(",");
  return `p[${entries(terms.propertyTo)}]g[${entries(terms.gojfTo)}]c[${entries(terms.cashDelta)}]`;
}

/** Drive an open `trade-building` intermission toward a proposal: build the draft
 *  the search wants, then propose it; cancel if nothing is worth proposing now. */
function driveTradeBuilding(state: GameState, pid: string, value: ValueFn): BotDecision {
  const draft = state.turn.tradeDraft;
  const target = bestTrade(state, pid, value);
  if (!target || !draft) {
    return { intent: { kind: "cancel-trade", playerId: pid }, note: "value policy → no worthwhile trade" };
  }
  if (termsKey(draft) !== termsKey(target.terms)) {
    return {
      intent: { kind: "update-trade-draft", playerId: pid, terms: target.terms },
      note: `value policy → ${target.note}`,
    };
  }
  return { intent: { kind: "propose-trade", playerId: pid } };
}

/** Build a full-capability `Bot` from a value function: open intermissions when
 *  there's something to construct (trade / build), drive a trade-building window
 *  via the search, and otherwise defer to the value-scored candidate loop (which
 *  also picks build commits once inside `managing`). Swap `value` for a trained
 *  `V(encode(...))` and this is the learned agent. */
export function valuePolicyBot(value: ValueFn): Bot {
  const loop = valueNetBot(value);
  return (state, playerId) => {
    if (state.status !== "active") return loop(state, playerId);
    const { phase, playerId: active, tradeDraft } = state.turn;

    if (phase === "pre-roll" && active === playerId) {
      const arm = armToOpen(state, playerId, value);
      if (arm) {
        const kind = arm.kind === "set-queue" ? arm.queue : "manage";
        return { intent: arm, note: `value policy → open ${kind} window` };
      }
    }
    if (phase === "trade-building" && tradeDraft?.proposerId === playerId) {
      return driveTradeBuilding(state, playerId, value);
    }
    return loop(state, playerId);
  };
}

/** The runnable full-capability agent, bound to the hand-written value function.
 *  Field it via the `value-policy` sim token
 *  (`npm run sim -- value-policy claude-v2 claude-v2 claude-v2`). */
export const valuePolicyStubBot: Bot = valuePolicyBot(heuristicValue);
