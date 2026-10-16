import type {
  CardType,
  Edge,
  FigureId,
  FloorId,
  GameEvent,
  HauntReveal,
  Json,
  Role,
  RuleRef,
  Side,
  Trait,
  TurnKind,
} from "../types";
import type { Attacker } from "./combat";
import type { CardDestination, Die, GainedBy } from "./effects";
import type { Trade } from "./exploration";
import type { TaskResult } from "./haunt";
import type { RowSummary } from "./outcomes";
import type { DamageKind, Harm } from "./questions";
import type { RollSpec } from "./sources";

/** An event with nothing to say beyond its type and rule. */
type Nothing = Record<string, never>;

type Figure = { figure: FigureId };
type FigureIn = { figure: FigureId; room: string };
type TurnData = { seat: number; kind: TurnKind };

/** Every event the game emits, by type, with its data. The engine's
 *  `describe` and `viewFor` read every one of them, so the vocabulary is the
 *  engine's, whoever emits it: a card's or a haunt's rule names an event
 *  here, and words it its own way with its behaviour's `describe`. */
export type EventData = {
  // Setup and turns
  "game-started": { first: number };
  "explorer-set-up": Figure & { room: string | null; traits: Trait[] };
  "turn-started": TurnData & { figure: FigureId | null };
  "turn-ended": TurnData & { figure: FigureId | null; room: string | null };
  "turn-cut-short": TurnData;
  "turn-inserted": TurnData;
  "turn-missed": Figure;
  acting: FigureIn;
  recovered: Figure;
  ready: { seat: number };
  /** A decision with one legal choice, taken by the engine. */
  forced: {
    seat: number;
    kind: string;
    about: FigureId | null;
    choice: Json;
    label: string;
  };

  // Moving and the house
  entered: FigureIn & { moved: boolean; from?: string; discovered?: true };
  left: FigureIn & { moved: boolean };
  slowed: FigureIn & { extra: number };
  "not-moved": FigureIn;
  stayed: FigureIn;
  "movement-ended": Figure;
  crossed: FigureIn & { side: Edge };
  "side-chosen": FigureIn & { side: Edge };
  discovered: FigureIn;
  "room-not-found": Figure;
  "room-placed": { tile: string; floor: FloorId };
  "room-moved": { tile: string; from: FloorId; floor: FloorId };
  "room-stayed": { tile: string };
  "room-stack-shuffled": Nothing;
  "room-stack-seen": Figure & { tile: string };
  "room-bonus-spent": FigureIn;
  "rooms-short": Nothing;
  "token-placed": { token: string; room: string; wall: Edge[] | null };
  "token-removed": { token: string; room: string };
  "dog-ran": FigureIn;

  // Traits, damage and death
  "trait-changed": Figure & { trait: Trait; spaces: number };
  "trait-known": { definition: string; trait: Trait; value: number };
  "traits-fixed": Figure & { trait: Trait };
  damaged: Figure & {
    damage: DamageKind;
    split: Partial<Record<Trait, number>>;
  };
  "damage-prevented": Figure & { damage: DamageKind };
  "damage-converted": Figure & { from: DamageKind; to: DamageKind };
  "text-ignored": Figure & { what: string };
  stunned: Figure;
  died: Die & { room: string };

  // Rolls
  "roll-coming": Figure & {
    spec: RollSpec;
    pool: number;
    bonus: number;
    rows: RowSummary[] | null;
  };
  rolled: Figure & {
    spec: RollSpec;
    dice: number[];
    named: number | null;
    bonus: number;
    result: number;
  };
  "table-row": Figure & { rows: RowSummary[]; index: number };

  // Cards
  "card-drawn": Figure & { card: string; type: CardType };
  "card-gained": Figure & { card: string; by: GainedBy };
  "card-lost": Figure & { card: string; destination: CardDestination };
  "card-used": Figure & { card: string };
  "card-marked": { card: string; name: string; value: number | boolean };
  "ongoing-ended": { card: string };
  "deck-empty": { type: CardType };
  "deck-stacked": Figure & { type: CardType; card: string };
  "stack-reordered": Figure & { stack: "room" | CardType };
  "search-found-nothing": Figure;
  traded: Trade;
  "trade-declined": Trade;

  // Combat
  attacked: { attacker: Attacker; defender: FigureId; roller: FigureId };
  "attack-outcome": {
    attacker: FigureId | null;
    defender: FigureId;
    attackResult: number;
    defenceResult: number;
    loser: "attacker" | "defender" | null;
    harm: Harm | null;
    near: boolean;
  };

  // The haunt
  "haunt-held-off": Figure & { result: number; omens: number };
  "haunt-revealed": Figure & {
    result: number;
    omens: number;
    haunt: number;
    charted: number;
  };
  "haunt-started": HauntReveal;
  "haunt-chosen": { haunt: number; instead: number };
  "haunt-unbuilt": { haunt: number; stops: boolean };
  "haunt-setup": { side: "traitor" | "heroes" };
  "traitor-tie": { tied: number[]; seat: number };
  "sides-dealt": Nothing;
  "side-set": {
    seat: number;
    side: Side;
    roles: Role[];
    secret: boolean;
  };
  "status-added": Figure & { status: string };
  "status-removed": Figure & { status: string };
  /** Who knows it: some seats, or, with none named, everyone. */
  "secret-set": { secret: string; knownBy: number[] | null };
  "secret-revealed": { secret: string };
  "counter-changed": { counter: string; value: number };
  spawned: {
    definition: string;
    figures: FigureId[];
    room: string;
    short: number;
  };
  "replacement-declined": { definition: string };
  escaped: FigureIn & {
    marker: string | null;
    counter: string | null;
    value: number | null;
    of: string | null;
  };
  "task-result": Omit<TaskResult, "rule">;
  "game-over": { winners: number[]; side: Side | null; tied: boolean };
};

export type EventType = keyof EventData;

/** The event, if it is of the type, or null. */
export function ofType<K extends EventType>(
  event: GameEvent,
  type: K,
): EventOf<K> | null {
  // Its type is the one asked for, so its data is that type's: TypeScript
  // can't narrow an event by a type it is given generically.
  return event.type === type ? (event as EventOf<K>) : null;
}

/** An event of one type, or, unnamed, of any: its data's type follows its
 *  type, so checking the type gives the data's shape. */
export type EventOf<K extends EventType = EventType> = {
  [T in K]: {
    /** The decision whose answer produced it and its index within that write. */
    id: string;
    type: T;
    rule: RuleRef;
    data: EventData[T];
  };
}[K];
