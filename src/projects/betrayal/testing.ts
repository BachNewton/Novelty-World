import { newGame } from "./engine/exploration";
import { figureOf, placeOf, seatExplorer } from "./engine/figures";
import { apply, choices, type Choice, type Engine } from "./engine/step-loop";
import { ENGINE } from "./game";
import type { Scenario } from "./engine/scenario";
import { viewFor, type GameView } from "./engine/view";
import type {
  Decision,
  Edge,
  Figure,
  FigureTraits,
  GameState,
  Place,
} from "./types";

// Scenario helpers for tests: start a game from a scenario (stacked decks and
// room stack, placed explorers, a haunt already revealed), then play it by
// picking the offered choices.

export interface TestGame extends Scenario {
  seed?: string;
  /** Characters in seat order. */
  characters?: string[];
  engine?: Engine;
}

export const DEFAULT_CHARACTERS = [
  "zoe-ingstrom",
  "ox-bellows",
  "father-rhinehardt",
];

export function testGame(options: TestGame = {}): GameState {
  const { seed, characters = DEFAULT_CHARACTERS, engine = ENGINE, ...scenario } =
    options;
  return newGame(engine, {
    gameId: "test",
    seed: seed ?? "test-seed",
    sets: ["base"],
    seats: characters.map((character, i) => ({
      name: `Player ${i + 1}`,
      character,
    })),
    // Seat 0's birthday is today, so seat 0 goes first.
    today: engine.catalog.characters[characters[0]].birthday,
    scenario,
  });
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
  return result.state;
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
