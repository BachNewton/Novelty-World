import type { GameState, TurnRef } from "../types";
import { explorerOf } from "./figures";

// Turn order is never saved as a list. At every turn boundary it is worked
// out again from the current turn, the seats' sides and the turnOrder
// question, after any turns a rule has inserted, so a seat that changes side
// or dies changes the order from the next boundary on with no extra code.

/** The seat a round starts from: the first seat before the haunt; after it,
 *  the seat on the traitor's left (p. 16), or on the revealer's left when no
 *  traitor is known to everyone (a hidden traitor, or none: p. 17). */
function roundStart(state: GameState): number {
  const count = state.seats.length;
  const haunt = state.haunt;
  if (state.status === "exploring" || haunt === null) return 0;
  const traitor = state.seats
    .map((_seat, i) => (haunt.revealer + i) % count)
    .find((i) => revealedTraitorSide(state, i) && state.seats[i].roles.includes("traitor"));
  return ((traitor ?? haunt.revealer) + 1) % count;
}

/** A seat everyone knows is on the traitor's side: it takes the traitor's
 *  turns rather than a hero turn. */
function revealedTraitorSide(state: GameState, seat: number): boolean {
  const { side, knownBy } = state.seats[seat];
  return side === "traitor" && knownBy === null;
}

/** Seats in table order, starting with the round's first and passing left. */
function fromStart(state: GameState): number[] {
  const start = roundStart(state);
  const count = state.seats.length;
  return state.seats.map((_seat, i) => (start + i) % count);
}

/** One round of turns as the rulebook gives it. Before the haunt, every
 *  seat's turn in table order. After it, a hero turn for each seat whose
 *  explorer is alive, passing left from the traitor's left, then each
 *  traitor-side seat's traitor turn and its monster turn (p. 16). A dead
 *  hero's seat takes no turns; the traitor's seat always takes both of its
 *  own, even while its explorer is asleep or dead (p. 17). */
export function baseRound(state: GameState): TurnRef[] {
  const seats = fromStart(state);
  if (state.status === "exploring")
    return seats.map((seat) => ({ seat, kind: "explorer" }));
  const heroTurns = seats
    .filter((seat) => !revealedTraitorSide(state, seat))
    .filter((seat) => {
      const explorer = explorerOf(state, seat);
      return explorer !== null && state.figures[explorer].alive;
    })
    .map((seat): TurnRef => ({ seat, kind: "explorer" }));
  const traitorTurns = seats
    .filter((seat) => revealedTraitorSide(state, seat))
    .flatMap((seat): TurnRef[] => [
      { seat, kind: "traitor" },
      { seat, kind: "monster" },
    ]);
  return [...heroTurns, ...traitorTurns];
}

/** Where a turn falls in the rulebook's round, for placing a turn the
 *  current round no longer holds (its seat changed side, or died). */
function baseRank(state: GameState, turn: TurnRef): number {
  const count = state.seats.length;
  const distance = (turn.seat - roundStart(state) + count) % count;
  switch (turn.kind) {
    case "explorer":
      return distance;
    case "traitor":
      return count + 2 * distance;
    case "monster":
      return count + 2 * distance + 1;
  }
}

const same = (a: TurnRef, b: TurnRef) => a.seat === b.seat && a.kind === b.kind;

/** The turn after `current` in a round: the next one listed, or, when the
 *  round no longer holds `current`, the first that comes after where it
 *  would have been. With no current turn (the haunt's first), the round's
 *  first. */
export function turnAfter(
  state: GameState,
  round: TurnRef[],
  current: TurnRef | null,
): TurnRef {
  if (round.length === 0) throw new Error("No seat has a turn to take");
  if (current === null) return round[0];
  const index = round.findIndex((turn) => same(turn, current));
  if (index >= 0) return round[(index + 1) % round.length];
  const rank = baseRank(state, current);
  return round.find((turn) => baseRank(state, turn) > rank) ?? round[0];
}
