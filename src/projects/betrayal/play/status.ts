import type { FigureId } from "../types";
import { describeEvent, describeRule, rollName, traitName } from "../engine/describe";
import type { RollSpec } from "../engine/sources";
import type { Engine } from "../engine/step-loop";
import type { EventView, GameView, RuleView } from "../engine/view";
import { ruleDetail, ruleTexts, type RuleNotes } from "../data/rule-notes";

/*
 * The play screen's status box, in words: what the latest write did, in
 * plain language, and why, as the short statement of each rule behind it
 * with its source named. The rule's full text and rulings are the "why?"
 * content, a tap away. Rolls show their dice, total and outcome; a room
 * placed the only way it fits says so.
 */

/** One line of what happened, with the event it tells. */
export interface Happening {
  text: string;
  event: EventView;
}

/** A rule behind what happened, put in one plain sentence with its source named. */
export interface WhyItem {
  rule: RuleView;
  statement: string;
}

/** Events of the rulebook's plain flow (a turn's start and end, moving,
 *  discovering a room): they need no explaining. */
const PLAIN = new Set(["game-started", "turn-started", "turn-ended", "left", "entered", "crossed", "discovered", "ready", "acting", "side-chosen", "room-placed"]);

/** Whether an event was caused by a rule worth explaining: a room's text, a
 *  card, a token, a haunt, or the rulebook beyond its plain flow. A scenario
 *  set up for playtesting is no rule. */
export function isRuleDriven(event: Pick<EventView, "type" | "rule">): boolean {
  if (event.rule.source === "scenario") return false;
  return event.rule.source !== "rulebook" || !PLAIN.has(event.type);
}

interface Rolled {
  figure: FigureId;
  spec: RollSpec;
  dice: number[];
  named: number | null;
  bonus: number;
  result: number;
}

const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** The first sentence of a rule's text, whole, with its markdown emphasis dropped. */
function firstSentence(text: string): string {
  const plain = text.replaceAll("**", "").trim();
  const end = plain.search(/[.!?](\s|$)/);
  const sentence = end < 0 ? plain : plain.slice(0, end + 1);
  // A sentence leading into a list ("Choose one of 2 options:") ends there.
  return /[.!?]$/.test(sentence) ? sentence : `${sentence.replace(/:$/, "")}.`;
}

/** A rule's lines, from content/, for a room, card or token. */
function ownLines(notes: RuleNotes, rule: RuleView): string[] {
  if (rule.source !== "room" && rule.source !== "card" && rule.source !== "token") return [];
  return ruleTexts(notes, rule).flatMap((text) => text.lines);
}

/** A roll table row's results: "4+", "2–3" or "4", as the lowest and highest it covers, or null for any other line. */
function rowRange(label: string): [number, number] | null {
  if (/^\d+$/.test(label)) return [Number(label), Number(label)];
  if (/^\d+\+$/.test(label)) return [Number(label.slice(0, -1)), Infinity];
  const range = /^(\d+)[–-](\d+)$/.exec(label);
  return range ? [Number(range[1]), Number(range[2])] : null;
}

/** What a roll's result means, as the rule's text states it: the target a
 *  trait roll needed ("a Might roll of 3+"), or the row of the rule's one
 *  roll table the result falls in. Null when the text doesn't say it plainly
 *  for this roll: no target or table, or more than one. */
export function rollOutcome(lines: string[], spec: RollSpec, result: number): string | null {
  const text = lines.join(" ").replaceAll("**", "");
  const trait = spec.kind === "trait" ? traitName(spec.trait) : null;
  if (trait !== null) {
    const targets = new Set(
      [...text.matchAll(/(\w+) roll of (\d+)\+/g)].filter((match) => match[1] === trait).map((match) => Number(match[2])),
    );
    if (targets.size === 1) {
      const [target] = targets;
      return `, needed ${target}+: ${result >= target ? "success" : "failure"}`;
    }
  }
  const asked =
    trait !== null
      ? text.includes(`${trait} roll`)
      : spec.kind === "dice" && [...text.matchAll(/roll (\d+) dice/gi)].some((match) => Number(match[1]) === spec.count);
  if (!asked) return null;
  const rows = lines.flatMap((line, i) => {
    const colon = line.indexOf(": ");
    const range = colon < 0 ? null : rowRange(line.slice(0, colon));
    return range ? [{ i, low: range[0], high: range[1], label: line.slice(0, colon), does: line.slice(colon + 2) }] : [];
  });
  // One table: its rows run together.
  if (rows.length === 0 || rows.some((row, n) => row.i !== rows[0].i + n)) return null;
  const row = rows.find((candidate) => result >= candidate.low && result <= candidate.high);
  return row ? `. ${row.label}: ${row.does.replace(/\.$/, "")}` : null;
}

function rollText(engine: Engine, view: GameView, event: EventView, notes: RuleNotes | null): string | null {
  const d = event.data as unknown as Rolled;
  // A named result, no dice at all, or a card's attacker's dice thrown for it read as the engine words them.
  if (d.named !== null || d.dice.length === 0 || (d.spec.kind === "attack" && d.spec.dice !== null)) return null;
  const bonus = d.bonus === 0 ? "" : d.bonus > 0 ? ` + ${d.bonus}` : ` - ${-d.bonus}`;
  const outcome = notes === null ? null : rollOutcome(ownLines(notes, event.rule), d.spec, d.result);
  const source = event.rule.source === "room" || event.rule.source === "card" || event.rule.source === "token" ? `${describeRule(engine, event.rule)}: ` : "";
  return `${source}${view.figures[d.figure].name}'s ${rollName(d.spec)}: ${d.dice.join(" + ")}${bonus} = ${d.result}${outcome ?? ""}.`;
}

/** The latest write's events in plain language, one line each. A room that
 *  fits only one way is said to be placed so, after its discovery. */
export function happenings(engine: Engine, view: GameView, notes: RuleNotes | null): Happening[] {
  const events = view.events;
  const lines: Happening[] = [];
  const after = new Map<number, Happening>();
  for (const [i, event] of events.entries()) {
    if (event.type === "forced" && (event.data as { kind?: string }).kind === "rotation") {
      const placing = events.findIndex((later, j) => j > i && (later.type === "discovered" || later.type === "room-placed"));
      if (placing >= 0) {
        const room = (events[placing].data as { room?: string; tile?: string }).room ?? (events[placing].data as { tile: string }).tile;
        after.set(placing, { text: `The ${engine.catalog.rooms[room].name} fits only one way round: placed.`, event });
        continue;
      }
    }
    const text = (event.type === "rolled" ? rollText(engine, view, event, notes) : null) ?? describeEvent(engine, view, event);
    if (text !== null) lines.push({ text, event });
    const forced = after.get(i);
    if (forced) lines.push(forced);
  }
  return lines;
}

/** The rulebook's rules behind events beyond its plain flow, in our own words. */
const RULEBOOK: Partial<Record<string, string>> = {
  "card-drawn": "the first explorer to discover a room with a card symbol draws that card",
  "movement-ended": "drawing a card ends your movement for the rest of the turn",
  "forced:rotation": "a room that fits only one way round goes in that way, with no question asked",
  forced: "when the rules leave only one choice, the game takes it for you",
  "haunt-roll": "each turn you draw an omen ends with a haunt roll of 6 dice: under the number of omens drawn, the haunt begins",
  slowed: "after the haunt starts, leaving a room costs 1 extra space of movement for each opponent in it",
};

const HAUNT_ROLL_EVENTS = new Set(["haunt-held-off", "haunt-revealed"]);

function rulebookKey(event: Pick<EventView, "type" | "data">): string {
  const data = event.data as { kind?: string; spec?: RollSpec };
  if (HAUNT_ROLL_EVENTS.has(event.type) || (event.type === "rolled" && data.spec?.kind === "haunt")) return "haunt-roll";
  if (event.type === "forced" && data.kind === "rotation") return "forced:rotation";
  return event.type;
}

/** A section's title without the page it is on: "Move (p. 6)" is "Move". */
const untitled = (title: string) => title.replace(/\s*\((?:sidebar, )?p\. \d+\)$/, "");

/** A rule in one plain sentence, its source named first: a room's, card's or
 *  token's text opens with it; a ruling is its resolution; the rulebook's
 *  are worded per event, or else named by the sections of its page. */
export function ruleStatement(engine: Engine, notes: RuleNotes | null, rule: RuleView, event: Pick<EventView, "type" | "data"> | null): string {
  const source = describeRule(engine, rule);
  if (rule.hiddenRuling) return `${source}: a ruling from one side's half of the haunt, which only that side may read.`;
  if (notes !== null && rule.ruling !== undefined) {
    const ruling = ruleDetail(notes, rule).flatMap((text) => text.rulings).at(0);
    if (ruling?.resolution) return `${source}: ${capital(firstSentence(ruling.resolution))}`;
  }
  switch (rule.source) {
    case "room":
    case "card":
    case "token": {
      const first = notes === null ? undefined : ownLines(notes, rule).at(0);
      return first === undefined ? `${source}.` : `${source}: ${firstSentence(first)}`;
    }
    case "haunt":
      return `${source}: this haunt's own rule, in its half of the haunt book.`;
    case "rulebook": {
      const worded = event === null ? undefined : RULEBOOK[rulebookKey(event)];
      if (worded !== undefined) return `${source}: ${capital(worded)}.`;
      const sections = notes === null ? [] : (notes.pages[rule.page] ?? []).map((text) => untitled(text.title));
      return sections.length === 0 ? `${source}.` : `${source}: ${sections.join(", ")}.`;
    }
    case "scenario":
      return `${source}: set up by the scenario this game started from.`;
  }
}

/** The rules behind what happened, each once, in the order they first acted:
 *  those of rule-driven events, then the rule that raised the pending
 *  decision when it is a room's, card's, token's or haunt's. */
export function whyItems(engine: Engine, notes: RuleNotes | null, lines: Happening[], decision: RuleView | null): WhyItem[] {
  const items: WhyItem[] = [];
  const add = (rule: RuleView, event: Pick<EventView, "type" | "data"> | null) => {
    const statement = ruleStatement(engine, notes, rule, event);
    if (!items.some((item) => item.statement === statement)) items.push({ rule, statement });
  };
  for (const { event } of lines) if (isRuleDriven(event)) add(event.rule, event);
  if (decision && decision.source !== "rulebook" && decision.source !== "scenario") add(decision, null);
  return items;
}

