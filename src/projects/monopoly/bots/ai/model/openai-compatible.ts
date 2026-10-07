import type { ModelAdapter, ModelRequest, ModelResult } from "./adapter";

export interface OpenAiCompatibleConfig {
  /** The API root, ending in `/v1`. */
  baseUrl: string;
  model: string;
  apiKey: string | null;
  /** How long one call may take before it counts as failed. */
  timeoutMs: number;
  /** How many tokens the model may spend reasoning when `think` is on. */
  thinkTokens: number;
  fetch?: typeof fetch;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatReply {
  content: string;
  reasoning: string;
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

  async function chat(body: object, signal: AbortSignal): Promise<ChatReply> {
    let res: Response;
    try {
      res = await doFetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey === null ? {} : { Authorization: `Bearer ${config.apiKey}` }),
        },
        body: JSON.stringify({ model: config.model, ...body }),
        signal,
      });
    } catch (err) {
      if (signal.aborted) {
        throw new CallError("timeout", `no answer within ${String(config.timeoutMs / 1000)}s`);
      }
      throw new CallError("unreachable", `can't reach ${config.baseUrl}: ${String(err)}`);
    }
    if (!res.ok) {
      throw new CallError("unreachable", `the model server answered ${String(res.status)}: ${await res.text()}`);
    }
    const json: unknown = await res.json();
    const message = firstMessage(json);
    if (!message) throw new CallError("bad-answer", "the model server's reply had no message");
    return message;
  }

  return {
    async complete(request: ModelRequest): Promise<ModelResult> {
      const started = Date.now();
      // The deadline on an outside service, not a race: a model server that
      // never answers would otherwise hold the seat's "thinking" marker forever.
      const signal = AbortSignal.timeout(config.timeoutMs);
      const messages: ChatMessage[] = [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ];
      try {
        let thoughts = "";
        if (request.think) {
          const free = await chat(
            {
              messages,
              max_tokens: config.thinkTokens,
              chat_template_kwargs: { enable_thinking: true },
            },
            signal,
          );
          thoughts = (free.reasoning || free.content).trim();
          messages.push(
            { role: "assistant", content: `My reasoning so far:\n${thoughts}` },
            { role: "user", content: "Now give your final answer." },
          );
        }
        const final = await chat(
          {
            messages,
            chat_template_kwargs: { enable_thinking: false },
            response_format: {
              type: "json_schema",
              json_schema: { name: request.schemaName, schema: request.schema },
            },
          },
          signal,
        );
        let answer: unknown;
        try {
          answer = JSON.parse(final.content);
        } catch {
          return { ok: false, kind: "bad-answer", message: `the answer wasn't JSON: ${final.content.slice(0, 200)}` };
        }
        return { ok: true, answer, thoughts, ms: Date.now() - started };
      } catch (err) {
        if (err instanceof CallError) return { ok: false, kind: err.kind, message: err.message };
        throw err;
      }
    },
  };
}

function firstMessage(json: unknown): ChatReply | null {
  if (!isRecord(json) || !Array.isArray(json.choices)) return null;
  const choice: unknown = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  const { content, reasoning_content: reasoning } = choice.message;
  return {
    content: typeof content === "string" ? content : "",
    reasoning: typeof reasoning === "string" ? reasoning : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
