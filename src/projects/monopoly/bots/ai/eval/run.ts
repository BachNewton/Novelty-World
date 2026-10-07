import type { AiDecisionRecord } from "../../../types";
import { askModel, claimAi, failed, settleAnswer, type Settled } from "../decide";
import type { ModelAdapter } from "../model/adapter";
import { aiStrategyId, type AiStrategy } from "../strategy";
import { AI_VERSIONS } from "../versions";
import { AI } from "./board";
import { recording, resultOf, type AiCallRecord, type ServerInfo } from "./record";
import type { Outcome, Scenario, Verdict } from "./scenario";

/** Run one scenario once: build its position for the version, and put the AI
 *  seat's decision through the same claim → ask → settle steps the route uses,
 *  so the suite measures exactly what live games run. Returns the full record
 *  of the call, with the scenario's verdict. */
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
      check: { pass: false, reason: `the position is wrong: the seat ${owed}` },
    };
  }

  const rec = recording(model);
  const asked = await askModel(rec.adapter, claim.state, AI, claim.decision);
  const call = rec.last();
  const settled: Settled = asked.ok
    ? settleAnswer(claim.state, claim.state, AI, claim.decision, asked.answer, asked.record)
    : failed(claim.state, AI, claim.decision, asked.reason, asked.record);
  const verdict = asked.ok ? judge(scenario, claim.state, asked.answer, settled, strategy) : { pass: false, reason: `no answer: ${asked.reason}` };
  return {
    ...base,
    decision: claim.decision,
    request: call?.request ?? null,
    result: call ? resultOf(call.result) : null,
    metrics: metricsOf(asked.record),
    settle: { kind: settled.kind, reason: settled.kind === "fail" ? settled.reason : null },
    check: verdict,
  };
}

function judge(
  scenario: Scenario,
  asked: Outcome["asked"],
  answer: Record<string, unknown>,
  settled: Settled,
  strategy: AiStrategy,
): Verdict {
  const spec = AI_VERSIONS[strategy.version].specs[scenario.decision];
  const read = spec?.resolve(asked, AI, answer);
  const resolution = read?.ok ? read.resolution : null;
  return scenario.check({ asked, seat: AI, answer, resolution, settled });
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
