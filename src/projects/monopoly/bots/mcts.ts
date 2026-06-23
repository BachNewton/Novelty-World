import { autoStep, createRng, firstNegativePlayer, netWorth } from "../engine";
import type { GameState } from "../types";
import { encode, MAX_SEATS } from "./features";
import { applyCandidate, legalActions, type Action } from "./actions";
import { maskPolicy, type MonoNet } from "./net";
import type { Bot } from "./decision";

// ---------------------------------------------------------------------------
// Phase 5 of the learned-bot path (RL-DESIGN.md §3.2 / §5 step 5): MCTS over the
// atomic action layer, guided by the policy + value net. It turns the net into a
// player by searching: at each decision it runs N simulations of select → expand
// → backup, then plays the most-visited root action.
//
// THE ENGINE MAKES CHANCE CLEAN. The engine is pure with the RNG carried IN the
// state (`state.rngState`), so every transition is a deterministic function of the
// state. Two consequences:
//   - DETERMINISTIC edges (an intent): `applyCandidate` then drive mechanical
//     autoSteps to the next decision. Cached as a persistent child — the tree
//     grows through a player's discrete decision sequence (arm → assign → propose,
//     build commits, buy).
//   - CHANCE edges (the ROLL / mechanical `step`): the dice come from the state's
//     rngState. To get an EXPECTATION over dice (not one fixed roll), a ROLL edge
//     RESEEDS the rng per visit (a seed derived deterministically from the node +
//     visit count) and evaluates the freshly-sampled post-roll state with the net.
//     Over many visits the edge's value averages over dice — RL-DESIGN's "MCTS
//     averages over simulations", with NO engine change.
//
// DETERMINISM (non-negotiable, RL-DESIGN.md §3.2 + §6): every seed derives from
// the root `state.rngState`, and the played move is the most-visited action
// (greedy, no exploration noise at inference). So the move is a pure function of
// (state, net) — replay-safe, a proper `Bot`. Stochastic exploration (Dirichlet
// noise, sampling) belongs to TRAINING only and is injected by the self-play
// driver, not here.
//
// N-PLAYER CREDIT. The net's value head is a seat-relative win-probability vector
// (slot 0 = the node's mover). At expansion it's mapped into an ABSOLUTE frame
// (by player index, fixed for the game), so backup can credit each node's own
// mover regardless of whose turn the leaf was — the correct multi-player update.
//
// PERF NOTE: this is a correctness-first MCTS — one net eval per expansion (not
// yet batched across the tree) and `legalActions` recomputed per node. Both are
// the obvious throughput levers (batch leaf evals; memoize the action mask) when
// self-play speed becomes the bottleneck. Keep `simulations` modest until then.
// ---------------------------------------------------------------------------

/** Exploration constant in PUCT — higher widens the search toward the prior. */
const DEFAULT_C_PUCT = 1.5;
/** Default simulations per move. Deliberately modest (self-play throughput is the
 *  constraint); raise as the value matures / inference is batched. */
const DEFAULT_SIMULATIONS = 40;
/** Safety bound on the mechanical drive between decisions. */
const DRIVE_GUARD = 2000;

export interface MctsOptions {
  simulations?: number;
  cPuct?: number;
}

/** The player who owns the decision at `state`, by phase — cheap (no
 *  `legalActions` scan). Returns null at a non-decision / finished state.
 *  Exported for the self-play / bootstrap drivers. */
export function decisionOwner(state: GameState): string | null {
  const t = state.turn;
  switch (t.phase) {
    case "must-raise-cash":
      return firstNegativePlayer(state);
    case "trade-pending": {
      const pend = t.pendingTrade;
      if (!pend) return null;
      for (const p of state.players) {
        if (p.id in pend.approvals && !pend.approvals[p.id]) return p.id;
      }
      return null;
    }
    case "auction": {
      const a = t.auction;
      if (!a) return null;
      for (const p of state.players) {
        if (a.active.includes(p.id) && a.leaderId !== p.id) return p.id;
      }
      return null;
    }
    case "managing":
      return t.managerId ?? null;
    case "trade-building":
      return t.tradeDraft?.proposerId ?? null;
    case "pre-roll":
    case "post-roll":
    case "buy-decision":
    case "raising-cash":
    case "jail-decision":
      return t.playerId;
    case "game-over":
      return null;
    default:
      return null;
  }
}

/** Drive mechanical autoSteps until SOME player owes a real decision (or the game
 *  ends). Deterministic: autoStep only rolls dice at pre-roll/jail, which ARE
 *  decisions (ROLL is an action), so this never consumes a chance event — it only
 *  resolves the deterministic tail after an intent. */
function advanceToDecision(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < DRIVE_GUARD && s.status === "active"; i++) {
    const owner = decisionOwner(s);
    if (owner !== null && legalActions(s, owner).length > 0) break;
    const next = autoStep(s).state;
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Map a seat-relative value vector (slot 0 = `moverIdx`) into an absolute,
 *  by-player-index win-probability vector of length `n`. */
function valueToAbsolute(vec: Float32Array, moverIdx: number, n: number): Float32Array {
  const abs = new Float32Array(n);
  for (let k = 0; k < n && k < MAX_SEATS; k++) {
    abs[(moverIdx + k) % n] = vec[k];
  }
  return abs;
}

/** Terminal credit: the sole survivor (or, defensively, the richest player) wins
 *  with probability 1; everyone else 0. */
function terminalValue(state: GameState): Float32Array {
  const n = state.players.length;
  const abs = new Float32Array(n);
  const survivors = state.players
    .map((p, i) => ({ i, p }))
    .filter((x) => !x.p.bankrupt);
  let winnerIdx = survivors.length > 0 ? survivors[0].i : 0;
  if (survivors.length > 1) {
    let best = -Infinity;
    for (const { i, p } of survivors) {
      const w = netWorth(state, p.id);
      if (w > best) {
        best = w;
        winnerIdx = i;
      }
    }
  }
  abs[winnerIdx] = 1;
  return abs;
}

/** A deterministic 32-bit mix of (seed, action index, visit) → a fresh rngState
 *  for sampling one dice outcome at a chance edge. */
function mixSeed(seed: number, action: number, visit: number): number {
  const r = createRng(
    (seed ^ Math.imul(action + 1, 0x9e3779b1) ^ Math.imul(visit + 1, 0x85ebca6b)) >>> 0,
  );
  r.next();
  return r.getState();
}

/** One search node = a decision state. Lazily expanded (the net eval happens on
 *  first visit). Deterministic-intent children are cached; chance (ROLL) children
 *  are resampled every visit, so they aren't stored. */
class Node {
  expanded = false;
  actions: Action[] = [];
  priors: Float32Array = new Float32Array(0);
  N: Int32Array = new Int32Array(0);
  W: Float64Array = new Float64Array(0);
  children: (Node | null)[] = [];
  valueAbs: Float32Array = new Float32Array(0);

  constructor(
    readonly state: GameState,
    readonly moverIdx: number,
    readonly seed: number,
  ) {}
}

function expand(node: Node, net: MonoNet): void {
  const n = node.state.players.length;
  const me = node.state.players[node.moverIdx].id;
  node.actions = legalActions(node.state, me);
  const pred = net.predict([encode(node.state, me)])[0];
  node.valueAbs = valueToAbsolute(pred.value, node.moverIdx, n);
  const k = node.actions.length;
  node.priors = new Float32Array(k);
  if (k > 0) {
    const masked = maskPolicy(pred.policy, node.actions.map((a) => a.token));
    node.actions.forEach((a, i) => (node.priors[i] = masked[a.token]));
  }
  node.N = new Int32Array(k);
  node.W = new Float64Array(k);
  node.children = new Array<Node | null>(k).fill(null);
  node.expanded = true;
}

/** PUCT-select the child index of an expanded node with ≥1 action. */
function selectChild(node: Node, cPuct: number): number {
  let total = 0;
  for (const v of node.N) total += v;
  const sqrtTotal = Math.sqrt(total);
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < node.actions.length; i++) {
    const q = node.N[i] > 0 ? node.W[i] / node.N[i] : 0;
    const u = cPuct * node.priors[i] * (sqrtTotal / (1 + node.N[i]));
    const score = q + u;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Build a fresh (unexpanded) node at the next decision reached from `state`. */
function nodeAt(state: GameState, seed: number): Node {
  const advanced = advanceToDecision(state);
  const owner = decisionOwner(advanced);
  const moverIdx = owner ? advanced.players.findIndex((p) => p.id === owner) : 0;
  return new Node(advanced, moverIdx < 0 ? 0 : moverIdx, seed);
}

/** One MCTS simulation from `node`. Returns the absolute value vector backed up. */
function simulate(node: Node, net: MonoNet, cPuct: number): Float32Array {
  if (node.state.status !== "active") return terminalValue(node.state);
  if (!node.expanded) {
    expand(node, net);
    return node.valueAbs;
  }
  if (node.actions.length === 0) return node.valueAbs; // owner owed nothing

  const a = selectChild(node, cPuct);
  const action = node.actions[a];
  let v: Float32Array;
  if (action.op.kind === "step") {
    // Chance edge: reseed the dice, evaluate the fresh post-roll state (resampled
    // every visit, so the edge's value averages over dice). Not cached.
    const childSeed = mixSeed(node.seed, a, node.N[a]);
    const rolled = autoStep({ ...node.state, rngState: childSeed }).state;
    v = simulate(nodeAt(rolled, childSeed), net, cPuct);
  } else {
    let child = node.children[a];
    if (child === null) {
      child = nodeAt(applyCandidate(node.state, action.op), node.seed);
      node.children[a] = child;
    }
    v = simulate(child, net, cPuct);
  }
  node.N[a] += 1;
  node.W[a] += v[node.moverIdx];
  return v;
}

/** Build the root, run `sims` simulations, and return the expanded root — or null
 *  when `me` owes no decision. Pure in (state, net): every seed derives from
 *  `state.rngState`. The root is expanded against ME's own action set (not
 *  `decisionOwner`), so the bot searches its own move — including an off-turn arm. */
function runSearch(
  state: GameState,
  me: string,
  net: MonoNet,
  opts: MctsOptions,
): { root: Node; sims: number } | null {
  if (legalActions(state, me).length === 0) return null;
  const sims = opts.simulations ?? DEFAULT_SIMULATIONS;
  const cPuct = opts.cPuct ?? DEFAULT_C_PUCT;
  const moverIdx = state.players.findIndex((p) => p.id === me);
  const root = new Node(state, moverIdx < 0 ? 0 : moverIdx, state.rngState >>> 0);
  expand(root, net);
  for (let i = 0; i < sims; i++) simulate(root, net, cPuct);
  return { root, sims };
}

/** The chosen root action plus its search stats (for the reasoning note). */
export interface MctsResult {
  action: Action;
  visits: number;
  simulations: number;
  q: number;
}

/** Run MCTS for `me` and return the most-visited root action (greedy), or null
 *  when `me` owes no decision. */
export function mctsSearch(
  state: GameState,
  me: string,
  net: MonoNet,
  opts: MctsOptions = {},
): MctsResult | null {
  const searched = runSearch(state, me, net, opts);
  if (searched === null) return null;
  const { root, sims } = searched;
  let best = 0;
  for (let i = 1; i < root.actions.length; i++) {
    if (root.N[i] > root.N[best]) best = i;
  }
  const visits = root.N[best];
  const q = visits > 0 ? root.W[best] / visits : 0;
  return { action: root.actions[best], visits, simulations: sims, q };
}

/** Full root statistics — the legal actions, their visit counts (parallel array),
 *  and the most-visited index. The visit distribution is the POLICY TRAINING
 *  TARGET for self-play; `valueAbs` is the root's net value (absolute frame). */
export interface MctsFull {
  actions: Action[];
  visits: number[];
  best: number;
  valueAbs: Float32Array;
}

/** Like `mctsSearch` but exposes the whole root visit distribution, for the
 *  self-play recorder. */
export function mctsSearchFull(
  state: GameState,
  me: string,
  net: MonoNet,
  opts: MctsOptions = {},
): MctsFull | null {
  const searched = runSearch(state, me, net, opts);
  if (searched === null) return null;
  const { root } = searched;
  let best = 0;
  for (let i = 1; i < root.actions.length; i++) {
    if (root.N[i] > root.N[best]) best = i;
  }
  return {
    actions: root.actions,
    visits: Array.from(root.N),
    best,
    valueAbs: root.valueAbs,
  };
}

/** A `Bot` driven by MCTS over the net. Returns null when the search chooses the
 *  mechanical roll (let the engine roll) or `me` owes nothing — otherwise the
 *  searched intent, noted with its visit share and value. */
export function mctsBot(net: MonoNet, opts: MctsOptions = {}): Bot {
  return (state, me) => {
    const result = mctsSearch(state, me, net, opts);
    if (result === null) return null;
    if (result.action.op.kind === "step") return null;
    const note =
      `mcts → ${result.action.label} ` +
      `(N=${result.visits}/${result.simulations}, Q=${result.q.toFixed(2)})`;
    return { intent: result.action.op.intent, note };
  };
}
