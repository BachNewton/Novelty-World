import type { AiCallRecord, ServerInfo } from "./record";
import type { Phase, Scenario } from "./scenario";

// A run's results, summarised: how often each scenario passed over its
// repetitions, how long the calls took, and totals by phase and decision. Pure,
// so the same records always give the same scoreboard.

export interface ScenarioScore {
  id: string;
  phase: Phase;
  decision: string;
  passes: number;
  runs: number;
  medianMs: number | null;
  /** Each failing repetition's reason, as the check gave it. */
  failures: string[];
}

export interface Tally {
  passes: number;
  runs: number;
}

export interface Scoreboard {
  version: string;
  at: string;
  reps: number;
  server: ServerInfo | null;
  scenarios: ScenarioScore[];
  total: Tally;
  byPhase: Record<string, Tally>;
  byDecision: Record<string, Tally>;
  timing: {
    medianMs: number | null;
    p90Ms: number | null;
    /** Calls whose thinking pass ran out of budget, of those that thought. */
    thinkHitBudget: Tally;
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
    return {
      id: scenario.id,
      phase: scenario.phase,
      decision: scenario.decision,
      passes: mine.filter((r) => r.check?.pass === true).length,
      runs: mine.length,
      medianMs: quantile(msOf(mine), 0.5),
      failures: mine.flatMap((r) => (r.check && !r.check.pass ? [r.check.reason] : [])),
    };
  });
  const tally = (key: (s: ScenarioScore) => string): Record<string, Tally> => {
    const out: Record<string, Tally> = {};
    for (const s of scores) {
      const t = (out[key(s)] ??= { passes: 0, runs: 0 });
      t.passes += s.passes;
      t.runs += s.runs;
    }
    return out;
  };
  const thought = records.filter((r) => r.metrics?.thinkHitBudget !== null && r.metrics?.thinkHitBudget !== undefined);
  return {
    version,
    at,
    reps,
    server,
    scenarios: scores,
    total: {
      passes: scores.reduce((n, s) => n + s.passes, 0),
      runs: scores.reduce((n, s) => n + s.runs, 0),
    },
    byPhase: tally((s) => s.phase),
    byDecision: tally((s) => s.decision),
    timing: {
      medianMs: quantile(msOf(records), 0.5),
      p90Ms: quantile(msOf(records), 0.9),
      thinkHitBudget: { passes: thought.filter((r) => r.metrics?.thinkHitBudget === true).length, runs: thought.length },
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

/** The scoreboard as a printed table: one row per scenario, then totals. */
export function renderScoreboard(board: Scoreboard): string {
  const secs = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`);
  const rate = (t: Tally): string => `${String(t.passes)}/${String(t.runs)}`;
  const lines = [
    `${board.version}  ${board.at}  reps=${String(board.reps)}  model=${board.server?.model ?? "?"}  slots=${String(board.server?.slots ?? "?")}`,
    "",
    `${"scenario".padEnd(38)}${"phase".padEnd(7)}${"pass".padEnd(7)}median`,
  ];
  for (const s of board.scenarios) {
    lines.push(`${s.id.padEnd(38)}${s.phase.padEnd(7)}${rate(s).padEnd(7)}${secs(s.medianMs)}`);
    for (const reason of new Set(s.failures)) lines.push(`    ✗ ${reason}`);
  }
  lines.push("");
  lines.push(`total ${rate(board.total)}   ` + Object.entries(board.byPhase).map(([k, t]) => `${k} ${rate(t)}`).join("  "));
  lines.push("by decision: " + Object.entries(board.byDecision).map(([k, t]) => `${k} ${rate(t)}`).join("  "));
  lines.push(
    `timing: median ${secs(board.timing.medianMs)}, p90 ${secs(board.timing.p90Ms)}, thinking hit budget ${rate(board.timing.thinkHitBudget)}`,
  );
  return lines.join("\n");
}
