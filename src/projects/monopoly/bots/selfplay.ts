import { autoStep, createRng, netWorth, type Rng } from "../engine";
import { freshGame } from "../mocks";
import { driveOp } from "../pacing";
import type { GameState, PlayerCount } from "../types";
import { encode, MAX_SEATS } from "./features";
import { ACTION_COUNT, applyCandidate, legalActions } from "./actions";
import type { MonoNet, TrainSample } from "./net";
import { decisionOwner, mctsSearchFull, type MctsOptions } from "./mcts";

// ---------------------------------------------------------------------------
// Phase 6 of the learned-bot path (RL-DESIGN.md §3.4 / §5 step 6), part 1: the
// SELF-PLAY RECORDER and the VALUE BOOTSTRAP. This is what the "turn it on and
// walk away" trainer (`train-cli.ts`) calls to generate experience.
//
//   - `playSelfPlayGame`: plays one game where every decision is chosen by MCTS
//     over the current net, RECORDING at each move (encode(state, mover), the MCTS
//     visit distribution as the policy target, the mover seat). At game end every
//     record is labelled with the outcome → a seat-relative value target. Early
//     moves SAMPLE from the visit counts (exploration); later moves play greedy —
//     so games vary, which is what self-play needs to discover strategy.
//
//   - `collectRuleGame`: plays a rule-bot game and records (state → outcome) for
//     the VALUE warm-start. The policy target is uniform-over-legal — the rule
//     bot's whole-action moves don't map cleanly onto atomic tokens, but its
//     OUTCOMES are exactly the value signal that keeps gen-0 from being random
//     (RL-DESIGN.md §3.4 step 5: "bootstrap … states→outcomes for value"). Policy
//     imitation is a later enhancement.
//
// DETERMINISM: a game is reproducible from its seed — the MCTS internals seed from
// `state.rngState`, and the exploration sampler is a single seeded `Rng`. Two runs
// with the same (net, seed) produce identical samples.
// ---------------------------------------------------------------------------

export interface SelfPlayOptions {
  players?: PlayerCount;
  maxTurns?: number;
  mcts?: MctsOptions;
  /** Plies that SAMPLE from the visit counts before switching to greedy play. */
  explorationMoves?: number;
}

/** A stable 32-bit seed from a string (for the exploration RNG). */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The winning seat index: the sole survivor if the game finished, else (a draw
 *  at the turn cap) the current net-worth leader — a noisy-but-directional label
 *  for an unfinished game. Returns -1 if the table is empty. */
function winnerIndex(state: GameState): number {
  const survivors = state.players
    .map((p, i) => ({ i, p }))
    .filter((x) => !x.p.bankrupt);
  if (survivors.length === 1) return survivors[0].i;
  let best = -1;
  let bestWorth = -Infinity;
  for (const { i, p } of survivors.length > 0 ? survivors : state.players.map((p, i) => ({ i, p }))) {
    const w = netWorth(state, p.id);
    if (w > bestWorth) {
      bestWorth = w;
      best = i;
    }
  }
  return best;
}

/** Sample an index in proportion to visit counts (exploration). Falls back to a
 *  uniform pick when all counts are zero. */
function sampleByVisits(visits: readonly number[], rng: Rng): number {
  const total = visits.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(rng.next() * visits.length);
  let r = rng.next() * total;
  for (let i = 0; i < visits.length; i++) {
    r -= visits[i];
    if (r < 0) return i;
  }
  return visits.length - 1;
}

/** The seat-relative outcome one-hot for a record taken by `moverIdx` in an
 *  `n`-player game won by `winnerIdx`. Slot 0 = the mover; the winner lands at
 *  `(winnerIdx - moverIdx) mod n`. */
function valueTargetFor(winnerIdx: number, moverIdx: number, n: number): Float32Array {
  const v = new Float32Array(MAX_SEATS);
  if (winnerIdx >= 0) {
    const slot = ((winnerIdx - moverIdx) % n + n) % n;
    if (slot < MAX_SEATS) v[slot] = 1;
  }
  return v;
}

interface Record {
  encoding: Float32Array;
  policyTarget: Float32Array;
  moverIdx: number;
}

/** Play one self-play game with MCTS-over-`net`, returning the labelled training
 *  samples (one per recorded decision). */
export function playSelfPlayGame(
  net: MonoNet,
  seed: string,
  opts: SelfPlayOptions = {},
): TrainSample[] {
  const players = opts.players ?? 4;
  const maxTurns = opts.maxTurns ?? 1000;
  const explorationMoves = opts.explorationMoves ?? 20;
  const rng = createRng(hashSeed(seed));
  let state = freshGame(seed, undefined, players);
  const recs: Record[] = [];
  let plies = 0;
  // TURN-STALL GUARD. `maxTurns` only fires when the TURN COUNTER advances — but a
  // weak (early-training) net can pick a cycle of decisions that never advances the
  // turn (e.g. arm-trade → cancel → arm-trade…), so the turn cap never triggers and
  // the game loops forever (it hung a 10-worker run for 10 min). If too many
  // decisions pass without the turn number rising, the game is stuck — abandon it
  // (its records are still valid training data up to the stall). A real turn resolves
  // in a handful of decisions, so this never truncates a legitimate game.
  let lastTurn = state.turns[state.turns.length - 1].turn;
  let stallPlies = 0;
  const MAX_STALL_PLIES = 400;

  while (state.status === "active") {
    if (state.turns[state.turns.length - 1].turn > maxTurns) break;
    const owner = decisionOwner(state);
    if (owner === null || legalActions(state, owner).length === 0) {
      const next = autoStep(state).state;
      if (next === state) break;
      state = next;
      continue;
    }
    const full = mctsSearchFull(state, owner, net, opts.mcts);
    if (full === null) break;
    const moverIdx = state.players.findIndex((p) => p.id === owner);

    const policyTarget = new Float32Array(ACTION_COUNT);
    const total = full.visits.reduce((a, b) => a + b, 0);
    if (total > 0) {
      full.actions.forEach((a, i) => (policyTarget[a.token] = full.visits[i] / total));
    } else {
      const u = 1 / full.actions.length;
      full.actions.forEach((a) => (policyTarget[a.token] = u));
    }
    recs.push({ encoding: encode(state, owner), policyTarget, moverIdx });

    const choice = plies < explorationMoves ? sampleByVisits(full.visits, rng) : full.best;
    const next = applyCandidate(state, full.actions[choice].op);
    if (next === state) break; // the chosen move made no progress — abandon the game
    state = next;
    plies += 1;

    const curTurn = state.turns[state.turns.length - 1].turn;
    if (curTurn > lastTurn) {
      lastTurn = curTurn;
      stallPlies = 0;
    } else if (++stallPlies > MAX_STALL_PLIES) {
      break; // many decisions, no turn advance ⇒ a non-progressing cycle
    }
  }

  const winner = winnerIndex(state);
  return recs.map((r) => ({
    encoding: r.encoding,
    policyTarget: r.policyTarget,
    valueTarget: valueTargetFor(winner, r.moverIdx, players),
  }));
}

export interface RuleGameOptions {
  players?: PlayerCount;
  maxTurns?: number;
}

/** Play one rule-bot game (every seat `ruleLabel`) and record (state → outcome)
 *  for the VALUE warm-start. Policy targets are uniform-over-legal. */
export function collectRuleGame(
  seed: string,
  ruleLabel: string,
  opts: RuleGameOptions = {},
): TrainSample[] {
  const players = opts.players ?? 4;
  const maxTurns = opts.maxTurns ?? 1000;
  const base = freshGame(seed, undefined, players);
  // Every seat plays `ruleLabel`; the default driver resolves it via the registry.
  let state: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: ruleLabel })),
  };
  const recs: { encoding: Float32Array; legalTokens: number[]; moverIdx: number }[] = [];

  for (let i = 0; i < 200_000 && state.status === "active"; i++) {
    if (state.turns[state.turns.length - 1].turn > maxTurns) break;
    const owner = decisionOwner(state);
    if (owner !== null) {
      const acts = legalActions(state, owner);
      if (acts.length > 0) {
        recs.push({
          encoding: encode(state, owner),
          legalTokens: acts.map((a) => a.token),
          moverIdx: state.players.findIndex((p) => p.id === owner),
        });
      }
    }
    const op = driveOp(state, true, null);
    if (op === null) break;
    const next = applyCandidate(
      state,
      op.kind === "step" ? { kind: "step" } : { kind: "intent", intent: op.intent },
    );
    if (next === state) break;
    state = next;
  }

  const winner = winnerIndex(state);
  return recs.map((r) => {
    const policyTarget = new Float32Array(ACTION_COUNT);
    const u = 1 / r.legalTokens.length;
    for (const t of r.legalTokens) policyTarget[t] = u;
    return {
      encoding: r.encoding,
      policyTarget,
      valueTarget: valueTargetFor(winner, r.moverIdx, players),
    };
  });
}
