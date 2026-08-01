import { firstNegativePlayer, isLegal } from "../../engine";
import type { GameState, Intent, TradeTerms } from "../../types";
import type { Bot, BotDecision } from "../decision";
import { forcedRaiseStep } from "../fallback";
import {
  decodeGlobal,
  decodeManagePlan,
  defaultGlobalOp,
  GLOBAL_TOKENS,
  MANAGE_OPS,
  NUM_PROPS,
  type GlobalOp,
} from "./core/action-space";
import { encodeRl, type EncodeOptions, type RlObservation } from "./core/encode-rl";
import { generateTradeCandidates } from "./core/trade-candidates";
import { greedyIndex } from "./greedy";

// ---------------------------------------------------------------------------
// The trained PPO policy as a `Bot`.
//
// The training rig and the pacer disagree about what a "decision" is, and almost
// everything here exists to reconcile them:
//
//   - The rig chose a global token and a manage plan on ONE transition and
//     applied them atomically inside a single `applyAction`. The pacer instead
//     consults a bot several times — once at `pre-roll` to arm, again at
//     `managing` to commit; twice at `trade-building` to draft then propose.
//   - The rig consulted exactly one seat per decision. The pacer consults every
//     seat at `pre-roll` so off-turn bots can arm trades.
//
// A `Bot` must also be pure: `bots/versions/conformance.test.ts` calls it twice on
// one state and asserts the results agree. So there is no memo, no counter, and no
// carried state anywhere below — a multi-consultation composite stays coherent
// because both consultations recompute the SAME answer from the SAME board (see
// `preRollView` for the observation).
//
// EVERY head is decoded by ARGMAX. What the policy selects is what gets executed:
// there is no draw, no temperature, no seed. A stochastic decode would put a
// second, invisible policy between the weights and the board — one whose play
// nobody measured and whose bugs look like bad weights — and it would make a
// wrong-but-rare action reachable at whatever mass the net happens to leave on
// it. When an action must not be taken, the answer is to MASK it in
// `core/action-space.ts`, where the training rig sees the same rule.
// ---------------------------------------------------------------------------

/** The masked, collapsed, normalized probabilities for one forward pass — one row
 *  per head, in the layout the manifest declares.
 *
 *  Probabilities rather than logits: masking, the all-illegal collapse and the
 *  `select` factorization are the runner's job (it reads them from the bundle
 *  manifest), so a change to any of those is a bundle change, not a bot change. */
export interface PolicyDistributions {
  /** `GLOBAL_TOKENS.length` entries. */
  global: Float32Array;
  /** `NUM_PROPS * MANAGE_OPS` entries, row-major: one categorical per ownable. */
  manage: Float32Array;
  /** `K + 1` entries; the final column is "propose nothing" (cancel). */
  tradeCand: Float32Array;
}

/** The policy the bot drives. Kept to the narrowest surface that does the job so
 *  the bot never learns the bundle format, the tensor layout, or the executor. */
export interface PolicyRunner {
  /** Observation widths the bundle was trained with. The bot asserts its encoded
   *  observation matches these — nothing in the bundle records which optional obs
   *  blocks were enabled, so a mismatch here is the only signal that the encoder
   *  and the weights disagree. */
  readonly globalFeat: number;
  readonly playerFeat: number;
  /** K, the trade-candidate slot count the trade head was sized for. */
  readonly tradeCandidates: number;
  /** The encoder flags implied by the bundle's dims. */
  readonly encodeOptions: EncodeOptions;
  run(obs: RlObservation, candidates: readonly (readonly number[])[]): PolicyDistributions;
}

export interface PpoBotOptions {
  runner: PolicyRunner;
}

/** Whether `seat` owes a decision RIGHT NOW, mirroring the pacer's own per-phase
 *  choice of who to consult (`pacing.ts` `turnOp`).
 *
 *  Deliberately not `pendingDecision(state).seatId === playerId`: at `auction` and
 *  `trade-pending` that returns the FIRST seat owing, while the pacer skips seats
 *  with no bot before picking. All-bot sims agree, but with a human at the table
 *  they diverge — and the bot would answer `null` for a seat it genuinely owes,
 *  handing every contested auction to the `pass-bid` default. */
function owesDecision(state: GameState, seat: string): boolean {
  const { phase, playerId, auction, pendingTrade } = state.turn;
  switch (phase) {
    case "pre-roll":
    case "post-roll":
    case "buy-decision":
    case "jail-decision":
      return playerId === seat;
    case "auction":
      return (
        auction !== undefined &&
        auction.active.includes(seat) &&
        auction.leaderId !== seat
      );
    case "trade-pending":
      return (
        pendingTrade !== undefined &&
        seat in pendingTrade.approvals &&
        !pendingTrade.approvals[seat]
      );
    default:
      return false;
  }
}

/** The board as the policy saw it when it armed a manage boundary.
 *
 *  The rig NEVER surfaced a `managing` observation — it opened and closed the
 *  window inside one transition — so the phase one-hot's `managing` lane was
 *  always zero in training, and scoring a real `managing` observation would be
 *  out of distribution. Arming and opening move no money (see `asManaging` in
 *  action-space.ts), so restoring the phase reproduces the exact vector the policy
 *  scored, and the plan committed here is the plan it chose there. */
function preRollView(state: GameState): GameState {
  if (state.turn.phase !== "managing") return state;
  const { managerId: _managerId, manageStaged: _manageStaged, ...turn } = state.turn;
  return { ...state, turn: { ...turn, phase: "pre-roll" } };
}

/** The board as it was on first arrival at `trade-building`, before our own draft
 *  landed on it. The proposer is consulted twice — once to set the terms, once to
 *  propose them — and the terms must come out identical both times, so the second
 *  consultation scores the pre-draft board exactly as the first did. */
function emptyDraftView(state: GameState): GameState {
  const draft = state.turn.tradeDraft;
  if (draft === undefined) return state;
  return {
    ...state,
    turn: {
      ...state.turn,
      tradeDraft: {
        proposerId: draft.proposerId,
        propertyTo: {},
        gojfTo: {},
        cashDelta: {},
      },
    },
  };
}

function move(intent: Intent | null): BotDecision | null {
  return intent === null ? null : { intent };
}

/** Turn a decoded `GlobalOp` into a bot decision. A `step` becomes `null` — that
 *  is not a fallback, it is precisely "let the engine take its mechanical beat",
 *  which is what the rig did too. */
function opDecision(op: GlobalOp): BotDecision | null {
  return op.kind === "intent" ? { intent: op.intent } : null;
}

/** The manage `set-queue` arm. `ARM_TRADE` needs no equivalent: its raw decode is
 *  already the arm intent. */
function manageArm(seat: string): Extract<Intent, { kind: "set-queue" }> {
  return { kind: "set-queue", playerId: seat, queue: "manage", armed: true };
}

function armedForManage(state: GameState, seat: string): boolean {
  return state.boundaryQueue.some((e) => e.playerId === seat && e.kind === "manage");
}

function sameTerms(a: TradeTerms, b: TradeTerms): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ppoBot(options: PpoBotOptions): Bot {
  const { runner } = options;

  /** One forward pass on `state` from `seat`'s perspective, plus the candidate
   *  list the trade head indexes into. The observation width is asserted against
   *  the bundle: the manifest does NOT record which optional obs blocks were
   *  enabled, so this is the only thing standing between a wrong encoder
   *  configuration and a bot that runs clean while playing nonsense. */
  function evaluate(
    state: GameState,
    seat: string,
  ): { dist: PolicyDistributions; obs: RlObservation; candidates: readonly { terms: TradeTerms }[] } {
    const obs = encodeRl(state, seat, runner.encodeOptions);
    if (obs.global.length !== runner.globalFeat) {
      throw new Error(
        `observation/bundle mismatch: encoder produced ${obs.global.length.toString()} ` +
          `global features, bundle expects ${runner.globalFeat.toString()}`,
      );
    }
    if (obs.players.length > 0 && obs.players[0].length !== runner.playerFeat) {
      throw new Error(
        `observation/bundle mismatch: encoder produced ${obs.players[0].length.toString()} ` +
          `player features, bundle expects ${runner.playerFeat.toString()}`,
      );
    }
    const candidates = generateTradeCandidates(state, seat, runner.tradeCandidates);
    return { dist: runner.run(obs, candidates.map((c) => c.vec)), obs, candidates };
  }

  /** The whole-plan manage decode: the argmax of every ownable row. */
  function managePlan(dist: PolicyDistributions): number[] {
    const ops: number[] = [];
    for (let row = 0; row < NUM_PROPS; row++) {
      ops.push(greedyIndex(dist.manage, row * MANAGE_OPS.length, MANAGE_OPS.length));
    }
    return ops;
  }

  /** The manage commit for a seat whose window is (or is about to be) open, or
   *  `null` when the plan commits nothing. Always scored on the pre-roll view. */
  function manageCommit(state: GameState, seat: string): Intent | null {
    const view = preRollView(state);
    const { dist } = evaluate(view, seat);
    const plan = decodeManagePlan(state, seat, managePlan(dist));
    return plan.op.kind === "intent" && plan.op.intent.kind === "manage"
      ? plan.op.intent
      : null;
  }

  /** The terms this seat wants to propose, or `null` to cancel out of the
   *  intermission. Scored on the pre-draft view so both consultations agree. */
  function tradeTerms(state: GameState, seat: string): TradeTerms | null {
    const view = emptyDraftView(state);
    const { dist, candidates } = evaluate(view, seat);
    // The final column is "propose nothing"; an out-of-range pick means the same.
    const idx = greedyIndex(dist.tradeCand, 0, runner.tradeCandidates + 1);
    return idx >= 0 && idx < candidates.length ? candidates[idx].terms : null;
  }

  return function landonBot(state: GameState, playerId: string): BotDecision | null {
    if (state.status !== "active") return null;
    const phase = state.turn.phase;

    // ---- phases the rig drove MECHANICALLY, with no policy head at all -------
    // `pendingDecision` returns null for each, and the rig resolved them inside
    // `advanceToDecision`. Answering `null` here would work — the pacer has the
    // same defaults — but answering explicitly keeps the bot's play identical to
    // the trajectory the weights were trained on rather than merely legal.

    if (phase === "must-raise-cash") {
      // The debtor is whoever is below zero, not necessarily the active seat.
      if (firstNegativePlayer(state) !== playerId) return null;
      const forced = forcedRaiseStep(state, playerId);
      return forced !== null && isLegal(state, forced) ? move(forced) : null;
    }

    if (phase === "raising-cash") {
      if (state.turn.playerId !== playerId) return null;
      const buy: Intent = { kind: "buy", playerId };
      if (isLegal(state, buy)) return move(buy);
      const cancel: Intent = { kind: "cancel-manage", playerId };
      return isLegal(state, cancel) ? move(cancel) : null;
    }

    // ---- the two multi-consultation composites -------------------------------

    if (phase === "managing") {
      if (state.turn.managerId !== playerId) return null;
      const commit = manageCommit(state, playerId);
      // A window that turned out to hold nothing is closed rather than left open
      // for the pacer to cancel — same end state, one fewer surprising log line.
      if (commit === null) {
        const cancel: Intent = { kind: "cancel-manage", playerId };
        return isLegal(state, cancel) ? move(cancel) : null;
      }
      return isLegal(state, commit) ? move(commit) : null;
    }

    if (phase === "trade-building") {
      const draft = state.turn.tradeDraft;
      if (draft === undefined || draft.proposerId !== playerId) return null;
      const terms = tradeTerms(state, playerId);
      const cancel: Intent = { kind: "cancel-trade", playerId };
      if (terms === null) return isLegal(state, cancel) ? move(cancel) : null;
      // First consultation stages the terms; the second, seeing them already on
      // the draft, submits. Recomputed rather than remembered, which is what keeps
      // the bot a pure function.
      const staged: TradeTerms = {
        propertyTo: draft.propertyTo,
        gojfTo: draft.gojfTo,
        cashDelta: draft.cashDelta,
      };
      if (!sameTerms(staged, terms)) {
        const update: Intent = { kind: "update-trade-draft", playerId, terms };
        return isLegal(state, update) ? move(update) : move(isLegal(state, cancel) ? cancel : null);
      }
      const propose: Intent = { kind: "propose-trade", playerId };
      return isLegal(state, propose) ? move(propose) : move(isLegal(state, cancel) ? cancel : null);
    }

    // ---- the policy phases ---------------------------------------------------

    if (!owesDecision(state, playerId)) return null;

    // The rig never armed off-turn, and at `pre-roll` the pacer honours ONLY a
    // state-changing `set-queue`; everything else falls through to its `step`.
    // Once our manage boundary is queued, decline to speak again this beat: a
    // second, DIFFERENT-kind arm (a trade) would queue behind it and could open
    // first, silently reordering a composite the rig applied atomically.
    if (phase === "pre-roll" && armedForManage(state, playerId)) return null;

    const { dist } = evaluate(state, playerId);
    const token = greedyIndex(dist.global, 0, GLOBAL_TOKENS.length);
    let op = decodeGlobal(state, playerId, token);

    if (op.kind === "arm-manage") {
      // ARM_MANAGE is a GATE, not an op: it means "apply the plan carried on this
      // same action". A plan that commits nothing has no window worth opening, so
      // it falls through to the masked default exactly as the rig did — that is
      // what makes a non-productive arm PROGRESS instead of bouncing.
      if (manageCommit(state, playerId) === null) {
        op = defaultGlobalOp(state, playerId);
      } else {
        const arm = manageArm(playerId);
        return isLegal(state, arm) ? move(arm) : opDecision(defaultGlobalOp(state, playerId));
      }
    }

    return opDecision(op);
  };
}
