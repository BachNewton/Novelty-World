import { BID_INCREMENT } from "../../data";
import { groupPositions } from "../../development";
import {
  apply,
  autoStep,
  firstNegativePlayer,
  isLegal,
  netWorth,
} from "../../engine";
import { hasMonopoly, heldJailCard, spaceName } from "../../logic";
import type { GameState, Intent, PropertyColor } from "../../types";
import { forcedRaiseStep } from "../fallback";

// ---------------------------------------------------------------------------
// Phase 1 of the learned-bot path (see monopoly/CLAUDE.md "Bots" and the design
// discussion): a PURE legal-action enumerator. `legalCandidates(state, playerId)`
// returns the moves that seat may legally make at the CURRENT decision point —
// the action half of a learned policy, the companion to `features.ts`.
//
// Why an enumerator and not a policy head that emits raw intents: Monopoly's
// action space is awkward for a learned model. The simple phases (buy / decline,
// bid, jail, accept-or-decline, the pre-roll arm) are a tiny discrete set, but
// trades and manage-builds are COMBINATORIAL (arbitrary property + cash
// reassignments). The hybrid design (see the discussion) sidesteps that: a model
// SCORES candidates rather than constructs them. With the pure engine you can go
// one step further — `applyCandidate` lets a value net do exact 1-ply lookahead
// (apply each candidate, evaluate the resulting state, pick the best), which is
// why the applier lives here next to the enumerator.
//
// What this covers, and the seam it leaves open:
//   - FULLY ENUMERATED (the bulk of real decisions): pre-roll arming, post-roll,
//     buy-decision, auction, jail-decision, trade-pending votes, and
//     must-raise-cash liquidation (one candidate per mortgageable lot). These are
//     immediately usable to train a value net via lookahead.
//   - CONSTRUCTED HERE: `managing` enumerates real build commits — develop each
//     owned (unmortgaged) monopoly evenly to every reachable level, as atomic
//     `manage` intents the engine validates (`planDevelopment`). This is the first
//     construction generator; it's deliberately bounded to even single-set builds
//     (the bulk of useful development) and is extensible (mortgage-funded builds,
//     unmortgage-and-redeploy, multi-set commits).
//   - TERMINAL-ONLY (still combinatorial): trade-building and raising-cash return
//     only their commit / cancel exits — constructing a trade draft / raise
//     staging is the next generator slice. A generator plugs in by producing the
//     `update-trade-draft` / `update-manage-staging` + commit sequence.
//
// Legality is the engine's, never ours: every enumerated intent is run through
// `isLegal` before it's returned, so a caller can apply any candidate without a
// rejection — the same guarantee the pacer relies on (`pacing.ts` `legalOp`). A
// seat that owes no decision right now gets `[]` (the "not me" case), mirroring a
// `Bot` returning `null`.
//
// Anti-loop guards (one proactive window per turn-group via `boundaryServed`,
// trade re-pitch memory) are POLICY, not legality, so they live in the driving
// policy/pacer — not in this pure legality enumerator. A learned policy that arms
// trades must apply them just as the rule-based bots do (see bots/CLAUDE.md
// "Trades").
// ---------------------------------------------------------------------------

/** What a candidate does to the game: submit an `intent`, or take the engine's
 *  mechanical `step` (roll the dice / drain to the next decision). The `step`
 *  variant is a real CHOICE in some phases — at a jail decision it's "serve it
 *  out / roll for doubles" (declining to pay or use a card), and at pre-roll it's
 *  "just roll" (declining to arm a trade/build). Mirrors `pacing.ts` `DriveOp`. */
export type CandidateOp =
  | { kind: "intent"; intent: Intent }
  | { kind: "step" };

/** One legal move available to a seat at the current state, plus a short
 *  human-readable `label` for logging / debugging the action set. */
export interface Candidate {
  op: CandidateOp;
  label: string;
}

/** The mechanical "roll / advance" candidate — declining every active intent. */
const STEP: Candidate = { op: { kind: "step" }, label: "roll" };

function intent(i: Intent, label: string): Candidate {
  return { op: { kind: "intent", intent: i }, label };
}

/** Whether `playerId` already has a `kind` window queued — a redundant arm the
 *  engine would treat as a no-op, so it isn't offered as a distinct candidate. */
function isArmed(
  state: GameState,
  playerId: string,
  kind: "trade" | "manage",
): boolean {
  return state.boundaryQueue.some(
    (e) => e.playerId === playerId && e.kind === kind,
  );
}

function auctionCandidates(state: GameState, pid: string): Candidate[] {
  const auction = state.turn.auction;
  if (!auction) return [];
  // Only a still-in, non-leader seat owes a bid-or-drop; the leader can't drop
  // and needn't act.
  if (!auction.active.includes(pid) || auction.leaderId === pid) return [];
  const cands: Candidate[] = [intent({ kind: "pass-bid", playerId: pid }, "drop out")];
  // A bounded bid ladder — the minimum legal raise and an all-in to the net-worth
  // cap. `isLegal` drops the cap bid when it isn't above the high (or exceeds the
  // recoverable cap); a richer amount head can replace this in a later phase.
  const minBid = auction.highBid + BID_INCREMENT;
  cands.push(intent({ kind: "bid", playerId: pid, amount: minBid }, `bid ${minBid}`));
  const cap = netWorth(state, pid);
  if (cap > minBid) {
    cands.push(intent({ kind: "bid", playerId: pid, amount: cap }, `bid cap ${cap}`));
  }
  return cands;
}

function jailCandidates(state: GameState, pid: string): Candidate[] {
  if (state.turn.playerId !== pid) return [];
  const player = state.players.find((p) => p.id === pid);
  if (!player || !player.inJail) return [];
  const cands: Candidate[] = [
    intent({ kind: "pay-to-leave-jail", playerId: pid }, "pay $50"),
  ];
  if (heldJailCard(state, pid) !== null) {
    cands.push(intent({ kind: "use-jail-card", playerId: pid }, "use GOJF card"));
  }
  // Stay and roll (the mechanical jail roll — doubles to escape, or serve out).
  cands.push(STEP);
  return cands;
}

function tradePendingCandidates(state: GameState, pid: string): Candidate[] {
  const pending = state.turn.pendingTrade;
  if (!pending) return [];
  // Only an un-voted named party owes a vote.
  if (!(pid in pending.approvals) || pending.approvals[pid]) return [];
  return [
    intent({ kind: "accept-trade", playerId: pid, tradeId: pending.id }, "accept trade"),
    intent({ kind: "decline-trade", playerId: pid, tradeId: pending.id }, "decline trade"),
  ];
}

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

/** Develop commits: for each color the player fully owns and hasn't mortgaged,
 *  one `manage` intent per reachable level above the set's current top — taking
 *  the whole set evenly to that level. Even-by-construction (all lots to the same
 *  level), so the only thing `isLegal` can reject is affordability or a building
 *  shortage. Bounded to even single-set builds — the bulk of useful development;
 *  mortgage-funded / multi-set / unmortgage-and-redeploy commits are the next
 *  generator slice. */
function buildCandidates(state: GameState, pid: string): Candidate[] {
  const out: Candidate[] = [];
  for (const color of COLORS) {
    if (!hasMonopoly(state, color, pid)) continue;
    const positions = groupPositions(color);
    if (positions.some((p) => state.mortgaged[p])) continue;
    let top = 0;
    for (const p of positions) top = Math.max(top, state.houses[p] ?? 0);
    for (let level = top + 1; level <= 5; level++) {
      const build: Record<number, number> = {};
      for (const p of positions) build[p] = level;
      out.push(intent({ kind: "manage", playerId: pid, build, mortgage: {} }, `build ${color} → L${level}`));
    }
  }
  return out;
}

function mustRaiseCandidates(state: GameState, pid: string): Candidate[] {
  // The settler is whoever is below zero (possibly off-turn), not the active
  // player.
  if (firstNegativePlayer(state) !== pid) return [];
  const cands: Candidate[] = [];
  // One candidate per lot the player could mortgage; `isLegal` filters those
  // that can't be (already mortgaged, or a built color group).
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    cands.push(intent({ kind: "mortgage", playerId: pid, position: pos }, `mortgage ${spaceName(pos)}`));
  }
  // The forced fallback step covers the case where only DEVELOPED property is
  // left (mortgaging is illegal then) — a `manage` that sells a built set down.
  // Mortgage steps are already enumerated above, so only add a non-mortgage one.
  const forced = forcedRaiseStep(state, pid);
  if (forced && forced.kind !== "mortgage") {
    cands.push(intent(forced, "sell a built set (forced)"));
  }
  return cands;
}

/** Enumerate the legal moves `pid` may make at the current decision point, or
 *  `[]` if the seat owes no decision now. Every returned candidate is guaranteed
 *  legal on `state` (intents are filtered through `isLegal`; `step` is only
 *  emitted where the engine can mechanically advance). */
export function legalCandidates(state: GameState, pid: string): Candidate[] {
  if (state.status !== "active") return [];
  return rawCandidates(state, pid).filter(
    (c) => c.op.kind === "step" || isLegal(state, c.op.intent),
  );
}

function rawCandidates(state: GameState, pid: string): Candidate[] {
  const { phase, playerId } = state.turn;
  const active = playerId === pid;

  switch (phase) {
    case "pre-roll": {
      // The active seat may roll or proactively arm a build/trade; an off-turn
      // seat may arm a trade (off-turn trades are enabled — see CLAUDE.md).
      const cands: Candidate[] = [];
      if (active) cands.push(STEP);
      const kinds = active ? (["manage", "trade"] as const) : (["trade"] as const);
      for (const kind of kinds) {
        if (!isArmed(state, pid, kind)) {
          cands.push(intent({ kind: "set-queue", playerId: pid, queue: kind, armed: true }, `arm ${kind}`));
        }
      }
      return cands;
    }
    case "post-roll":
      return active ? [intent({ kind: "end-turn", playerId: pid }, "end turn")] : [];
    case "buy-decision":
      // Terminating choices (buy / decline) first, then the sub-phase-entering
      // raise-cash: a value consumer that breaks ties by list order then can't
      // livelock by repeatedly entering `raising-cash` and cancelling back here.
      return active
        ? [
            intent({ kind: "buy", playerId: pid }, "buy"),
            intent({ kind: "decline-buy", playerId: pid }, "decline"),
            intent({ kind: "raise-cash", playerId: pid }, "raise cash to buy"),
          ]
        : [];
    case "raising-cash":
      // Terminal exits only — the staging itself is heuristic-constructed.
      return active
        ? [
            intent({ kind: "buy", playerId: pid }, "buy (commit staged raise)"),
            intent({ kind: "cancel-manage", playerId: pid }, "cancel raise"),
          ]
        : [];
    case "auction":
      return auctionCandidates(state, pid);
    case "jail-decision":
      return jailCandidates(state, pid);
    case "trade-pending":
      return tradePendingCandidates(state, pid);
    case "must-raise-cash":
      return mustRaiseCandidates(state, pid);
    case "managing":
      // Real build commits (develop each owned monopoly evenly to each reachable
      // level) plus the cancel exit.
      return state.turn.managerId === pid
        ? [
            ...buildCandidates(state, pid),
            intent({ kind: "cancel-manage", playerId: pid }, "cancel manage"),
          ]
        : [];
    case "trade-building":
      // Terminal exits only — draft construction is heuristic-constructed.
      return state.turn.tradeDraft?.proposerId === pid
        ? [
            intent({ kind: "propose-trade", playerId: pid }, "propose trade"),
            intent({ kind: "cancel-trade", playerId: pid }, "cancel trade"),
          ]
        : [];
    default:
      return [];
  }
}

/** Apply a candidate to the state exactly as the authoritative route would — a
 *  `step` runs one `autoStep`, an `intent` runs `apply`. Pure (rng is read from
 *  `state.rngState`), so it doubles as the 1-ply lookahead primitive for a value
 *  net: apply each candidate, score the result, pick the best. Throws if an
 *  intent is rejected — callers should only pass candidates from
 *  `legalCandidates`, which are pre-filtered legal. */
export function applyCandidate(state: GameState, op: CandidateOp): GameState {
  if (op.kind === "step") return autoStep(state).state;
  const result = apply(state, op.intent);
  if (!result.ok) {
    throw new Error(`candidate intent "${op.intent.kind}" rejected: ${result.reason}`);
  }
  return result.state;
}
