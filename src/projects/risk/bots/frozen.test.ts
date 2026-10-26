import { describe, expect, it } from "vitest";
import { askAgain, fingerprint, frozenGames, ownSlices, SEARCHING } from "../eval/frozen-games";
import { SEAT_BOTS, type BotId } from "../online/seat-roster";

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
// replayed from the kept moves up to it. A searching bot is asked again in the slow suite.

/** The bot's own decisions asked again in one test: the slowest bot asked here answers this many
 *  in about half a second on one idle core. */
const SLICE = 150;

describe("seated bots are frozen", () => {
  for (const bot of Object.keys(SEAT_BOTS) as BotId[]) {
    for (const game of frozenGames(bot)) {
      it(`${bot} plays the moves it was rated on (${game.seed})`, () => {
        expect(fingerprint(game)).toMatchSnapshot();
      });

      if (SEARCHING.has(bot)) continue;
      for (const slice of ownSlices(game, bot, SLICE)) {
        it(`${bot} makes its kept moves again (${game.seed}, its decisions ${slice[0].toString()} to ${slice[slice.length - 1].toString()})`, () => {
          askAgain(game, bot, slice, (decision, again, move) => expect(again, `decision ${decision.toString()}`).toEqual(move));
        });
      }
    }
  }
});
