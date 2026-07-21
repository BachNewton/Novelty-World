import { BUILDING_REFUND_PERCENT } from "../../data";
import { groupPositions, houseCostAt } from "../../development";
import { hasMonopoly, ownablePrice, rentAt } from "../../logic";
import type { GameState, PropertyColor } from "../../types";
import { applyCandidate, legalCandidates, type Candidate } from "./candidates";
import type { Bot } from "../decision";

// ---------------------------------------------------------------------------
// The hybrid loop, wired end-to-end with a STAND-IN value function.
//
// This is the shape the learned bot will take (see monopoly/CLAUDE.md "Bots" and
// the design discussion). A `Bot` here is just:
//
//     candidates = legalCandidates(state, me)          // the action half
//     pick c maximizing  value(applyCandidate(state, c))   // 1-ply lookahead
//
// where `value` is the only learned piece. Today `value` is `heuristicValue` (a
// small hand-written position score); in Phase 2 it becomes a trained net —
// literally `V(encode(state, me))` using `features.ts` — and NOTHING else in this
// file changes. `valueNetBot(value)` is the factory that makes that swap a
// one-liner; `valueNetStubBot` is it bound to the heuristic so the loop is
// runnable now (`npm run sim -- value-stub claude-v2 claude-v2 claude-v2`).
//
// What the stub demonstrates and what it can't (on purpose):
//   - It plays the REACTIVE surface through pure lookahead: it buys (and prefers
//     set-completing buys, which the monopoly bonus rewards), votes on opponents'
//     trade proposals by comparing accept-vs-decline, settles must-raise-cash, and
//     handles jail — all by scoring the resulting state, no phase-specific rules.
//   - It ABSTAINS from proactive construction (arming a trade/build). That's the
//     Phase-2 heuristic-candidate seam (`candidates.ts` leaves those phases as
//     terminal exits only), so the stub returns `null` there and just rolls.
//   - It drops out of AUCTIONS, and never enters `raising-cash`. Both are multi-
//     step actions whose payoff (winning the lot; completing the deferred buy)
//     only materializes after several more decisions — invisible to a 1-ply
//     lookahead, which sees a placed bid as a no-op (cash isn't spent until the
//     auction resolves). A trained value net hits the same wall; the standard fix
//     is deeper search or learning the action's value directly. Noted so the
//     behavior reads as a known limit of the prototype, not a bug.
// ---------------------------------------------------------------------------

/** The piece a learned model replaces: a scalar "how good is this state for
 *  `playerId`?". Higher is better. The trained version is `V(encode(state, pid))`
 *  (see `features.ts`); everything else in the loop is value-agnostic. */
export type ValueFn = (state: GameState, playerId: string) => number;

/** Printed value of a whole color group (sum of its lots' prices), precomputed
 *  once — the basis of the monopoly-completion bonus below. */
const COLORS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

const GROUP_VALUE: Readonly<Record<PropertyColor, number>> = (() => {
  const m = {} as Record<PropertyColor, number>;
  for (const color of COLORS) {
    m[color] = groupPositions(color).reduce(
      (sum, pos) => sum + (ownablePrice(pos) ?? 0),
      0,
    );
  }
  return m;
})();

/** Premium added for owning a completed color set, as a fraction of the set's
 *  printed value — enough that a set-completing buy/trade scores clearly above a
 *  neutral one, so the stub chases monopolies. A trained net learns its own
 *  premium from outcomes; this just makes the hand stand-in play sensibly. */
const MONOPOLY_BONUS_FRACTION = 0.5;

/** Weight on a property's CURRENT rent — the income engine. Without this the
 *  score only counts recoverable asset value, so DEVELOPING reads as a pure loss
 *  (a $50 house refunds $25) and the bot never builds. Capitalizing rent at a
 *  multiple fixes that: a built monopoly's high rent makes development clearly
 *  worth it. The exact multiple is a rough hand pick — precisely the kind of
 *  thing a TRAINED value learns from outcomes instead of being told. */
const RENT_CAPITALIZATION = 10;

/** Current dollar rent a lander would owe on this owned square (monopoly- and
 *  house-aware); a utility's dice multiplier is approximated at an average roll. */
function rentValue(state: GameState, position: number): number {
  const rent = rentAt(state, position);
  if (!rent) return 0;
  return rent.kind === "dollars" ? rent.amount : rent.multiplier * 7;
}

/** The stand-in value function: a small `positionValue`-style score — cash, plus
 *  each owned deed at its printed price (halved if mortgaged), plus recoverable
 *  building investment, plus a premium per completed color set, plus capitalized
 *  rent (so development and monopolies pay off). Deliberately values a deed at its
 *  full price (not its ~half liquidation value) so that ACQUIRING property is
 *  value-neutral-or-better rather than always a loss — the same reason the real
 *  bots score positions by `positionValue`, not `netWorth`. Bankruptcy is the
 *  terminal worst outcome. */
export function heuristicValue(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  if (player.bankrupt) return -1_000_000;

  let value = player.cash;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== playerId) continue;
    const pos = Number(posStr);
    const price = ownablePrice(pos) ?? 0;
    value += state.mortgaged[pos] ? Math.floor(price / 2) : price;
    const houses = state.houses[pos] ?? 0;
    const houseCost = houseCostAt(pos) ?? 0;
    value += Math.floor((houses * houseCost * BUILDING_REFUND_PERCENT) / 100);
    if (!state.mortgaged[pos]) value += rentValue(state, pos) * RENT_CAPITALIZATION;
  }
  for (const color of COLORS) {
    if (hasMonopoly(state, color, playerId)) {
      value += Math.floor(GROUP_VALUE[color] * MONOPOLY_BONUS_FRACTION);
    }
  }
  return value;
}

/** Score a candidate by 1-ply lookahead: the value of the state it leads to.
 *  A `step` (the mechanical roll) is scored as the STATUS QUO — the current
 *  state's value — rather than by applying it, because rolling is a stochastic
 *  chance node: looking ahead through one random roll would make the decision
 *  swing on dice luck. So "just roll" reads as "no change", and an intent is only
 *  chosen when it beats standing pat. */
function scoreOf(state: GameState, pid: string, op: Candidate["op"], value: ValueFn): number {
  return op.kind === "step" ? value(state, pid) : value(applyCandidate(state, op), pid);
}

function noteFor(best: Candidate, score: number, runnerUp: number): string {
  const against = runnerUp === -Infinity ? "only option" : `next ${Math.round(runnerUp)}`;
  return `value-net stub → ${best.label} (V=${Math.round(score)}, ${against})`;
}

/** Build a `Bot` from a value function: at every decision, enumerate the legal
 *  candidates and pick the one whose resulting state scores highest (1-ply
 *  lookahead). Swap `value` for a trained `V(encode(...))` and this becomes the
 *  learned bot — the loop is identical. Ties break toward the earlier candidate,
 *  which `candidates.ts` orders so the safe/terminating option wins. */
export function valueNetBot(value: ValueFn): Bot {
  return (state, playerId) => {
    const candidates = legalCandidates(state, playerId);
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestScore = scoreOf(state, playerId, best.op, value);
    let runnerUp = -Infinity;
    for (let i = 1; i < candidates.length; i++) {
      const score = scoreOf(state, playerId, candidates[i].op, value);
      if (score > bestScore) {
        runnerUp = bestScore;
        best = candidates[i];
        bestScore = score;
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }

    // Abstain from the mechanical roll and from proactive construction (arming a
    // trade/build) — the latter is the Phase-2 heuristic seam. `null` lets the
    // engine roll / the pacer proceed.
    if (best.op.kind === "step") return null;
    if (best.op.intent.kind === "set-queue") return null;
    return { intent: best.op.intent, note: noteFor(best, bestScore, runnerUp) };
  };
}

/** The runnable stub: the hybrid loop bound to the hand-written value function.
 *  Field it in the simulator via the `value-stub` token
 *  (`npm run sim -- value-stub claude-v2 claude-v2 claude-v2`). */
export const valueNetStubBot: Bot = valueNetBot(heuristicValue);
