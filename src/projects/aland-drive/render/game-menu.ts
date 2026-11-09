import type { PlayMode } from "../challenge/passes";
import type { Medal } from "../challenge/standings";
import type { ChallengeKind, RaceGround, RaceShape } from "../challenge/types";
import type { Units } from "../units";
import type { Assists } from "../sim/car";
import type { Tyre } from "../sim/surfaces";
import type { CarPaint } from "../art/cars/paints";
import type { CarFacts, Field } from "../garage/car-facts";
import { isCarId, type CarId } from "../sim/cars";

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
export type MenuItemId = "resume" | `tyres-${Tyre}` | keyof Assists | `units-${Units}` | "cars" | "settings" | CarItem | PaintItem | "back" | "start-solo" | "start-coop" | "join-coop" | "decline-coop" | "cancel" | "retry" | "leave";

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

/** A car on the Cars page, by its id. */
export type CarItem = `car-${CarId}`;

/** A paint on the Cars page, by its index in the driven car's list. */
export type PaintItem = `paint-${number}`;

/** What the dialog is: the game menu, its Settings or Cars page, or one of a challenge's choices. */
export type MenuKind = "menu" | "settings" | "cars" | "start" | "invite" | "race";

/** A car as the Cars page shows it: its spec sheet, its paints and the one it's in. */
export interface CarCard {
  facts: CarFacts;
  paints: readonly CarPaint[];
  chosen: number;
}

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
  /** The player whose co-op invite this is. */
  partner?: string;
  /** How many other players a co-op invite would ask: set when one can be sent. */
  players?: number;
  /** The tyres on the car, which the tyre choices mark. */
  tyres?: Tyre;
  /** The driver's aids, which their items show and turn on and off. */
  assists?: Assists;
  /** The race a card is for. */
  race?: RaceCard;
  /** Set when the items are about a race, being played or over: its ground. */
  ground?: RaceGround;
  /** The Cars page: every car, the one being driven, whose paints its paint items choose by index, and each figure's reach across the field. */
  garage?: { driven: CarId; cars: readonly CarCard[]; field: Field };
}

/**
 * The menu outside a challenge leads to the Cars and Settings pages. Changing tyres is in Settings until homes and car
 * shops exist, and never in a challenge, whose car is the challenge's; the aids are the player's, so they go with
 * them into one, and its Settings page holds them.
 */
const TYRE_ITEMS: Record<`tyres-${Tyre}`, Tyre> = { "tyres-summer": "summer", "tyres-winter": "winter", "tyres-studded": "studded" };

/** The tyres a tyre choice fits. */
export const tyreOfItem = (id: `tyres-${Tyre}`): Tyre => TYRE_ITEMS[id];

const UNITS_ITEMS: Record<`units-${Units}`, Units> = { "units-metric": "metric", "units-imperial": "imperial" };

/** The units a units choice sets. */
export const unitsOfItem = (id: `units-${Units}`): Units => UNITS_ITEMS[id];

export const drivingMenu: GameMenu = { items: ["resume", "cars", "settings"], back: "resume", pauses: true };

/**
 * The Settings page off the game menu, in tabs: Gameplay, Controls, Audio and Graphics. Its items are Gameplay's, the
 * settings the game holds; the page keeps the others itself (the sound, the render scale) and which tab is open. Back
 * returns to the menu. In a challenge it holds everything but the tyres, the challenge's car's, and pauses as the
 * challenge's menu does.
 */
export const settingsMenu = ({ assists, tyres, pauses }: { assists: Assists; tyres?: Tyre; pauses: boolean }): GameMenu => ({
  kind: "settings",
  items: [...(tyres === undefined ? [] : (["tyres-summer", "tyres-winter", "tyres-studded"] as const)), "abs", "traction", "stability", "units-metric", "units-imperial", "back"],
  back: "back",
  pauses,
  tyres,
  assists,
});

export const isCarItem = (id: MenuItemId): id is CarItem => id.startsWith("car-") && isCarId(id.slice("car-".length));

/** The car a car item chooses. */
export const carOfItem = (id: CarItem): CarId => id.slice("car-".length) as CarId;

export const isPaintItem = (id: MenuItemId): id is PaintItem => /^paint-\d+$/.test(id);

/** The paint a paint item chooses, by its index in the car's list. */
export const paintOfItem = (id: PaintItem): number => Number(id.slice("paint-".length));

/**
 * The Cars page off the game menu: every car, by class and tier, to drive at once from where the car is, and the driven
 * car's paints, each drawn on the car at once, so the player sees it before going back. Like the tyres, never in a
 * challenge, whose car is the challenge's.
 */
export const carsMenu = (driven: CarId, cars: readonly CarCard[], field: Field): GameMenu => {
  const own = cars.find(({ facts }) => facts.id === driven);
  if (!own) throw new Error(`no card for the driven car, ${driven}`);
  return {
    kind: "cars",
    items: [...cars.map(({ facts }): CarItem => `car-${facts.id}`), ...own.paints.map((_, index): PaintItem => `paint-${index}`), "back"],
    back: "back",
    pauses: true,
    garage: { driven, cars, field },
  };
};
