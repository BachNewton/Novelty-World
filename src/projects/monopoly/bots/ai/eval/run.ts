import type { AiDecisionRecord } from "../../../types";
import { askModel, claimAi, failed, settleAnswer, type Settled } from "../decide";
import type { ModelAdapter } from "../model/adapter";
import { aiStrategyId, type AiStrategy } from "../strategy";
import { AI_VERSIONS } from "../versions";
import { AI } from "./board";
import { recordedCalls, recording, type AiCallRecord, type ServerInfo } from "./record";
import { judge, type Judged, type Outcome, type Scenario } from "./scenario";

/** Run one scenario once: build its position for the version, and put the AI
 *  seat's decision through the same claim → ask → settle steps the route uses,
 *  so the suite measures exactly what live games run. Returns the full record
 *  of the call, with what the seat chose and any objective error in it. */
export async function runScenario(
  scenario: Scenario,
  strategy: AiStrategy,
  model: ModelAdapter,
  rep: number,
  server: ServerInfo | null,
): Promise<AiCallRecord> {
  const version = AI_VERSIONS[strategy.version];
  const base = {
    source: { kind: "scenario" as const, scenario: scenario.id, rep },
    at: new Date().toISOString(),
    seat: AI,
    version: version.label,
    server,
  };
  const claim = claimAi(scenario.build(aiStrategyId(strategy)), AI);
  if (claim?.decision !== scenario.decision) {
    const owed = claim ? `owes "${claim.decision}"` : "owes nothing";
    return {
      ...base,
      decision: scenario.decision,
      request: null,
      result: null,
      metrics: null,
      settle: null,
      check: { kind: scenario.kind, choice: "wrong position", error: `the position is wrong: the seat ${owed}` },
    };
  }

  const rec = recording(model);
  const asked = await askModel(rec.adapter, claim.state, AI, claim.decision);
  const settled: Settled = asked.ok
    ? settleAnswer(claim.state, claim.state, AI, claim.decision, asked.answer, asked.record)
    : failed(claim.state, AI, claim.decision, asked.reason, asked.record);
  const verdict: Judged = asked.ok
    ? judged(scenario, claim.state, asked.answer, settled, strategy)
    : { kind: scenario.kind, choice: "no answer", error: `no answer: ${asked.reason}` };
  return {
    ...base,
    decision: claim.decision,
    ...recordedCalls(rec.calls()),
    metrics: metricsOf(asked.record),
    settle: { kind: settled.kind, reason: settled.kind === "fail" ? settled.reason : null },
    check: verdict,
  };
}

function judged(
  scenario: Scenario,
  asked: Outcome["asked"],
  answer: Record<string, unknown>,
  settled: Settled,
  strategy: AiStrategy,
): Judged {
  const spec = AI_VERSIONS[strategy.version].specs[scenario.decision];
  const read = spec?.resolve(asked, AI, answer);
  const resolution = read?.ok ? read.resolution : null;
  return judge(scenario, { asked, seat: AI, answer, resolution, settled });
}

function metricsOf(record: AiDecisionRecord): AiCallRecord["metrics"] {
  return {
    ms: record.ms,
    thinkMs: record.thinkMs,
    answerMs: record.answerMs,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    thinkHitBudget: record.thinkHitBudget,
  };
}
