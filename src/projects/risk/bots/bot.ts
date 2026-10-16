import type { GameEvent, GameView, Move, Options, Seat } from "../contract";

// The seam every bot plays through, the same shape the online play's bot seat
// uses: a bot is a pure function from what its seat may legally know to a move.
// It is given the seat's view, its options and the game's public history as that
// seat may see it, never the game's state, so hidden information (other hands,
// the deck's order) is out of its reach by construction. What a bot remembers
// across turns it reads back from the history, so a bot keeps no state of its own.

export interface BotInput {
  readonly seat: Seat;
  readonly view: GameView;
  readonly options: Options;
  /** The latest write's events, redacted for this seat: the tail of `history`. */
  readonly events: readonly GameEvent[];
  /** Every event since the game began, oldest first, redacted for this seat: all the
   *  game's public past, and the cards this seat drew. */
  readonly history: readonly GameEvent[];
  /** Per seat, whether a person plays it (the rest are bots). Public: every table shows it. */
  readonly humans: readonly boolean[];
  /** For a bot's own random choices: the same seed and position give the same
   *  move. Not the game's seed, and nothing the game's seed can be read from. */
  readonly seed: string;
}

export type Bot = (input: BotInput) => Move;
