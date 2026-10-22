import { describe, expect, it } from "vitest";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { planRiskGauntlet, runRiskGauntlet, type RiskGauntletOptions, type RiskGauntletReport } from "./gauntlet";
import { playRemotely } from "./remote-kit";
import { runSpec } from "./runner";

// The remote run's equality (`remote.test.ts`) on real games: greedy against the
// random floor at 3 players, in rounds of a few groups split over three machines,
// against the same gauntlet played here on one thread.

const gauntlet: Omit<RiskGauntletOptions, "pool"> = {
  candidate: "greedy",
  base: "random",
  field: ["random"],
  players: [3],
  formats: ["one-in", "one-out"],
  prefix: "remote-smoke",
  margin: 30,
  alpha: 0.05,
  beta: 0.05,
  maxDecisive: 2000,
  fieldMaxGroups: 0,
  maxTurns: 600,
};

const cut = (r: RiskGauntletReport) => ({ ...r, pairings: r.pairings.map((p) => ({ ...p, generated: 0 })) });

describe("a real gauntlet played remotely", () => {
  it("reports what it reports played here", async () => {
    const local = await runRiskGauntlet({ ...gauntlet, batchGames: 6, pool: inlineRunner(runSpec) });
    const { games, rounds } = await playRemotely((g) => planRiskGauntlet(gauntlet, (s) => g.store.get(s), 6).specs, runSpec, 3, 2);
    const remote = await runRiskGauntlet({ ...gauntlet, batchGames: 1, pool: games.store.runner() });
    expect(cut(remote)).toEqual(cut(local));
    expect(remote.pairings.map((p) => p.verdict)).toEqual(["better", "better"]);
    expect(rounds.length).toBeGreaterThan(1);
  });
});
