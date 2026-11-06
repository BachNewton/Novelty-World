import type { PlayMode } from "../challenge/passes";
import type { Medal } from "../challenge/standings";
import type { ChallengeKind, RaceGround, RaceShape } from "../challenge/types";
import type { Tyre } from "../sim/surfaces";

/*
 * The game menu, as the game wants it: which items it holds, in order, and
 * whether opening it stops the drive. The game works it out each time the
 * menu opens, and the page draws each item by its id. After a challenge's
 * attempt it is the result card: how the attempt went, then Retry and Leave.
 * The same dialog is a challenge's small choices on its own button: Solo or
 * Co-op in a start ring with another player in it, and Join or Decline when
 * another player asks. A race's button opens its card first, whatever else:
 * the track and its car, the medals won, then Start.
 */

/** Something the game menu can offer. Resume and Cancel close it. */
export type MenuItemId = "resume" | "tyres" | "sound" | "start-solo" | "start-coop" | "join-coop" | "decline-coop" | "cancel" | "retry" | "leave";

/** How a race finished: the medal, the place, and everyone in finishing order. */
export interface RaceResult {
  ground: RaceGround;
  medal: Medal | null;
  /** This player's place against the rivals, and how many cars that is. */
  place: number;
  of: number;
  table: { who: "you" | "partner" | "rival"; name: string; time: number }[];
  /** The best medal kept in this mode, this attempt included. */
  bestMedal: Medal | null;
  /** Co-op: the team's points per player, which its medal is from. */
  points?: number;
}

/** A race's card, before it starts. */
export interface RaceCard {
  number: string;
  ground: RaceGround;
  shape: RaceShape;
  laps: number;
  lengthM: number;
  /** The car it hands the player. */
  car: string;
  /** The rivals' finishing times, fastest first: what each medal takes. */
  rivals: readonly number[];
  /** Each mode's best medal and best time, or null if it hasn't been finished so. */
  records: Record<PlayMode, { medal: Medal | null; best: number } | null>;
}

/** How an attempt went, as the result card shows it. */
export interface MenuResult {
  passed: boolean;
  kind: ChallengeKind;
  /** The time in seconds or the speed in km/h, null for a Route lost before the finish. */
  result: number | null;
  target: number;
  /** The best kept for this challenge, this attempt included. */
  best: number | null;
  /** Co-op: this player's own time or speed and the partner's, either null for a Route lost before that one's finish. The result is their average. */
  team?: { own: number | null; partner: number | null; partnerName: string };
  race?: RaceResult;
}

/** What the dialog is: the game menu, or one of a challenge's choices. */
export type MenuKind = "menu" | "start" | "invite" | "race";

export interface GameMenu {
  /** The first is where the menu opens. */
  items: readonly MenuItemId[];
  /** What B, Menu and Esc press: Resume, or Leave on a result card. */
  back: MenuItemId;
  /** Whether the drive stops while the menu is open. When it doesn't, the clock and the cars run on and the car's controls let go. */
  pauses: boolean;
  /** The challenge the items are about: the one whose start the car is in, or the one being played. */
  challenge?: string;
  result?: MenuResult;
  kind?: MenuKind;
  /** The other player a co-op choice is about. */
  partner?: string;
  /** The tyres on the car, which the Tyres item shows and changes. */
  tyres?: Tyre;
  /** The race a card is for. */
  race?: RaceCard;
  /** Set when the items are about a race, being played or over: its ground. */
  ground?: RaceGround;
}

/**
 * The menu outside a challenge, on the car's tyres. Changing tyres is here until homes and car shops exist, and
 * never in a challenge, whose car is the challenge's.
 */
export const drivingMenu = (tyres: Tyre): GameMenu => ({ items: ["resume", "tyres", "sound"], back: "resume", pauses: true, tyres });
