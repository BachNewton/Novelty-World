import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { playGame } from "../eval/runner";
import { SEAT_BOTS, type BotId } from "../online/seat-roster";
import { riskBot } from ".";

// A seated bot is frozen: its Elo was measured on exactly these moves, and the ratings
// cache keeps its games. So every seatable bot's moves over a few fixed games are pinned
// by a fingerprint, and work on its speed (a cache, a faster loop) must leave them
// bit-identical. A new seatable bot's fingerprint is written on its first run; a changed
// one fails here, and is a new version, not an edit of a seated one.

/** The games a bot's fingerprints cover: the bot in every seat of a small table, and beside
 *  greedy at a larger one, so its own moves meet both itself and a different opponent. Each
 *  game is a test of its own, so no one test plays long enough to miss the test timeout under
 *  a full parallel run. */
const TABLES: readonly { seed: string; seats: (bot: string) => string[] }[] = [
  { seed: "frozen-a", seats: (bot) => [bot, bot, bot] },
  { seed: "frozen-b", seats: (bot) => [bot, "greedy", bot, "greedy", "greedy"] },
];

function fingerprint(bot: string, { seed, seats }: (typeof TABLES)[number]): string {
  const hash = createHash("sha256");
  const record = playGame({
    seed,
    bots: seats(bot).map(riskBot),
    maxTurns: 300,
    observe: { decided: (input, move) => hash.update(`${input.seat.toString()}:${JSON.stringify(move)};`) },
  });
  hash.update(`|${String(record.winner)}:${record.turns.toString()}|`);
  return hash.digest("hex").slice(0, 32);
}

describe("seated bots are frozen", () => {
  for (const bot of Object.keys(SEAT_BOTS) as BotId[]) {
    for (const table of TABLES) {
      it(`${bot} plays the moves it was rated on (${table.seed})`, () => {
        expect(fingerprint(bot, table)).toMatchSnapshot();
      });
    }
  }
});
