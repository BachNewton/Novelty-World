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
  TurnKind,
  TurnRef,
} from "../types";
import { allFigures, explorerOf, figureName, TRAITS } from "./figures";
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

/** A rule reference as a viewer sees it. A ruling from one side's half of
 *  a haunt is that side's to read: for any other viewer its id is left out,
 *  and `hiddenRuling` says that a ruling it may not read applied. Where the
 *  haunt section a rule comes from would give away a side kept from the
 *  viewer (a status the traitor's setup put on a hidden traitor), the
 *  section is left out too, and `hiddenSection` says so. */
export type RuleView =
  | (Exclude<RuleRef, { source: "haunt" }> & { hiddenRuling?: true })
  | {
      source: "haunt";
      haunt: number;
      section?: string;
      ruling?: string;
      hiddenRuling?: true;
      hiddenSection?: true;
    };

export type EventView = Omit<GameEvent, "rule"> & { rule: RuleView };

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
  /** Each status, with its rule and its own data. The data is left out
   *  (null) unless this viewer knows every seat's side, as it may name a
   *  seat (the one a controlled figure answers to). */
  statuses: (Omit<Status, "rule"> & { rule: RuleView })[];
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
  | { type: "ready"; id: string; seats: number[]; rule: RuleView }
  | {
      type: "decision";
      id: string;
      /** The seats it is put to, but for those this viewer may not see
       *  deciding it: a seat whose side is kept from the viewer, asked about
       *  a figure whose owner is kept from it too, or asked for its side
       *  ("the traitor chooses"). */
      seats: number[];
      /** Some addressees are left out of `seats`. */
      unnamed: boolean;
      /** Addressees who have answered a shared decision; what they answered
       *  stays hidden until it closes. */
      answered: number[];
      kind: string;
      rule: RuleView;
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

/** A turn as a viewer sees it: a monster turn's seat is left out (null) for
 *  a viewer who doesn't know the seat's side, since only the traitor's side
 *  has monster turns, and so is a turn it follows. */
export type TurnRefView = Omit<TurnRef, "seat"> & { seat: number | null };

export type TurnView = Omit<Turn, "seat" | "follows"> & {
  seat: number | null;
  follows: TurnRefView | null;
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
  /** Every part of the turn record is public, but a hidden side's seat. */
  turn: TurnView | null;
  insertedTurns: (Omit<InsertedTurn, "seat" | "rule"> & {
    seat: number | null;
    rule: RuleView;
  })[];
  omensDrawn: number;
  haunt: HauntView | null;
  deaths: (Omit<Death, "cause"> & { cause: RuleView })[];
  traitsKnown: KnownTrait[];
  pending: PendingView | null;
  /** The latest write's events, as this viewer may see them. */
  events: EventView[];
  result: (Omit<GameResult, "rule"> & { rule: RuleView }) | null;
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

/** Whether the side of the seat owning a figure is kept from a viewer. */
function sideHiddenOf(
  state: GameState,
  viewer: number | null,
  figure: FigureId,
): boolean {
  const { owner } = state.figures[figure];
  return owner !== null && !knowsSide(state, viewer, owner);
}

/** Whether a figure's owner is kept from a viewer: an explorer's seat is
 *  public, but owning anything else (a monster) would give away a side kept
 *  from the viewer. */
function ownerHidden(
  state: GameState,
  viewer: number | null,
  figure: FigureId,
): boolean {
  return (
    state.figures[figure].kind !== "explorer" &&
    sideHiddenOf(state, viewer, figure)
  );
}

/** Whether a viewer may see that a decision about a figure, or about none,
 *  is put to a seat. A seat whose side the viewer doesn't know may be seen
 *  deciding only about a figure whose owner the viewer may see: a decision
 *  about a monster it owns, or one put to it as a player ("the traitor
 *  chooses"), gives the side away. */
function seesAddressee(
  state: GameState,
  viewer: number | null,
  seat: number,
  about: FigureId | null,
): boolean {
  return (
    seat === viewer ||
    knowsSide(state, viewer, seat) ||
    (about !== null && !ownerHidden(state, viewer, about))
  );
}

/** Whether a viewer may see whose turn this is: a monster turn is only the
 *  traitor's side's, so its seat is kept from a viewer who doesn't know the
 *  seat's side. */
function seesTurnSeat(
  state: GameState,
  viewer: number | null,
  turn: { seat: number; kind?: TurnKind },
): boolean {
  return (
    turn.kind !== "monster" ||
    turn.seat === viewer ||
    knowsSide(state, viewer, turn.seat)
  );
}

function turnRefView(
  state: GameState,
  viewer: number | null,
  ref: TurnRef,
): TurnRefView {
  return { ...ref, seat: seesTurnSeat(state, viewer, ref) ? ref.seat : null };
}

/** A rule reference as this viewer may see it, its haunt section left out
 *  where `hideSection` says it would give a side away. */
function ruleView(
  engine: Engine,
  state: GameState,
  viewer: number | null,
  rule: RuleRef,
  hideSection = false,
): RuleView {
  if (rule.source !== "haunt") return { ...rule };
  let seen: RuleView = { ...rule };
  if (rule.ruling !== undefined) {
    const half = engine.haunts[rule.haunt]?.rulingHalves[rule.ruling];
    if (half === undefined)
      throw new Error(
        `Haunt ${rule.haunt} has no ruling ${rule.ruling} in either half`,
      );
    if (ownSide(state, viewer) !== half) {
      const { ruling: _hidden, ...rest } = rule;
      seen = { ...rest, hiddenRuling: true };
    }
  }
  if (!hideSection) return seen;
  const { section: _kept, ...rest } = seen;
  return { ...rest, hiddenSection: true };
}

/** A haunt rule reference with a ruling, found by its shape: event data and
 *  decision params are JSON shaped by each event type and decision kind,
 *  and some carry the rule behind them (a death's cause, a status's rule). */
function isHauntRuling(value: { [key: string]: Json }): boolean {
  return (
    value.source === "haunt" &&
    typeof value.haunt === "number" &&
    typeof value.section === "string" &&
    typeof value.ruling === "string"
  );
}

/** A copy of JSON with every rule reference in it as this viewer may see it. */
function jsonView(
  engine: Engine,
  state: GameState,
  viewer: number | null,
  value: Json,
): Json {
  if (Array.isArray(value))
    return value.map((item) => jsonView(engine, state, viewer, item));
  if (typeof value !== "object" || value === null) return value;
  if (isHauntRuling(value))
    return ruleView(
      engine,
      state,
      viewer,
      value as unknown as RuleRef,
    ) as unknown as Json;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      jsonView(engine, state, viewer, item),
    ]),
  );
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
  const allSidesKnown = knowsAllSides(state, viewer);
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
    const sideHidden = sideHiddenOf(state, viewer, figure.id);
    views[figure.id] = {
      id: figure.id,
      kind: figure.kind,
      definition: figure.definition,
      name: figureName(engine.catalog, state, figure.id),
      owner: ownerHidden(state, viewer, figure.id) ? null : figure.owner,
      place: figure.place === null ? null : { ...figure.place },
      traits,
      cards: [...figure.cards],
      statuses: figure.statuses.map((status) => ({
        id: status.id,
        rule: ruleView(engine, state, viewer, status.rule, sideHidden),
        params: allSidesKnown
          ? jsonView(engine, state, viewer, status.params)
          : null,
      })),
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
      rule: ruleView(engine, state, viewer, pending.rule),
    };
  const addressed = viewer !== null && pending.seats.includes(viewer);
  const seats = pending.seats.filter((seat) =>
    seesAddressee(state, viewer, seat, pending.about),
  );
  return {
    type: "decision",
    id: pending.id,
    seats,
    unnamed: seats.length < pending.seats.length,
    answered: seats.filter((seat) => seat in pending.answers),
    kind: pending.kind,
    rule: ruleView(engine, state, viewer, pending.rule),
    detail: addressed
      ? {
          params: jsonView(engine, state, viewer, pending.params),
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
  // are its addressee's alone; whom it was put to, as for any decision.
  forced: (data, viewer, state) => {
    if (data.seat === viewer) return data;
    const about = typeof data.about === "string" ? data.about : null;
    return seesAddressee(state, viewer, data.seat as number, about)
      ? { seat: data.seat, kind: data.kind }
      : { kind: data.kind };
  },
  // Whose monster turn it is.
  "turn-started": (data, viewer, state) => turnSeat(data, viewer, state),
  "turn-ended": (data, viewer, state) => turnSeat(data, viewer, state),
  "turn-cut-short": (data, viewer, state) => turnSeat(data, viewer, state),
  "turn-inserted": (data, viewer, state) => turnSeat(data, viewer, state),
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

/** A turn event's data, without its seat where the viewer may not see
 *  whose turn it is. */
function turnSeat(
  data: { [key: string]: Json },
  viewer: number | null,
  state: GameState,
): { [key: string]: Json } {
  const turn = { seat: data.seat as number, kind: data.kind as TurnKind | undefined };
  if (seesTurnSeat(state, viewer, turn)) return data;
  const { seat: _hidden, ...rest } = data;
  return rest;
}

/** Events whose rule's haunt section would give away the side of the
 *  figure they are about: a status put on it, or taken off. */
const SECTION_KEPT: Partial<Record<string, true>> = {
  "status-added": true,
  "status-removed": true,
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
): EventView {
  const redact = REDACTIONS[event.type];
  const { data } = event;
  let seen = data;
  if (redact) {
    if (typeof data !== "object" || data === null || Array.isArray(data))
      throw new Error(`The ${event.type} event has no data to redact`);
    seen = redact(data, viewer, state, engine);
  }
  const hideSection =
    SECTION_KEPT[event.type] === true &&
    sideHiddenOf(state, viewer, (data as { figure: FigureId }).figure);
  return {
    id: event.id,
    type: event.type,
    rule: ruleView(engine, state, viewer, event.rule, hideSection),
    data: jsonView(engine, state, viewer, seen),
  };
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
    turn:
      state.turn === null
        ? null
        : {
            ...structuredClone(state.turn),
            seat: seesTurnSeat(state, viewer, state.turn) ? state.turn.seat : null,
            follows:
              state.turn.follows === null
                ? null
                : turnRefView(state, viewer, state.turn.follows),
          },
    insertedTurns: state.insertedTurns.map((turn) => ({
      ...turnRefView(state, viewer, turn),
      rule: ruleView(engine, state, viewer, turn.rule),
    })),
    omensDrawn: state.omensDrawn,
    haunt: hauntView(engine, state, viewer),
    deaths: state.memory.deaths.map((death) => ({
      ...structuredClone(death),
      cause: ruleView(engine, state, viewer, death.cause),
    })),
    traitsKnown: structuredClone(state.memory.traitsKnown),
    pending: pendingView(engine, state, viewer),
    events: state.lastEvents.map((e) => eventView(engine, state, viewer, e)),
    result:
      state.result === null
        ? null
        : {
            winners: [...state.result.winners],
            rule: ruleView(engine, state, viewer, state.result.rule),
          },
  };
}

/** The seat's own explorer in a view, where it has one. */
export function viewExplorer(view: GameView, seat: number): FigureView | null {
  const id = explorerOf(view, seat);
  return id === null ? null : view.figures[id];
}
