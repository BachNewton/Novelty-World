import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { Bot } from "../bots/bot";
import { riskBot } from "../bots";
import type { RowBotId } from "../online/seat-roster";
import { askAgain, frozenGames, ownSlices } from "./frozen-games";

// A seated bot asked every one of its own decisions in its frozen games again, as the frozen
// tests do a slice at a time (`bots/frozen.test.ts`, and the slow suite for a searching bot),
// here in one pass: the proof that the code a bot runs now plays the moves it was rated on.
// The ladder cache carries a seated bot's records across an edit only on this proof
// (`ratings-cache.ts`), and a provisional Elo takes a gauntlet's candidate for a seated bot
// only on it (`provisional.ts`).

const FIXTURES = fileURLToPath(new URL("../bots/__fixtures__/frozen/", import.meta.url));

export interface FrozenCheck {
  bot: RowBotId;
  /** Its own decisions asked again, over every frozen game. */
  decisions: number;
  /** The first decision of each game where it played otherwise. */
  differs: { seed: string; decision: number }[];
}

/** Asks `play` (by default the bot itself) every decision `bot` made in its kept frozen games.
 *  A bot with no kept games fails loudly: without them there is nothing to hold its play to,
 *  and games played now would only hold it to itself. */
export function checkFrozen(bot: RowBotId, play: Bot = riskBot(bot)): FrozenCheck {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the frozen fixtures' folder in this repo
  const kept = readdirSync(FIXTURES).filter((f) => f.startsWith(`${bot}.frozen-`)).length;
  if (kept === 0) throw new Error(`"${bot}" has no kept frozen games: a seated bot's are written when its frozen tests first run`);
  const games = frozenGames(bot);
  if (games.length !== kept) throw new Error(`"${bot}" had ${kept.toString()} kept frozen games and has ${games.length.toString()}: one was played now, not kept`);
  const check: FrozenCheck = { bot, decisions: 0, differs: [] };
  for (const game of games) {
    let first: number | undefined;
    askAgain(
      game,
      bot,
      ownSlices(game, bot, Infinity).flat(),
      (decision, again, move) => {
        check.decisions++;
        if (first === undefined && !isDeepStrictEqual(again, move)) first = decision;
      },
      play,
    );
    if (first !== undefined) check.differs.push({ seed: game.seed, decision: first });
  }
  return check;
}
