/** A JSON Schema object, passed through to the model server as it is. */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** One request to a model: a system message, the user's message, and the
 *  schema its answer must match. `think` lets the model reason freely before it
 *  answers, which costs time. */
export interface ModelRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  think: boolean;
}

/** Why a call produced no answer. `unreachable` and `timeout` are the network's
 *  fault (the server is off, or didn't answer in time); `bad-answer` is the
 *  model's (the server answered with something that isn't the asked-for JSON). */
export type ModelErrorKind = "unreachable" | "timeout" | "bad-answer";

export type ModelResult =
  | { ok: true; answer: unknown; thoughts: string; ms: number }
  | { ok: false; kind: ModelErrorKind; message: string };

/** A model provider. Each provider (an OpenAI-compatible server, Anthropic's
 *  API, …) is one implementation; nothing outside `model/` knows which one a
 *  seat uses. Never retries: a failed call is reported, not repeated. */
export interface ModelAdapter {
  complete: (request: ModelRequest) => Promise<ModelResult>;
}
