import { deckFor } from "../../../../data";
import type { GameEvent } from "../../../../types";
import { money, squareName, type NameOf } from "./format";

function cardName(event: Extract<GameEvent, { kind: "card-drawn" }>): string {
  return deckFor(event.source).find((card) => card.id === event.cardId)?.name ?? event.cardId;
}

/** One logged event as a line for the model, or null for an event it doesn't
 *  see: a note with nothing public in it, or a note still held back. */
export function eventLine(
  turn: number,
  actorId: string,
  event: GameEvent,
  nameOf: NameOf,
): string | null {
  const t = `T${String(turn)}`;
  const actor = nameOf(actorId);
  switch (event.kind) {
    case "bot-note":
      return event.text === "" ? null : `${t} ${nameOf(event.playerId)} says: "${event.text}"`;
    case "ai-failed":
      return `${t} ${nameOf(event.playerId)} couldn't decide (${event.decision})`;
    case "roll": {
      const [a, b] = event.dice;
      const go = event.passedGo ? ", passing GO" : "";
      return `${t} ${actor} rolls ${String(a)}+${String(b)} to ${squareName(event.toPosition)}${go}`;
    }
    case "buy":
      return `${t} ${actor} buys ${squareName(event.position)} for ${money(event.price)}`;
    case "auction":
      return event.winnerId === null
        ? `${t} ${squareName(event.position)} goes unsold at auction`
        : `${t} ${nameOf(event.winnerId)} wins ${squareName(event.position)} at auction for ${money(event.price)}`;
    case "rent":
      return `${t} ${actor} pays ${money(event.amount)} rent on ${squareName(event.position)} to ${nameOf(event.ownerId)}`;
    case "tax":
      return `${t} ${actor} pays ${event.taxName} (${money(event.amount)})`;
    case "card-drawn": {
      const source = event.source === "chance" ? "Chance" : "Community Chest";
      const cash =
        event.cash === undefined ? "" : ` (${event.cash >= 0 ? "receives" : "pays"} ${money(Math.abs(event.cash))})`;
      return `${t} ${actor} draws ${source}: ${cardName(event)}${cash}`;
    }
    case "card-transfer":
      return `${t} ${nameOf(event.fromId)} pays ${nameOf(event.toId)} ${money(event.amount)} (card)`;
    case "pass-go":
      return `${t} ${actor} passes GO and collects $200`;
    case "go-to-jail":
      return `${t} ${actor} goes to jail (${event.reason})`;
    case "jail-roll": {
      const [a, b] = event.dice;
      return `${t} ${actor} rolls ${String(a)}+${String(b)} in jail: ${event.escaped ? "doubles, out" : "stays"}`;
    }
    case "jail-pay":
      return `${t} ${actor} pays $50 to leave jail`;
    case "jail-card":
      return `${t} ${actor} plays a Get Out of Jail Free card`;
    case "build":
      return `${t} ${nameOf(event.playerId)} builds on ${squareName(event.position)} (now level ${String(event.toLevel)})`;
    case "sell-building":
      return `${t} ${nameOf(event.playerId)} sells a building on ${squareName(event.position)} (now level ${String(event.toLevel)})`;
    case "mortgage":
      return `${t} ${nameOf(event.playerId)} mortgages ${squareName(event.position)}`;
    case "unmortgage":
      return `${t} ${nameOf(event.playerId)} lifts the mortgage on ${squareName(event.position)}`;
    case "trade":
      return `${t} trade done, proposed by ${nameOf(event.proposerId)}: ${tradeSummary(event, nameOf)}`;
    case "trade-declined":
      return `${t} ${nameOf(event.proposerId)}'s offer ${event.countered ? "countered" : "declined"} by ${nameOf(event.declinedBy)}: ${tradeSummary(event, nameOf)}`;
    case "bankrupt":
      return `${t} ${nameOf(event.debtorId)} goes bankrupt to ${nameOf(event.creditorId)}`;
    case "winner":
      return `${t} ${nameOf(event.winnerId)} wins the game`;
  }
}

function tradeSummary(
  event: Extract<GameEvent, { kind: "trade" | "trade-declined" }>,
  nameOf: NameOf,
): string {
  const lots = Object.entries(event.propertyTo).map(
    ([pos, to]) => `${squareName(Number(pos))} to ${nameOf(to)}`,
  );
  const cash = Object.entries(event.cashDelta)
    .filter(([, delta]) => delta !== 0)
    .map(([id, delta]) => `${nameOf(id)} ${delta > 0 ? "receives" : "pays"} ${money(Math.abs(delta))}`);
  return [...lots, ...cash].join(", ") || "no assets";
}
