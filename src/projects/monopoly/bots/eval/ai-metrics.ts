import type { AiDecisionRecord, GameState } from "../../types";

/** One AI decision as the log recorded it: whose, and how it was made. */
export interface LoggedAiDecision {
  turn: number;
  playerId: string;
  failed: boolean;
  record: AiDecisionRecord;
}

/** Every AI decision in a game's log, in order: the answered ones (on their
 *  bot-note) and the failed ones. */
export function loggedAiDecisions(state: GameState): LoggedAiDecision[] {
  const decisions: LoggedAiDecision[] = [];
  for (const group of state.turns) {
    for (const event of group.events) {
      if ((event.kind === "bot-note" || event.kind === "ai-failed") && event.ai !== undefined) {
        decisions.push({
          turn: group.turn,
          playerId: event.playerId,
          failed: event.kind === "ai-failed",
          record: event.ai,
        });
      }
    }
  }
  return decisions;
}

export interface TimingSummary {
  count: number;
  medianMs: number;
  p90Ms: number;
}

/** Count, median and 90th-percentile time of a set of decisions (nearest-rank
 *  percentiles, so every figure is a time that actually happened). */
export function timingSummary(records: readonly AiDecisionRecord[]): TimingSummary {
  const ms = records.map((r) => r.ms).sort((a, b) => a - b);
  const rank = (p: number): number => (ms.length === 0 ? 0 : ms[Math.max(0, Math.ceil(p * ms.length) - 1)]);
  return { count: ms.length, medianMs: rank(0.5), p90Ms: rank(0.9) };
}

/** Per seat: its overall timing, and its timing by decision kind. */
export function summarizeBySeat(
  decisions: readonly LoggedAiDecision[],
): Map<string, { overall: TimingSummary; byDecision: Map<string, TimingSummary> }> {
  const seats = new Map<string, LoggedAiDecision[]>();
  for (const d of decisions) seats.set(d.playerId, [...(seats.get(d.playerId) ?? []), d]);
  const summary = new Map<string, { overall: TimingSummary; byDecision: Map<string, TimingSummary> }>();
  for (const [seat, own] of seats) {
    const kinds = new Map<string, AiDecisionRecord[]>();
    for (const d of own) kinds.set(d.record.decision, [...(kinds.get(d.record.decision) ?? []), d.record]);
    summary.set(seat, {
      overall: timingSummary(own.map((d) => d.record)),
      byDecision: new Map([...kinds].map(([kind, records]) => [kind, timingSummary(records)])),
    });
  }
  return summary;
}

/** One decision's record as a review line: version, model, decision, time and
 *  its split, tokens, and whether thinking ran out of budget. */
export function recordLine(record: AiDecisionRecord): string {
  const parts = [record.version, record.model ?? "model unnamed", record.decision, seconds(record.ms)];
  if (record.thinkMs !== null && record.answerMs !== null) {
    parts.push(`think ${seconds(record.thinkMs)} / answer ${seconds(record.answerMs)}`);
  }
  if (record.promptTokens !== null || record.completionTokens !== null) {
    parts.push(`${String(record.promptTokens ?? "?")} in / ${String(record.completionTokens ?? "?")} out tokens`);
  }
  if (record.thinkHitBudget === true) parts.push("thinking hit its budget");
  return parts.join(" · ");
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
