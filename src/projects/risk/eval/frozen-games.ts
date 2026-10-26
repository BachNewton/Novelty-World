import { createHash } from "node:crypto";
import { join } from "node:path";
import { riskBot } from "../bots";
import type { BotId } from "../online/seat-roster";
import { keptRecording, replayMoves, type Recording } from "./replay";

// The fixed games every seated bot is held to (`bots/frozen.test.ts`): each kept as its moves in
// `bots/__fixtures__/frozen/`, played and kept the first time a newly seated bot's tests collect.

/** The games a bot's fingerprints cover: the bot in every seat of a small table, and beside
 *  greedy at a larger one, so its own moves meet both itself and a different opponent. */
const TABLES: readonly { seed: string; seats: (bot: string) => string[] }[] = [
  { seed: "frozen-a", seats: (bot) => [bot, bot, bot] },
  { seed: "frozen-b", seats: (bot) => [bot, "greedy", bot, "greedy", "greedy"] },
];
const MAX_TURNS = 300;

const FIXTURES = join(__dirname, "..", "bots", "__fixtures__", "frozen");

/** Seated bots whose search makes asking them a whole game again take minutes, and a single
 *  decision seconds: no slice of their decisions fits the regular suite's timeout, so they are asked
 *  again in `bots/frozen.slow.test.ts` while their fingerprints stay in the regular suite. */
export const SEARCHING: ReadonlySet<BotId> = new Set(["rule-v7"]);

export interface FrozenGame {
  seed: string;
  seats: string[];
  kept: Recording;
}

export function frozenGames(bot: BotId): FrozenGame[] {
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

/** The bot's own decisions in the game, cut into slices of at most `size`, each asked again in a
 *  test of its own. */
export function ownSlices({ seats, kept }: FrozenGame, bot: BotId, size: number): number[][] {
  const own: number[] = [];
  kept.seats.forEach((seat, decision) => {
    if (seats[seat] === bot) own.push(decision);
  });
  const slices: number[][] = [];
  for (let from = 0; from < own.length; from += size) slices.push(own.slice(from, from + size));
  return slices;
}

/** Replays the game, asking the bot again at each decision of the slice; `check` compares its
 *  answer with the kept move. */
export function askAgain({ seed, seats, kept }: FrozenGame, bot: BotId, slice: readonly number[], check: (decision: number, again: unknown, move: unknown) => void): void {
  const asked = new Set(slice);
  const play = riskBot(bot);
  replayMoves(seed, seats.length, MAX_TURNS, kept, (input, move, decision) => {
    if (asked.has(decision)) check(decision, play(input), move);
  });
}
