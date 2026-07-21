import type { GameState } from "../types";
import { applyCandidate, type CandidateOp } from "./candidates";
import { legalActions, type Action } from "./actions";
import { heuristicValue, type ValueFn } from "./value-net-stub";
import type { Bot } from "./decision";

// ---------------------------------------------------------------------------
// Phase 3 of the learned-bot path (RL-DESIGN.md §5 step 3): a `Bot` that plays
// through the ATOMIC ACTION VOCABULARY (`actions.ts`), greedy over a value
// function by 1-ply lookahead. It is to the atomic layer what `value-net-stub.ts`
// is to the whole-action layer: a wiring proof that the fixed token vocabulary
// drives full, only-legal games end to end, BEFORE any net exists. Swap
// `heuristicValue` for `V(encode(state, me))` and this is a (search-free) learned
// bot. Field it via the `token-stub` sim token.
//
// What it shows, and its DELIBERATE limits (same wall as the whole-action stub):
//   - It plays the reactive surface — buy/decline, must-raise-cash liquidation,
//     trade votes, jail — purely by scoring the resulting state, via the atomic
//     mask. No phase-specific rules; the vocabulary is the only interface.
//   - It does NOT arm trades/builds or raise-to-buy. Those are MULTI-TOKEN
//     sequences (arm → assign/stage → propose/commit) whose payoff only lands
//     several decisions later — invisible to a 1-ply greedy, which sees the first
//     token (arming, staging a mortgage) as a value-neutral no-op. So this bot
//     abstains from STARTING them, exactly as `value-net-stub` abstains from the
//     whole-action equivalents. Unlocking proactive construction is the job of
//     SEARCH (MCTS, RL-DESIGN.md §3.2), not a deeper-than-1-ply hand rule. The
//     atomic layer's capacity to ASSEMBLE those sequences is proven in
//     `actions.test.ts`; here we prove it drives a legal game.
// ---------------------------------------------------------------------------

/** Score an action by 1-ply lookahead. A `step` (mechanical roll) is scored as
 *  the STATUS QUO — rolling is a stochastic chance node, so looking through one
 *  random roll would swing the decision on dice luck; "just roll" reads as "no
 *  change", and an intent is chosen only when it beats standing pat. */
function scoreOf(state: GameState, pid: string, op: CandidateOp, value: ValueFn): number {
  return op.kind === "step" ? value(state, pid) : value(applyCandidate(state, op), pid);
}

/** Actions this greedy bot won't START: proactively arming a trade/build
 *  (`set-queue`) or entering the multi-step raise-to-buy (`raise-cash`). Their
 *  value is only visible to search, not 1-ply lookahead — so they're removed from
 *  consideration rather than chosen and stalled. */
function isProactiveStart(op: CandidateOp): boolean {
  if (op.kind === "step") return false;
  return op.intent.kind === "set-queue" || op.intent.kind === "raise-cash";
}

function noteFor(best: Action, score: number, runnerUp: number): string {
  const against = runnerUp === -Infinity ? "only option" : `next ${Math.round(runnerUp)}`;
  return `token bot → ${best.label} (V=${Math.round(score)}, ${against})`;
}

/** Build a `Bot` that plays via the atomic vocabulary, picking the legal token
 *  whose resulting state scores highest (1-ply). Swap `value` for a trained
 *  `V(encode(...))` to get a search-free learned bot — the loop is identical. */
export function tokenValueBot(value: ValueFn): Bot {
  return (state, playerId) => {
    const actions = legalActions(state, playerId).filter((a) => !isProactiveStart(a.op));
    if (actions.length === 0) return null;

    let best = actions[0];
    let bestScore = scoreOf(state, playerId, best.op, value);
    let runnerUp = -Infinity;
    for (let i = 1; i < actions.length; i++) {
      const score = scoreOf(state, playerId, actions[i].op, value);
      if (score > bestScore) {
        runnerUp = bestScore;
        best = actions[i];
        bestScore = score;
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }

    // Standing pat (the mechanical roll wins) → let the engine roll.
    if (best.op.kind === "step") return null;
    return { intent: best.op.intent, note: noteFor(best, bestScore, runnerUp) };
  };
}

/** The runnable proof: the atomic-vocabulary loop bound to the hand value.
 *  Field it via the `token-stub` sim token
 *  (`npm run sim -- token-stub claude-v2 claude-v2 claude-v2`). */
export const tokenStubBot: Bot = tokenValueBot(heuristicValue);
