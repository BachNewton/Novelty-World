import { eloGapVariance, fitElo, pairsFromFinishes, pairsFromWinner, type ComparisonSource, type PairResult } from "@/shared/lib/bot-lab/elo";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { GameStore } from "@/shared/lib/bot-lab/remote";
import { luceWinProb } from "@/shared/lib/bot-lab/sprt";
import { normalQuantile } from "@/shared/lib/bot-lab/stats";
import { finishesOf, outcomeFor, tableSpecs } from "./parallel";
import { riskGameKey } from "./remote";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// The games of a ratings ladder: every pair of bots at each table size, each alone
// among copies of the other, a seed group at a time until the ladder's Elo fit knows
// the pair's gap well enough (the project's CLAUDE.md, "Measuring bots", says why). The
// ratings CLI is one; the gauntlet's field-internal games, which anchor its Elo fit, are
// another.

/** One matchup of the ladder: `lone` alone among copies of `rest` at a table of `players`. */
export interface Matchup {
  lone: string;
  rest: string;
  players: number;
}

export interface MatchupTally extends Matchup {
  /** Seed groups played, `players` games each. */
  groups: number;
  wins: number;
  losses: number;
  /** Games the turn cap drew. */
  draws: number;
}

/** One seed group of a matchup's games as the ladder rates it: the lone bot's wins,
 *  losses and capped games, and the Elo fits' comparisons summed, the lone bot's first.
 *  A fit reads only the sums, so the summed comparisons rate exactly as the games they
 *  came from. */
export interface GroupRecord {
  wins: number;
  losses: number;
  draws: number;
  win: [number, number];
  finish: [number, number];
}

/** Which games a matchup plays: its seeds' prefix and the turn cap. Its groups are a
 *  stream, the same however far it is played. */
export interface MatchupGames extends Matchup {
  seeds: string;
  maxTurns: number;
}

/** Matchups' first groups already played. A game is a pure function of its seed and
 *  seating, so a group's record holds for as long as the code playing it is unchanged;
 *  the cache answers only for that (`ratings-cache.ts`). It only saves playing: the
 *  ladder reads the same groups whether they come from it or from the games. */
export interface LadderCache {
  /** The matchup's first groups, in order: none when it has none. */
  get(games: MatchupGames): readonly GroupRecord[];
  /** Keeps the matchup's first groups, when they are more than it holds. */
  set(games: MatchupGames, groups: readonly GroupRecord[]): void;
}

/** What a ladder plays and how precisely. */
export interface LadderSpec {
  labels: readonly string[];
  players: readonly number[];
  /** Seed-stream namespace; a matchup's seeds are `${prefix}:${lone}-in-${rest}:${players}p-g`. */
  prefix: string;
  maxTurns: number;
  /** The ladder plays until any two of its bots `margin` Elo a seat apart are ordered
   *  right with probability at least 1 − `alpha`: every pair's fitted gap has a standard
   *  error of at most margin / z(1 − alpha) (`ladderPrecision`). */
  margin: number;
  alpha: number;
  /** The most groups a matchup plays: a pair whose gap never comes into focus (a bot
   *  that never wins) stops here. */
  maxGroups: number;
  cache?: LadderCache;
}

export interface LadderOptions extends LadderSpec {
  pool: GameRunner<RiskGameSpec, RiskGameResult>;
  /** Plays one group of every undecided pair a round, so it asks for no game past a
   *  stop point: for a pool that answers from games already played (a remote run's
   *  report). Otherwise each round plays as many groups as the evidence says a pair
   *  still needs, so the pool always has games. */
  stepwise?: boolean;
  /** Fired with the ladder as it stands after every round: cosmetic only. */
  onRound?: (walk: LadderWalk) => void;
}

/** A matchup as far as the ladder has read it. */
export interface LadderMatchupRun extends Matchup {
  /** Its groups, in order, each with the games of it that threw (left out of its record). */
  groups: { record: GroupRecord; errors: number }[];
  /** How many of them the cache answered. */
  cached: number;
  /** Its pair's gap is known, or it has played `maxGroups`. */
  done: boolean;
}

/** The ladder read from the games so far, a seed group at a time. */
export interface LadderWalk {
  matchups: LadderMatchupRun[];
  /** The games it needs next; none once every matchup is done. */
  specs: RiskGameSpec[];
}

export interface Ladder {
  tallies: MatchupTally[];
  /** Each matchup's winner-over-the-rest comparisons and finishing-order ones, summed, for the Elo fits. */
  winPairs: PairResult[];
  finishPairs: PairResult[];
  /** Games that threw, excluded from every tally. */
  errors: number;
  /** Groups the cache answered. */
  cached: number;
}

/** The standard error, in Elo a seat, the ladder holds every pair's gap to. */
export function ladderPrecision(margin: number, alpha: number): number {
  return margin / normalQuantile(1 - alpha);
}

export function ladderMatchups(labels: readonly string[], players: readonly number[]): Matchup[] {
  return labels.flatMap((a, i) =>
    labels.slice(i + 1).flatMap((b) =>
      players.flatMap((n) => [[a, b], [b, a]].map(([lone, rest]): Matchup => ({ lone, rest, players: n }))),
    ),
  );
}

/** The games of `matchup` in a ladder seeded under `prefix`. */
export function matchupGames(prefix: string, matchup: Matchup, maxTurns: number): MatchupGames {
  return { ...matchup, seeds: `${prefix}:${matchup.lone}-in-${matchup.rest}:${matchup.players.toString()}p`, maxTurns };
}

/** Groups `from` to `from + count − 1` of a matchup's games. */
export function groupSpecs({ lone, rest, players, seeds, maxTurns }: MatchupGames, from: number, count: number): RiskGameSpec[] {
  return tableSpecs(lone, rest, "one-in", players, seeds, from * players, count * players, maxTurns);
}

/** One group's games rated: its record, and how many of them threw. */
function rateGroup({ lone, rest }: Matchup, results: readonly RiskGameResult[]): { record: GroupRecord; errors: number } {
  const record: GroupRecord = { wins: 0, losses: 0, draws: 0, win: [0, 0], finish: [0, 0] };
  let errors = 0;
  const add = (into: [number, number], pairs: readonly PairResult[]) => {
    for (const p of pairs) {
      if (p.a === lone && p.b === rest) {
        into[0] += p.aWins;
        into[1] += p.bWins;
      } else if (p.a === rest && p.b === lone) {
        into[0] += p.bWins;
        into[1] += p.aWins;
      } else throw new Error(`a ${lone}-in-${rest} game compared ${p.a} with ${p.b}`);
    }
  };
  for (const r of results) {
    const o = outcomeFor(r, lone);
    if (o === "error") {
      errors++;
      continue;
    }
    if (o === "win") record.wins++;
    else if (o === "loss") record.losses++;
    else record.draws++;
    add(record.win, pairsFromWinner(finishesOf(r)));
    add(record.finish, pairsFromFinishes(finishesOf(r)));
  }
  return { record, errors };
}

const sum = (run: LadderMatchupRun, of: (g: GroupRecord) => number) => run.groups.reduce((s, g) => s + of(g.record), 0);

/** A matchup's winner comparisons as the fit and its precision read them: a lone win
 *  among n − 1 copies is n − 1 comparisons, a loss one. */
function winSource(run: LadderMatchupRun): ComparisonSource {
  return { a: run.lone, b: run.rest, aWins: sum(run, (g) => g.win[0]), bWins: sum(run, (g) => g.win[1]), aPerWin: run.players - 1, bPerWin: 1 };
}

const pairOf = ({ lone, rest }: Matchup) => (lone < rest ? `${lone} ${rest}` : `${rest} ${lone}`);

/** Reads a ladder from the games played so far (`played`, and its cache), a seed group at
 *  a time: each round of the walk reads the next group of every matchup not yet done, then
 *  fits the win Elo over every group read and works out each pair's precision
 *  (`eloGapVariance`). A pair's matchups, every table and both ways round, are done once
 *  its gap's standard error is within `ladderPrecision`, or at `maxGroups`. Where the
 *  walk reaches a group not yet played, it stops and names the games to play next.
 *
 *  The walk depends only on the games, never on how many were played at a time or where:
 *  so a ladder played here, in rounds on other machines, or partly from its cache rates
 *  the same.
 *
 *  `ahead` sizes the next games to the evidence (`groupsAhead`). Without it, each
 *  undecided matchup plays only the group the walk is missing. */
export function walkLadder(spec: LadderSpec, played: (spec: RiskGameSpec) => RiskGameResult | undefined, ahead: boolean): LadderWalk {
  const { labels } = spec;
  const target = ladderPrecision(spec.margin, spec.alpha) ** 2;
  const runs = ladderMatchups(labels, spec.players).map((matchup) => {
    const games = matchupGames(spec.prefix, matchup, spec.maxTurns);
    const run: LadderMatchupRun = { ...matchup, groups: [], cached: 0, done: spec.maxGroups <= 0 };
    return { run, games, cache: spec.cache?.get(games) ?? [] };
  });
  const groupAt = ({ run, games, cache }: (typeof runs)[number], g: number) => {
    if (g < cache.length) return { record: cache[g], errors: 0, cached: true };
    const results = groupSpecs(games, g, 1).map(played);
    if (results.some((r) => r === undefined)) return null;
    return { ...rateGroup(run, results as RiskGameResult[]), cached: false };
  };

  for (let step = 0; ; step++) {
    const active = runs.filter((r) => !r.run.done);
    if (active.length === 0) return { matchups: runs.map((r) => r.run), specs: [] };
    const next = active.map((r) => groupAt(r, step));
    if (next.some((g) => g === null)) {
      // Each undecided matchup's groups to hand, from its first: those read, and any played
      // beyond the walk.
      const known = active.map((r) => {
        const groups = r.run.groups.map((g) => g.record);
        for (let g = groups.length; g < spec.maxGroups; g++) {
          const more = groupAt(r, g);
          if (more === null) break;
          groups.push(more.record);
        }
        return { run: r.run, groups };
      });
      const totals = ahead ? groupsAhead(spec, runs.filter((r) => r.run.done).map((r) => r.run), known, step, target) : known.map(() => step + 1);
      const specs = active.flatMap((r, i) => {
        const from = known[i].groups.length;
        return groupSpecs(r.games, from, Math.max(0, totals[i] - from)).filter((s) => played(s) === undefined);
      });
      return { matchups: runs.map((r) => r.run), specs };
    }
    active.forEach((r, i) => {
      const g = next[i];
      if (g === null) return;
      r.run.groups.push({ record: g.record, errors: g.errors });
      if (g.cached) r.run.cached++;
    });
    const sources = runs.map((r) => winSource(r.run));
    const variance = eloGapVariance(labels, fitElo(labels, sources, { anchor: labels[0] }), sources);
    for (const { run } of active) {
      if (run.groups.length >= spec.maxGroups || variance(run.lone, run.rest) <= target) run.done = true;
    }
  }
}

/** How many groups in all each undecided matchup should have played by the end of the
 *  next round: what its pair is expected to need. The win Elo is fitted to every group to
 *  hand, and the pair needs the first count of groups at which its gap's variance is
 *  within `target`, every undecided matchup's groups beyond those to hand added at their
 *  expected outcome: the Luce model's at the fitted strengths (before any games, all
 *  equal), decisive in the matchup's share so far. Never past `maxGroups`, and never more
 *  than twice the groups a matchup already has, so one early, noisy fit can't commit a
 *  round to the cap. */
function groupsAhead(
  spec: LadderSpec,
  done: readonly LadderMatchupRun[],
  known: readonly { run: LadderMatchupRun; groups: readonly GroupRecord[] }[],
  step: number,
  target: number,
): number[] {
  const { labels } = spec;
  const source = (run: Matchup, wins: number, losses: number): ComparisonSource => ({
    a: run.lone,
    b: run.rest,
    aWins: wins,
    bWins: losses,
    aPerWin: run.players - 1,
    bPerWin: 1,
  });
  // Each undecided matchup's comparisons over its first g groups to hand, g = 0, 1, ….
  const prefixes = known.map(({ run, groups }) => {
    const sums: [number, number][] = [[0, 0]];
    for (const g of groups) {
      const [a, b] = sums[sums.length - 1];
      sums.push([a + g.win[0], b + g.win[1]]);
    }
    return { run, sums };
  });
  const settled = done.map(winSource);
  const elo = fitElo(labels, [...settled, ...prefixes.map(({ run, sums }) => source(run, ...sums[sums.length - 1]))], { anchor: labels[0] });
  const expected = known.map(({ run, groups }) => {
    const decisive = groups.reduce((s, g) => s + g.wins + g.losses, 0);
    const counted = groups.reduce((s, g) => s + g.wins + g.losses + g.draws, 0);
    const share = counted > 0 ? decisive / counted : 1;
    const q = luceWinProb(1, run.players)(elo[run.lone] - elo[run.rest]);
    return { wins: run.players * share * q * (run.players - 1), losses: run.players * share * (1 - q) };
  });
  const at = (i: number, total: number): ComparisonSource => {
    const { run, sums } = prefixes[i];
    const have = Math.min(total, sums.length - 1);
    const [a, b] = sums[have];
    return source(run, a + (total - have) * expected[i].wins, b + (total - have) * expected[i].losses);
  };
  const need = new Map<string, number>();
  const open = new Set(known.map(({ run }) => pairOf(run)));
  for (let total = step + 1; total <= spec.maxGroups && open.size > 0; total++) {
    const variance = eloGapVariance(labels, elo, [...settled, ...known.map((_, i) => at(i, total))]);
    for (const { run } of known) {
      const pair = pairOf(run);
      if (open.has(pair) && variance(run.lone, run.rest) <= target) {
        need.set(pair, total);
        open.delete(pair);
      }
    }
  }
  return known.map(({ run, groups }) => {
    const most = groups.length === 0 ? spec.maxGroups : Math.min(spec.maxGroups, 2 * groups.length);
    return Math.min(need.get(pairOf(run)) ?? spec.maxGroups, most);
  });
}

/** Plays a ladder: walks it, plays the games the walk names, and walks it again, until it
 *  needs none. Each round's games play at once, so the pool always has games. The cache
 *  keeps every matchup's groups the walk read, up to the first whose games threw. */
export async function playLadder(opts: LadderOptions): Promise<Ladder> {
  const store = new GameStore<RiskGameSpec, RiskGameResult>(riskGameKey);
  // The walks read the cache as the run found it, so the groups this run played and kept
  // are counted as played, not as the cache's.
  const found = new Map<string, readonly GroupRecord[]>();
  const asFound: LadderCache = {
    get: (games) => {
      const key = `${games.seeds} ${games.maxTurns.toString()}`;
      let groups = found.get(key);
      if (groups === undefined) found.set(key, (groups = opts.cache?.get(games) ?? []));
      return groups;
    },
    set: () => undefined,
  };
  for (;;) {
    const walk = walkLadder({ ...opts, cache: asFound }, (spec) => store.get(spec), opts.stepwise !== true);
    opts.onRound?.(walk);
    if (opts.cache !== undefined) {
      for (const run of walk.matchups) {
        const clean = run.groups.findIndex((g) => g.errors > 0);
        const keep = run.groups.slice(0, clean === -1 ? run.groups.length : clean);
        if (keep.length > run.cached) opts.cache.set(matchupGames(opts.prefix, run, opts.maxTurns), keep.map((g) => g.record));
      }
    }
    if (walk.specs.length === 0) return ladderOf(walk);
    // A pool answers in order of index, so the round's games are indexed by their place in it.
    const round = walk.specs.map((spec, index) => ({ ...spec, index }));
    for (const result of await opts.pool.run(round)) store.add({ key: riskGameKey(round[result.index]), result });
  }
}

function ladderOf(walk: LadderWalk): Ladder {
  const runs = walk.matchups;
  return {
    tallies: runs.map((run) => ({
      lone: run.lone,
      rest: run.rest,
      players: run.players,
      groups: run.groups.length,
      wins: sum(run, (g) => g.wins),
      losses: sum(run, (g) => g.losses),
      draws: sum(run, (g) => g.draws),
    })),
    winPairs: runs.map((run) => ({ a: run.lone, b: run.rest, aWins: sum(run, (g) => g.win[0]), bWins: sum(run, (g) => g.win[1]) })),
    finishPairs: runs.map((run) => ({ a: run.lone, b: run.rest, aWins: sum(run, (g) => g.finish[0]), bWins: sum(run, (g) => g.finish[1]) })),
    errors: runs.reduce((s, run) => s + run.groups.reduce((t, g) => t + g.errors, 0), 0),
    cached: runs.reduce((s, run) => s + run.cached, 0),
  };
}
