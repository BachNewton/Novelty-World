import type { RuleNotes, RuleText } from "../data/rule-notes";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import { bonusTakers } from "./room-bonus";
import { shortName } from "./short-name";
import type { ShownThing } from "./things";

/*
 * Inspecting, while the details are held: pointing at something expands its
 * own details label in place, with a line or two on what it is, and pressing
 * does nothing. The words come from the rules' own text (`rule-notes.json`),
 * its first line, never a copy kept here; the full text stays a Why away.
 */

/** The ids pointing finds while inspecting: a thing keeps its own id. */
export const inspectRoomId = (room: string) => `room:${room}`;
export const inspectFigureId = (figure: string) => `figure:${figure}`;

/** Whether the pointing tag (the name of what pressing would act on) shows
 *  over what is pointed at: never while inspecting, where the thing's own
 *  label explains it and pressing does nothing, whatever kind of target it
 *  is; nor while marks are off or a walk or a carried room plays. */
export function showsPointingTag(scene: { showMarks: boolean; inspecting: boolean }, busy: boolean): boolean {
  return scene.showMarks && !scene.inspecting && !busy;
}

/** The first line content/ gives an entry, or none where it has no entry or no text. */
const firstLine = (entries: Record<string, RuleText>, id: string): string[] => (Object.hasOwn(entries, id) ? entries[id].lines.slice(0, 1) : []);

const listed = (names: readonly string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** A thing's line: a token's rule, or a card's, as content/ words it first. */
export function thingLines(notes: RuleNotes, thing: Pick<ShownThing, "card" | "token" | "things">): string[] {
  if (thing.things.length > 1) return [];
  if (thing.token !== null) return firstLine(notes.tokens, thing.token);
  return thing.card === null ? [] : firstLine(notes.cards, thing.card);
}

/** A room's line: its own rule, short. A room without one has none. */
export function roomLines(notes: RuleNotes, room: string): string[] {
  return firstLine(notes.rooms, room);
}

/** An explorer's line: what they hold, beside the stats their nameplate shows. */
export function figureLines(engine: Engine, view: Pick<GameView, "figures">, figure: string): string[] {
  const held = view.figures[figure].cards.map((card) => `the ${engine.catalog.cards[card].name}`);
  return [held.length === 0 ? "Holds no cards" : `Holds ${listed(held)}`];
}

/** A room bonus badge's lines: the room's rule, and who has taken it. */
export function bonusLines(engine: Engine, view: Pick<GameView, "tokens" | "figures">, notes: RuleNotes, room: string): string[] {
  const takers = bonusTakers(engine, view, room).map((figure) => shortName(view.figures[figure].name));
  return [...roomLines(notes, room), takers.length === 0 ? "No one has taken it yet" : `Taken by ${listed(takers)}`];
}
