import type { CallMetrics, ModelAdapter, ModelRequest, ModelResult } from "./adapter";

export interface OpenAiCompatibleConfig {
  /** The API root, ending in `/v1`. */
  baseUrl: string;
  model: string;
  apiKey: string | null;
  /** How long one call may take before it counts as failed. */
  timeoutMs: number;
  /** Whether the server can think and give a schema-constrained answer in one
   *  call. Then a thinking request is that one call (its reasoning, if the
   *  server shares any, comes back beside the answer) instead of a free pass
   *  followed by the answer. */
  thinksWithAnswer?: boolean;
  fetch?: typeof fetch;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatReply {
  content: string;
  reasoning: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

class CallError extends Error {
  constructor(
    readonly kind: "unreachable" | "timeout" | "bad-answer",
    message: string,
  ) {
    super(message);
  }
}

/** A model behind an OpenAI-compatible chat completions API, such as the
 *  llama.cpp server `local-llm` runs. The answer is constrained to the request's
 *  JSON schema by the server (`response_format: json_schema`). With `think` on,
 *  the model first reasons freely under a token budget, then answers with that
 *  reasoning in context; reasoning and a constrained answer don't mix in one
 *  call, which is what the Betrayal proof of concept found worked. */
export function openAiCompatible(config: OpenAiCompatibleConfig): ModelAdapter {
  const doFetch = config.fetch ?? fetch;
  const headers = {
    "Content-Type": "application/json",
    ...(config.apiKey === null ? {} : { Authorization: `Bearer ${config.apiKey}` }),
  };

  async function chat(body: object, signal: AbortSignal): Promise<ChatReply> {
    let res: Response;
    try {
      res = await doFetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: config.model, ...body }),
        signal,
      });
    } catch (err) {
      if (signal.aborted) {
        throw new CallError("timeout", `no answer within ${String(config.timeoutMs / 1000)}s`);
      }
      throw new CallError("unreachable", `can't reach ${config.baseUrl}: ${describeFetchError(err)}`);
    }
    if (!res.ok) {
      throw new CallError("unreachable", `the model server answered ${String(res.status)}: ${await res.text()}`);
    }
    const json: unknown = await res.json();
    const message = firstMessage(json);
    if (!message) throw new CallError("bad-answer", "the model server's reply had no message");
    return message;
  }

  async function getJson(path: string): Promise<unknown> {
    const res = await doFetch(path, { headers, signal: AbortSignal.timeout(config.timeoutMs) });
    return res.ok ? res.json() : null;
  }

  return {
    async complete(request: ModelRequest): Promise<ModelResult> {
      const started = Date.now();
      const metrics: CallMetrics = {
        ms: 0,
        thinkMs: null,
        answerMs: null,
        promptTokens: null,
        completionTokens: null,
        thinkHitBudget: null,
      };
      const finish = (): CallMetrics => ({ ...metrics, ms: Date.now() - started });
      const count = (reply: ChatReply): void => {
        metrics.promptTokens = add(metrics.promptTokens, reply.promptTokens);
        metrics.completionTokens = add(metrics.completionTokens, reply.completionTokens);
      };
      const sampling = request.sampling ?? {};
      // The deadline on an outside service, not a race: a model server that
      // never answers would otherwise hold the seat's "thinking" marker forever.
      const signal = AbortSignal.timeout(config.timeoutMs);
      const messages: ChatMessage[] = [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ];
      try {
        let thoughts = "";
        const oneCall = request.think && config.thinksWithAnswer === true;
        if (request.think && !oneCall) {
          const thinkStarted = Date.now();
          const free = await chat(
            {
              messages,
              max_tokens: request.thinkTokens,
              chat_template_kwargs: thinkingSwitch(true),
              ...sampling,
            },
            signal,
          );
          metrics.thinkMs = Date.now() - thinkStarted;
          metrics.thinkHitBudget = free.finishReason === "length";
          count(free);
          thoughts = (free.reasoning || free.content).trim();
          messages.push(
            { role: "assistant", content: `My reasoning so far:\n${thoughts}` },
            { role: "user", content: "Now give your final answer." },
          );
        }
        const answerStarted = Date.now();
        const final = await chat(
          {
            messages,
            chat_template_kwargs: thinkingSwitch(oneCall),
            response_format: {
              type: "json_schema",
              json_schema: { name: request.schemaName, schema: request.schema },
            },
            ...sampling,
          },
          signal,
        );
        metrics.answerMs = Date.now() - answerStarted;
        count(final);
        if (oneCall) thoughts = final.reasoning.trim();
        // A model that can't stop reasoning (gpt-oss) still reasons before an
        // answer asked without thinking; kept so the record shows all of it.
        else if (final.reasoning.trim() !== "") {
          thoughts = [thoughts, `(answering) ${final.reasoning.trim()}`].filter((t) => t !== "").join("\n\n");
        }
        let answer: unknown;
        try {
          answer = JSON.parse(final.content);
        } catch {
          return {
            ok: false,
            kind: "bad-answer",
            message: `the answer wasn't JSON: ${final.content.slice(0, 200)}`,
            metrics: finish(),
          };
        }
        return { ok: true, answer, raw: final.content, thoughts, metrics: finish() };
      } catch (err) {
        if (err instanceof CallError) {
          return { ok: false, kind: err.kind, message: err.message, metrics: finish() };
        }
        throw err;
      }
    },

    async identify(): Promise<string | null> {
      // llama.cpp reports its model file at the server root's `/props`; any
      // OpenAI-compatible server lists its models at `/models`. A server that
      // answers neither just leaves the model unnamed: the call itself reports
      // whether the server is reachable.
      const root = config.baseUrl.replace(/\/v1\/?$/, "");
      try {
        const props = await getJson(`${root}/props`);
        if (isRecord(props) && typeof props.model_path === "string") {
          return props.model_path.split(/[\\/]/).pop() ?? props.model_path;
        }
        const models = await getJson(`${config.baseUrl}/models`);
        if (isRecord(models) && Array.isArray(models.data)) {
          const first: unknown = models.data[0];
          if (isRecord(first) && typeof first.id === "string") return first.id;
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}

/** A failed fetch in words, with its cause: undici's own error is only "fetch
 *  failed", and the cause (its code, such as `UND_ERR_CONNECT_TIMEOUT` or
 *  `ENOTFOUND`, and message) is what tells whether the request ever left. */
function describeFetchError(err: unknown): string {
  const cause = err instanceof Error ? err.cause : undefined;
  if (!(cause instanceof Error)) return String(err);
  const code = "code" in cause && typeof cause.code === "string" ? `${cause.code}: ` : "";
  return `${String(err)} (${code}${cause.message})`;
}

function add(total: number | null, more: number | null): number | null {
  if (more === null) return total;
  return (total ?? 0) + more;
}

/** Thinking on or off, in both switches chat templates read: `enable_thinking`
 *  (Qwen, Gemma) and `reasoning_effort` (gpt-oss's harmony format, which
 *  always reasons; "low" is its least, and on it keeps the model's default).
 *  A template ignores the switch it doesn't use. */
function thinkingSwitch(on: boolean): Record<string, unknown> {
  return on ? { enable_thinking: true } : { enable_thinking: false, reasoning_effort: "low" };
}

function firstMessage(json: unknown): ChatReply | null {
  if (!isRecord(json) || !Array.isArray(json.choices)) return null;
  const choice: unknown = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  const { content, reasoning_content: reasoning } = choice.message;
  const usage = isRecord(json.usage) ? json.usage : {};
  return {
    content: typeof content === "string" ? content : "",
    reasoning: typeof reasoning === "string" ? reasoning : "",
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
