import type {
  GameEvent,
  GameState,
  Json,
  RuleRef,
  Step,
  Trait,
} from "../types";
import type { StepHandler } from "./step-loop";
import type { Modifier } from "./questions";

// A rule source is anything in play whose text changes the game: a held or
// ongoing card, a room on the board, a token in a room. Its behaviour is code
// in the content catalogue; everything it does to the game goes through steps,
// so the game stays serializable.

/** Where a live source is, and who holds it. */
export interface Source {
  layer: Layer;
  kind: "room" | "card" | "token";
  id: string;
  rule: RuleRef;
  /** The seat holding a card, if any. */
  holder: number | null;
  /** The room a room source is, or a token sits in. */
  room: string | null;
}

/** The rulebook's order for conflicts: a card beats the rulebook (p. 12), a haunt beats everything (p. 17). */
export type Layer = "rulebook" | "room" | "card" | "haunt";
export const LAYERS: readonly Layer[] = ["rulebook", "room", "card", "haunt"];

/** What a roll is, so effects can tell rolls apart. */
export type RollSpec =
  | { kind: "trait"; trait: Trait }
  | { kind: "dice"; count: number }
  | { kind: "haunt" };

export interface RollOption {
  timing: "before" | "after";
  /** Whether this option can act on this roll. */
  applies: (state: GameState, seat: number, roll: RollContext) => boolean;
  effect:
    | { kind: "add"; amount: number }
    /** Name the result instead of rolling. */
    | { kind: "name"; min: number; max: number }
    /** Reroll some dice: at most this many, or any number. */
    | { kind: "reroll"; max: number | null };
}

export interface RollContext {
  spec: RollSpec;
  /** The card or room whose rule asked for the roll. */
  rule: RuleRef;
}

export interface SourceAction {
  label: string;
  /** Whether the seat may take it now. Being offered is not enough: the action must also apply. */
  available: (state: GameState, seat: number, source: Source) => boolean;
  steps: (state: GameState, seat: number, source: Source) => Step[];
}

export interface Reaction {
  event: string;
  when?: (state: GameState, event: GameEvent, source: Source) => boolean;
  steps: (state: GameState, event: GameEvent, source: Source) => Step[];
}

export interface Behaviour {
  /** A card's effect when drawn: an event's whole text, or an omen's immediate effect. */
  onDraw?: (state: GameState, seat: number) => Step[];
  /** When an explorer gets an item or omen, however: drawing, picking up, trading or stealing. */
  onGain?: (state: GameState, seat: number) => Step[];
  /** When its holder loses it, however. */
  onLose?: (state: GameState, seat: number) => Step[];
  /** Actions it offers on its holder's turn, or, for a room or token, to an explorer there. Using a card's action uses the card (p. 11). */
  actions?: Record<string, SourceAction>;
  reactions?: Reaction[];
  modifiers?: Modifier[];
  rollOptions?: RollOption[];
  /** Steps only this source uses, registered under the source's id. */
  steps?: Record<string, StepHandler>;
}

/** Part of the content's behaviours, as one file contributes them. */
export interface BehaviourGroup {
  cards?: Record<string, Behaviour>;
  rooms?: Record<string, Behaviour>;
  tokens?: Record<string, Behaviour>;
}

export interface Behaviours {
  cards: Partial<Record<string, Behaviour>>;
  rooms: Partial<Record<string, Behaviour>>;
  tokens: Partial<Record<string, Behaviour>>;
}

/** Every source in play that has a behaviour, in a stable order. */
export function liveSources(
  behaviours: Behaviours,
  state: GameState,
): { source: Source; behaviour: Behaviour }[] {
  const result: { source: Source; behaviour: Behaviour }[] = [];
  for (const tile of state.board.tiles) {
    const behaviour = behaviours.rooms[tile.tile];
    if (behaviour) {
      const source: Source = {
        layer: "room",
        kind: "room",
        id: tile.tile,
        rule: { source: "room", room: tile.tile },
        holder: null,
        room: tile.tile,
      };
      result.push({ source, behaviour });
    }
  }
  for (const explorer of state.explorers) {
    for (const card of explorer.cards) {
      const behaviour = behaviours.cards[card];
      if (behaviour)
        result.push({ source: cardSource(card, explorer.seat), behaviour });
    }
  }
  for (const card of state.ongoing) {
    const behaviour = behaviours.cards[card];
    if (behaviour) result.push({ source: cardSource(card, null), behaviour });
  }
  for (const token of state.tokens) {
    const behaviour = behaviours.tokens[token.token];
    if (behaviour) {
      const source: Source = {
        layer: "card",
        kind: "token",
        id: token.token,
        rule: { source: "token", token: token.token },
        holder: null,
        room: token.room,
      };
      result.push({ source, behaviour });
    }
  }
  return result;
}

function cardSource(card: string, holder: number | null): Source {
  return {
    layer: "card",
    kind: "card",
    id: card,
    rule: { source: "card", card },
    holder,
    room: null,
  };
}

/** An event's data, typed by the event's contract. Events are stored as JSON, so the type is the emitter's promise. */
export function eventData<T extends Json>(event: GameEvent): T {
  return event.data as T;
}

/** The registered name of a source's own step. */
export function localStep(sourceId: string, name: string): string {
  return `${sourceId}:${name}`;
}

/** A step that runs one of a source's own steps. */
export function local(
  sourceId: string,
  name: string,
  params: Json = null,
): Step {
  return { kind: localStep(sourceId, name), params };
}
