import type { GameEvent, GameView, Move, Options, Seat } from "../contract";

// The seam every bot plays through, the same shape the online play's bot seat
// uses: a bot is a pure function from what its seat may legally see to a move.
// It is given the seat's view, its options and the latest events as that seat may
// see them, never the game's state, so hidden information (other hands, the
// deck's order) is out of its reach by construction.

export interface BotInput {
  readonly seat: Seat;
  readonly view: GameView;
  readonly options: Options;
  /** The latest write's events, redacted for this seat. */
  readonly events: readonly GameEvent[];
  /** For a bot's own random choices: the same seed and position give the same
   *  move. Not the game's seed, and nothing the game's seed can be read from. */
  readonly seed: string;
}

export type Bot = (input: BotInput) => Move;
