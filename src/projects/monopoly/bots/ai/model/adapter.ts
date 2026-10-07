/** A JSON Schema object, passed through to the model server as it is. */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** Sampling settings an AI version pins for its calls. */
export interface Sampling {
  temperature: number;
}

/** One request to a model: a system message, the user's message, and the
 *  schema its answer must match. `think` lets the model reason freely first, on
 *  a budget of `thinkTokens`, which costs time. `sampling` null leaves sampling
 *  to the server's defaults. */
export interface ModelRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  think: boolean;
  thinkTokens: number;
  sampling: Sampling | null;
}

/** What one call cost. The split and the token counts are null where the call
 *  didn't get that far, or the server didn't report them. */
export interface CallMetrics {
  ms: number;
  thinkMs: number | null;
  answerMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Whether the reasoning pass ran out of budget (null when there was none). */
  thinkHitBudget: boolean | null;
}

/** Why a call produced no answer. `unreachable` and `timeout` are the network's
 *  fault (the server is off, or didn't answer in time); `bad-answer` is the
 *  model's (the server answered with something that isn't the asked-for JSON). */
export type ModelErrorKind = "unreachable" | "timeout" | "bad-answer";

export type ModelResult =
  | { ok: true; answer: unknown; thoughts: string; metrics: CallMetrics }
  | { ok: false; kind: ModelErrorKind; message: string; metrics: CallMetrics };

/** A model provider. Each provider (an OpenAI-compatible server, Anthropic's
 *  API, …) is one implementation; nothing outside `model/` knows which one a
 *  seat uses. Never retries: a failed call is reported, not repeated. */
export interface ModelAdapter {
  complete: (request: ModelRequest) => Promise<ModelResult>;
  /** The model as the provider names it (for a llama.cpp server, its model
   *  file), recorded with every decision; null when the provider won't say. */
  identify: () => Promise<string | null>;
}
