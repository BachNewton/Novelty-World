import { HOUSE_COST, SPACES } from "../../../../data";
import { bankSupply, developmentLevel, groupPositions } from "../../../../development";
import { hasMonopoly, rentAt, unmortgageCostAt } from "../../../../logic";
import type { GameState, Player } from "../../../../types";
import { aiSeat } from "../../seat";
import type { AiPrompt } from "../../spec";
import { logLines } from "./events";
import {
  COLOR_LABEL,
  COLORS,
  money,
  playerById,
  seatNames,
  squareLabel,
  squareName,
  tableNames,
  type NameOf,
} from "./format";

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

When you have time to think before answering:
- Think only about the game decision, and briefly: list the two to four facts that matter most, weigh them, and conclude.
- Don't restate the board, the rules or the question; they are all in front of you.
- Don't think about the answer's format or fields. You'll be asked for the answer separately, in a later step.

How to answer:
- Answer only in the JSON form asked for. Be brief everywhere.
- "privateNote": your reasoning, at most three short sentences. Write it first. Only you will see it.
- "publicNote": one short sentence the whole table sees, in your voice. When you propose or counter a trade, it is your message to the other side. Never reveal the most you'd pay or the least you'd accept.
- "plan": one short sentence to your future self about the next few turns. You'll be shown it next time.
- Trust the facts in your view over your own notes and plan. Stick to the rules above. Don't invent rules.`;

/** The prompt for one decision. A pure function of the state, the seat and the
 *  question: the same inputs always give the same prompt, so a bad move can be
 *  debugged by rebuilding exactly what the model saw. */
export function buildPrompt(state: GameState, seat: string, question: string): AiPrompt {
  const me = playerById(state, seat);
  const plan = aiSeat(state, seat).plan;
  const supply = bankSupply(state);
  const sections = [
    `You are ${me.name}. It is turn ${String(state.turns.length)}.`,
    `Players, in seat order:\n${state.players.map((p) => playerLine(state, p, seat)).join("\n")}`,
    `The board, set by set:\n${boardLines(state, seat).join("\n")}\nBank: ${String(supply.houses)} houses and ${String(supply.hotels)} hotels left.`,
    `Your plan from last time (your own note; it may be wrong, so check it against the board above): ${plan ?? "(none yet)"}`,
    `Recent events, oldest first:\n${logLines(state, tableNames(state)).slice(-RECENT_EVENTS).join("\n") || "(none yet)"}`,
    `Decision:\n${question}`,
  ];
  return { system: RULES, user: sections.join("\n\n") };
}

function playerLine(state: GameState, p: Player, seat: string): string {
  const parts = [`${p.name}${p.id === seat ? " (you)" : ""}`, p.bankrupt ? "bankrupt" : money(p.cash)];
  if (!p.bankrupt) {
    parts.push(
      p.inJail ? `in jail (turn ${String(p.jailTurns)} of 3)` : `on ${squareLabel(p.position)}`,
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

const kindPositions = (kind: "railroad" | "utility"): readonly number[] =>
  SPACES.flatMap((space, pos) => (space.kind === kind ? [pos] : []));
export const RAILROADS = kindPositions("railroad");
export const UTILITIES = kindPositions("utility");

/** The board one group at a time: each color set, then the railroads and the
 *  utilities, each headed by what it means for the seat (how many it holds,
 *  whether it can build) and who holds the rest, then its lots. */
function boardLines(state: GameState, seat: string): string[] {
  const nameOf = seatNames(state, seat);
  const lines: string[] = [];
  for (const color of COLORS) {
    const lots = groupPositions(color);
    const mine = lots.filter((pos) => state.ownership[pos] === seat).length;
    const status =
      mine === lots.length
        ? "your full set, so you can build here"
        : `you own ${String(mine)} of ${String(lots.length)}, so you can't build here yet`;
    lines.push(
      `${COLOR_LABEL[color]} (houses ${money(HOUSE_COST[color])} each): ${status}; ${holdersLine(state, lots, nameOf)}`,
      ...lotLines(state, lots, nameOf),
    );
  }
  const rails = RAILROADS.filter((pos) => state.ownership[pos] === seat).length;
  lines.push(
    `Railroads: you own ${String(rails)} of 4; ${holdersLine(state, RAILROADS, nameOf)}`,
    ...lotLines(state, RAILROADS, nameOf),
  );
  const utils = UTILITIES.filter((pos) => state.ownership[pos] === seat).length;
  lines.push(
    `Utilities: you own ${String(utils)} of 2; ${holdersLine(state, UTILITIES, nameOf)}`,
    ...lotLines(state, UTILITIES, nameOf),
  );
  return lines;
}

/** "held by: you 1, Bob 1, unowned 1" for a group. */
function holdersLine(state: GameState, lots: readonly number[], nameOf: NameOf): string {
  const counts = new Map<string | null, number>();
  for (const pos of lots) {
    const owner = state.ownership[pos] ?? null;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const parts = [...counts].map(([id, n]) => `${id === null ? "unowned" : nameOf(id)} ${String(n)}`);
  return `held by: ${parts.join(", ")}`;
}

function lotLines(state: GameState, lots: readonly number[], nameOf: NameOf): string[] {
  return lots.map((pos) => {
    const space = SPACES[pos];
    const price = space.kind === "property" || space.kind === "railroad" || space.kind === "utility" ? space.price : 0;
    return `  - ${squareLabel(pos)}, price ${money(price)}: ${lotStatus(state, pos, nameOf)}`;
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
    parts.push(rent.kind === "dollars" ? `rent ${money(rent.amount)}` : `rent ${String(rent.multiplier)}x the dice`);
  }
  return parts.join(", ");
}

/** What owning an unowned lot would mean for the seat, stated outright: how
 *  much of its group the seat would hold, whether that completes a set or
 *  blocks one, and the rent it would charge. Used by the buy and auction
 *  questions, so the consequence sits beside the choice. */
export function acquisitionLines(state: GameState, seat: string, position: number): string[] {
  const nameOf = seatNames(state, seat);
  const space = SPACES[position];
  const name = squareName(position);
  if (space.kind === "railroad") {
    const after = RAILROADS.filter((pos) => state.ownership[pos] === seat).length + 1;
    return [`Owning ${name} would give you ${String(after)} of 4 railroads; each of yours would then charge ${money(25 * 2 ** (after - 1))} rent.`];
  }
  if (space.kind === "utility") {
    const after = UTILITIES.filter((pos) => state.ownership[pos] === seat).length + 1;
    return [`Owning ${name} would give you ${String(after)} of 2 utilities; rent would be ${after === 2 ? "10x" : "4x"} the dice.`];
  }
  if (space.kind !== "property") return [];
  const lots = groupPositions(space.color);
  const others = lots.filter((pos) => pos !== position);
  const label = COLOR_LABEL[space.color];
  const after = lots.filter((pos) => state.ownership[pos] === seat).length + 1;
  const othersLine = others.map((pos) => `${squareName(pos)}: ${nameOf(state.ownership[pos] ?? null)}`).join("; ");
  const lines = [
    after === lots.length
      ? `Owning ${name} would complete ${label} for you: a full set you could build on.`
      : `Owning ${name} would give you ${String(after)} of ${String(lots.length)} ${label}; still not a full set (${othersLine}).`,
    `Its base rent is ${money(space.rent.base)}, doubled with the full set, and much more with houses.`,
  ];
  // `ownership` has no entry for an unowned lot, so only owned lots count.
  const othersOwned = others.every((pos) => pos in state.ownership);
  const rivals = new Set(others.map((pos) => state.ownership[pos]));
  const [rival] = rivals;
  if (othersOwned && rivals.size === 1 && rival !== seat) {
    lines.push(`${nameOf(rival)} owns the other ${label} lots: whoever gets ${name} decides whether ${nameOf(rival)} completes the set.`);
  }
  return lines;
}
