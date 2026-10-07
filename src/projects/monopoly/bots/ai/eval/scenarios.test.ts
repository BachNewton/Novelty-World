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

describe("scenario kinds", () => {
  it("gives every error scenario an error check, and no judgment scenario one", () => {
    for (const s of SCENARIOS) expect(s.error !== undefined).toBe(s.kind === "error");
  });

  it("disguises every error family with at least one variant", () => {
    const families = new Map<string, number>();
    for (const s of SCENARIOS.filter((x) => x.kind === "error")) {
      const family = s.id.split("-").slice(0, 3).join("-");
      families.set(family, (families.get(family) ?? 0) + 1);
    }
    for (const [family, count] of families) expect(count, family).toBeGreaterThan(1);
  });
});

describe("scenario checks, on canned answers", () => {
  const llmV2 = { profile: "ai:local" as const, version: "llm-v2" as const };

  it("errors when the set-completing lot goes to auction, and records the choice", async () => {
    const yes = await runScenario(byId("buy-completes-set"), llmV2, fakeModel({ ...NOTES, choice: "buy", mortgage: [] }), 0, null);
    const no = await runScenario(byId("buy-completes-set-pink"), llmV2, fakeModel({ ...NOTES, choice: "auction", mortgage: [] }), 0, null);
    expect(yes.check).toEqual({ kind: "error", choice: "buy", error: null });
    expect(no.check).toEqual({ kind: "error", choice: "auction", error: "sent the lot that completes its own set to auction" });
  });

  it("records a judgment choice without grading it", async () => {
    const wild = await runScenario(byId("auction-boardwalk"), llmV2, fakeModel({ ...NOTES, maxBid: 1400 }), 0, null);
    expect(wild.check).toEqual({ kind: "judgment", choice: "max $1400", error: null });
  });

  it("errors on a sale below the mortgage value, not on a decline", async () => {
    const accept = await runScenario(byId("vote-below-mortgage-railroad"), llmV2, fakeModel({ ...NOTES, vote: "accept" }), 0, null);
    const decline = await runScenario(byId("vote-below-mortgage-railroad"), llmV2, fakeModel({ ...NOTES, vote: "decline" }), 0, null);
    expect(accept.check?.error).toBe("sold Reading Railroad for under its $100 mortgage value");
    expect(decline.check).toEqual({ kind: "error", choice: "decline", error: null });
  });

  it("counts an unusable answer as an error even in a judgment scenario", async () => {
    const record = await runScenario(byId("buy-first-of-set"), llmV2, fakeModel({ ...NOTES, choice: "maybe" }), 2, null);
    expect(record.check?.kind).toBe("judgment");
    expect(record.check?.choice).toBe("unusable");
    expect(record.check?.error).toMatch(/^unusable answer:/);
    expect(record.source).toEqual({ kind: "scenario", scenario: "buy-first-of-set", rep: 2 });
    expect(record.request?.user).toContain("St. James");
    expect(record.result).toMatchObject({ ok: true, raw: expect.stringContaining("maybe") as unknown as string });
  });

  it("leaves the houses standing when mortgages cover the debt", async () => {
    const record = await runScenario(byId("debt-keeps-houses"), llmV2, fakeModel({ ...NOTES, mortgage: [5, 28], sellBuildings: [] }), 0, null);
    expect(record.settle?.kind).toBe("commit");
    expect(record.check?.error).toBeNull();
    expect(record.check?.choice).toBe("mortgages Reading Railroad + Water Works, raises $175");
  });
});

describe("scoreboard", () => {
  it("takes nearest-rank quantiles", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([3, 1, 2, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });

  it("counts errors only, and tallies choices", () => {
    const scenario = byId("buy-completes-set");
    const record = (error: string | null) => ({
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
      check: { kind: "error" as const, choice: error ? "auction" : "buy", error },
    });
    const board = scoreboard("llm-v2", "now", 2, null, [scenario], [record(null), record("sent it to auction")]);
    expect(board.scenarios[0]).toMatchObject({ errors: 1, runs: 2, choices: { buy: 1, auction: 1 }, errorReasons: ["sent it to auction"] });
    expect(board.errorScenarios).toEqual({ errors: 1, runs: 2 });
    expect(board.byPhase.early).toEqual({ errors: 1, runs: 2 });
  });
});
