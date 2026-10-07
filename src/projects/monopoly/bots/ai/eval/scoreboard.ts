import type { AiCallRecord, ServerInfo } from "./record";
import type { Phase, Scenario, ScenarioKind } from "./scenario";

// A run's results, summarised. Only ERRORS are counted against a version: the
// totals are errors per answer, by phase and decision. What the seat chose in
// judgment scenarios is listed separately, as the spread of its choices across
// repetitions, and is never pass or fail. The suite finds errors fast; whether
// a version plays better is for real games to decide. Pure: the same records
// always give the same scoreboard.

export interface ScenarioScore {
  id: string;
  kind: ScenarioKind;
  phase: Phase;
  decision: string;
  runs: number;
  /** Answers with an objective error (in a judgment scenario, only unusable
   *  answers count). */
  errors: number;
  /** Each error, as the scenario named it. */
  errorReasons: string[];
  /** How often each choice was made. */
  choices: Record<string, number>;
  medianMs: number | null;
}

/** Errors out of answers. */
export interface ErrorTally {
  errors: number;
  runs: number;
}

export interface Scoreboard {
  version: string;
  at: string;
  reps: number;
  server: ServerInfo | null;
  scenarios: ScenarioScore[];
  /** Every answer, error scenarios and judgment ones alike. */
  errors: ErrorTally;
  /** The gated part: answers to error scenarios only. */
  errorScenarios: ErrorTally;
  byPhase: Record<string, ErrorTally>;
  byDecision: Record<string, ErrorTally>;
  timing: {
    medianMs: number | null;
    p90Ms: number | null;
    /** Calls whose thinking pass ran out of budget, of those that thought. */
    thinkHitBudget: { hit: number; thought: number };
  };
}

export function scoreboard(
  version: string,
  at: string,
  reps: number,
  server: ServerInfo | null,
  scenarios: readonly Scenario[],
  records: readonly AiCallRecord[],
): Scoreboard {
  const scores = scenarios.map((scenario): ScenarioScore => {
    const mine = records.filter((r) => r.source.kind === "scenario" && r.source.scenario === scenario.id);
    const choices: Record<string, number> = {};
    for (const r of mine) if (r.check) choices[r.check.choice] = (choices[r.check.choice] ?? 0) + 1;
    const errorReasons = mine.flatMap((r) => (r.check?.error ? [r.check.error] : []));
    return {
      id: scenario.id,
      kind: scenario.kind,
      phase: scenario.phase,
      decision: scenario.decision,
      runs: mine.length,
      errors: errorReasons.length,
      errorReasons,
      choices,
      medianMs: quantile(msOf(mine), 0.5),
    };
  });
  const sum = (of: readonly ScenarioScore[]): ErrorTally => ({
    errors: of.reduce((n, s) => n + s.errors, 0),
    runs: of.reduce((n, s) => n + s.runs, 0),
  });
  const group = (key: (s: ScenarioScore) => string): Record<string, ErrorTally> => {
    const out: Record<string, ErrorTally> = {};
    for (const k of new Set(scores.map(key))) out[k] = sum(scores.filter((s) => key(s) === k));
    return out;
  };
  const thought = records.filter((r) => typeof r.metrics?.thinkHitBudget === "boolean");
  return {
    version,
    at,
    reps,
    server,
    scenarios: scores,
    errors: sum(scores),
    errorScenarios: sum(scores.filter((s) => s.kind === "error")),
    byPhase: group((s) => s.phase),
    byDecision: group((s) => s.decision),
    timing: {
      medianMs: quantile(msOf(records), 0.5),
      p90Ms: quantile(msOf(records), 0.9),
      thinkHitBudget: { hit: thought.filter((r) => r.metrics?.thinkHitBudget === true).length, thought: thought.length },
    },
  };
}

function msOf(records: readonly AiCallRecord[]): number[] {
  return records.flatMap((r) => (r.metrics && r.metrics.ms > 0 ? [r.metrics.ms] : []));
}

/** The q-quantile of the values (nearest rank), or null when there are none. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

/** The scoreboard as printed text: errors first (the gated part), then the
 *  judgment scenarios' spread of choices, then timing. */
export function renderScoreboard(board: Scoreboard): string {
  const secs = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`);
  const tally = (t: ErrorTally): string => `${String(t.errors)}/${String(t.runs)}`;
  const spread = (choices: Record<string, number>): string =>
    Object.entries(choices)
      .sort(([, a], [, b]) => b - a)
      .map(([choice, n]) => `${String(n)}× ${choice}`)
      .join(" | ");
  const lines = [
    `${board.version}  ${board.at}  reps=${String(board.reps)}  model=${board.server?.model ?? "?"}  slots=${String(board.server?.slots ?? "?")}`,
    "",
    "ERRORS (gated)",
    `${"scenario".padEnd(42)}${"errors".padEnd(8)}median`,
  ];
  for (const s of board.scenarios.filter((x) => x.kind === "error")) {
    lines.push(`${s.id.padEnd(42)}${tally(s).padEnd(8)}${secs(s.medianMs)}`);
    for (const reason of new Set(s.errorReasons)) lines.push(`    ✗ ${reason}`);
    lines.push(`    choices: ${spread(s.choices)}`);
  }
  lines.push("", "JUDGMENT (recorded, not graded)");
  for (const s of board.scenarios.filter((x) => x.kind === "judgment")) {
    lines.push(`${s.id.padEnd(42)}${s.errors > 0 ? `${String(s.errors)} unusable  ` : ""}${secs(s.medianMs)}`);
    for (const reason of new Set(s.errorReasons)) lines.push(`    ✗ ${reason}`);
    lines.push(`    ${spread(s.choices)}`);
  }
  lines.push("");
  lines.push(`errors: ${tally(board.errorScenarios)} in error scenarios, ${tally(board.errors)} across every answer`);
  lines.push("by phase: " + Object.entries(board.byPhase).map(([k, t]) => `${k} ${tally(t)}`).join("  "));
  lines.push("by decision: " + Object.entries(board.byDecision).map(([k, t]) => `${k} ${tally(t)}`).join("  "));
  lines.push(
    `timing: median ${secs(board.timing.medianMs)}, p90 ${secs(board.timing.p90Ms)}, thinking hit budget ${String(board.timing.thinkHitBudget.hit)}/${String(board.timing.thinkHitBudget.thought)}`,
  );
  return lines.join("\n");
}
