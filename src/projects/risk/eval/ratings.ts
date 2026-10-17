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

/** A matchup's games as the ladder rates them: the tally, and the Elo fits' comparisons
 *  summed, `a` the lone bot and `b` the rest. A fit reads only the sums, so the summed
 *  comparisons rate exactly as the games they came from. */
export interface MatchupRecord {
  tally: MatchupTally;
  win: PairResult;
  finish: PairResult;
}

/** Which games a matchup plays: its seeds' prefix, how many groups, and the turn cap. */
export interface MatchupGames extends Matchup {
  seeds: string;
  groups: number;
  maxTurns: number;
}

/** Matchups already played. A game is a pure function of its seed and seating, so a
 *  matchup's record holds for as long as the code playing it is unchanged; the cache
 *  answers only for that (`ratings-cache.ts`). */
export interface LadderCache {
  get(games: MatchupGames): MatchupRecord | null;
  set(games: MatchupGames, record: MatchupRecord): void;
}

export interface Ladder {
  tallies: MatchupTally[];
  /** Each matchup's winner-over-the-rest comparisons and finishing-order ones, summed, for the Elo fits. */
  winPairs: PairResult[];
  finishPairs: PairResult[];
  /** Games that threw, excluded from every tally. */
  errors: number;
  /** Matchups the cache answered. */
  cached: number;
}

export interface LadderOptions {
  pool: GameRunner<RiskGameSpec, RiskGameResult>;
  labels: readonly string[];
  players: readonly number[];
  groups: number;
  /** Seed-stream namespace; a matchup's seeds are `${prefix}:${lone}-in-${rest}:${players}p-g`. */
  prefix: string;
  maxTurns: number;
  cache?: LadderCache;
  /** Fired as matchup `index` starts, and again with its tally when its games are done
   *  (at once for a matchup the cache answers, `cached` then true). */
  onMatchup?: (index: number, matchup: Matchup, tally: MatchupTally | null, cached: boolean) => void;
}

export function ladderMatchups(labels: readonly string[], players: readonly number[]): Matchup[] {
  return labels.flatMap((a, i) =>
    labels.slice(i + 1).flatMap((b) =>
      players.flatMap((n) => [[a, b], [b, a]].map(([lone, rest]): Matchup => ({ lone, rest, players: n }))),
    ),
  );
}

/** Comparisons between `a` and `b` summed into one, `a` first. */
function summed(pairs: readonly PairResult[], a: string, b: string): PairResult {
  const sum: PairResult = { a, b, aWins: 0, bWins: 0 };
  for (const p of pairs) {
    if (p.a === a && p.b === b) {
      sum.aWins += p.aWins;
      sum.bWins += p.bWins;
    } else if (p.a === b && p.b === a) {
      sum.aWins += p.bWins;
      sum.bWins += p.aWins;
    } else throw new Error(`a ${a}-in-${b} game compared ${p.a} with ${p.b}`);
  }
  return sum;
}

/** Plays a matchup's games and rates them: the record, and how many games threw. */
async function playMatchup(pool: LadderOptions["pool"], games: MatchupGames): Promise<{ record: MatchupRecord; errors: number }> {
  const { lone, rest, players, seeds, groups, maxTurns } = games;
  const results = await pool.run(tableSpecs(lone, rest, "one-in", players, seeds, 0, groups * players, maxTurns));
  const tally: MatchupTally = { lone, rest, players, wins: 0, losses: 0, draws: 0 };
  const winPairs: PairResult[] = [];
  const finishPairs: PairResult[] = [];
  let errors = 0;
  for (const r of results) {
    const o = outcomeFor(r, lone);
    if (o === "error") {
      errors++;
      continue;
    }
    if (o === "win") tally.wins++;
    else if (o === "loss") tally.losses++;
    else tally.draws++;
    winPairs.push(...pairsFromWinner(finishesOf(r)));
    finishPairs.push(...pairsFromFinishes(finishesOf(r)));
  }
  return { record: { tally, win: summed(winPairs, lone, rest), finish: summed(finishPairs, lone, rest) }, errors };
}

/** Plays every matchup the cache can't answer at once, so the pool always has games, and
 *  rates them in matchup order once all are done: the same ladder as one matchup at a
 *  time. A matchup whose games threw is reported and never cached. */
export async function playLadder(opts: LadderOptions): Promise<Ladder> {
  const matchups = ladderMatchups(opts.labels, opts.players);
  let errors = 0;
  let cached = 0;
  const records = await Promise.all(
    matchups.map(async (matchup, index) => {
      const games: MatchupGames = {
        ...matchup,
        seeds: `${opts.prefix}:${matchup.lone}-in-${matchup.rest}:${matchup.players.toString()}p`,
        groups: opts.groups,
        maxTurns: opts.maxTurns,
      };
      const known = opts.cache?.get(games) ?? null;
      if (known !== null) {
        cached++;
        opts.onMatchup?.(index, matchup, known.tally, true);
        return known;
      }
      opts.onMatchup?.(index, matchup, null, false);
      const played = await playMatchup(opts.pool, games);
      errors += played.errors;
      if (played.errors === 0) opts.cache?.set(games, played.record);
      opts.onMatchup?.(index, matchup, played.record.tally, false);
      return played.record;
    }),
  );
  return {
    tallies: records.map((r) => r.tally),
    winPairs: records.map((r) => r.win),
    finishPairs: records.map((r) => r.finish),
    errors,
    cached,
  };
}
