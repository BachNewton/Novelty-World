import { describe, expect, it } from "vitest";
import { askAgain, frozenGames, ownSlices, SEARCHING } from "../eval/frozen-games";

// The searching seated bots asked their kept moves again (`frozen.test.ts` keeps their
// fingerprints): a searching bot's two frozen games take minutes to ask again on a
// saturated machine, which only a change reaching its code should pay.

const SLICE = 25;
/** rule-v7's slowest decision in its frozen games took 23 seconds on a saturated machine; v7.1's search is the same. */
const PER_DECISION_MS = 30_000;

describe("searching seated bots make their kept moves again", () => {
  for (const bot of SEARCHING) {
    for (const game of frozenGames(bot)) {
      for (const slice of ownSlices(game, bot, SLICE)) {
        it(
          `${bot} (${game.seed}, decisions ${slice[0].toString()} to ${slice[slice.length - 1].toString()})`,
          () => {
            askAgain(game, bot, slice, (decision, again, move) => expect(again, `decision ${decision.toString()}`).toEqual(move));
          },
          slice.length * PER_DECISION_MS,
        );
      }
    }
  }
});
