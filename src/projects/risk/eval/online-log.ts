import { readFileSync } from "node:fs";
import type { Move, Seat } from "../contract";
import type { Bot } from "../bots/bot";
import type { GameRow, LoggedMove } from "../online/table";
import { playGame, type Observer } from "./runner";

// An online game's move log, exported from `risk_moves` with its game's seed and seating, played
// again on the runner: `risk:trace -- --online` follows its trajectory, `risk:agreement` asks bots
// its decisions.

export interface OnlineLog {
  seed: string;
  players: number;
  labels: string[];
  moves: { seat: Seat; move: Move }[];
}

/** The log of a game's row and its `risk_moves`: each seat labelled by its bot's id or its
 *  person's name, and every answer in decision order. A row that never started, or a move log
 *  with a decision missing, fails loudly. */
export function onlineLogOf(row: Pick<GameRow, "id" | "seats" | "game">, logged: readonly LoggedMove[]): OnlineLog {
  if (row.game === null) throw new Error(`game ${row.id} hasn't started`);
  const moves = [...logged].sort((a, b) => a.decision - b.decision);
  moves.forEach((m, i) => {
    if (m.decision !== i) throw new Error(`game ${row.id}'s move log has decision ${m.decision.toString()} where decision ${i.toString()} belongs`);
  });
  return {
    seed: row.game.seed,
    players: row.game.players,
    labels: row.seats.map((c) => (c.kind === "bot" ? c.bot : c.profile.name)),
    moves: moves.map(({ seat, move }) => ({ seat, move })),
  };
}

export function readOnlineLog(path: string): OnlineLog {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a log named on the command line
  return JSON.parse(readFileSync(path, "utf8")) as OnlineLog;
}

/** Plays the log's game to its end, every seat's moves the logged ones. A log that doesn't fit the
 *  game (another seat to move, too few moves or too many) fails loudly. */
export function replayOnline(log: OnlineLog, observe?: Observer): void {
  let next = 0;
  const replay: Bot = (input) => {
    const logged = log.moves[next++] as OnlineLog["moves"][number] | undefined;
    if (!logged) throw new Error(`the log ends at decision ${(next - 1).toString()}, and the game goes on`);
    if (logged.seat !== input.seat) throw new Error(`seat ${input.seat.toString()} is to move at decision ${(next - 1).toString()}, and the log has seat ${logged.seat.toString()}`);
    return logged.move;
  };
  // An online game has no cap: the log is played to its end.
  playGame({ seed: log.seed, bots: Array.from({ length: log.players }, () => replay), maxTurns: Number.MAX_SAFE_INTEGER, observe });
  if (next !== log.moves.length) throw new Error(`the game ended at decision ${next.toString()}, and the log has ${log.moves.length.toString()}`);
}
