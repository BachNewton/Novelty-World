import type { Role } from "../engine/people";
import type { PlaceKind } from "../engine/regions";
import type { Species } from "../engine/strays";
import type { Food, RecipeId } from "../gameplay/recipes";

/*
 * What a story is, as data: the people Elliott meets each carry one, and a
 * conversation is a few of its pages. Every story is written as plain data
 * (Claude writes them, as a growing library in `stories/`), and which talk a
 * meeting opens is decided by the story's kind and what Elliott has done:
 *
 * - **talk**: a tale, a bit of local lore, a recipe tip. Meeting them, then
 *   meeting a friend.
 * - **help**: they ask for something the game can already do (a dish, some
 *   forage, a lost cat or dog befriended and brought back, a note carried to
 *   someone). Meeting them asks; talking again while it is still to do is
 *   their waiting talk; coming back with it is their thanks; after, a friend.
 * - **receive**: the someone a note is carried to, met as a story of their
 *   own, who has a talk for while they wait and one for when it arrives.
 *
 * A mystery is another kind to come, its talks chosen the same way from what
 * Elliott has found (its clues) and worked out (its deductions).
 *
 * A page is one thing the person says, and may offer Elliott a choice of
 * tone (warm, curious, playful): every choice is answered and leads on, so
 * a conversation can never go wrong. A text may name things the world
 * decides, in braces: {name} (the person), {pet} (the lost animal's name),
 * {way} (where the lost animal or the person to find went, as "the
 * north-east"), {partner} (the other one of a carried note), {dish} (the
 * dish asked for) and {gave} (what Elliott brought).
 */

export const TONES = ["warm", "curious", "playful"] as const;
export type Tone = (typeof TONES)[number];

export interface Choice {
  tone: Tone;
  /** What Elliott says: short. */
  say: string;
  /** What the person answers. */
  reply: string;
}

export interface Page {
  say: string;
  /** Three choices of tone, one of each, or none. */
  choices?: readonly Choice[];
}

/** Something given to Elliott: a recipe's hint in the book, a keepsake for camp, or the lost animal to keep. */
export type Gift = { kind: "hint"; recipe: RecipeId } | { kind: "keepsake"; keepsake: Keepsake } | { kind: "companion" };

export interface Talk {
  pages: readonly Page[];
  /** Given as the talk opens, so leaving early never loses one. */
  gifts?: readonly Gift[];
}

/** Meeting them again, as a friend: the first line by the tone Elliott took with them last, then the pages. */
export interface FriendTalk extends Talk {
  greet: Record<Tone, string>;
}

export const KEEPSAKES = ["honey-jar", "carved-fish", "felted-reindeer", "sea-glass", "rowan-seedling", "compass"] as const;
export type Keepsake = (typeof KEEPSAKES)[number];

/** What a note carried from one person to another is. */
export type Parcel = "note";

export type Request =
  /** A dish: a recipe's own, or anything warm from the pot. */
  | { kind: "dish"; dish: RecipeId | "warm" }
  /** Some forage, of any of these kinds together. */
  | { kind: "forage"; foods: readonly Food[]; count: number }
  /** Their lost animal, befriended and brought back to them. Kept by Elliott if the thanks gives it as a companion; else it goes home. */
  | { kind: "pet"; species: Species }
  /** Something carried to the person of another story, placed in the world as their partner. */
  | { kind: "carry"; parcel: Parcel; to: string };

interface Told {
  id: string;
  /** What it is called, for the journal's accessible names. */
  title: string;
  /** Who can carry it. */
  roles: readonly Role[];
  /** Only by these places, if given. */
  places?: readonly PlaceKind[];
  /** How often it is chosen among those who fit, 1 if not given; 0 is never chosen by itself (a partner's story). */
  weight?: number;
  meet: Talk;
  friend: FriendTalk;
}

export interface TalkStory extends Told {
  kind: "talk";
}

export interface HelpStory extends Told {
  kind: "help";
  request: Request;
  waiting: Talk;
  thanks: Talk;
}

export interface ReceiveStory extends Told {
  kind: "receive";
  /** Talking again before it has come. */
  waiting: Talk;
  /** Opened when what was carried to them arrives, even as a first meeting. */
  delivered: Talk;
}

export type Story = TalkStory | HelpStory | ReceiveStory;

/** Every talk a story has, by its name. */
export function talksOf(story: Story): Record<string, Talk> {
  const talks: Record<string, Talk> = { meet: story.meet, friend: story.friend };
  if (story.kind === "help") Object.assign(talks, { waiting: story.waiting, thanks: story.thanks });
  if (story.kind === "receive") Object.assign(talks, { waiting: story.waiting, delivered: story.delivered });
  return talks;
}
