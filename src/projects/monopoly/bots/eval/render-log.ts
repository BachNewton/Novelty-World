import { spaceName } from "../../logic";
import type { GameEvent } from "../../types";
import type { Highlight } from "./simulate";

/** Resolve a player id (or null for the bank / no-one) to a display name. */
export type NameOf = (id: string | null) => string;

/** Render one logged moment as a single console line. Shared by `npm run sim`
 *  (which only ever passes the decision/structural events — it filters the
 *  roll-and-rent noise) and `npm run game:review` (which renders a real game's
 *  FULL event stream, mechanical beats included). Keeping one renderer means the
 *  two read identically and a new event kind only needs handling once. */
export function renderHighlight(h: Highlight, nameOf: NameOf): string {
  const e = h.event;
  const t = `T${h.turn}`.padEnd(6);
  switch (e.kind) {
    case "bot-note":
      return `${t}💭 ${nameOf(e.playerId)}: ${e.text}`;
    case "buy":
      return `${t}🛒 ${nameOf(h.actorId)} buys ${spaceName(e.position)} ($${e.price})`;
    case "auction":
      return `${t}🔨 ${spaceName(e.position)} auctioned → ${e.winnerId === null ? "no sale" : nameOf(e.winnerId)} ($${e.price})`;
    case "build":
      return `${t}🏠 ${nameOf(e.playerId)} builds ${spaceName(e.position)} → level ${e.toLevel} ($${e.cost})`;
    case "sell-building":
      return `${t}🏚️ ${nameOf(e.playerId)} sells a building on ${spaceName(e.position)} → level ${e.toLevel} (+$${e.refund})`;
    case "mortgage":
      return `${t}🏦 ${nameOf(e.playerId)} mortgages ${spaceName(e.position)} (+$${e.received})`;
    case "unmortgage":
      return `${t}💵 ${nameOf(e.playerId)} unmortgages ${spaceName(e.position)} (−$${e.cost})`;
    case "trade":
      return `${t}🤝 ${nameOf(e.proposerId)} trade — ${tradeSummary(e, nameOf)}`;
    case "trade-declined":
      return `${t}🚫 ${nameOf(e.proposerId)}'s offer declined by ${nameOf(e.declinedBy)} — ${tradeSummary(e, nameOf)}`;
    case "bankrupt":
      return `${t}💥 ${nameOf(e.debtorId)} goes bankrupt → ${nameOf(e.creditorId)}`;
    case "winner":
      return `${t}🏆 ${nameOf(e.winnerId)} WINS`;
    case "roll": {
      const [a, b] = e.dice;
      const go = e.passedGo ? " (passed GO)" : "";
      return `${t}🎲 ${nameOf(h.actorId)} rolls ${a}+${b}=${a + b} → ${spaceName(e.toPosition)}${go}`;
    }
    case "rent":
      return `${t}💸 ${nameOf(h.actorId)} pays $${e.amount} rent on ${spaceName(e.position)} → ${nameOf(e.ownerId)}`;
    case "tax":
      return `${t}🧾 ${nameOf(h.actorId)} pays ${e.taxName} ($${e.amount})`;
    case "card-drawn": {
      const cash = e.cash === undefined ? "" : ` (${e.cash >= 0 ? "+" : "−"}$${Math.abs(e.cash)})`;
      return `${t}🃏 ${nameOf(h.actorId)} draws ${e.source}: ${e.cardId}${cash}`;
    }
    case "card-transfer":
      return `${t}🃏 $${e.amount}: ${nameOf(e.fromId)} → ${nameOf(e.toId)}`;
    case "pass-go":
      return `${t}🟢 ${nameOf(h.actorId)} passes GO (+$200)`;
    case "go-to-jail":
      return `${t}🚔 ${nameOf(h.actorId)} sent to jail (${e.reason})`;
    case "jail-roll": {
      const [a, b] = e.dice;
      return `${t}⛓️ ${nameOf(h.actorId)} jail roll ${a}+${b} (try ${e.jailTurn}) — ${e.escaped ? "escaped" : "stays"}`;
    }
    case "jail-pay":
      return `${t}⛓️ ${nameOf(h.actorId)} pays $50 to leave jail`;
    case "jail-card":
      return `${t}⛓️ ${nameOf(h.actorId)} plays a Get Out of Jail Free card`;
  }
}

function tradeSummary(
  e: Extract<GameEvent, { kind: "trade" | "trade-declined" }>,
  nameOf: NameOf,
): string {
  const props = Object.entries(e.propertyTo).map(
    ([pos, to]) => `${spaceName(Number(pos))}→${nameOf(to)}`,
  );
  const cash = Object.entries(e.cashDelta)
    .filter(([, d]) => d !== 0)
    .map(([id, d]) => `${nameOf(id)} ${d > 0 ? "+" : "−"}$${Math.abs(d)}`);
  return [...props, ...cash].join(", ") || "(no asset change)";
}
