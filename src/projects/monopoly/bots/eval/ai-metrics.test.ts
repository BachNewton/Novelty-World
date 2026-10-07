import { describe, expect, it } from "vitest";
import type { AiDecisionRecord } from "../../types";
import { recordLine, summarizeBySeat, timingSummary, type LoggedAiDecision } from "./ai-metrics";

function rec(decision: AiDecisionRecord["decision"], ms: number): AiDecisionRecord {
  return {
    decision,
    version: "llm-v2",
    model: "m.gguf",
    ms,
    thinkMs: null,
    answerMs: ms,
    promptTokens: 1000,
    completionTokens: 50,
    thinkHitBudget: null,
  };
}

describe("AI decision timing", () => {
  it("summarizes with nearest-rank percentiles", () => {
    const records = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => rec("buy", s * 1000));
    expect(timingSummary(records)).toEqual({ count: 10, medianMs: 5000, p90Ms: 9000 });
    expect(timingSummary([])).toEqual({ count: 0, medianMs: 0, p90Ms: 0 });
  });

  it("splits by seat and by decision kind", () => {
    const logged: LoggedAiDecision[] = [
      { turn: 1, playerId: "p2", failed: false, record: rec("buy", 2000) },
      { turn: 2, playerId: "p2", failed: false, record: rec("turn-start", 20000) },
      { turn: 3, playerId: "p3", failed: true, record: rec("auction", 1000) },
    ];
    const summary = summarizeBySeat(logged);
    expect(summary.get("p2")?.overall.count).toBe(2);
    expect(summary.get("p2")?.byDecision.get("turn-start")).toEqual({ count: 1, medianMs: 20000, p90Ms: 20000 });
    expect(summary.get("p3")?.byDecision.get("auction")?.count).toBe(1);
  });

  it("writes a record as one review line", () => {
    expect(recordLine({ ...rec("trade-vote", 12000), thinkMs: 9000, answerMs: 3000, thinkHitBudget: true })).toBe(
      "llm-v2 · m.gguf · trade-vote · 12.0s · think 9.0s / answer 3.0s · 1000 in / 50 out tokens · thinking hit its budget",
    );
  });
});
