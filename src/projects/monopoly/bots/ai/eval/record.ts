import type { AiDecision } from "../../../types";
import type { Settled } from "../decide";
import type { CallMetrics, ModelAdapter, ModelRequest, ModelResult } from "../model/adapter";
import { isRecord } from "../spec";

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
  result:
    | { ok: true; answer: unknown; raw: string; thoughts: string }
    | { ok: false; kind: string; message: string }
    | null;
  metrics: CallMetrics | null;
  /** What the shared settle step made of the answer. */
  settle: { kind: Settled["kind"]; reason: string | null } | null;
  /** A scenario's verdict on the answer; absent outside scenarios. */
  check?: { pass: boolean; reason: string };
}

/** A model adapter that remembers the last request and result it passed
 *  through, so a call made by the shared ask step can be recorded in full. One
 *  per call: concurrent calls each get their own. */
export function recording(inner: ModelAdapter): {
  adapter: ModelAdapter;
  last: () => { request: ModelRequest; result: ModelResult } | null;
} {
  let seen: { request: ModelRequest; result: ModelResult } | null = null;
  return {
    adapter: {
      identify: () => inner.identify(),
      async complete(request) {
        const result = await inner.complete(request);
        seen = { request, result };
        return result;
      },
    },
    last: () => seen,
  };
}

/** The record's view of a model result: the answer as parsed and as given, or
 *  why there is none. */
export function resultOf(result: ModelResult): NonNullable<AiCallRecord["result"]> {
  return result.ok
    ? { ok: true, answer: result.answer, raw: result.raw, thoughts: result.thoughts }
    : { ok: false, kind: result.kind, message: result.message };
}

/** Ask a llama.cpp server to describe itself. Null when it doesn't answer like
 *  one (a different OpenAI-compatible server), never a failure: the record then
 *  just says nothing about the server. */
export async function serverInfo(baseUrl: string): Promise<ServerInfo | null> {
  const root = baseUrl.replace(/\/v1\/?$/, "");
  try {
    const res = await fetch(`${root}/props`);
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
