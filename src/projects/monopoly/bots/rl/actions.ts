import { BID_INCREMENT, SPACES } from "../../data";
import { groupPositions } from "../../development";
import { isLegal, netWorth } from "../../engine";
import type {
  GameState,
  Intent,
  PropertyColor,
  TradeTerms,
} from "../../types";
import { applyCandidate, type CandidateOp } from "./candidates";

// ---------------------------------------------------------------------------
// The ATOMIC ACTION VOCABULARY — the capability core of the learned bot
// (RL-DESIGN.md §3.1 / §5 step 2). Where `candidates.ts` enumerates a VARIABLE
// list of whole-action candidates (great for 1-ply lookahead and rollout
// search), a learned policy head needs a FIXED-WIDTH action space: one slot per
// atomic token, the same indices in every state, with a per-state legality MASK.
//
// The design (RL-DESIGN.md): don't emit whole trades/builds as one action (that
// space is unbounded). Instead a fixed token vocabulary, one token per decision
// point, legality-masked. Complex actions (a multi-party trade, developing a set
// to hotels) emerge as SEQUENCES of atomic tokens across the engine's existing
// multi-step intermissions: arm → edit the draft (toggle a property, set cash) →
// propose. The engine already atomizes actions across decision points, so the
// "autoregression" is the engine's intermission machinery — the net needs no
// recurrent decoder, just a masked softmax over this fixed vocabulary each step.
//
// FULL CAPABILITY: every legal move a human can make is expressible.
//   - Reactive: ROLL, BUY, DECLINE, RAISE_TO_BUY, bid buckets, jail, trade votes.
//   - Development: build/sell any owned set to any level; mortgage / unmortgage
//     any lot; stage a mortgage raise to afford a buy (raising-cash).
//   - Trades: arm, then assign any owned lot to any seat (give or take, 2-party
//     per opponent and N-party across them), set a bucketed cash delta, propose.
//
// THE MASK IS SOUND BY CONSTRUCTION. `isLegal(state, intent)` is literally
// `apply(state, intent).ok` (engine.ts), so a token is legal iff applying it
// succeeds — `legalActions` filters on exactly that, which is the guarantee MCTS
// and the policy head rely on: every UNMASKED token can be applied without a
// rejection (`applyCandidate` never throws on a masked-legal token).
//
// PURE & FIXED-WIDTH. A slot's legality and its resolved op are a pure function
// of `GameState` — no hidden "selected counterparty" memory (the trade draft in
// `turn.tradeDraft` carries all in-progress state), so the encoding stays
// deterministic and MCTS-reproducible. `ACTION_COUNT` / `ACTION_NAMES` are fixed.
// ---------------------------------------------------------------------------

/** The eight color groups, board order — matches `features.ts`. */
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

/** Every ownable square's board position (22 properties + 4 railroads + 2
 *  utilities), board order — the per-lot tokens iterate these. */
const OWNABLE_POSITIONS: readonly number[] = SPACES.flatMap((s, i) =>
  s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? [i]
    : [],
);

/** Seat slots a trade assignment can target (0…7; slot 0 is me, so assigning an
 *  opponent's lot to seat 0 is how the proposer TAKES it). Mirrors `features.ts`'s
 *  8-hue cap. */
const ASSIGN_SEATS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Development levels a set can be driven to (0 bare … 5 hotel). A target BELOW
 *  the set's current top sells houses; above it builds. One token per level, so
 *  the policy can reach any development in a single commit. */
const BUILD_LEVELS: readonly number[] = [0, 1, 2, 3, 4, 5];

/** Bid-ladder buckets: fractions from the minimum legal raise (0) up to the
 *  net-worth cap (1). Four discrete aggressions; `isLegal` drops any that aren't
 *  a legal raise (≤ high bid, or above the recoverable cap). */
const BID_FRACTIONS: readonly number[] = [0, 1 / 3, 2 / 3, 1];

/** Bucketed cash deltas (MY net change) for a 2-party trade: I pay (negative) or
 *  receive (positive), plus a "clear cash" 0. Granular enough to sweeten or
 *  extract a premium; finer amounts are reachable by re-bucketing across turns. */
const CASH_BUCKETS: readonly number[] = [
  -400, -200, -100, -50, 0, 50, 100, 200, 400,
];

/** A `manage` commit for one incremental change (build/sell a set to a level, or
 *  flip one lot's mortgage), valid in `managing` for the manager. */
function manageOp(
  pid: string,
  build: Record<number, number>,
  mortgage: Record<number, boolean>,
): CandidateOp {
  const intent: Intent = { kind: "manage", playerId: pid, build, mortgage };
  return { kind: "intent", intent };
}

function draftOp(pid: string, terms: TradeTerms): CandidateOp {
  return { kind: "intent", intent: { kind: "update-trade-draft", playerId: pid, terms } };
}

/** The player id at seat-relative slot `seat` (0 = me), or null past the table. */
function seatId(state: GameState, meId: string, seat: number): string | null {
  const players = state.players;
  const myIdx = players.findIndex((p) => p.id === meId);
  const n = players.length;
  if (myIdx < 0 || seat >= n) return null;
  return players[(myIdx + seat) % n].id;
}

/** The opponent a cash delta is paired with: the first non-me player already
 *  involved in the draft (receiving a property, having one taken from them, or
 *  named in gojf/cash). Null when no counterparty is established yet, which masks
 *  the cash tokens — you set cash WITH someone, after assigning a property. */
function draftCounterparty(state: GameState, meId: string): string | null {
  const d = state.turn.tradeDraft;
  if (!d) return null;
  for (const [posStr, to] of Object.entries(d.propertyTo)) {
    if (to !== meId) return to;
    const from = state.ownership[Number(posStr)];
    if (from && from !== meId) return from;
  }
  for (const to of Object.values(d.gojfTo)) {
    if (to && to !== meId) return to;
  }
  for (const id of Object.keys(d.cashDelta)) {
    if (id !== meId) return id;
  }
  return null;
}

/** One fixed slot in the vocabulary: a stable `name` and a pure resolver that
 *  returns the `CandidateOp` this token means in the given state, or null when
 *  the token is structurally inapplicable (wrong phase / seat / no such lot). A
 *  non-null op is then legality-checked; null is always masked out. */
interface Slot {
  name: string;
  resolve: (state: GameState, pid: string) => CandidateOp | null;
}

/** A single intent slot, gated to fire only when `when(state, pid)` holds. */
function intentSlot(
  name: string,
  when: (state: GameState, pid: string) => boolean,
  make: (state: GameState, pid: string) => Intent,
): Slot {
  return {
    name,
    resolve: (state, pid) =>
      when(state, pid) ? { kind: "intent", intent: make(state, pid) } : null,
  };
}

const active = (s: GameState, pid: string): boolean => s.turn.playerId === pid;
const phaseIs = (s: GameState, p: GameState["turn"]["phase"]): boolean =>
  s.turn.phase === p;

function buildSlots(): Slot[] {
  const slots: Slot[] = [];

  // --- Global reactive tokens (fixed, no parameters). -------------------------

  // ROLL: the mechanical advance — only a real, legal choice at pre-roll (just
  // roll, declining to arm) and at a jail decision (serve it out / roll doubles).
  // Never offered at a true decision phase, so it can't bypass a buy/auction.
  slots.push({
    name: "ROLL",
    resolve: (s, pid) =>
      active(s, pid) &&
      (phaseIs(s, "pre-roll") || (phaseIs(s, "jail-decision")))
        ? { kind: "step" }
        : null,
  });
  slots.push(
    intentSlot(
      "BUY",
      (s, pid) =>
        active(s, pid) && (phaseIs(s, "buy-decision") || phaseIs(s, "raising-cash")),
      (_s, pid) => ({ kind: "buy", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "DECLINE",
      (s, pid) => active(s, pid) && phaseIs(s, "buy-decision"),
      (_s, pid) => ({ kind: "decline-buy", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "RAISE_TO_BUY",
      (s, pid) => active(s, pid) && phaseIs(s, "buy-decision"),
      (_s, pid) => ({ kind: "raise-cash", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "END_TURN",
      (s, pid) => active(s, pid) && phaseIs(s, "post-roll"),
      (_s, pid) => ({ kind: "end-turn", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "BID_PASS",
      (s) => phaseIs(s, "auction"),
      (_s, pid) => ({ kind: "pass-bid", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "JAIL_PAY",
      (s, pid) => active(s, pid) && phaseIs(s, "jail-decision"),
      (_s, pid) => ({ kind: "pay-to-leave-jail", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "JAIL_CARD",
      (s, pid) => active(s, pid) && phaseIs(s, "jail-decision"),
      (_s, pid) => ({ kind: "use-jail-card", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "ACCEPT_TRADE",
      (s) => phaseIs(s, "trade-pending"),
      (s, pid) => ({ kind: "accept-trade", playerId: pid, tradeId: s.turn.pendingTrade?.id ?? "" }),
    ),
  );
  slots.push(
    intentSlot(
      "DECLINE_TRADE",
      (s) => phaseIs(s, "trade-pending"),
      (s, pid) => ({ kind: "decline-trade", playerId: pid, tradeId: s.turn.pendingTrade?.id ?? "" }),
    ),
  );
  // Arming a boundary intermission. Trade may be armed off-turn (off-turn trades
  // are enabled); manage is own-turn only — both at a turn boundary (pre-roll or
  // a jailed seat's jail decision).
  const atBoundary = (s: GameState): boolean =>
    phaseIs(s, "pre-roll") || phaseIs(s, "jail-decision");
  slots.push(
    intentSlot(
      "ARM_TRADE",
      (s) => atBoundary(s),
      (_s, pid) => ({ kind: "set-queue", playerId: pid, queue: "trade", armed: true }),
    ),
  );
  slots.push(
    intentSlot(
      "ARM_MANAGE",
      (s, pid) => active(s, pid) && atBoundary(s),
      (_s, pid) => ({ kind: "set-queue", playerId: pid, queue: "manage", armed: true }),
    ),
  );
  slots.push(
    intentSlot(
      "PROPOSE_TRADE",
      (s, pid) => phaseIs(s, "trade-building") && s.turn.tradeDraft?.proposerId === pid,
      (_s, pid) => ({ kind: "propose-trade", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "CANCEL_TRADE",
      (s, pid) => phaseIs(s, "trade-building") && s.turn.tradeDraft?.proposerId === pid,
      (_s, pid) => ({ kind: "cancel-trade", playerId: pid }),
    ),
  );
  slots.push(
    intentSlot(
      "CANCEL_MANAGE",
      (s, pid) => active(s, pid) && (phaseIs(s, "managing") || phaseIs(s, "raising-cash")),
      (_s, pid) => ({ kind: "cancel-manage", playerId: pid }),
    ),
  );

  // --- Bid ladder buckets (auction). -----------------------------------------
  BID_FRACTIONS.forEach((frac, k) => {
    slots.push({
      name: `BID_${k}`,
      resolve: (s, pid) => {
        const auction = s.turn.auction;
        if (!auction || !phaseIs(s, "auction")) return null;
        const minBid = auction.highBid + BID_INCREMENT;
        const cap = netWorth(s, pid);
        const amount = Math.round(minBid + frac * Math.max(0, cap - minBid));
        return { kind: "intent", intent: { kind: "bid", playerId: pid, amount } };
      },
    });
  });

  // --- Development: drive each set to each level (build up / sell down). ------
  COLORS.forEach((color) => {
    const positions = groupPositions(color);
    BUILD_LEVELS.forEach((level) => {
      slots.push({
        name: `BUILD:${color}:L${level}`,
        resolve: (s, pid) => {
          if (!(phaseIs(s, "managing") && s.turn.managerId === pid)) return null;
          const build: Record<number, number> = {};
          for (const p of positions) build[p] = level;
          return manageOp(pid, build, {});
        },
      });
    });
  });

  // --- Per-lot mortgage / unmortgage. ----------------------------------------
  OWNABLE_POSITIONS.forEach((pos) => {
    // Mortgaging raises cash in three contexts, each with its own intent: a
    // forced settler's standalone mortgage (must-raise-cash), a staged raise to
    // fund a buy (raising-cash → update-manage-staging), and a voluntary manage.
    slots.push({
      name: `MORTGAGE:sq${pos}`,
      resolve: (s, pid) => {
        if (phaseIs(s, "must-raise-cash")) {
          return { kind: "intent", intent: { kind: "mortgage", playerId: pid, position: pos } };
        }
        if (phaseIs(s, "raising-cash") && active(s, pid)) {
          const staged = s.turn.manageStaged ?? { build: {}, mortgage: {} };
          const mortgage = { ...staged.mortgage, [pos]: true };
          return {
            kind: "intent",
            intent: {
              kind: "update-manage-staging",
              playerId: pid,
              staged: { build: staged.build, mortgage },
            },
          };
        }
        if (phaseIs(s, "managing") && s.turn.managerId === pid) {
          return manageOp(pid, {}, { [pos]: true });
        }
        return null;
      },
    });
  });
  OWNABLE_POSITIONS.forEach((pos) => {
    slots.push({
      name: `UNMORTGAGE:sq${pos}`,
      resolve: (s, pid) =>
        phaseIs(s, "managing") && s.turn.managerId === pid
          ? manageOp(pid, {}, { [pos]: false })
          : null,
    });
  });

  // --- Trade construction: assign a lot to a seat (give/take, toggle). --------
  OWNABLE_POSITIONS.forEach((pos) => {
    ASSIGN_SEATS.forEach((seat) => {
      slots.push({
        name: `ASSIGN:sq${pos}->seat${seat}`,
        resolve: (s, pid) => {
          if (!(phaseIs(s, "trade-building") && s.turn.tradeDraft?.proposerId === pid)) {
            return null;
          }
          const owner = s.ownership[pos];
          if (!owner) return null; // unowned lots aren't tradeable
          const cpId = seatId(s, pid, seat);
          if (!cpId) return null;
          const draft = s.turn.tradeDraft;
          const propertyTo: Record<number, string> = { ...draft.propertyTo };
          if (propertyTo[pos] === cpId) {
            delete propertyTo[pos]; // toggle off
          } else {
            // Assigning a lot to its current owner with no prior draft entry is a
            // no-op — skip so the token stays meaningful.
            if (owner === cpId && !(pos in draft.propertyTo)) return null;
            propertyTo[pos] = cpId;
          }
          return draftOp(pid, {
            propertyTo,
            gojfTo: draft.gojfTo,
            cashDelta: draft.cashDelta,
          });
        },
      });
    });
  });

  // --- Trade cash: a bucketed 2-party delta with the established counterparty. -
  CASH_BUCKETS.forEach((v) => {
    slots.push({
      name: `CASH:${v}`,
      resolve: (s, pid) => {
        if (!(phaseIs(s, "trade-building") && s.turn.tradeDraft?.proposerId === pid)) {
          return null;
        }
        const draft = s.turn.tradeDraft;
        const cp = draftCounterparty(s, pid);
        if (!cp) return null;
        const cashDelta: Record<string, number> = v === 0 ? {} : { [pid]: v, [cp]: -v };
        return draftOp(pid, {
          propertyTo: draft.propertyTo,
          gojfTo: draft.gojfTo,
          cashDelta,
        });
      },
    });
  });

  return slots;
}

const SLOTS: readonly Slot[] = buildSlots();

/** Human-readable name of each action slot, index-aligned with the token id. */
export const ACTION_NAMES: readonly string[] = SLOTS.map((s) => s.name);

/** The fixed width of the action vocabulary — the size of the policy head. */
export const ACTION_COUNT = SLOTS.length;

/** One legal atomic action: its fixed `token` id (index into the vocabulary),
 *  the `op` to apply, and a short `label` (= the slot name). */
export interface Action {
  token: number;
  op: CandidateOp;
  label: string;
}

/** Every atomic action `pid` may legally take right now, each tagged with its
 *  fixed token id. The complement is the mask: a token absent here is illegal in
 *  this state. Every returned op is guaranteed appliable — `step` always is, and
 *  intents are filtered through `isLegal` (= `apply().ok`), so `applyCandidate`
 *  never throws on a returned action. Returns `[]` when the seat owes no move. */
export function legalActions(state: GameState, pid: string): Action[] {
  if (state.status !== "active") return [];
  const out: Action[] = [];
  for (let token = 0; token < SLOTS.length; token++) {
    const op = SLOTS[token].resolve(state, pid);
    if (op === null) continue;
    if (op.kind === "step" || isLegal(state, op.intent)) {
      out.push({ token, op, label: SLOTS[token].name });
    }
  }
  return out;
}

/** A boolean legality mask over the fixed vocabulary — `mask[token]` is true iff
 *  that token is legal now. The policy head multiplies its logits by this (or
 *  sets masked logits to −∞) before the softmax. */
export function legalMask(state: GameState, pid: string): boolean[] {
  const mask = new Array<boolean>(SLOTS.length).fill(false);
  for (const a of legalActions(state, pid)) mask[a.token] = true;
  return mask;
}

export { applyCandidate };
