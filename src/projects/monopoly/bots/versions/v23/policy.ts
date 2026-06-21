// ===========================================================================
// v23 SNAPSHOT — fork of the champion v17 (see EVOLUTION.md). The dispatcher and trade
// engine are VERBATIM; v23's only change is in `./valuation.ts` `planBuild` — it RECLAIMS
// a dead (mortgaged) monopoly at a thinner cushion (floor + RECLAIM_CUSHION 200) instead
// of waiting for full "flush" (floor + HOTEL_CUSHION 600), redeploying idle capital
// sooner to restore a frozen set's double-rent. Carries v17's lower reserve verbatim. The
// Bot contract is imported from `../../decision`, not snapshotted. Exposed as `v23Bot`.
// ===========================================================================
import { colorAt, groupPositions } from "../../../development";
import { auctionBidCap, BID_INCREMENT, firstNegativePlayer } from "../../../engine";
import { heldJailCard, ownablePrice } from "../../../logic";
import type { GameState, ManageStaged, TradeTerms } from "../../../types";
import type { BotDecision } from "../../decision";
import {
  acquisitionValue,
  activeOpponents,
  colorName,
  jailChoice,
  liquidityFloor,
  mortgageableTotal,
  ownedInColor,
  planBuild,
  planRaiseByMortgage,
  raiseCashStep,
  spaceName,
} from "./valuation";
import { evaluateTrade, proposeBestTrade } from "./trades";

/** The "Claude" bot — a genuinely challenging, pro-level opponent, and the one
 *  that exercises the full proactive surface: it arms builds and trades at the
 *  turn boundary (its own AND off-turn), raises cash to buy properties it judges
 *  worth owning, and explains every decision in a "BOT" log note.
 *
 *  One pure dispatcher over the phases a bot is consulted in. Each handler reads
 *  the shared strategic model in `valuation.ts` / `trades.ts` (everything keys
 *  off `positionValue` — a move is good iff it raises my position's worth) and
 *  returns a `BotDecision`: the intent plus the reasoning to surface. Reactive
 *  phases (buy, auction, jail, settle, trade vote) note on the decision itself;
 *  the proactive arm→intermission→commit flows note on the ARM (which explains
 *  the plan), then commit silently so the log reads once, not twice.
 *
 *  See `bots/valuation.ts`, `bots/trades.ts`, and `monopoly/CLAUDE.md` "Bots".
 *
 *  v23 change (vs the v17 base): `./valuation.ts` `planBuild` reclaims a dead
 *  (mortgaged) monopoly at a thinner cushion (floor + `RECLAIM_CUSHION` 200) rather than
 *  waiting for full "flush" — redeploying idle capital sooner to turn a frozen set's
 *  double-rent back on. v17's lower reserve, desiredLevel, and the whole trade engine
 *  are carried verbatim. */
export function policy(state: GameState, playerId: string): BotDecision | null {
  switch (state.turn.phase) {
    case "pre-roll":
      return preRoll(state, playerId);
    case "buy-decision":
      return buyDecision(state, playerId);
    case "raising-cash":
      return raisingCash(state, playerId);
    case "auction":
      return auction(state, playerId);
    case "must-raise-cash":
      return mustRaiseCash(state, playerId);
    case "managing":
      return managing(state, playerId);
    case "trade-building":
      return tradeBuilding(state, playerId);
    case "trade-pending":
      return tradePending(state, playerId);
    case "jail-decision":
      return jailDecision(state, playerId);
    // post-roll (end-turn) and game-over are mechanical / terminal — the pacer
    // drives them, not the policy.
    default:
      return null;
  }
}

/** How willing to raise cash to buy: own it when it's worth clearly more than
 *  its price (set completion, denial, prime set). */
const RAISE_WORTH_MULT = 1.25;
/** How willing to dip below the liquidity reserve for an affordable buy: only
 *  for properties worth well over face. */
const DIP_WORTH_MULT = 1.4;

// ---------------------------------------------------------------------------
// Pre-roll: proactively arm a boundary action. Trade first (acquire before
// developing), then build — but only when there's a state-changing action the
// commit handler will actually make, so the arm/commit agree and the bot never
// spins. Trades may be armed off-turn; builds only on the bot's own turn.
// ---------------------------------------------------------------------------
function preRoll(state: GameState, pid: string): BotDecision | null {
  const proposal = proposeBestTrade(state, pid);
  if (proposal !== null) {
    return {
      intent: { kind: "set-queue", playerId: pid, queue: "trade", armed: true },
      note: proposal.reason,
    };
  }
  if (state.turn.playerId === pid) {
    const plan = planBuild(state, pid);
    if (plan !== null) {
      return {
        intent: { kind: "set-queue", playerId: pid, queue: "manage", armed: true },
        note: plan.reason,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Buy / raise-to-buy. Buy nearly everything affordable for leverage and denial —
// the exceptions: don't dip below the rent reserve for a poor-value lot, and
// when short on cash, only mortgage to buy something genuinely worth owning.
// ---------------------------------------------------------------------------
function buyDecision(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const pos = state.turn.pendingBuy;
  if (pos === undefined) return null;
  const price = ownablePrice(pos);
  const player = state.players.find((p) => p.id === pid);
  if (price === null || !player) return null;

  const worth = acquisitionValue(state, pid, pos);
  const floor = liquidityFloor(state, pid);
  const context = buyContext(state, pid, pos);
  const name = spaceName(pos);

  if (player.cash >= price) {
    if (player.cash - price >= floor) {
      return {
        intent: { kind: "buy", playerId: pid },
        note: context
          ? `Buying ${name}${context}.`
          : `Buying ${name} — land is leverage, and I keep my reserve.`,
      };
    }
    if (worth >= price * DIP_WORTH_MULT) {
      return {
        intent: { kind: "buy", playerId: pid },
        note: `Buying ${name}${context || " — worth dipping into my reserve for"}.`,
      };
    }
    return {
      intent: { kind: "decline-buy", playerId: pid },
      note: `Passing on ${name} — not worth spending below my rent reserve.`,
    };
  }

  // Short on cash: mortgage to buy only when it's clearly worth owning and
  // mortgaging (no houses sold) covers the price.
  if (
    worth >= price * RAISE_WORTH_MULT &&
    player.cash + mortgageableTotal(state, pid) >= price
  ) {
    return {
      intent: { kind: "raise-cash", playerId: pid },
      note: `${name} is worth owning${context} — raising cash to buy it.`,
    };
  }
  return {
    intent: { kind: "decline-buy", playerId: pid },
    note: `Passing on ${name} — can't afford it and it's not worth liquidating for.`,
  };
}

/** A short phrase for why a buy matters strategically (set completion / denial),
 *  or "" for a routine acquisition. */
function buyContext(state: GameState, pid: string, pos: number): string {
  const color = colorAt(pos);
  if (color === null) return "";
  const total = groupPositions(color).length;
  if (ownedInColor(state, pid, color) === total - 1) {
    return ` to complete my ${colorName(color)} monopoly`;
  }
  for (const opp of activeOpponents(state, pid)) {
    if (ownedInColor(state, opp.id, color) === total - 1) {
      return ` to deny ${opp.name} the ${colorName(color)}`;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Raising cash to buy: stage the mortgage raise, then commit the buy (which
// reads the staged raise and pays atomically). Two pacer beats: stage, then buy.
// ---------------------------------------------------------------------------
function raisingCash(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const pos = state.turn.pendingBuy;
  const player = state.players.find((p) => p.id === pid);
  const price = pos === undefined ? null : ownablePrice(pos);
  // Safety: anything unexpected backs out to the buy-decision (where it declines)
  // rather than wedging the phase.
  if (pos === undefined || price === null || !player) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }
  const need = price - player.cash;
  const mortgage = need > 0 ? planRaiseByMortgage(state, pid, need) : {};
  if (mortgage === null) {
    return { intent: { kind: "cancel-manage", playerId: pid } };
  }
  const staged: ManageStaged = { build: {}, mortgage };
  const current = state.turn.manageStaged ?? { build: {}, mortgage: {} };
  if (sameStaging(current, staged)) {
    return {
      intent: { kind: "buy", playerId: pid },
      note: `Raised the cash — completing the buy of ${spaceName(pos)}.`,
    };
  }
  return { intent: { kind: "update-manage-staging", playerId: pid, staged } };
}

// ---------------------------------------------------------------------------
// Auction: bid up to the property's value to me (which can exceed face for a
// set-completer / denial), capped by what I can actually pay. Bids are silent;
// dropping out gets one explanatory note.
// ---------------------------------------------------------------------------
function auction(state: GameState, pid: string): BotDecision | null {
  const a = state.turn.auction;
  if (!a || !a.active.includes(pid) || a.leaderId === pid) return null;
  const next = a.highBid + BID_INCREMENT;
  const cap = Math.min(acquisitionValue(state, pid, a.position), auctionBidCap(state, pid));
  if (next <= cap) {
    return { intent: { kind: "bid", playerId: pid, amount: next } };
  }
  return {
    intent: { kind: "pass-bid", playerId: pid },
    note: `Dropping out — ${spaceName(a.position)} isn't worth a $${next.toString()} bid to me.`,
  };
}

// ---------------------------------------------------------------------------
// Forced settle: liquidate value-preserving (least-essential first, monopolies
// last) until back to solvent.
// ---------------------------------------------------------------------------
function mustRaiseCash(state: GameState, pid: string): BotDecision | null {
  if (firstNegativePlayer(state) !== pid) return null;
  const step = raiseCashStep(state, pid);
  return step === null ? null : { intent: step.intent, note: step.reason };
}

// ---------------------------------------------------------------------------
// Managing intermission (armed at pre-roll): commit the build plan — including
// any mortgage lifts the plan stages to reclaim a dead (mortgaged) monopoly,
// applied raise-first with the build in one atomic commit. Note-less — the arm
// already explained it; the BUILD / UNMORTGAGE log rows show the result.
// ---------------------------------------------------------------------------
function managing(state: GameState, pid: string): BotDecision | null {
  if (state.turn.managerId !== pid) return null;
  const plan = planBuild(state, pid);
  if (plan === null) return null; // pacer cancels the now-empty intermission
  return {
    intent: { kind: "manage", playerId: pid, build: plan.build, mortgage: plan.mortgage },
  };
}

// ---------------------------------------------------------------------------
// Trade-building intermission (armed at pre-roll): set the draft to the planned
// terms, then propose. Note-less — the arm explained the plan.
// ---------------------------------------------------------------------------
function tradeBuilding(state: GameState, pid: string): BotDecision | null {
  const draft = state.turn.tradeDraft;
  if (!draft || draft.proposerId !== pid) return null;
  const proposal = proposeBestTrade(state, pid);
  if (proposal === null) return null; // pacer cancels
  if (sameTerms(draft, proposal.terms)) {
    return { intent: { kind: "propose-trade", playerId: pid } };
  }
  return { intent: { kind: "update-trade-draft", playerId: pid, terms: proposal.terms } };
}

// ---------------------------------------------------------------------------
// Trade vote (reactive, possibly off-turn): accept only deals that raise my
// position and don't hand a rival a stronger monopoly than I get.
// ---------------------------------------------------------------------------
function tradePending(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;
  const verdict = evaluateTrade(state, pid, pending);
  return verdict.accept
    ? {
        intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id },
        note: `Accepting — ${verdict.reason}.`,
      }
    : {
        intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id },
        note: `Declining — ${verdict.reason}.`,
      };
}

// ---------------------------------------------------------------------------
// Jail: leave early/safe boards, sit on dangerous ones. A "stay" is a roll
// (null → the pacer rolls); only the leave choices carry a note.
// ---------------------------------------------------------------------------
function jailDecision(state: GameState, pid: string): BotDecision | null {
  // The engine only opens `jail-decision` for the jailed active player, so the
  // turn-owner check is the only gate needed.
  if (state.turn.playerId !== pid) return null;
  const choice = jailChoice(state, pid, heldJailCard(state, pid));
  if (choice.intent !== null) return { intent: choice.intent, note: choice.reason };
  // Staying in jail is a roll — a mechanical step, not an intent — so it can't
  // carry a `note` the way the leave choices do. Surface the reasoning as a
  // one-time `bot-note` instead, then return null so the pacer rolls. Dedup
  // against the current turn group: without it, every re-consult would re-emit
  // the note and spin the phase instead of ever rolling.
  if (jailStayNoted(state, pid, choice.reason)) return null;
  return { intent: { kind: "bot-note", playerId: pid, text: choice.reason } };
}

/** Has `pid` already logged this exact stay-in-jail note in the current turn
 *  group? A turn group holds at most one jail deliberation, so an exact match
 *  means the note was just emitted and the next beat should roll. */
function jailStayNoted(state: GameState, pid: string, text: string): boolean {
  // Active play always has at least one turn group (the current player's).
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some(
    (e) => e.kind === "bot-note" && e.playerId === pid && e.text === text,
  );
}

// ---------------------------------------------------------------------------
// Small structural-equality helpers — let the arm/commit handlers recognize when
// the live draft / staging already matches the plan, so the next beat commits
// rather than re-staging (which would loop).
// ---------------------------------------------------------------------------

function sortedEntries(o: Readonly<Record<number | string, unknown>>): string {
  return Object.keys(o)
    .sort()
    .map((k) => `${k}:${String(o[k])}`)
    .join(",");
}

function sameStaging(a: ManageStaged, b: ManageStaged): boolean {
  return (
    sortedEntries(a.build) === sortedEntries(b.build) &&
    sortedEntries(a.mortgage) === sortedEntries(b.mortgage)
  );
}

function sameTerms(a: TradeTerms, b: TradeTerms): boolean {
  return (
    sortedEntries(a.propertyTo) === sortedEntries(b.propertyTo) &&
    sortedEntries(a.gojfTo) === sortedEntries(b.gojfTo) &&
    sortedEntries(a.cashDelta) === sortedEntries(b.cashDelta)
  );
}
