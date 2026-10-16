import type { CardType, FigureId, Trait } from "../types";
import type { Engine } from "../engine/step-loop";
import type { EventView } from "../engine/view";
import type { RuleNotes } from "../data/rule-notes";

/*
 * Cards in the house, in words and colours (presentation.md, "Cards"): a
 * draw is a beat with the card's name over the room in its colour, held
 * cards live on the figure, and a card is read where it is used. Colour has
 * a meaning: amber for an item (human), violet for an omen (magic), and an
 * event in its mood.
 */

/** What a colour means in the house, light and UI alike (CLAUDE.md, "Visual style"). */
export type Mood = "moon" | "human" | "supernatural" | "danger" | "magic" | "holy";

/** Each event card's mood: the colour its draw shows in. */
export const EVENT_MOODS: Readonly<Record<string, Mood>> = {
  "a-moment-of-hope": "holy",
  acupuncture: "human",
  "angry-being": "supernatural",
  "bloody-vision": "danger",
  "burial-mound": "supernatural",
  "burning-man": "danger",
  "closet-door": "moon",
  contract: "danger",
  "creepy-crawlies": "supernatural",
  "creepy-puppet": "danger",
  debris: "moon",
  "disquieting-sounds": "moon",
  "drip-drip-drip": "moon",
  flytrap: "supernatural",
  footsteps: "supernatural",
  funeral: "moon",
  "ghost-in-the-machine": "supernatural",
  "grave-dirt": "supernatural",
  groundskeeper: "danger",
  "hanged-men": "supernatural",
  "hideous-shriek": "supernatural",
  "image-in-the-mirror-give": "magic",
  "image-in-the-mirror-take": "magic",
  "it-is-meant-to-be": "magic",
  "jonahs-turn": "magic",
  "lightning-strikes": "moon",
  "lights-out": "moon",
  "locked-safe": "human",
  "misty-arch": "magic",
  "mists-from-the-walls": "supernatural",
  "mutant-housepet": "danger",
  "mystic-slide": "magic",
  "night-view": "moon",
  "phone-call": "human",
  possession: "danger",
  "revolving-wall": "moon",
  rotten: "supernatural",
  "secret-passage": "moon",
  "secret-stairs": "moon",
  "shrieking-wind": "moon",
  silence: "supernatural",
  skeletons: "supernatural",
  smoke: "moon",
  "something-hidden": "human",
  "something-slimy": "supernatural",
  spider: "danger",
  "the-beckoning": "magic",
  "the-left-hand": "danger",
  "the-lost-one": "supernatural",
  "the-voice": "supernatural",
  "the-walls": "supernatural",
  "the-walls-have-eyes": "supernatural",
  webs: "danger",
  "what-the": "magic",
  "what-year-is-it": "magic",
  whoops: "danger",
};

const TYPE_MOODS: Record<Exclude<CardType, "event">, Mood> = { item: "human", omen: "magic" };

/** The colour a card shows in. */
export function cardMood(engine: Engine, card: string): Mood {
  const { type } = engine.catalog.cards[card];
  if (type !== "event") return TYPE_MOODS[type];
  if (!(card in EVENT_MOODS)) throw new Error(`The event ${card} has no mood`);
  return EVENT_MOODS[card];
}

const TYPE_NAMES: Record<CardType, string> = { item: "Item", omen: "Omen", event: "Event" };

export const cardTypeName = (engine: Engine, card: string): string => TYPE_NAMES[engine.catalog.cards[card].type];

/** A card's text, a line per rule, without the haunt roll an omen's draw makes: held, that is done with. */
export function heldText(notes: RuleNotes, card: string): string[] {
  return notes.cards[card].lines.filter((line) => line !== "Make a haunt roll now.");
}

/** What using a card costs or leaves, in a line: the rest of its text past
 *  the sentence that offers it ("Each time you do, lose 1 Sanity"), or that
 *  sentence when it is all there is. */
export function consequence(notes: RuleNotes, card: string): string | null {
  const lines = heldText(notes, card);
  if (lines.length === 0) return null;
  return lines.length === 1 ? lines[0] : lines.slice(1).join(" ");
}

/** A gain or loss of a trait, floated over its figure as its icon and a number. */
export interface StatChange {
  /** The event, with a trait after it when one event changes several. */
  id: string;
  figure: FigureId;
  trait: Trait;
  /** Spaces gained (more than 0) or lost. */
  spaces: number;
}

/** The trait changes in these events, one per trait changed. */
export function statChanges(events: readonly EventView[]): StatChange[] {
  return events.flatMap((event): StatChange[] => {
    if (event.type === "trait-changed") {
      const { figure, trait, spaces } = event.data;
      return spaces === 0 ? [] : [{ id: event.id, figure, trait, spaces }];
    }
    if (event.type === "damaged") {
      const { figure, split } = event.data;
      return Object.entries(split).flatMap(([trait, spaces]) => (spaces > 0 ? [{ id: `${event.id}:${trait}`, figure, trait: trait as Trait, spaces: -spaces }] : []));
    }
    return [];
  });
}

/** The card a card-drawn event drew, and who drew it. */
export function drawnCard(event: EventView): { figure: FigureId; card: string; type: CardType } | null {
  return event.type === "card-drawn" ? event.data : null;
}
