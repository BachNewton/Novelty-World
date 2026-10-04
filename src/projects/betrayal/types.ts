// ---------------------------------------------------------------------------
// Content: the static catalogue, referenced from game state by id
// ---------------------------------------------------------------------------

export type SetId = "base" | "widows-walk";

/** Listed bottom to top. A game uses the floors its sets bring. */
export type FloorId = "basement" | "ground" | "upper" | "roof";

/** A tile's edges, named as the tile reads upright. */
export type Edge = "top" | "right" | "bottom" | "left";

/** Quarter turns clockwise from upright. */
export type Rotation = 0 | 1 | 2 | 3;

export type Trait = "speed" | "might" | "sanity" | "knowledge";

export type CardType = "event" | "item" | "omen";

export interface RoomTile {
  id: string;
  name: string;
  set: SetId;
  floors: FloorId[];
  /** Framed doors. */
  doors: Edge[];
  /** Open sides joining the rooms of a multi-room starting tile. */
  passages: Edge[];
  /** The front door: a door that is always locked. */
  frontDoor: Edge | null;
  windows: Edge[];
  outside: boolean;
  /** Card symbols, repeated where a tile prints one twice. */
  symbols: CardType[];
  /** The "?" mark: draw a card of any type. */
  anyCard: boolean;
  dumbwaiter: boolean;
  /** An asterisk after the name: rules in the rulebook's Special Rooms. */
  special: boolean;
  /** Rooms this one always connects to, whatever the layout (stairs). */
  links: string[];
  /** Where a starting tile is laid out. Starting tiles never enter the stack. */
  start: { floor: FloorId; x: number; y: number } | null;
}

export type CardColour =
  "white" | "red" | "yellow" | "green" | "blue" | "purple";

export interface Character {
  id: string;
  name: string;
  /** The character card this explorer is printed on, and the explorer on its other side. */
  card: CardColour;
  otherSide: string;
  sex: "male" | "female";
  age: number;
  birthday: { month: number; day: number };
  hobbies: string[];
  /** Each track's 8 values, lowest (next to the skull) first. */
  tracks: Record<Trait, number[]>;
  /** The starting clip position on each track, as an index into it. */
  start: Record<Trait, number>;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  set: SetId;
  label: "weapon" | "companion" | null;
  /** What its holder may do with it. A card that can't be traded can't be stolen either (p. 13). */
  transfer: { trade: boolean; drop: boolean; steal: boolean };
}

export type TokenShape =
  "large-circle" | "small-circle" | "square" | "pentagon" | "triangle";

export interface TokenKind {
  id: string;
  name: string;
  shape: TokenShape;
  set: SetId;
  /** The physical count. Supply is unlimited unless a haunt caps it at this. */
  count: number;
  numbered: boolean;
}

/** Who becomes the traitor, from the chart's traitor table. Trait picks break ties by the chart's footnote. */
export type TraitorRule =
  | { kind: "revealer" }
  | { kind: "left-of-revealer" }
  | {
      kind: "trait";
      extreme: "highest" | "lowest";
      trait: Trait;
      exceptRevealer: boolean;
    }
  | { kind: "age"; extreme: "oldest" | "youngest"; exceptRevealer: boolean }
  /** The named explorer if in play, otherwise the fallback. */
  | { kind: "named"; character: string; otherwise: TraitorRule }
  | { kind: "hidden" }
  /** No traitor, or none yet: the haunt says. */
  | { kind: "none" };

export interface HauntChart {
  /** Haunt number by room id, then omen card id. Rooms without an omen symbol have no row. */
  cells: Partial<Record<string, Partial<Record<string, number>>>>;
  traitors: Record<number, TraitorRule>;
}

export interface Catalog {
  rooms: Record<string, RoomTile>;
  characters: Record<string, Character>;
  cards: Record<string, Card>;
  tokens: Record<string, TokenKind>;
  chart: HauntChart;
}

// ---------------------------------------------------------------------------
// Rule references: every event names the rule that caused it
// ---------------------------------------------------------------------------

export type RuleRef =
  | { source: "rulebook"; page: number }
  | { source: "room"; room: string }
  | { source: "card"; card: string }
  | { source: "token"; token: string }
  | { source: "haunt"; haunt: number; section: string };

// ---------------------------------------------------------------------------
// Game state: one JSON value, ids and live values only
// ---------------------------------------------------------------------------

export interface PlacedTile {
  tile: string;
  floor: FloorId;
  x: number;
  y: number;
  rotation: Rotation;
}

export interface Board {
  /** In placement order. */
  tiles: PlacedTile[];
  /** Room stack, top first. */
  stack: string[];
  discards: string[];
}

/** A unit of the engine's unfinished work: a registered kind and its parameters. */
export type Step = {
  kind: string;
  params: Json;
};

export interface Decision {
  type: "decision";
  id: string;
  /** The seats that must answer. A shared decision is answered once by each, in any order. */
  seats: number[];
  kind: string;
  params: Json;
  rule: RuleRef;
  /** Answers already given to a shared decision, by seat. */
  answers: Record<number, Json>;
}

/** Waiting for people to read and confirm, as at the haunt reveal. It offers no choice. */
export interface ReadyWait {
  type: "ready";
  id: string;
  /** Seats still to confirm. */
  seats: number[];
  rule: RuleRef;
}

export interface Answered {
  decision: string;
  seat: number;
  choice: Json;
}

export interface GameEvent {
  /** The decision whose answer produced it and its index within that write. */
  id: string;
  type: string;
  rule: RuleRef;
  data: Json;
}

/** A player. Seats are in table order; turns pass to the left, which is the next seat. */
export interface Seat {
  name: string;
  controller: "human";
}

export interface Explorer {
  seat: number;
  character: string;
  room: string;
  /** Each trait's clip, as an index into the character's track. */
  clips: Record<Trait, number>;
  /** Spaces a card pushed a trait past its printed maximum. Losing the card takes these first (p. 11). */
  overTop: { card: string; trait: Trait; spaces: number }[];
  /** Items, omens, and events the explorer keeps, in the order gained. */
  cards: string[];
}

export interface Deck {
  /** Top first. */
  draw: string[];
  discard: string[];
}

/** A counter or flag kept on a card in play. */
export interface CardMark {
  value: number | boolean;
  /** "holder": it belongs to whoever holds the card (a worn Mask), so it is
   *  cleared when the card leaves them. "play": it belongs to the card itself
   *  (an open Music Box), so it stays while the card lies in a room or changes
   *  hands, and is cleared when the card goes back to a deck or discard pile. */
  lasts: "holder" | "play";
}

export interface RoomToken {
  token: string;
  room: string;
}

/** What has happened this turn, for the rules that limit actions per turn. */
export interface Turn {
  seat: number;
  /** Spaces of movement spent. */
  moved: number;
  /** Drawing a card ends movement for the rest of the turn (p. 6). */
  movementEnded: boolean;
  /** Rolls attempted: the same roll can't be attempted twice in a turn (p. 12). */
  rolls: string[];
  /** Cards used, traded, dropped or picked up: each card allows one such action a turn (p. 11). */
  handled: string[];
  /** Where this turn's drop and pick-up happened: each is one action a turn, in one room. */
  dropRoom: string | null;
  pickupRoom: string | null;
  traded: boolean;
  /** Something ended the turn early: the turn ends at the next chance to act. */
  over: boolean;
  /** Omens drawn this turn, and the room each was drawn in, for the haunt roll. */
  omens: { card: string; room: string }[];
}

export interface Haunt {
  number: number;
  revealer: number;
  omen: string;
  room: string;
}

export interface GameState {
  format: number;
  gameId: string;
  seed: string;
  sets: SetId[];
  status: "lobby" | "exploring" | "haunt" | "finished";
  seats: Seat[];
  /** One per seat, in seat order. */
  explorers: Explorer[];
  board: Board;
  decks: Record<CardType, Deck>;
  /** Item piles by room. */
  piles: Record<string, string[]>;
  tokens: RoomToken[];
  /** Ongoing event cards in play that no explorer holds. */
  ongoing: string[];
  /** Counters and flags on cards in play, by card id, then by name. */
  cardMarks: Partial<Record<string, Record<string, CardMark>>>;
  turn: Turn | null;
  /** Every omen card drawn this game, for the haunt roll (p. 15). */
  omensDrawn: number;
  haunt: Haunt | null;
  /** Counter for decision and wait ids, so every client computes the same ids. */
  nextId: number;
  /** Unfinished work, top of the stack last. */
  work: Step[];
  pending: Decision | ReadyWait | null;
  /** The most recent answers, newest last, for idempotent retries. */
  answered: Answered[];
  lastEvents: GameEvent[];
}

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

// ---------------------------------------------------------------------------
// Actions: absolute answers to a named decision
// ---------------------------------------------------------------------------

export type Action =
  | { kind: "choose"; decision: string; seat: number; choice: Json }
  | { kind: "ready"; wait: string; seat: number };
