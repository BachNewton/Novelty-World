import { deckFor } from "../../../../data";
import type { GameEvent, GameState } from "../../../../types";
import { money, squareName, tableNames } from "./format";

// The view's history leaves out what happens to players (rolls, rent, cards),
// so a question whose cause is one of those states it outright: what put the
// seat in debt, who passed on the lot up for auction, how the seat went to
// jail. Each reads the log, latest first, and says nothing when it finds no
// cause.

function latestGroup(state: GameState): { playerId: string; events: readonly GameEvent[] } | null {
  return state.turns.at(-1) ?? null;
}

/** What charged the seat into debt this turn: the latest charge it paid. */
export function debtCause(state: GameState, seat: string): string | null {
  const group = latestGroup(state);
  if (!group) return null;
  const nameOf = tableNames(state);
  const mine = group.playerId === seat;
  for (const event of [...group.events].reverse()) {
    switch (event.kind) {
      case "rent":
        if (mine) return `You owe this after paying ${money(event.amount)} rent on ${squareName(event.position)} to ${nameOf(event.ownerId)}.`;
        break;
      case "tax":
        if (mine) return `You owe this after paying ${event.taxName} (${money(event.amount)}).`;
        break;
      case "card-drawn":
        if (mine && event.cash !== undefined && event.cash < 0) {
          const card = deckFor(event.source).find((c) => c.id === event.cardId)?.name ?? event.cardId;
          return `You owe this after a card, ${card}, cost you ${money(-event.cash)}.`;
        }
        break;
      case "card-transfer":
        if (event.fromId === seat) return `You owe this after a card made you pay ${nameOf(event.toId)} ${money(event.amount)}.`;
        break;
      case "auction":
        if (event.winnerId === seat) return `You owe this after winning ${squareName(event.position)} at auction for ${money(event.price)}.`;
        break;
      case "trade":
        if (Object.entries(event.propertyTo).some(([pos, to]) => to === seat && state.mortgaged[Number(pos)])) {
          return `You owe this after a trade: the bank's 10% interest on the mortgaged lots you received.`;
        }
        break;
      default:
        break;
    }
  }
  return null;
}

/** Who passed on the lot now at auction, when a landing put it there. */
export function auctionCause(state: GameState, position: number): string | null {
  const group = latestGroup(state);
  if (!group) return null;
  const landed = group.events.some((event) => event.kind === "roll" && event.toPosition === position);
  return landed ? `${tableNames(state)(group.playerId)} landed on it and chose not to buy it.` : null;
}

const JAIL_REASON: Readonly<Record<Extract<GameEvent, { kind: "go-to-jail" }>["reason"], string>> = {
  tile: "landing on Go to Jail",
  card: "a card",
  "three-doubles": "rolling three doubles",
};

/** How the seat went to jail, from its latest go-to-jail. */
export function jailCause(state: GameState, seat: string): string | null {
  for (const group of [...state.turns].reverse()) {
    if (group.playerId !== seat) continue;
    const sent = group.events.findLast((event) => event.kind === "go-to-jail");
    if (sent?.kind === "go-to-jail") return `You were sent to jail on turn ${String(group.turn)}, by ${JAIL_REASON[sent.reason]}.`;
  }
  return null;
}
