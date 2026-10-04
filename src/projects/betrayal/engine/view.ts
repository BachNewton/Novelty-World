import type {
  AsideCard,
  CardMark,
  CardType,
  Death,
  FigureId,
  FigureKind,
  GameEvent,
  GameResult,
  GameState,
  HauntHalf,
  InsertedTurn,
  Json,
  KnownTrait,
  Place,
  PlacedTile,
  Role,
  RoomToken,
  RuleRef,
  Seat,
  SetId,
  Side,
  Status,
  Trait,
  Turn,
} from "../types";
import { allFigures, TRAITS } from "./figures";
import { activeHaunt } from "./haunt";
import { askStructured, hasTrait, traitValue } from "./questions";
import { sideOf } from "./sides";
import { choices, type Choice, type Engine } from "./step-loop";

// What one seat may see of a game: the UI renders it, and bots and AI
// players get nothing else. The full state is public under the good-faith
// model, but a view may go to a reader that isn't trusted (an AI agent a
// player connects from outside), so this is the boundary itself: what a
// view leaves out is absent from it, never present and merely unrendered.
// It is a type of its own, built field by field, so a field added to the
// state stays out of every view until it is added here on purpose.

/** A seat as a viewer sees it. */
export interface SeatView {
  name: string;
  controller: Seat["controller"];
  /** None before the haunt, and none while it is kept from this viewer. */
  side: Side | null;
  roles: Role[];
  /** Its side and roles are kept from some seats. */
  secret: boolean;
  /** They are kept from this viewer, so they are left out. */
  hidden: boolean;
}

export interface FigureView {
  id: FigureId;
  kind: FigureKind;
  definition: string;
  /** "Nightmare 2": its definition's name, and its number where it has one. */
  name: string;
  /** The seat whose piece it is. Left out (null) for a figure other than an
   *  explorer whose seat's side is kept from this viewer: owning a monster
   *  would give that side away. */
  owner: number | null;
  place: Place | null;
  /** Each trait the figure has (that a monster has a trait is public), with
   *  its value, or null while this viewer doesn't know it: a monster's
   *  traits are its own side's to know until a roll makes them known to
   *  everyone. */
  traits: Partial<Record<Trait, number | null>>;
  cards: string[];
  statuses: Status[];
  stunned: boolean;
  alive: boolean;
}

/** A haunt secret: that it exists is public, its value only for the seats
 *  that know it. */
export type SecretView = {
  id: string;
  name: string;
  /** Who knows it: null once everyone does. Left out when listing them
   *  would give away a side kept from this viewer. */
  knownBy?: number[] | null;
} & ({ known: true; value: Json } | { known: false });

export interface HauntView {
  number: number;
  /** Null for a haunt that isn't built yet. */
  name: string | null;
  revealer: number;
  omen: string;
  room: string;
  secrets: SecretView[];
  counters: Record<string, number>;
  /** The halves of the haunt's text this viewer may read: its own side's. */
  halves: { traitor?: HauntHalf; heroes?: HauntHalf };
}

/** The pending decision: in full only for the seats it is put to. */
export type PendingView =
  | { type: "ready"; id: string; seats: number[]; rule: RuleRef }
  | {
      type: "decision";
      id: string;
      seats: number[];
      /** Addressees who have answered a shared decision; what they answered
       *  stays hidden until it closes. */
      answered: number[];
      kind: string;
      rule: RuleRef;
      /** The question and this viewer's part in it, when it is put to this
       *  viewer; null for everyone else. */
      detail: {
        params: Json;
        /** This viewer's legal choices, while it has yet to answer. */
        choices: Choice[];
        /** This viewer's own answer to a shared decision, once given. */
        answer: Json | null;
      } | null;
    };

export interface GameView {
  gameId: string;
  /** Whose view it is: a seat, or null for a spectator. */
  viewer: number | null;
  sets: SetId[];
  status: GameState["status"];
  seats: SeatView[];
  figures: Record<FigureId, FigureView>;
  board: {
    tiles: PlacedTile[];
    /** The room stack's order is hidden from everyone: only its size shows. */
    stack: number;
    discards: string[];
  };
  /** Each deck's size, and its discard pile, face up. */
  decks: Record<CardType, { draw: number; discard: string[] }>;
  piles: Record<string, string[]>;
  tokens: RoomToken[];
  ongoing: string[];
  aside: AsideCard[];
  cardMarks: Partial<Record<string, Record<string, CardMark>>>;
  /** Every part of the turn record is public. */
  turn: Turn | null;
  insertedTurns: InsertedTurn[];
  omensDrawn: number;
  haunt: HauntView | null;
  deaths: Death[];
  traitsKnown: KnownTrait[];
  pending: PendingView | null;
  /** The latest write's events, as this viewer may see them. */
  events: GameEvent[];
  result: GameResult | null;
}

/** Whether a viewer knows a seat's side and roles. */
function knowsSide(state: GameState, viewer: number | null, seat: number): boolean {
  const { knownBy } = state.seats[seat];
  return knownBy === null || (viewer !== null && knownBy.includes(viewer));
}

/** Whether a viewer knows every seat's side, so a list of seats (who knows
 *  a secret) can't give one away. */
function knowsAllSides(state: GameState, viewer: number | null): boolean {
  return state.seats.every((_seat, i) => knowsSide(state, viewer, i));
}

/** The side a viewer knows itself to be on. */
function ownSide(state: GameState, viewer: number | null): Side | null {
  return viewer !== null && knowsSide(state, viewer, viewer)
    ? state.seats[viewer].side
    : null;
}

function seatView(state: GameState, viewer: number | null, seat: number): SeatView {
  const { name, controller, side, roles, knownBy } = state.seats[seat];
  const hidden = !knowsSide(state, viewer, seat);
  return {
    name,
    controller,
    side: hidden ? null : side,
    roles: hidden ? [] : [...roles],
    secret: knownBy !== null,
    hidden,
  };
}

function figureViews(
  engine: Engine,
  state: GameState,
  viewer: number | null,
): Record<FigureId, FigureView> {
  const side = ownSide(state, viewer);
  const views: Record<FigureId, FigureView> = {};
  for (const figure of allFigures(state)) {
    const definition = engine.catalog.figures[figure.definition];
    const ownSideKnows =
      side !== null && sideOf(engine, state, figure.id) === side;
    const traits: Partial<Record<Trait, number | null>> = {};
    for (const trait of TRAITS) {
      if (!hasTrait(engine, state, figure.id, trait)) continue;
      const known =
        definition.traits.kind === "tracks" ||
        ownSideKnows ||
        state.memory.traitsKnown.some(
          (k) => k.definition === figure.definition && k.trait === trait,
        );
      traits[trait] = known ? traitValue(engine, state, figure.id, trait) : null;
    }
    const ownerHidden =
      figure.kind !== "explorer" &&
      figure.owner !== null &&
      !knowsSide(state, viewer, figure.owner);
    views[figure.id] = {
      id: figure.id,
      kind: figure.kind,
      definition: figure.definition,
      name: figure.id.startsWith(`${figure.definition}-`)
        ? `${definition.name} ${figure.id.slice(figure.definition.length + 1)}`
        : definition.name,
      owner: ownerHidden ? null : figure.owner,
      place: figure.place === null ? null : { ...figure.place },
      traits,
      cards: [...figure.cards],
      statuses: structuredClone(figure.statuses),
      stunned: figure.stunned,
      alive: figure.alive,
    };
  }
  return views;
}

function hauntView(
  engine: Engine,
  state: GameState,
  viewer: number | null,
): HauntView | null {
  const haunt = state.haunt;
  if (haunt === null) return null;
  const rules = activeHaunt(engine, state);
  const listKnowers = knowsAllSides(state, viewer);
  const secrets = haunt.secrets.map((secret): SecretView => {
    const name = rules?.secrets[secret.id]?.name;
    if (name === undefined)
      throw new Error(`The haunt has no secrets entry ${secret.id}`);
    const knows =
      secret.knownBy === null ||
      (viewer !== null && secret.knownBy.includes(viewer));
    return {
      id: secret.id,
      name,
      ...(listKnowers
        ? { knownBy: secret.knownBy === null ? null : [...secret.knownBy] }
        : {}),
      ...(knows
        ? { known: true as const, value: structuredClone(secret.value) }
        : { known: false as const }),
    };
  });
  const side = ownSide(state, viewer);
  const halves: HauntView["halves"] = {};
  if (rules && side === "traitor") halves.traitor = { ...rules.texts.traitor };
  if (rules && side === "heroes") halves.heroes = { ...rules.texts.heroes };
  return {
    number: haunt.number,
    name: rules?.name ?? null,
    revealer: haunt.revealer,
    omen: haunt.omen,
    room: haunt.room,
    secrets,
    counters: { ...haunt.counters },
    halves,
  };
}

function pendingView(
  engine: Engine,
  state: GameState,
  viewer: number | null,
): PendingView | null {
  const pending = state.pending;
  if (pending === null) return null;
  if (pending.type === "ready")
    return {
      type: "ready",
      id: pending.id,
      seats: [...pending.seats],
      rule: structuredClone(pending.rule),
    };
  const addressed = viewer !== null && pending.seats.includes(viewer);
  const answered = pending.seats.filter((seat) => seat in pending.answers);
  return {
    type: "decision",
    id: pending.id,
    seats: [...pending.seats],
    answered,
    kind: pending.kind,
    rule: structuredClone(pending.rule),
    detail: addressed
      ? {
          params: structuredClone(pending.params),
          choices: choices(engine, state, viewer),
          answer:
            viewer in pending.answers
              ? structuredClone(pending.answers[viewer])
              : null,
        }
      : null,
  };
}

/** Events that carry something only some seats may see, and what the rest
 *  see of them. Every other event is public. */
const REDACTIONS: Partial<
  Record<
    string,
    (
      data: { [key: string]: Json },
      viewer: number | null,
      state: GameState,
      engine: Engine,
    ) => { [key: string]: Json }
  >
> = {
  // A side a scenario sets in secret.
  "side-set": (data, viewer, state) =>
    knowsSide(state, viewer, data.seat as number)
      ? data
      : { seat: data.seat, secret: true },
  // Who knows a secret, where it would give away a hidden side.
  "secret-set": (data, viewer, state) => {
    if (knowsAllSides(state, viewer)) return data;
    const { knownBy: _hidden, ...rest } = data;
    return rest;
  },
  // A forced step is a decision with one choice, and a decision's choices
  // are its addressee's alone.
  forced: (data, viewer) =>
    data.seat === viewer ? data : { seat: data.seat, kind: data.kind },
  // The card put on top of a deck, and the top room tile, are seen only by
  // the seat that looked.
  "deck-stacked": (data, viewer, state, engine) =>
    looker(engine, state, data.figure as FigureId) === viewer
      ? data
      : { figure: data.figure, type: data.type },
  "room-stack-seen": (data, viewer, state, engine) =>
    looker(engine, state, data.figure as FigureId) === viewer
      ? data
      : { figure: data.figure },
};

/** The seat that saw what a figure looked at: the one controlling it. */
function looker(engine: Engine, state: GameState, figure: FigureId): number | null {
  return askStructured(engine, state, "controller", { figure });
}

function eventView(
  engine: Engine,
  state: GameState,
  viewer: number | null,
  event: GameEvent,
): GameEvent {
  const redact = REDACTIONS[event.type];
  const copy = structuredClone(event);
  if (!redact) return copy;
  const data = copy.data;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error(`The ${event.type} event has no data to redact`);
  return { ...copy, data: redact(data, viewer, state, engine) };
}

/** What a seat may see of the game, or a spectator (null): public
 *  information only. */
export function viewFor(
  engine: Engine,
  state: GameState,
  viewer: number | null,
): GameView {
  if (viewer !== null && (viewer < 0 || viewer >= state.seats.length))
    throw new Error(`There is no seat ${viewer}`);
  const deck = (type: CardType) => ({
    draw: state.decks[type].draw.length,
    discard: [...state.decks[type].discard],
  });
  return {
    gameId: state.gameId,
    viewer,
    sets: [...state.sets],
    status: state.status,
    seats: state.seats.map((_seat, i) => seatView(state, viewer, i)),
    figures: figureViews(engine, state, viewer),
    board: {
      tiles: structuredClone(state.board.tiles),
      stack: state.board.stack.length,
      discards: [...state.board.discards],
    },
    decks: { omen: deck("omen"), item: deck("item"), event: deck("event") },
    piles: structuredClone(state.piles),
    tokens: structuredClone(state.tokens),
    ongoing: [...state.ongoing],
    aside: structuredClone(state.aside),
    cardMarks: structuredClone(state.cardMarks),
    turn: structuredClone(state.turn),
    insertedTurns: structuredClone(state.insertedTurns),
    omensDrawn: state.omensDrawn,
    haunt: hauntView(engine, state, viewer),
    deaths: structuredClone(state.memory.deaths),
    traitsKnown: structuredClone(state.memory.traitsKnown),
    pending: pendingView(engine, state, viewer),
    events: state.lastEvents.map((e) => eventView(engine, state, viewer, e)),
    result: structuredClone(state.result),
  };
}

/** The seat's own explorer in a view, where it has one. */
export function viewExplorer(view: GameView, seat: number): FigureView | null {
  return (
    Object.values(view.figures).find(
      (f) => f.kind === "explorer" && f.owner === seat,
    ) ?? null
  );
}
