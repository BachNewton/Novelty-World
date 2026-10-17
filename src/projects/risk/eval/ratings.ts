import { pairsFromFinishes, pairsFromWinner, type PairResult } from "@/shared/lib/bot-lab/elo";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { finishesOf, outcomeFor, tableSpecs } from "./parallel";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// The games of a ratings ladder: every pair of bots at each table size, each alone
// among copies of the other, a fixed number of seed groups a matchup. The ratings
// CLI is one; the gauntlet's field-internal games, which anchor its Elo fit, are another.

/** One matchup of the ladder: `lone` alone among copies of `rest` at a table of `players`. */
export interface Matchup {
  lone: string;
  rest: string;
  players: number;
}

export interface MatchupTally extends Matchup {
  wins: number;
  losses: number;
  /** Games the turn cap drew. */
  draws: number;
}

export interface Ladder {
  tallies: MatchupTally[];
  /** Every game's winner over each other seat, and its finishing order as pairs, for the Elo fits. */
  winPairs: PairResult[];
  finishPairs: PairResult[];
  /** Games that threw, excluded from every tally. */
  errors: number;
}

export interface LadderOptions {
  pool: GameRunner<RiskGameSpec, RiskGameResult>;
  labels: readonly string[];
  players: readonly number[];
  groups: number;
  /** Seed-stream namespace; a matchup's seeds are `${prefix}:${lone}-in-${rest}:${players}p-g`. */
  prefix: string;
  maxTurns: number;
  /** Fired as matchup `index` starts, and again with its tally when its games are done. */
  onMatchup?: (index: number, matchup: Matchup, tally: MatchupTally | null) => void;
}

export function ladderMatchups(labels: readonly string[], players: readonly number[]): Matchup[] {
  return labels.flatMap((a, i) =>
    labels.slice(i + 1).flatMap((b) =>
      players.flatMap((n) => [[a, b], [b, a]].map(([lone, rest]): Matchup => ({ lone, rest, players: n }))),
    ),
  );
}

/** Plays every matchup at once, so the pool always has games, and rates the games
 *  in matchup order once all are done: the same ladder as one matchup at a time. */
export async function playLadder(opts: LadderOptions): Promise<Ladder> {
  const matchups = ladderMatchups(opts.labels, opts.players);
  const played = await Promise.all(
    matchups.map(async (matchup, index) => {
      opts.onMatchup?.(index, matchup, null);
      const { lone, rest, players } = matchup;
      const prefix = `${opts.prefix}:${lone}-in-${rest}:${players}p`;
      const results = await opts.pool.run(tableSpecs(lone, rest, "one-in", players, prefix, 0, opts.groups * players, opts.maxTurns));
      const tally: MatchupTally = { ...matchup, wins: 0, losses: 0, draws: 0 };
      for (const r of results) {
        const o = outcomeFor(r, lone);
        if (o === "win") tally.wins++;
        else if (o === "loss") tally.losses++;
        else if (o === "draw") tally.draws++;
      }
      opts.onMatchup?.(index, matchup, tally);
      return { tally, results };
    }),
  );
  const ladder: Ladder = { tallies: played.map((p) => p.tally), winPairs: [], finishPairs: [], errors: 0 };
  for (const r of played.flatMap((p) => p.results)) {
    if (r.error !== undefined) {
      ladder.errors++;
      continue;
    }
    ladder.winPairs.push(...pairsFromWinner(finishesOf(r)));
    ladder.finishPairs.push(...pairsFromFinishes(finishesOf(r)));
  }
  return ladder;
}
