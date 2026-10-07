import type { AiDecision } from "../../../types";
import type { Settled } from "../decide";
import type { CallMetrics, ModelAdapter, ModelRequest, ModelResult } from "../model/adapter";
import { isRecord } from "../spec";
import type { Judged } from "./scenario";

// One record per model call, with everything that shaped the answer: the
// server and model that gave it, the version and sampling that asked, the exact
// prompt and schema, the raw thinking and answer, and what became of it. The
// scenario runner writes these; the slice runner and the planned
// `monopoly_ai_calls` table are meant to store the same shape.

/** The model server as it describes itself (llama.cpp's `/props`), so a record
 *  names the model and setup that answered, not the one we meant to launch. */
export interface ServerInfo {
  model: string | null;
  contextPerSlot: number | null;
  slots: number | null;
  /** The server's default sampling, which applies to whatever a request leaves
   *  unset. */
  defaults: Readonly<Record<string, number>>;
}

/** A model result as the record keeps it: the answer as parsed and as given,
 *  or why there is none. */
export type RecordedResult =
  | { ok: true; answer: unknown; raw: string; thoughts: string }
  | { ok: false; kind: string; message: string };

/** Where a call came from: a scenario repetition, or a decision in a game. */
export type CallSource =
  | { kind: "scenario"; scenario: string; rep: number }
  | { kind: "game"; game: string; turn: number };

export interface AiCallRecord {
  source: CallSource;
  at: string;
  seat: string;
  decision: AiDecision;
  version: string;
  server: ServerInfo | null;
  /** The request exactly as sent: prompt, schema, thinking budget, sampling. */
  request: ModelRequest | null;
  result: RecordedResult | null;
  /** The decision's follow-up call, when its first answer needed one (a
   *  counter's terms): sent and answered the same way. Absent when there was
   *  none. */
  followUp?: { request: ModelRequest; result: RecordedResult };
  metrics: CallMetrics | null;
  /** What the shared settle step made of the answer. */
  settle: { kind: Settled["kind"]; reason: string | null } | null;
  /** A scenario's reading of the answer (absent outside scenarios): what the
   *  seat chose, and the objective error in it, if any. */
  check?: Judged;
}

/** One call as it went to the model and came back. */
export interface MadeCall {
  request: ModelRequest;
  result: ModelResult;
}

/** A model adapter that remembers every request and result it passed through,
 *  in order, so a decision made by the shared ask step (one call, or a call
 *  and its follow-up) can be recorded in full. One per decision: concurrent
 *  decisions each get their own. */
export function recording(inner: ModelAdapter): {
  adapter: ModelAdapter;
  calls: () => readonly MadeCall[];
} {
  const seen: MadeCall[] = [];
  return {
    adapter: {
      identify: () => inner.identify(),
      async complete(request) {
        const result = await inner.complete(request);
        seen.push({ request, result });
        return result;
      },
    },
    calls: () => seen,
  };
}

/** A decision's calls as the record keeps them: the first, and its follow-up
 *  if there was one. */
export function recordedCalls(calls: readonly MadeCall[]): Pick<AiCallRecord, "request" | "result" | "followUp"> {
  const [first, followUp] = calls as readonly (MadeCall | undefined)[];
  return {
    request: first?.request ?? null,
    result: first ? resultOf(first.result) : null,
    ...(followUp ? { followUp: { request: followUp.request, result: resultOf(followUp.result) } } : {}),
  };
}

/** The record's view of a model result: the answer as parsed and as given, or
 *  why there is none. */
export function resultOf(result: ModelResult): RecordedResult {
  return result.ok
    ? { ok: true, answer: result.answer, raw: result.raw, thoughts: result.thoughts }
    : { ok: false, kind: result.kind, message: result.message };
}

/** Ask a llama.cpp server to describe itself, with the key its calls carry (a
 *  keyed server turns away an unkeyed `/props` like any other request). Null
 *  when it doesn't answer like one (a different OpenAI-compatible server),
 *  never a failure: the record then just says nothing about the server. */
export async function serverInfo(baseUrl: string, apiKey: string | null): Promise<ServerInfo | null> {
  const root = baseUrl.replace(/\/v1\/?$/, "");
  try {
    const res = await fetch(`${root}/props`, apiKey === null ? {} : { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    const props: unknown = await res.json();
    if (!isRecord(props)) return null;
    const settings = isRecord(props.default_generation_settings) ? props.default_generation_settings : {};
    const params = isRecord(settings.params) ? settings.params : {};
    const defaults: Record<string, number> = {};
    for (const key of ["temperature", "top_k", "top_p", "min_p", "repeat_penalty"]) {
      const value = params[key];
      if (typeof value === "number") defaults[key] = Math.round(value * 1000) / 1000;
    }
    return {
      model: typeof props.model_path === "string" ? (props.model_path.split(/[\\/]/).pop() ?? null) : null,
      contextPerSlot: typeof settings.n_ctx === "number" ? settings.n_ctx : null,
      slots: typeof props.total_slots === "number" ? props.total_slots : null,
      defaults,
    };
  } catch {
    return null;
  }
}
