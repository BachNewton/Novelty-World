import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { JsonSchema } from "../model/adapter";
import { isRecord } from "../spec";
import { describeClaudeModel, runClaude, type ClaudeCall, type ClaudeModel, type ClaudeResult } from "./cli";

// A model server for AI seats that answers through `claude -p` on the owner's
// subscription. It speaks the part of the OpenAI-compatible API that
// `model/openai-compatible.ts` uses (chat completions with a JSON-schema
// `response_format` and the `enable_thinking` switch) and describes itself at
// `/props` the way llama.cpp does, so a profile reaches it with no adapter of
// its own and every record names the Claude model behind it.

export interface ClaudeServerConfig extends ClaudeModel {
  /** How many CLI calls may run at once; the rest wait their turn. */
  concurrency: number;
  timeoutMs: number;
  /** A shared secret callers must send as `Authorization: Bearer <key>`, or
   *  null to take any caller. */
  key: string | null;
}

/** A request the server can't serve, answered with `status`. */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A chat completions body as one CLI call. The system messages become the
 *  system prompt; the rest go on stdin, as they are when there is a single user
 *  message, or as a transcript when earlier turns came first (the adapter's
 *  answer pass after its thinking pass). `enable_thinking` picks the model's
 *  thinking switch, quick when absent. Sampling and `max_tokens` can't be set
 *  through the CLI, so they are not applied. */
export function chatToCall(body: unknown, config: ClaudeServerConfig): ClaudeCall {
  if (!isRecord(body) || !Array.isArray(body.messages)) throw new RequestError(400, "expected a body with messages");
  const messages = body.messages.map(readMessage);
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.at(-1)?.role !== "user") throw new RequestError(400, "the last message must be the user's");
  const kwargs = isRecord(body.chat_template_kwargs) ? body.chat_template_kwargs : {};
  return {
    model: config.model,
    thinking: config.thinking,
    think: kwargs.enable_thinking === true,
    system: system.join("\n\n"),
    user: turns.length === 1 ? turns[0].content : transcript(turns),
    schema: readSchema(body.response_format),
    timeoutMs: config.timeoutMs,
  };
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

function readMessage(message: unknown): Message {
  if (
    !isRecord(message) ||
    (message.role !== "system" && message.role !== "user" && message.role !== "assistant") ||
    typeof message.content !== "string"
  ) {
    throw new RequestError(400, "each message needs a system, user or assistant role and text content");
  }
  return { role: message.role, content: message.content };
}

function transcript(turns: readonly Message[]): string {
  return turns.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join("\n\n");
}

function readSchema(format: unknown): JsonSchema | null {
  if (format === undefined) return null;
  if (isRecord(format) && format.type === "json_schema" && isRecord(format.json_schema) && isRecord(format.json_schema.schema)) {
    return format.json_schema.schema;
  }
  throw new RequestError(400, "response_format must be a json_schema with a schema");
}

/** A successful run as an OpenAI chat completion: the structured answer as
 *  JSON text when there was a schema, the CLI's text answer otherwise. The CLI
 *  keeps Claude's thinking to itself (the answer's notes carry its reasons),
 *  but says how much there was, which stands in for the reasoning. */
export function chatReply(call: ClaudeCall, result: Extract<ClaudeResult, { ok: true }>): object {
  return {
    object: "chat.completion",
    model: call.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.structured === null ? result.text : JSON.stringify(result.structured),
          ...(result.usage && result.usage.thinkingTokens > 0
            ? { reasoning_content: `(${String(result.usage.thinkingTokens)} thinking tokens, not shown by the CLI)` }
            : {}),
        },
        finish_reason: "stop",
      },
    ],
    usage: result.usage && {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
    },
  };
}

/** How the server describes itself, in llama.cpp's `/props` shape, which the
 *  call record and the adapter read. Every answer is checked to come from this
 *  model (`wrong-model` fails the call), so the description is the model that
 *  answered. */
export function props(config: ClaudeServerConfig): object {
  return {
    model_path: `${describeClaudeModel(config)} via claude -p`,
    total_slots: config.concurrency,
    default_generation_settings: { params: {} },
  };
}

/** A failed run as the HTTP status the adapter sees: the CLI's own words go
 *  back in the body, so the seat's failure says what went wrong. */
export function failureStatus(result: Extract<ClaudeResult, { ok: false }>): number {
  return result.kind === "timeout" ? 504 : 502;
}

/** At most `size` jobs at once; the rest start, in order, as running ones end. */
function limiter(size: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running >= size) await new Promise<void>((start) => waiting.push(start));
    else running++;
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}

export function claudeServer(config: ClaudeServerConfig, run: typeof runClaude = runClaude): Server {
  const queue = limiter(config.concurrency);

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (config.key !== null && req.headers.authorization !== `Bearer ${config.key}`) {
      throw new RequestError(401, "missing or wrong key");
    }
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/props") return send(res, 200, props(config));
    if (req.method === "GET" && path === "/v1/models") {
      return send(res, 200, { object: "list", data: [{ id: describeClaudeModel(config), object: "model" }] });
    }
    if (req.method !== "POST" || path !== "/v1/chat/completions") throw new RequestError(404, `no ${req.method} ${path}`);
    const call = chatToCall(await readJson(req), config);
    const label = `${call.think ? "think" : "quick"} ${call.schema ? "json" : "text"}`;
    // Logged on arrival as well as on finishing, so a caller's failure can be
    // told apart: a request that never got here, or one that got here and died.
    log(`${label} arrived`);
    // A caller that gives up (the adapter's own deadline) stops its CLI run, or
    // drops it from the queue before it starts.
    const gone = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) gone.abort();
    });
    const result = await queue(async () => {
      if (gone.signal.aborted) {
        log(`${label} dropped: the caller left before its turn`);
        return null;
      }
      const started = Date.now();
      const outcome = await run(call, gone.signal);
      log(`${label} ${outcome.ok ? "ok" : outcome.kind} ${String(Date.now() - started)}ms`);
      return outcome;
    });
    if (result === null) return;
    if (result.ok) return send(res, 200, chatReply(call, result));
    send(res, failureStatus(result), { error: { type: result.kind, message: result.message } });
  }

  return createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (gone(res)) return;
      if (err instanceof RequestError) {
        send(res, err.status, { error: { type: "request", message: err.message } });
        return;
      }
      log(`failed: ${String(err)}`);
      send(res, 502, { error: { type: "server", message: String(err) } });
    });
  });
}

function gone(res: ServerResponse): boolean {
  return res.headersSent || res.destroyed;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of req) text += (chunk as Buffer).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError(400, "the body isn't JSON");
  }
}

function send(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function log(line: string): void {
  console.log(`${new Date().toISOString()} ${line}`);
}
