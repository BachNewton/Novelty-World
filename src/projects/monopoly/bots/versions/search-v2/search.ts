// ===========================================================================
// search-v1 — the SEARCH LAYER (a new PARADIGM for the archive).
//
// Every prior bot (claude-vN, jane-vN, gemini-vN, trade-v1) is a GREEDY 1-ply
// deterministic value-maximizer: at a decision it commits the single move that
// maximizes its hand-written `positionValue` right now. search-v1 is the first
// bot that LOOKS AHEAD. At a few high-leverage discrete decisions it performs a
// TRUNCATED-ROLLOUT search (Tesauro's TD-Gammon rollout policy improvement):
//
//   1. Enumerate a small candidate set of legal actions (the base policy's own
//      greedy choice ALWAYS included).
//   2. For each candidate, apply it, then roll the game FORWARD with ALL seats
//      (including this one at future turns) playing the BASE claude-v38 policy,
//      dice/cards sampled from a seeded RNG, for a bounded horizon of turns.
//   3. Leaf evaluation: terminal => win=1 / loss=0 for me; else my positionValue
//      SHARE among active players (a smooth [0,1] heuristic).
//   4. Average over R seeded rollout samples; pick the best-mean candidate.
//
// WHY IT'S SAFE (the trade-v1 trap avoidance): the base policy's greedy move is
// always a candidate, so rollout improvement can only MATCH or BEAT it — it never
// loses capability. A negative/EVEN result is still a clean finding.
//
// DETERMINISM (non-negotiable): all rollout randomness derives from
// `state.rngState`. Each rollout sample seeds a fresh `rngState` deterministically
// from the base state's `rngState` and the sample index (via `createRng`), so the
// played move is a pure function of state. No `Math.random`, no `Date`.
// ===========================================================================
import { apply, autoStep, createRng } from "../../../engine";
import { driveOp, type BotResolver } from "../../../pacing";
import type { GameState, Intent } from "../../../types";
import { positionValue, baseBot } from "./base";

/** Number of seeded rollout samples averaged per candidate. Bounded for compute:
 *  a horizon-30 rollout costs ~0.7ms, so R=12 × ≤4 candidates ≈ 30ms per searched
 *  decision (a 2-search-seat gauntlet pairing runs ~0.6s/game single-threaded). */
export const ROLLOUT_SAMPLES = 12;

/** Truncated-rollout horizon, in TURNS played forward from the candidate's
 *  resulting state before the leaf is evaluated (or terminal if it comes first).
 *
 *  THIS IS THE LOAD-BEARING PARAMETER. A SHORT horizon (10–20 turns) makes the
 *  bot LOSE to greedy claude-v38 (~37–40% win share): buying a lot lowers my
 *  positionValue SHARE immediately (cash out, plus opponents keep earning), while
 *  the rent/monopoly payoff only registers after the board cycles a few times —
 *  so a short-horizon leaf systematically prefers DECLINING (hoarding cash), the
 *  exact passive play the project fights. At ~30 turns the rent payoff lands
 *  inside the horizon and the verdict flips: search-v1 BEATS claude-v38. Measured
 *  sweet spot; see the FINDINGS report's horizon sweep. */
export const ROLLOUT_HORIZON = 30;

/** Hard safety cap on engine ops inside a single rollout, so a pathological
 *  stall can never hang the search. Far above a normal horizon-10 run. */
const ROLLOUT_OP_CAP = 4000;

/** The base claude-v38 policy fields EVERY seat during a rollout — that's what
 *  makes this rollout POLICY IMPROVEMENT over the base: we evaluate "what happens
 *  if, after this candidate, everyone (me included) reverts to greedy play." */
const baseResolver: BotResolver = () => baseBot;

/** Apply one driver op exactly as the authoritative route / headless sim does: a
 *  `step` is one `autoStep`; an intent rides with its `bot-note` as one atomic
 *  submit. Pure — rng threads through `state.rngState`. */
function applyOp(
  state: GameState,
  op: NonNullable<ReturnType<typeof driveOp>>,
): GameState {
  if (op.kind === "step") return autoStep(state).state;
  let next = state;
  if (op.note !== undefined) {
    const noteIntent: Intent = {
      kind: "bot-note",
      playerId: op.intent.playerId,
      text: op.note,
    };
    const noted = apply(next, noteIntent);
    if (noted.ok) next = noted.state;
  }
  const result = apply(next, op.intent);
  if (!result.ok) {
    // A rollout drives only the base policy, whose moves are legal by
    // construction; a rejection means a deeper invariant broke, so surface it.
    throw new Error(`rollout op "${op.intent.kind}" rejected: ${result.reason}`);
  }
  return result.state;
}

/** Leaf evaluation of a (possibly truncated) rollout state from `pid`'s seat,
 *  mapped to [0,1]. A finished game is a clean win (1) / loss (0). A truncated
 *  leaf uses my `positionValue` SHARE among the active (non-bankrupt) players —
 *  a smooth proxy for win probability that already encodes monopolies, cash, and
 *  synergy through the base policy's own yardstick. */
function leafValue(state: GameState, pid: string): number {
  if (state.status === "finished") {
    const me = state.players.find((p) => p.id === pid);
    // The sole survivor is the winner; everyone else busted.
    return me && !me.bankrupt ? 1 : 0;
  }
  let mine = 0;
  let total = 0;
  for (const p of state.players) {
    if (p.bankrupt) continue;
    // positionValue can dip slightly negative in deep debt; clamp so the share
    // stays a well-defined [0,1] weight.
    const v = Math.max(0, positionValue(state, p.id));
    if (p.id === pid) mine = v;
    total += v;
  }
  if (total <= 0) return 0;
  return mine / total;
}

/** Roll one game forward from `state` for `horizon` turns (or to terminal),
 *  every seat driven by the base policy, then return the leaf value for `pid`.
 *  `state` must already carry the per-sample rngState (set by the caller). Pure
 *  and deterministic in `state`. */
function rolloutOnce(state: GameState, pid: string, horizon: number): number {
  const startTurn = state.turns[state.turns.length - 1].turn;
  let cur = state;
  let ops = 0;
  while (cur.status === "active" && ops < ROLLOUT_OP_CAP) {
    const turnNo = cur.turns[cur.turns.length - 1].turn;
    if (turnNo - startTurn >= horizon) break;
    const op = driveOp(cur, true, null, baseResolver);
    if (op === null) break; // no drive op — treat the current board as the leaf
    const next = applyOp(cur, op);
    if (next === cur) break; // no progress — avoid spinning
    cur = next;
    ops += 1;
  }
  return leafValue(cur, pid);
}

/** A fresh `rngState` derived deterministically from a base `rngState` and a
 *  sample index — independent rollout dice/cards per sample, zero `Math.random`.
 *  Two `createRng` draws de-correlate adjacent (rngState, sample) pairs. */
function sampleRngState(baseRngState: number, sample: number): number {
  const rng = createRng((baseRngState ^ (sample * 0x9e3779b1)) >>> 0);
  rng.next();
  return rng.getState();
}

/** Mean leaf value of driving `afterState` forward under the base policy across
 *  `samples` seeded rollouts. This is the score search assigns a candidate. */
export function scoreState(
  afterState: GameState,
  pid: string,
  samples: number = ROLLOUT_SAMPLES,
  horizon: number = ROLLOUT_HORIZON,
): number {
  // If the candidate already settled the game, the value is exact — no sampling.
  if (afterState.status === "finished") return leafValue(afterState, pid);
  if (samples <= 0) return 0; // no rollout budget → no information (a defined tie)
  let sum = 0;
  for (let s = 0; s < samples; s++) {
    const seeded: GameState = {
      ...afterState,
      rngState: sampleRngState(afterState.rngState, s),
    };
    sum += rolloutOnce(seeded, pid, horizon);
  }
  return sum / samples;
}

/** A candidate the search ranks: the intent to play and the state it leads to,
 *  plus whether it's the base policy's own greedy choice (the safety anchor) and
 *  a short label for the reasoning note. */
export interface SearchCandidate {
  intent: Intent;
  afterState: GameState;
  isBaseChoice: boolean;
  label: string;
}

export interface SearchResult {
  best: SearchCandidate;
  baseScore: number;
  bestScore: number;
  /** Per-candidate mean scores, for the reasoning note / tests. */
  scores: { label: string; score: number; isBaseChoice: boolean }[];
}

/** Score every candidate by rollout and pick the best mean. TIE-BREAK TOWARD THE
 *  BASE CHOICE: a candidate only displaces the greedy move if it scores STRICTLY
 *  higher (by a small margin), so within rollout noise the bot plays exactly like
 *  claude-v38 — search can only add value, never trade it away to noise. */
export function searchBest(
  candidates: readonly SearchCandidate[],
  pid: string,
  samples: number = ROLLOUT_SAMPLES,
  horizon: number = ROLLOUT_HORIZON,
): SearchResult {
  const scored = candidates.map((c) => ({
    cand: c,
    score: scoreState(c.afterState, pid, samples, horizon),
  }));
  const baseEntry =
    scored.find((s) => s.cand.isBaseChoice) ?? scored[0];
  const baseScore = baseEntry.score;

  // Margin (in win-share units) a non-base candidate must beat the base by to be
  // preferred — a small dead-band that absorbs rollout sampling noise so the bot
  // doesn't chase a fractional, likely-spurious edge over the proven greedy move.
  const MARGIN = 0.01;

  let best = baseEntry;
  for (const s of scored) {
    if (s.cand.isBaseChoice) continue;
    if (s.score > best.score + (best.cand.isBaseChoice ? MARGIN : 0)) {
      best = s;
    }
  }
  return {
    best: best.cand,
    baseScore,
    bestScore: best.score,
    scores: scored.map((s) => ({
      label: s.cand.label,
      score: s.score,
      isBaseChoice: s.cand.isBaseChoice,
    })),
  };
}
