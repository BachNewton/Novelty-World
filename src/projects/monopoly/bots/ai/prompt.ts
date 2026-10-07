import { HOUSE_COST, SPACES } from "../../data";
import { bankSupply, developmentLevel, groupPositions } from "../../development";
import { hasMonopoly, rentAt, spaceName, unmortgageCostAt } from "../../logic";
import type { GameState, Player, PropertyColor } from "../../types";
import { renderHighlight, type NameOf } from "../eval/render-log";
import { aiSeat } from "./seat";

/** What the model is sent: a system message that never changes between calls
 *  (so the model server can reuse its work on it), and the seat's view plus the
 *  question. */
export interface AiPrompt {
  system: string;
  user: string;
}

/** How many of the latest log lines the seat sees. */
const RECENT_EVENTS = 30;

const RULES = `You are playing Monopoly as one seat at a table of humans and bots. Play to win.

Rules of this table (the official rules, played by experienced players):
- Landing on an unowned property: buy it at its price, or it goes to auction. If you decline, everyone (you included) may bid in an open auction; the highest bid wins, and a lot nobody bids on stays with the bank.
- Rent: a property's base rent doubles when one player owns its whole color set and it has no houses. Houses and hotels raise rent steeply. Railroads pay $25/$50/$100/$200 for 1/2/3/4 owned. Utilities pay 4x the dice, or 10x with both.
- Building: only on a complete, un-mortgaged color set, evenly across the set (no lot may be more than one house ahead of another). Four houses then a hotel. The bank has 32 houses and 12 hotels; when they run out, nobody can build.
- Selling buildings returns half their cost. Mortgaging a lot pays half its price; a mortgaged lot collects no rent; lifting a mortgage costs the mortgage plus 10%. A lot can't be mortgaged while its color set has buildings.
- Debt: a charge you can't cover puts your cash below zero, and you must sell buildings and mortgage until you're back to zero or more. If you can't, you're bankrupt and out.
- Jail: leave by paying $50, playing a Get Out of Jail Free card, or rolling doubles. After three failed rolls you pay $50 and leave.
- Trades: any player may propose a trade of properties, Get Out of Jail Free cards and cash between players. Everyone named in it must accept; one decline ends it. A mortgaged lot changes hands still mortgaged, and its new owner pays the bank 10% interest at once.

How to answer:
- Answer only in the JSON form asked for.
- "privateNote": your own reasoning, a few sentences. Write it first, and think there. Only you will see it.
- "publicNote": one short sentence the whole table sees in the game log, in your voice. When you propose or counter a trade, it is your message to the other side. Never reveal the most you'd pay or the least you'd accept.
- "plan": one or two sentences to your future self: what you're aiming for over the next few turns. You'll be shown it next time you decide.
- Stick to the rules above and the facts in your view. Don't invent rules.`;

const COLOR_LABEL: Readonly<Record<PropertyColor, string>> = {
  brown: "Brown",
  "light-blue": "Light blue",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  "dark-blue": "Dark blue",
};

/** The prompt for one decision. A pure function of the state, the seat and the
 *  question: the same inputs always give the same prompt, so a bad move can be
 *  debugged by rebuilding exactly what the model saw. */
export function buildPrompt(state: GameState, seat: string, question: string): AiPrompt {
  const me = playerById(state, seat);
  const plan = aiSeat(state, seat).plan;
  const sections = [
    `You are ${me.name}. It is turn ${String(state.turns.length)}.`,
    `Players, in seat order:\n${state.players.map((p) => playerLine(state, p, seat)).join("\n")}`,
    `The board:\n${boardLines(state, seat).join("\n")}`,
    `Color sets, from where you stand:\n${setLines(state, seat).join("\n")}`,
    `Your plan from last time: ${plan ?? "(none yet)"}`,
    `Recent events, oldest first:\n${recentEvents(state).join("\n") || "(none yet)"}`,
    `Decision:\n${question}`,
  ];
  return { system: RULES, user: sections.join("\n\n") };
}

export function playerById(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`no player ${id}`);
  return player;
}

/** "$1,500"-style money, with a minus sign for debt. */
export function money(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US")}`;
}

/** A square as the model refers to it: its number and name. */
export function squareLabel(position: number): string {
  return `#${String(position)} ${spaceName(position)}`;
}

function playerLine(state: GameState, p: Player, seat: string): string {
  const parts = [
    `${p.name}${p.id === seat ? " (you)" : ""}`,
    p.bankrupt ? "bankrupt" : money(p.cash),
  ];
  if (!p.bankrupt) {
    parts.push(
      p.inJail
        ? `in jail (turn ${String(p.jailTurns)} of 3)`
        : `on #${String(p.position)} ${squareName(p.position)}`,
    );
  }
  const cards = (["chance", "communityChest"] as const).filter(
    (source) => state.jailFreeCards[source] === p.id,
  );
  if (cards.length > 0) {
    parts.push(`holds ${String(cards.length)} Get Out of Jail Free card${cards.length > 1 ? "s" : ""}`);
  }
  return `- ${parts.join(", ")}`;
}

function squareName(position: number): string {
  const space = SPACES[position];
  switch (space.kind) {
    case "go":
      return "GO";
    case "jail":
      return "Jail (just visiting)";
    case "free-parking":
      return "Free Parking";
    case "go-to-jail":
      return "Go to Jail";
    case "chance":
      return "Chance";
    case "community-chest":
      return "Community Chest";
    default:
      return space.name;
  }
}

function boardLines(state: GameState, seat: string): string[] {
  const nameOf = nameResolver(state, seat);
  const lines: string[] = [];
  let lastGroup = "";
  SPACES.forEach((space, position) => {
    if (space.kind !== "property" && space.kind !== "railroad" && space.kind !== "utility") {
      return;
    }
    const group =
      space.kind === "property"
        ? `${COLOR_LABEL[space.color]} (houses ${money(HOUSE_COST[space.color])} each)`
        : space.kind === "railroad"
          ? "Railroads"
          : "Utilities";
    if (group !== lastGroup) {
      lines.push(`${group}:`);
      lastGroup = group;
    }
    lines.push(`  - ${squareLabel(position)}, price ${money(space.price)}: ${lotStatus(state, position, nameOf)}`);
  });
  const supply = bankSupply(state);
  lines.push(`Bank: ${String(supply.houses)} houses and ${String(supply.hotels)} hotels left.`);
  return lines;
}

/** Each color set spelled out for the seat: who holds which lots, whether it
 *  can build there, and what owning the lot on offer (a landing or an auction)
 *  would add. Small models misread the raw board ("buying Connecticut completes
 *  the light blues" with the other two unowned), so the consequence is stated
 *  rather than left to be worked out. */
function setLines(state: GameState, seat: string): string[] {
  const nameOf = nameResolver(state, seat);
  const onOffer = state.turn.auction?.position ?? state.turn.pendingBuy;
  return (Object.keys(COLOR_LABEL) as PropertyColor[]).map((color) => {
    const lots = groupPositions(color);
    const mine = lots.filter((p) => state.ownership[p] === seat);
    const holders = lots.map((p) => `${spaceName(p)}: ${nameOf(state.ownership[p] ?? null)}`);
    const status =
      mine.length === lots.length
        ? "your full set, so you can build here"
        : `you own ${String(mine.length)} of ${String(lots.length)}, so you can't build here yet`;
    const parts = [`- ${COLOR_LABEL[color]}: ${status} (${holders.join("; ")})`];
    if (onOffer !== undefined && lots.includes(onOffer) && !state.ownership[onOffer]) {
      const after = mine.length + 1;
      parts.push(
        after === lots.length
          ? `  Getting ${spaceName(onOffer)} would complete this set for you.`
          : `  Getting ${spaceName(onOffer)} would give you ${String(after)} of ${String(lots.length)}; still not a full set.`,
      );
    }
    return parts.join("\n");
  });
}

function lotStatus(state: GameState, position: number, nameOf: NameOf): string {
  const owner = state.ownership[position];
  if (!owner) return "unowned";
  const parts = [`owned by ${nameOf(owner)}`];
  if (state.mortgaged[position]) {
    parts.push(`mortgaged (lifting it costs ${money(unmortgageCostAt(position) ?? 0)})`);
    return parts.join(", ");
  }
  const space = SPACES[position];
  const level = developmentLevel(state, position);
  if (level === 5) parts.push("a hotel");
  else if (level > 0) parts.push(`${String(level)} house${level > 1 ? "s" : ""}`);
  else if (space.kind === "property" && hasMonopoly(state, space.color, owner)) {
    parts.push("full set");
  }
  const rent = rentAt(state, position);
  if (rent) {
    parts.push(
      rent.kind === "dollars"
        ? `rent ${money(rent.amount)}`
        : `rent ${String(rent.multiplier)}x the dice`,
    );
  }
  return parts.join(", ");
}

function nameResolver(state: GameState, seat: string): NameOf {
  return (id) => {
    if (id === null) return "the bank";
    if (id === seat) return "you";
    return state.players.find((p) => p.id === id)?.name ?? id;
  };
}

function recentEvents(state: GameState): string[] {
  const nameOf: NameOf = (id) =>
    id === null ? "the bank" : (state.players.find((p) => p.id === id)?.name ?? id);
  const lines: string[] = [];
  for (const group of state.turns) {
    for (const event of group.events) {
      lines.push(renderHighlight({ turn: group.turn, actorId: group.playerId, event }, nameOf));
    }
  }
  return lines.slice(-RECENT_EVENTS);
}
