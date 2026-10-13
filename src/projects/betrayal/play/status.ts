import type { FigureId } from "../types";
import { describeEvent, describeRule, landedText, rollName } from "../engine/describe";
import type { RowSummary } from "../engine/outcomes";
import type { RollSpec } from "../engine/sources";
import type { Engine } from "../engine/step-loop";
import type { EventView, GameView, RuleView } from "../engine/view";
import { ruleDetail, ruleTexts, type RuleNotes } from "../data/rule-notes";

/*
 * The play screen's status box, in words: the line of the beat playing, in
 * plain language, and its Why, the rules behind it, each named by its
 * source (a room, card, token, haunt or the rulebook's section, never a
 * page number) with a short statement, then its full text and rulings.
 * Rolls show their dice, total, and the row of their table they land on.
 */

/** A rule behind what happened: its name, and the rule in one plain sentence. */
export interface WhyItem {
  rule: RuleView;
  name: string;
  statement: string;
}

/** Events of the rulebook's plain flow (a turn's start and end, moving,
 *  discovering a room): they need no explaining. */
const PLAIN = new Set(["game-started", "turn-started", "turn-ended", "left", "entered", "crossed", "discovered", "ready", "acting", "side-chosen", "room-placed"]);

/** Whether an event was caused by a rule worth explaining: a room's text, a
 *  card, a token, a haunt, or the rulebook beyond its plain flow. A scenario
 *  set up for playtesting is no rule. */
export function isRuleDriven(event: Pick<EventView, "type" | "rule">): boolean {
  if (event.rule.source === "scenario" || event.rule.source === "players") return false;
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
export function ownLines(notes: RuleNotes, rule: RuleView): string[] {
  if (rule.source !== "room" && rule.source !== "card" && rule.source !== "token") return [];
  return ruleTexts(notes, rule).flatMap((text) => text.lines);
}

function rollText(engine: Engine, view: GameView, event: EventView): string | null {
  const d = event.data as unknown as Rolled;
  // A named result, no dice at all, or a card's attacker's dice thrown for it read as the engine words them.
  if (d.named !== null || d.dice.length === 0 || (d.spec.kind === "attack" && d.spec.dice !== null)) return null;
  const bonus = d.bonus === 0 ? "" : d.bonus > 0 ? ` + ${d.bonus}` : ` - ${-d.bonus}`;
  const source = event.rule.source === "room" || event.rule.source === "card" || event.rule.source === "token" ? `${describeRule(engine, event.rule)}: ` : "";
  return `${source}${view.figures[d.figure].name}'s ${rollName(d.spec)}: ${d.dice.join(" + ")}${bonus} = ${d.result}.`;
}

/** An event's line, as the seat holding the device may read it, or null
 *  when it has no words for them; a roll's ends with the row of its table it
 *  landed on, told in the same beat. */
export function lineText(engine: Engine, view: GameView, event: EventView, beat: readonly EventView[] = []): string | null {
  const text = (event.type === "rolled" ? rollText(engine, view, event) : null) ?? describeEvent(engine, view, event);
  const row = event.type === "rolled" ? beat.find((other) => other.type === "table-row") : undefined;
  if (text === null || row === undefined) return text;
  const { rows, index } = row.data as unknown as { rows: RowSummary[]; index: number };
  return `${text} ${landedText(engine, rows[index])}`;
}

/** The rulebook's rules behind events beyond its plain flow, in our own words. */
const RULEBOOK: Partial<Record<string, string>> = {
  "card-drawn": "the first explorer to discover a room with a card symbol draws that card",
  "movement-ended": "drawing a card ends your movement for the rest of the turn",
  "forced:rotation": "a room that fits only one way round goes in that way, with no question asked",
  forced: "when the rules leave only one thing that can happen, it happens",
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
export const untitled = (title: string) => title.replace(/\s*\((?:sidebar, )?p\. \d+\)$/, "");

/** A rule's name: its room, card or token, its haunt, or the rulebook's
 *  sections on its page, never the page's number. */
export function ruleName(engine: Engine, notes: RuleNotes | null, rule: RuleView): string {
  if (rule.source !== "rulebook") return describeRule(engine, rule);
  const sections = notes === null ? [] : (notes.pages[rule.page] ?? []).map((text) => untitled(text.title));
  return sections.length === 0 ? "The rulebook" : sections.join(", ");
}

/** A rule in one plain sentence: a room's, card's or token's opens with
 *  its name, then its text; a ruling is its resolution; the rulebook's are
 *  worded per event, or else named by the sections of its page. */
export function ruleStatement(engine: Engine, notes: RuleNotes | null, rule: RuleView, event: Pick<EventView, "type" | "data"> | null): string {
  const source = ruleName(engine, notes, rule);
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
      return worded === undefined ? `${source}.` : `${capital(worded)}.`;
    }
    case "scenario":
      return "Set up by the scenario this game started from.";
    case "players":
      return "Chosen by the players, not by a rule.";
  }
}

/** The rules behind a beat, each once, in the order they acted: those of its
 *  rule-driven events, then, with nothing playing, the rule that raised the
 *  pending decision when it is a room's, card's, token's or haunt's. */
export function whyItems(engine: Engine, notes: RuleNotes | null, events: readonly EventView[], decision: RuleView | null): WhyItem[] {
  const items: WhyItem[] = [];
  const add = (rule: RuleView, event: Pick<EventView, "type" | "data"> | null) => {
    const statement = ruleStatement(engine, notes, rule, event);
    if (!items.some((item) => item.statement === statement)) items.push({ rule, name: ruleName(engine, notes, rule), statement });
  };
  for (const event of events) if (isRuleDriven(event)) add(event.rule, event);
  if (decision && decision.source !== "rulebook" && decision.source !== "scenario" && decision.source !== "players") add(decision, null);
  return items;
}
