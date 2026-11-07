import type { PlayMode } from "../challenge/passes";
import type { Medal } from "../challenge/standings";
import type { ChallengeKind, RaceGround, RaceShape } from "../challenge/types";
import type { Units } from "../units";
import type { Assists } from "../sim/car";
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
export type MenuItemId = "resume" | `tyres-${Tyre}` | keyof Assists | `units-${Units}` | "sound" | "graphics" | "back" | "start-solo" | "start-coop" | "join-coop" | "decline-coop" | "cancel" | "retry" | "leave";

/** How a race finished: the place and its medal. */
export interface RaceResult {
  ground: RaceGround;
  place: number;
  medal: Medal | null;
  /** The best medal kept in this mode, this attempt included. */
  bestMedal: Medal | null;
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
  /** Each mode's best medal and best finishing place, or null if it hasn't been finished so. */
  records: Record<PlayMode, { medal: Medal | null; place: number } | null>;
}

/** How an attempt went, as the result card shows it. */
export interface MenuResult {
  passed: boolean;
  kind: ChallengeKind;
  /** The time in seconds or the speed in km/h, null for a Route lost before the finish. */
  result: number | null;
  target: number | null;
  /** The best kept for this challenge, this attempt included. */
  best: number | null;
  /** Co-op: this player's own time or speed and the partner's, either null for a Route lost before that one's finish. The result is their average. */
  team?: { own: number | null; partner: number | null; partnerName: string };
  race?: RaceResult;
}

/** What the dialog is: the game menu, its Graphics page, or one of a challenge's choices. */
export type MenuKind = "menu" | "graphics" | "start" | "invite" | "race";

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
  /** The tyres on the car, which the tyre choices mark. */
  tyres?: Tyre;
  /** The driver's aids, which their items show and turn on and off. */
  assists?: Assists;
  /** The race a card is for. */
  race?: RaceCard;
  /** Set when the items are about a race, being played or over: its ground. */
  ground?: RaceGround;
}

/**
 * The menu outside a challenge, on the car's tyres and the driver's aids. Changing tyres is here until homes and car
 * shops exist, and never in a challenge, whose car is the challenge's; the aids are the player's, so they go with
 * them into one.
 */
const TYRE_ITEMS: Record<`tyres-${Tyre}`, Tyre> = { "tyres-summer": "summer", "tyres-winter": "winter", "tyres-studded": "studded" };

/** The tyres a tyre choice fits. */
export const tyreOfItem = (id: `tyres-${Tyre}`): Tyre => TYRE_ITEMS[id];

const UNITS_ITEMS: Record<`units-${Units}`, Units> = { "units-metric": "metric", "units-imperial": "imperial" };

/** The units a units choice sets. */
export const unitsOfItem = (id: `units-${Units}`): Units => UNITS_ITEMS[id];

export const drivingMenu = (tyres: Tyre, assists: Assists): GameMenu => ({ items: ["resume", "tyres-summer", "tyres-winter", "tyres-studded", "abs", "traction", "stability", "units-metric", "units-imperial", "sound", "graphics"], back: "resume", pauses: true, tyres, assists });

/** The graphics settings, a page of their own off the game menu. The page draws and keeps the settings; Back returns to the menu. */
export const graphicsMenu: GameMenu = { kind: "graphics", items: ["back"], back: "back", pauses: true };
