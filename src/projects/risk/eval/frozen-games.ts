import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { riskBot } from "../bots";
import type { Bot } from "../bots/bot";
import type { RowBotId } from "../online/seat-roster";
import { keptRecording, recordMoves, replayMoves, type Recording } from "./replay";

// The fixed games every seated bot is held to (`bots/frozen.test.ts`): each kept as its moves in
// `bots/__fixtures__/frozen/`, played and kept the first time a newly seated bot's tests collect.

/** The games a bot's fingerprints cover: the bot in every seat of a small table, and beside
 *  greedy at a larger one, so its own moves meet both itself and a different opponent. */
const TABLES: readonly { seed: string; seats: (bot: string) => string[] }[] = [
  { seed: "frozen-a", seats: (bot) => [bot, bot, bot] },
  { seed: "frozen-b", seats: (bot) => [bot, "greedy", bot, "greedy", "greedy"] },
];
const MAX_TURNS = 300;

const FIXTURES = fileURLToPath(new URL("../bots/__fixtures__/frozen/", import.meta.url));

/** Seated bots whose decisions are too dear for the regular suite: a search's take seconds
 *  (rule-v7.1), a network's a tenth of one (learned-v1, learned-v2, learned-v3), so asking a whole
 *  game again takes minutes and no slice fits the regular suite's timeout. They are asked again in
 *  `bots/frozen.slow.test.ts` while their fingerprints stay in the regular suite. */
export const SEARCHING: ReadonlySet<RowBotId> = new Set(["rule-v7.1", "learned-v1", "learned-v2", "learned-v3"]);

export interface FrozenGame {
  seed: string;
  seats: string[];
  kept: Recording;
}

export function frozenGames(bot: RowBotId): FrozenGame[] {
  return TABLES.map(({ seed, seats: seatsOf }) => {
    const seats = seatsOf(bot);
    return { seed, seats, kept: keptRecording(join(FIXTURES, `${bot}.${seed}.json`), seed, () => seats.map(riskBot), MAX_TURNS) };
  });
}

export function fingerprint({ seed, seats, kept }: FrozenGame): string {
  const hash = createHash("sha256");
  const record = replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move) =>
    hash.update(`${input.seat.toString()}:${JSON.stringify(move)};`),
  );
  hash.update(`|${String(record.winner)}:${record.turns.toString()}|`);
  return hash.digest("hex").slice(0, 32);
}

/** The fingerprints of the frozen games played now with `label` in the seats a seated bot's
 *  are kept with: the same as a seated bot's kept games' exactly when the two make the same
 *  moves in them. A gauntlet records its candidate's, so a bot seated later can be shown to be
 *  the bot it measured. */
export function playedFingerprints(label: string): Record<string, string> {
  return Object.fromEntries(
    TABLES.map(({ seed, seats: seatsOf }) => {
      const seats = seatsOf(label);
      return [seed, fingerprint({ seed, seats, kept: recordMoves(seed, seats.map(riskBot), MAX_TURNS) })];
    }),
  );
}

/** The fingerprints of a seated bot's kept frozen games. */
export function keptFingerprints(bot: RowBotId): Record<string, string> {
  return Object.fromEntries(frozenGames(bot).map((game) => [game.seed, fingerprint(game)]));
}

/** The bot's own decisions in the game, cut into slices of at most `size`, each asked again in a
 *  test of its own. */
export function ownSlices({ seats, kept }: FrozenGame, bot: RowBotId, size: number): number[][] {
  const own: number[] = [];
  kept.seats.forEach((seat, decision) => {
    if (seats[seat] === bot) own.push(decision);
  });
  const slices: number[][] = [];
  for (let from = 0; from < own.length; from += size) slices.push(own.slice(from, from + size));
  return slices;
}

/** Replays the game, asking the bot again at each decision of the slice; `check` compares its
 *  answer with the kept move. `play` asks another bot in its place, to show the two play alike. */
export function askAgain(
  { seed, seats, kept }: FrozenGame,
  bot: RowBotId,
  slice: readonly number[],
  check: (decision: number, again: unknown, move: unknown) => void,
  play: Bot = riskBot(bot),
): void {
  const asked = new Set(slice);
  replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
    if (asked.has(decision)) check(decision, play(input), move);
  });
}
