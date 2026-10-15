import { describe, expect, it } from "vitest";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { runRiskGauntlet, type RiskGauntletOptions } from "./gauntlet";
import { runSpec } from "./runner";

// A small gauntlet end to end on one thread: greedy against the random floor at 3
// players, both mixtures. Greedy wins every game, so each SPRT stops within a few
// dozen games.

const options = (batchGames: number, formats: RiskGauntletOptions["formats"]): RiskGauntletOptions => ({
  candidate: "greedy",
  base: "random",
  field: ["random"],
  players: [3],
  formats,
  prefix: "smoke",
  margin: 30,
  alpha: 0.05,
  beta: 0.05,
  maxDecisive: 2000,
  fieldGroups: 0,
  maxTurns: 600,
  batchGames,
  pool: inlineRunner(runSpec),
});

describe("runRiskGauntlet", () => {
  it("crowns greedy over the random floor in both mixtures", async () => {
    const report = await runRiskGauntlet(options(6, ["one-in", "one-out"]));
    expect(report.accepted).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.pairings.map((p) => p.verdict)).toEqual(["better", "better"]);
    for (const p of report.pairings) {
      expect(p.games % 3).toBe(0);
      expect(p.capRate).toBe(0);
      expect(p.winShare.share).toBe(1);
    }
    expect(report.pairings.map((p) => p.par)).toEqual([1 / 3, 2 / 3]);
    expect(report.elo["greedy"]).toBeGreaterThan(0);
  });

  it("reads the same whatever the batch size", async () => {
    const small = await runRiskGauntlet(options(3, ["one-in"]));
    const large = await runRiskGauntlet(options(30, ["one-in"]));
    const stripped = (r: typeof small) => r.pairings.map((p) => ({ ...p, generated: 0 }));
    expect(stripped(large)).toEqual(stripped(small));
    expect(large.finishElo).toEqual(small.finishElo);
  });
});
