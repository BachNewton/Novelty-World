import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Move, Seat } from "../contract";
import type { Bot, BotInput } from "../bots/bot";
import { playGame, type GameRecord } from "./runner";

// A game played once and kept as its moves, so a test can stand at any of its decisions without
// asking a bot for every decision before it. The runner builds each seat's input exactly as it
// would for the bots that made the moves, so a bot asked at a replayed decision gets the input it
// would have had in the original game.

/** A game kept as its moves, every seat's, in the order they were made, and who made each. */
export interface Recording {
  seats: Seat[];
  moves: Move[];
}

export function recordMoves(seed: string, bots: readonly Bot[], maxTurns: number): Recording {
  const recording: Recording = { seats: [], moves: [] };
  playGame({
    seed,
    bots,
    maxTurns,
    observe: {
      decided: (input, move) => {
        recording.seats.push(input.seat);
        recording.moves.push(move);
      },
    },
  });
  return recording;
}

/** Plays a recorded game again from its moves, calling `at` at each decision with the input the
 *  seat to move had and the move that was made. A recording that doesn't fit the game (a move the
 *  engine refuses, too few moves or too many) fails loudly. */
export function replayMoves(
  seed: string,
  players: number,
  maxTurns: number,
  { seats, moves }: Recording,
  at?: (input: BotInput, move: Move, decision: number) => void,
): GameRecord {
  let next = 0;
  const replay: Bot = (input) => {
    const decision = next++;
    if (decision >= moves.length) throw new Error(`the recording ends at decision ${decision.toString()}, and the game goes on`);
    if (input.seat !== seats[decision]) throw new Error(`seat ${input.seat.toString()} is to move at decision ${decision.toString()}, and the recording has seat ${seats[decision].toString()}`);
    const move = moves[decision];
    at?.(input, move, decision);
    return move;
  };
  const record = playGame({ seed, bots: Array.from({ length: players }, () => replay), maxTurns });
  if (next !== moves.length) {
    throw new Error(`the game ended at decision ${next.toString()}, and the recording has ${moves.length.toString()}`);
  }
  return record;
}

/** The recording kept at `path`, or, when there is none yet, the game played once by `bots` and
 *  kept there, so a test's first run writes what its later runs replay. */
export function keptRecording(path: string, seed: string, bots: () => readonly Bot[], maxTurns: number): Recording {
  /* eslint-disable security/detect-non-literal-fs-filename -- a test's own fixture, a fixed path in this repo */
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as Recording;
  const recording = recordMoves(seed, bots(), maxTurns);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(recording));
  /* eslint-enable security/detect-non-literal-fs-filename -- the fixture's reads and writes are all above */
  return recording;
}
