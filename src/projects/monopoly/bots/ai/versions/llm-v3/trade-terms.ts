import { SPACES } from "../../../../data";
import { builtLotsInGroup, developmentLevel, groupPositions } from "../../../../development";
import { projectTrade, tradeMortgageFees } from "../../../../engine";
import type { CardSource, GameEvent, GameState, TradeTerms } from "../../../../types";
import { isNoteHeld } from "../../held";
import type { JsonSchema } from "../../model/adapter";
import { isRecord, readPositions } from "../../spec";
import { eventLine } from "./events";
import { COLOR_LABEL, money, playerById, squareLabel, tableNames } from "./format";
import { RAILROADS, UTILITIES } from "./prompt";

// A trade as the model writes it, for a proposal and for a counter alike: from
// its own side, with one other player. The code turns that into the engine's
// `TradeTerms`. Cash is two amounts that are never negative, one per direction
// (a signed amount is where llm-v2 slipped), the model first says the deal in
// words, and it states the cash it expects to end with, so a slip in what it
// meant shows up as a mismatch instead of going out as a bad offer.

const SOURCES: readonly CardSource[] = ["chance", "communityChest"];

function otherPlayerIds(state: GameState, seat: string): string[] {
  return state.players.filter((p) => !p.bankrupt && p.id !== seat).map((p) => p.id);
}

/** Lots that can change hands: owned, in a group with no buildings. */
function tradeable(state: GameState, pos: number): boolean {
  return builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length === 0;
}

function lotsOf(state: GameState, owns: (owner: string) => boolean): number[] {
  return Object.entries(state.ownership)
    .filter(([pos, owner]) => owns(owner) && tradeable(state, Number(pos)))
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b);
}

function cardsOf(state: GameState, owns: (holder: string) => boolean): CardSource[] {
  return SOURCES.filter((source) => {
    const holder = state.jailFreeCards[source];
    return holder !== undefined && owns(holder);
  });
}

function list(items: JsonSchema, allowed: readonly unknown[]): JsonSchema {
  return allowed.length > 0 ? { type: "array", items: { ...items, enum: allowed } } : { type: "array", maxItems: 0 };
}

/** The schema of a trade, from the seat's side. */
export function tradeSchema(state: GameState, seat: string): JsonSchema {
  const mine = (id: string): boolean => id === seat;
  const theirs = (id: string): boolean => id !== seat;
  return {
    type: "object",
    properties: {
      dealInWords: { type: "string", maxLength: 300 },
      counterparty: { type: "string", enum: otherPlayerIds(state, seat) },
      youGive: {
        type: "object",
        properties: {
          properties: list({ type: "integer" }, lotsOf(state, mine)),
          jailCards: list({ type: "string" }, cardsOf(state, mine)),
        },
        required: ["properties", "jailCards"],
        additionalProperties: false,
      },
      youGet: {
        type: "object",
        properties: {
          properties: list({ type: "integer" }, lotsOf(state, theirs)),
          jailCards: list({ type: "string" }, cardsOf(state, theirs)),
        },
        required: ["properties", "jailCards"],
        additionalProperties: false,
      },
      cashYouPay: { type: "integer", minimum: 0 },
      cashYouReceive: { type: "integer", minimum: 0 },
      yourCashAfter: { type: "integer" },
    },
    required: ["dealInWords", "counterparty", "youGive", "youGet", "cashYouPay", "cashYouReceive", "yourCashAfter"],
    additionalProperties: false,
  };
}

/** How to write a trade, for the question text. */
export function tradeFormat(state: GameState, seat: string): string {
  const ids = state.players
    .filter((p) => !p.bankrupt && p.id !== seat)
    .map((p) => `${p.name} = "${p.id}"`)
    .join(", ");
  const cash = money(playerById(state, seat).cash);
  return [
    `A trade is written from your side, with one other player ("counterparty"; ids: ${ids}):`,
    `- "dealInWords": first, the deal in one sentence of this form: "I give <lots, or nothing>; I get <lots, or nothing>; I pay $A" (or "they pay me $B", or "no cash").`,
    `- "youGive": the lots (by square number) and Get Out of Jail Free cards ("chance" or "communityChest") you hand over.`,
    `- "youGet": the lots and cards you receive; they must be the counterparty's.`,
    `- "cashYouPay": the cash you pay them, 0 if none. "cashYouReceive": the cash they pay you, 0 if none. At most one of the two is above 0; neither is ever negative.`,
    `- "yourCashAfter": your cash right after the trade, before any mortgage interest: ${cash} minus cashYouPay plus cashYouReceive. It must add up, or the trade fails.`,
    `Only lots in groups with no buildings can be traded.`,
  ].join("\n");
}

export type ReadTerms = { ok: true; terms: TradeTerms } | { ok: false; reason: string };

/** The engine's terms for a trade the seat wrote, checked against what it said
 *  it would leave it with. */
export function readTrade(state: GameState, seat: string, value: unknown): ReadTerms {
  if (!isRecord(value) || !isRecord(value.youGive) || !isRecord(value.youGet)) {
    return { ok: false, reason: "the trade needs youGive and youGet" };
  }
  const { counterparty, cashYouPay, cashYouReceive, yourCashAfter } = value;
  if (typeof counterparty !== "string" || !otherPlayerIds(state, seat).includes(counterparty)) {
    return { ok: false, reason: "the trade's counterparty isn't another player in the game" };
  }
  if (typeof cashYouPay !== "number" || typeof cashYouReceive !== "number" || typeof yourCashAfter !== "number") {
    return { ok: false, reason: "the trade needs cashYouPay, cashYouReceive and yourCashAfter" };
  }
  if (cashYouPay < 0 || cashYouReceive < 0) {
    return { ok: false, reason: "a trade's cash amounts can't be negative" };
  }
  if (cashYouPay > 0 && cashYouReceive > 0) {
    return { ok: false, reason: `the trade both pays ${money(cashYouPay)} and receives ${money(cashYouReceive)}` };
  }
  const received = cashYouReceive - cashYouPay;
  const give = readPositions(value.youGive.properties);
  const get = readPositions(value.youGet.properties);
  const giveCards = readCards(value.youGive.jailCards);
  const getCards = readCards(value.youGet.jailCards);
  if (!give || !get || !giveCards || !getCards) {
    return { ok: false, reason: "youGive and youGet must list lots and cards" };
  }
  const cp = playerById(state, counterparty).name;
  for (const pos of give) {
    if (state.ownership[pos] !== seat) return { ok: false, reason: `offered ${squareLabel(pos)}, which isn't the seat's` };
  }
  for (const pos of get) {
    if (state.ownership[pos] !== counterparty) {
      return { ok: false, reason: `asked ${cp} for ${squareLabel(pos)}, which isn't theirs` };
    }
  }
  for (const source of giveCards) {
    if (state.jailFreeCards[source] !== seat) return { ok: false, reason: "offered a jail card the seat doesn't hold" };
  }
  for (const source of getCards) {
    if (state.jailFreeCards[source] !== counterparty) {
      return { ok: false, reason: `asked ${cp} for a jail card they don't hold` };
    }
  }
  const cash = playerById(state, seat).cash;
  if (cash + received !== yourCashAfter) {
    const moved = received >= 0 ? `${money(received)} received` : `${money(-received)} paid`;
    return {
      ok: false,
      reason: `the trade's cash doesn't add up: ${money(cash)} with ${moved} leaves ${money(cash + received)}, not the ${money(yourCashAfter)} stated`,
    };
  }
  const propertyTo: Record<number, string> = {};
  for (const pos of give) propertyTo[pos] = counterparty;
  for (const pos of get) propertyTo[pos] = seat;
  const gojfTo: Partial<Record<CardSource, string>> = {};
  for (const source of giveCards) gojfTo[source] = counterparty;
  for (const source of getCards) gojfTo[source] = seat;
  const cashDelta: Record<string, number> = {};
  if (received !== 0) {
    cashDelta[seat] = received;
    cashDelta[counterparty] = -received;
  }
  return { ok: true, terms: { propertyTo, gojfTo, cashDelta } };
}

function readCards(value: unknown): CardSource[] | null {
  if (!Array.isArray(value)) return null;
  const cards: CardSource[] = [];
  for (const v of value) {
    const source = SOURCES.find((s) => s === v);
    if (source === undefined) return null;
    cards.push(source);
  }
  return cards;
}

/** A trade's terms in words, from one seat's point of view: each move, any
 *  mortgage interest the seat would owe, and its cash before and after. */
export function describeTerms(state: GameState, seat: string, terms: TradeTerms): string[] {
  const name = (id: string): string => (id === seat ? "you" : playerById(state, id).name);
  const lines: string[] = [];
  for (const [pos, to] of Object.entries(terms.propertyTo)) {
    const from = state.ownership[Number(pos)];
    const mortgaged = state.mortgaged[Number(pos)] ? " (mortgaged)" : "";
    lines.push(`  - ${squareLabel(Number(pos))}${mortgaged}: ${name(from)} -> ${name(to)}`);
  }
  for (const source of SOURCES) {
    const to = terms.gojfTo[source];
    if (to === undefined) continue;
    const from = state.jailFreeCards[source];
    lines.push(`  - a Get Out of Jail Free card: ${from === undefined ? "?" : name(from)} -> ${name(to)}`);
  }
  for (const [id, delta] of Object.entries(terms.cashDelta)) {
    if (delta === 0) continue;
    const verb = id === seat ? (delta > 0 ? "receive" : "pay") : delta > 0 ? "receives" : "pays";
    lines.push(`  - ${name(id)} ${verb} ${money(Math.abs(delta))}`);
  }
  lines.push(...setConsequences(state, seat, terms));
  const fee = tradeMortgageFees(state, terms)[seat] ?? 0;
  if (fee > 0) lines.push(`You would owe the bank ${money(fee)} interest on the mortgaged lots you receive.`);
  const before = playerById(state, seat).cash;
  const after = projectTrade(state, terms).cashById[seat] ?? before;
  lines.push(`Your cash would go from ${money(before)} to ${money(after)}.`);
  return lines;
}

/** What the trade does to every group it touches, stated outright for each
 *  player holding part of it afterwards ("you would own 3 of 3 Orange, a full
 *  set"), so the model never has to work out who completes what. */
export function setConsequences(state: GameState, seat: string, terms: TradeTerms): string[] {
  const after = projectTrade(state, terms).ownership;
  const name = (id: string): string => (id === seat ? "you" : playerById(state, id).name);
  const groups = new Map<string, readonly number[]>();
  for (const pos of Object.keys(terms.propertyTo).map(Number)) {
    const space = SPACES[pos];
    if (space.kind === "property") groups.set(COLOR_LABEL[space.color], groupPositions(space.color));
    else if (space.kind === "railroad") groups.set("Railroads", RAILROADS);
    else if (space.kind === "utility") groups.set("Utilities", UTILITIES);
  }
  const lines: string[] = [];
  for (const [label, lots] of groups) {
    const holders = new Set(lots.flatMap((pos) => (pos in after ? [after[pos]] : [])));
    for (const id of holders) {
      const count = lots.filter((pos) => after[pos] === id).length;
      const full = label !== "Railroads" && label !== "Utilities" && count === lots.length;
      lines.push(
        `After this trade ${name(id)} would own ${String(count)} of ${String(lots.length)} ${label}${full ? ", a full set" : ""}.`,
      );
    }
  }
  return lines;
}

/** This negotiation so far: the offers made and answered this turn, oldest
 *  first, with what each party said alongside them. A counter keeps the
 *  negotiation inside one turn, so the turn's log is the whole chain. */
export function negotiationLines(state: GameState): string[] {
  const group = state.turns[state.turns.length - 1];
  const parties = new Set<string>();
  for (const e of group.events) {
    if (!isOffer(e)) continue;
    parties.add(e.proposerId);
    if (e.kind === "trade-declined") parties.add(e.declinedBy);
  }
  const pending = state.turn.pendingTrade;
  if (pending) {
    parties.add(pending.proposerId);
    for (const id of Object.keys(pending.approvals)) parties.add(id);
  }
  const nameOf = tableNames(state);
  return group.events.flatMap((event) => {
    const relevant = isOffer(event) || (event.kind === "bot-note" && parties.has(event.playerId));
    if (!relevant || isNoteHeld(state, event, true)) return [];
    const line = eventLine(group.turn, group.playerId, event, nameOf);
    return line === null ? [] : [line];
  });
}

/** The latest trade offers across the whole game, oldest first, so a proposer
 *  sees what was already tried and how it was answered. */
export function recentOfferLines(state: GameState, count: number): string[] {
  const nameOf = tableNames(state);
  const lines: string[] = [];
  for (const group of state.turns) {
    for (const event of group.events) {
      if (!isOffer(event)) continue;
      const line = eventLine(group.turn, group.playerId, event, nameOf);
      if (line !== null) lines.push(line);
    }
  }
  return lines.slice(-count);
}

function isOffer(e: GameEvent): e is Extract<GameEvent, { kind: "trade" | "trade-declined" }> {
  return e.kind === "trade" || e.kind === "trade-declined";
}
