import { describe, expect, it } from "vitest";
import type { AiDecisionRecord } from "../../../types";
import { claimAi } from "../decide";
import type { CallMetrics, ModelAdapter, ModelResult } from "../model/adapter";
import { aiStrategyId } from "../strategy";
import { AI_VERSION_LABELS } from "../versions";
import { AI } from "./board";
import { runScenario } from "./run";
import { SCENARIOS } from "./scenarios";
import { quantile, scoreboard } from "./scoreboard";

const METRICS: CallMetrics = { ms: 1000, thinkMs: null, answerMs: 1000, promptTokens: 10, completionTokens: 5, thinkHitBudget: null };
const NOTES = { privateNote: "thinking", publicNote: "Hello.", plan: "Win." };

function fakeModel(answer: unknown): ModelAdapter {
  const result: ModelResult = { ok: true, answer, raw: JSON.stringify(answer), thoughts: "", metrics: METRICS };
  return { complete: () => Promise.resolve(result), identify: () => Promise.resolve("fake.gguf") };
}

const byId = (id: string) => {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`no scenario ${id}`);
  return scenario;
};

describe("scenario positions", () => {
  it("has unique ids", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  for (const version of AI_VERSION_LABELS) {
    for (const scenario of SCENARIOS) {
      it(`${version}: ${scenario.id} owes exactly "${scenario.decision}"`, () => {
        const state = scenario.build(aiStrategyId({ profile: "ai:local", version }));
        expect(claimAi(state, AI)?.decision).toBe(scenario.decision);
      });
    }
  }
});

describe("scenario checks, on canned answers", () => {
  const llmV2 = { profile: "ai:local" as const, version: "llm-v2" as const };

  it("passes a buy that completes the set and fails sending it to auction", async () => {
    const yes = await runScenario(byId("buy-completes-set"), llmV2, fakeModel({ ...NOTES, choice: "buy", mortgage: [] }), 0, null);
    const no = await runScenario(byId("buy-completes-set"), llmV2, fakeModel({ ...NOTES, choice: "auction", mortgage: [] }), 0, null);
    expect(yes.check?.pass).toBe(true);
    expect(no.check).toEqual({ pass: false, reason: "sent it to auction" });
  });

  it("judges an auction maximum against the scenario's line", async () => {
    const sane = await runScenario(byId("auction-boardwalk-trap"), llmV2, fakeModel({ ...NOTES, maxBid: 450 }), 0, null);
    const wild = await runScenario(byId("auction-boardwalk-trap"), llmV2, fakeModel({ ...NOTES, maxBid: 1400 }), 0, null);
    expect(sane.check?.pass).toBe(true);
    expect(wild.check).toEqual({ pass: false, reason: "maximum $1400 is over $600" });
  });

  it("fails an accepted lowball and passes a decline", async () => {
    const accept = await runScenario(byId("vote-lowball-railroad"), llmV2, fakeModel({ ...NOTES, vote: "accept" }), 0, null);
    const decline = await runScenario(byId("vote-lowball-railroad"), llmV2, fakeModel({ ...NOTES, vote: "decline" }), 0, null);
    expect(accept.check?.pass).toBe(false);
    expect(decline.check?.pass).toBe(true);
  });

  it("fails an unusable answer with the settle step's reason, and records the call", async () => {
    const record = await runScenario(byId("buy-completes-set"), llmV2, fakeModel({ ...NOTES, choice: "maybe" }), 2, null);
    expect(record.check?.pass).toBe(false);
    expect(record.check?.reason).toMatch(/^unusable answer:/);
    expect(record.source).toEqual({ kind: "scenario", scenario: "buy-completes-set", rep: 2 });
    expect(record.request?.user).toContain("Connecticut");
    expect(record.result).toMatchObject({ ok: true, raw: expect.stringContaining("maybe") as unknown as string });
  });

  it("leaves the debt houses standing when mortgages cover it", async () => {
    const record = await runScenario(
      byId("debt-keeps-the-houses"),
      llmV2,
      fakeModel({ ...NOTES, mortgage: [5, 28], sellBuildings: [] }),
      0,
      null,
    );
    expect(record.settle?.kind).toBe("commit");
    expect(record.check?.pass).toBe(true);
  });
});

describe("scoreboard", () => {
  it("takes nearest-rank quantiles", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([3, 1, 2, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });

  it("tallies passes per scenario, phase and decision", () => {
    const scenario = byId("buy-completes-set");
    const record = (pass: boolean) => ({
      source: { kind: "scenario" as const, scenario: scenario.id, rep: 0 },
      at: "",
      seat: AI,
      decision: "buy" as AiDecisionRecord["decision"],
      version: "llm-v2",
      server: null,
      request: null,
      result: null,
      metrics: METRICS,
      settle: null,
      check: { pass, reason: pass ? "bought" : "sent it to auction" },
    });
    const board = scoreboard("llm-v2", "now", 2, null, [scenario], [record(true), record(false)]);
    expect(board.scenarios[0]).toMatchObject({ passes: 1, runs: 2, failures: ["sent it to auction"] });
    expect(board.byPhase.early).toEqual({ passes: 1, runs: 2 });
    expect(board.byDecision.buy).toEqual({ passes: 1, runs: 2 });
  });
});
