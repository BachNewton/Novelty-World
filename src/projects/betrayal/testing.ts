import { newGame } from "./engine/exploration";
import { apply, choices, type Choice, type Engine } from "./engine/step-loop";
import { ENGINE } from "./game";
import type { Scenario } from "./engine/scenario";
import type { Decision, GameState } from "./types";

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

/** Event types emitted by the latest write. */
export function eventTypes(state: GameState): string[] {
  return state.lastEvents.map((e) => e.type);
}
