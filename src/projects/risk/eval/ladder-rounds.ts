import { eloGapVariance, fitElo, type ComparisonSource } from "@/shared/lib/bot-lab/elo";
import { groupSpecs, matchupGames, type LadderCache, type LadderSpec, type LadderWalk } from "./ratings";
import { riskGameKey } from "./remote";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// A ladder played in rounds on other machines, beside the ladder itself (`ratings.ts`), whose
// file is part of the code every cached record is keyed by: an edit there replays the whole
// cache, so what only shapes a remote run's rounds and reports lives here.

/** A round's games, filled to at least `fill`: while the walk asks for fewer, every matchup
 *  still open plays its next group not yet played, in turn, up to `maxGroups`. A round on other
 *  machines takes minutes to start whatever it plays, and a pair sized to its expected need
 *  falls short about half the time, so without this a lopsided pair's last groups come one
 *  round each. The games past a stop point are read by nothing, so filling changes only what
 *  is played, never what the ladder rates. */
export function filledRound(spec: LadderSpec, walk: LadderWalk, played: (spec: RiskGameSpec) => RiskGameResult | undefined, fill: number): RiskGameSpec[] {
  const specs = [...walk.specs];
  const planned = new Set(specs.map(riskGameKey));
  const open = walk.matchups.filter((m) => !m.done).map((m) => ({ games: matchupGames(spec.prefix, m, spec.maxTurns), next: m.groups.length }));
  while (specs.length < fill && open.some((m) => m.next < spec.maxGroups)) {
    for (const m of open) {
      // Its next group with a game neither played nor planned.
      for (; m.next < spec.maxGroups; m.next++) {
        const missing = groupSpecs(m.games, m.next, 1).filter((s) => played(s) === undefined && !planned.has(riskGameKey(s)));
        if (missing.length === 0) continue;
        for (const s of missing) planned.add(riskGameKey(s));
        specs.push(...missing);
        m.next++;
        break;
      }
    }
  }
  return specs;
}

/** Keeps in `cache` every matchup's groups the walk read, up to the first whose games threw,
 *  where they are more than the cache gave it: as `playLadder` does after each round. */
export function cacheWalk(cache: LadderCache, spec: Pick<LadderSpec, "prefix" | "maxTurns">, walk: LadderWalk): void {
  for (const run of walk.matchups) {
    const clean = run.groups.findIndex((g) => g.errors > 0);
    const keep = run.groups.slice(0, clean === -1 ? run.groups.length : clean);
    if (keep.length > run.cached) cache.set(matchupGames(spec.prefix, run, spec.maxTurns), keep.map((g) => g.record));
  }
}

/** The win Elo fitted to the groups a walk has read, and each pair's gap's variance, as the
 *  ladder reads them (a lone win among n − 1 copies is n − 1 comparisons). */
export function walkFit(labels: readonly string[], walk: LadderWalk, anchor: string): { elo: Record<string, number>; variance: (a: string, b: string) => number } {
  const sources = walk.matchups.map(
    (m): ComparisonSource => ({
      a: m.lone,
      b: m.rest,
      aWins: m.groups.reduce((s, g) => s + g.record.win[0], 0),
      bWins: m.groups.reduce((s, g) => s + g.record.win[1], 0),
      aPerWin: m.players - 1,
      bPerWin: 1,
    }),
  );
  const elo = fitElo(labels, sources, { anchor });
  return { elo, variance: eloGapVariance(labels, elo, sources) };
}
