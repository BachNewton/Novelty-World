import { newGame } from "./engine/exploration";
import { figureOf, placeOf, seatExplorer } from "./engine/figures";
import { step } from "./engine/effects";
import { apply, choices, start, type Choice, type Engine } from "./engine/step-loop";
import { ENGINE } from "./game";
import type { Scenario } from "./engine/scenario";
import { viewFor, type GameView } from "./engine/view";
import { checkWrite } from "./test/invariants";
import type {
  CardType,
  Decision,
  Edge,
  Figure,
  FigureTraits,
  GameState,
  Place,
  PlacedTile,
  Step,
} from "./types";

// Scenario helpers for tests: start a game from a scenario (stacked decks and
// room stack, placed explorers, a haunt already revealed), then play it by
// picking the offered choices. Every write made through them is checked
// against the invariants every game must hold (test/invariants.ts), so each
// test that plays through them guards those too.

export interface TestGame extends Scenario {
  seed?: string;
  /** Characters in seat order. */
  characters?: string[];
  engine?: Engine;
  /** The haunt chosen at setup. */
  chosenHaunt?: number;
}

export const DEFAULT_CHARACTERS = [
  "zoe-ingstrom",
  "ox-bellows",
  "father-rhinehardt",
];

export function testGame(options: TestGame = {}): GameState {
  const { seed, characters = DEFAULT_CHARACTERS, engine = ENGINE, chosenHaunt, ...scenario } =
    options;
  const state = newGame(engine, {
    gameId: "test",
    seed: seed ?? "test-seed",
    sets: ["base"],
    seats: characters.map((character) => ({ character })),
    // Seat 0's birthday is today, so seat 0 goes first.
    today: engine.catalog.characters[characters[0]].birthday,
    scenario,
    ...(chosenHaunt === undefined ? {} : { chosenHaunt }),
  });
  checkWrite(engine, null, state);
  return state;
}

export function pendingDecision(state: GameState): Decision {
  if (state.pending?.type !== "decision")
    throw new Error("No decision is pending");
  return state.pending;
}

/** What a spectator sees: public information only, as the log describes
 *  events for anyone. */
export function spectator(state: GameState, engine: Engine = ENGINE): GameView {
  return viewFor(engine, state, null);
}

/** The seat the pending decision is waiting on. */
export function waitingOn(state: GameState): number {
  const decision = pendingDecision(state);
  const seat = decision.seats.find((s) => !(s in decision.answers));
  if (seat === undefined) throw new Error("Every addressee has answered");
  return seat;
}

export function offered(state: GameState, engine: Engine = ENGINE): Choice[] {
  return choices(engine, state, waitingOn(state));
}

/** Answers the pending decision with the offered choice whose label contains the text. */
export function choose(
  state: GameState,
  label: string,
  engine: Engine = ENGINE,
): GameState {
  const options = offered(state, engine);
  const match = options.find((c) => c.label.includes(label));
  if (!match)
    throw new Error(
      `No choice like "${label}". Offered: ${options.map((c) => c.label).join(" | ")}`,
    );
  const result = apply(engine, state, {
    kind: "choose",
    decision: pendingDecision(state).id,
    seat: waitingOn(state),
    choice: match.choice,
  });
  if (!result.ok)
    throw new Error(
      `"${match.label}" was offered but rejected: ${result.reason}`,
    );
  checkWrite(engine, state, result.state);
  return result.state;
}

/** Runs work in the middle of the turn, as a test's setup does to have a
 *  card, room or attack act out of the blue: the pending decision makes way
 *  for it, and the turn's choices come back once it is done, as they do
 *  after any action. */
export function interject(engine: Engine, state: GameState, work: Step[]): GameState {
  const seat = state.turn?.seat;
  const after = start(engine, { ...state, pending: null }, [
    ...work,
    ...(seat === undefined ? [] : [step("turn-menu", { seat })]),
  ]);
  checkWrite(engine, state, after);
  return after;
}

/** A seat confirms the pending ready wait. */
export function ready(
  state: GameState,
  seat: number,
  engine: Engine = ENGINE,
): GameState {
  if (state.pending?.type !== "ready") throw new Error("No ready wait is pending");
  const result = apply(engine, state, {
    kind: "ready",
    wait: state.pending.id,
    seat,
  });
  if (!result.ok) throw new Error(`Seat ${seat} couldn't confirm: ${result.reason}`);
  checkWrite(engine, state, result.state);
  return result.state;
}

/** Puts a game into the haunt, as a test's setup: `traitor` holds the
 *  traitor role on the traitor's side and every other seat is a hero, all of
 *  it public. Whatever is pending stays, so the test can play on. */
export function inHaunt(state: GameState, traitor: number): GameState {
  state.status = "haunt";
  state.seats = state.seats.map((seat, i) =>
    i === traitor
      ? { ...seat, side: "traitor", roles: ["traitor"], knownBy: null }
      : { ...seat, side: "heroes", roles: [], knownBy: null },
  );
  return state;
}

/** Event types emitted by the latest write. */
export function eventTypes(state: GameState): string[] {
  return state.lastEvents.map((e) => e.type);
}

/** An explorer: a figure whose traits are clips on tracks. */
export type ExplorerFigure = Figure & {
  traits: Extract<FigureTraits, { kind: "track" }>;
};

const onTracks = (figure: Figure): figure is ExplorerFigure =>
  figure.traits.kind === "track";

/** The seat's explorer. */
export function explorer(state: GameState, seat: number): ExplorerFigure {
  const figure = figureOf(state, seatExplorer(state, seat));
  if (!onTracks(figure)) throw new Error(`${figure.id} has no clips`);
  return figure;
}

/** Where the seat's explorer is. */
export function at(state: GameState, seat: number): Place {
  return placeOf(state, seatExplorer(state, seat));
}

/** Sets where the seat's explorer is, as a test's setup: nothing follows
 *  them there. */
export function put(
  state: GameState,
  seat: number,
  room: string,
  side: Edge | null = null,
): void {
  explorer(state, seat).place = { room, side };
}

/** Takes a card out of wherever it is: a deck, a figure, a pile, play, a
 *  hand. */
function takeCard(state: GameState, card: string): void {
  for (const type of ["omen", "item", "event"] as CardType[]) {
    const deck = state.decks[type];
    deck.draw = deck.draw.filter((c) => c !== card);
    deck.discard = deck.discard.filter((c) => c !== card);
  }
  for (const figure of Object.values(state.figures))
    figure.cards = figure.cards.filter((c) => c !== card);
  for (const room of Object.keys(state.piles))
    state.piles[room] = state.piles[room].filter((c) => c !== card);
  state.ongoing = state.ongoing.filter((c) => c !== card);
  state.aside = state.aside.filter((a) => a.card !== card);
  state.inTransit = state.inTransit.filter((c) => c !== card);
}

/** Gives the seat's explorer cards, as a test's setup, taking each from
 *  wherever it was, so every card stays in one place. */
export function give(state: GameState, seat: number, ...cards: string[]): void {
  for (const card of cards) takeCard(state, card);
  explorer(state, seat).cards.push(...cards);
}

/** Puts cards on a room's pile, as a test's setup, taking each from wherever
 *  it was, so every card stays in one place. */
export function pile(state: GameState, room: string, ...cards: string[]): void {
  for (const card of cards) takeCard(state, card);
  state.piles[room] = [...(state.piles[room] ?? []), ...cards];
}

/** Puts cards in hand, taking each from wherever it was, as a test's setup
 *  does for cards that the work it runs has just drawn: they are on their
 *  way to where that work puts them. */
export function drawn(state: GameState, ...cards: string[]): void {
  for (const card of cards) takeCard(state, card);
  state.inTransit.push(...cards);
}

/** Puts cards on their discard piles, as a test's setup does for a card
 *  whose effect it runs out of the blue: the card has been played. */
export function discard(state: GameState, ...cards: string[]): void {
  for (const card of cards) {
    takeCard(state, card);
    state.decks[ENGINE.catalog.cards[card].type].discard.push(card);
  }
}

/** Puts room tiles in the house, as a test's setup, taking each from the
 *  stack or the discards, so every tile stays in one place. */
export function placeTiles(state: GameState, ...tiles: PlacedTile[]): void {
  const ids = tiles.map((t) => t.tile);
  state.board.stack = state.board.stack.filter((t) => !ids.includes(t));
  state.board.discards = state.board.discards.filter((t) => !ids.includes(t));
  state.board.tiles.push(...tiles);
}
