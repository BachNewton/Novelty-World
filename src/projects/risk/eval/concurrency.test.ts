import { describe, expect, it } from "vitest";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { gauntletTables, runRiskGauntlet, type RiskGauntletOptions } from "./gauntlet";
import { eloGapVariance, fitElo, pairsFromFinishes, pairsFromWinner, type PairResult } from "@/shared/lib/bot-lab/elo";
import { finishesOf, outcomeFor, tableSpecs } from "./parallel";
import {
  ladderMatchups,
  ladderPrecision,
  playLadder,
  type GroupRecord,
  type LadderCache,
  type LadderOptions,
  type MatchupGames,
  type MatchupTally,
} from "./ratings";
import type { RiskGameResult, RiskGameSpec } from "./runner";
import { fakeGame } from "./fake-game";

// The gauntlet and the ladder play many tables through the pool at once. What they
// report must not depend on that: a stand-in game (a pure function of its seed and
// seating, like a real one, but instant) is played through a runner that takes one
// call at a time, and through one that finishes concurrent calls in a scrambled
// order, and the reports must match. The ladder's rounds and its cache must change
// nothing either, only which games are played.

/** One call at a time, in the order they were made. */
function serialRunner(): GameRunner<RiskGameSpec, RiskGameResult> {
  let last: Promise<unknown> = Promise.resolve();
  return {
    size: 1,
    run: (specs) => {
      const next = last.then(() => specs.map(fakeGame));
      last = next;
      return next;
    },
    close: () => Promise.resolve(),
  };
}

/** Calls in flight together, each finishing after a number of event-loop turns that
 *  varies from call to call, so they complete out of the order they were made. */
function scrambledRunner(): GameRunner<RiskGameSpec, RiskGameResult> {
  let calls = 0;
  return {
    size: 4,
    run: async (specs) => {
      const turns = (calls++ * 7) % 11;
      for (let t = 0; t < turns; t++) await new Promise<void>((resolve) => setImmediate(resolve));
      return specs.map(fakeGame);
    },
    close: () => Promise.resolve(),
  };
}

const options = (pool: RiskGauntletOptions["pool"], overrides: Partial<RiskGauntletOptions> = {}): RiskGauntletOptions => ({
  candidate: "cand",
  base: "base",
  field: ["base", "other"],
  players: [3, 4],
  formats: ["one-in", "one-out"],
  prefix: "conc",
  margin: 30,
  alpha: 0.05,
  beta: 0.05,
  maxDecisive: 300,
  fieldMaxGroups: 6,
  maxTurns: 600,
  batchGames: 12,
  pool,
  ...overrides,
});

describe("the gauntlet's pairings played at once", () => {
  it("report exactly what they report one call at a time", async () => {
    const serial = await runRiskGauntlet(options(serialRunner()));
    const scrambled = await runRiskGauntlet(options(scrambledRunner()));
    expect(scrambled).toEqual(serial);
    // A run that exercises every path: decided pairings, one that ran to the cap,
    // and rounds that overshot their stop point.
    expect(new Set(serial.pairings.map((p) => p.verdict)).size).toBeGreaterThan(1);
    expect(serial.pairings.some((p) => p.generated > p.games)).toBe(true);
  });

  it("give each pairing what it gets played alone", async () => {
    const all = await runRiskGauntlet(options(scrambledRunner()));
    const tables = gauntletTables(["base", "other"], [3, 4], ["one-in", "one-out"]);
    for (const [i, t] of tables.entries()) {
      const alone = await runRiskGauntlet(
        options(serialRunner(), { base: t.opponent, field: [t.opponent], players: [t.players], formats: [t.format], fieldMaxGroups: 0 }),
      );
      expect(alone.pairings).toEqual([all.pairings[i]]);
    }
  });

  it("report every pairing's progress, each under its own table", async () => {
    const last = new Map<number, { wins: number; losses: number; done: boolean }>();
    const report = await runRiskGauntlet(
      options(scrambledRunner(), {
        onProgress: (p) => {
          expect(last.get(p.index)?.done).not.toBe(true);
          last.set(p.index, p);
        },
      }),
    );
    expect([...last.keys()].sort()).toEqual(report.pairings.map((_, i) => i + 1));
    report.pairings.forEach((p, i) => {
      expect(last.get(i + 1)).toMatchObject({ wins: p.wins, losses: p.losses, done: true });
    });
  });
});

const LABELS = ["cand", "base", "other"];
const ladderSpec: Omit<LadderOptions, "pool"> = { labels: LABELS, players: [3, 4], prefix: "lad", maxTurns: 600, margin: 60, alpha: 0.05, maxGroups: 100 };

const counting = (runner = serialRunner()) => {
  let games = 0;
  return {
    played: () => games,
    pool: { ...runner, run: (specs: readonly RiskGameSpec[]) => ((games += specs.length), runner.run(specs)) },
  };
};

const fakeGroups = (t: { lone: string; rest: string; players: number }, from: number, count: number) =>
  tableSpecs(t.lone, t.rest, "one-in", t.players, `lad:${t.lone}-in-${t.rest}:${t.players.toString()}p`, from * t.players, count * t.players, 600).map(fakeGame);

describe("the ladder played in rounds", () => {
  it("rates the same however its rounds are cut and its games finish", async () => {
    const ahead = await playLadder({ ...ladderSpec, pool: serialRunner() });
    expect(await playLadder({ ...ladderSpec, pool: scrambledRunner() })).toEqual(ahead);
    expect(await playLadder({ ...ladderSpec, pool: serialRunner(), stepwise: true })).toEqual(ahead);
    expect(ahead.tallies.map(({ lone, rest, players }) => ({ lone, rest, players }))).toEqual(ladderMatchups(LABELS, [3, 4]));
    for (const t of ahead.tallies) {
      const outcomes = fakeGroups(t, 0, t.groups).map((r) => outcomeFor(r, t.lone));
      expect(t).toMatchObject({
        wins: outcomes.filter((o) => o === "win").length,
        losses: outcomes.filter((o) => o === "loss").length,
        draws: outcomes.filter((o) => o === "draw").length,
      });
    }
  });

  it("plays each pair until the fit knows its gap, every table of it alike", async () => {
    const ladder = await playLadder({ ...ladderSpec, pool: serialRunner() });
    const pairGroups = new Map<string, Set<number>>();
    for (const t of ladder.tallies) {
      const pair = [t.lone, t.rest].sort().join(" ");
      pairGroups.set(pair, (pairGroups.get(pair) ?? new Set<number>()).add(t.groups));
    }
    for (const groups of pairGroups.values()) expect(groups.size).toBe(1);
    const stops = [...pairGroups.values()].map((g) => [...g][0]);
    // The pairs stop at different points, none at the cap: the evidence decides.
    expect(new Set(stops).size).toBeGreaterThan(1);
    expect(Math.max(...stops)).toBeLessThan(ladderSpec.maxGroups);

    // At the stop, every pair's gap is within the precision; a group earlier, the last
    // pair's wasn't.
    const variance = (groups: (t: MatchupTally) => number) => {
      const sources = ladder.tallies.map((t) => {
        const outcomes = fakeGroups(t, 0, groups(t)).map((r) => outcomeFor(r, t.lone));
        const wins = outcomes.filter((o) => o === "win").length;
        const losses = outcomes.filter((o) => o === "loss").length;
        return { a: t.lone, b: t.rest, aWins: wins * (t.players - 1), bWins: losses, aPerWin: t.players - 1, bPerWin: 1 };
      });
      return eloGapVariance(LABELS, fitElo(LABELS, sources, { anchor: LABELS[0] }), sources);
    };
    const target = ladderPrecision(ladderSpec.margin, ladderSpec.alpha) ** 2;
    const atStop = variance((t) => t.groups);
    for (const t of ladder.tallies) expect(atStop(t.lone, t.rest)).toBeLessThanOrEqual(target);
    const last = Math.max(...stops);
    const before = variance((t) => Math.min(t.groups, last - 1));
    expect(ladder.tallies.some((t) => t.groups === last && before(t.lone, t.rest) > target)).toBe(true);
  });

  it("plays fewer games for a looser precision", async () => {
    const strict = counting();
    const loose = counting();
    await playLadder({ ...ladderSpec, pool: strict.pool });
    await playLadder({ ...ladderSpec, margin: 120, pool: loose.pool });
    expect(loose.played()).toBeLessThan(strict.played() / 2);
  });

  it("plays no game with no groups allowed", async () => {
    const none = counting();
    const ladder = await playLadder({ ...ladderSpec, maxGroups: 0, pool: none.pool });
    expect(none.played()).toBe(0);
    expect(ladder.tallies.every((t) => t.groups === 0)).toBe(true);
  });

  it("gives each matchup's comparisons summed, which fit the same Elo as every game's own", async () => {
    const played = await playLadder({ ...ladderSpec, pool: serialRunner() });
    const games = played.tallies.flatMap((t) => fakeGroups(t, 0, t.groups));
    const each = (pairs: (f: ReturnType<typeof finishesOf>) => PairResult[]) => games.flatMap((r) => pairs(finishesOf(r)));
    expect(fitElo(LABELS, played.winPairs, { anchor: "base" })).toEqual(fitElo(LABELS, each(pairsFromWinner), { anchor: "base" }));
    expect(fitElo(LABELS, played.finishPairs, { anchor: "base" })).toEqual(fitElo(LABELS, each(pairsFromFinishes), { anchor: "base" }));
  });
});

describe("the ladder with a cache", () => {
  const memoryCache = (): LadderCache & { records: Map<string, readonly GroupRecord[]> } => {
    const records = new Map<string, readonly GroupRecord[]>();
    const key = (g: MatchupGames) => `${g.seeds} ${g.maxTurns.toString()}`;
    return {
      records,
      get: (g) => records.get(key(g)) ?? [],
      set: (g, groups) => {
        if (groups.length > (records.get(key(g))?.length ?? 0)) records.set(key(g), groups);
      },
    };
  };
  const ladder = (pool: GameRunner<RiskGameSpec, RiskGameResult>, cache?: LadderCache, margin = ladderSpec.margin) =>
    playLadder({ ...ladderSpec, margin, pool, cache });

  it("rates the same from the cache, playing only the groups it lacks", async () => {
    const cache = memoryCache();
    const first = await ladder(serialRunner(), cache);
    expect(first.cached).toBe(0);
    expect(cache.records.size).toBe(ladderMatchups(LABELS, [3, 4]).length);

    const warm = counting();
    const again = await ladder(warm.pool, cache);
    expect(warm.played()).toBe(0);
    expect(again.cached).toBe(first.tallies.reduce((s, t) => s + t.groups, 0));
    expect({ ...again, cached: 0 }).toEqual(first);

    const [forgotten] = cache.records.keys();
    cache.records.delete(forgotten);
    const seeds: string[] = [];
    const runner = serialRunner();
    const watched = { ...runner, run: (specs: readonly RiskGameSpec[]) => (seeds.push(...specs.map((s) => s.seed)), runner.run(specs)) };
    expect({ ...(await ladder(watched, cache)), cached: 0 }).toEqual(first);
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.every((s) => s.startsWith(`${forgotten.split(" ")[0]}-`))).toBe(true);
  });

  it("rates the same from a cache that holds more groups than it needs, or fewer", async () => {
    const fresh = await ladder(serialRunner());
    const deep = memoryCache();
    await ladder(serialRunner(), deep, ladderSpec.margin / 2);
    const fromDeep = counting();
    expect({ ...(await ladder(fromDeep.pool, deep)), cached: 0 }).toEqual(fresh);
    expect(fromDeep.played()).toBe(0);

    const shallow = memoryCache();
    await ladder(serialRunner(), shallow, ladderSpec.margin * 2);
    const fromShallow = counting();
    expect({ ...(await ladder(fromShallow.pool, shallow)), cached: 0 }).toEqual(fresh);
    expect(fromShallow.played()).toBeGreaterThan(0);
  });

  it("keeps a matchup's groups only up to the first whose games threw", async () => {
    const cache = memoryCache();
    const runner = serialRunner();
    const throwing = {
      ...runner,
      run: async (specs: readonly RiskGameSpec[]) =>
        (await runner.run(specs)).map((r) => (r.seed === "lad:cand-in-base:3p-2" ? { ...r, error: "illegal move" } : r)),
    };
    const report = await ladder(throwing, cache);
    expect(report.errors).toBeGreaterThan(0);
    expect(cache.records.get("lad:cand-in-base:3p 600")?.length).toBe(1);
    expect(cache.records.size).toBe(ladderMatchups(LABELS, [3, 4]).length);
  });
});
