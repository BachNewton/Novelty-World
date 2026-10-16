import { runState, type LiveRow, type RunState } from "@/shared/lib/bot-lab/live-row";

/** Runs as the page lists them: the live ones first, then every other, each newest first. */
export function orderRuns(rows: readonly LiveRow[], nowMs: number): { live: LiveRow[]; ended: LiveRow[] } {
  const newestFirst = [...rows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return {
    live: newestFirst.filter((r) => runState(r, nowMs) === "running"),
    ended: newestFirst.filter((r) => runState(r, nowMs) !== "running"),
  };
}

/** A row heard over Realtime, merged into the rows held: newer writes replace older ones. */
export function mergeRow(rows: readonly LiveRow[], row: LiveRow): LiveRow[] {
  const held = rows.find((r) => r.id === row.id);
  if (held && Date.parse(held.updated_at) > Date.parse(row.updated_at)) return [...rows];
  return [...rows.filter((r) => r.id !== row.id), row];
}

/** How long the run has played: to now while it runs, to its last write once it has ended or gone quiet. */
export function elapsedMs(row: LiveRow, state: RunState, nowMs: number): number {
  const record = row.result?.record;
  if (record) return record.wallSeconds * 1000;
  const end = state === "running" ? nowMs : Date.parse(row.updated_at);
  return Math.max(0, end - Date.parse(row.started_at));
}

/** A duration at the grain worth reading: "42s", "7m 05s", "3h 12m". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (s < 60) return `${s.toString()}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m.toString()}m ${pad(s % 60)}s`;
  return `${Math.floor(m / 60).toString()}h ${pad(m % 60)}m`;
}

/** A rating with its sign. */
export function formatElo(elo: number): string {
  return `${elo >= 0 ? "+" : "−"}${Math.abs(Math.round(elo)).toString()}`;
}

export const percent = (x: number): string => `${Math.round(100 * x).toString()}%`;
