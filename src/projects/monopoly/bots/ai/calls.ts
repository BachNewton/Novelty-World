import type { AiDecision, AiDecisionRef } from "../../types";
import type { Settled } from "./decide";
import { recordedCalls, type AiCallRecord, type MadeCall, type ServerInfo } from "./eval/record";
import type { CallMetrics } from "./model/adapter";

// A live game's model calls, one row each in `monopoly_ai_calls` (see
// supabase/monopoly-ai.sql). The row is the shared call record as it is, plus
// the few columns a review queries by: which game and seat, which decision and
// where it landed in the log, and how it ended.

/** How a live call ended: committed to the board, overtaken by the game,
 *  failed (the seat stalled), or held while the table was paused. */
export type CallOutcome = "commit" | "stale" | "fail" | "held";

/** A `monopoly_ai_calls` row as the route inserts it. */
export interface AiCallRow {
  game_id: string;
  seat: string;
  decision: string;
  version: string;
  model: string | null;
  /** Where the decision's note or failure sits in the log (null when it left
   *  none), so flags join to the call that made it. */
  turn: number | null;
  event_index: number | null;
  outcome: CallOutcome;
  outcome_reason: string | null;
  ms: number | null;
  record: AiCallRecord;
}

export function aiCallRow(
  gameId: string,
  record: AiCallRecord,
  ref: AiDecisionRef | null,
  outcome: CallOutcome,
  reason: string | null,
): AiCallRow {
  return {
    game_id: gameId,
    seat: record.seat,
    decision: record.decision,
    version: record.version,
    model: record.server?.model ?? null,
    turn: ref?.turn ?? null,
    event_index: ref?.index ?? null,
    outcome,
    outcome_reason: reason,
    ms: record.metrics?.ms ?? null,
    record,
  };
}

/** The full record of one live call: what was sent and to which server, what
 *  came back, and what the settle step made of it (null while held). */
export function gameCallRecord(c: {
  gameId: string;
  turn: number;
  seat: string;
  decision: AiDecision;
  version: string;
  server: ServerInfo | null;
  /** The decision's calls, in order (none when it never reached the model). */
  calls: readonly MadeCall[];
  /** What the decision cost over all its calls. */
  metrics: CallMetrics | null;
  settle: { kind: Settled["kind"]; reason: string | null } | null;
  at: string;
}): AiCallRecord {
  return {
    source: { kind: "game", game: c.gameId, turn: c.turn },
    at: c.at,
    seat: c.seat,
    decision: c.decision,
    version: c.version,
    server: c.server,
    ...recordedCalls(c.calls),
    metrics: c.calls.length > 0 ? c.metrics : null,
    settle: c.settle,
  };
}
