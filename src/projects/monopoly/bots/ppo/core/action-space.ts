import { BID_INCREMENT } from "../../../data";
import { groupPositions } from "../../../development";
import { firstNegativePlayer, isLegal, netWorth } from "../../../engine";
import { hasMonopoly, heldJailCard } from "../../../logic";
import { hasStagedChanges } from "../../../manage";
import { SPACES } from "../../../data";
import { developmentLevel } from "../../../development";
import type {
  CardSource,
  GameState,
  Intent,
  ManageStaged,
  TradeTerms,
} from "../../../types";

// ---------------------------------------------------------------------------
// The fixed action space for the landon-v1 RL bot — the action half of the
// observation/action contract it was TRAINED against. That contract is not a
// document in this repo: it belongs to the training rig, and this file is its
// authoritative statement on the game side, extracted verbatim so the weights and
// the engine read one definition rather than two copies that drift. The net emits
// an index into a FIXED token vocabulary (the global head) plus, for the two
// structured heads, a small per-asset payload; this module is the single source
// of truth that:
//   - names the vocab in the exact contract order (`GLOBAL_TOKENS`),
//   - decodes a chosen token / payload into the engine `Intent`(s),
//   - builds the per-head legality MASKS from a `GameState`.
//
// Every decode is paired with its mask, and the worker only ever applies a token
// the mask permitted — but decoding is also defensive (it re-checks `isLegal`
// and the contract's masked default) so a model that emits an out-of-mask token
// can never drive an illegal move — a bot can be bad but never illegal.
// Pure & deterministic: no RNG, no clock — randomness in play comes
// only from the engine's injected `state.rngState`.
// ---------------------------------------------------------------------------

/** The global-head token vocabulary. The net's global head is
 *  `MLP(c) → |GLOBAL_TOKENS|`; an index into this array is what `decodeGlobal`
 *  turns into an `Intent` (or the `step` op). ORDER IS LOAD-BEARING and is fixed
 *  by the trained weights: the Python net is built against these indices from the
 *  `spec` handshake, so a reorder here would silently mis-map every action of
 *  every bundle already exported. */
export const GLOBAL_TOKENS = [
  "ROLL",
  "END_TURN",
  "BUY",
  "DECLINE_BUY",
  "RAISE_TO_BUY",
  "JAIL_PAY",
  "JAIL_CARD",
  "JAIL_ROLL",
  "ACCEPT_TRADE",
  "DECLINE_TRADE",
  "BID_PASS",
  "BID_0",
  "BID_1",
  "BID_2",
  "BID_3",
  "ARM_TRADE",
  "ARM_MANAGE",
] as const;

export type GlobalToken = (typeof GLOBAL_TOKENS)[number];

/** Index of a token in the vocab — a small typed lookup so the mask builders and
 *  the decoder never index by a stringly-typed name twice. */
const TOKEN_INDEX: Readonly<Record<GlobalToken, number>> = Object.fromEntries(
  GLOBAL_TOKENS.map((t, i) => [t, i]),
) as Record<GlobalToken, number>;

/** The four discrete bid rungs (`BID_0…BID_3`). The model picks a rung; the
 *  decoder maps it to an absolute bid between the minimum legal raise and the
 *  bidder's net-worth cap. Rung 0 is the min raise; rung 3 is the cap; the middle
 *  two interpolate. A coarse ladder by design — a richer continuous amount head
 *  is a later slice (mirrors `candidates.ts`'s bounded bid ladder). */
export const BID_RUNGS = 4;

/** Seat-relative trade dests per asset: 8 seat columns + the NO_TRADE column. */
export const ASSET_DESTS = 9;
/** The dest column meaning "this asset does not move". */
export const NO_TRADE_DEST = 8;

/** Manage ops, in mask-column order — the trained `manage_mask[28][5]`. The manage
 *  head emits ONE of these per ownable row — 28 independent per-property
 *  categoricals whose joint choice is a whole PLAN, committed as a single atomic
 *  engine `manage` intent.
 *
 *  `NOOP` is index 0 deliberately: it is the collapse column (the plan entry that
 *  leaves a property alone) AND the zero-initialised default of every action slab
 *  and inactive-head storage, so a zeroed or defaulted manage column decodes as
 *  "do nothing everywhere" rather than "BUILD everywhere".
 *
 *  The op indices are load-bearing (the Python side buckets telemetry by op), so
 *  this order is frozen. */
export const MANAGE_OPS = [
  "NOOP",
  "BUILD",
  "SELL",
  "MORTGAGE",
  "UNMORTGAGE",
] as const;
export type ManageOp = (typeof MANAGE_OPS)[number];

export const MANAGE_NOOP_OP = 0;
export const MANAGE_BUILD_OP = 1;
export const MANAGE_SELL_OP = 2;
export const MANAGE_MORTGAGE_OP = 3;
export const MANAGE_UNMORTGAGE_OP = 4;

/** The order committed ops are staged in, so a plan is filtered against the
 *  world it is actually building: cash-raising ops before cash-spending ones, so
 *  a plan that funds a build by mortgaging survives the feasibility filter
 *  intact. Rows ascend within each op. */
export const MANAGE_APPLY_ORDER = [
  MANAGE_SELL_OP,
  MANAGE_MORTGAGE_OP,
  MANAGE_UNMORTGAGE_OP,
  MANAGE_BUILD_OP,
];

/** Seat cap — the 8-hue player bound, matching `features.ts` `MAX_SEATS`. */
export const MAX_SEATS = 8;

/** The 28 ownable board positions (22 properties + 4 railroads + 2 utilities),
 *  in board order — asset rows 0..27. Rows 28..29 are the two GOJF cards. This is
 *  the canonical asset-row → board-position map both heads and the masks key on. */
export const ASSET_POSITIONS: readonly number[] = SPACES.flatMap((s, i) =>
  s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? [i]
    : [],
);

/** Total asset rows: 28 ownables + 2 GOJF. */
export const NUM_ASSETS = ASSET_POSITIONS.length + 2;
/** Manageable / tradeable property rows (the 28 ownables); GOJF rows are
 *  trade-only. This is the `num_props` every bundle declares in its manifest's
 *  `action_geometry`, and `assertActionGeometry` refuses one that disagrees. */
export const NUM_PROPS = ASSET_POSITIONS.length;

/** The two GOJF asset rows, by card source — rows 28 (chance) and 29
 *  (communityChest). */
export const GOJF_ROWS: readonly { row: number; source: CardSource }[] = [
  { row: ASSET_POSITIONS.length, source: "chance" },
  { row: ASSET_POSITIONS.length + 1, source: "communityChest" },
];

/** The seat-slot → player-id map for `state` from `meId`'s perspective: slot 0 is
 *  `meId`, opponents follow in seat order (mirrors `features.ts` `makeSeats`).
 *  `undefined` for an absent slot. Bankrupt seats keep their id (the decoder
 *  re-validates legality), so this is purely the rotation. */
export function seatOrder(state: GameState, meId: string): (string | undefined)[] {
  const players = state.players;
  const n = players.length;
  const myIndex = players.findIndex((p) => p.id === meId);
  const order: (string | undefined)[] = [];
  for (let slot = 0; slot < MAX_SEATS; slot++) {
    order.push(slot < n ? players[(myIndex + slot) % n].id : undefined);
  }
  return order;
}

// ---------------------------------------------------------------------------
// Global-head mask + decode.
// ---------------------------------------------------------------------------

/** The bid rung → absolute amount mapping for `pid` in the current auction, or
 *  `null` if no auction / no legal raise exists. Rung 0 = min raise, rung 3 =
 *  the net-worth cap, the middle rungs linearly interpolated and clamped to be
 *  strictly above the high bid. */
function bidAmountForRung(
  state: GameState,
  pid: string,
  rung: number,
): number | null {
  const auction = state.turn.auction;
  if (!auction) return null;
  const minBid = auction.highBid + BID_INCREMENT;
  const cap = netWorth(state, pid);
  if (cap < minBid) return null;
  if (rung <= 0) return minBid;
  if (rung >= BID_RUNGS - 1) return cap;
  const frac = rung / (BID_RUNGS - 1);
  const amount = Math.round(minBid + (cap - minBid) * frac);
  return Math.max(minBid, Math.min(cap, amount));
}

/** Whether any bid rung is legal for `pid` right now (the bidder is still in,
 *  isn't the standing leader, and can afford at least the minimum raise). */
function canBid(state: GameState, pid: string): boolean {
  const auction = state.turn.auction;
  if (!auction) return false;
  if (!auction.active.includes(pid) || auction.leaderId === pid) return false;
  return bidAmountForRung(state, pid, 0) !== null;
}

/** The global-head legality mask for `seat` at the current decision point — one
 *  bool per `GLOBAL_TOKENS` entry, true iff that token is a move worth offering
 *  `seat` now. Computed straight from the phase + `isLegal`, so it can never
 *  drift from what the engine accepts. The `head` for a state is `"global"`
 *  unless an intermission the seat must drive is open (see `headFor`); this mask
 *  is only consulted when `head === "global"`.
 *
 *  A few tokens are narrower than bare legality, and always for one reason: the
 *  engine would ACCEPT the move but it provably changes nothing, so a policy that
 *  picks it arrives back at this same decision and picks it again. See
 *  `armProductive` / `armManageLegal` for the arms and `raiseToBuyUseful` for the
 *  buy window. Legal-but-null is not a strategy the policy should be able to
 *  express. */
export function globalMask(state: GameState, seat: string): boolean[] {
  const mask = new Array<boolean>(GLOBAL_TOKENS.length).fill(false);
  if (state.status !== "active") return mask;
  const set = (t: GlobalToken, v = true): void => {
    mask[TOKEN_INDEX[t]] = v;
  };
  const { phase, playerId } = state.turn;
  const active = playerId === seat;

  switch (phase) {
    case "pre-roll": {
      if (active) set("ROLL");
      // The active seat may fire the manage GATE or arm a trade; an off-turn seat
      // may arm a trade (off-turn trades are enabled). Only a useful arm is
      // offered: a pure no-op arm (already on the queue, or a `manage` gate with
      // nothing to build/mortgage) is excluded so it can't bounce back to this
      // same decision (see `armProductive` / `armManageLegal`). ROLL is always
      // offered to the active seat — together with the env-worker's pre-roll
      // watchdog (which bounds an arm→cancel→re-arm loop and forces the roll),
      // this guarantees the turn always reaches its dice no matter what the
      // policy chooses.
      if (active && armManageLegal(state, seat)) set("ARM_MANAGE");
      if (armProductive(state, seat, "trade")) set("ARM_TRADE");
      break;
    }
    case "post-roll":
      if (active && isLegal(state, { kind: "end-turn", playerId: seat })) {
        set("END_TURN");
      }
      break;
    case "jail-decision": {
      if (!active) break;
      if (isLegal(state, { kind: "pay-to-leave-jail", playerId: seat })) {
        set("JAIL_PAY");
      }
      if (
        heldJailCard(state, seat) !== null &&
        isLegal(state, { kind: "use-jail-card", playerId: seat })
      ) {
        set("JAIL_CARD");
      }
      // Rolling for doubles (serving the sentence) is always an option here.
      set("JAIL_ROLL");
      break;
    }
    case "buy-decision": {
      if (!active) break;
      if (isLegal(state, { kind: "buy", playerId: seat })) set("BUY");
      if (isLegal(state, { kind: "decline-buy", playerId: seat })) {
        set("DECLINE_BUY");
      }
      // RAISE_TO_BUY is deliberately NOT offered, at any board. The engine
      // accepts it — that is why it is in the vocabulary — but it can never
      // reach a state `BUY` and `DECLINE_BUY` do not already reach, and one of
      // its two branches wedges the game outright.
      //
      // The token names a pure phase transition (`buy-decision` ->
      // `raising-cash`) that moves no money: it opens an EMPTY staging window,
      // which is then resolved mechanically — buy if the seat can now afford the
      // lot, else cancel back here. Both drivers that resolve it agree and
      // NEITHER STAGES ANYTHING: the shipped bot's `raising-cash` arm
      // (`bots/ppo/bot.ts`) and the training rig's `advanceToDecision` both
      // buy-or-cancel and never mortgage or sell into the window. So the cash at
      // commit time is the cash the seat already had, and:
      //
      //   - cash >= price: the window commits the same purchase `BUY` makes, one
      //     intent later, for a bit-identical board. Dominated.
      //   - cash <  price: `buy` is never legal, so the window always cancels and
      //     the board comes back BIT-IDENTICAL. The observation is unchanged, so
      //     a policy that executes its own argmax re-picks the token forever.
      //     Measured on the shipped bundle: one landing at $186 cash against a
      //     $220 lot absorbed 458 consecutive round trips and every remaining
      //     beat of the budget. Not "wasteful" — terminal.
      //
      // Note the second branch is null even when the seat could EASILY cover the
      // price by mortgaging (that seat could raise $1,166). Reachability is not
      // what is missing; a driver that stages the raise is. Teach one to, and
      // this is where the token earns its place back — gated on the seat being
      // short AND `netWorth(state, seat) >= price`, the engine's own solvency
      // yardstick. Until then a short seat still competes for the lot through the
      // AUCTION that `DECLINE_BUY` opens, where bidding above cash is handled
      // properly (the winner settles through `must-raise-cash`, which does
      // liquidate). Nothing is taken away from the policy except the wedge.
      break;
    }
    case "auction": {
      if (canBid(state, seat)) {
        for (let r = 0; r < BID_RUNGS; r++) {
          const amount = bidAmountForRung(state, seat, r);
          if (amount !== null && isLegal(state, { kind: "bid", playerId: seat, amount })) {
            set(`BID_${r}` as GlobalToken);
          }
        }
      }
      if (isLegal(state, { kind: "pass-bid", playerId: seat })) set("BID_PASS");
      break;
    }
    case "trade-pending": {
      const pending = state.turn.pendingTrade;
      if (!pending) break;
      if (isLegal(state, { kind: "accept-trade", playerId: seat, tradeId: pending.id })) {
        set("ACCEPT_TRADE");
      }
      if (isLegal(state, { kind: "decline-trade", playerId: seat, tradeId: pending.id })) {
        set("DECLINE_TRADE");
      }
      break;
    }
    default:
      break;
  }
  return mask;
}

function armIntent(
  seat: string,
  queue: "trade" | "manage",
): Extract<Intent, { kind: "set-queue" }> {
  return { kind: "set-queue", playerId: seat, queue, armed: true };
}

/** Whether arming `queue` would be a no-op against the current boundary queue
 *  (the seat is already armed for that kind). Mirrors the pacer's `isNoOpArm`:
 *  the engine treats a redundant arm as an idempotent no-op, so re-applying it
 *  changes nothing and bounces straight back to the same pre-roll decision. */
function isNoOpArm(
  state: GameState,
  intent: Extract<Intent, { kind: "set-queue" }>,
): boolean {
  const present = state.boundaryQueue.some(
    (e) => e.playerId === intent.playerId && e.kind === intent.queue,
  );
  return intent.armed === present;
}

/** Whether the seat has at least one structurally-possible manage move right now
 *  (a buildable monopoly lot, or any owned lot whose mortgage flag can flip). A
 *  seat that owns nothing manageable should never be offered ARM_MANAGE — the
 *  gate would have nothing to apply, so it could only cost a transition.
 *  Phase-independent (checks ownership + structure, not the `managing`-gated
 *  `isLegal`) so it can be consulted at pre-roll before any window is open. */
function hasManageMove(state: GameState, seat: string): boolean {
  for (const pos of ASSET_POSITIONS) {
    if (state.ownership[pos] !== seat) continue;
    for (const op of MANAGE_OPS) {
      if (manageIntentFor(state, seat, pos, op) !== null) return true;
    }
  }
  return false;
}

/** Whether arming `queue` for `seat` opens a genuinely useful window — it is a
 *  legal arm, isn't a redundant no-op against the current queue, and (for
 *  `manage`) the seat actually has something to manage. This deliberately does
 *  NOT bound how MANY times a seat may arm per turn-group: arming, opening the
 *  window, and committing a real change (a build, a mortgage, a trade) is
 *  legitimate forward progress the policy must keep being offered. The pure
 *  no-op cases (arming a queue you're already on, or opening a `managing` window
 *  with nothing buildable/mortgageable) are the ones excluded here, so a clearly
 *  redundant arm can't even bounce once. The remaining degenerate loop — arming,
 *  opening a window, then CANCELLING it with no commit, forever — is what the
 *  env-worker's pre-roll watchdog bounds (it can't be judged from the pre-roll
 *  state alone, since whether the window will commit isn't yet known). */
function armProductive(
  state: GameState,
  seat: string,
  queue: "trade" | "manage",
): boolean {
  const intent = armIntent(seat, queue);
  if (!isLegal(state, intent)) return false;
  if (isNoOpArm(state, intent)) return false;
  if (queue === "manage" && !hasManageMove(state, seat)) return false;
  return true;
}

/** A global-head decode: the engine op a chosen token maps to for `seat`. A
 *  `step` is the mechanical roll/advance (ROLL, JAIL_ROLL, and the masked
 *  default at pre-roll/jail). An `intent` is a concrete submit. An `arm-manage`
 *  is the manage GATE — see `armManageLegal`. Pure.
 *
 *  `fallback` marks an op the DECODER substituted because the chosen action was
 *  out-of-mask or decoded illegal — the caller applied a move the policy did not
 *  pick. Silent substitution makes a policy/mask bug look like ordinary play, so
 *  the flag exists purely to be COUNTED (`legality/decode_fallback_frac`); it
 *  never changes which op is returned. */
export type GlobalOp =
  | { kind: "step"; fallback?: true }
  | { kind: "intent"; intent: Intent; fallback?: true }
  /** ARM_MANAGE: not an engine op on its own. Choosing it means "apply the manage
   *  plan carried on this SAME action", which the caller realises as one composite
   *  (arm → open the window → commit the plan → back to pre-roll) inside a single
   *  transition. Named rather than returned as the bare `set-queue` it starts from,
   *  because arming without the commit would open an intermission the policy is
   *  never shown and can never close. */
  | { kind: "arm-manage"; fallback?: true };

/** Tag a decoded op as a decoder substitution. Rebuilt field-by-field rather than
 *  spread so the discriminated union stays exact. */
function asFallback(op: GlobalOp): GlobalOp {
  switch (op.kind) {
    case "step":
      return { kind: "step", fallback: true };
    case "arm-manage":
      return { kind: "arm-manage", fallback: true };
    default:
      return { kind: "intent", intent: op.intent, fallback: true };
  }
}

/** The contract's masked default for `seat`, TAGGED as a decoder substitution —
 *  exactly what `decodeGlobal` returns for an action it cannot honour. Exported so
 *  a caller that discovers a GATED payload is empty (an ARM_MANAGE whose plan
 *  commits nothing) can take the same guaranteed-progress exit the decoder would. */
export function fallbackGlobalOp(state: GameState, seat: string): GlobalOp {
  return asFallback(defaultGlobalOp(state, seat));
}

/** Decode a chosen global token into the engine op for `seat`, falling back to
 *  the contract's masked default when the token is out-of-mask or its decoded
 *  intent isn't legal. The default per phase mirrors `decision.ts` / `pacing.ts`:
 *  buy-decision → decline, auction → pass, trade-pending → decline, jail → roll,
 *  pre-roll → step (just roll), post-roll → end-turn. So a misbehaving policy
 *  always yields a legal op. */
export function decodeGlobal(
  state: GameState,
  seat: string,
  token: number,
): GlobalOp {
  const name = GLOBAL_TOKENS[token] as GlobalToken | undefined;
  const op = name ? rawGlobalOp(state, seat, name) : null;
  if (op !== null && opIsLegal(state, op)) return op;
  return asFallback(defaultGlobalOp(state, seat));
}

function rawGlobalOp(
  state: GameState,
  seat: string,
  name: GlobalToken,
): GlobalOp | null {
  switch (name) {
    case "ROLL":
    case "JAIL_ROLL":
      return { kind: "step" };
    case "END_TURN":
      return { kind: "intent", intent: { kind: "end-turn", playerId: seat } };
    case "BUY":
      return { kind: "intent", intent: { kind: "buy", playerId: seat } };
    case "DECLINE_BUY":
      return { kind: "intent", intent: { kind: "decline-buy", playerId: seat } };
    case "RAISE_TO_BUY":
      return { kind: "intent", intent: { kind: "raise-cash", playerId: seat } };
    case "JAIL_PAY":
      return {
        kind: "intent",
        intent: { kind: "pay-to-leave-jail", playerId: seat },
      };
    case "JAIL_CARD":
      return { kind: "intent", intent: { kind: "use-jail-card", playerId: seat } };
    case "ACCEPT_TRADE": {
      const id = state.turn.pendingTrade?.id;
      return id === undefined
        ? null
        : { kind: "intent", intent: { kind: "accept-trade", playerId: seat, tradeId: id } };
    }
    case "DECLINE_TRADE": {
      const id = state.turn.pendingTrade?.id;
      return id === undefined
        ? null
        : { kind: "intent", intent: { kind: "decline-trade", playerId: seat, tradeId: id } };
    }
    case "BID_PASS":
      return { kind: "intent", intent: { kind: "pass-bid", playerId: seat } };
    case "BID_0":
    case "BID_1":
    case "BID_2":
    case "BID_3": {
      const rung = Number(name.slice(4));
      const amount = bidAmountForRung(state, seat, rung);
      return amount === null
        ? null
        : { kind: "intent", intent: { kind: "bid", playerId: seat, amount } };
    }
    // A non-productive arm (already armed / served this turn-group / nothing to
    // manage) returns null, so `decodeGlobal` falls through to the masked default
    // — at pre-roll that is a roll. This is what makes a redundant arm PROGRESS
    // (it rolls) instead of bouncing back to the same decision, even when a
    // misbehaving policy emits the token out-of-mask.
    case "ARM_TRADE":
      return armProductive(state, seat, "trade")
        ? { kind: "intent", intent: armIntent(seat, "trade") }
        : null;
    case "ARM_MANAGE":
      return armManageLegal(state, seat) ? { kind: "arm-manage" } : null;
  }
}

function opIsLegal(state: GameState, op: GlobalOp): boolean {
  // A `step` is always available, and the gate's legality is settled by
  // `armManageLegal` before it is ever constructed — only a concrete intent has
  // anything left to re-check.
  if (op.kind === "step" || op.kind === "arm-manage") return true;
  return isLegal(state, op.intent);
}

/** The guaranteed-legal default op for `seat` at the current phase — the
 *  contract's masked fallback. Always a legal move (or the mechanical step). */
export function defaultGlobalOp(state: GameState, seat: string): GlobalOp {
  const { phase, playerId } = state.turn;
  switch (phase) {
    case "buy-decision":
      return { kind: "intent", intent: { kind: "decline-buy", playerId: seat } };
    case "auction":
      return { kind: "intent", intent: { kind: "pass-bid", playerId: seat } };
    case "trade-pending": {
      const id = state.turn.pendingTrade?.id;
      return id === undefined
        ? { kind: "step" }
        : { kind: "intent", intent: { kind: "decline-trade", playerId: seat, tradeId: id } };
    }
    case "post-roll":
      return { kind: "intent", intent: { kind: "end-turn", playerId } };
    // pre-roll / jail-decision / anything else: roll (just advance).
    default:
      return { kind: "step" };
  }
}

// ---------------------------------------------------------------------------
// Manage-head mask + decode (28 props × 4 ops).
// ---------------------------------------------------------------------------

/** Whether `ARM_MANAGE` is a legal choice for `seat` right now — the GATE. The
 *  plan rides on the same action as the global token: picking ARM_MANAGE means
 *  "apply the 28-property plan carried here", so this one predicate decides both
 *  whether the token is offered (`globalMask`) and whether the plan is populated
 *  (`manageMask`) / applied (`decodeManagePlan`). Keeping them one predicate is
 *  what makes `manage_mask_empty` zero by construction rather than by inspection.
 *
 *  An already-open `managing` intermission still answers true. The worker never
 *  surfaces one to the policy (it opens and closes the window inside a single
 *  transition), but the decode path stays valid inside one so a hand-built window
 *  — or an engine state that reached `managing` by some other route — decodes
 *  exactly as it always did. */
export function armManageLegal(state: GameState, seat: string): boolean {
  if (state.status !== "active") return false;
  const { phase, playerId, managerId } = state.turn;
  if (phase === "managing") return managerId === seat;
  if (phase !== "pre-roll" || playerId !== seat) return false;
  return armProductive(state, seat, "manage");
}

/** The board as the engine will present it the instant `seat`'s manage window is
 *  open. Arming and opening touch ONLY the boundary queue and the turn's phase
 *  fields — no ownership, cash, houses or mortgage flag moves — so every legality
 *  question about a `manage` commit has the same answer here as it will at commit
 *  time. That equivalence is what lets the mask be built at pre-roll. */
function asManaging(state: GameState, seat: string): GameState {
  if (state.turn.phase === "managing" && state.turn.managerId === seat) {
    return state;
  }
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: "managing",
      managerId: seat,
      manageStaged: { build: {}, mortgage: {} },
    },
  };
}

/** The manage-head legality mask: for each of the 28 ownable rows, which entry of
 *  that row's per-property categorical is legal for `seat` right now. Populated
 *  whenever the ARM_MANAGE gate is legal (`armManageLegal`) and computed against
 *  the CURRENT board; every cell is `false` otherwise (an all-false mask is how an
 *  INACTIVE head is expressed, and must stay that way).
 *
 *  The mask is built at pre-roll and the plan is applied at pre-roll, out of the
 *  same action, so mask and application see the SAME state — there is no window
 *  for the board to drift across, which is precisely the guarantee a separate
 *  manage transition could not offer.
 *
 *  When the gate is open, NOOP is legal on EVERY row — leaving a property alone is
 *  always available — so the per-row all-illegal fraction is 0 BY CONSTRUCTION,
 *  and it costs no transition at all: an all-NOOP plan simply doesn't fire the
 *  gate. The four real ops are checked by constructing the atomic `manage` commit
 *  each would produce on its own and running it through `isLegal`, so a row's mask
 *  exactly matches what `decodeManagePlan` will accept as the first entry of a
 *  plan. */
export function manageMask(state: GameState, seat: string): boolean[][] {
  const mask: boolean[][] = ASSET_POSITIONS.map(() =>
    new Array<boolean>(MANAGE_OPS.length).fill(false),
  );
  if (!armManageLegal(state, seat)) return mask;
  const view = asManaging(state, seat);
  ASSET_POSITIONS.forEach((pos, row) => {
    mask[row][MANAGE_NOOP_OP] = true;
    if (view.ownership[pos] !== seat) return;
    MANAGE_OPS.forEach((op, col) => {
      const intent = manageIntentFor(view, seat, pos, op);
      if (intent !== null && isLegal(view, intent)) mask[row][col] = true;
    });
  });
  return mask;
}

/** The engine intent the CANCEL cell decodes to: leave the `managing` window
 *  with nothing committed. */
function cancelManageIntent(
  seat: string,
): Extract<Intent, { kind: "cancel-manage" }> {
  return { kind: "cancel-manage", playerId: seat };
}

/** The atomic `manage` intent that op `op` on `pos` produces for `seat`, or
 *  `null` when the op is structurally impossible (e.g. BUILD on a railroad, or
 *  SELL with nothing built). Building/selling moves the WHOLE color set one tier
 *  (the even-build rule the engine enforces); mortgage/unmortgage flips the one
 *  lot. The engine validates the result, so this only needs to express the move.
 *
 *  NOOP is not a `manage` commit at all (it is the plan entry that leaves the
 *  property alone), so it is never an asset-op: `null` for every row. That also
 *  keeps `hasManageMove` — which asks whether a window is worth opening —
 *  answering about REAL work, not about the always-available do-nothing. */
function manageIntentFor(
  state: GameState,
  seat: string,
  pos: number,
  op: ManageOp,
): Extract<Intent, { kind: "manage" }> | null {
  if (op === "NOOP") return null;
  const space = SPACES[pos];
  const isProperty = space.kind === "property";
  if (op === "BUILD" || op === "SELL") {
    if (!isProperty) return null;
    const color = space.color;
    if (!hasMonopoly(state, color, seat)) return null;
    const positions = groupPositions(color);
    let top = 0;
    for (const p of positions) top = Math.max(top, developmentLevel(state, p));
    const level = op === "BUILD" ? top + 1 : top - 1;
    if (level < 0 || level > 5) return null;
    const build: Record<number, number> = {};
    for (const p of positions) build[p] = level;
    return { kind: "manage", playerId: seat, build, mortgage: {} };
  }
  // MORTGAGE / UNMORTGAGE: flip this single lot.
  const want = op === "MORTGAGE";
  if ((state.mortgaged[pos] === true) === want) return null;
  return { kind: "manage", playerId: seat, build: {}, mortgage: { [pos]: want } };
}

/** The outcome of decoding one manage PLAN — the op to apply plus the three
 *  counts that make the plan's shape measurable from Python. */
export interface ManagePlanResult {
  /** The engine op to apply: the atomic `manage` commit, or `cancel-manage`
   *  when the plan is empty (all-NOOP, or everything was filtered). */
  op: GlobalOp;
  /** Non-NOOP entries the policy emitted that were legal in the pre-plan mask. */
  selected: number;
  /** Of those, the ones that survived canonical staging. */
  committed: number;
  /** Non-NOOP entries that were NOT legal in the pre-plan mask (a policy/mask
   *  fault, and the only thing that tags `op` as a fallback). */
  outOfMask: number;
}

/** Stage one more op onto `staged`, returning the CANDIDATE plan (never mutating
 *  the accepted one). Mirrors `manageIntentFor`'s shape, but reads the STAGED
 *  level rather than the live one, so selecting BUILD on two lots of the same
 *  group advances that group two tiers — deterministic, monotone, and how a
 *  policy expresses a multi-tier build in a single shot. `null` when the op is
 *  structurally impossible against the staged world. */
function stageManageOp(
  state: GameState,
  staged: ManageStaged,
  pos: number,
  op: number,
): ManageStaged | null {
  if (op === MANAGE_MORTGAGE_OP || op === MANAGE_UNMORTGAGE_OP) {
    return {
      build: { ...staged.build },
      mortgage: { ...staged.mortgage, [pos]: op === MANAGE_MORTGAGE_OP },
    };
  }
  const space = SPACES[pos];
  if (space.kind !== "property") return null;
  const positions = groupPositions(space.color);
  let top = 0;
  for (const p of positions) {
    top = Math.max(top, staged.build[p] ?? developmentLevel(state, p));
  }
  const level = op === MANAGE_BUILD_OP ? top + 1 : top - 1;
  if (level < 0 || level > 5) return null;
  const build: Record<number, number> = { ...staged.build };
  for (const p of positions) build[p] = level;
  return { build, mortgage: { ...staged.mortgage } };
}

/** Decode a whole manage PLAN — one op per ownable row — into the single engine
 *  op that realises it: the atomic `manage` commit the engine validates
 *  raise-first / spend-second and all-or-nothing, or `cancel-manage` for an empty
 *  plan.
 *
 *  Entries are staged in `MANAGE_APPLY_ORDER` (rows ascending within an op) and
 *  each candidate is re-checked with `isLegal` — a full dry-run of `apply` — so
 *  an entry that is legal ALONE but not in COMBINATION (cash, even-build, house
 *  bank) is dropped rather than sinking the whole plan. The gap between
 *  `selected` and `committed` is exactly that skip rate.
 *
 *  `fallback` means exactly one thing: the policy emitted an entry the pre-plan
 *  mask forbade, so `outOfMask > 0` tags REGARDLESS of what committed. An empty
 *  plan is exempt only when it is empty because the policy chose all-NOOP — that
 *  is a legitimate decision, not a decoder substitution. A plan that is empty
 *  because every entry was out-of-mask is the opposite: the pure form of the fault
 *  the counter exists to catch, and the case most likely to appear if the mask and
 *  the net ever desync, so leaving it untagged would blind the counter in exactly
 *  the situation it was added for. */
export function decodeManagePlan(
  state: GameState,
  seat: string,
  ops: readonly number[],
): ManagePlanResult {
  const cancel = cancelManageIntent(seat);
  // Defensive: a closed gate means nothing the plan says can be applied, exactly
  // as an out-of-mask cell is.
  if (!armManageLegal(state, seat)) {
    return {
      op: { kind: "intent", intent: cancel, fallback: true },
      selected: 0,
      committed: 0,
      outOfMask: 0,
    };
  }
  // Legality is asked of the board as it will stand when the window opens — the
  // same view `manageMask` was built from, so a masked cell can never be rejected
  // here for a reason the mask could not see.
  const view = asManaging(state, seat);
  const mask = manageMask(state, seat);
  let staged: ManageStaged = { build: {}, mortgage: {} };
  let selected = 0;
  let committed = 0;
  let outOfMask = 0;
  for (const op of MANAGE_APPLY_ORDER) {
    for (let row = 0; row < ASSET_POSITIONS.length; row++) {
      if ((ops[row] ?? MANAGE_NOOP_OP) !== op) continue;
      if (!mask[row][op]) {
        outOfMask++;
        continue;
      }
      selected++;
      const next = stageManageOp(view, staged, ASSET_POSITIONS[row], op);
      if (next === null) continue;
      if (
        !isLegal(view, {
          kind: "manage",
          playerId: seat,
          build: next.build,
          mortgage: next.mortgage,
        })
      ) {
        continue;
      }
      staged = next;
      committed++;
    }
  }
  const intent: Intent =
    committed === 0 || !hasStagedChanges(view, staged)
      ? cancel
      : { kind: "manage", playerId: seat, build: staged.build, mortgage: staged.mortgage };
  return {
    op:
      outOfMask > 0
        ? { kind: "intent", intent, fallback: true }
        : { kind: "intent", intent },
    selected,
    committed,
    outOfMask,
  };
}

// ---------------------------------------------------------------------------
// Trade-head mask + decode (asset_legal[30][9]) → TradeTerms.
// ---------------------------------------------------------------------------

/** The trade-head legality mask `asset_legal[30][9]`: for each asset row, which
 *  dest columns are legal targets. Dest cols 0..7 are seats (seat-relative, 0 =
 *  `seat`); col 8 (NO_TRADE) is always legal (the asset can stay put). A seat
 *  column is legal for an asset iff that asset is currently owned/held (by anyone
 *  active) and the dest seat is a real, non-bankrupt player that isn't the
 *  current owner — the structural rules `validateTradeAssets` enforces. Built
 *  color sets can't be traded, so their lots offer only NO_TRADE. Computed
 *  whenever a trade could be built; the worker reads it while driving the trade
 *  intermission. */
export function assetLegal(state: GameState, seat: string): boolean[][] {
  const order = seatOrder(state, seat);
  const activeSlot: boolean[] = order.map(
    (id) =>
      id !== undefined &&
      (state.players.find((p) => p.id === id)?.bankrupt === false),
  );
  const legal: boolean[][] = [];
  for (let row = 0; row < NUM_ASSETS; row++) {
    const cols = new Array<boolean>(ASSET_DESTS).fill(false);
    cols[NO_TRADE_DEST] = true; // an asset may always stay put
    legal.push(cols);
  }

  // Ownable rows: a seat dest is legal iff the lot is owned, the set is bare
  // (built sets can't trade), and the dest is a real active non-owner.
  ASSET_POSITIONS.forEach((pos, row) => {
    const owner = state.ownership[pos];
    if (!owner) return;
    if (builtSetLocked(state, pos)) return;
    for (let slot = 0; slot < MAX_SEATS; slot++) {
      const destId = order[slot];
      if (!activeSlot[slot] || destId === undefined) continue;
      if (destId === owner) continue;
      legal[row][slot] = true;
    }
  });

  // GOJF rows: a seat dest is legal iff the card is held and the dest is a real
  // active non-holder.
  for (const { row, source } of GOJF_ROWS) {
    const holder = state.jailFreeCards[source];
    if (holder === undefined) continue;
    for (let slot = 0; slot < MAX_SEATS; slot++) {
      const destId = order[slot];
      if (!activeSlot[slot] || destId === undefined) continue;
      if (destId === holder) continue;
      legal[row][slot] = true;
    }
  }
  return legal;
}

/** Whether `pos` belongs to a color set with a building standing anywhere in it
 *  (so no lot of the set may be traded — the official rule
 *  `validateTradeAssets` enforces). Railroads / utilities never lock. */
function builtSetLocked(state: GameState, pos: number): boolean {
  const space = SPACES[pos];
  if (space.kind !== "property") return false;
  return groupPositions(space.color).some((p) => developmentLevel(state, p) > 0);
}

/** The action a `trade` head emits (CONTRACT): a dest column per asset row plus a
 *  seat-relative cash vector. */
export interface TradeAction {
  /** Dest column per asset row (length `NUM_ASSETS`); 0..7 = seat, 8 = NO_TRADE. */
  assetDest: readonly number[];
  /** Seat-relative cash delta (length `MAX_SEATS`); index 0 = `seat`. Sums to
   *  ~0; the worker re-balances onto the proposer so it nets exactly zero. */
  cash: readonly number[];
}

/** Decode a `trade` action into `TradeTerms` from `seat`'s perspective, keeping
 *  ONLY the moves the `assetLegal` mask permits and that actually change an
 *  owner/holder. Cash entries are mapped seat-relative → player id and the
 *  proposer (`seat`) is set to the exact negation of the others' sum so the
 *  terms always net to zero (CONTRACT). Returns `null` for an empty trade
 *  (no asset moves and cash ≈ 0) — the worker then proposes nothing. The result
 *  is only a candidate; `proposeTradeOps` re-checks it with `isLegal` before it
 *  ever reaches the engine. */
export function decodeTrade(
  state: GameState,
  seat: string,
  action: TradeAction,
): TradeTerms | null {
  const order = seatOrder(state, seat);
  const legal = assetLegal(state, seat);

  const propertyTo: Record<number, string> = {};
  const gojfTo: Partial<Record<CardSource, string>> = {};
  let movedAssets = 0;

  ASSET_POSITIONS.forEach((pos, row) => {
    const dest = action.assetDest[row] ?? NO_TRADE_DEST;
    if (dest === NO_TRADE_DEST || dest < 0 || dest >= MAX_SEATS) return;
    if (!legal[row][dest]) return;
    const destId = order[dest];
    if (destId === undefined) return;
    if (state.ownership[pos] === destId) return; // no-op move
    propertyTo[pos] = destId;
    movedAssets++;
  });

  for (const { row, source } of GOJF_ROWS) {
    const dest = action.assetDest[row] ?? NO_TRADE_DEST;
    if (dest === NO_TRADE_DEST || dest < 0 || dest >= MAX_SEATS) continue;
    if (!legal[row][dest]) continue;
    const destId = order[dest];
    if (destId === undefined) continue;
    if (state.jailFreeCards[source] === destId) continue;
    gojfTo[source] = destId;
    movedAssets++;
  }

  // Cash: seat-relative → player id, proposer balanced to net exactly zero. Only
  // ACTIVE (non-bankrupt) opponents may be cash parties — the engine rejects an
  // "unknown cash party" otherwise — so a delta aimed at an absent / bankrupt
  // slot is dropped.
  const cashDelta: Record<string, number> = {};
  let othersSum = 0;
  for (let slot = 1; slot < MAX_SEATS; slot++) {
    const id = order[slot];
    if (id === undefined) continue;
    const player = state.players.find((p) => p.id === id);
    if (player === undefined || player.bankrupt) continue;
    const raw = action.cash[slot] ?? 0;
    const amount = Math.round(raw);
    if (amount === 0) continue;
    cashDelta[id] = amount;
    othersSum += amount;
  }
  const meId = order[0];
  if (meId !== undefined && othersSum !== 0) {
    cashDelta[meId] = -othersSum;
  }

  const movesCash = Object.values(cashDelta).some((v) => v !== 0);
  if (movedAssets === 0 && !movesCash) return null;
  return { propertyTo, gojfTo, cashDelta };
}

/** Whether the current debtor (anyone below zero) is `seat` — exposed so the
 *  observation builder can flag the must-raise-cash actor without re-deriving
 *  it. Thin re-export of the engine helper for the RL modules' convenience. */
export function isDebtor(state: GameState, seat: string): boolean {
  return firstNegativePlayer(state) === seat;
}
