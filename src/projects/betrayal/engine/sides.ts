import type { Figure, FigureId, GameState, Role, Side } from "../types";
import { allFigures, figureOf } from "./figures";
import { askStructured } from "./questions";
import type { Engine } from "./step-loop";

// Sides and roles belong to seats, and can change during a haunt; the
// traitor is a role a seat holds, not a seat number. Everything that derives
// from them (a figure's side, who is an opponent, who the heroes are) is
// asked or computed when needed, never stored, so a change of side takes
// effect everywhere at once.

/** The side a figure is on: its owning seat's, unless a rule says otherwise. */
export function sideOf(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): Side | null {
  return askStructured(engine, state, "side", { figure });
}

/** Whether `other` is `figure`'s opponent. */
export function isOpponent(
  engine: Engine,
  state: GameState,
  figure: FigureId,
  other: FigureId,
): boolean {
  return askStructured(engine, state, "isOpponent", { figure, other });
}

/** Whether a figure is still taking part: alive, and on the board. */
export function inPlay(figure: Figure): boolean {
  return figure.alive && figure.place !== null;
}

/** The heroes still in play: living explorers on the heroes' side. Before
 *  the haunt no one is on a side, so there are none. */
export function heroes(engine: Engine, state: GameState): Figure[] {
  return allFigures(state).filter(
    (f) =>
      f.kind === "explorer" &&
      inPlay(f) &&
      sideOf(engine, state, f.id) === "heroes",
  );
}

export function holdsRole(state: GameState, seat: number, role: Role): boolean {
  return state.seats[seat].roles.includes(role);
}

/** Whether a figure's seat is known by everyone to hold a role: "revealed
 *  as a traitor". A hidden traitor isn't, until they reveal themselves. */
export function revealedAs(
  state: GameState,
  figure: FigureId,
  role: Role,
): boolean {
  const owner = figureOf(state, figure).owner;
  return (
    owner !== null &&
    holdsRole(state, owner, role) &&
    state.seats[owner].knownBy === null
  );
}
