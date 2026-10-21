import { describe, expect, it } from "vitest";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { fakeGame } from "./fake-game";
import { planRiskGauntlet, runRiskGauntlet, type RiskGauntletOptions, type RiskGauntletReport } from "./gauntlet";
import { ladderGamesToPlay, playLadder, type LadderOptions } from "./ratings";
import { playRemotely } from "./remote-kit";

// A run played in rounds on several machines (GitHub Actions) must report exactly
// what it reports played here at once: the same verdicts at the same stop points, the
// same tallies and the same Elo. Only `generated`, the games a pairing played past its
// stop point, tells how the run was cut, as it does between batch sizes here.

const gauntlet: Omit<RiskGauntletOptions, "pool"> = {
  candidate: "cand",
  base: "base",
  field: ["base", "other"],
  players: [3, 4],
  formats: ["one-in", "one-out"],
  prefix: "remote",
  margin: 30,
  alpha: 0.05,
  beta: 0.05,
  maxDecisive: 150,
  fieldGroups: 6,
  maxTurns: 600,
};

const cut = (r: RiskGauntletReport) => ({ ...r, pairings: r.pairings.map((p) => ({ ...p, generated: 0 })) });

describe("a gauntlet played remotely", () => {
  it("reports what it reports played here", async () => {
    const local = await runRiskGauntlet({ ...gauntlet, batchGames: 12, pool: inlineRunner(fakeGame) });
    const { games, rounds } = await playRemotely((g) => planRiskGauntlet(gauntlet, (s) => g.store.get(s), 24).specs, fakeGame, 5, 10);
    const remote = await runRiskGauntlet({ ...gauntlet, batchGames: 1, pool: games.store.runner() });
    expect(cut(remote)).toEqual(cut(local));
    // A run that exercises every path: several rounds, split over several machines,
    // decided pairings and one that ran to the cap.
    expect(rounds.length).toBeGreaterThan(2);
    expect(Math.max(...rounds)).toBe(5);
    expect(local.pairings.some((p) => p.verdict === "inconclusive")).toBe(true);
    expect(new Set(local.pairings.map((p) => p.verdict)).size).toBeGreaterThan(1);
  });

  it("asks for no game once every pairing has decided", async () => {
    const { games } = await playRemotely((g) => planRiskGauntlet(gauntlet, (s) => g.store.get(s), 24).specs, fakeGame, 3, 10);
    const done = planRiskGauntlet(gauntlet, (s) => games.store.get(s), 24);
    expect(done.specs).toEqual([]);
    expect(done.progress.every((p) => p.done)).toBe(true);
  });

  it("fails loudly when its rounds left a game it needs unplayed", async () => {
    const { games } = await playRemotely((g) => (g.rounds === 0 ? planRiskGauntlet(gauntlet, (s) => g.store.get(s), 24).specs : []), fakeGame, 3, 10);
    await expect(runRiskGauntlet({ ...gauntlet, batchGames: 1, pool: games.store.runner() })).rejects.toThrow(/was never played/);
  });
});

describe("a ladder played remotely", () => {
  const ladder: Omit<LadderOptions, "pool"> = { labels: ["cand", "base", "other"], players: [3, 4], groups: 5, prefix: "lad", maxTurns: 600 };

  it("rates what it rates played here, in one round", async () => {
    const local = await playLadder({ ...ladder, pool: inlineRunner(fakeGame) });
    const { games, rounds } = await playRemotely((g) => ladderGamesToPlay(ladder, (s) => g.store.get(s) !== undefined), fakeGame, 4, 10);
    expect(rounds).toEqual([4]);
    expect(await playLadder({ ...ladder, pool: games.store.runner() })).toEqual(local);
  });
});
