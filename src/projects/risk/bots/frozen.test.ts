import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keptRecording, replayMoves, type Recording } from "../eval/replay";
import { SEAT_BOTS, type BotId } from "../online/seat-roster";
import { riskBot } from ".";

// A seated bot is frozen: its Elo was measured on exactly these moves, and the ratings
// cache keeps its games. So every seatable bot's moves over a few fixed games are pinned
// by a fingerprint, and work on its speed (a cache, a faster loop) must leave them
// bit-identical. A new seatable bot's fingerprint is written on its first run; a changed
// one fails here, and is a new version, not an edit of a seated one. A newly seated bot's games
// are played and kept when the tests are collected, once.
//
// Asking a strong bot every decision of a whole game takes longer than the test timeout allows
// under a full parallel run, where each test gets a fraction of a core. So each game is kept as
// its moves (`__fixtures__/frozen/`), the fingerprint is taken from those moves, and the bot is
// asked again a slice of its decisions at a time, each slice a test of its own, with the game
// replayed from the kept moves up to it.

/** The games a bot's fingerprints cover: the bot in every seat of a small table, and beside
 *  greedy at a larger one, so its own moves meet both itself and a different opponent. */
const TABLES: readonly { seed: string; seats: (bot: string) => string[] }[] = [
  { seed: "frozen-a", seats: (bot) => [bot, bot, bot] },
  { seed: "frozen-b", seats: (bot) => [bot, "greedy", bot, "greedy", "greedy"] },
];
const MAX_TURNS = 300;
/** The bot's own decisions asked again in one test: the slowest seated bot answers this many in
 *  about half a second on one idle core. */
const SLICE = 150;

const FIXTURES = join(__dirname, "__fixtures__", "frozen");

function fingerprint(seed: string, players: number, recording: Recording): string {
  const hash = createHash("sha256");
  const record = replayMoves(seed, players, MAX_TURNS, recording, (input, move) =>
    hash.update(`${input.seat.toString()}:${JSON.stringify(move)};`),
  );
  hash.update(`|${String(record.winner)}:${record.turns.toString()}|`);
  return hash.digest("hex").slice(0, 32);
}

describe("seated bots are frozen", () => {
  for (const bot of Object.keys(SEAT_BOTS) as BotId[]) {
    for (const { seed, seats: seatsOf } of TABLES) {
      const seats = seatsOf(bot);
      const kept = keptRecording(join(FIXTURES, `${bot}.${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS);

      it(`${bot} plays the moves it was rated on (${seed})`, () => {
        expect(fingerprint(seed, seats.length, kept)).toMatchSnapshot();
      });

      const own: number[] = [];
      kept.seats.forEach((seat, decision) => {
        if (seats[seat] === bot) own.push(decision);
      });
      for (let from = 0; from < own.length; from += SLICE) {
        const slice = new Set(own.slice(from, from + SLICE));
        it(`${bot} makes its kept moves again (${seed}, its decisions ${from.toString()} to ${(from + slice.size - 1).toString()})`, () => {
          const play = riskBot(bot);
          replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
            if (slice.has(decision)) expect(play(input), `decision ${decision.toString()}`).toEqual(move);
          });
        });
      }
    }
  }
});
