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

/** One side's half of a haunt's rules, as content/haunts/ writes it. */
export interface HauntHalf {
  /** The book it stands for: "Traitor's Tome" or "Secrets of Survival". */
  title: string;
  /** The half's markdown, notes and rulings included. */
  text: string;
}

/** A haunt's text, read out of its content/haunts/ file. Each side may read
 *  only its own half. */
export interface HauntTexts {
  name: string;
  traitor: HauntHalf;
  heroes: HauntHalf;
}

/** Where a figure's traits come from: clips on printed tracks (an
 *  explorer's character card), or fixed values (a monster's stats). A trait
 *  a figure lacks is left out. */
export type TraitSource =
  | {
      kind: "tracks";
      /** Each track's values, lowest (next to the skull) first. */
      tracks: Record<Trait, number[]>;
      /** The starting clip position on each track, as an index into it. */
      start: Record<Trait, number>;
    }
  | { kind: "fixed"; values: Partial<Record<Trait, number>> };

/** What a figure is: every figure's definition is looked up the same way,
 *  whatever kind of figure it is. Explorers come from the characters; a
 *  haunt's figures register their own. */
export interface FigureDefinition {
  id: string;
  name: string;
  kind: FigureKind;
  traits: TraitSource;
  /** The token that stands for this figure in a room, where a rule puts one
   *  down (an explorer's, in its character card's colour). */
  token: string | null;
  /** Whether it may discover new rooms: explorers may, monsters can't
   *  (p. 19). The canDiscover question's base answer. */
  explores: boolean;
  /** Whether it may hold cards (items, omens, kept events): explorers may,
   *  monsters can't unless a haunt says so (p. 19). The canCarry question's
   *  base answer. */
  carries: boolean;
}

export interface Catalog {
  rooms: Record<string, RoomTile>;
  characters: Record<string, Character>;
  /** Every figure's definition, by id. */
  figures: Record<string, FigureDefinition>;
  cards: Record<string, Card>;
  tokens: Record<string, TokenKind>;
  chart: HauntChart;
}

// ---------------------------------------------------------------------------
// Rule references: every event names the rule that caused it
// ---------------------------------------------------------------------------

export type RuleRef = (
  | { source: "rulebook"; page: number }
  | { source: "room"; room: string }
  | { source: "card"; card: string }
  | { source: "token"; token: string }
  | { source: "haunt"; haunt: number; section: string }
  /** A playtesting or test scenario set this up, not a rule. */
  | { source: "scenario" }
) & {
  /** The ruling in content/ behind this event, by the id its `> Note [id]:`
   *  carries, when one ruling of the source applies rather than its text. */
  ruling?: string;
};

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

/** Which side a seat plays for, once the haunt gives it one. A neutral seat
 *  is no one's opponent. */
export type Side = "heroes" | "traitor" | "neutral";

/** What a seat is, beyond its side: the traitor is a role a seat holds, not
 *  a seat number. */
export type Role = "traitor";

/** A player. Seats are in table order; turns pass to the left, which is the next seat. */
export interface Seat {
  name: string;
  controller: "human";
  /** None before the haunt. */
  side: Side | null;
  roles: Role[];
  /** Who knows this seat's side and roles: null when everyone does;
   *  otherwise the seats that do, which may leave out the seat itself. */
  knownBy: number[] | null;
}

/** Where a figure is: a room, and in a barrier room the side it is on, named
 *  by the printed edge of that side's door. Null outside barrier rooms. */
export type Place = {
  room: string;
  side: Edge | null;
};

/** A piece on the board, and what rules act on: "you" in card and room text
 *  means whoever is acting or affected, explorer or monster. An explorer's id
 *  is its character's id. */
export type FigureId = string;

export type FigureKind = "explorer" | "monster" | "ally" | "object";

/** A figure's live traits, in the form its definition's trait source gives:
 *  clip positions on its tracks, or nothing live for fixed values, which stay
 *  in the catalogue. */
export type FigureTraits =
  | {
      kind: "track";
      /** Each trait's clip, as an index into the definition's track. */
      clips: Record<Trait, number>;
      /** Spaces a card pushed a trait past its printed maximum. Losing the card takes these first (p. 11). */
      overTop: { card: string; trait: Trait; spaces: number }[];
    }
  | { kind: "fixed" };

/** A named condition a rule puts on a figure (asleep, controlled). It is a
 *  rule source in its own right, in the layer of the rule that applied it. */
export type Status = {
  id: string;
  /** The rule that put it on the figure. */
  rule: RuleRef;
  /** What the status needs to know, such as the seat a controlled figure
   *  answers to. Its own behaviour reads it. */
  params: Json;
};

export interface Figure {
  id: FigureId;
  kind: FigureKind;
  /** Its figure definition in the catalogue: an explorer's is its character. */
  definition: string;
  /** The seat whose piece it is, if any. Who controls it is a question, not
   *  this field: its base answer is the owner. */
  owner: number | null;
  /** Null while it is off the board. */
  place: Place | null;
  traits: FigureTraits;
  /** Items, omens, and events the figure keeps, in the order gained. */
  cards: string[];
  /** Statuses rule sources have put on it. */
  statuses: Status[];
  stunned: boolean;
  alive: boolean;
}

export interface Deck {
  /** Top first. */
  draw: string[];
  discard: string[];
}

/** A counter or flag kept on a card in play. */
export interface CardMark {
  value: number | boolean | string;
  /** "holder": it belongs to whoever holds the card (a worn Mask), so it is
   *  cleared when the card leaves them. "play": it belongs to the card itself
   *  (an open Music Box), so it stays while the card lies in a room or changes
   *  hands, and is cleared when the card goes back to a deck or discard pile. */
  lasts: "holder" | "play";
}

export interface RoomToken {
  token: string;
  room: string;
  /** A token on one of the room's walls rather than in it (the Wall Switch):
   *  the printed edge of the room's tile it sits on, or the two edges of the
   *  corner it sits on. It moves and turns with the tile. */
  wall?: Edge[];
  /** In a barrier room, the side it lies on (see Place). */
  side?: Edge;
  /** Where the other end of a linked pair is (Secret Passage, Secret Stairs). */
  link?: Place;
  /** A token that goes wherever this figure goes (the Dog). */
  holder?: FigureId;
}

/** A seat's explorer turn (every turn before the haunt, and a hero's
 *  after it), the traitor's own turn, or the monster turn the traitor's seat
 *  takes after it (p. 16). */
export type TurnKind = "explorer" | "traitor" | "monster";

/** Which turn: a seat's, of a kind. */
export type TurnRef = {
  seat: number;
  kind: TurnKind;
};

/** A turn a rule puts into the order, taken at the next turn boundary. */
export type InsertedTurn = TurnRef & {
  rule: RuleRef;
};

/** What has happened this turn, for the rules that limit actions per turn.
 *  The turn is a seat's; movement and the attack are counted per figure. */
export interface Turn {
  seat: number;
  kind: TurnKind;
  /** For an inserted turn, the turn in the order it came after, from which
   *  the order carries on. Null for a turn taken in order. */
  follows: TurnRef | null;
  /** The figures that act on this turn, fixed as it starts: the seat's
   *  explorer on its explorer or traitor turn; on its monster turn, its
   *  monsters that aren't stunned. A figure that comes into play during the
   *  turn waits for the next (rules p. 18's project ruling). */
  actors: FigureId[];
  /** The actor taking its actions now. On a monster turn each monster takes
   *  all of its actions before the next goes (p. 18), so this is null
   *  between them. */
  acting: FigureId | null;
  /** Actors that have finished acting. */
  done: FigureId[];
  /** Spaces rolled for movement at the start of a monster turn, by figure
   *  definition: one roll for each type of monster (p. 18). */
  rolled: Partial<Record<string, number>>;
  /** Monsters stunned when this monster turn began: they miss it, and
   *  recover at its end (p. 18). */
  recovering: FigureId[];
  /** Things used once over a seat's traitor turn and the monster turn after
   *  it (the Mystic Elevator, p. 8), carried from the one to the other. */
  setUses: string[];
  /** Spaces of movement each figure has spent. */
  moved: Partial<Record<FigureId, number>>;
  /** Figures whose movement has ended: drawing a card ends it for the rest of the turn (p. 6). */
  movementEnded: FigureId[];
  /** Rolls attempted, by the figure that attempted them: a figure can't
   *  attempt the same roll twice in a turn (p. 12). */
  rolls: Partial<Record<FigureId, string[]>>;
  /** Cards used, traded, dropped or picked up: each card allows one such action a turn (p. 11). */
  handled: string[];
  /** Where this turn's drop and pick-up happened: each is one action a turn, in one room. */
  dropRoom: string | null;
  pickupRoom: string | null;
  traded: boolean;
  /** Figures whose one attack this turn, after the haunt, has been made
   *  (p. 13), or that something used instead (the Dynamite). */
  attacked: FigureId[];
  /** Something ended the turn early: the turn ends at the next chance to act. */
  over: boolean;
  /** Omens drawn this turn, who drew each and the room they drew it in: the
   *  drawer makes its haunt roll at the end of the turn. */
  omens: { card: string; figure: FigureId; room: string }[];
}

/** A figure's death, as later rules read it ("all heroes dead", kills). */
export interface Death {
  figure: FigureId;
  /** The trait that reached the skull, or null for a death no trait caused. */
  trait: Trait | null;
  /** The rule whose effect killed it: an attack's, a card's, a room's. */
  cause: RuleRef;
  /** The figure that dealt the killing damage, if one did. */
  killer: FigureId | null;
  room: string;
}

/** What later rules read about the game so far. */
/** A monster trait every seat knows: its type has rolled it (rules p. 18's
 *  official ruling). Whether a type has a trait at all is public. Its value
 *  is the traitValue question's, asked when it is needed. */
export interface KnownTrait {
  definition: string;
  trait: Trait;
}

export interface RuleMemory {
  deaths: Death[];
  /** Monster traits made known by a roll, one entry per type and trait. */
  traitsKnown: KnownTrait[];
  /** How many of each haunt figure have come into play, by definition, so
   *  every new one gets a number never used before in the game. */
  spawned: Partial<Record<string, number>>;
  /** Conditions that have fired, by source and condition id: a once-only
   *  one stays for good, any other until it stops holding. */
  conditions: string[];
}

/** A card out of play but not in a deck: a dead explorer's companion left
 *  in the room where they died, for the next explorer to come in (p. 19), or,
 *  with no room, set aside out of the game. */
export interface AsideCard {
  card: string;
  room: string | null;
}

/** Which haunt the chart gave, and how it was revealed. */
export type HauntReveal = {
  number: number;
  revealer: number;
  omen: string;
  room: string;
};

/** A value in the haunt only some seats know, such as the traitor's written
 *  number. Decisions and events name it by id, never by value, so a seat's
 *  view has one place to hide it. */
export interface Secret {
  id: string;
  value: Json;
  /** The seats that know it, or null once everyone does. */
  knownBy: number[] | null;
}

export type Haunt = HauntReveal & {
  secrets: Secret[];
  /** The haunt's tracks and counted tokens, by id. */
  counters: Record<string, number>;
};

/** How the game ended: the seats that won (a whole side, as a rule), and
 *  the rule whose goal was met. */
export interface GameResult {
  winners: number[];
  rule: RuleRef;
}

export interface GameState {
  format: number;
  gameId: string;
  seed: string;
  sets: SetId[];
  status: "lobby" | "exploring" | "haunt" | "finished";
  seats: Seat[];
  /** Every piece on the board (or off it), by id. */
  figures: Record<FigureId, Figure>;
  board: Board;
  decks: Record<CardType, Deck>;
  /** Item piles by room. */
  piles: Record<string, string[]>;
  tokens: RoomToken[];
  /** Ongoing event cards in play that no explorer holds. */
  ongoing: string[];
  aside: AsideCard[];
  /** Counters and flags on cards in play, by card id, then by name. */
  cardMarks: Partial<Record<string, Record<string, CardMark>>>;
  turn: Turn | null;
  /** Turns rules have put into the order, taken first, in order, at the
   *  next turn boundaries. */
  insertedTurns: InsertedTurn[];
  /** Every omen card drawn this game, for the haunt roll (p. 15). */
  omensDrawn: number;
  haunt: Haunt | null;
  memory: RuleMemory;
  /** Counter for decision and wait ids, so every client computes the same ids. */
  nextId: number;
  /** Unfinished work, top of the stack last. */
  work: Step[];
  pending: Decision | ReadyWait | null;
  /** The most recent answers, newest last, for idempotent retries. */
  answered: Answered[];
  lastEvents: GameEvent[];
  /** Set once a side's goal is met and the game is over. */
  result: GameResult | null;
}

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

// ---------------------------------------------------------------------------
// Actions: absolute answers to a named decision
// ---------------------------------------------------------------------------

export type Action =
  | { kind: "choose"; decision: string; seat: number; choice: Json }
  | { kind: "ready"; wait: string; seat: number };
