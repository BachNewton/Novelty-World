import { COLOR_LABEL, money, squareName, type NameOf } from "./format";
import { colorAt } from "../../../../development";
import type { GameEvent, GameState } from "../../../../types";
import { isNoteHeld } from "../../held";

// The game's history of play, for the view: what players chose and what they
// said, never what happened to them. Rolls, rent, taxes, cards and passing GO
// show only through their results (the board and cash), so they don't push
// out what the board can't show: offers made and how they were answered, buys
// and passes, auctions, building and mortgaging, how players left jail. Each
// note is shown beside the decision it explains (a note is logged just before
// it), and the history is grouped by kind of decision, oldest first within
// each, so patterns can be seen.

type Kind = "trades" | "auctions" | "buys" | "building" | "jail" | "other";

const HEADINGS: Readonly<Record<Kind, string>> = {
  trades: "Trade offers and how they were answered",
  auctions: "Auctions",
  buys: "Bought at the printed price, by player",
  building: "Building, selling and mortgaging",
  jail: "Leaving jail, by player",
  other: "Other",
};

/** Kinds listed one line per player, the player named once. */
const BY_PLAYER: ReadonlySet<Kind> = new Set(["buys", "jail"]);

type NoteEvent = Extract<GameEvent, { kind: "bot-note" }>;
type ManageEvent = Extract<GameEvent, { kind: "build" | "sell-building" | "mortgage" | "unmortgage" }>;

interface Entry {
  kind: Kind;
  /** For a kind listed by player: whose it is, and the text leaves the name out. */
  player?: string;
  text: string;
}

/** The whole game's history of play, grouped, as lines for the view. */
export function historyLines(state: GameState, nameOf: NameOf): string[] {
  const entries: Entry[] = [];
  const last = state.turns.length - 1;
  state.turns.forEach((group, index) => {
    entries.push(...groupEntries(state, group.turn, group.playerId, group.events, index === last, nameOf));
  });
  const lines: string[] = [];
  for (const kind of Object.keys(HEADINGS) as Kind[]) {
    const mine = entries.filter((entry) => entry.kind === kind);
    if (mine.length === 0) continue;
    lines.push(`${HEADINGS[kind]}:`);
    if (!BY_PLAYER.has(kind)) {
      lines.push(...mine.map((entry) => `- ${entry.text}`));
      continue;
    }
    for (const player of new Set(mine.map((entry) => entry.player ?? ""))) {
      const texts = mine.filter((entry) => (entry.player ?? "") === player).map((entry) => entry.text);
      lines.push(`- ${nameOf(player)}: ${texts.join("; ")}`);
    }
  }
  return lines;
}

/** One turn group's decisions, each with the notes that explain it. */
function groupEntries(
  state: GameState,
  turn: number,
  actorId: string,
  events: readonly GameEvent[],
  latest: boolean,
  nameOf: NameOf,
): Entry[] {
  const t = `T${String(turn)}`;
  const entries: Entry[] = [];
  let notes: NoteEvent[] = [];
  /** The waiting notes written by any of `players`, taken off the queue. */
  const said = (players: readonly string[]): string => {
    const mine = notes.filter((note) => players.includes(note.playerId));
    notes = notes.filter((note) => !players.includes(note.playerId));
    return mine.length === 0 ? "" : `; ${mine.map((note) => `${nameOf(note.playerId)}: "${note.text}"`).join("; ")}`;
  };
  /** The actor's own waiting notes, on a line that already names them. */
  const saidOwn = (player: string): string => {
    const mine = notes.filter((note) => note.playerId === player);
    notes = notes.filter((note) => note.playerId !== player);
    return mine.length === 0 ? "" : ` (${mine.map((note) => `"${note.text}"`).join(" ")})`;
  };
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    switch (event.kind) {
      case "bot-note":
        if (event.text !== "" && !isNoteHeld(state, event, latest)) notes.push(event);
        break;
      case "trade":
      case "trade-declined": {
        const parties = tradeParties(event);
        const outcome =
          event.kind === "trade"
            ? "accepted"
            : `${event.countered ? "countered" : "declined"} by ${nameOf(event.declinedBy)}`;
        entries.push({
          kind: "trades",
          text: `${t} ${nameOf(event.proposerId)} offered ${tradeMoves(event, nameOf)}: ${outcome}${said(parties)}`,
        });
        break;
      }
      case "buy":
        entries.push({ kind: "buys", player: actorId, text: `${t} ${squareName(event.position)}${saidOwn(actorId)}` });
        break;
      case "auction": {
        const passed = events.slice(0, i).some((e) => e.kind === "roll" && e.toPosition === event.position)
          ? `${nameOf(actorId)} passed on ${squareName(event.position)}; `
          : "";
        const result =
          event.winnerId === null
            ? `nobody bid at auction`
            : `${nameOf(event.winnerId)} won it at auction for ${money(event.price)}`;
        entries.push({ kind: "auctions", text: `${t} ${passed}${passed ? "" : `${squareName(event.position)}: `}${result}${said(notes.map((note) => note.playerId))}` });
        break;
      }
      case "build":
      case "sell-building":
      case "mortgage":
      case "unmortgage": {
        // A plan is applied as a run of these events: one line per run.
        const run: ManageEvent[] = [event];
        while (i + 1 < events.length && isManageBy(events[i + 1], event.playerId)) run.push(events[++i] as ManageEvent);
        entries.push({ kind: "building", text: `${t} ${nameOf(event.playerId)} ${managePlan(run)}${said([event.playerId])}` });
        break;
      }
      case "jail-pay":
        entries.push({ kind: "jail", player: actorId, text: `${t} paid $50${saidOwn(actorId)}` });
        break;
      case "jail-card":
        entries.push({ kind: "jail", player: actorId, text: `${t} played a Get Out of Jail Free card${saidOwn(actorId)}` });
        break;
      case "jail-roll":
        entries.push({
          kind: "jail",
          player: actorId,
          text: `${t} rolled for doubles, ${event.escaped ? "out" : "stayed"}${saidOwn(actorId)}`,
        });
        break;
      case "bankrupt":
        entries.push({ kind: "other", text: `${t} ${nameOf(event.debtorId)} went bankrupt to ${nameOf(event.creditorId)}` });
        break;
      case "ai-failed":
        entries.push({ kind: "other", text: `${t} ${nameOf(event.playerId)} couldn't decide (${event.decision})` });
        break;
      default:
        break;
    }
  }
  // Notes no decision followed: a turn start that only talked, or a note
  // whose decision is still under way.
  for (const note of notes) entries.push({ kind: "other", text: `${t} ${nameOf(note.playerId)} said: "${note.text}"` });
  return entries;
}

function isManageBy(event: GameEvent, player: string): event is ManageEvent {
  return (
    (event.kind === "build" || event.kind === "sell-building" || event.kind === "mortgage" || event.kind === "unmortgage") &&
    event.playerId === player
  );
}

/** A manage plan in a few words: houses built or sold per set with the
 *  levels they end at, and lots mortgaged or lifted. */
function managePlan(run: readonly ManageEvent[]): string {
  const parts: string[] = [];
  const mortgaged = run.filter((e) => e.kind === "mortgage").map((e) => squareName(e.position));
  const lifted = run.filter((e) => e.kind === "unmortgage").map((e) => squareName(e.position));
  if (mortgaged.length > 0) parts.push(`mortgaged ${mortgaged.join(", ")}`);
  if (lifted.length > 0) parts.push(`lifted the mortgage on ${lifted.join(", ")}`);
  for (const [kind, verb] of [["build", "built"], ["sell-building", "sold"]] as const) {
    // Per set: how many buildings moved, and the level each lot ended at.
    const sets = new Map<string, { count: number; levels: Map<number, number> }>();
    for (const e of run) {
      if (e.kind !== kind) continue;
      const color = colorAt(e.position);
      const label = color === null ? squareName(e.position) : COLOR_LABEL[color];
      const set = sets.get(label) ?? { count: 0, levels: new Map<number, number>() };
      set.count += 1;
      set.levels.set(e.position, e.toLevel);
      sets.set(label, set);
    }
    for (const [label, { count, levels }] of sets) {
      const ends = [...levels].map(([pos, level]) => `${squareName(pos)} ${level === 5 ? "hotel" : String(level)}`).join(", ");
      parts.push(`${verb} ${String(count)} on ${label} (now ${ends})`);
    }
  }
  return parts.join("; ");
}

function tradeParties(event: Extract<GameEvent, { kind: "trade" | "trade-declined" }>): string[] {
  return [
    ...new Set([
      event.proposerId,
      ...Object.values(event.propertyTo),
      ...Object.values(event.propertyFrom),
      ...Object.keys(event.cashDelta),
      ...Object.values(event.gojfTo),
      ...Object.values(event.gojfFrom),
    ]),
  ].filter((id): id is string => typeof id === "string");
}

/** A trade's moves in a few words: lots to their new owners, then cash. */
function tradeMoves(event: Extract<GameEvent, { kind: "trade" | "trade-declined" }>, nameOf: NameOf): string {
  const byOwner = new Map<string, string[]>();
  for (const [pos, to] of Object.entries(event.propertyTo)) byOwner.set(to, [...(byOwner.get(to) ?? []), squareName(Number(pos))]);
  for (const to of Object.values(event.gojfTo)) byOwner.set(to, [...(byOwner.get(to) ?? []), "a Get Out of Jail Free card"]);
  const lots = [...byOwner].map(([to, items]) => `${items.join(" + ")} to ${nameOf(to)}`);
  const cash = Object.entries(event.cashDelta)
    .filter(([, delta]) => delta < 0)
    .map(([id, delta]) => `${nameOf(id)} pays ${money(-delta)}`);
  return [...lots, ...cash].join(", ") || "nothing";
}
