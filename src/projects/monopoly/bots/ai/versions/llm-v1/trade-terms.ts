import { SPACES } from "../../../../data";
import { builtLotsInGroup, developmentLevel, groupPositions } from "../../../../development";
import { projectTrade, tradeMortgageFees } from "../../../../engine";
import type { CardSource, GameEvent, GameState, TradeTerms } from "../../../../types";
import { renderHighlight, type NameOf } from "../../../eval/render-log";
import type { JsonSchema } from "../../model/adapter";
import { COLOR_LABEL, money, playerById, squareLabel } from "./prompt";

// A trade as the model writes it, for both a proposal and a counter: lists of
// moves, which become the engine's `TradeTerms`.

const SOURCES: readonly CardSource[] = ["chance", "communityChest"];

const kindPositions = (kind: "railroad" | "utility"): readonly number[] =>
  SPACES.flatMap((space, pos) => (space.kind === kind ? [pos] : []));
const RAILROADS = kindPositions("railroad");
const UTILITIES = kindPositions("utility");

function livePlayerIds(state: GameState): string[] {
  return state.players.filter((p) => !p.bankrupt).map((p) => p.id);
}

/** Lots that can change hands: owned, in a color set with no buildings. */
function tradeableLots(state: GameState): number[] {
  return Object.keys(state.ownership)
    .map(Number)
    .filter((pos) => builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length === 0)
    .sort((a, b) => a - b);
}

function list(items: JsonSchema, allowed: boolean): JsonSchema {
  return allowed ? { type: "array", items } : { type: "array", maxItems: 0 };
}

/** The schema of a trade: properties and Get Out of Jail Free cards that change
 *  hands, and each player's net cash change. */
export function tradeSchema(state: GameState): JsonSchema {
  const ids = livePlayerIds(state);
  const lots = tradeableLots(state);
  const cards = SOURCES.filter((source) => state.jailFreeCards[source] !== undefined);
  return {
    type: "object",
    properties: {
      properties: list(
        {
          type: "object",
          properties: { position: { type: "integer", enum: lots }, to: { type: "string", enum: ids } },
          required: ["position", "to"],
          additionalProperties: false,
        },
        lots.length > 0,
      ),
      jailCards: list(
        {
          type: "object",
          properties: { source: { type: "string", enum: cards }, to: { type: "string", enum: ids } },
          required: ["source", "to"],
          additionalProperties: false,
        },
        cards.length > 0,
      ),
      cash: {
        type: "array",
        items: {
          type: "object",
          properties: { player: { type: "string", enum: ids }, delta: { type: "integer" } },
          required: ["player", "delta"],
          additionalProperties: false,
        },
      },
    },
    required: ["properties", "jailCards", "cash"],
    additionalProperties: false,
  };
}

/** How to write a trade, for the question text. */
export function tradeFormat(state: GameState, seat: string): string {
  const ids = state.players
    .filter((p) => !p.bankrupt)
    .map((p) => `${p.name}${p.id === seat ? " (you)" : ""} = "${p.id}"`)
    .join(", ");
  return [
    `A trade lists: "properties", each lot that changes hands and the player id it goes to; "jailCards", likewise for Get Out of Jail Free cards ("chance" or "communityChest"); and "cash", each player's net cash change (positive receives, negative pays), which must add up to zero.`,
    `Only lots in color sets with no buildings can be traded. Everyone named must accept. Player ids: ${ids}.`,
  ].join("\n");
}

export type ReadTerms = { ok: true; terms: TradeTerms } | { ok: false; reason: string };

/** The engine's terms for a trade the model wrote. */
export function readTrade(value: unknown): ReadTerms {
  if (!isRecord(value)) return { ok: false, reason: "the trade must be an object" };
  const { properties, jailCards, cash } = value;
  if (!Array.isArray(properties) || !Array.isArray(jailCards) || !Array.isArray(cash)) {
    return { ok: false, reason: "a trade needs properties, jailCards and cash lists" };
  }
  const propertyTo: Record<number, string> = {};
  for (const move of properties) {
    if (!isRecord(move) || typeof move.position !== "number" || typeof move.to !== "string") {
      return { ok: false, reason: "each property move needs a position and a player" };
    }
    propertyTo[move.position] = move.to;
  }
  const gojfTo: Partial<Record<CardSource, string>> = {};
  for (const move of jailCards) {
    if (!isRecord(move) || typeof move.to !== "string") {
      return { ok: false, reason: "each card move needs a source and a player" };
    }
    const source = SOURCES.find((s) => s === move.source);
    if (source === undefined) return { ok: false, reason: "a card's source must be chance or communityChest" };
    gojfTo[source] = move.to;
  }
  const cashDelta: Record<string, number> = {};
  for (const entry of cash) {
    if (!isRecord(entry) || typeof entry.player !== "string" || typeof entry.delta !== "number") {
      return { ok: false, reason: "each cash entry needs a player and a delta" };
    }
    if (entry.delta !== 0) cashDelta[entry.player] = (cashDelta[entry.player] ?? 0) + entry.delta;
  }
  return { ok: true, terms: { propertyTo, gojfTo, cashDelta } };
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
    if (delta !== 0) lines.push(`  - ${name(id)} ${delta > 0 ? "receives" : "pays"} ${money(Math.abs(delta))}`);
  }
  lines.push(...setConsequences(state, seat, terms));
  const fee = tradeMortgageFees(state, terms)[seat] ?? 0;
  if (fee > 0) lines.push(`You would owe the bank ${money(fee)} interest on the mortgaged lots you receive.`);
  const before = playerById(state, seat).cash;
  const after = projectTrade(state, terms).cashById[seat] ?? before;
  lines.push(`Your cash would go from ${money(before)} to ${money(after)}.`);
  return lines;
}

/** What the trade does to every color set and to the railroads it touches,
 *  stated outright for each player holding part of them afterwards ("you would
 *  own 3 of 3 Orange, a full set"), so the model never has to work out who
 *  completes what. */
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
  const isOffer = (e: GameEvent): e is Extract<GameEvent, { kind: "trade" | "trade-declined" }> =>
    e.kind === "trade" || e.kind === "trade-declined";
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
  const nameOf = namer(state);
  return group.events
    .filter((e) => isOffer(e) || (e.kind === "bot-note" && parties.has(e.playerId)))
    .map((event) => renderHighlight({ turn: group.turn, actorId: group.playerId, event }, nameOf));
}

/** The latest trade offers across the whole game, oldest first, so a proposer
 *  sees what was already tried and how it was answered. */
export function recentOfferLines(state: GameState, count: number): string[] {
  const nameOf = namer(state);
  const lines: string[] = [];
  for (const group of state.turns) {
    for (const event of group.events) {
      if (event.kind === "trade" || event.kind === "trade-declined") {
        lines.push(renderHighlight({ turn: group.turn, actorId: group.playerId, event }, nameOf));
      }
    }
  }
  return lines.slice(-count);
}

function namer(state: GameState): NameOf {
  return (id) =>
    id === null ? "the bank" : (state.players.find((p) => p.id === id)?.name ?? id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
