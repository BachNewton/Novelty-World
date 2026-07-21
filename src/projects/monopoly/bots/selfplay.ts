import { autoStep, createRng, netWorth, type Rng } from "../engine";
import { freshGame } from "../mocks";
import { driveOp, type DriveOp } from "../pacing";
import type { GameState, PlayerCount } from "../types";
import { encode, MAX_SEATS } from "./features";
import { type Action, ACTION_COUNT, applyCandidate, legalActions } from "./actions";
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
//     the VALUE warm-start AND (state → rule-bot move) for the POLICY IMITATION
//     warm-start. Where the rule bot's move maps 1:1 to a single atomic token
//     (buy/roll/jail/votes/arm — the common reactive decisions), the policy target
//     is a smoothed one-hot on it; where it doesn't (bucketed bids, multi-step
//     trade/manage assembly), it falls back to uniform-over-legal. So gen-0 has a
//     COMPETENT policy prior on the bulk of decisions, not uniform noise — the
//     precondition for self-play to play full games instead of abandoning at turn 1.
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

/** Per-turn discount pulling a state's value target toward the neutral 1/n prior
 *  (RL-DESIGN.md §8 review #4 — the high-variance value target). A state `d` turns
 *  before the game ends trusts the eventual outcome with weight `γ^d` and is 1−γ^d
 *  toward "a coin-flip among the seats". Rationale: an early-game position genuinely
 *  IS close to even — hard-labeling it with the full noise of a 300-turns-later
 *  winner is the single biggest source of value-target variance. At γ=0.99 a state
 *  ~70 turns from the end still trusts the outcome ≥50%; a very early state washes
 *  toward 1/n (true, low-variance). The lever if the value head under/over-commits. */
const VALUE_DISCOUNT_PER_TURN = 0.99;

/** The ABSOLUTE (by-player-index) outcome distribution used as the value signal.
 *  A FINISHED game (a sole survivor) is a one-hot win for that seat. A TRUNCATED
 *  game (turn cap / non-progress stall — the game is NOT decided) must NOT be
 *  hard-labeled by the net-worth leader (RL-DESIGN.md §8 review #4): who leads on
 *  paper at the cap is not who would have won. Instead it's a SOFT distribution —
 *  each survivor's share of the total positive net worth — an honest "these seats
 *  are ahead in proportion to their lead", not a fabricated winner. */
function outcomeDistribution(state: GameState, finished: boolean): Float32Array {
  const n = state.players.length;
  const dist = new Float32Array(n);
  const survivors = state.players
    .map((p, i) => ({ i, p }))
    .filter((x) => !x.p.bankrupt);
  if (finished && survivors.length === 1) {
    dist[survivors[0].i] = 1;
    return dist;
  }
  // Undecided (truncated, or a defensive multi-survivor finish): net-worth share.
  const pool = survivors.length > 0 ? survivors : state.players.map((p, i) => ({ i, p }));
  const worths = pool.map(({ p }) => Math.max(0, netWorth(state, p.id)));
  const total = worths.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const u = 1 / pool.length;
    for (const { i } of pool) dist[i] = u;
  } else {
    pool.forEach(({ i }, k) => (dist[i] = worths[k] / total));
  }
  return dist;
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

/** The seat-relative value target for a record taken by `moverIdx`, `turnsToEnd`
 *  turns before the game ended, given the ABSOLUTE outcome distribution. The
 *  outcome is discounted toward the neutral 1/n prior by `γ^turnsToEnd`
 *  (`VALUE_DISCOUNT_PER_TURN`), then rotated so slot 0 = the mover
 *  (`(i − moverIdx) mod n`). */
function valueTargetFor(
  outcome: Float32Array,
  moverIdx: number,
  n: number,
  turnsToEnd: number,
): Float32Array {
  const v = new Float32Array(MAX_SEATS);
  const w = VALUE_DISCOUNT_PER_TURN ** Math.max(0, turnsToEnd);
  const floor = (1 - w) / n; // the neutral 1/n prior, shared across all seats
  for (let i = 0; i < n; i++) {
    const slot = ((i - moverIdx) % n + n) % n;
    if (slot < MAX_SEATS) v[slot] = w * outcome[i] + floor;
  }
  return v;
}

interface Record {
  encoding: Float32Array;
  policyTarget: Float32Array;
  moverIdx: number;
  turn: number;
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
  // Root exploration is ON for self-play (RL-DESIGN.md §8 review #3): default
  // AlphaZero noise (ε=0.25, α=0.3) unless the caller overrides. Seeded from
  // `state.rngState` inside MCTS, so the game stays reproducible in (net, seed).
  const mctsOpts: MctsOptions = {
    ...opts.mcts,
    dirichlet: opts.mcts?.dirichlet ?? { epsilon: 0.25, alpha: 0.3 },
  };
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
    const full = mctsSearchFull(state, owner, net, mctsOpts);
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
    recs.push({
      encoding: encode(state, owner),
      policyTarget,
      moverIdx,
      turn: state.turns[state.turns.length - 1].turn,
    });

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

  const finished = state.status !== "active";
  const outcome = outcomeDistribution(state, finished);
  const finalTurn = state.turns[state.turns.length - 1].turn;
  return recs.map((r) => ({
    encoding: r.encoding,
    policyTarget: r.policyTarget,
    valueTarget: valueTargetFor(outcome, r.moverIdx, players, finalTurn - r.turn),
  }));
}

export interface RuleGameOptions {
  players?: PlayerCount;
  maxTurns?: number;
}

/** Order-independent canonical serialization, so two structurally-equal intents
 *  compare equal regardless of object-key order. */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const obj = v as { [k: string]: unknown };
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`)
    .join(",")}}`;
}

/** The atomic token whose op EQUALS the rule bot's chosen `op`, or null when the
 *  rule bot's whole-action doesn't correspond 1:1 to a single atomic token
 *  (IMITATION policy warm-start, RL-DESIGN.md §8 #2). A ROLL/step matches the step
 *  token; an intent matches the legal action carrying the identical intent. Flat
 *  reactive moves (buy/decline/jail/votes/arm) match; bucketed bids and multi-step
 *  trade/manage assembly do NOT (the atomic layer expresses them as token
 *  SEQUENCES) → null, and the caller falls back to a uniform-over-legal target.
 *  Matching by identical intent (not by resulting state) can only MISS, never
 *  mis-map — a false negative just costs coverage, never a wrong label. */
function imitationToken(acts: readonly Action[], op: DriveOp): number | null {
  if (op.kind === "step") return acts.find((a) => a.op.kind === "step")?.token ?? null;
  const target = canon(op.intent);
  const match = acts.find((a) => a.op.kind === "intent" && canon(a.op.intent) === target);
  return match?.token ?? null;
}

/** Imitation label weight: the rule bot's move gets `IMITATE_WEIGHT`, the rest of
 *  the legal mass is spread uniformly — a smoothed target, not a hard one-hot, so
 *  gen-0 has a competent-but-not-brittle prior that self-play/MCTS then refines. */
const IMITATE_WEIGHT = 0.9;

/** Play one rule-bot game (every seat `ruleLabel`) and record (state → outcome)
 *  for the value warm-start AND the POLICY imitation warm-start (RL-DESIGN.md §8
 *  #2): each decision's policy target imitates the rule bot's move where it maps to
 *  a single atomic token (a smoothed one-hot), else falls back to uniform-over-legal. */
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
  const recs: {
    encoding: Float32Array;
    legalTokens: number[];
    moverIdx: number;
    turn: number;
    imitateToken: number | null;
  }[] = [];

  for (let i = 0; i < 200_000 && state.status === "active"; i++) {
    if (state.turns[state.turns.length - 1].turn > maxTurns) break;
    const owner = decisionOwner(state);
    const acts = owner !== null ? legalActions(state, owner) : [];
    // The op is the rule bot's chosen move at THIS decision (owner's, when there is
    // one) — computed before recording so its atomic token is the imitation target.
    const op = driveOp(state, true, null);
    if (op === null) break;
    if (owner !== null && acts.length > 0) {
      recs.push({
        encoding: encode(state, owner),
        legalTokens: acts.map((a) => a.token),
        moverIdx: state.players.findIndex((p) => p.id === owner),
        turn: state.turns[state.turns.length - 1].turn,
        imitateToken: imitationToken(acts, op),
      });
    }
    const next = applyCandidate(
      state,
      op.kind === "step" ? { kind: "step" } : { kind: "intent", intent: op.intent },
    );
    if (next === state) break;
    state = next;
  }

  const finished = state.status !== "active";
  const outcome = outcomeDistribution(state, finished);
  const finalTurn = state.turns[state.turns.length - 1].turn;
  return recs.map((r) => {
    const policyTarget = new Float32Array(ACTION_COUNT);
    if (r.imitateToken !== null) {
      // IMITATION target: IMITATE_WEIGHT on the rule bot's move, the rest spread
      // uniformly over legal tokens (sums to 1 — a smoothed one-hot).
      const spread = (1 - IMITATE_WEIGHT) / r.legalTokens.length;
      for (const t of r.legalTokens) policyTarget[t] = spread;
      policyTarget[r.imitateToken] += IMITATE_WEIGHT;
    } else {
      // No 1:1 atomic token for the rule bot's whole-action → uniform-over-legal.
      const u = 1 / r.legalTokens.length;
      for (const t of r.legalTokens) policyTarget[t] = u;
    }
    return {
      encoding: r.encoding,
      policyTarget,
      valueTarget: valueTargetFor(outcome, r.moverIdx, players, finalTurn - r.turn),
    };
  });
}
