import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serverInfo } from "../eval/record";
import type { ModelRequest } from "../model/adapter";
import { openAiCompatible } from "../model/openai-compatible";
import { claudeArgs, claudeEnv, claudeModel, readClaudeRun, type ClaudeCall, type ClaudeResult, type runClaude } from "./cli";
import { chatReply, chatToCall, claudeServer, props, RequestError, type ClaudeServerConfig } from "./server";

const CONFIG: ClaudeServerConfig = { ...claudeModel("sonnet"), concurrency: 2, timeoutMs: 1000, key: null };
const SCHEMA = { type: "object", properties: { choice: { type: "string" } } };

function call(over: Partial<ClaudeCall> = {}): ClaudeCall {
  return { ...claudeModel("sonnet"), think: false, system: "rules", user: "view", schema: SCHEMA, timeoutMs: 1000, ...over };
}

describe("chatToCall", () => {
  it("maps a schema-constrained quick request to one call", () => {
    const c = chatToCall(
      {
        model: "claude",
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "view" },
        ],
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_schema", json_schema: { name: "buy", schema: SCHEMA } },
        temperature: 0.7,
      },
      CONFIG,
    );
    expect(c).toEqual({ ...claudeModel("sonnet"), think: false, system: "rules", user: "view", schema: SCHEMA, timeoutMs: 1000 });
  });

  it("asks a free-text thinking pass without a schema", () => {
    const c = chatToCall(
      {
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "view" },
        ],
        max_tokens: 2000,
        chat_template_kwargs: { enable_thinking: true },
      },
      CONFIG,
    );
    expect(c.think).toBe(true);
    expect(c.schema).toBeNull();
  });

  it("puts earlier turns on stdin as a transcript", () => {
    const c = chatToCall(
      {
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "view" },
          { role: "assistant", content: "thoughts" },
          { role: "user", content: "answer now" },
        ],
      },
      CONFIG,
    );
    expect(c.user).toBe("<user>\nview\n</user>\n\n<assistant>\nthoughts\n</assistant>\n\n<user>\nanswer now\n</user>");
  });

  it("refuses what it can't serve", () => {
    expect(() => chatToCall({}, CONFIG)).toThrow(RequestError);
    expect(() => chatToCall({ messages: [{ role: "assistant", content: "x" }] }, CONFIG)).toThrow(RequestError);
    expect(() => chatToCall({ messages: [{ role: "user", content: "x" }], response_format: { type: "text" } }, CONFIG)).toThrow(
      RequestError,
    );
  });
});

describe("claudeArgs", () => {
  it("runs clean, at the effort the call's thinking switch picks, with the schema", () => {
    const args = claudeArgs(call({ think: true }), "sys.txt");
    expect(args).toEqual([
      "-p",
      "--system-prompt-file", "sys.txt",
      "--tools", "",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--model", "claude-sonnet-5-5",
      "--effort", "high",
      "--output-format", "json",
      "--json-schema", JSON.stringify(SCHEMA),
    ]);
    expect(claudeArgs(call({ think: false }), "sys.txt")).toContain("low");
  });

  it("leaves the schema out of a free-text call", () => {
    expect(claudeArgs(call({ schema: null }), "sys.txt")).not.toContain("--json-schema");
  });

  it("switches a budget model's thinking through the environment, not --effort", () => {
    const haiku = call({ ...claudeModel("haiku") });
    expect(claudeArgs(haiku, "sys.txt")).not.toContain("--effort");
    expect(claudeEnv({ ...haiku, think: false }, { ...process.env, MAX_THINKING_TOKENS: "9" }).MAX_THINKING_TOKENS).toBe("0");
    expect(claudeEnv({ ...haiku, think: true }, { ...process.env, MAX_THINKING_TOKENS: "9" })).not.toHaveProperty("MAX_THINKING_TOKENS");
  });
});

function cliOutput(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    is_error: false,
    result: "",
    structured_output: { choice: "buy" },
    modelUsage: { "claude-sonnet-5-5": {} },
    usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 20, output_tokens_details: { thinking_tokens: 5 } },
    ...over,
  });
}

describe("readClaudeRun", () => {
  const run = (stdout: string, extra: { code?: number; stderr?: string; timedOut?: boolean } = {}) => ({
    code: extra.code ?? 0,
    stdout,
    stderr: extra.stderr ?? "",
    timedOut: extra.timedOut ?? false,
  });

  it("reads the structured answer and the token counts", () => {
    expect(readClaudeRun(call(), run(cliOutput()))).toEqual({
      ok: true,
      text: "",
      structured: { choice: "buy" },
      usage: { promptTokens: 100, completionTokens: 20, thinkingTokens: 5 },
    });
  });

  it("fails a run another model answered", () => {
    const result = readClaudeRun(call(), run(cliOutput({ modelUsage: { "claude-haiku-4-5-20251001": {} } })));
    expect(result).toMatchObject({ ok: false, kind: "wrong-model" });
  });

  it("carries the CLI's stderr when it printed no JSON", () => {
    expect(readClaudeRun(call(), run("", { code: 1, stderr: "not logged in" }))).toMatchObject({
      ok: false,
      kind: "failed",
      message: "claude exited 1: not logged in",
    });
  });

  it("fails a schema call with no structured answer", () => {
    expect(readClaudeRun(call(), run(cliOutput({ structured_output: undefined })))).toMatchObject({ kind: "no-structured" });
  });
});

describe("chatReply and props", () => {
  it("answers in the OpenAI shape", () => {
    const reply = chatReply(call(), { ok: true, text: "", structured: { choice: "buy" }, usage: { promptTokens: 3, completionTokens: 4, thinkingTokens: 0 } });
    expect(reply).toMatchObject({
      model: "claude-sonnet-5-5",
      choices: [{ message: { role: "assistant", content: '{"choice":"buy"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    });
  });

  it("names the model and its thinking switch", () => {
    expect(props(CONFIG)).toMatchObject({
      model_path: "claude-sonnet-5-5 (effort: think=high, quick=low) via claude -p",
      total_slots: 2,
    });
  });
});

describe("claudeServer", () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function serve(run: typeof runClaude, config: ClaudeServerConfig = CONFIG): Promise<string> {
    const server = claudeServer(config, run);
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    close = () => new Promise((done) => server.close(() => done()));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
  }

  const REQUEST: ModelRequest = {
    system: "rules",
    user: "view",
    schemaName: "buy",
    schema: SCHEMA,
    think: true,
    thinkTokens: 100,
    sampling: { temperature: 0.7 },
  };

  it("thinks beside the structured answer in one call for the ai:claude profile's adapter", async () => {
    const run = vi.fn<typeof runClaude>(() =>
      Promise.resolve<ClaudeResult>({
        ok: true,
        text: "",
        structured: { choice: "buy" },
        usage: { promptTokens: 100, completionTokens: 50, thinkingTokens: 30 },
      }),
    );
    const adapter = openAiCompatible({ baseUrl: await serve(run), model: "claude", apiKey: null, timeoutMs: 5000, thinksWithAnswer: true });
    const result = await adapter.complete(REQUEST);
    expect(result).toMatchObject({
      ok: true,
      answer: { choice: "buy" },
      thoughts: "(30 thinking tokens, not shown by the CLI)",
      metrics: { promptTokens: 100, completionTokens: 50 },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ think: true, schema: SCHEMA, system: "rules", user: "view" });
  });

  it("serves the two-pass adapter's thinking and answer passes too, and names its model", async () => {
    const run = vi.fn<typeof runClaude>((c) =>
      Promise.resolve<ClaudeResult>(
        c.schema === null
          ? { ok: true, text: "Boardwalk is worth it.", structured: null, usage: null }
          : { ok: true, text: "", structured: { choice: "buy" }, usage: null },
      ),
    );
    const baseUrl = await serve(run);
    const adapter = openAiCompatible({ baseUrl, model: "claude", apiKey: null, timeoutMs: 5000 });
    const result = await adapter.complete(REQUEST);
    expect(result).toMatchObject({ ok: true, answer: { choice: "buy" }, thoughts: "Boardwalk is worth it." });
    expect(run.mock.calls.map(([c]) => c.think)).toEqual([true, false]);
    expect(await adapter.identify()).toBe("claude-sonnet-5-5 (effort: think=high, quick=low) via claude -p");
    expect((await serverInfo(baseUrl, null))?.model).toBe("claude-sonnet-5-5 (effort: think=high, quick=low) via claude -p");
  });

  it("fails the call with the CLI's own words, never retrying", async () => {
    const run = vi.fn<typeof runClaude>(() =>
      Promise.resolve<ClaudeResult>({ ok: false, kind: "failed", message: "claude exited 1: rate limited", usage: null }),
    );
    const adapter = openAiCompatible({ baseUrl: await serve(run), model: "claude", apiKey: null, timeoutMs: 5000 });
    const result = await adapter.complete({ ...REQUEST, think: false });
    expect(result).toMatchObject({ ok: false, kind: "unreachable" });
    expect(result.ok ? "" : result.message).toContain("rate limited");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("turns away a caller without the key", async () => {
    const baseUrl = await serve(vi.fn<typeof runClaude>(), { ...CONFIG, key: "secret" });
    expect((await fetch(`${baseUrl}/models`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/models`, { headers: { Authorization: "Bearer secret" } })).status).toBe(200);
  });

  it("describes itself to the call record only with the key", async () => {
    const baseUrl = await serve(vi.fn<typeof runClaude>(), { ...CONFIG, key: "secret" });
    expect(await serverInfo(baseUrl, null)).toBeNull();
    expect(await serverInfo(baseUrl, "secret")).toEqual({
      model: "claude-sonnet-5-5 (effort: think=high, quick=low) via claude -p",
      contextPerSlot: null,
      slots: 2,
      defaults: {},
    });
  });

  it("runs no more calls at once than its concurrency", async () => {
    let running = 0;
    let most = 0;
    const finishers: (() => void)[] = [];
    let started!: () => void;
    let allStarted = new Promise<void>((r) => (started = r));
    const run = vi.fn<typeof runClaude>(() => {
      running++;
      most = Math.max(most, running);
      if (running === 2) started();
      return new Promise<ClaudeResult>((resolve) =>
        finishers.push(() => {
          running--;
          resolve({ ok: true, text: "", structured: { choice: "buy" }, usage: null });
        }),
      );
    });
    const adapter = openAiCompatible({ baseUrl: await serve(run), model: "claude", apiKey: null, timeoutMs: 5000 });
    const calls = Array.from({ length: 3 }, () => adapter.complete({ ...REQUEST, think: false }));
    await allStarted;
    expect(run).toHaveBeenCalledTimes(2);
    allStarted = new Promise<void>((r) => (started = r));
    finishers.shift()?.();
    await allStarted;
    expect(run).toHaveBeenCalledTimes(3);
    for (const finish of finishers.splice(0)) finish();
    await Promise.all(calls);
    expect(most).toBe(2);
  });
});
