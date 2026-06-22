// ===========================================================================
// trade-v1 POLICY — eval-based opponent-modeling trade system.
//
// Forks jane-v3's policy. Inherits ALL non-trade logic verbatim from jane-v3
// (buy, build, jail, auction, raise-cash). ONLY the trade decision points are
// replaced with the new eval-based engine:
//   - preRoll: trades armed via the new TradeEngine.proposeBestTrade
//   - tradeBuilding: commits the new engine's proposal
//   - tradePending: evaluates incoming trades via the new engine + records
//     observations for opponent calibration
//
// The OpponentModel is rebuilt from the turn history each call — no mutable
// state needed (the Bot interface is a pure function). Every past trade
// accept/reject in state.turns is a calibration data point.
// ===========================================================================
import { colorAt, groupPositions } from "../../../development";
import { auctionBidCap, BID_INCREMENT, firstNegativePlayer } from "../../../engine";
import { heldJailCard, ownablePrice } from "../../../logic";
import type { GameState, ManageStaged, TradeTerms } from "../../../types";
import type { BotDecision } from "../../decision";

// Reuse ALL of jane-v3's non-trade valuation logic.
import {
  acquisitionValue,
  activeOpponents,
  colorName,
  jailChoice,
  liquidityFloor,
  mortgageableTotal,
  planRaiseByMortgage,
  raiseCashStep,
  spaceName,
  ownedInColor,
} from "../jane-v3/valuation";
import { planBuild } from "../jane-v3/valuation";

// New trade-v1 imports.
import { TradeEngine } from "./trades";
import { reconstructModel } from "./calibration";


export function tradeV1Bot(state: GameState, playerId: string): BotDecision | null {
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
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------/
// Constants (same as v3 — buy/build logic unchanged).
// ---------------------------------------------------------------------------/
const RAISE_WORTH_MULT = 1.25;
const DIP_WORTH_MULT = 1.4;

// ---------------------------------------------------------------------------/
// Pre-roll: arm trades (via new engine) or builds (via v3 logic).
// ---------------------------------------------------------------------------/
function preRoll(state: GameState, pid: string): BotDecision | null {
  // New trade engine for proposal.
  const engine = new TradeEngine(reconstructModel(state));
  const proposal = engine.proposeBestTrade(state, pid);
  if (proposal !== null) {
    return {
      intent: { kind: "set-queue", playerId: pid, queue: "trade", armed: true },
      note: proposal.reason,
    };
  }
  // v3 build logic unchanged.
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

// ---------------------------------------------------------------------------/
// Buy decision — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
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

// ---------------------------------------------------------------------------/
// Raising cash — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
function raisingCash(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const pos = state.turn.pendingBuy;
  const player = state.players.find((p) => p.id === pid);
  const price = pos === undefined ? null : ownablePrice(pos);
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

// ---------------------------------------------------------------------------/
// Auction — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
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

// ---------------------------------------------------------------------------/
// Must raise cash — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
function mustRaiseCash(state: GameState, pid: string): BotDecision | null {
  if (firstNegativePlayer(state) !== pid) return null;
  const step = raiseCashStep(state, pid);
  return step === null ? null : { intent: step.intent, note: step.reason };
}

// ---------------------------------------------------------------------------/
// Managing — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
function managing(state: GameState, pid: string): BotDecision | null {
  if (state.turn.managerId !== pid) return null;
  const plan = planBuild(state, pid);
  if (plan === null) return null;
  return {
    intent: { kind: "manage", playerId: pid, build: plan.build, mortgage: plan.mortgage },
  };
}

// ---------------------------------------------------------------------------/
// Trade building — uses new TradeEngine.
// ---------------------------------------------------------------------------/
function tradeBuilding(state: GameState, pid: string): BotDecision | null {
  const draft = state.turn.tradeDraft;
  if (!draft || draft.proposerId !== pid) return null;
  const engine = new TradeEngine(reconstructModel(state));
  const proposal = engine.proposeBestTrade(state, pid);
  if (proposal === null) return null;
  if (sameTerms(draft, proposal.terms)) {
    return { intent: { kind: "propose-trade", playerId: pid } };
  }
  return { intent: { kind: "update-trade-draft", playerId: pid, terms: proposal.terms } };
}

// ---------------------------------------------------------------------------/
// Trade pending (incoming offer) — uses new eval-based evaluation + learning.
// ---------------------------------------------------------------------------/
function tradePending(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;
  const engine = new TradeEngine(reconstructModel(state));
  const verdict = engine.evaluateIncoming(state, pid, pending);
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

// ---------------------------------------------------------------------------/
// Jail — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
function jailDecision(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const choice = jailChoice(state, pid, heldJailCard(state, pid));
  if (choice.intent !== null) return { intent: choice.intent, note: choice.reason };
  if (jailStayNoted(state, pid, choice.reason)) return null;
  return { intent: { kind: "bot-note", playerId: pid, text: choice.reason } };
}

function jailStayNoted(state: GameState, pid: string, text: string): boolean {
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some(
    (e) => e.kind === "bot-note" && e.playerId === pid && e.text === text,
  );
}

// ---------------------------------------------------------------------------/
// Structural equality helpers — VERBATIM from jane-v3.
// ---------------------------------------------------------------------------/
function sortedEntries(o: Readonly<Record<number | string, unknown>>): string {
  return Object.keys(o).sort().map((k) => `${k}:${String(o[k])}`).join(",");
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
