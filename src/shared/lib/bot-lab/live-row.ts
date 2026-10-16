import type { PairVerdict } from "./gauntlet";
import type { RunRecord } from "./run-log";

// The row a measuring run keeps live in `bot_lab_runs` (supabase/bot-lab.sql), and
// the pure readings of it the Bot Lab page shows. Browser-safe: no Node imports.

export const LIVE_TABLE = "bot_lab_runs";

/** How often a running run writes its row even when nothing has changed. */
export const HEARTBEAT_MS = 5000;

/** A running row unheard from for this long has lost its run (killed outright,
 *  so it never wrote its end): several heartbeats missed. */
export const STALE_MS = 6 * HEARTBEAT_MS;

export type RunStatus = "running" | "done" | "stopped" | "failed";

/** A row's status as the page shows it: a running row gone quiet is `lost`. */
export type RunState = RunStatus | "lost";

/** A pairing's dual SPRT at its latest round: the two LLRs and the bounds they share. */
export interface LiveSprt {
  llrImprove: number;
  llrRegress: number;
  lower: number;
  upper: number;
}

/** One step of a run: a pairing, a matchup, a table. */
export interface LiveStep {
  /** The table played, in the game's terms, such as "4p". */
  table: string;
  /** For a step that sets one bot against another: the bot measured, the bot it
   *  plays, and how many of the table's seats the measured bot holds. */
  pairing?: { bot: string; against: string; seats: number; players: number };
  /** Games the step plays, where it knows. */
  games?: number;
  /** The measured bot's decisive record, and its par: its seats' share of the wins at equal strength. */
  record?: { wins: number; losses: number; draws: number; par: number };
  sprt?: LiveSprt;
  verdict?: PairVerdict;
  /** A check's pass or fail, such as a determinism check's bit-identical games. */
  check?: boolean;
  done: boolean;
}

export interface LiveProgress {
  games: number;
  decisions: number;
  gamesPerSecond: number;
  /** How far through its known work the run is, 0 to 1. */
  fraction: number | null;
  /** The estimated finish, ISO 8601, once there is something to go on. */
  eta: string | null;
  steps: LiveStep[];
}

export interface LiveResult {
  /** Ratings across the bots, the anchor at 0: a ratings ladder, or a gauntlet's Elo. */
  elo?: { anchor: string; ratings: Record<string, number> };
  /** A gauntlet's crown gate. */
  crown?: {
    candidate: string;
    base: string;
    improvesVsBase: boolean;
    regressions: string[];
    accepted: boolean;
    champion: string;
  };
  /** Games that threw and were left out: 0 in a healthy run. */
  errors?: number;
  /** Why a failed run failed. */
  error?: string;
  /** The run log's record of the run. */
  record?: RunRecord;
}

/** The row as a run writes it; the database stamps `updated_at`. */
export interface LiveRowWrite {
  id: string;
  game: string;
  tool: string;
  bots: string[];
  args: string[];
  seeds: string;
  workers: number;
  status: RunStatus;
  started_at: string;
  progress: LiveProgress;
  result: LiveResult | null;
}

export interface LiveRow extends LiveRowWrite {
  updated_at: string;
}

/** When a run started at `startedMs` and `fraction` through its work at `nowMs`
 *  should finish, at the pace it has kept; null before it has made any progress. */
export function estimateFinish(startedMs: number, nowMs: number, fraction: number | null): number | null {
  if (fraction === null || fraction <= 0) return null;
  if (fraction >= 1) return nowMs;
  return startedMs + (nowMs - startedMs) / fraction;
}

/** The row's status, with a running row whose last write is older than `STALE_MS` read as lost. */
export function runState(row: Pick<LiveRow, "status" | "updated_at">, nowMs: number): RunState {
  if (row.status !== "running") return row.status;
  return nowMs - Date.parse(row.updated_at) > STALE_MS ? "lost" : "running";
}

/** A pairing's SPRT as one needle on a dial from the regression bound (0) to the
 *  improvement bound (1), 0.5 when the evidence leans neither way; and how far
 *  both tests have gone toward a confident tie, 0 to 1. */
export function sprtNeedle(s: LiveSprt): { position: number; even: number } {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const position =
    s.llrImprove >= s.llrRegress ? 0.5 + 0.5 * clamp(s.llrImprove / s.upper) : 0.5 - 0.5 * clamp(s.llrRegress / s.upper);
  const even = clamp(Math.max(s.llrImprove, s.llrRegress) / s.lower);
  return { position, even };
}

/** The measured bot's share of the decisive games; null before any. */
export function winShare(record: { wins: number; losses: number }): number | null {
  const decisive = record.wins + record.losses;
  return decisive === 0 ? null : record.wins / decisive;
}
