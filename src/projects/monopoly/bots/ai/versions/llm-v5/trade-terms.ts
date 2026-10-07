import { SPACES } from "../../../../data";
import { builtLotsInGroup, developmentLevel, groupPositions } from "../../../../development";
import { projectTrade, tradeMortgageFees } from "../../../../engine";
import { mortgageValueAt } from "../../../../logic";
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
    mortgageAlternative(state, seat),
  ].join("\n");
}

/** What mortgaging each lot the seat could trade away would raise, so a sale
 *  is weighed against keeping the lot and mortgaging it. */
export function mortgageAlternative(state: GameState, seat: string): string {
  const lots = lotsOf(state, (id) => id === seat).filter((pos) => !state.mortgaged[pos]);
  if (lots.length === 0) return `You have no unmortgaged lots you could trade.`;
  return `Instead of selling one of your lots, you could mortgage it and keep it. Mortgaging raises: ${lots
    .map((pos) => `${squareLabel(pos)} ${money(mortgageValueAt(pos) ?? 0)}`)
    .join("; ")}.`;
}

export type ReadTerms = { ok: true; terms: TradeTerms } | { ok: false; reason: string };

/** The engine's terms for a trade the seat wrote, checked against what it said
 *  it would leave it with. */
export function readTrade(state: GameState, seat: string, value: unknown): ReadTerms {
  if (!isRecord(value) || !isRecord(value.youGive) || !isRecord(value.youGet)) {
    return { ok: false, reason: "the trade needs youGive and youGet" };
  }
  const { counterparty } = value;
  if (typeof counterparty !== "string" || !otherPlayerIds(state, seat).includes(counterparty)) {
    return { ok: false, reason: "the trade's counterparty isn't another player in the game" };
  }
  const cashRead = readCash(state, seat, value);
  if (!cashRead.ok) return cashRead;
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
  return { ok: true, terms: termsOf(seat, counterparty, { give, get, giveCards, getCards, received: cashRead.received }) };
}

/** A trade's cash, from the seat's side: two amounts that are never negative,
 *  at most one above zero, and the cash it says it ends with, which must add
 *  up. */
function readCash(
  state: GameState,
  seat: string,
  value: Record<string, unknown>,
): { ok: true; received: number } | { ok: false; reason: string } {
  const { cashYouPay, cashYouReceive, yourCashAfter } = value;
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
  const cash = playerById(state, seat).cash;
  if (cash + received !== yourCashAfter) {
    const moved = received >= 0 ? `${money(received)} received` : `${money(-received)} paid`;
    return {
      ok: false,
      reason: `the trade's cash doesn't add up: ${money(cash)} with ${moved} leaves ${money(cash + received)}, not the ${money(yourCashAfter)} stated`,
    };
  }
  return { ok: true, received };
}

interface Sides {
  give: readonly number[];
  get: readonly number[];
  giveCards: readonly CardSource[];
  getCards: readonly CardSource[];
  /** Cash the seat receives (negative: pays). */
  received: number;
}

/** The engine's terms for a trade between the seat and one other player. */
function termsOf(seat: string, counterparty: string, sides: Sides): TradeTerms {
  const propertyTo: Record<number, string> = {};
  for (const pos of sides.give) propertyTo[pos] = counterparty;
  for (const pos of sides.get) propertyTo[pos] = seat;
  const gojfTo: Partial<Record<CardSource, string>> = {};
  for (const source of sides.giveCards) gojfTo[source] = counterparty;
  for (const source of sides.getCards) gojfTo[source] = seat;
  const cashDelta: Record<string, number> = {};
  if (sides.received !== 0) {
    cashDelta[seat] = sides.received;
    cashDelta[counterparty] = -sides.received;
  }
  return { propertyTo, gojfTo, cashDelta };
}

// --- Counters ------------------------------------------------------------------
//
// llm-v4 asked for a counter's terms in the same answer as the vote, as a
// required field even on accept or decline, in the proposal's give/get form.
// Its call records showed three ways that went wrong: the model wrote its own
// lot under "I get" ("I give nothing; I get the Reading Railroad"), which the
// schema could only write as an empty trade; it named a lot the other side
// doesn't hold (St. James, unowned), which the schema dropped, leaving
// Kentucky given away for nothing; and it chose "counter" with a note meaning
// decline. Here the vote comes first, alone, beside what each side holds; only
// a counter is asked for its terms, in a second, quick call, as one choice per
// lot or card each side actually holds.

/** A lot or Get Out of Jail Free card one side holds and could trade, by the
 *  name the model answers with. */
interface Holding {
  label: string;
  item: { kind: "lot"; position: number } | { kind: "card"; source: CardSource };
}

const CARD_LABEL: Readonly<Record<CardSource, string>> = {
  chance: "Get Out of Jail Free card (Chance)",
  communityChest: "Get Out of Jail Free card (Community Chest)",
};

function holdingsOf(state: GameState, owner: string): Holding[] {
  const lots = lotsOf(state, (id) => id === owner).map(
    (position): Holding => ({
      label: `${squareLabel(position)}${state.mortgaged[position] ? " (mortgaged)" : ""}`,
      item: { kind: "lot", position },
    }),
  );
  const cards = cardsOf(state, (id) => id === owner).map(
    (source): Holding => ({ label: CARD_LABEL[source], item: { kind: "card", source } }),
  );
  return [...lots, ...cards];
}

/** What each side of a trade between the seat and `other` could put in: its
 *  tradeable lots, its cards and its cash. */
export function holdingsLines(state: GameState, seat: string, other: string): string {
  const side = (id: string, none: string): string => {
    const held = holdingsOf(state, id).map((h) => h.label);
    return `${held.length > 0 ? held.join(", ") : none}; ${money(playerById(state, id).cash)} in cash`;
  };
  return [
    `What each side could put in a trade (lots in groups with buildings can't be traded):`,
    `- You: ${side(seat, "no lots or cards you can trade")}.`,
    `- ${playerById(state, other).name}: ${side(other, "no lots or cards they can trade")}.`,
  ].join("\n");
}

/** The counter's question, asked once the seat has chosen to counter, with the
 *  reasoning and message it chose it with. */
export function counterQuestion(
  state: GameState,
  seat: string,
  other: string,
  offer: TradeTerms,
  vote: { privateNote: string; publicNote: string },
): string {
  const name = playerById(state, other).name;
  const cash = money(playerById(state, seat).cash);
  return [
    `${name} proposed a trade, and you chose to counter it. Their offer, which you are turning down:`,
    ...describeTerms(state, seat, offer),
    `Your reasoning: "${vote.privateNote}"`,
    `Your message to ${name}: "${vote.publicNote}"`,
    `Now write the terms you would accept instead. ${name} then votes on them.`,
    holdingsLines(state, seat, other),
    // Without this line the model marked the lot it meant to sell "keep" and
    // asked for cash alone ("I'm keeping Pacific; I need at least $250").
    `A lot marked "keep" stays out of the trade: to sell a lot for more than they offered, hand it over and ask for the higher price. A counter that only asks them for cash, handing nothing over, gives them nothing for it.`,
    `- "yourLots": for each of your lots and cards, "hand over" to give it to ${name}, or "keep".`,
    `- "theirLots": for each of ${name}'s lots and cards, "take" to get it from ${name}, or "leave".`,
    `- "cashYouPay": the cash you pay ${name}, 0 if none. "cashYouReceive": the cash ${name} pays you, 0 if none. At most one of the two is above 0; neither is ever negative.`,
    `- "yourCashAfter": your cash right after the trade, before any mortgage interest: ${cash} minus cashYouPay plus cashYouReceive. It must add up, or the counter fails.`,
  ].join("\n");
}

function choices(held: readonly Holding[], options: readonly [string, string]): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(held.map((h) => [h.label, { type: "string", enum: options }])),
    required: held.map((h) => h.label),
    additionalProperties: false,
  };
}

const GIVE: readonly [string, string] = ["hand over", "keep"];
const TAKE: readonly [string, string] = ["take", "leave"];

/** The counter's terms: one choice per lot and card each side holds, then the
 *  cash. */
export function counterSchema(state: GameState, seat: string, other: string): JsonSchema {
  return {
    type: "object",
    properties: {
      yourLots: choices(holdingsOf(state, seat), GIVE),
      theirLots: choices(holdingsOf(state, other), TAKE),
      cashYouPay: { type: "integer", minimum: 0 },
      cashYouReceive: { type: "integer", minimum: 0 },
      yourCashAfter: { type: "integer" },
    },
    required: ["yourLots", "theirLots", "cashYouPay", "cashYouReceive", "yourCashAfter"],
    additionalProperties: false,
  };
}

/** The holdings an answer moves: every holding named with one of its two
 *  choices, the first of which moves it. A reason string when it isn't. */
function chosen(value: unknown, held: readonly Holding[], [moves, stays]: readonly [string, string], field: string): Holding[] | string {
  if (!isRecord(value)) return `${field} must give a choice for each lot`;
  const unknown = Object.keys(value).find((label) => !held.some((h) => h.label === label));
  if (unknown !== undefined) return `${field} names ${unknown}, which isn't that side's to trade`;
  const moved: Holding[] = [];
  for (const h of held) {
    const choice = value[h.label];
    if (choice === moves) moved.push(h);
    else if (choice !== stays) return `${field} needs "${moves}" or "${stays}" for ${h.label}`;
  }
  return moved;
}

/** The engine's terms for the counter the seat wrote. A counter that hands
 *  something over and asks nothing back fails: in llm-v4's records a giveaway
 *  was never what the model meant, but the return it wanted (a lot the other
 *  side doesn't hold) had no way into the answer. */
export function readCounter(state: GameState, seat: string, other: string, value: unknown): ReadTerms {
  if (!isRecord(value)) return { ok: false, reason: "the counter needs its terms" };
  const give = chosen(value.yourLots, holdingsOf(state, seat), GIVE, "yourLots");
  if (typeof give === "string") return { ok: false, reason: give };
  const get = chosen(value.theirLots, holdingsOf(state, other), TAKE, "theirLots");
  if (typeof get === "string") return { ok: false, reason: get };
  const cashRead = readCash(state, seat, value);
  if (!cashRead.ok) return cashRead;
  if (give.length > 0 && get.length === 0 && cashRead.received <= 0) {
    return { ok: false, reason: `the counter gives ${give.map((h) => h.label).join(", ")} away and asks nothing back` };
  }
  const lots = (hs: readonly Holding[]): number[] => hs.flatMap((h) => (h.item.kind === "lot" ? [h.item.position] : []));
  const cards = (hs: readonly Holding[]): CardSource[] => hs.flatMap((h) => (h.item.kind === "card" ? [h.item.source] : []));
  return {
    ok: true,
    terms: termsOf(seat, other, {
      give: lots(give),
      get: lots(get),
      giveCards: cards(give),
      getCards: cards(get),
      received: cashRead.received,
    }),
  };
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
    lines.push(`  - ${squareLabel(Number(pos))}${lotNote(state, seat, Number(pos))}: ${name(from)} -> ${name(to)}`);
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

/** A note on a lot changing hands: mortgaged, or, for an unmortgaged lot the
 *  seat gives away, what mortgaging it would raise instead, so a sale's price
 *  sits beside the cash the seat could have without selling. */
function lotNote(state: GameState, seat: string, pos: number): string {
  if (state.mortgaged[pos]) return " (mortgaged)";
  if (state.ownership[pos] !== seat) return "";
  return ` (you could mortgage it instead for ${money(mortgageValueAt(pos) ?? 0)} and keep it)`;
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
