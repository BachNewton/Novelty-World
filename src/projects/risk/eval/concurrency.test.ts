import { describe, expect, it } from "vitest";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { createRng } from "@/shared/lib/seeded-random";
import { gauntletTables, runRiskGauntlet, type RiskGauntletOptions } from "./gauntlet";
import { outcomeFor, tableSpecs } from "./parallel";
import { ladderMatchups, playLadder } from "./ratings";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// The gauntlet and the ladder play many tables through the pool at once. What they
// report must not depend on that: a stand-in game (a pure function of its seed and
// seating, like a real one, but instant) is played through a runner that takes one
// call at a time, and through one that finishes concurrent calls in a scrambled
// order, and the reports must match.

const STRENGTH: Readonly<Record<string, number>> = { cand: 1.6, base: 1, other: 0.8 };

function fakeGame(spec: RiskGameSpec): RiskGameResult {
  const rng = createRng(`${spec.seed}|${spec.labels.join(",")}`);
  const n = spec.labels.length;
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels, turns: 30 + Math.floor(rng.next() * 40), decisions: 300 };
  if (rng.next() < 0.05) return { ...base, winner: null, places: spec.labels.map(() => 1) };
  const weights = spec.labels.map((l) => STRENGTH[l]);
  let pick = rng.next() * weights.reduce((s, w) => s + w, 0);
  const winner = weights.findIndex((w) => (pick -= w) < 0);
  const rest = Array.from({ length: n - 1 }, (_, k) => k + 2).sort(() => rng.next() - 0.5);
  return { ...base, winner, places: spec.labels.map((_, seat) => (seat === winner ? 1 : (rest.pop() ?? n))) };
}

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
  fieldGroups: 6,
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
        options(serialRunner(), { base: t.opponent, field: [t.opponent], players: [t.players], formats: [t.format], fieldGroups: 0 }),
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

describe("the ladder's matchups played at once", () => {
  const ladder = (pool: GameRunner<RiskGameSpec, RiskGameResult>) =>
    playLadder({ pool, labels: ["cand", "base", "other"], players: [3, 4], groups: 5, prefix: "lad", maxTurns: 600 });

  it("tally each matchup as it is played alone, and rate the same", async () => {
    const serial = await ladder(serialRunner());
    const scrambled = await ladder(scrambledRunner());
    expect(scrambled).toEqual(serial);
    const matchups = ladderMatchups(["cand", "base", "other"], [3, 4]);
    expect(scrambled.tallies.map(({ lone, rest, players }) => ({ lone, rest, players }))).toEqual(matchups);
    for (const t of scrambled.tallies) {
      const outcomes = tableSpecs(t.lone, t.rest, "one-in", t.players, `lad:${t.lone}-in-${t.rest}:${t.players}p`, 0, 5 * t.players, 600)
        .map(fakeGame)
        .map((r) => outcomeFor(r, t.lone));
      expect(t).toMatchObject({
        wins: outcomes.filter((o) => o === "win").length,
        losses: outcomes.filter((o) => o === "loss").length,
        draws: outcomes.filter((o) => o === "draw").length,
      });
    }
  });
});
